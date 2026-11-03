// ⑤レポート画面の組み立て（docs/設計まとめ.md「根拠と出典」）。表示だけを行い、AI は動かさない

import type { MediaOutput, StrategyOutput } from "./agents/schemas";
import { sourceOf, type DatasetInfo } from "./facts/build";
import { FACT_CATEGORIES, type Fact, type FactCategory } from "./facts/types";

/** 地図・ライブラリなど、事実とは別に常に出すクレジット */
export const FIXED_CREDITS = ["地図：国土地理院 淡色地図（地理院タイル）", "住所検索：国土地理院 地理院地図の住所検索"];

/** 画面に出す文に付いた事実ID（重なりなし）。根拠データタブの「使用箇所」と同じ集め方（factUsage）にそろえる。画面に出さない合わない層は含めない */
export function usedFactIds(main: StrategyOutput, media: MediaOutput): string[] {
  return [...factUsage(main, media).keys()];
}

/** 根拠の1件の書き方：「0〜14歳の割合 15.8%（西区 11.9%）」。取れなかった事実は「不明」 */
export function evidenceText(f: Fact): string {
  return `${f.項目} ${f.値 ?? "不明"}${f.比較 ? `（${f.比較}）` : ""}`;
}

export interface SourceRow {
  出典: string;
  時点: string;
}

/**
 * 出典の一覧：使った事実の出典と時点（重なりなし）と、そのデータの決まったクレジット文言
 * クレジットは datasets.attribution。事実の出典にそのデータの出典の文言（sourceOf）が入っていれば、使ったデータとみなす
 */
