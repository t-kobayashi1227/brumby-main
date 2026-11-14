import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { geocodeAddress } from "../../../lib/geocode";
import { insertFacilities, type FacilityRow } from "../lib/facilities";
import { parseCsv, RAW_ROOT } from "../lib/files";
import { sleep } from "../lib/reinfolib";
import { defineJob } from "../lib/runner";

// D29 県内大規模小売店舗一覧（新潟県、店舗面積 1,000㎡超、PDF）
// data/raw/niigata-pref/ に県のページの PDF を置く。PDF を読むのに Python と pypdf が要る（pip install pypdf）
//
// 使い方は2つ（2026-10-25 小林さんと決定）
// 1. 一覧の店を全部「大規模小売店舗」として入れる。店舗面積と主な小売店舗も付け、エージェントが大型店の有無を評価できるようにする
// 2. スーパー・ドラッグストアの店は、OSM（D28）に同じ種類の店が約200m以内に無ければ、
//    「スーパー」「ドラッグストア」としても足す（OSM を主、一覧で補う。docs/参考/OSM突き合わせ_2026-10-24.md）
// 建物設置者の欄は個人の名前が入ることがあるので入れない
// 位置は住所から出すと町丁目の代表点になることがあり、本当の店から100m以上ずれる。
// 500m以内に名前の合う店が OSM（D28）か医療情報ネット（D30 の薬局）にあれば、その位置を使う（docs/履歴/事実シートの修正_実装案.md 1.2）
//
// 手順
//   npm run ingest -- d29-review         PDF を読み、判定の確認用の CSV（大規模小売店舗_判定.csv）を書き出す。DB は使わない
//   （小林さんが CSV の「判定」の列を確かめて直し、保存する）
//   npm run ingest -- d29-large-stores   CSV の「判定」を使って DB に入れる。先に osm（D28）を入れておく
// 判定の CSV が無いとき、CSV に無い店（PDF が新しくなって増えた店など）は、チェーン名（CHAINS）で決める
//
// PDF の表はセルの文字が2〜4行に折り返されているので、文字の位置で組み立てる
// 列は x（下の COLUMNS）、行は「市町村名」の断片の y を基準にし、上下 12pt 以内で一番近い店に入れる
// （4行のセルは基準から上下9pt ほど離れる。店と店の間は 16pt 以上ある。2026-10-25 に確かめた）
// ページ上部の見出し（「市町村名」の見出しより上）の文字は使わない
// 並びは PDF と同じ（ページの上から下）。CSV の「ページ」「番号」で PDF と見比べられる

const RAW_DIR = "niigata-pref";
/** 名前の合う店の位置を借りる範囲（m） */
const SAME_STORE_M = 500;
const REVIEW_CSV = "大規模小売店舗_判定.csv";
type StoreType = "スーパー" | "ドラッグストア";
/** 判定の CSV に書ける判定。「スーパー／ドラッグストア」は両方の種類として足す（食品も売るドラッグストアなど） */
type Judgement = StoreType | "スーパー／ドラッグストア";
const BOTH = "スーパー／ドラッグストア" as const;
/** 判定 → 足す種類 */
export function kindsOf(t: Judgement | null): StoreType[] {
  if (t === null) return [];
  return t === BOTH ? ["スーパー", "ドラッグストア"] : [t];
}
/** 「位置を出す住所」にこう書いた店は、閉店しているので入れない */
const CLOSED = "閉店";

interface Fragment {
  x: number;
  y: number;
  text: string;
}

// 列の左端の x（2026-09-01 更新の PDF で確かめた）。断片は、x がこの値以上で一番近い列に入れる
const COLUMNS: [number, string][] = [
  [40, "市町村名"],
  [80, "旧市町村名"],
  [110, "店舗名"],
  [180, "店舗名カナ"],
  [230, "所在地"],
  [292, "建物設置者"],
  [360, "店舗面積"],
  [395, "主な小売店舗"],
  [455, "開店日"],
  [495, "閉店時刻"],
  [525, "備考"],
];
const ROW_SPAN = 12;

