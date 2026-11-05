// AI を1回呼ぶ。返す形は structured outputs で決め、形（zod）に合うと確かめた JSON を返す
// 提供元はモデル名で決まる（Anthropic は @anthropic-ai/sdk、OpenAI は openai の Responses API）。どのモデルを使うかは cost.ts の環境変数で選ぶ
// ストリーミングで受け取り、最後にまとめて答えを取り出す（戦略担当は出力が大きく、max_tokens を大きくしても通信が切れないように）
// APIキーは ANTHROPIC_API_KEY・OPENAI_API_KEY（.env.local）。使う提供元の分だけあればよい。サーバー側だけで使い、ログや画面に出さない

import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import type { z } from "zod/v4";
import { costUsd, MODEL, providerOf, type Model, type Usage } from "./cost";

let anthropic: Anthropic | null = null;
function getAnthropic(): Anthropic {
  anthropic ??= new Anthropic();
  return anthropic;
}

let openai: OpenAI | null = null;
function getOpenAI(): OpenAI {
  openai ??= new OpenAI();
  return openai;
}

export type Effort = "medium" | "high";

/** エージェントに渡す会話。提供元によらない形（DB の agent_calls.input にもこの形で残す） */
export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface CallOptions {
  model: Model;
  effort: Effort;
  /** 考える分（thinking・reasoning）も max_tokens に入るので、余裕を持たせる */
  maxTokens: number;
  /** 最後の user の発言に添える画像（間取り図の読み取りだけで使う。DB には残さない） */
  images?: ImageInput[];
}

/** AI に添える画像。base64 は data: を付けない中身だけ */
export interface ImageInput {
  mediaType: "image/png" | "image/jpeg" | "image/webp";
  base64: string;
}

/** 画像があれば、最後の user の発言を「画像＋文字」の形にする。提供元ごとの書き方は toBlock で決める */
export function withImages<I, T>(messages: ChatMessage[], images: ImageInput[] | undefined, toBlock: (img: ImageInput) => I, text: (t: string) => T) {
  const last = messages.findLastIndex((m) => m.role === "user");
  if (!images?.length || last < 0) return messages;
  return messages.map((m, i) => (i === last ? { role: m.role, content: [...images.map(toBlock), text(m.content)] } : m));
}

export const DEFAULT_CALL: CallOptions = { model: MODEL, effort: "medium", maxTokens: 16000 };

interface LlmResult<T> {
  output: T | null;
  rawText: string;
  usage: Usage;
  costUsd: number;
  /** 読めなかった・途中で止まったときの説明。成功なら null */
  error: string | null;
}

export async function callModel<S extends z.ZodType>(
  system: string,
  messages: ChatMessage[],
  schema: S,
  options: CallOptions = DEFAULT_CALL,
): Promise<LlmResult<z.infer<S>>> {
  const r = providerOf(options.model) === "openai" ? await callOpenAI(system, messages, schema, options) : await callAnthropic(system, messages, schema, options);
  return { ...r, output: r.error ? null : (r.output as z.infer<S>), costUsd: costUsd(r.usage, options.model) };
}

type ProviderResult = Omit<LlmResult<unknown>, "costUsd">;

async function callAnthropic(system: string, messages: ChatMessage[], schema: z.ZodType, options: CallOptions): Promise<ProviderResult> {
  const response = await getAnthropic()
    .messages.stream({
      model: options.model,
      max_tokens: options.maxTokens,
      system,
      messages: withImages(
        messages,
        options.images,
        (img) => ({ type: "image" as const, source: { type: "base64" as const, media_type: img.mediaType, data: img.base64 } }),
        (t) => ({ type: "text" as const, text: t }),
      ) as Anthropic.MessageParam[],
      output_config: { format: zodOutputFormat(schema), effort: options.effort },
    })
    .finalMessage();
  const rawText = response.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
  const usage: Usage = {
    input_tokens: response.usage.input_tokens,
    output_tokens: response.usage.output_tokens,
    cache_creation_input_tokens: response.usage.cache_creation_input_tokens,
    cache_read_input_tokens: response.usage.cache_read_input_tokens,
  };
  let error: string | null = null;
  if (response.stop_reason === "refusal") error = `AI が答えを断りました（${response.stop_details?.category ?? "理由不明"}）`;
  else if (response.stop_reason === "max_tokens") error = "答えが長すぎて途中で止まりました（max_tokens）";
  else if (response.parsed_output == null) error = "答えの JSON を読み取れませんでした";
  return { output: response.parsed_output, rawText, usage, error };
}

async function callOpenAI(system: string, messages: ChatMessage[], schema: z.ZodType, options: CallOptions): Promise<ProviderResult> {
  const response = await getOpenAI()
    .responses.stream(
      {
        model: options.model,
        instructions: system,
        input: withImages(
          messages,
          options.images,
          (img) => ({ type: "input_image" as const, image_url: `data:${img.mediaType};base64,${img.base64}`, detail: "high" as const }),
          (t) => ({ type: "input_text" as const, text: t }),
        ) as OpenAI.Responses.ResponseInput,
        max_output_tokens: options.maxTokens,
        reasoning: { effort: options.effort },
        text: { format: zodTextFormat(schema, "output") },
        // 物件の情報は秘密保持の対象なので、OpenAI 側に答えを保存させない（既定は30日以上保存）
        store: false,
      },
      // SDK に読み取らせると、読めない JSON で例外になりトークン数が残らない。読み取りは下で自分で行う
      { parseAs: null },
    )
    .finalResponse();

  const parts = response.output.flatMap((item) => (item.type === "message" ? item.content : []));
  const rawText = parts.flatMap((c) => (c.type === "output_text" ? [c.text] : [])).join("");
  const refusal = parts.find((c) => c.type === "refusal");
  // OpenAI の input_tokens はキャッシュから読んだ分を含むので、Anthropic と同じ形（キャッシュ以外の入力）に直す
  const cached = response.usage?.input_tokens_details?.cached_tokens ?? 0;
  const usage: Usage = {
    input_tokens: (response.usage?.input_tokens ?? 0) - cached,
    output_tokens: response.usage?.output_tokens ?? 0,
    cache_creation_input_tokens: 0,
    cache_read_input_tokens: cached,
  };
  const reason = response.incomplete_details?.reason;
  let error: string | null = null;
  let output: unknown = null;
  if (refusal) error = `AI が答えを断りました（${refusal.refusal || "理由不明"}）`;
  else if (reason === "max_output_tokens") error = "答えが長すぎて途中で止まりました（max_tokens）";
  else if (reason === "content_filter") error = "AI が答えを断りました（content_filter）";
  else if (response.status !== "completed") error = `答えが最後まで返りませんでした（${response.status ?? "状態不明"}${reason ? `・${reason}` : ""}）`;
  else {
    output = parseJson(rawText, schema);
    if (output == null) error = "答えの JSON を読み取れませんでした";
  }
  return { output, rawText, usage, error };
}

/** JSON として読み、形（zod）に合うときだけ返す。合わなければ null */
export function parseJson(text: string, schema: z.ZodType): unknown {
  try {
    const r = schema.safeParse(JSON.parse(text));
    return r.success ? r.data : null;
  } catch {
    return null;
  }
}