export function sourceList(facts: Fact[], usedIds: string[], datasets: (DatasetInfo & { attribution: string | null })[]): { rows: SourceRow[]; credits: string[] } {
  const used = facts.filter((f) => usedIds.includes(f.id));
  const seen = new Set<string>();
  const rows: SourceRow[] = [];
  for (const f of used) {
    const key = `${f.出典}|${f.時点}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({ 出典: f.出典, 時点: f.時点 });
  }
  const credits = datasets
    .filter((d) => d.attribution && used.some((f) => f.出典.includes(sourceOf(d))))
    .map((d) => d.attribution as string);
  return { rows, credits: [...new Set(credits)] };
}

// ---- 6タブ（2026-11-03 浩平さんの変更仕様「BRUMBY_販売戦略結果画面_UIUX変更点」） ----
// AIの答えの形は変えず、保存した答えと事実シートを、表示の段階でタブに振り分ける（AIの呼び出しは増やさない）

export const REPORT_TABS = [
  { key: "summary", label: "サマリー" },
  { key: "target", label: "ターゲット・訴求" },
  { key: "sales", label: "販売施策" },
  { key: "price", label: "価格分析" },
  { key: "area", label: "エリア分析" },
  { key: "evidence", label: "根拠データ" },
] as const;
export type ReportTab = (typeof REPORT_TABS)[number]["key"];
export const TAB_LABEL = Object.fromEntries(REPORT_TABS.map((t) => [t.key, t.label])) as Record<ReportTab, string>;

/** エリア分析タブの4枚のカード */
export type AreaCard = "people" | "living" | "land" | "property";
export const AREA_CARDS: { key: AreaCard; title: string; categories: FactCategory[] }[] = [
  { key: "people", title: "人口・世帯", categories: ["A"] },
  { key: "living", title: "交通・生活", categories: ["S", "L", "T"] },
  { key: "land", title: "土地・災害", categories: ["R", "H"] },
  { key: "property", title: "物件の競争力", categories: ["P"] },
];

/** 事実IDの英字（P-01 → P）。分類にない英字は null */
export function categoryOf(id: string): FactCategory | null {
  const c = id.trim().split("-")[0];
  return c in FACT_CATEGORIES ? (c as FactCategory) : null;
}

type Analysis = StrategyOutput["analysis"][number];

/**
 * AIの分析1件をどこに出すか。プログラムで決める（AIに振り分けさせない）
 * 価格 → 価格分析タブ、組み合わせ → ターゲット・訴求タブ（顧客への伝え方）、それ以外はエリア分析のカード
 * エリアのカードは、災害・規制の事実を根拠にしていれば「土地・災害」、それ以外は topic で決める
 */
export function placeOfAnalysis(a: Analysis): { tab: "price" | "target" } | { tab: "area"; card: AreaCard } {
  if (a.topic === "価格") return { tab: "price" };
  if (a.topic === "組み合わせ") return { tab: "target" };
  const cats = a.evidence.map(categoryOf);
  if (cats.includes("H") || cats.includes("R")) return { tab: "area", card: "land" };
  if (a.topic === "立地") return { tab: "area", card: "living" };
  if (a.topic === "買い手") return { tab: "area", card: "people" };
  if (a.topic === "物件") return { tab: "area", card: "property" };
  // その他：根拠の最初の分類で決める
  const first = cats.find((c) => c !== null);
  if (first === "A" || first === "B") return { tab: "area", card: "people" };
  if (first === "S" || first === "L" || first === "T") return { tab: "area", card: "living" };
  return { tab: "area", card: "property" };
}

/** 事実を引いているAIの文1つ */
export interface FactUse {
  tab: ReportTab;
  /** どこの文か（例：第1ターゲット、訴求1） */
  where: string;
  text: string;
}

/**
 * 事実IDごとに、その事実を根拠にしている画面上の文（根拠データタブの「使用箇所」）
 * 画面に出さない合わない層（not_fit）は数えない
 */
export function factUsage(main: StrategyOutput, media: MediaOutput, mediaName: (id: string, fallback: string) => string = (_, f) => f): Map<string, FactUse[]> {
  const out = new Map<string, FactUse[]>();
  const add = (evidence: string[], use: FactUse) => {
    for (const id of new Set(evidence.map((e) => e.trim()).filter(Boolean))) {
      const list = out.get(id) ?? [];
      list.push(use);
      out.set(id, list);
    }
  };
  add(main.summary.evidence, { tab: "summary", where: "推奨方針（総合評価）", text: main.summary.text });
  main.concerns.forEach((c, i) => add(c.evidence, { tab: "summary", where: `懸念点${i + 1}`, text: c.text }));
  [...main.targets].sort((a, b) => a.rank - b.rank).forEach((t) => add(t.evidence, { tab: "target", where: `第${t.rank}候補 ${t.name}`, text: t.reason }));
  [...main.appeals].sort((a, b) => a.rank - b.rank).slice(0, 3).forEach((a, i) => add(a.evidence, { tab: "target", where: `訴求${i + 1}`, text: a.text }));
  add(main.direction.evidence, { tab: "sales", where: "販売の方向性", text: main.direction.text });
  media.media.forEach((m) => add(m.evidence, { tab: "sales", where: `媒体 ${mediaName(m.id, m.name)}`, text: m.reason }));
  media.cautions.forEach((c, i) => add(c.evidence, { tab: "sales", where: `媒体の注意点${i + 1}`, text: c.text }));
  add(main.price_view.evidence, { tab: "price", where: "価格の見方", text: main.price_view.text });
  for (const a of main.analysis) {
    const place = placeOfAnalysis(a);
    const where = place.tab === "area" ? `分析（${AREA_CARDS.find((c) => c.key === place.card)!.title}）` : `分析（${a.topic}）`;
    add(a.evidence, { tab: place.tab, where, text: a.meaning });
  }
  return out;
}

// ---- 見せ方の補助（2026-11-03 第2版：数字とアイコンで見せる、取得状態と出どころを分ける） ----

/** 事実の出どころ。「取得」は値を取れたことで、内容を人が確かめたことではないため、状態とは別に出す */
export type FactOrigin = "入力" | "公的・調査データ" | "地図データ（OSM）" | "システム計算" | "設定値";
/** 相場（M）のうち、公示地・基準地の値をそのまま出す事実（計算していない） */
const RAW_LAND_PRICE = /^近くの(公示地|基準地)/;
export function factOrigin(f: Fact): FactOrigin {
  if (f.出典.startsWith("入力")) return "入力";
  if (f.出典.includes("計算") || (categoryOf(f.id) === "M" && !RAW_LAND_PRICE.test(f.項目))) return "システム計算";
  if (f.出典.includes("一覧（")) return "設定値";
  if (f.出典.includes("OpenStreetMap")) return "地図データ（OSM）";
  return "公的・調査データ";
}

/**
 * 項目の短い名前。末尾の（…）は、見分けに要るものだけ短くして残す
 * 「洪水の想定浸水深（想定最大規模）」→「洪水の想定浸水深」
 * 「月々の返済額（変動0.9%・35年）」→「月々の返済額（変動0.9%）」（変動と固定を見分ける）
 * 「延床の坪単価（広さの近い取引の相場と比べる：…）」→「延床の坪単価（広さの近い取引）」
 * 「交通1（物件資料の徒歩分）」はそのまま（直線距離ではないことを示す）
 */
export function shortLabel(項目: string): string {
  const named = 項目.replace(/^【(.+?)】/, "$1 ");
  const m = named.match(/^(.*?)（([^（）]*)）$/);
  if (!m) return named;
  const [, head, inner] = m;
  if (!head) return named;
  if (inner.includes("物件資料")) return named;
  if (/^(変動|固定)/.test(inner) || /^[^、・]*(変動|固定)/.test(inner)) return `${head}（${inner.split(/[、・]/)[0]}）`;
  if (inner.startsWith("広さの近い取引")) return `${head}（広さの近い取引）`;
  return head;
}

/** 「代表年齢35歳。変動0.9%：…」の頭の年齢を外す（返済の目安の主は年齢ではなく返済のため） */
const AGE_HEAD = /^(代表年齢[^。]*)。([\s\S]+)$/;

/** チップに出す値：（…）の補足を外し、返済の目安は年齢を外す。長さは画面（CSS）で切る */
export function compactValue(値: string | null): string {
  if (値 === null) return "不明";
  const age = 値.match(AGE_HEAD);
  const v = age ? age[2] : 値;
  return v.replace(/（[^（）]*）/g, "").replace(/\s+/g, " ").trim() || v;
}

/**
 * 値を、大きく出す部分（main）と補足（sub）に分ける。表示だけに使い、値そのものは変えない
 * 「3件：A 直線240m、B 直線400m」→ main「3件」sub「A 直線240m、B 直線400m」
 * 「候補：A小学校、B小学校」→ main「候補2件」sub「A小学校、B小学校」（1つ目を答えのように見せない）
 * 「新潟駅（信越本線・白新線） 直線2.4km」→ main「新潟駅 直線2.4km」sub「（信越本線・白新線）」（距離を落とさない）
 * 並びの値（「A、B」）は main に1つ目、sub に残りを出す。タイルは sub も見せる
 */
export function splitValue(値: string | null): { main: string; sub: string | null } {
  if (値 === null) return { main: "不明", sub: null };
  const count = 値.match(/^(\d+件)[：。]([\s\S]*)$/);
  if (count) {
    const rest = count[2].trim();
    return { main: count[1], sub: rest ? rest : null };
  }
  const cand = 値.match(/^候補：([\s\S]+)$/);
  if (cand) return { main: `候補${cand[1].split("、").length}件`, sub: cand[1] };
  const age = 値.match(AGE_HEAD);
  const body = age ? age[2] : 値;
  const head = compactValue(body).split(/[。、]/)[0].trim();
  const main = head.length > 24 ? `${head.slice(0, 22)}…` : head;
  let sub: string | null;
  if (body.startsWith(head)) sub = body.slice(head.length).replace(/^[、。\s]+/, "").trim() || null;
  else sub = (body.match(/（[^（）]*）/g) ?? []).join("") || null;
  if (age) sub = [age[1], sub].filter(Boolean).join("。");
  return { main, sub };
}

/** ターゲットの根拠を観点で分ける（事実の分類と項目で機械的に分ける。AIの答えの形は変えない） */
const AFFORD = /^(月々の返済額|必要年収|【.+】の返済の目安)/;
export const TARGET_ASPECTS: { key: string; title: string; test: (id: string, f: Fact | undefined) => boolean }[] = [
  { key: "area", title: "地域の特性", test: (id) => ["A", "S", "L", "T", "H", "R"].includes(categoryOf(id) ?? "") },
  { key: "fit", title: "物件との合い方", test: (id) => ["P", "M", "K"].includes(categoryOf(id) ?? "") },
  { key: "afford", title: "買える見込み", test: (id, f) => categoryOf(id) === "B" && !!f && AFFORD.test(f.項目) },
];
/** 3つの観点（根拠が無くても出す）と、どれにも当たらない根拠（「買い手の傾向」「その他」。あるときだけ） */
export function groupByAspect(evidence: string[], facts: Map<string, Fact>): { key: string; title: string; ids: string[]; optional: boolean }[] {
  const ids = [...new Set(evidence.map((e) => e.trim()).filter(Boolean))];
  const groups = TARGET_ASPECTS.map((a) => ({ key: a.key, title: a.title, ids: ids.filter((id) => a.test(id, facts.get(id))), optional: false }));
  const placed = new Set(groups.flatMap((g) => g.ids));
  const rest = ids.filter((id) => !placed.has(id));
  const buyer = rest.filter((id) => categoryOf(id) === "B");
  const other = rest.filter((id) => categoryOf(id) !== "B");
  if (buyer.length) groups.push({ key: "buyer", title: "買い手の傾向", ids: buyer, optional: true });
  if (other.length) groups.push({ key: "other", title: "その他", ids: other, optional: true });
  return groups;
}

/** 取得できず・要確認の事実ごとの、次に確かめること（決まった文。AIは使わない） */
export function nextCheck(f: Fact): { who: string; what: string } {
  const c = categoryOf(f.id);
  const name = shortLabel(f.項目);
  if (factOrigin(f) === "入力" || c === "P" || c === "K") return { who: "売主・物件資料", what: `${name}を確認し、物件情報に入力する` };
  if (c === "H" || c === "R") return { who: "ハザードマップ・都市計画図", what: `物件の位置で${name}を確かめる` };
  if (c === "S") return { who: "市の通学区域", what: `住所から${name}を確かめる` };
  if (f.状態 === "要確認" && /^データは.+時点/.test(f.比較 ?? "")) return { who: "市の一覧・現地", what: `${name}が今もあるかを、最新の一覧か現地で確かめる` };
  if (f.状態 === "要確認") return { who: "元の資料", what: `${name}は値に確かめる点があるので、元の資料で確かめる` };
  if (c === "M") return { who: "取引事例・査定資料", what: `${name}は公的データで出せなかったので、近い条件の取引を確かめる` };
  if (c === "L" || c === "T") return { who: "地図・現地", what: `${name}を地図か現地で確かめる` };
  return { who: "資料", what: `${name}は公的データで取れなかったので、必要なら資料で確かめる` };
}

/** 「物件68.8万円/坪」「…の中央値 52.1万円/坪（41件）」から坪単価（万円）を読む。読めなければ null */
export function unitPriceOf(text: string | null | undefined): number | null {
  const m = text?.match(/([\d,]+(?:\.\d+)?)万円\/坪/);
  return m ? Number(m[1].replace(/,/g, "")) : null;
}
