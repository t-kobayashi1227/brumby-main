import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Geometry } from "geojson";
import { reinfolibGet, sleep, tileBbox, tilesInBbox, type Tile } from "../lib/reinfolib";
import { defineJob, insertRows, type IngestJob } from "../lib/runner";

// 不動産情報ライブラリのタイル API（XKT 系）から区域の形を取り、zones に入れる
//   npm run ingest -- d04-zoning        用途地域（XKT002、ズーム15）
//   npm run ingest -- d35-liquefaction  液状化の発生傾向（XKT025、ズーム13）
// 範囲は新潟市（町の境界 towns の市区町村コード 151xx）。area=pref を付けると新潟県（15xxx）。先に d39-towns を入れておく
// 取ったタイルは data/raw/<API>/z<ズーム>/<x>_<y>.json に保存し、2回目からは保存したものを使う（refresh を付けると取り直す）
// 県全体は1万枚を超えて数時間かかるため、途中で止まっても、やり直せば続きから取る（2026-11-11）
//
// タイルの中の図形はタイルの端で切られ、ズームが小さいと粗くなる（2026-10-25 に新潟駅の近くで確かめた）
// そのため、細かいズームで市にかかるタイルをすべて取り、同じ地物の切れ端を PostGIS で1つにつなぎ直す

interface Feature {
  geometry: Geometry;
  properties: Record<string, unknown>;
}

interface Piece {
  key: string;
  label: string;
  attrs: Record<string, unknown>;
  raw: Record<string, unknown>;
  geojson: string;
}

interface XktZoneSpec {
  dataset: string;
  api: string;
  kind: string;
  zoom: number;
  /** 同じ地物の切れ端をまとめるためのキー */
  keyOf: (p: Record<string, unknown>) => string;
  /** 事実の値にそのまま使う文言 */
  labelOf: (p: Record<string, unknown>) => string;
  attrsOf: (p: Record<string, unknown>) => Record<string, unknown>;
}

const CITY_PREFIX = "151"; // 新潟市（区の市区町村コード 15101〜15108）
const PREF_PREFIX = "15"; // 新潟県（area=pref のとき）

/** _index（例：bs001_use_area_202607231142）の日付から、データの時点（2026-07）を出す */
function asOfFromIndex(index: unknown): string | null {
  const m = typeof index === "string" ? /_(\d{4})(\d{2})\d{6}$/.exec(index) : null;
  return m ? `${m[1]}-${m[2]}` : null;
}

