import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Sql } from "../../../lib/db";
import { geocodeAddress, isInNiigata } from "../../../lib/geocode";
import { insertFacilities, type FacilityRow } from "../lib/facilities";
import { parseCsv, RAW_ROOT } from "../lib/files";
import { reinfolibGet, sleep, tileBbox, tilesInBbox, type Tile } from "../lib/reinfolib";
import { defineJob } from "../lib/runner";
import { addressForSearch, isCoarseHit } from "./d29-large-stores";

// D23 図書館（新潟県全体）。CSV（data/manual/図書館.csv）を正本にして、手で最新にしたものを入れる（2026-11-14 小林さんと決定）
//
// 手順
//   npm run ingest -- d23-review      XKT017（図書館）から県内の図書館を取り、CSV の下書きを書き出す（最初の1回だけ）
//   （小林さんが各館のホームページで確かめて CSV を直す。追加・閉館・名前・住所・確認日）
//   npm run ingest -- d23-libraries   CSV を DB に入れる。CSV を直したら、何度流してもよい（D23 の行を消してから入れ直す）
//
// XKT017 は国土数値情報「文化施設（P27、平成25年度）」を加工したもの。データが古く、休館中の施設も入っている
// P27 の使用許諾条件は「非商用」。中身を手で直して使うことを小林さんが判断した（2026-11-14）
// 項目（API の説明書）：P27_001 行政区域コード、P27_003_name_ja・P27_004_name_ja 分類名、P27_005_ja 名称、
//   P27_006_ja 所在地（市町村名を含まない）、P27_008 階数、P27_009 建築年。ズームは 13〜15
//
// CSV の位置：緯度・経度が書いてあればそれを使う。空欄なら住所から国土地理院の住所検索で出す。
// 市町村・区までしか当たらない住所は、遠くの館を「1km以内」に数えてしまうので入れない（推測で埋めない）

export const LIBRARY_CSV_DIR = join(process.cwd(), "data", "manual");
export const LIBRARY_CSV = "図書館.csv";
const API = "XKT017";
/** 点なので一番粗いズームで足りる（API が受け付けるのは 13〜15） */
const ZOOM = 13;

/** 「状態」の値。未確認はまだ確かめていない行（入れるが、件数を check に出す）。閉館は入れない */
export const STATES = ["未確認", "そのまま", "直した", "追加", "閉館"] as const;
export type LibraryState = (typeof STATES)[number];

export const CSV_COLUMNS = ["元のID", "状態", "名前", "市町村", "住所", "緯度", "経度", "確認日", "確認したURL", "メモ", "元の名前", "元の住所"] as const;
type Column = (typeof CSV_COLUMNS)[number];

export interface LibraryRow {
  line: number;
  sourceId: string | null;
  state: LibraryState;
  name: string;
  city: string;
  address: string;
  lat: number | null;
  lon: number | null;
  /** YYYY-MM-DD */
  checkedOn: string | null;
  url: string | null;
  originalAddress: string | null;
}

/**
 * CSV のバイト列を文字列にする。Excel で「CSV（コンマ区切り）」で保存すると Shift_JIS になるので、
 * BOM が無く UTF-8 として読めなければ Shift_JIS として読む
 */
export function decodeCsv(bytes: Uint8Array): string {
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return new TextDecoder("utf-8").decode(bytes.subarray(3));
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("shift_jis").decode(bytes);
  }
}

