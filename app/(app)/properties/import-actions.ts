"use server";

import { callModel } from "../../../lib/agents/llm";
import { MODEL } from "../../../lib/agents/cost";
import { readPrompt } from "../../../lib/agents/prompts";
import { importSchema, toFormFields, type ImportResult } from "../../../lib/property-import";
import { readImportSource, toSourceText } from "../../../lib/property-import-source";

// ①物件情報の入力：AI入力アシスト（docs/設計まとめ.md「物件資料からの自動入力」）
// 資料をテキストにそろえ（property-import-source.ts）、AI に書かれたままの文字を抜き出させ、プログラムで照合・換算する（property-import.ts）
// ここでは保存しない。値はフォームに入れるだけで、登録は担当者が確かめてから従来どおり saveProperty で行う
// AI は軽い方のモデル（AI_MODEL_LIGHT）。貼った資料は保存せず、ログにも出さない。ログに出すのはトークン数と費用だけ

export type ImportState = ({ ok: true } & ImportResult) | { ok: false; error: string };

export async function importDraft(formData: FormData): Promise<ImportState> {
  const source = readImportSource(formData);
  if ("error" in source) return { ok: false, error: source.error };
  const prepared = await toSourceText(source);
  if ("error" in prepared) return { ok: false, error: prepared.error };
  try {
    const r = await callModel(readPrompt("import.txt"), [{ role: "user", content: prepared.text }], importSchema, { model: MODEL, effort: "medium", maxTokens: 8000 });
    console.info(`[AI入力アシスト] kind=${source.kind} model=${MODEL} input=${r.usage.input_tokens} output=${r.usage.output_tokens} cache_read=${r.usage.cache_read_input_tokens ?? 0} cost_usd=${r.costUsd.toFixed(5)}`);
    if (!r.output) return { ok: false, error: `読み取れませんでした（${r.error ?? "理由不明"}）。もう一度お試しください` };
    return { ok: true, ...toFormFields(r.output, prepared.text) };
  } catch (e) {
    // 例外の中身に資料の文が入ることはないが、念のため種類だけを出す
    console.error(`[AI入力アシスト] 失敗：${e instanceof Error ? e.name : "unknown"}`);
    return { ok: false, error: "解析に失敗しました。時間をおいてもう一度お試しください" };
  }
}
