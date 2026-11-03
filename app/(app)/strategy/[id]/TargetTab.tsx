"use client";

import type { StrategyResult } from "../../../../lib/agents/run";
import type { Fact } from "../../../../lib/facts/types";
import { placeOfAnalysis } from "../../../../lib/report";
import { Badge, Card, Evidence, Lead, Text } from "./parts";

// ② ターゲット・訴求：狙う層（第一〜第三候補）、訴求ポイント、顧客への伝え方（組み合わせた見立て）
// 順位はAIの見立てで、需要データで確かめたものではないため、すべての候補に「仮説」を付ける
// 「初回面談／内見時／広告文」に分けた伝え方は、AIの答えに無いので出さない（出すには指示文の変更が要る）

const RANK_LABEL = ["第一候補", "第二候補", "第三候補", "第四候補", "第五候補"];

export default function TargetTab({ r, facts }: { r: StrategyResult; facts: Map<string, Fact> }) {
  const m = r.戦略;
  const targets = [...m.targets].sort((a, b) => a.rank - b.rank);
  const appeals = [...m.appeals].sort((a, b) => a.rank - b.rank).slice(0, 3);
  const combos = m.analysis.filter((a) => placeOfAnalysis(a).tab === "target");

  return (
    <div className="grid gap-4">
      <Lead title="ターゲットと訴求の方針" badge={<Badge kind="ai" />}>
        <Text>
          {targets[0] ? `第一候補は「${targets[0].name}」。` : ""}
          {appeals[0] ? `いちばんの訴求は「${appeals[0].text}」です。` : ""}
        </Text>
        <div className="mt-2 text-[12px] text-sub">候補の順位はAIの見立て（仮説）です。購入できる層を必要以上に狭めないよう、反響を見て見直してください。</div>
      </Lead>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="狙うターゲット" badge={<Badge kind="hypothesis" />}>
          <ol className="grid gap-3">
            {targets.map((t) => (
              <li key={`${t.rank}-${t.name}`} className="rounded-lg border border-line p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded px-2 py-0.5 text-[12px] font-bold ${t.rank === 1 ? "bg-primary text-white" : "bg-primary-soft text-primary"}`}>{RANK_LABEL[t.rank - 1] ?? `第${t.rank}候補`}</span>
                  <span className="text-[15px] font-bold text-ink">{t.name}</span>
                  {t.source === "エージェント提案" && <span className="text-[12px] text-sub">（AIが加えた候補）</span>}
                </div>
                {t.source === "エージェント提案" && t.definition && <div className="text-[13px] text-sub mt-1">どんな世帯か：{t.definition}</div>}
                <p className="text-[14px] text-body leading-relaxed mt-1">{t.reason}</p>
                <Evidence ids={t.evidence} facts={facts} />
              </li>
            ))}
          </ol>
        </Card>

        <Card title="主な訴求ポイント" badge={<Badge kind="ai" />}>
          <ol className="grid gap-3">
            {appeals.map((a, i) => (
              <li key={i} className="flex gap-2.5 rounded-lg border border-line p-3">
                <span className={`mt-0.5 w-5 h-5 shrink-0 rounded-full grid place-items-center text-[12px] font-bold ${i === 0 ? "bg-primary text-white" : "bg-primary-soft text-primary"}`}>{i + 1}</span>
                <div className="min-w-0">
                  <p className="text-[15px] font-bold text-ink leading-relaxed">{a.text}</p>
                  <Evidence ids={a.evidence} facts={facts} />
                </div>
              </li>
            ))}
          </ol>
        </Card>
      </div>

      <Card title="顧客への伝え方" badge={<Badge kind="ai" />}>
        {combos.length === 0 ? (
          <div className="text-[13px] text-sub">組み合わせた見立てはありません。</div>
        ) : (
          <ul className="grid gap-3 md:grid-cols-2">
            {combos.map((a, i) => (
              <li key={i} className="rounded-lg border border-line p-3 grid gap-1.5">
                <div className="text-[13px] text-sub leading-relaxed">事実：{a.fact}</div>
                <div>
                  <span className="text-[12px] font-bold text-primary mr-1.5">買い手にとって</span>
                  <span className="text-[14px] text-ink leading-relaxed">{a.meaning}</span>
                </div>
                <div>
                  <span className="text-[12px] font-bold text-primary mr-1.5">伝え方</span>
                  <span className="text-[14px] text-ink leading-relaxed">{a.use}</span>
                </div>
                <Evidence ids={a.evidence} facts={facts} />
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

