import { insertFacilities, type FacilityRow } from "../lib/facilities";
import { decode, parseCsv } from "../lib/files";
import { defineJob } from "../lib/runner";

// D40 スーパー・ドラッグストア・コンビニ（Overture Maps Places）。OSM（D28）と大規模小売店舗一覧（D29）に無い店を補う
//   npm run ingest -- overture date=2026-11-11
// data/raw/overture/ に、work/overture_extract.py で作った CSV（overture_shops_niigata.csv、UTF-8）を置く
//   列：id, name, basic_category, detail, confidence, lon, lat, source
// date はダウンロードした日（データの時点にする）
//
// OSM は新潟市以外の店が大きく抜けている（例：上越市のコンビニ OSM 38店、Overture 152店。2026-11-11）
// 「OSM を主、一覧で補う」（docs/参考/OSM突き合わせ_2026-10-24.md）と同じ考え方で、次の順に決める
// 1. 種類：コンビニ convenience_store、スーパー grocery_store・organic_grocery_store、
//    ドラッグストア drugstore と、pharmacy のうちドラッグストアのチェーン名の店（ほかの薬局は医療情報ネット D30 を使う）
//    Overture の種類は広く、grocery_store に酒蔵・豆腐店・魚市場・観光案内所なども入っている（長岡市の20店のうち約半分。2026-11-12）
//    確からしさ（confidence）では見分けられないため、名前がチェーン名か「スーパー」「マーケット」などの店だけを使う（下の *_NAMES）
// 2. Overture の中の重複（Meta と Microsoft の両方から同じ店が入っている）を除く：同じ種類で、名の知れたチェーンの同じ店が150m以内、
//    それ以外の同じ名前の店が50m以内、または名前を問わず15m以内なら、確からしさの高い方を残す
// 3. OSM・大規模小売店舗一覧にもうある店は足さない：同じ種類で、名の知れたチェーンの同じ店が300m以内、
//    それ以外の同じ名前の店が100m以内、または名前を問わず30m以内（Overture の位置は数百mずれることがあるため。2026-11-12）
// 4. 新潟県の町から約300m以上離れた店は消す（新潟県を囲む四角で取り出しているため）。先に osm・d29-large-stores を入れておく
// 出典の表示は「© Overture Maps Foundation」（CDLA Permissive 2.0。Foursquare 由来の分は Apache 2.0）

export type ShopKind = "コンビニ" | "スーパー" | "ドラッグストア";

const DRUGSTORE_CHAINS =
  /ウエルシア|ツルハ|クスリのアオキ|コスモス|サンドラッグ|マツモトキヨシ|マツキヨ|ゲンキー|カワチ|スギ薬局|ココカラファイン|ドラッグ|トモズ|セイムス|ファミリードラッグ|v.?drug|ウォンツ|くすりの|クスリの/i;

/** コンビニとして使う名前（チェーン名）。名前の無い店・個人の商店は使わない。セーブオンはローソンに替わった古い名前なので使わない */
const CONVENIENCE_NAMES = /セブン.?イレブン|7.?eleven|seven.?eleven|ローソン|lawson|ファミリーマート|ファミマ|familymart|デイリーヤマザキ|ヤマザキショップ|ヤマザキデイリー|daily.?yamazaki|ミニストップ|ministop|セイコーマート|seicomart|ポプラ|newdays|ニューデイズ/i;

/** スーパーとして使う名前（新潟県のチェーンと、スーパーと分かる言葉） */
const SUPERMARKET_NAMES =
  /原信|ナルス|ウオロク|清水フードセンター|フードセンター|キューピット|良食生活館|イチコ|業務スーパー|イオン|aeon|マックスバリュ|イトーヨーカドー|ベイシア|トライアル|ロピア|コープ|生協|スーパー|マーケット|生鮮|食品館|フードマート/i;

/** スーパーの名前に当たっても使わない店（酒蔵・豆腐店・市場、配送センター（「原信 ナルス中之島Dc」）など） */
const NOT_SUPERMARKET = /酒造|醸造|酒本舗|豆腐|農園|魚市場|卸売|観光|プラザ$|配送|物流|(^|[^a-z])dc$/i;

