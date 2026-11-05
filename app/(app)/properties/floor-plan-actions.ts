"use server";

import { callModel } from "../../../lib/agents/llm";
import { STRATEGY_MODEL } from "../../../lib/agents/cost";
import { readPrompt } from "../../../lib/agents/prompts";
import { floorPlanSchema, readFloorPlanImage, toFloorPlanNotes } from "../../../lib/floor-plan";

// ①物件情報の入力：間取り図の読み取り（docs/設計まとめ.md「間取り図の読み取り」）
// AI が画像を見るのはここの1回だけ。戦略・媒体・確認の各AIには画像を送らず、担当者が確かめて保存した文を事実として渡す
// 間取り図の細かい文字を読むため、高性能の方のモデル（AI_MODEL_HIGH）を使う
// ここでは保存しない。画像は保存せず、ログにも出さない。ログに出すのはトークン数と費用だけ

export type FloorPlanState = { ok: true; notes: string } | { ok: false; error: string };

export async function readFloorPlan(formData: FormData): Promise<FloorPlanState> {
  const image = await readFloorPlanImage(formData);
  if ("error" in image) return { ok: false, error: image.error };
  try {
    const r = await callModel(readPrompt("floor-plan.txt"), [{ role: "user", content: "この間取り図の特徴を書き出してください。" }], floorPlanSchema, {
      model: STRATEGY_MODEL,
      effort: "medium",
      maxTokens: 8000,
      images: [image],
    });
    console.info(
      `[間取り図の読み取り] model=${STRATEGY_MODEL} input=${r.usage.input_tokens} output=${r.usage.output_tokens} cache_read=${r.usage.cache_read_input_tokens ?? 0} cost_usd=${r.costUsd.toFixed(5)}`,
    );
    if (!r.output) return { ok: false, error: `読み取れませんでした（${r.error ?? "理由不明"}）。もう一度お試しください` };
    if (!r.output.readable) return { ok: false, error: `間取り図として読み取れませんでした${r.output.reason ? `（${r.output.reason}）` : ""}` };
    const notes = toFloorPlanNotes(r.output);
    if (notes === "") return { ok: false, error: "間取り図から書き出せる特徴がありませんでした" };
    return { ok: true, notes };
  } catch (e) {
    console.error(`[間取り図の読み取り] 失敗：${e instanceof Error ? e.name : "unknown"}`);
    return { ok: false, error: "読み取りに失敗しました。時間をおいてもう一度お試しください" };
  }
}
