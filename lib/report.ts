// ⑤レポート画面の組み立て（docs/設計まとめ.md「根拠と出典」）。表示だけを行い、AI は動かさない

import type { MainOutput, MediaOutput, StrategyOutput } from "./agents/schemas";
import { sourceOf, type DatasetInfo } from "./facts/build";
import { FACT_CATEGORIES, type Fact, type FactCategory } from "./facts/types";

/** 地図・ライブラリなど、事実とは別に常に出すクレジット */
export const FIXED_CREDITS = ["地図：国土地理院 淡色地図（地理院タイル）", "住所検索：国土地理院 地理院地図の住所検索"];

/** 画面に出す戦略と媒体の文に付いた事実ID（出た順、重なりなし） */
export function usedFactIds(main: MainOutput, media: MediaOutput): string[] {
  const all = [
    main.summary,
    ...main.targets,
    ...main.not_fit,
    ...main.appeals,
    main.price_view,
    ...main.concerns,
    main.direction,
    ...media.media,
    ...media.cautions,
  ].flatMap((s) => s.evidence);
  return [...new Set(all.map((id) => id.trim()).filter(Boolean))];
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
