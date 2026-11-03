// AI の提供元・モデルと、呼び出しの費用（CLAUDE.md「各呼び出しのトークン数と費用を記録します」）
// 提供元は環境変数 AI_PROVIDER（anthropic または openai、省略時は anthropic）で選ぶ
// モデルは AI_MODEL_HIGH（高性能の方。戦略担当と確認担当が使う）と AI_MODEL_LIGHT（軽い方。媒体担当が使う）で変えられる。省略時は提供元ごとの既定
// 費用を記録するため、使えるモデルは下の料金表（RATES）にあるものだけ。モデルを足すときは料金表に行を足す

export type Provider = "anthropic" | "openai";

interface Rate {
  /** 1M トークンあたりの米ドル */
  input: number;
  output: number;
  /** キャッシュから読んだ入力 */
  cacheRead: number;
  /** キャッシュへの書き込み（OpenAI は書き込みの料金なし） */
  cacheWrite: number;
}

interface ModelInfo {
  provider: Provider;
  short: Rate;
  /** プロンプトが LONG_PROMPT_TOKENS を超えたときの料金表。無ければ short と同じ */
  long: Rate | null;
}

/**
 * 料金表
 * - Anthropic：2026-10 時点。キャッシュの読み込みは入力の0.1倍、5分のキャッシュの書き込みは1.25倍。Haiku は 100K トークンを超えると高い料金表になる
 * - OpenAI：2026-11-03 時点の Standard の料金（https://developers.openai.com/api/docs/pricing）。長いプロンプトの割増は公式ページで確認できなかったため入れていない
 */
const RATES = {
  "claude-haiku-5-5": {
    provider: "anthropic",
    short: { input: 0.1, output: 0.5, cacheRead: 0.01, cacheWrite: 0.125 },
    long: { input: 0.5, output: 2.5, cacheRead: 0.05, cacheWrite: 0.625 },
  },
  "claude-sonnet-5-5": { provider: "anthropic", short: { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 }, long: null },
  "gpt-6-luna": { provider: "openai", short: { input: 0.1, output: 0.5, cacheRead: 0.01, cacheWrite: 0 }, long: null },
  "gpt-6.1-terra": { provider: "openai", short: { input: 1, output: 5, cacheRead: 0.05, cacheWrite: 0 }, long: null },
  "gpt-6.1-sol": { provider: "openai", short: { input: 2, output: 10, cacheRead: 0.1, cacheWrite: 0 }, long: null },
} as const satisfies Record<string, ModelInfo>;
const LONG_PROMPT_TOKENS = 100_000;

export type Model = keyof typeof RATES;

/** 提供元ごとの既定のモデル。料金と役割が近いものを並べる（Sonnet ↔ gpt-6.1-sol、Haiku ↔ gpt-6-luna） */
const DEFAULT_MODELS: Record<Provider, { strategy: Model; media: Model }> = {
  anthropic: { strategy: "claude-sonnet-5-5", media: "claude-haiku-5-5" },
  openai: { strategy: "gpt-6.1-sol", media: "gpt-6-luna" },
};

export function isModel(name: string): name is Model {
  return Object.hasOwn(RATES, name);
}

export function providerOf(model: Model): Provider {
  return RATES[model].provider;
}

/** 環境変数から提供元とモデルを決める。設定が間違っていれば、起動時にわかるよう例外にする */
export function resolveModels(env: Record<string, string | undefined> = process.env): { provider: Provider; strategy: Model; media: Model } {
  const raw = (env.AI_PROVIDER ?? "").trim().toLowerCase() || "anthropic";
  if (raw !== "anthropic" && raw !== "openai") throw new Error(`AI_PROVIDER は anthropic か openai です（いまの値：${raw}）`);
  const provider: Provider = raw;
  const pick = (name: "AI_MODEL_HIGH" | "AI_MODEL_LIGHT", fallback: Model): Model => {
    const value = (env[name] ?? "").trim();
    if (!value) return fallback;
    if (!isModel(value)) throw new Error(`${name} のモデル「${value}」は料金表（lib/agents/cost.ts）にありません。使えるもの：${Object.keys(RATES).join("、")}`);
    if (providerOf(value) !== provider) throw new Error(`${name} のモデル「${value}」は AI_PROVIDER（${provider}）のモデルではありません`);
    return value;
  };
  return { provider, strategy: pick("AI_MODEL_HIGH", DEFAULT_MODELS[provider].strategy), media: pick("AI_MODEL_LIGHT", DEFAULT_MODELS[provider].media) };
}

const RESOLVED = resolveModels();

/** いま使っている提供元 */
export const PROVIDER = RESOLVED.provider;
/** 媒体担当 */
export const MODEL: Model = RESOLVED.media;
/** 戦略担当と確認担当（docs/履歴/戦略の質を上げる修正案.md 4.1） */
export const STRATEGY_MODEL: Model = RESOLVED.strategy;

/** トークン数。input_tokens はキャッシュを使わなかった入力だけ（OpenAI の数は llm.ts でこの形に直す） */
export interface Usage {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
}

export function costUsd(u: Usage, model: Model = MODEL): number {
  const cacheWrite = u.cache_creation_input_tokens ?? 0;
  const cacheRead = u.cache_read_input_tokens ?? 0;
  const prompt = u.input_tokens + cacheWrite + cacheRead;
  const info: ModelInfo = RATES[model];
  const r = prompt > LONG_PROMPT_TOKENS && info.long ? info.long : info.short;
  const usd = (u.input_tokens * r.input + cacheWrite * r.cacheWrite + cacheRead * r.cacheRead + u.output_tokens * r.output) / 1_000_000;
  return Math.round(usd * 1e6) / 1e6;
}
