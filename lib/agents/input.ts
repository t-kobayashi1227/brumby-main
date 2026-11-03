// AIに送る入力を組み立てる（2026-11-04 浩平さん了承「AIに渡す入力の精査案」）
// - 事実シート（DB）・画面・プログラムの点検は今までどおり全部の事実を使う。ここで変えるのは、AIに送る文字列だけ
// - 判断に効かない・読み違えやすい事実は送らない。担当が使わない事実はその担当に送らない。事実IDは振り直さない
// - 書き方は、列の見出しを1回だけ書く表にする（JSON のキーの繰り返しをなくす）。出典と時点は条件の言葉を含むので各行に残す
import type { Fact, FactCategory, FactSheet } from "../facts/types";

export type InputAgent = "戦略" | "媒体" | "確認";

/** どの担当にも送らない事実（項目名で選ぶ。番号は物件ごとに変わるため） */
const DROP_ALL: RegExp[] = [
  /^広告予算の総額$/, // 金額はプログラムが DB から計算する。答えのどこにも使わない
  /^(中学校|図書館|役所|歯科|薬局)（1km以内）$/, // 中学校は学区（S）で決まる。ほかは販売の判断に効かない
  /^(外科|眼科|耳鼻いんこう科|皮膚科)のある病院・診療所（1km以内）$/, // 残すのは内科・小児科・産婦人科・整形外科（浩平さん了承）
  /^65歳以上の世帯員のいる世帯の割合$/, // 65歳以上の割合（A）とほぼ同じ
  /^夫婦と子供から成る世帯の割合$/, // 大人の子と住む夫婦も入り、子育て向きと読み違えやすい
  /^(X|テレビ|雑誌)(の利用率|を情報源として重要と考える人の割合)（年代別）$/, // 選べる媒体に結び付かない
];

/** 戦略担当に送らない事実（媒体を選ぶための統計） */
const DROP_STRATEGY: RegExp[] = [/^物件を探した方法（/, /^(新聞|インターネット)を情報源として重要と考える人の割合（年代別）$/];

/** 媒体担当に送らない事実（ローンと買主の年代。媒体の選び方にも配分にも使わない） */
const DROP_MEDIA: RegExp[] = [/^月々の返済額（/, /^必要年収（/, /^必要年収以上の世帯の割合（/, /】の返済の目安（/, /^買主の年代（/];

/** 媒体担当に送る分類（P・B・C） */
const MEDIA_CATEGORIES: FactCategory[] = ["P", "B", "C"];

const categoryOf = (f: Fact) => f.id.split("-")[0] as FactCategory;
const matches = (f: Fact, rules: RegExp[]) => rules.some((r) => r.test(f.項目));

/**
 * 前提どおりの返済期間の返済額・必要年収・割合（月々の返済額（変動…・35年）など6行）は、
 * 同じ返済期間の「【候補】の返済の目安（返済期間35年）」の行と数字が同じなので、その行があれば送らない
 */
function duplicatedLoanRows(facts: Fact[]): Set<string> {
  const term = facts.map((f) => /^月々の返済額（.+・(\d+)年）$/.exec(f.項目)?.[1]).find(Boolean);
  if (!term || !facts.some((f) => f.項目.endsWith(`】の返済の目安（返済期間${term}年）`))) return new Set();
  return new Set(facts.filter((f) => /^(月々の返済額|必要年収|必要年収以上の世帯の割合)（/.test(f.項目)).map((f) => f.id));
}

/** 小学校（1km以内）は、学区が取れていれば送らない（通う学校は学区で決まる。学区外の学校を通学先と書く誤りの元） */
function elementaryCovered(facts: Fact[]): boolean {
  const zone = facts.find((f) => f.項目 === "小学校区");
  return !!zone && zone.状態 === "取得" && !!zone.値 && zone.値.includes("直線");
}