// チェーン名 → 種類。店名か主な小売店舗に入っていれば、その種類とする（小林さんが確かめて足す）
export const CHAINS: [RegExp, StoreType][] = [
  [/原信|ナルス/, "スーパー"],
  [/ウオロク/, "スーパー"],
  [/イオン(?!モール)|マックスバリュ|ザ・ビッグ/, "スーパー"],
  [/チャレンジャー/, "スーパー"],
  [/リオン・?ドール/, "スーパー"],
  [/清水フードセンター|清水商事/, "スーパー"],
  [/SeSAME|新交ストア/i, "スーパー"],
  [/キューピット/, "スーパー"],
  [/セイフー/, "スーパー"],
  [/ウオエイ/, "スーパー"],
  [/ダイレックス/, "スーパー"],
  [/ラ・?ムー|大黒天物産/, "スーパー"],
  [/ナチュレ片山/, "スーパー"],
  [/まるよし/, "スーパー"],
  [/ピアレ/, "スーパー"],
  [/トライアル/, "スーパー"],
  [/ベイシア/, "スーパー"],
  [/コープ|生活協同組合/, "スーパー"],
  [/アピタ|ピアゴ|ユニー/, "スーパー"],
  [/マルイ(?!チ)/, "スーパー"],
  [/フードセンター|カワマツ/, "スーパー"],
  [/PLANT/i, "スーパー"],
  [/クスリのアオキ/, "ドラッグストア"],
  [/マツモトキヨシ|ファミリードラッグ/, "ドラッグストア"],
  [/カワチ薬/, "ドラッグストア"],
  [/ココカラファイン/, "ドラッグストア"],
  [/ドラッ[グク]フジイ/, "ドラッグストア"],
  [/ドラッグトップス/, "ドラッグストア"],
  [/ドラッグホシノ/, "ドラッグストア"],
  [/ウエルシア/, "ドラッグストア"],
  [/スギ薬局/, "ドラッグストア"],
  [/ゲンキー/, "ドラッグストア"],
  [/ツルハ/, "ドラッグストア"],
];

export function classify(name: string, tenant: string): StoreType | null {
  // 半角カナ（ｳｴﾙｼｱ）や全角英字（ＳｅＳＡＭＥ）があるので、NFKC で書き方をそろえてから探す
  const text = `${name} ${tenant}`.normalize("NFKC");
  return CHAINS.find(([re]) => re.test(text))?.[1] ?? null;
}

/** 断片を、店ごと・列ごとの文字にまとめる。並びは PDF と同じ（ページの順、ページの中は上から下） */
export function buildRows(pages: Fragment[][]): Record<string, string>[] {
  const rows: Record<string, string>[] = [];
  const columnOf = (x: number) => [...COLUMNS].reverse().find(([left]) => x >= left)?.[1];
  for (const [p, pageFrags] of pages.entries()) {
    // 見出し「市町村名」より上（見出しの2行目のかっこ「）」を含む）の文字は使わない
    const header = pageFrags.find((f) => f.text.trim() === "市町村名");
    const frags = header ? pageFrags.filter((f) => f.y < header.y - 9) : pageFrags;
    // 店の基準の行：市町村名の列にある、「市」「町」「村」で終わる断片。y が大きい方が上なので、大きい順に並べる
    const anchors = frags
      .filter((f) => f.x < 80 && /[市町村]$/.test(f.text.trim()))
      .map((f) => f.y)
      .sort((a, b) => b - a);
    const byAnchor = new Map<number, Fragment[]>(anchors.map((y) => [y, []]));
    for (const f of frags) {
      const nearest = anchors.reduce<number | null>((best, y) => (Math.abs(y - f.y) <= ROW_SPAN && (best === null || Math.abs(y - f.y) < Math.abs(best - f.y)) ? y : best), null);
      if (nearest !== null) byAnchor.get(nearest)!.push(f);
    }
    for (const parts of byAnchor.values()) {
      const row: Record<string, string> = {};
      // 上の行から順に（y が大きい方が上）、同じ行の中は左から
      for (const f of [...parts].sort((a, b) => b.y - a.y || a.x - b.x)) {
        const col = columnOf(f.x);
        if (col) row[col] = (row[col] ?? "") + f.text.trim();
      }
      row.ページ = String(p + 1);
      rows.push(row);
    }
  }
  return rows;
}

