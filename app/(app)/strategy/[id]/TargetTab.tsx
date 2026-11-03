"use client";

import type { StrategyResult } from "../../../../lib/agents/run";
import type { Fact } from "../../../../lib/facts/types";
import { groupByAspect, placeOfAnalysis } from "../../../../lib/report";
import { ChatIcon, DatabaseIcon, HomeIcon, MegaphoneIcon, PinIcon, TargetIcon, UsersIcon, YenIcon } from "../../../_components/icons";
import { Ai, Card, Evidence, FactChip, HypothesisBadge, Num } from "./parts";

// ② ターゲット・訴求：狙う層（第一〜第三候補）、訴求ポイント、顧客への伝え方（組み合わせた見立て）
// 順位はAIの見立てで、需要データで確かめたものではないため、すべての候補に「仮説」を付ける
// 各候補の根拠を「地域の特性・物件との合い方・買える見込み」に分けて出す。分け方は事実の分類で決める（groupByAspect）。
// 根拠のない観点は「根拠なし」と出し、理由の偏りが見えるようにする

const RANK_LABEL = ["第一候補", "第二候補", "第三候補", "第四候補", "第五候補"];
const ASPECT_ICON = { area: PinIcon, fit: HomeIcon, afford: YenIcon, buyer: UsersIcon, other: DatabaseIcon } as const;

export default function TargetTab({ r, facts }: { r: StrategyResult; facts: Map<string, Fact> }) {
  const m = r.戦略;
  const targets = [...m.targets].sort((a, b) => a.rank - b.rank);
  const appeals = [...m.appeals].sort((a, b) => a.rank - b.rank).slice(0, 3);
  const combos = m.analysis.filter((a) => placeOfAnalysis(a).tab === "target");

  return (
    <div className="grid gap-4">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <Card title="狙うターゲット" icon={TargetIcon} aside={<HypothesisBadge />}>
          <div className="mb-3 text-[12px] text-sub">順位はAIの見立てです。購入できる層を狭めすぎないよう、反響を見て見直してください。</div>
          <ol className="grid gap-3">
            {targets.map((t) => (
              <li key={`${t.rank}-${t.name}`} className={`rounded-lg border p-3 ${t.rank === 1 ? "border-primary/40 bg-primary-soft/30" : "border-line"}`}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded px-2 py-0.5 text-[12px] font-bold ${t.rank === 1 ? "bg-primary text-white" : "bg-primary-soft text-primary"}`}>{RANK_LABEL[t.rank - 1] ?? `第${t.rank}候補`}</span>
                  <span className="text-[16px] font-bold text-ink">{t.name}</span>
                  {t.source === "エージェント提案" && <span className="text-[12px] text-sub">（AIが加えた候補{t.definition ? `：${t.definition}` : ""}）</span>}
                </div>
                <div className="mt-1.5">
                  <Ai size="sm">{t.reason}</Ai>
                </div>
                <dl className="mt-2 grid gap-1.5">
                  {groupByAspect(t.evidence, facts)
                    .filter((g) => !g.optional || g.ids.length > 0)
                    .map((g) => {
                    const Icon = ASPECT_ICON[g.key as keyof typeof ASPECT_ICON] ?? DatabaseIcon;
                    return (
                      <div key={g.key} className="grid items-start gap-1.5 sm:grid-cols-[8.5em_minmax(0,1fr)]">
                        <dt className="flex items-center gap-1 pt-0.5 text-[12px] text-sub">
                          <Icon className="size-3.5" />
                          {g.title}
                        </dt>
                        <dd className="flex flex-wrap gap-1">
                          {g.ids.length === 0 ? <span className="text-[12px] text-muted">根拠なし</span> : g.ids.map((id) => <FactChip key={id} id={id} f={facts.get(id)} />)}
                        </dd>
                      </div>
                    );
                  })}
                </dl>
              </li>
            ))}
          </ol>
        </Card>

        <Card title="主な訴求ポイント" icon={MegaphoneIcon}>
          <ol className="grid gap-3">
            {appeals.map((a, i) => (
              <li key={i} className="flex gap-2.5 rounded-lg border border-line p-3">
                <Num n={i + 1} strong={i === 0} />
                <div className="min-w-0">
                  <Ai strong>{a.text}</Ai>
                  <Evidence ids={a.evidence} facts={facts} max={2} />
                </div>
              </li>
            ))}
          </ol>
        </Card>
      </div>

      <Card title="顧客への伝え方" icon={ChatIcon}>
        {combos.length === 0 ? (
          <div className="text-[13px] text-sub">組み合わせた見立てはありません。</div>
        ) : (
          <ul className={`grid gap-3 ${combos.length === 1 ? "" : combos.length === 2 ? "md:grid-cols-2" : "md:grid-cols-2 xl:grid-cols-3"}`}>
            {combos.map((a, i) => (
              <li key={i} className={`rounded-lg border border-line p-3 ${combos.length === 1 ? "grid gap-3 md:grid-cols-2" : "grid gap-2"}`}>
                <div className="min-w-0">
                  <div className="mb-1 text-[12px] font-bold text-primary">買い手にとって</div>
                  <Ai size="sm">{a.meaning}</Ai>
                </div>
                <div className="min-w-0">
                  <div className="mb-1 text-[12px] font-bold text-primary">伝え方</div>
                  <Ai size="sm">{a.use}</Ai>
                  <Evidence ids={a.evidence} facts={facts} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
