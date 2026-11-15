import { kanjiToNumber, normalizeWidth } from "../../../lib/facts/school-zones";
import { htmlTables, htmlText, tableRows } from "../lib/html-table";
import { defineJob, insertRows } from "../lib/runner";

// D42 燕市の学校区（町名（行政区） → 小学校・中学校）
// npm run ingest -- d42-tsubame-school-zones
// 燕市の「学校区一覧」のページ（HTML の表。同じ中身の CSV もある）を読み取る。燕市オープンデータ（CC BY 4.0）
// ページは data/raw/school-zones-tsubame/ に保存する
// 表の町名は「行政区」（自治会の単位）で、住所の町名と少し違う。次のように扱う
//   「秋葉町一丁目」→ 秋葉町1丁目。「中央通五の1」「地蔵堂本町二丁目1」→ 中央通5丁目・地蔵堂本町2丁目（行政区の分け方は番地では分からないので一部）
//   「廿六木三区」「吉田西太田三区」→ 廿六木・吉田西太田の一部
//   同じ町名が2つ以上の学校区にある（灰方、吉田西太田、牧ケ花など）→ どちらも一部（物件では「要確認」になる）

export const TSUBAME_URL = "https://www.city.tsubame.niigata.jp/soshiki/kyoiku/1/7/3364.html";

export interface TsubameArea {
  town: string;
  chome: number | null;
  /** 表のまま（例：中央通五の1） */
  text: string;
  /** 行政区が町の一部だけのとき（「三区」「五の1」など） */
  partial: boolean;
}

/** 町名（行政区）の1つを、住所の町名・丁目にする */
export function parseTsubameName(raw: string): TsubameArea {
  const text = normalizeWidth(raw).replace(/\s/g, "");
  let m = /^(.+?)([一二三四五六七八九十]+)丁目(\d*)$/.exec(text);
  if (m) return { town: m[1], chome: kanjiToNumber(m[2]), text, partial: m[3] !== "" };
  m = /^(.+通)([一二三四五六七八九十]+)(の\d+)?$/.exec(text);
  if (m) return { town: m[1], chome: kanjiToNumber(m[2]), text, partial: Boolean(m[3]) };
  m = /^(.+?)[一二三四五六七八九十]+区$/.exec(text);
  if (m) return { town: m[1], chome: null, text, partial: true };
  return { town: text, chome: null, text, partial: false };
}

/** 学校区一覧のページから、行（町名の欄・小学校・中学校）を読む */
export function parseTsubamePage(html: string): { towns: string; elementary: string; juniorHigh: string }[] {
  const table = htmlTables(html).map(tableRows).find((t) => t.some((r) => r.join("|") === "町名(行政区)|小学校名|中学校名"));
  if (!table) throw new Error("学校区一覧の表（町名(行政区)・小学校名・中学校名）が見つかりません。ページの作りが変わった可能性があります");
  return table
    .filter((r) => r.length === 3 && r[0] !== "町名(行政区)")
    .map(([towns, elementary, juniorHigh]) => ({ towns, elementary: elementary.replace(/\s/g, ""), juniorHigh: juniorHigh.replace(/\s/g, "") }));
}

/** 表の行を、町・丁目ごとの行にする。同じ町・丁目が別の学校区にもあれば一部にする */
export function tsubameRules(rows: { towns: string; elementary: string; juniorHigh: string }[]) {
  const areas = rows.flatMap((r) =>
    r.towns
      .split(/[、,]/)
      .map((t) => t.trim())
      .filter(Boolean)
      .map((t) => ({ ...parseTsubameName(t), elementary: r.elementary, juniorHigh: r.juniorHigh })),
  );
  const key = (a: { town: string; chome: number | null }) => `${a.town}|${a.chome ?? ""}`;
  const schoolsOf = new Map<string, Set<string>>();
  for (const a of areas) schoolsOf.set(key(a), (schoolsOf.get(key(a)) ?? new Set()).add(`${a.elementary}|${a.juniorHigh}`));
  // 同じ町・丁目・学校の重なり（「地蔵堂本町二丁目1」「…2」はどちらも分水小）は1行にまとめる
  // 一部の行でも、町の候補の学校が1つなら物件の学区は決まる（lib/facts/school-zones.ts の resolveZone）
  const out: (TsubameArea & { elementary: string; juniorHigh: string; shared: boolean })[] = [];
  for (const a of areas) {
    const k = `${key(a)}|${a.elementary}|${a.juniorHigh}`;
    const shared = schoolsOf.get(key(a))!.size > 1;
    const prev = out.find((o) => `${key(o)}|${o.elementary}|${o.juniorHigh}` === k);
    if (prev) {
      prev.text = `${prev.text}、${a.text}`;
      continue;
    }
    out.push({ ...a, shared });
  }
  return out;
}

interface Prepared {
  html: string;
}

export const d42TsubameSchoolZones = defineJob<Prepared>({
  datasets: ["D42"],
  rawDir: "school-zones-tsubame",
  table: "school_zone_rules_all",
  options: [],

  async prepare({ raw, setAsOf }) {
    const html = new TextDecoder("utf-8").decode(await raw.download(TSUBAME_URL, "3364.html"));
    const updated = /更新日：(\d{4})年(\d{1,2})月(\d{1,2})日/.exec(htmlText(html));
    if (updated) setAsOf("D42", `${updated[1]}-${updated[2].padStart(2, "0")}-${updated[3].padStart(2, "0")}（市のページの更新日）`);
    return { html };
  },

  async load({ sql, prepared, log, check }) {
    const table = parseTsubamePage(prepared.html);
    const rules = tsubameRules(table);
    const rows = rules.map((r) => {
      const partial = r.partial || r.shared;
      const why = r.shared ? "同じ町名がほかの学校区にもある（行政区で分かれる）" : "行政区が町の一部";
      return {
        dataset_id: "D42",
        city_code: "15213",
        ward: null,
        town: r.town,
        chome: r.chome,
        town_text: r.text,
        lot_scope: partial ? "一部" : "全部",
        lot_text: partial ? `${why}：${r.text}` : "全部",
        lot_ranges: null,
        elementary_school: r.elementary,
        junior_high_school: r.juniorHigh,
        source_url: TSUBAME_URL,
      };
    });
    await insertRows(sql, "school_zone_rules_all", rows);
    const schools = new Set(table.map((r) => r.elementary));
    const shared = rows.filter((r) => r.lot_scope === "一部").length;
    log(`小学校${schools.size}校・${table.length}行から ${rows.length}行を入れました（町の一部・ほかの学校区と重なる行：${shared}）`);
    if (schools.size < 10) throw new Error(`小学校が${schools.size}校しかありません。ページの作りが変わった可能性があります`);
    check("小学校の数", schools.size);
    check("町の一部の行", shared);
  },
});
