// 戦略の答えのうち「この物件でいちばん大事なこと」を取り出す（2026-11-05）。画面でも使うので zod を読まない（型だけ）
import type { SalesFocus, StrategyOutput } from "./schemas";

/** 2026-11-05 より前の答えには無いので null */
export function salesFocusOf(strategy: StrategyOutput): SalesFocus | null {
  return (strategy as Partial<StrategyOutput>).sales_focus ?? null;
}

/** 第1ターゲットを第2より上にした理由（rank 1 の vs_next）。以前の答えや空のときは null */
export function vsNextOf(target: StrategyOutput["targets"][number]): string | null {
  const v = (target as Partial<typeof target>).vs_next;
  return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
}
