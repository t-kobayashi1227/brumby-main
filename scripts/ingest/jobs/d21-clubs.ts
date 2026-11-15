import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { geocodeAddress, isInNiigata } from "../../../lib/geocode";
import { insertFacilities, type FacilityRow } from "../lib/facilities";
import { parseCsv } from "../lib/files";
import { sleep } from "../lib/reinfolib";
import { defineJob } from "../lib/runner";
import { addressForSearch, cleanSearchAddress, isCoarseHit, parseLatLon } from "./d29-large-stores";
import { cityNameOf, decodeCsv, isTownLevelHit, LIBRARY_CSV_DIR, normalizeDate } from "./d23-libraries";

// D21 放課後児童クラブ（新潟県全体）。各市町村のホームページの一覧を写した CSV（data/manual/放課後児童クラブ.csv）を正本にして入れる
//   npm run ingest -- d21-clubs
// 県のまとまった一覧は無い（2026-11-14 調査。docs/参考/放課後児童クラブ調査_2026-11-14.md）。
// 市町村のページに一覧が無い阿賀野市・胎内市・田上町・刈羽村・関川村は、県の社会福祉施設等名簿（令和7年度、施設コード5050）から足した。
// 一覧が見つからない市町村（粟島浦村）は CSV に行が無い。事実シートでは「取得できず」にする（lib/facts/build.ts の PARTIAL_AREA_DATASETS）
//
// CSV の列：市町村, 名前, 所在地, 場所, 位置を出す住所, 緯度, 経度, ページの時点, 確認日, 確認したURL, メモ
//   所在地：ページに書いてある住所（番地まで無いこともある）。場所：「○○小学校内」などの施設の説明
//   位置を出す住所：所在地で位置が出ないとき、または直したいときに書く。住所でも「緯度, 経度」でもよい（D29 と同じ書き方）
//   DBの緯度, DBの経度, DBの位置の出し方, DBの当たった住所・学校：取り込みのたびに、DB に入れた位置をここに書き戻す（手で直す列ではない）
//   廃止（任意の列）：終わる・終わったクラブに書く（例：「令和8年で終了」）。書いてある行は入れない（2026-11-15 小林さん。南魚沼市の六日町クラブ）
//
// 位置の出し方（上から順に）
//   1. 緯度・経度の列 → 2. 位置を出す住所 → 3. 所在地を住所検索（番地まで当たったもの）
//   → 4. 場所に「○○小学校」とあれば、P29 の学校の位置（2026-11-15 小林さんと決定）→ 5. 大字・町名までしか当たらなかった住所検索の位置
//   どれも出せなければ入れない（推測で埋めない）。check に出すので、小林さんが調べて CSV の位置を出す住所を埋める
//
// 同じ位置のクラブ（「第1」「第2」など、同じ場所で名前を分けているもの）は1件にまとめ、名前を並べる（2026-11-15 小林さんと決定）
// 例：「西小第一児童クラブ」「西小第二児童クラブ」→「西小第一・第二児童クラブ」。1km以内の一覧に同じ場所が並ばないようにする

export const CLUB_CSV = "放課後児童クラブ.csv";
export const CLUB_COLUMNS = ["市町村", "名前", "所在地", "場所", "位置を出す住所", "緯度", "経度", "ページの時点", "確認日", "確認したURL", "メモ"] as const;
type Column = (typeof CLUB_COLUMNS)[number];

export interface ClubRow {
  line: number;
  city: string;
  name: string;
  address: string;
  place: string;
  searchAddress: string;
  lat: number | null;
  lon: number | null;
  pageAsOf: string;
  checkedOn: string | null;
  url: string | null;
  memo: string;
  /** 「廃止」の列。空でなければ入れない */
  ended: string;
}

function toCoord(text: string, label: string, where: string): number | null {
  const t = text.trim();
  if (!t) return null;
  const n = Number(t);
  if (!Number.isFinite(n)) throw new Error(`${where}：${label}が数ではありません（${t}）`);
  return n;
}