function xktZoneJob(spec: XktZoneSpec): IngestJob<unknown> {
  return defineJob<Piece[]>({
    datasets: [spec.dataset],
    rawDir: spec.api,
    table: "zones",
    options: ["area"],

    async prepare({ sql, args, raw, log, setAsOf, check }) {
      if (args.area !== undefined && args.area !== "city" && args.area !== "pref") throw new Error("area は city（新潟市、既定）か pref（県全体）です");
      const prefix = args.area === "pref" ? PREF_PREFIX : CITY_PREFIX;
      const refresh = args.refresh !== undefined;
      // 範囲のタイルのうち、範囲の町に重なるものだけを取る（海や範囲の外だけのタイルは取らない）
      const [b] = await sql<{ w: number; s: number; e: number; n: number }[]>`
        select extensions.st_xmin(e) as w, extensions.st_ymin(e) as s, extensions.st_xmax(e) as e, extensions.st_ymax(e) as n
        from (select extensions.st_extent(geom) as e from towns where city_code like ${prefix + "%"}) t
      `;
      if (b?.w == null) throw new Error("町の境界（towns）がありません。先に npm run ingest -- d39-towns を動かしてください");
      const all = tilesInBbox([b.w, b.s, b.e, b.n], spec.zoom);
      const envelopes = all.map((t, i) => {
        const [w, s, e, n] = tileBbox(t);
        return { i, w, s, e, n };
      });
      const hit = await sql<{ i: number }[]>`
        select x.i from jsonb_to_recordset(${sql.json(envelopes)}) as x(i int, w float8, s float8, e float8, n float8)
        where exists (
          select 1 from towns
          where city_code like ${prefix + "%"}
            and extensions.st_intersects(geom, extensions.st_makeenvelope(x.w, x.s, x.e, x.n, 4326))
        )
      `;
      const tiles: Tile[] = hit.map((h) => all[h.i]);
      log(`ズーム${spec.zoom}のタイル ${tiles.length}枚を取ります（範囲の四角の中は ${all.length}枚）`);

      const pieces: Piece[] = [];
      let empty = 0;
      let cached = 0;
      const tileDir = join(raw.dir, `z${spec.zoom}`);
      mkdirSync(tileDir, { recursive: true });
      for (const [n, t] of tiles.entries()) {
        // 保存済みのタイルはそれを使う。無ければ API から取って保存する（API が 404 を返したタイルも、空として保存する）
        const path = join(tileDir, `${t.x}_${t.y}.json`);
        let features: Feature[];
        if (existsSync(path) && !refresh) {
          features = (JSON.parse(readFileSync(path, "utf-8")) as { features?: Feature[] }).features ?? [];
          cached++;
        } else {
          const body = await reinfolibGet<{ features?: Feature[] }>(sql, spec.api, { response_format: "geojson", z: t.z, x: t.x, y: t.y });
          features = body?.features ?? [];
          writeFileSync(path, JSON.stringify({ features }));
          await sleep(100);
        }
        if (features.length === 0) empty++;
        for (const f of features) {
          if (f.geometry.type !== "Polygon" && f.geometry.type !== "MultiPolygon") continue;
          const asOf = asOfFromIndex(f.properties._index);
          if (asOf) setAsOf(spec.dataset, asOf);
          pieces.push({
            key: spec.keyOf(f.properties),
            label: spec.labelOf(f.properties),
            attrs: spec.attrsOf(f.properties),
            raw: f.properties,
            geojson: JSON.stringify(f.geometry),
          });
        }
        if ((n + 1) % 100 === 0) log(`${n + 1} / ${tiles.length}枚（切れ端 ${pieces.length}個、保存済みを使った ${cached}枚）`);
      }
      check("取ったタイルの数", tiles.length);
      check("保存済みを使ったタイルの数", cached);
      check("地物の無いタイルの数", empty);
      check("切れ端の数", pieces.length);
      log(`タイル ${tiles.length}枚から、切れ端 ${pieces.length}個を取りました`);
      return pieces;
    },

    async load({ sql, prepared, log, check }) {
      await sql`
        create temp table zone_pieces (key text, label text, attrs jsonb, raw jsonb, geojson text) on commit drop
      `;
      await insertRows(sql, "zone_pieces", prepared.map((p) => ({ ...p, attrs: sql.json(p.attrs as never), raw: sql.json(p.raw as never) })), 500);
      // 同じキーの切れ端を1つにつなぐ。切れ端ごとに MakeValid してから Union し、面だけを取り出す
      const [{ n }] = await sql<{ n: number }[]>`
        with merged as (
          insert into zones (dataset_id, kind, label, attrs, geom, raw)
          select ${spec.dataset}, ${spec.kind}, min(label), (array_agg(attrs))[1],
            extensions.st_multi(extensions.st_collectionextract(extensions.st_makevalid(extensions.st_union(
              extensions.st_makevalid(extensions.st_setsrid(extensions.st_geomfromgeojson(geojson), 4326))
            )), 3)),
            (array_agg(raw))[1]
          from zone_pieces
          group by key
          returning 1
        )
        select count(*)::int as n from merged
      `;
      log(`切れ端 ${prepared.length}個を、区域 ${n}個にまとめました`);

      // 同じ形・同じ文言の区域が、別の地物として2回入っていることがある
      // （XKT002 では、新潟市の用途地域と同じ形のものが「長野県 箕輪町」としても返る。2026-10-25 に確認）
      // 1つだけ残す。新潟県のもの、次に id の小さいものを残す
      const removed = await sql`
        delete from zones a
        using zones b
        where a.dataset_id = ${spec.dataset} and b.dataset_id = ${spec.dataset}
          and a.id <> b.id and a.label = b.label
          and a.geom operator(extensions.&&) b.geom and extensions.st_equals(a.geom, b.geom)
          and (
            (case when coalesce(a.raw->>'prefecture', '新潟県') = '新潟県' then 0 else 1 end, a.id)
            > (case when coalesce(b.raw->>'prefecture', '新潟県') = '新潟県' then 0 else 1 end, b.id)
          )
      `;
      if (removed.count > 0) log(`同じ形・同じ文言の重複 ${removed.count}個を消しました`);
      check("区域の数", n - removed.count);
      check("消した重複の数", removed.count);
    },
  });
}

const text = (v: unknown) => (v === undefined || v === null ? "" : String(v));

export const d04Zoning = xktZoneJob({
  dataset: "D04",
  api: "XKT002",
  kind: "用途地域",
  zoom: 15,
  keyOf: (p) => text(p._id),
  labelOf: (p) => text(p.use_area_ja),
  attrsOf: (p) => ({ youto_id: p.youto_id, city_code: p.city_code, decision_date: p.decision_date || null }),
});

export const d35Liquefaction = xktZoneJob({
  dataset: "D35",
  api: "XKT025",
  kind: "液状化の傾向",
  zoom: 13,
  keyOf: (p) => text(p.mesh_code),
  // 例：液状化しやすい（三角州・海岸低地）
  labelOf: (p) => `${text(p.note)}（${text(p.topographic_classification_name_ja)}）`,
  attrsOf: (p) => ({
    level: p.liquefaction_tendency_level,
    topographic_code: p.topographic_classification_code,
    mesh_code: p.mesh_code,
  }),
});
