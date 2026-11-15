import { unzipSync } from "fflate";
import type { Geometry, Position } from "geojson";
import { insertFacilities, type FacilityRow } from "../lib/facilities";
import { readShapefile } from "../lib/files";
import { defineJob } from "../lib/runner";

// D43 公園（OpenStreetMap、新潟市以外）。D22 公園・緑地（新潟市オープンデータ）は新潟市の分だけなので、ほかの市町村を OSM で補う（2026-11-15 小林さんと決定）
//   npm run ingest -- osm-parks
// data/raw/osm/ の chubu-<日付>-free.shp.zip（D28 と同じファイル）を読む
// 公園は「点」（gis_osm_pois_free_1）・「形」（gis_osm_pois_a_free_1）・「土地利用の形」（gis_osm_landuse_a_free_1）の3通りで入っている。fclass が park のものを使う
// 同じ公園が形と土地利用の両方に入る（同じ osm_id）ので1つにし、形の中にある点も同じ公園として除く
// 新潟市の中の公園は入れない（D22 を使う）。新潟県の町から約300m以上離れた公園も消す
// OSM は公園の漏れが多い（新潟市で比べると、市のオープンデータの公園の約3分の1にしか点が無い。2026-11-14）。件数は少なめに出る
// 出典表示は「© OpenStreetMap contributors」（ODbL）

const PREF_BBOX = [137.6, 36.7, 139.95, 38.6]; // 新潟県（佐渡を含む）のおおよその範囲
const LAYERS = ["gis_osm_pois_free_1", "gis_osm_pois_a_free_1", "gis_osm_landuse_a_free_1"] as const;

/** 図形の外周（形の1つ目の輪）。点は null */
export function outerRing(geometry: Geometry): Position[] | null {
  if (geometry.type === "Polygon") return geometry.coordinates[0] ?? null;
  if (geometry.type === "MultiPolygon") return geometry.coordinates[0]?.[0] ?? null;
  return null;
}

/** 点が輪の中にあるか（レイキャスティング。公園の大きさなら平面で十分） */
export function insideRing(lon: number, lat: number, ring: Position[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** 形の位置。外周の頂点の平均（最後の点は最初の点と同じなので除く） */
export function ringCenter(ring: Position[]): { lon: number; lat: number } {
  const pts = ring.length > 1 && ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1] ? ring.slice(0, -1) : ring;
  return { lon: pts.reduce((s, p) => s + p[0], 0) / pts.length, lat: pts.reduce((s, p) => s + p[1], 0) / pts.length };
}

interface Park {
  osmId: string;
  name: string;
  layer: string;
  ring: Position[] | null;
  lon: number;
  lat: number;
}

/** 同じ osm_id の公園を1つにし（形を先に残す）、形の中にある点の公園を除く */
export function dedupeParks(parks: Park[]): { kept: Park[]; sameId: number; insideShape: number } {
  const byId = new Map<string, Park>();
  let sameId = 0;
  for (const p of parks) {
    const cur = byId.get(p.osmId);
    if (!cur) byId.set(p.osmId, p);
    else {
      sameId++;
      if (!cur.ring && p.ring) byId.set(p.osmId, p);
    }
  }
  const shapes = [...byId.values()].filter((p) => p.ring);
  const bbox = shapes.map((s) => {
    const xs = s.ring!.map((q) => q[0]);
    const ys = s.ring!.map((q) => q[1]);
    return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
  });
  let insideShape = 0;
  const kept = [...byId.values()].filter((p) => {
    if (p.ring) return true;
    const hit = shapes.some((s, i) => {
      const [w, so, e, n] = bbox[i];
      return p.lon >= w && p.lon <= e && p.lat >= so && p.lat <= n && insideRing(p.lon, p.lat, s.ring!);
    });
    if (hit) insideShape++;
    return !hit;
  });
  return { kept, sameId, insideShape };
}

export const osmParks = defineJob({
  datasets: ["D43"],
  rawDir: "osm",
  table: "facilities",
  options: [],

  async load({ sql, raw, log, setAsOf, check }) {
    const zip = raw.find(/\.shp\.zip$/i, "Geofabrik の chubu-<日付>-free.shp.zip");
    const date = /-(\d{2})(\d{2})(\d{2})-free/.exec(zip.name);
    if (date) setAsOf("D43", `20${date[1]}-${date[2]}-${date[3]}`);

    const files = unzipSync(zip.body, { filter: (f) => LAYERS.some((l) => f.name === `${l}.shp` || f.name === `${l}.dbf`) });
    const parks: Park[] = [];
    for (const layer of LAYERS) {
      for await (const f of readShapefile(files[`${layer}.shp`], files[`${layer}.dbf`], "utf-8")) {
        const p = f.properties;
        if (p.fclass !== "park" || !f.geometry) continue;
        const ring = outerRing(f.geometry);
        const pos = ring ? ringCenter(ring) : f.geometry.type === "Point" ? { lon: f.geometry.coordinates[0], lat: f.geometry.coordinates[1] } : null;
        if (!pos) continue;
        const [w, s, e, n] = PREF_BBOX;
        if (pos.lon < w || pos.lon > e || pos.lat < s || pos.lat > n) continue;
        parks.push({ osmId: String(p.osm_id), name: String(p.name ?? "").trim(), layer, ring, ...pos });
      }
    }
    const { kept, sameId, insideShape } = dedupeParks(parks);
    const rows: FacilityRow[] = kept.map((p) => ({
      dataset_id: "D43",
      kind: "公園",
      name: p.name || "（名前の無い公園）",
      address: null,
      attrs: { osm_id: p.osmId, 形: p.ring ? "形" : "点" },
      source_ref: `${p.layer.includes("landuse") ? "l" : p.ring ? "a" : "p"}${p.osmId}`,
      lon: p.lon,
      lat: p.lat,
    }));
    await insertFacilities(sql, rows);

    // 新潟市の中の公園（D22 を使う）と、新潟県の町から約300m以上離れた公園を消す（0.003度。geometry のまま比べて空間インデックスを使う）
    const inCity = await sql`
      delete from facilities f
      where f.dataset_id = 'D43'
        and exists (select 1 from towns t where t.city_code like '151%' and extensions.st_intersects(t.geom, f.geog::extensions.geometry))
    `;
    const outside = await sql`
      delete from facilities f
      where f.dataset_id = 'D43'
        and not exists (select 1 from towns t where t.city_code like '15%' and extensions.st_dwithin(t.geom, f.geog::extensions.geometry, 0.003))
    `;
    const unnamed = rows.filter((r) => r.name === "（名前の無い公園）").length;
    log(
      `${zip.name}：新潟県の範囲の四角から公園 ${parks.length}件を読み、同じ公園 ${sameId + insideShape}件をまとめ、` +
        `新潟市の中の ${inCity.count}件・新潟県の外の ${outside.count}件を除きました`,
    );
    check("同じ osm_id で1つにした公園", sameId);
    check("形の中にある点で除いた公園", insideShape);
    check("新潟市の中で除いた公園（D22 を使う）", inCity.count);
    check("名前の無い公園（除く前の数）", unnamed);
  },
});