/** CSV を読み、列と値を確かめる。おかしな行があれば、行の番号を付けてまとめてエラーにする */
export function parseClubCsv(text: string): ClubRow[] {
  const [header, ...lines] = parseCsv(text.replace(/^﻿/, ""));
  if (!header) throw new Error(`${CLUB_CSV} が空です`);
  const missing = CLUB_COLUMNS.filter((c) => !header.includes(c));
  if (missing.length) throw new Error(`${CLUB_CSV} に「${missing.join("」「")}」の列がありません`);
  const idx = Object.fromEntries(CLUB_COLUMNS.map((c) => [c, header.indexOf(c)])) as Record<Column, number>;
  const endedIdx = header.indexOf("廃止");

  const rows: ClubRow[] = [];
  const errors: string[] = [];
  lines.forEach((r, i) => {
    const line = i + 2; // 見出しが1行目
    const get = (c: Column) => (r[idx[c]] ?? "").trim();
    if (r.every((v) => v.trim() === "")) return;
    const where = `${line}行目（${get("名前") || "名前なし"}）`;
    try {
      if (!get("名前")) throw new Error(`${where}：名前が空です`);
      if (!get("市町村")) throw new Error(`${where}：市町村が空です`);
      const lat = toCoord(get("緯度"), "緯度", where);
      const lon = toCoord(get("経度"), "経度", where);
      if ((lat === null) !== (lon === null)) throw new Error(`${where}：緯度と経度は両方書くか、両方空にしてください`);
      if (lat !== null && lon !== null && !isInNiigata(lon, lat)) throw new Error(`${where}：緯度・経度が新潟県の範囲の外です（緯度と経度が逆かもしれません）`);
      try {
        parseLatLon(get("位置を出す住所"));
      } catch (e) {
        throw new Error(`${where}：${(e as Error).message}`);
      }
      let checkedOn: string | null;
      try {
        checkedOn = normalizeDate(get("確認日"));
      } catch (e) {
        throw new Error(`${where}：${(e as Error).message}`);
      }
      rows.push({
        line,
        city: get("市町村"),
        name: get("名前"),
        address: get("所在地"),
        place: get("場所"),
        searchAddress: get("位置を出す住所"),
        lat,
        lon,
        pageAsOf: get("ページの時点"),
        checkedOn,
        url: get("確認したURL") || null,
        memo: get("メモ"),
        ended: endedIdx >= 0 ? (r[endedIdx] ?? "").trim() : "",
      });
    } catch (e) {
      errors.push((e as Error).message);
    }
  });
  if (errors.length) throw new Error(`${CLUB_CSV} を直してください\n  ${errors.join("\n  ")}`);
  return rows;
}

/**
 * 場所の説明から小学校の名前を取り出す（例：「大野小学校内（1階）」→「大野小学校」）。無ければ null
 * 「見附第二小学校区ふるさとセンター内」のような「小学校区」、名前の無い「単独（小学校敷地内）」は学校の位置にしない
 */
export function schoolNameIn(place: string): string | null {
  const m = /([^\s（(）)、・,，]+?小学校)(?!区)/.exec(place.normalize("NFKC").replace(/\(/g, "（").replace(/\)/g, "）"));
  return m ? m[1] : null;
}

export interface School {
  name: string;
  cityCode: string;
  lon: number;
  lat: number;
}

/**
 * P29 の小学校から、市町村と名前で1校を選ぶ。P29 の名前は「糸魚川市立能生小学校」「新潟大学附属新潟小学校」の形
 * 「○○立」を除いた名前が同じ学校、無ければ名前の末尾が同じ学校（附属校など）。1校に決まらなければ null
 */
export function findSchool(schools: School[], cityCode: string, school: string): School | null {
  const sameCity = schools.filter((s) => (cityCode.startsWith("151") ? s.cityCode.startsWith("151") : s.cityCode === cityCode));
  const exact = sameCity.filter((s) => s.name.replace(/^.+?[都道府県市区町村]立/, "") === school);
  if (exact.length === 1) return exact[0];
  if (exact.length > 1) return null;
  const tail = sameCity.filter((s) => s.name.endsWith(school));
  return tail.length === 1 ? tail[0] : null;
}

/** 第1・第一・（第二）・1組 のような、同じ場所のクラブを分ける呼び名か */
const ORDINAL = /^[\s　]*([（(]?第?[0-9０-９一二三四五六七八九十]+(組)?[）)]?|分室)[\s　]*$/;

