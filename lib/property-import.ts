// ①物件情報の入力：物件資料のテキストから、入力欄の下書きを作る（docs/設計まとめ.md「物件資料からの自動入力」）
// AI は資料に書かれた文字を「書かれたまま」抜き出すだけ。数字に直す・単位を換算する・築年数を出すのは、このファイルのプログラムが行う
// AI が抜き出した文字が貼った資料に本当にあるかを確かめ、無いもの・読めないものは欄に入れない（AI が作った数字を入れない）
// 貼った資料は保存しない。中身をログに出さない

import { z } from "zod/v4";
import { FLOORS, parseLayout, PROPERTY_CLASSES, RENOVATION_PARTS, TRANSPORT_MODES } from "./property";

/** 貼れる文字数の上限。物件資料1件分には十分で、AI の費用が増えすぎないようにする */
export const IMPORT_MAX_CHARS = 20000;

// ---- AI の答えの形 ----

/** 資料に書かれたままの文字。書かれていなければ null */
const quote = z.string().nullable();

/** 選択肢で答える項目。evidence は選んだ根拠として資料から書かれたまま抜き出した文字 */
const choice = <T extends readonly [string, ...string[]]>(values: T) => z.object({ value: z.enum(values).nullable(), evidence: quote });

export const importSchema = z.object({
  property_class: choice(PROPERTY_CLASSES),
  price: quote.describe("価格。例：2,480万円"),
  address: quote.describe("所在地。番地まで書かれていればそこまで"),
  transports: z
    .array(
      z.object({
        mode: z.enum(TRANSPORT_MODES).nullable(),
        line: quote.describe("路線名。例：JR越後線、新潟交通バス"),
        stop_name: quote.describe("駅名またはバス停名。例：寺尾駅、寺尾小学校前"),
        walk: quote.describe("徒歩の分数を含む文字。例：徒歩8分"),
        evidence: quote.describe("この交通が書かれた部分"),
      }),
    )
    .describe("交通。資料に書かれた順に最大2つ"),
  layout: quote.describe("間取り。例：4LDK+S"),
  building_area: quote.describe("建物面積。単位まで。例：105.98㎡（32.05坪）"),
  land_area: quote.describe("土地面積。単位まで。例：165.30㎡"),
  parking: quote.describe("駐車台数を含む文字。例：駐車2台、カーポート1台"),
  built: quote.describe("築年月または築年数。例：2015年3月築、平成27年3月、築9年、新築"),
  floors: choice(FLOORS),
  garden: choice(["あり", "なし"] as const),
  renovation: z.object({
    value: z.enum(["あり", "なし"]).nullable(),
    evidence: quote,
    year: quote.describe("リフォームの年。例：2023年、令和5年"),
    parts: z.array(z.object({ part: z.enum(RENOVATION_PARTS), evidence: quote })),
  }),
  features: z.array(z.string()).describe("アピールポイント。資料に書かれたまま、1つずつ"),
});

export type ImportOutput = z.infer<typeof importSchema>;

// ---- 資料にあるかの確かめ ----

/** 比べるための形：全角半角をそろえ（NFKC）、空白と改行を除き、カンマ類をそろえる */
export function normalizeForMatch(text: string): string {
  return text
    .normalize("NFKC")
    .replace(/\s+/g, "")
    .replace(/[，、]/g, ",")
    .replace(/[‐‑‒–—―ー−－]/g, "-");
}

/** 抜き出した文字が、貼った資料にあるか */
function inSource(value: string | null | undefined, source: string): value is string {
  if (!value) return false;
  const v = normalizeForMatch(value);
  return v !== "" && source.includes(v);
}

// ---- 数字への直し方（プログラムで行う） ----

const num = (s: string) => Number(s.replace(/,/g, ""));

/** 価格を万円に直す。「2,480万円」→2480、「1億2,000万円」→12000、「24,800,000円」→2480。読めなければ null */
export function parsePriceManYen(raw: string): number | null {
  const t = raw.normalize("NFKC").replace(/\s/g, "");
  const oku = /(\d+(?:\.\d+)?)億(?:([\d,]+(?:\.\d+)?)万)?/.exec(t);
  if (oku) return num(oku[1]) * 10000 + (oku[2] ? num(oku[2]) : 0);
  const man = /([\d,]+(?:\.\d+)?)万/.exec(t);
  if (man) return num(man[1]);
  const yen = /([\d,]{5,})円/.exec(t);
  if (yen) return num(yen[1]) / 10000;
  return null;
}

