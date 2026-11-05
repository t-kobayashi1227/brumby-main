// 競合の販売戦略（AIの見立て）を、この物件の事実シートに引用する形にする（2026-11-05 浩平さん依頼）
// 競合の答えの中の事実ID（その物件の事実シートの番号）は、この物件の事実IDと取り違えないよう、競合の事実シートで名前に直す
// lib/report.ts は build.ts を読むので、build.ts からは呼ばず collect.ts から呼ぶ

import { plainIds } from "../report";
import type { CompetitorView } from "./build";
import type { Fact } from "./types";

interface QuotedStrategy {
  summary?: { text?: unknown };
  appeals?: { rank?: unknown; text?: unknown }[];
  targets?: { rank?: unknown; name?: unknown }[];
}

/**
 * strategy：競合の strategy_runs.result の「戦略」。facts：その実行の事実シートの事実（無ければ空）
 * 総合評価の文が無いときは null（引用できない）
 */
export function quoteCompetitorView(strategy: unknown, facts: Fact[], createdOn: string, stale: boolean): CompetitorView | null {
  if (!strategy || typeof strategy !== "object") return null;
  const s = strategy as QuotedStrategy;
  const map = new Map(facts.map((f) => [f.id, f]));
  const plain = (t: unknown) => (typeof t === "string" ? plainIds(t, map) : "");
  const summary = plain(s.summary?.text);
  if (summary === "") return null;
  const byRank = <T extends { rank?: unknown }>(items: T[] | undefined) => [...(Array.isArray(items) ? items : [])].sort((a, b) => Number(a.rank ?? 0) - Number(b.rank ?? 0));
  const appeals = byRank(s.appeals)
    .map((a) => plain(a.text))
    .filter((t) => t !== "")
    .slice(0, 3);
  const first = byRank(s.targets)[0];
  return { summary, appeals, first_target: typeof first?.name === "string" ? first.name : null, created_on: createdOn, stale };
}