/**
 * 同じ位置のクラブの名前を1つにする。前と後ろが同じで、違うのが「第一」「第二」などだけなら縮める
 * 例：「西小第一児童クラブ」「西小第二児童クラブ」→「西小第一・第二児童クラブ」。ほかは「・」でつなぐ
 */
export function mergeNames(names: string[]): string {
  const u = [...new Set(names)];
  if (u.length === 1) return u[0];
  let pre = u.reduce((p, n) => {
    let i = 0;
    while (i < p.length && i < n.length && p[i] === n[i]) i++;
    return p.slice(0, i);
  });
  // 「第」「(」で切れたら、それぞれの呼び名の側に戻す（「田尻第」→「田尻」）
  pre = pre.replace(/(第|[（(])$/, "");
  const rest = u.map((n) => n.slice(pre.length));
  let suf = rest.reduce((s, n) => {
    let i = 0;
    while (i < s.length && i < n.length && s[s.length - 1 - i] === n[n.length - 1 - i]) i++;
    return s.slice(s.length - i);
  });
  // 後ろが数字や「第」で始まると呼び名を食うので、呼び名の後ろ（クラブなど）だけにする
  suf = suf.replace(/^[0-9０-９一二三四五六七八九十）)]+/, "");
  const mids = rest.map((n) => n.slice(0, n.length - suf.length));
  if (!pre || mids.some((m) => !ORDINAL.test(m))) return u.join("・");
  return `${pre}${mids.map((m) => m.trim()).join("・")}${suf}`;
}

type How = "CSV の緯度・経度" | "位置を出す住所の緯度経度" | "住所から推定（国土地理院 住所検索）" | "P29 の小学校の位置" | "住所から推定（大字・町名まで）";

export interface Located extends ClubRow {
  lon: number | null;
  lat: number | null;
  how: How | null;
  hitTitle: string | null;
  school: string | null;
}

/** まとめるときのキー。同じ市町村で、位置が同じ（約1m）もの。大字・町名までの位置は、住所の文字が同じときだけまとめる */
export function groupKey(r: Located): string {
  const city = r.city.startsWith("新潟市") ? "新潟市" : r.city;
  if (r.how === "住所から推定（大字・町名まで）") return `${city}|addr|${r.address.normalize("NFKC").replace(/\s/g, "")}`;
  return `${city}|${r.lon!.toFixed(5)},${r.lat!.toFixed(5)}`;
}

export interface ClubGroup {
  rows: Located[];
  name: string;
}

/** 位置の出たクラブを、同じ位置ごとにまとめる（CSV の並び順を保つ） */
export function groupClubs(rows: Located[]): ClubGroup[] {
  const groups = new Map<string, Located[]>();
  for (const r of rows.filter((r) => r.lon !== null && r.lat !== null)) {
    const k = groupKey(r);
    groups.set(k, [...(groups.get(k) ?? []), r]);
  }
  return [...groups.values()].map((g) => ({ rows: g, name: mergeNames(g.map((r) => r.name)) }));
}

/**
 * DB に入れた位置を CSV に書き戻す列（取り込みのたびに上書きする。手で書いても次の取り込みで消える）。
 * 位置を直すときは、これではなく「緯度」「経度」か「位置を出す住所」に書く（2026-11-15 小林さん）
 */
export const DB_COLUMNS = ["DBの緯度", "DBの経度", "DBの位置の出し方", "DBの当たった住所・学校"] as const;