/** 担当ごとに送る事実を選ぶ。確認担当には、戦略担当と媒体担当に送った事実を全部送る（点検で照らし合わせるため） */
export function factsForAgent(sheet: FactSheet, agent: InputAgent): Fact[] {
  const facts = sheet.事実;
  const loanDup = duplicatedLoanRows(facts);
  const dropElementary = elementaryCovered(facts);
  const common = facts.filter((f) => !matches(f, DROP_ALL) && !loanDup.has(f.id) && !(dropElementary && f.項目 === "小学校（1km以内）"));
  const strategy = common.filter((f) => !matches(f, DROP_STRATEGY));
  const media = common.filter((f) => MEDIA_CATEGORIES.includes(categoryOf(f)) && !matches(f, DROP_MEDIA));
  if (agent === "戦略") return strategy;
  if (agent === "媒体") return media;
  const ids = new Set([...strategy, ...media].map((f) => f.id));
  return common.filter((f) => ids.has(f.id));
}

/** 値を、AIの答えに効く部分だけに短くする。読み取れない形なら元のまま */
export function shortValue(f: Fact): string | null {
  const v = f.値;
  if (v === null) return null;
  if (f.項目 === "所在地") {
    // 番地は答えに効かない。丁目まで（読み取れないときはそのまま）
    const m = /^(.*?[0-9０-９一二三四五六七八九十]+丁目)/.exec(v);
    return m ? m[1] : v;
  }
  if (/^近くの(公示地|基準地)（住宅地）$/.test(f.項目)) return v.replace(/、所在地：.*$/, "");
  if (f.項目 === "コンビニ（1km以内）") {
    // 一覧の名前は答えに効かない。件数と最寄り1件だけ（0件の書き方は変えない）
    const m = /^(\d+)件：([^、]+?)(、| ほか|$)/.exec(v);
    return m ? `${m[1]}件（最寄り：${m[2]}）` : v;
  }
  if (f.項目 === "バス停（1km以内）") {
    // 最寄りバス停は別の事実にある。件数だけ
    const m = /^(\d+)件：/.exec(v);
    return m ? `${m[1]}件` : v;
  }
  return v;
}

/** 表の1マス。区切りの「|」と改行は、表が崩れないように置き換える */
const cell = (s: string | null | undefined) => (s ?? "").replace(/\|/g, "／").replace(/\r?\n/g, " ");

/** 事実を表にする。列の見出しは1回だけ。状態が「取得」の行は空欄にする */
export function factTable(facts: Fact[]): string {
  const rows = facts.map((f) => [f.id, f.項目, shortValue(f), f.比較, f.出典, f.時点, f.状態 === "取得" ? "" : f.状態].map(cell).join("|"));
  return ["id|項目|値|比較|出典|時点|状態", ...rows].join("\n");
}

/** 戦略担当には、媒体一覧（C）を名前だけで渡す（媒体を選ぶのは媒体担当） */
function mediaNames(facts: Fact[]): string {
  return facts.map((f) => `${f.id} ${f.項目}`).join("、");
}

/** 戦略担当への入力 */
export function strategyInput(sheet: FactSheet): string {
  const facts = factsForAgent(sheet, "戦略");
  const c = facts.filter((f) => categoryOf(f) === "C");
  const rest = facts.filter((f) => categoryOf(f) !== "C");
  return [
    `距離の種類：${sheet.距離の種類}`,
    "",
    "事実：",
    factTable(rest),
    ...(c.length ? ["", `媒体一覧（名前だけ。媒体を選ぶのは媒体担当）：${mediaNames(c)}`] : []),
  ].join("\n");
}

/** 媒体担当への入力（事実と、戦略の答えのうち分析を除いた部分） */
export function mediaInput(sheet: FactSheet, main: unknown): string {
  return ["事実：", factTable(factsForAgent(sheet, "媒体")), "", "メインの答え（JSON）：", JSON.stringify(main)].join("\n");
}

/** 確認担当への入力（事実と、点検する文章） */
export function checkInput(sheet: FactSheet, texts: unknown): string {
  return [`距離の種類：${sheet.距離の種類}`, "", "事実：", factTable(factsForAgent(sheet, "確認")), "", "点検する文章（JSON）：", JSON.stringify(texts)].join("\n");
}