/** 確認日を YYYY-MM-DD にする。Excel が 2026/11/14 や 2026/1/5 に直すことがあるので、それも受け付ける。空なら null */
export function normalizeDate(text: string): string | null {
  const t = text.trim();
  if (!t) return null;
  const m = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/.exec(t);
  if (!m) throw new Error(`確認日は 2026-11-14 の形で書いてください（${t}）`);
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  if (date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d) throw new Error(`確認日がありえない日付です（${t}）`);
  return `${m[1]}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function toCoord(text: string, label: string, where: string): number | null {
  const t = text.trim();
  if (!t) return null;
  const n = Number(t);
  if (!Number.isFinite(n)) throw new Error(`${where}：${label}が数ではありません（${t}）`);
  return n;
}

/** CSV を読み、列と値を確かめる。おかしな行があれば、行の番号を付けてまとめてエラーにする */
export function parseLibraryCsv(text: string): LibraryRow[] {
  const [header, ...lines] = parseCsv(text.replace(/^﻿/, ""));
  if (!header) throw new Error(`${LIBRARY_CSV} が空です`);
  const missing = CSV_COLUMNS.filter((c) => !header.includes(c));
  if (missing.length) throw new Error(`${LIBRARY_CSV} に「${missing.join("」「")}」の列がありません`);
  const idx = Object.fromEntries(CSV_COLUMNS.map((c) => [c, header.indexOf(c)])) as Record<Column, number>;

  const rows: LibraryRow[] = [];
  const errors: string[] = [];
  lines.forEach((r, i) => {
    const line = i + 2; // 見出しが1行目
    const get = (c: Column) => (r[idx[c]] ?? "").trim();
    // 全部空の行（Excel が末尾に残すことがある）は飛ばす
    if (r.every((v) => v.trim() === "")) return;
    const where = `${line}行目（${get("名前") || "名前なし"}）`;
    try {
      const state = get("状態");
      if (!(STATES as readonly string[]).includes(state)) throw new Error(`${where}：状態は ${STATES.join("・")} のどれかにしてください（${state || "空欄"}）`);
      if (!get("名前")) throw new Error(`${where}：名前が空です`);
      if (!get("市町村")) throw new Error(`${where}：市町村が空です`);
      const lat = toCoord(get("緯度"), "緯度", where);
      const lon = toCoord(get("経度"), "経度", where);
      if ((lat === null) !== (lon === null)) throw new Error(`${where}：緯度と経度は両方書くか、両方空にしてください`);
      if (lat !== null && lon !== null && !isInNiigata(lon, lat)) throw new Error(`${where}：緯度・経度が新潟県の範囲の外です（緯度と経度が逆かもしれません）`);
      if (lat === null && !get("住所") && state !== "閉館") throw new Error(`${where}：緯度・経度が空のときは住所が要ります`);
      let checkedOn: string | null;
      try {
        checkedOn = normalizeDate(get("確認日"));
      } catch (e) {
        throw new Error(`${where}：${(e as Error).message}`);
      }
      rows.push({
        line,
        sourceId: get("元のID") || null,
        state: state as LibraryState,
        name: get("名前"),
        city: get("市町村"),
        address: get("住所"),
        lat,
        lon,
        checkedOn,
        url: get("確認したURL") || null,
        originalAddress: get("元の住所") || null,
      });
    } catch (e) {
      errors.push((e as Error).message);
    }
  });
  const ids = rows.map((r) => r.sourceId).filter((id): id is string => id !== null);
  const dup = [...new Set(ids.filter((id, i) => ids.indexOf(id) !== i))];
  if (dup.length) errors.push(`元のID が重なっています：${dup.join(", ")}`);
  if (errors.length) throw new Error(`${LIBRARY_CSV} を直してください\n  ${errors.join("\n  ")}`);
  return rows;
}

/** 位置の出し方。緯度・経度が書いてあればそれ、無ければ住所検索 */
export function locationPlan(row: LibraryRow): { kind: "csv"; lon: number; lat: number } | { kind: "geocode"; query: string } {
  if (row.lat !== null && row.lon !== null) return { kind: "csv", lon: row.lon, lat: row.lat };
  // 全角の数字・ハイフン（８９８５－１）は半角にそろえてから探す
  return { kind: "geocode", query: addressForSearch(row.city, row.address.normalize("NFKC")) };
}

/** 住所を直したのに、緯度・経度がそのまま（下書きの位置のまま）かもしれない行 */
export function addressChangedButKeptCoords(row: LibraryRow): boolean {
  return row.lat !== null && row.originalAddress !== null && row.originalAddress !== row.address;
}

/**
 * 住所検索が大字・町名までしか当たらなかったか（例：「新潟県十日町市松代」）。番地や丁目まで当たれば、末尾が数字・丁目・番・号になる
 * 町名の代表点は、山あいの広い大字では館から1km以上離れることがあるので、CSV に緯度・経度を書いて直す（2026-11-14 に18館見つかった）
 */
export function isTownLevelHit(title: string): boolean {
  return !/(\d|[０-９]|丁目|番地?|号)$/.test(title.trim());
}

/**
 * データの時点（datasets.as_of）。確認日のうち一番新しいものの年月。
 * 確認日が1つも無ければ XKT017 の年度（2013）、未確認の館が残っていれば「（一部2013）」を付ける
 */
export function asOfOf(rows: LibraryRow[]): string {
  const open = rows.filter((r) => r.state !== "閉館");
  const dates = open.map((r) => r.checkedOn).filter((d): d is string => d !== null).sort();
  if (!dates.length) return "2013";
  const month = dates[dates.length - 1].slice(0, 7);
  return open.some((r) => r.state === "未確認") ? `${month}（一部2013）` : month;
}

// ---- 下書き（XKT017 → CSV） ----

interface XktFeature {
  geometry: { type: string; coordinates?: unknown };
  properties: Record<string, unknown>;
}

export interface DraftRow {
  sourceId: string;
  name: string;
  city: string;
  address: string;
  lon: number;
  lat: number;
}

const text = (v: unknown) => (v === undefined || v === null ? "" : String(v).trim());

/** XKT017 の地物のキー。ID の項目が無いので、行政区域コード・名称・位置で決める（タイルの境目で同じ館が2回返る） */
export function featureKey(f: XktFeature): string | null {
  if (f.geometry.type !== "Point" || !Array.isArray(f.geometry.coordinates)) return null;
  const [lon, lat] = f.geometry.coordinates as number[];
  return `${text(f.properties.P27_001)}|${text(f.properties.P27_005_ja)}|${lon.toFixed(6)},${lat.toFixed(6)}`;
}

/** 町（towns）の市区町村コードと区の名前から市町村名を出す（新潟市は「新潟市西区」、ほかは市町村名） */
export function cityNameOf(cityCode: string, ward: string): string {
  return cityCode.startsWith("151") ? `新潟市${ward}` : ward;
}

/** 下書きの CSV の中身（Excel で開けるよう UTF-8 BOM つき、改行は CRLF） */
export function draftCsv(rows: DraftRow[]): string {
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const lines = [
    CSV_COLUMNS.join(","),
    ...rows.map((r) => {
      const values: Record<Column, unknown> = {
        元のID: r.sourceId,
        状態: "未確認",
        名前: r.name,
        市町村: r.city,
        住所: r.address,
        緯度: r.lat,
        経度: r.lon,
        確認日: "",
        確認したURL: "",
        メモ: "",
        元の名前: r.name,
        元の住所: r.address,
      };
      return CSV_COLUMNS.map((c) => esc(values[c])).join(",");
    }),
  ];
  return "﻿" + lines.join("\r\n") + "\r\n";
}

/**
 * npm run ingest -- d23-review：XKT017 から県内の図書館を取り、CSV の下書きを書き出す
 * 取ったタイルは data/raw/XKT017/z13/ に保存し、2回目からはそれを使う（refresh を付けると取り直す）
 * すでに CSV があるときは、直した中身を消さないよう、別の名前（図書館_新.csv）で書き出す
 */
export async function writeLibraryDraft(sql: Sql, refresh: boolean): Promise<string> {
  const [b] = await sql<{ w: number; s: number; e: number; n: number }[]>`
    select extensions.st_xmin(e) as w, extensions.st_ymin(e) as s, extensions.st_xmax(e) as e, extensions.st_ymax(e) as n
    from (select extensions.st_extent(geom) as e from towns where city_code like '15%') t
  `;
  if (b?.w == null) throw new Error("町の境界（towns）がありません。先に npm run ingest -- d39-towns を動かしてください");
  const all = tilesInBbox([b.w, b.s, b.e, b.n], ZOOM);
  const envelopes = all.map((t, i) => {
    const [w, s, e, n] = tileBbox(t);
    return { i, w, s, e, n };
  });
  const hit = await sql<{ i: number }[]>`
    select x.i from jsonb_to_recordset(${sql.json(envelopes)}) as x(i int, w float8, s float8, e float8, n float8)
    where exists (
      select 1 from towns
      where city_code like '15%' and extensions.st_intersects(geom, extensions.st_makeenvelope(x.w, x.s, x.e, x.n, 4326))
    )
  `;
  const tiles: Tile[] = hit.map((h) => all[h.i]);
  console.log(`ズーム${ZOOM}のタイル ${tiles.length}枚を取ります`);

  const tileDir = join(RAW_ROOT, API, `z${ZOOM}`);
  mkdirSync(tileDir, { recursive: true });
  const features = new Map<string, XktFeature>();
  const categories = new Map<string, number>();
  for (const t of tiles) {
    const path = join(tileDir, `${t.x}_${t.y}.json`);
    let list: XktFeature[];
    if (existsSync(path) && !refresh) {
      list = (JSON.parse(readFileSync(path, "utf-8")) as { features?: XktFeature[] }).features ?? [];
    } else {
      const body = await reinfolibGet<{ features?: XktFeature[] }>(sql, API, { response_format: "geojson", z: t.z, x: t.x, y: t.y });
      list = body?.features ?? [];
      writeFileSync(path, JSON.stringify({ features: list }));
      await sleep(100);
    }
    for (const f of list) {
      const key = featureKey(f);
      if (!key || features.has(key)) continue;
      features.set(key, f);
      const cat = text(f.properties.P27_004_name_ja) || text(f.properties.P27_003_name_ja) || "分類なし";
      categories.set(cat, (categories.get(cat) ?? 0) + 1);
    }
  }

  // 点が入る町（県内）から市町村名を出す。県の外の点（タイルの端にかかった隣の県の館）は除く
  const points = [...features.entries()].map(([key, f], i) => {
    const [lon, lat] = f.geometry.coordinates as number[];
    return { i, key, lon, lat };
  });
  const located = await sql<{ i: number; city_code: string; ward: string }[]>`
    select x.i, t.city_code, t.ward
    from jsonb_to_recordset(${sql.json(points.map(({ i, lon, lat }) => ({ i, lon, lat })))}) as x(i int, lon float8, lat float8)
    join lateral (
      select city_code, ward from towns
      where city_code like '15%' and extensions.st_intersects(geom, extensions.st_setsrid(extensions.st_point(x.lon, x.lat), 4326))
      limit 1
    ) t on true
  `;
  const cityOf = new Map(located.map((r) => [r.i, cityNameOf(r.city_code, r.ward)]));
  const rows: DraftRow[] = points
    .filter((p) => cityOf.has(p.i))
    .map((p) => {
      const f = features.get(p.key)!;
      const city = cityOf.get(p.i)!;
      const address = text(f.properties.P27_006_ja);
      return {
        sourceId: `XKT017:${text(f.properties.P27_001)}:${p.i + 1}`,
        name: text(f.properties.P27_005_ja),
        city,
        address: address && !address.startsWith("新潟県") && !address.startsWith(city) ? `${city}${address}` : address,
        lon: p.lon,
        lat: p.lat,
      };
    })
    .sort((a, b) => a.city.localeCompare(b.city, "ja") || a.name.localeCompare(b.name, "ja"));
  // 並べ替えたあとで ID を振り直す（市町村コード:通し番号。取り直しても同じ並びなら同じ ID）
  const seq = new Map<string, number>();
  for (const r of rows) {
    const code = r.sourceId.split(":")[1];
    const n = (seq.get(code) ?? 0) + 1;
    seq.set(code, n);
    r.sourceId = `XKT017:${code}:${n}`;
  }

  mkdirSync(LIBRARY_CSV_DIR, { recursive: true });
  const name = existsSync(join(LIBRARY_CSV_DIR, LIBRARY_CSV)) ? LIBRARY_CSV.replace(/\.csv$/, "_新.csv") : LIBRARY_CSV;
  writeFileSync(join(LIBRARY_CSV_DIR, name), draftCsv(rows));
  const cats = [...categories].map(([k, v]) => `${k} ${v}`).join("、");
  return `data/manual/${name} に ${rows.length}館を書き出しました（県の外で除いた点 ${points.length - rows.length}、分類：${cats}）`;
}

// ---- 取り込み（CSV → DB） ----

interface Located extends LibraryRow {
  plon: number | null;
  plat: number | null;
  how: string | null;
  hitTitle: string | null;
}

export const d23Libraries = defineJob<Located[]>({
  datasets: ["D23"],
  rawDir: API,
  table: "facilities",
  options: [],

  async prepare({ log, check, setAsOf }) {
    const path = join(LIBRARY_CSV_DIR, LIBRARY_CSV);
    if (!existsSync(path)) throw new Error(`data/manual/${LIBRARY_CSV} がありません。先に npm run ingest -- d23-review で下書きを作ってください`);
    const rows = parseLibraryCsv(decodeCsv(readFileSync(path)));
    const open = rows.filter((r) => r.state !== "閉館");

    const located: Located[] = [];
    const coarse: string[] = [];
    const notFound: string[] = [];
    for (const r of open) {
      const plan = locationPlan(r);
      if (plan.kind === "csv") {
        located.push({ ...r, plon: plan.lon, plat: plan.lat, how: "CSV の緯度・経度", hitTitle: null });
        continue;
      }
      const hit = await geocodeAddress(plan.query);
      await sleep(200);
      if (hit && isCoarseHit(hit.title)) {
        coarse.push(`${r.line}行目 ${r.name}（${plan.query} → ${hit.title}）`);
        located.push({ ...r, plon: null, plat: null, how: null, hitTitle: hit.title });
      } else if (hit) {
        located.push({ ...r, plon: hit.lon, plat: hit.lat, how: "住所から推定（国土地理院 住所検索）", hitTitle: hit.title });
      } else {
        notFound.push(`${r.line}行目 ${r.name}（${plan.query}）`);
        located.push({ ...r, plon: null, plat: null, how: null, hitTitle: null });
      }
    }

    const byState = Object.fromEntries(STATES.map((s) => [s, rows.filter((r) => r.state === s).length]));
    check("状態ごとの館の数", byState);
    check("住所を直したのに緯度・経度がそのままの館（位置を直すなら緯度・経度を空にする）", open.filter(addressChangedButKeptCoords).map((r) => `${r.line}行目 ${r.name}`));
    check("市町村・区までしか当たらず、入れなかった館（住所に番地を足すか、緯度・経度を書く）", coarse);
    check("住所が当たらず、入れなかった館", notFound);
    const townLevel = located.filter((r) => r.how?.startsWith("住所") && r.hitTitle && isTownLevelHit(r.hitTitle));
    check("大字・町名までしか当たらなかった館（入れたが位置が粗い。CSV に緯度・経度を書くと直る）", townLevel.map((r) => `${r.line}行目 ${r.name}（${r.hitTitle}）`));
    if (townLevel.length) log(`大字・町名までしか当たらなかった ${townLevel.length}館は、位置が粗いまま入れます（check を見てください）`);
    check("確認日が空の館（閉館を除く）", open.filter((r) => !r.checkedOn).length);
    setAsOf("D23", asOfOf(rows));
    log(`CSV の ${rows.length}行を読みました（${STATES.map((s) => `${s} ${byState[s]}`).join("、")}）。閉館を除く ${open.length}館を入れます`);
    if (coarse.length + notFound.length) log(`位置を出せなかった ${coarse.length + notFound.length}館は入れません（check を見てください）`);
    return located;
  },

  async load({ sql, prepared, log, check }) {
    const rows: FacilityRow[] = prepared
      .filter((r) => r.plon !== null && r.plat !== null)
      .map((r) => ({
        dataset_id: "D23",
        kind: "図書館",
        name: r.name,
        address: r.address || null,
        source_ref: r.sourceId,
        attrs: {
          状態: r.state,
          確認日: r.checkedOn,
          確認したURL: r.url,
          元データ: r.sourceId?.startsWith("XKT017:") ? "国土数値情報 文化施設（XKT017、2013年度）" : "ホームページで確認",
          位置: r.how,
          ...(r.hitTitle ? { 当たった住所: r.hitTitle } : {}),
        },
        lon: r.plon!,
        lat: r.plat!,
      }));
    await insertFacilities(sql, rows);
    log(`図書館 ${rows.length}館を入れました`);
    check("入れた館の数", rows.length);
  },
});