/** Overture の細かい種類（taxonomy.primary）と名前から、店の種類を決める。使わない店は null */
export function kindOfOverture(detail: string, name: string): ShopKind | null {
  const text = name.normalize("NFKC");
  if (detail === "convenience_store") return CONVENIENCE_NAMES.test(text) ? "コンビニ" : null;
  if (detail === "grocery_store" || detail === "organic_grocery_store") return SUPERMARKET_NAMES.test(text) && !NOT_SUPERMARKET.test(text) ? "スーパー" : null;
  if (detail === "drugstore") return DRUGSTORE_CHAINS.test(text) || /薬/.test(text) ? "ドラッグストア" : null;
  if (detail === "pharmacy" && DRUGSTORE_CHAINS.test(text)) return "ドラッグストア";
  return null;
}

// 同じチェーンを1つの言葉にそろえる（カタカナ・英字・ハイフンの書き方の違いを吸収する）
const CHAIN_KEYS: [RegExp, string][] = [
  [/セブン.?イレブン|7.?eleven|seven.?eleven/i, "seven"],
  [/ローソン|lawson/i, "lawson"],
  [/ファミリーマート|ファミマ|familymart/i, "familymart"],
  [/デイリーヤマザキ|ヤマザキショップ|ヤマザキデイリー|daily.?yamazaki/i, "yamazaki"],
  [/ミニストップ|ministop/i, "ministop"],
  [/セイコーマート|seicomart/i, "seicomart"],
  [/ポプラ|poplar/i, "poplar"],
  [/ウエルシア|welcia/i, "welcia"],
  [/ツルハ|tsuruha/i, "tsuruha"],
  [/クスリのアオキ|aoki/i, "aoki"],
  [/マツモトキヨシ|マツキヨ|matsukiyo/i, "matsukiyo"],
  [/newdays|ニューデイズ/i, "newdays"],
  [/コスモス/i, "cosmos"],
  [/サンドラッグ/i, "sundrug"],
  [/ゲンキー/i, "genky"],
  [/v.?drug/i, "vdrug"],
  [/原信|ナルス|harashin/i, "harashin"],
  [/ウオロク|uoroku/i, "uoroku"],
  [/清水フードセンター/i, "shimizu"],
  [/キューピット/i, "cupid"],
  [/良食生活館/i, "ryoshoku"],
  [/イチコ/i, "ichiko"],
  [/業務スーパー/i, "gyomu"],
  [/イオン|aeon|マックスバリュ/i, "aeon"],
  [/ベイシア/i, "beisia"],
  [/トライアル/i, "trial"],
  [/コープ|生協/i, "coop"],
];

/** 名の知れたチェーン（CHAIN_KEYS）の店か */
export function isKnownChain(name: string): boolean {
  const text = name.normalize("NFKC").toLowerCase();
  return CHAIN_KEYS.some(([re]) => re.test(text));
}

/** 名前からチェーンの言葉を出す。チェーンでなければ、記号と空白を除いた名前の先頭4文字 */
export function chainKey(name: string): string {
  const text = name.normalize("NFKC").toLowerCase();
  const chain = CHAIN_KEYS.find(([re]) => re.test(text));
  if (chain) return chain[1];
  return text.replace(/[\s・\-ー_.,()（）「」]/g, "").slice(0, 4);
}

export interface ShopPoint {
  kind: ShopKind;
  name: string;
  lon: number;
  lat: number;
}

/** 2点の直線距離（m）。数十〜数百mを比べるだけなので、球面の近似で十分 */
export function distanceM(a: { lon: number; lat: number }, b: { lon: number; lat: number }): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * 同じ店とみなすか。同じ種類で、名の知れたチェーンの同じ店なら knownChainM 以内、それ以外の同じ名前なら sameChainM 以内、
 * 名前を問わなければ anyM 以内
 */
export function sameShop(a: ShopPoint, b: ShopPoint, sameChainM: number, anyM: number, knownChainM = sameChainM): boolean {
  if (a.kind !== b.kind) return false;
  const d = distanceM(a, b);
  if (d <= anyM) return true;
  if (chainKey(a.name) !== chainKey(b.name)) return false;
  return d <= (isKnownChain(a.name) ? knownChainM : sameChainM);
}

/** Overture の中の重複を除く。確からしさの高い順に見て、もう残した店と同じ店なら捨てる */
export function dedupeShops<T extends ShopPoint & { confidence: number }>(shops: T[]): T[] {
  const kept: T[] = [];
  for (const s of [...shops].sort((a, b) => b.confidence - a.confidence)) {
    if (!kept.some((k) => sameShop(k, s, 50, 15, 150))) kept.push(s);
  }
  return kept;
}