/** CSV の1つの値。カンマ・"・改行を含むときだけ "" で囲む */
function csvField(v: string): string {
  return /[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

/**
 * CSV の文字列に、DB に入れた位置の列（DB_COLUMNS）を足すか上書きして返す。ほかの列と行はそのまま残す。
 * 行は CSV の行の番号で結び付ける。入れなかった行（位置を出せない・廃止）は、出し方の列に理由を書き、緯度経度は空にする
 */
export function withDbColumns(text: string, located: Located[]): string {
  const [header, ...lines] = parseCsv(text.replace(/^﻿/, ""));
  if (!header) throw new Error(`${CLUB_CSV} が空です`);
  const head = [...header];
  const idx = DB_COLUMNS.map((c) => {
    const i = head.indexOf(c);
    if (i >= 0) return i;
    head.push(c);
    return head.length - 1;
  });
  const byLine = new Map(located.map((r) => [r.line, r]));
  const endedIdx = header.indexOf("廃止");
  const out = lines.map((r, i) => {
    const row = [...r];
    while (row.length < head.length) row.push("");
    if (r.every((v) => v.trim() === "")) return row;
    const l = byLine.get(i + 2);
    const values =
      l && l.lon !== null && l.lat !== null
        ? [l.lat.toFixed(6), l.lon.toFixed(6), l.how ?? "", l.school ?? l.hitTitle ?? ""]
        : ["", "", l ? "位置を出せず入れていない" : endedIdx >= 0 && (r[endedIdx] ?? "").trim() ? "廃止のため入れていない" : "入れていない", ""];
    idx.forEach((j, k) => (row[j] = values[k]));
    return row;
  });
  return "﻿" + [head, ...out].map((r) => r.map(csvField).join(",")).join("\n") + "\n";
}

export const d21Clubs = defineJob<Located[]>({
  datasets: ["D21"],
  rawDir: "manual",
  table: "facilities",
  options: [],

  async prepare({ sql, log, check, setAsOf }) {
    const path = join(LIBRARY_CSV_DIR, CLUB_CSV);
    if (!existsSync(path)) throw new Error(`data/manual/${CLUB_CSV} がありません`);
    const allRows = parseClubCsv(decodeCsv(readFileSync(path)));
    const ended = allRows.filter((r) => r.ended);
    const rows = allRows.filter((r) => !r.ended);
    check("廃止の列があり、入れなかったクラブ", ended.map((r) => `${r.line}行目 ${r.city} ${r.name}（${r.ended}）`));

    // 市町村名 → 市区町村コード（新潟市は区ごと）
    const towns = await sql<{ city_code: string; ward: string }[]>`select distinct city_code, ward from towns where city_code like '15%'`;
    const codeOf = new Map(towns.map((t) => [cityNameOf(t.city_code, t.ward), t.city_code]));
    const unknownCity = [...new Set(rows.map((r) => r.city).filter((c) => !codeOf.has(c)))];
    if (unknownCity.length) throw new Error(`${CLUB_CSV} の市町村が町の境界（towns）にありません：${unknownCity.join("、")}（新潟市は「新潟市北区」のように区まで書く）`);
    const schools = (
      await sql<{ name: string; city_code: string | null; lon: number; lat: number }[]>`
        select name, attrs->>'city_code' as city_code,
          extensions.st_x(geog::extensions.geometry) as lon, extensions.st_y(geog::extensions.geometry) as lat
        from facilities where kind = '小学校'
      `
    ).map((s) => ({ name: s.name, cityCode: s.city_code ?? "", lon: s.lon, lat: s.lat }));
    if (!schools.length) throw new Error("小学校（P29）がありません。先に npm run ingest -- p29-schools を動かしてください");

    const located: Located[] = [];
    const notFound: string[] = [];
    const townLevel: string[] = [];
    const bySchool: string[] = [];
    for (const r of rows) {
      const where = `${r.line}行目 ${r.city} ${r.name}`;
      const school = schoolNameIn(r.place);
      const schoolHit = school ? findSchool(schools, codeOf.get(r.city)!, school) : null;
      const done = (lon: number | null, lat: number | null, how: How | null, hitTitle: string | null = null) =>
        located.push({ ...r, lon, lat, how, hitTitle, school: how === "P29 の小学校の位置" ? schoolHit!.name : null });

      if (r.lat !== null && r.lon !== null) {
        done(r.lon, r.lat, "CSV の緯度・経度");
        continue;
      }
      const ll = parseLatLon(r.searchAddress);
      if (ll) {
        done(ll.lon, ll.lat, "位置を出す住所の緯度経度");
        continue;
      }
      const query = r.searchAddress ? addressForSearch(r.city, cleanSearchAddress(r.searchAddress).normalize("NFKC")) : r.address ? addressForSearch(r.city, r.address.normalize("NFKC")) : null;
      let rough: { lon: number; lat: number; title: string } | null = null;
      if (query) {
        const hit = await geocodeAddress(query);
        await sleep(200);
        if (hit && !isCoarseHit(hit.title) && !isTownLevelHit(hit.title)) {
          done(hit.lon, hit.lat, "住所から推定（国土地理院 住所検索）", hit.title);
          continue;
        }
        if (hit && !isCoarseHit(hit.title)) rough = { lon: hit.lon, lat: hit.lat, title: hit.title };
      }
      if (schoolHit) {
        bySchool.push(`${where}（${r.place} → ${schoolHit.name}）`);
        done(schoolHit.lon, schoolHit.lat, "P29 の小学校の位置");
        continue;
      }
      if (rough) {
        townLevel.push(`${where}（${query} → ${rough.title}）`);
        done(rough.lon, rough.lat, "住所から推定（大字・町名まで）", rough.title);
        continue;
      }
      notFound.push(`${where}（${[r.address, r.place].filter(Boolean).join("、") || "所在地・場所の記載なし"}${school && !schoolHit ? `。${school}が P29 で1校に決まらない` : ""}）`);
      done(null, null, null);
    }

    const groups = groupClubs(located);
    const perCity = new Map<string, number>();
    for (const r of rows) {
      const c = r.city.startsWith("新潟市") ? "新潟市" : r.city;
      perCity.set(c, (perCity.get(c) ?? 0) + 1);
    }
    check("市町村ごとのクラブの数（CSV の行）", Object.fromEntries(perCity));
    check("位置を出せず、入れなかったクラブ（CSV の位置を出す住所に住所か「緯度, 経度」を書く）", notFound);
    check("場所の小学校（P29）の位置を使ったクラブ", bySchool.length);
    check("大字・町名までしか当たらなかったクラブ（入れたが位置が粗い）", townLevel);
    check(
      "同じ位置で1件にまとめたクラブ",
      groups.filter((g) => g.rows.length > 1).map((g) => `${g.name}（${g.rows.map((r) => r.name).join("、")}）`),
    );
    const dates = rows.map((r) => r.checkedOn).filter((d): d is string => d !== null).sort();
    if (dates.length) setAsOf("D21", dates[dates.length - 1].slice(0, 7));
    log(`CSV の ${rows.length}行を読みました。位置を出せたのは ${rows.length - notFound.length}行、同じ位置をまとめて ${groups.length}件になります`);
    if (notFound.length) log(`位置を出せなかった ${notFound.length}行は入れません（check を見てください）`);
    return located;
  },

  async load({ sql, prepared, log, check }) {
    const rows: FacilityRow[] = groupClubs(prepared).map((g) => {
      const first = g.rows[0];
      const places = [...new Set(g.rows.map((r) => r.place).filter(Boolean))];
      return {
        dataset_id: "D21",
        kind: "放課後児童クラブ",
        name: g.name,
        address: first.address ? addressForSearch(first.city, first.address) : null,
        source_ref: `${CLUB_CSV}:${g.rows.map((r) => r.line).join(",")}`,
        attrs: {
          市町村: first.city,
          クラブ: g.rows.map((r) => r.name),
          ...(places.length ? { 場所: places.join("、") } : {}),
          ページの時点: first.pageAsOf || null,
          確認日: first.checkedOn,
          確認したURL: first.url,
          位置: first.how,
          ...(first.school ? { 小学校: first.school } : {}),
          ...(first.hitTitle ? { 当たった住所: first.hitTitle } : {}),
        },
        lon: first.lon!,
        lat: first.lat!,
      };
    });
    await insertFacilities(sql, rows);
    log(`放課後児童クラブ ${rows.length}件を入れました`);
    check("入れた件数（同じ位置をまとめたあと）", rows.length);

    // DB に入れた位置を CSV にも書き戻す（CSV だけで位置と粗さを見られるように。2026-11-15 小林さん）
    const path = join(LIBRARY_CSV_DIR, CLUB_CSV);
    writeFileSync(path, withDbColumns(decodeCsv(readFileSync(path)), prepared));
    log(`${CLUB_CSV} の「${DB_COLUMNS.join("」「")}」の列に、入れた位置を書きました`);
  },
});
