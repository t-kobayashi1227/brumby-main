// エージェントが返す JSON の形（docs/設計まとめ.md「出力の形」「エージェントの指示文」）
// structured outputs（output_config.format）で、この形以外を返せないようにする。topic などの選択肢も指示文のとおりにしぼる

import { z } from "zod/v4";

export type AgentName = "戦略" | "媒体" | "確認";

const evidence = z.array(z.string());
const confidence = z.enum(["高", "中", "低"]);

const sentence = z.object({ text: z.string(), evidence });

/** 戦略の答えのうち、分析を除いた部分（媒体担当に渡す） */
const mainSchema = z.object({
  summary: sentence,
  targets: z.array(
    z.object({
      rank: z.number().int(),
      name: z.string(),
      source: z.enum(["候補", "エージェント提案"]),
      // エージェント提案の候補だけ説明を書く。候補（6つ）は null
      definition: z.string().nullable(),
      reason: z.string(),
      evidence,
      confidence,
    }),
  ),
  not_fit: z.array(z.object({ name: z.string(), reason: z.string(), evidence })),
  appeals: z.array(z.object({ rank: z.number().int(), text: z.string(), evidence })),
  price_view: z.object({
    // 判定保留：相場の事実どうしが同じ向きを示さないとき（2026-11-03）。売れやすさは、販売日数などの事実がないので外した（以前の答えには残る）
    position: z.enum(["割安", "相場なみ", "割高", "判定保留"]),
    text: z.string(),
    evidence,
  }),
  concerns: z.array(z.object({ text: z.string(), action: z.string(), evidence })),
  direction: sentence,
});
export type MainOutput = z.infer<typeof mainSchema>;

/**
 * 競合と比べた、おすすめポイント（1つ）と懸念点（最大2つ）、競合ごとの見え方（2026-11-05 浩平さん依頼）
 * 競合の事実（K）が無ければ null・空の配列。数の上限と事実IDの組み合わせはプログラムが点検する（checks.ts）
 */
const competitorShape = {
  competitor_edge: z.object({ point: z.string(), cause: z.string(), action: z.string(), why_first: z.string(), evidence }).nullable(),
  competitor_concerns: z.array(z.object({ rank: z.number().int(), concern: z.string(), cause: z.string(), evidence })),
  competitors: z.array(z.object({ fact_id: z.string(), buyer_view: sentence, about_edge: z.boolean(), concern_ranks: z.array(z.number().int()) })),
};

/** 戦略担当の答え。分析（事実 → 買い手にとっての意味 → 販売での使い方）と戦略を1回で作る。分析を先に書かせる */
export const STRATEGY_TOPICS = ["物件", "立地", "価格", "買い手", "組み合わせ", "その他"] as const;
export const strategySchema = z.object({
  analysis: z.array(
    z.object({
      topic: z.enum(STRATEGY_TOPICS),
      // 事実 → 買い手にとっての意味 → 販売での使い方
      fact: z.string(),
      meaning: z.string(),
      use: z.string(),
      evidence,
      confidence,
    }),
  ),
  unknown: z.array(z.string()),
  ...mainSchema.shape,
  ...competitorShape,
});
export type StrategyOutput = z.infer<typeof strategySchema>;
export type CompetitorEdge = NonNullable<StrategyOutput["competitor_edge"]>;
export type CompetitorConcern = StrategyOutput["competitor_concerns"][number];
export type CompetitorNote = StrategyOutput["competitors"][number];


/** 戦略の答えから、媒体担当に渡す部分（分析を除いた戦略）だけを取り出す */
export function mainPart(strategy: StrategyOutput): MainOutput {
  return mainSchema.parse(strategy);
}

export const mediaSchema = z.object({
  media: z.array(
    z.object({ id: z.string(), name: z.string(), purpose: z.string(), target: z.string(), share: z.number().int(), share_reason: z.string(), reason: z.string(), evidence }),
  ),
  cautions: z.array(z.object({ text: z.string(), action: z.string(), evidence })),
});
export type MediaOutput = z.infer<typeof mediaSchema>;

export const checkSchema = z.object({
  ok: z.boolean(),
  issues: z.array(z.object({ where: z.string(), check: z.number().int(), problem: z.string() })),
});
export type CheckOutput = z.infer<typeof checkSchema>;