/** 住所を住所検索に渡せる形にする。市町村名が無ければ足し、「外」「ほか」などを外す */
export function addressForSearch(city: string, address: string): string {
  let a = address.replace(/\s/g, "").replace(/(外|ほか|他)(\d*筆)?$/, "");
  // 郡から書いた住所（西蒲原郡弥彦村…）は市町村が入っているので、市町村を足さない
  const withCounty = /^[^郡]+郡/.test(a) && a.replace(/^[^郡]+郡/, "").startsWith(city);
  if (!a.startsWith("新潟県") && !a.startsWith(city) && !withCounty) a = `${city}${a}`;
  return a;
}

/**
 * CSV の「位置を出す住所」を検索に渡せる形にする。手で書いた住所なので、
 * 郵便番号（〒950-8589）と、空白のあとの注記（「道の駅 新潟ふるさと村」「原信豊栄店内」など）を除き、
 * 文字化けで「?」になったハイフン（数字と数字の間）を「－」に戻す
 */
export function cleanSearchAddress(address: string): string {
  return address
    .trim()
    .replace(/^〒?\s*[0-9０-９]{3}[-－−‐ー][0-9０-９]{4}\s*/, "")
    .split(/\s+/)[0]
    .replace(/(?<=[0-9０-９])[?？](?=[0-9０-９])/g, "－");
}

// 県内の市町村（郡は付けても付けなくてもよい）と、新潟市の区
const MUNICIPALITIES = [
  "新潟市", "長岡市", "三条市", "柏崎市", "新発田市", "小千谷市", "加茂市", "十日町市", "見附市", "村上市",
  "燕市", "糸魚川市", "妙高市", "五泉市", "上越市", "阿賀野市", "佐渡市", "魚沼市", "南魚沼市", "胎内市",
  "聖籠町", "弥彦村", "田上町", "阿賀町", "出雲崎町", "湯沢町", "津南町", "刈羽村", "関川村", "粟島浦村",
];
const NIIGATA_WARDS = ["北区", "東区", "中央区", "江南区", "秋葉区", "南区", "西区", "西蒲区"];
const COARSE_HIT = new RegExp(`^新潟県(?:[^郡]+郡)?(?:${MUNICIPALITIES.join("|")})(?:${NIIGATA_WARDS.join("|")})?$`);

/**
 * 住所検索が市町村か区までしか当たらなかったか（例：「新潟県新潟市」「新潟県新潟市中央区」）
 * その位置は市役所・区役所などの代表点で、店から何kmも離れる。使うと遠くの店が「1km以内」に数えられるので、位置を出せなかった店にする
 * （2026-11-12 に、県の PDF の新潟市の所在地に区が無く、147店が新潟市役所の位置に集まっていたのが見つかった）
 */
export function isCoarseHit(title: string): boolean {
  return COARSE_HIT.test(title.replace(/\s/g, ""));
}

interface Store {
  no: number;
  page: number;
  city: string;
  name: string;
  address: string;
  /** 位置を出すのに使う住所（確認用の CSV の「位置を出す住所」。空なら所在地を使う） */
  searchAddress?: string | null;
  areaSqm: number | null;
  tenant: string;
  opened: string;
  closing: string;
  /** チェーン名で決めた判定 */
  auto: StoreType | null;
  /** 使う判定（確認用の CSV があればそれ、無ければ auto） */
  type: Judgement | null;
  lon: number | null;
  lat: number | null;
  hit: string | null;
  /** 位置を借りた店（借りなければ null） */
  borrowed?: NearbyStore | null;
  /** 住所から推定した位置（位置を借りたときに残す） */
  geocoded?: { lon: number; lat: number } | null;
}

