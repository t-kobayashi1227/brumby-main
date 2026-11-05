// 販売施策タブの「競合と比べたおすすめポイントと懸念点」で、事実シートの競合（K）を競合ごとの列にする（2026-11-05 浩平さん依頼）
// 値はシステムが作った事実の文字（lib/facts/build.ts の competitorFacts）を読み分けるだけ。新しい数字は作らない

import type { Fact } from "./facts/types";
import { formatManYen, formatSqm } from "./facts/format";
import type { ImageKind } from "./property-images";

/** 競合の物件ID → その物件の番号（販売戦略へのリンク）と、添付されている画像の枠（並びは IMAGE_KINDS の順）。消えた物件は無い */
export interface CompetitorLink {
  id: number;
  images: ImageKind[];
}

export interface CompetitorRow {
  label: string;
  value: string;
  /** この物件との差を言葉にしたもの（例：この物件が100万円高い）。差が無い項目は null */
  diff: string | null;
}

export interface CompetitorColumn {
  /** 競合の番号（競合1・2。上限を2件にする前の戦略では3もある） */
  n: number;
  /** 「物件情報」の事実ID。AIの答えの competitors[].fact_id と結び付ける */
  infoId: string;
  code: string | null;
  area: string | null;
  /** 直線距離（例：直線650m）。取れなかったときは「取得できず」 */
  distance: string | null;
  rows: CompetitorRow[];
  info: Fact;
  features: Fact | null;
  view: CompetitorViewSummary | null;
}

export interface CompetitorViewSummary {
  fact: Fact;
  firstTarget: string | null;
  /** 総合評価の最初の1文 */
  summary: string | null;
  /** 戦略を作った日（YYYY-MM-DD） */
  createdOn: string | null;
  /** 戦略を作ったあとに物件情報が直されている（状態が要確認） */
  stale: boolean;
}

/** 「項目：値、項目：値」を読み分ける */
export function parsePairs(text: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const part of text.split("、")) {
    const i = part.indexOf("：");
    if (i > 0) out.set(part.slice(0, i).trim(), part.slice(i + 1).trim());
  }
  return out;
}

/** 比較の列「この物件との差（この物件−競合）：価格 +100万円、建物面積 -5.5㎡」→ 項目ごとの差（数と単位） */
export function parseDiffs(text: string | undefined): Map<string, { n: number; unit: string }> {
  const out = new Map<string, { n: number; unit: string }>();
  if (!text) return out;
  const body = text.slice(text.indexOf("：") + 1);
  for (const part of body.split("、")) {
    const m = /^(\S+)\s+([+\-−]?[\d,]+(?:\.\d+)?)(\S*)$/.exec(part.trim());
    if (m) out.set(m[1], { n: Number(m[2].replace(/,/g, "").replace("−", "-")), unit: m[3] });
  }
  return out;
}

const fmt = (n: number) => (Number.isInteger(n) ? n.toLocaleString("ja-JP") : n.toLocaleString("ja-JP", { maximumFractionDigits: 1 }));

/** 差（この物件−競合）を、この物件から見た言葉にする */
export function diffPhrase(label: string, d: { n: number; unit: string } | undefined): string | null {
  if (!d) return null;
  const abs = `${fmt(Math.abs(d.n))}${d.unit}`;
  if (label === "価格") return d.n === 0 ? "この物件と同じ価格" : `この物件が${abs}${d.n > 0 ? "高い" : "安い"}`;
  if (label === "建物面積" || label === "土地面積") return d.n === 0 ? "この物件と同じ広さ" : `この物件が${abs}${d.n > 0 ? "広い" : "狭い"}`;
  if (label === "築年数") return d.n === 0 ? "この物件と同じ築年数" : `この物件が${abs}${d.n > 0 ? "古い" : "新しい"}`;
  return null;
}

/** 文章の最初の1文（「。」まで） */
export function firstSentence(text: string): string {
  const i = text.indexOf("。");
  return i < 0 ? text : text.slice(0, i + 1);
}