/** 1坪 = 400/121 ㎡ */
const TSUBO_SQM = 400 / 121;

/** 面積を㎡に直す。㎡（m2・平米）があればそれを使い、坪だけなら換算して小数2桁に丸める */
export function parseAreaSqm(raw: string): number | null {
  const t = raw.normalize("NFKC").replace(/\s/g, "").replace(/,/g, "");
  const sqm = /(\d+(?:\.\d+)?)(?:m2|m²|㎡|平米|平方メートル|平方m)/i.exec(t);
  if (sqm) return Number(sqm[1]);
  const tsubo = /(\d+(?:\.\d+)?)坪/.exec(t);
  if (tsubo) return Math.round(Number(tsubo[1]) * TSUBO_SQM * 100) / 100;
  return null;
}

/** 徒歩の分数。「徒歩8分」「徒歩約8分」→8 */
export function parseWalkMin(raw: string): number | null {
  const t = raw.normalize("NFKC").replace(/\s/g, "");
  const m = /徒歩約?(\d+)分/.exec(t) ?? /(\d+)分/.exec(t);
  return m ? Number(m[1]) : null;
}

/** 駐車台数。「駐車2台」→2、「駐車場なし」→0 */
export function parseParking(raw: string): number | null {
  const t = raw.normalize("NFKC").replace(/\s/g, "");
  const m = /(\d+)台/.exec(t);
  if (m) return Number(m[1]);
  if (/(無し|なし|無)/.test(t)) return 0;
  return null;
}

const ERAS: Record<string, number> = { 令和: 2018, 平成: 1988, 昭和: 1925 };

/** 年（と月）を読む。西暦と和暦（令和・平成・昭和、元年を含む） */
export function parseYearMonth(raw: string): { year: number; month: number | null } | null {
  const t = raw.normalize("NFKC").replace(/\s/g, "");
  const era = /(令和|平成|昭和)(\d+|元)年(?:(\d{1,2})月)?/.exec(t);
  if (era) {
    const n = era[2] === "元" ? 1 : Number(era[2]);
    return { year: ERAS[era[1]] + n, month: era[3] ? Number(era[3]) : null };
  }
  const ad = /((?:19|20)\d{2})(?:年|\/|\.|-)(?:(\d{1,2})月?)?/.exec(t);
  if (ad) {
    const month = ad[2] ? Number(ad[2]) : null;
    return { year: Number(ad[1]), month: month !== null && month >= 1 && month <= 12 ? month : null };
  }
  return null;
}

/**
 * 築年数（満年数）。「新築」→0、「築9年」→9、築年月があれば today までの満年数（月が無ければ年の差）
 * 完成前（未来の年月）は 0
 */
export function parseBuildingAge(raw: string, today: Date): number | null {
  const t = raw.normalize("NFKC").replace(/\s/g, "");
  const direct = /築(\d+)年(?!\d|月)/.exec(t);
  if (direct && !/築(19|20)\d{2}年/.test(t)) return Number(direct[1]);
  const ym = parseYearMonth(t);
  if (ym) {
    const y = today.getFullYear();
    const m = today.getMonth() + 1;
    const months = (y - ym.year) * 12 + (ym.month !== null ? m - ym.month : 0);
    return Math.max(0, Math.floor(months / 12));
  }
  if (/新築|未入居|完成予定/.test(t)) return 0;
  return null;
}

// ---- 入力欄の下書きにする ----

export interface ImportResult {
  /** 入力欄の name → 入れる値 */
  fields: Record<string, string>;
  /** リフォームの箇所（チェックボックス） */
  renovationParts: string[];
  /** 入れた項目の名前（画面の案内用） */
  filled: string[];
  /** 資料から読み取れなかった・確かめられなかった項目の名前 */
  missing: string[];
}

const fmt = (n: number) => String(Math.round(n * 100) / 100);