/** 店の名前を比べる形にする：NFKC、空白・会社の種類・「薬局」を除き、「ウェ」を「ウエ」に */
export function storeNameKey(name: string): string {
  return name
    .normalize("NFKC")
    .replace(/\s/g, "")
    .replace(/株式会社|\(株\)|\(有\)|薬局/g, "")
    .replace(/ウェ/g, "ウエ");
}

/**
 * 同じ店か。支店名（「〜店」）まで入った名前どうしで、片方がもう片方を含めば同じ店とみなす
 * 「ウエルシア薬局」のような支店名の無い名前は、近くの別の店と取り違えるので比べない
 */
export function isSameStore(a: string, b: string): boolean {
  const [x, y] = [storeNameKey(a), storeNameKey(b)];
  if (!x.endsWith("店") || !y.endsWith("店")) return false;
  return x.includes(y) || y.includes(x);
}

export interface NearbyStore {
  dataset_id: string;
  name: string;
  lon: number;
  lat: number;
  distance_m: number;
}

/** 位置を借りる店。名前の合う店のうち、OSM（D28）を先に、無ければ D30。同じ出典なら近いほう */
export function pickSameStore(name: string, nearby: NearbyStore[]): NearbyStore | null {
  const hits = nearby.filter((n) => n.distance_m <= SAME_STORE_M && isSameStore(name, n.name));
  const order = (n: NearbyStore) => (n.dataset_id === "D28" ? 0 : 1);
  return hits.sort((a, b) => order(a) - order(b) || a.distance_m - b.distance_m)[0] ?? null;
}

/**
 * 確認用の CSV で店を見分けるキー。PDF が新しくなって番号がずれても合うように番号は使わず、
 * CSV で店舗名を直せるように店舗名も使わない（市町村名・所在地・店舗面積）
 */
const storeKey = (s: { city: string; address: string; areaSqm: number | null }) => `${s.city}|${s.address}|${s.areaSqm ?? ""}`;

/** PDF を読んで店の一覧にする（判定はチェーン名で決めたもの） */
function readStores(): Store[] {
  const dir = join(RAW_ROOT, RAW_DIR);
  const pdf = existsSync(dir) ? readdirPdf(dir) : null;
  if (!pdf) throw new Error(`ファイルがありません。県内大規模小売店舗一覧の PDF を data/raw/${RAW_DIR}/ に置いてください`);
  const json = execFileSync("python", [join(process.cwd(), "scripts", "ingest", "py", "pdf_fragments.py"), join(dir, pdf)], {
    encoding: "utf-8",
    maxBuffer: 200 * 1024 * 1024,
  });
  return (
    buildRows(JSON.parse(json) as Fragment[][])
      // 「店舗数小計」などの集計の行は使わない
      .filter((r) => r.店舗名 && r.所在地 && !/小計|合計/.test(r.店舗名))
      .map((r, i) => {
        const auto = classify(r.店舗名, r.主な小売店舗 ?? "");
        return {
          no: i + 1,
          page: Number(r.ページ),
          city: r.市町村名,
          name: r.店舗名,
          address: r.所在地,
          areaSqm: r.店舗面積 ? Number(r.店舗面積.replace(/,/g, "")) || null : null,
          tenant: r.主な小売店舗 ?? "",
          opened: r.開店日 ?? "",
          closing: r.閉店時刻 ?? "",
          auto,
          type: auto,
          lon: null,
          lat: null,
          hit: null,
        };
      })
  );
}

function readdirPdf(dir: string): string | null {
  const names = readdirSync(dir).filter((n) => /\.pdf$/i.test(n));
  if (names.length > 1) throw new Error(`data/raw/${RAW_DIR}/ に PDF が2つ以上あります（${names.join(", ")}）。1つにしてください`);
  return names[0] ?? null;
}

