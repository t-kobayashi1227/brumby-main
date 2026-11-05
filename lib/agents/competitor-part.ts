// 戦略の答えのうち、競合と比べた部分を取り出す（2026-11-05）。画面でも使うので zod を読まない（型だけ）
import type { StrategyOutput } from "./schemas";

/**
 * 競合と比べた部分（2026-11-05 より前の答えには無い）。キーが無い答えは null
 * 戦略担当にだけ書かせ、媒体担当には渡さない（mainPart で落ちる）
 */
export function competitorPart(strategy: StrategyOutput): Pick<StrategyOutput, "competitor_edge" | "competitor_concerns" | "competitors"> | null {
  const s = strategy as Partial<StrategyOutput>;
  if (s.competitor_edge === undefined || s.competitor_concerns === undefined || s.competitors === undefined) return null;
  return { competitor_edge: s.competitor_edge, competitor_concerns: s.competitor_concerns, competitors: s.competitors };
}