/** AI の答えを、資料にあるかを確かめてから、入力欄の値に直す */
export function toFormFields(output: ImportOutput, sourceText: string, today: Date = new Date()): ImportResult {
  const source = normalizeForMatch(sourceText);
  const fields: Record<string, string> = {};
  const filled: string[] = [];
  const missing: string[] = [];
  const put = (label: string, entries: Record<string, string> | null) => {
    if (entries) {
      Object.assign(fields, entries);
      filled.push(label);
    } else missing.push(label);
  };
  /** 資料にある文字を読んで数字にする。読めない・範囲外なら null */
  const read = (raw: string | null, parse: (s: string) => number | null, ok: (n: number) => boolean): number | null => {
    if (!inSource(raw, source)) return null;
    const n = parse(raw);
    return n !== null && Number.isFinite(n) && ok(n) ? n : null;
  };
  const chosen = <T extends string>(c: { value: T | null; evidence: string | null }): T | null => (c.value !== null && inSource(c.evidence, source) ? c.value : null);

  const cls = chosen(output.property_class);
  put("物件区分", cls ? { property_class: cls } : null);

  const price = read(output.price, parsePriceManYen, (n) => n > 0 && Number.isInteger(n));
  put("価格", price !== null ? { price_man_yen: fmt(price) } : null);

  put("住所", inSource(output.address, source) ? { address: output.address.trim() } : null);

  // 交通：種類・駅（バス停）・徒歩分がそろって確かめられたものだけ、上から最大2つ
  let position = 0;
  for (const t of output.transports) {
    if (position >= 2) break;
    if (!t.mode || !inSource(t.evidence, source) || !inSource(t.stop_name, source)) continue;
    const walk = read(t.walk, parseWalkMin, (n) => Number.isInteger(n) && n >= 0);
    if (walk === null) continue;
    position++;
    const p = `t${position}_`;
    fields[`${p}mode`] = t.mode;
    fields[`${p}stop_name`] = t.stop_name.trim();
    fields[`${p}walk_min`] = String(walk);
    if (inSource(t.line, source)) fields[`${p}line`] = t.line.trim();
  }
  if (position > 0) filled.push("交通");
  else missing.push("交通");

  const layoutOk = inSource(output.layout, source) && parseLayout(output.layout) !== null;
  put("間取り", layoutOk ? { layout: output.layout!.normalize("NFKC").replace(/\s/g, "").toUpperCase() } : null);

  const building = read(output.building_area, parseAreaSqm, (n) => n > 0);
  put("建物面積", building !== null ? { building_sqm: fmt(building) } : null);

  const land = read(output.land_area, parseAreaSqm, (n) => n > 0);
  put("土地面積", land !== null ? { land_sqm: fmt(land) } : null);

  const parking = read(output.parking, parseParking, (n) => Number.isInteger(n) && n >= 0);
  put("駐車台数", parking !== null ? { parking: String(parking) } : null);

  const age = read(output.built, (s) => parseBuildingAge(s, today), (n) => Number.isInteger(n) && n >= 0 && n < 150);
  put("築年数", age !== null ? { building_age: String(age) } : null);

  const floors = chosen(output.floors);
  put("階数", floors ? { floors } : null);

  const garden = chosen(output.garden);
  put("庭", garden ? { has_garden: garden } : null);

  // リフォーム：「あり」は年と箇所まで確かめられたときだけ入れる（保存のときに年と箇所が必須のため）
  const renovationParts: string[] = [];
  const reno = chosen(output.renovation);
  if (reno === "なし") put("リフォーム", { renovated: "なし" });
  else if (reno === "あり") {
    const year = read(output.renovation.year, (s) => parseYearMonth(s)?.year ?? null, (n) => n >= 1950 && n <= today.getFullYear() + 1);
    for (const p of output.renovation.parts) if (inSource(p.evidence, source) && !renovationParts.includes(p.part)) renovationParts.push(p.part);
    put("リフォーム", { renovated: "あり", ...(year !== null ? { renovation_year: String(year) } : {}) });
    if (year === null) missing.push("リフォームの年");
    if (renovationParts.length === 0) missing.push("リフォームの箇所");
  } else missing.push("リフォーム");

  // 特徴ピックアップ：資料に書かれたままのものだけをつなぐ
  const features = output.features.map((f) => f.trim()).filter((f, i, all) => f !== "" && all.indexOf(f) === i && inSource(f, source));
  if (features.length > 0) {
    fields.features = features.join("、");
    filled.push("特徴ピックアップ");
  }

  return { fields, renovationParts, filled, missing };
}