/**
 * npm run ingest -- d29-review：判定の確認用の CSV を書き出す（Excel で開ける UTF-8 BOM つき）
 * 小林さんが「判定」の列を「スーパー」「ドラッグストア」か空欄に直して保存する。「店舗名」も直せる（DB にはその名前で入る）
 * 「位置を出す住所」に住所を書くと、所在地の代わりにその住所で位置を出す（区の無い新潟市の住所に区を足すなど）。「閉店」と書いた店は入れない
 * 「判定」は「スーパー／ドラッグストア」とも書ける（両方の種類として足す）。「主な小売店舗」も直せる
 * 「所在地」は CSV と PDF の店を突き合わせるのに使うので、直さない
 * 「自動の判定」の列は見比べ用で、使わない
 * すでに CSV があるときは、直した判定を消さないよう、別の名前（…_新.csv）で書き出す
 */
export function writeReviewCsv(): string {
  const stores = readStores();
  const dir = join(RAW_ROOT, RAW_DIR);
  const name = existsSync(join(dir, REVIEW_CSV)) ? REVIEW_CSV.replace(/\.csv$/, "_新.csv") : REVIEW_CSV;
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const lines = [
    ["番号", "ページ", "市町村名", "店舗名", "主な小売店舗", "所在地", "店舗面積_㎡", "自動の判定", "判定", "位置を出す住所"].join(","),
    ...stores.map((s) => [s.no, s.page, s.city, s.name, s.tenant, s.address, s.areaSqm, s.auto, s.auto, ""].map(esc).join(",")),
  ];
  writeFileSync(join(dir, name), "﻿" + lines.join("\r\n"));
  const count = (t: StoreType) => stores.filter((s) => s.auto === t).length;
  return `data/raw/${RAW_DIR}/${name} に ${stores.length}店を書き出しました（自動の判定：スーパー ${count("スーパー")}、ドラッグストア ${count("ドラッグストア")}）`;
}

interface Review {
  type: Judgement | null;
  name: string;
  /** 主な小売店舗（CSV で直したもの。空なら PDF のまま） */
  tenant: string;
  searchAddress: string | null;
}

/** 確認用の CSV の「判定」「店舗名」「位置を出す住所」（店のキー → 中身）。CSV が無ければ null */
function readReviewCsv(): Map<string, Review> | null {
  const path = join(RAW_ROOT, RAW_DIR, REVIEW_CSV);
  if (!existsSync(path)) return null;
  const [header, ...rows] = parseCsv(readFileSync(path, "utf-8").replace(/^﻿/, ""));
  const col = (n: string) => {
    const i = header.indexOf(n);
    if (i < 0) throw new Error(`${REVIEW_CSV} に「${n}」の列がありません`);
    return i;
  };
  const [city, name, tenant, address, area, type] = ["市町村名", "店舗名", "主な小売店舗", "所在地", "店舗面積_㎡", "判定"].map(col);
  // 「位置を出す住所」は後から足した列なので、無くてもよい
  const search = header.indexOf("位置を出す住所");
  const map = new Map<string, Review>();
  for (const r of rows) {
    const t = (r[type] ?? "").trim();
    if (t !== "" && t !== "スーパー" && t !== "ドラッグストア" && t !== BOTH)
      throw new Error(`${REVIEW_CSV} の判定は「スーパー」「ドラッグストア」「${BOTH}」か空欄にしてください（${r[name]}：${t}）`);
    const s = search >= 0 ? (r[search] ?? "").trim() : "";
    map.set(storeKey({ city: r[city], address: r[address], areaSqm: r[area] ? Number(r[area]) : null }), {
      type: (t || null) as Judgement | null,
      name: r[name].trim(),
      tenant: (r[tenant] ?? "").trim(),
      searchAddress: s === "" ? null : s === CLOSED ? CLOSED : cleanSearchAddress(s),
    });
  }
  return map;
}

