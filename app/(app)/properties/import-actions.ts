"use server";

import { callModel } from "../../../lib/agents/llm";
import { MODEL } from "../../../lib/agents/cost";
import { readPrompt } from "../../../lib/agents/prompts";
import { IMPORT_MAX_CHARS, importSchema, toFormFields, type ImportResult } from "../../../lib/property-import";

// ①物件情報の入力：物件資料のテキストから入力欄の下書きを作る（docs/設計まとめ.md「物件資料からの自動入力」）
// AI は軽い方のモデル（AI_MODEL_LIGHT）。貼った資料は保存せず、ログにも出さない。ログに出すのはトークン数と費用だけ

export type ImportState = ({ ok: true } & ImportResult) | { ok: false; error: string };

export async function importFromText(text: string): Promise<ImportState> {
  const source = String(text ?? "").trim();
  if (source === "") return { ok: false, error: "物件資料のテキストを貼ってください" };
  if (source.length > IMPORT_MAX_CHARS) return { ok: false, error: `長すぎます（${IMPORT_MAX_CHARS.toLocaleString()}文字まで）。物件1件分の部分だけを貼ってください` };
  try {
    const r = await callModel(readPrompt("import.txt"), [{ role: "user", content: source }], importSchema, { model: MODEL, effort: "medium", maxTokens: 8000 });
    console.info(`[物件資料の読み取り] model=${MODEL} input=${r.usage.input_tokens} output=${r.usage.output_tokens} cache_read=${r.usage.cache_read_input_tokens ?? 0} cost_usd=${r.costUsd.toFixed(5)}`);
    if (!r.output) return { ok: false, error: `読み取れませんでした（${r.error ?? "理由不明"}）。もう一度お試しください` };
    return { ok: true, ...toFormFields(r.output, source) };
  } catch (e) {
    // 例外の中身に資料の文が入ることはないが、念のため種類だけを出す
    console.error(`[物件資料の読み取り] 失敗：${e instanceof Error ? e.name : "unknown"}`);
    return { ok: false, error: "読み取りに失敗しました。時間をおいてもう一度お試しください" };
  }
}