/** 競合の「AIの見立て」の値（まとめ：…　訴求：…　第1ターゲット：…）を読み分ける */
export function parseView(f: Fact): CompetitorViewSummary {
  const parts = (f.値 ?? "").split("　");
  const get = (key: string) => parts.find((p) => p.startsWith(`${key}：`))?.slice(key.length + 1) ?? null;
  const summary = get("まとめ");
  return {
    fact: f,
    firstTarget: get("第1ターゲット"),
    summary: summary ? firstSentence(summary) : null,
    createdOn: /(\d{4}-\d{2}-\d{2})作成/.exec(f.出典)?.[1] ?? null,
    stale: f.状態 === "要確認",
  };
}

const ROW_LABELS = ["区分", "価格", "間取り", "建物面積", "土地面積", "築年数"] as const;

/** 事実シートの競合（「競合N：物件情報」「競合N：特徴」「競合N：AIの見立て」）を、競合ごとの列にする。番号の順 */
export function competitorColumns(facts: Fact[]): CompetitorColumn[] {
  const of = (n: number, kind: string) => facts.find((f) => f.id.startsWith("K-") && f.項目 === `競合${n}：${kind}`) ?? null;
  const cols: CompetitorColumn[] = [];
  for (const info of facts.filter((f) => f.id.startsWith("K-") && /^競合\d+：物件情報$/.test(f.項目))) {
    const n = Number(/^競合(\d+)/.exec(info.項目)![1]);
    const pairs = parsePairs(info.値 ?? "");
    const diffs = parseDiffs(info.比較);
    const view = of(n, "AIの見立て");
    cols.push({
      n,
      infoId: info.id,
      code: pairs.get("物件ID") ?? null,
      area: pairs.get("所在地") ?? null,
      distance: pairs.get("この物件からの距離") ?? null,
      rows: ROW_LABELS.filter((l) => pairs.has(l)).map((label) => ({ label, value: pairs.get(label)!, diff: diffPhrase(label, diffs.get(label)) })),
      info,
      features: of(n, "特徴"),
      view: view && view.値 ? parseView(view) : null,
    });
  }
  return cols.sort((a, b) => a.n - b.n);
}

/** 比べる3列の1列目に出す、この物件（2026-11-05 浩平さん指示）。値はいまの登録で、見立てはこの画面の販売戦略 */
export interface SelfColumn {
  code: string;
  area: string;
  rows: CompetitorRow[];
  features: string | null;
  firstTarget: string | null;
  /** 総合評価の最初の1文（事実IDを外したもの） */
  summary: string | null;
  createdOn: string | null;
  /** 戦略を作ったあとに物件情報が直されている */
  stale: boolean;
}

/** 画面に渡す形：この物件の番号と、添付されている画像の枠 */
export type SelfColumnView = SelfColumn & CompetitorLink;

export interface SelfColumnInput {
  code: string;
  area: string;
  property_class: string;
  price_man_yen: number;
  layout: string;
  building_sqm: number;
  land_sqm: number;
  building_age: number;
  features: string | null;
  /** lib/facts/competitor-quote.ts の quoteCompetitorView でこの物件の戦略から作ったもの */
  view: { summary: string; first_target: string | null; created_on: string; stale: boolean } | null;
}

/** この物件の列。並びと書き方は競合の列（lib/facts/build.ts の competitorFacts）にそろえる */
export function selfColumn(p: SelfColumnInput): SelfColumn {
  const rows: CompetitorRow[] = [
    { label: "区分", value: p.property_class, diff: null },
    { label: "価格", value: formatManYen(p.price_man_yen * 10_000), diff: null },
    { label: "間取り", value: p.layout, diff: null },
    { label: "建物面積", value: formatSqm(p.building_sqm), diff: null },
    { label: "土地面積", value: formatSqm(p.land_sqm), diff: null },
    { label: "築年数", value: p.building_age === 0 ? "新築" : `築${p.building_age}年`, diff: null },
  ];
  const features = p.features?.trim() ? p.features.trim() : null;
  return {
    code: p.code,
    area: p.area,
    rows,
    features,
    firstTarget: p.view?.first_target ?? null,
    summary: p.view ? firstSentence(p.view.summary) : null,
    createdOn: p.view?.created_on ?? null,
    stale: p.view?.stale ?? false,
  };
}