export const d29LargeStores = defineJob<Store[]>({
  datasets: ["D29"],
  rawDir: RAW_DIR,
  table: "facilities",
  options: [],

  async prepare({ log, check }) {
    const stores = readStores();
    const review = readReviewCsv();
    if (review) {
      const missing = stores.filter((s) => !review.has(storeKey(s)));
      const renamed: string[] = [];
      const retenanted: string[] = [];
      for (const s of stores) {
        const r = review.get(storeKey(s));
        if (!r) continue;
        s.type = r.type;
        s.searchAddress = r.searchAddress;
        if (r.name && r.name !== s.name) {
          renamed.push(`${s.name} → ${r.name}`);
          s.name = r.name;
        }
        if (r.tenant && r.tenant !== s.tenant) {
          retenanted.push(`${s.name}：${s.tenant} → ${r.tenant}`);
          s.tenant = r.tenant;
        }
      }
      // 閉店した店は入れない
      const closed = stores.filter((s) => s.searchAddress === CLOSED);
      check("閉店のため入れない店", closed.map((s) => `${s.city} ${s.name}（${s.address}）`));
      stores.splice(0, stores.length, ...stores.filter((s) => s.searchAddress !== CLOSED));
      check("主な小売店舗を直した店", retenanted);
      check("判定の CSV に無く、チェーン名で決めた店", missing.map((s) => `${s.city} ${s.name}`));
      check("判定を直した店", stores.filter((s) => s.type !== s.auto).map((s) => `${s.name}：${s.auto ?? "なし"} → ${s.type ?? "なし"}`));
      check("店舗名を直した店", renamed);
      check("位置を出す住所を書いた店", stores.filter((s) => s.searchAddress).map((s) => `${s.city} ${s.name}：${s.address} → ${s.searchAddress}`));
      log(`判定は ${REVIEW_CSV} を使います（CSV に無い店 ${missing.length}店はチェーン名で決めます）`);
    } else {
      log(`${REVIEW_CSV} が無いので、判定はチェーン名で決めます（確かめるときは npm run ingest -- d29-review）`);
    }
    log(`PDF から ${stores.length}店を使います（スーパー ${stores.filter((s) => kindsOf(s.type).includes("スーパー")).length}、ドラッグストア ${stores.filter((s) => kindsOf(s.type).includes("ドラッグストア")).length}）。住所から位置を出します`);

    let found = 0;
    const coarse: string[] = [];
    for (const s of stores) {
      const hit = await geocodeAddress(addressForSearch(s.city, s.searchAddress ?? s.address));
      if (hit && isCoarseHit(hit.title)) {
        coarse.push(`${s.city} ${s.name}（${s.searchAddress ?? s.address} → ${hit.title}）`);
      } else if (hit) {
        Object.assign(s, { lon: hit.lon, lat: hit.lat, hit: hit.title });
        found++;
      }
      await sleep(200);
    }
    check("PDF から読んだ店", stores.length);
    check("位置を出せた店", found);
    check("市町村・区までしか当たらず、位置を出さなかった店（CSV の「位置を出す住所」で直す）", coarse);
    check("位置を出せなかった店", stores.filter((s) => s.lon === null).map((s) => `${s.city} ${s.name}（${s.searchAddress ?? s.address}）`));
    if (coarse.length) log(`市町村・区までしか当たらなかった ${coarse.length}店は入れません。${REVIEW_CSV} の「位置を出す住所」に区や番地を足した住所を書いて、取り込み直してください`);
    return stores;
  },

  async load({ sql, prepared, log, check }) {
    const located = prepared.filter((s) => s.lon !== null && s.lat !== null);

    // 0. 名前の合う店が近くにあれば、その位置を使う
    const nearby = await sql<(NearbyStore & { i: number })[]>`
      select x.i, f.dataset_id, f.name,
        extensions.st_x(f.geog::extensions.geometry) as lon, extensions.st_y(f.geog::extensions.geometry) as lat,
        extensions.st_distance(f.geog, extensions.st_setsrid(extensions.st_point(x.lon, x.lat), 4326)::extensions.geography) as distance_m
      from jsonb_to_recordset(${sql.json(located.map((s, i) => ({ i, lon: s.lon, lat: s.lat })) as never)}) as x(i int, lon float8, lat float8)
      join facilities f on ((f.dataset_id = 'D28' and f.kind in ('スーパー', 'ドラッグストア')) or (f.dataset_id = 'D30' and f.kind = '薬局'))
        and extensions.st_dwithin(f.geog, extensions.st_setsrid(extensions.st_point(x.lon, x.lat), 4326)::extensions.geography, ${SAME_STORE_M})
    `;
    located.forEach((s, i) => {
      const hit = pickSameStore(s.name, nearby.filter((n) => n.i === i).map((n) => ({ ...n, distance_m: Number(n.distance_m) })));
      if (!hit) return;
      s.geocoded = { lon: s.lon!, lat: s.lat! };
      s.borrowed = hit;
      s.lon = hit.lon;
      s.lat = hit.lat;
    });
    const borrowed = located.filter((s) => s.borrowed);
    log(`名前の合う店の位置を使った店 ${borrowed.length}店（OSM ${borrowed.filter((s) => s.borrowed!.dataset_id === "D28").length}、医療情報ネット ${borrowed.filter((s) => s.borrowed!.dataset_id === "D30").length}）`);
    check(
      "名前の合う店の位置を使った店",
      borrowed.map((s) => `${s.city} ${s.name} ← ${s.borrowed!.name}（${s.borrowed!.dataset_id}、${Math.round(s.borrowed!.distance_m)}m）`),
    );
    const base = (s: Store, kind: string): FacilityRow => ({
      dataset_id: "D29",
      kind,
      name: s.name,
      address: s.address,
      attrs: {
        "店舗面積_㎡": s.areaSqm,
        主な小売店舗: s.tenant || null,
        開店日: s.opened || null,
        閉店時刻: s.closing || null,
        位置: s.borrowed
          ? `${s.borrowed.dataset_id === "D28" ? "OSM" : "医療情報ネット"}の同じ店（${s.borrowed.name}）の位置`
          : "住所から推定（国土地理院 住所検索）",
        当たった住所: s.hit,
        ...(s.searchAddress ? { 位置を出した住所: s.searchAddress } : {}),
        ...(s.geocoded ? { 住所から推定した位置: s.geocoded } : {}),
        ...(kind === "大規模小売店舗" ? { スーパー等の判定: s.type } : { 補った理由: "OSM に同じ種類の店が約200m以内に無い" }),
      },
      lon: s.lon!,
      lat: s.lat!,
    });

    // 1. 全部を「大規模小売店舗」として入れる
    await insertFacilities(sql, located.map((s) => base(s, "大規模小売店舗")));

    // 2. スーパー・ドラッグストアのうち、OSM に同じ種類の店が約200m以内に無いものを足す
    // 「スーパー／ドラッグストア」の店は、種類ごとに1つずつ候補にする
    const candidates = located.flatMap((s) => kindsOf(s.type).map((kind) => ({ ...s, kind })));
    const near = await sql<{ i: number }[]>`
      select x.i from jsonb_to_recordset(${sql.json(candidates.map((s, i) => ({ i, kind: s.kind, lon: s.lon, lat: s.lat })) as never)})
        as x(i int, kind text, lon float8, lat float8)
      where exists (
        select 1 from facilities f
        where f.dataset_id = 'D28' and f.kind = x.kind
          and extensions.st_dwithin(f.geog, extensions.st_setsrid(extensions.st_point(x.lon, x.lat), 4326)::extensions.geography, 200)
      )
    `;
    const nearSet = new Set(near.map((r) => r.i));
    const added = candidates.filter((_, i) => !nearSet.has(i));
    await insertFacilities(sql, added.map((s) => base(s, s.kind)));
    log(`大規模小売店舗 ${located.length}店を入れ、OSM に無いスーパー・ドラッグストア ${added.length}店を足しました（候補 ${candidates.length}店）`);
    check("OSM に無いため足した店", added.map((s) => `${s.kind}：${s.city} ${s.name}`));
  },
});