/** OSM・大規模小売店舗一覧（existing）にもうある店を除く */
export function notInExisting<T extends ShopPoint>(shops: T[], existing: ShopPoint[]): T[] {
  return shops.filter((s) => !existing.some((e) => sameShop(e, s, 100, 30, 300)));
}

interface Candidate extends ShopPoint {
  id: string;
  detail: string;
  confidence: number;
  source: string;
}

export const overture = defineJob({
  datasets: ["D40"],
  rawDir: "overture",
  table: "facilities",
  options: ["date"],

  async load({ sql, raw, args, log, setAsOf, check }) {
    const file = raw.find(/overture_shops.*\.csv$/i, "work/overture_extract.py で作った overture_shops_niigata.csv");
    if (args.date) setAsOf("D40", args.date);
    const [header, ...lines] = parseCsv(decode(file.body, "utf-8").replace(/^﻿/, ""));
    const col = (name: string) => {
      const i = header.indexOf(name);
      if (i < 0) throw new Error(`${file.name} に「${name}」の列がありません（見出し：${header.join(",")}）`);
      return i;
    };
    const [iId, iName, iDetail, iConf, iLon, iLat, iSource] = ["id", "name", "detail", "confidence", "lon", "lat", "source"].map(col);

    const candidates: Candidate[] = [];
    for (const r of lines) {
      if (r.length < header.length) continue;
      const name = (r[iName] ?? "").trim();
      const kind = kindOfOverture(r[iDetail], name);
      const lon = Number(r[iLon]);
      const lat = Number(r[iLat]);
      if (!kind || !Number.isFinite(lon) || !Number.isFinite(lat)) continue;
      candidates.push({ id: r[iId], kind, name: name || `（名前の無い${kind}）`, detail: r[iDetail], confidence: Number(r[iConf]) || 0, source: r[iSource] ?? "", lon, lat });
    }

    const deduped = dedupeShops(candidates);
    const existing = (
      await sql<{ kind: ShopKind; name: string; lon: number; lat: number }[]>`
        select kind, name, extensions.st_x(geog::extensions.geometry) as lon, extensions.st_y(geog::extensions.geometry) as lat
        from facilities where dataset_id in ('D28', 'D29') and kind in ('コンビニ', 'スーパー', 'ドラッグストア')
      `
    ).map((e) => ({ ...e, lon: Number(e.lon), lat: Number(e.lat) }));
    if (existing.length === 0) throw new Error("OSM（D28）の店がありません。先に npm run ingest -- osm と d29-large-stores を入れてください");
    const added = notInExisting(deduped, existing);

    const rows: FacilityRow[] = added.map((s) => ({
      dataset_id: "D40",
      kind: s.kind,
      name: s.name,
      address: null,
      attrs: { overture_id: s.id, 種類: s.detail, 確からしさ: s.confidence, 提供元: s.source, 補った理由: "OSM・大規模小売店舗一覧に同じ店が無い" },
      source_ref: s.id,
      lon: s.lon,
      lat: s.lat,
    }));
    await insertFacilities(sql, rows);
    // 新潟県の町から約300m以上離れた店を消す（0.003度。osm.ts と同じ）
    const removed = await sql`
      delete from facilities f
      where f.dataset_id = 'D40'
        and not exists (select 1 from towns t where t.city_code like '15%' and extensions.st_dwithin(t.geom, f.geog::extensions.geometry, 0.003))
    `;
    const count = (list: ShopPoint[]) => Object.fromEntries((["コンビニ", "スーパー", "ドラッグストア"] as const).map((k) => [k, list.filter((s) => s.kind === k).length]));
    log(
      `${file.name}：候補 ${candidates.length}店 → 重複を除いて ${deduped.length}店 → OSM・一覧に無い ${added.length}店を入れ、新潟県の外の ${removed.count}店を除きました`,
    );
    check("候補（種類ごと）", count(candidates));
    check("重複を除いたあと（種類ごと）", count(deduped));
    check("OSM・一覧に無く足した店（種類ごと、県の外を除く前）", count(added));
    check("新潟県の外で除いた店", removed.count);
  },
});
