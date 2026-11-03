"use client";

import type { StrategyResult } from "../../../../lib/agents/run";
import type { Fact } from "../../../../lib/facts/types";
import { REPORT_TABS } from "../../../../lib/report";
import { Badge, Card, Evidence, Lead, TabLink, Text, useReportNav } from "./parts";

// ① サマリー：推奨方針・第一ターゲット・最大の訴求・最大の懸念・懸念点・不足情報
// 中身はすべて保存済みのAIの答えと事実シートから取る（新しくAIに作らせない）

// 懸念点の対策案（concerns[].action）は出さない（10/26 決定を 2026-11-03 に浩平さんが再確認）。AIの答えとDBには残る
const MAX_CONCERNS = 3;

export default function SummaryTab({ r, facts, factList }: { r: StrategyResult; facts: Map<string, Fact>; factList: Fact[] }) {
  const { openFact } = useReportNav();
  const m = r.戦略;
  const target = [...m.targets].sort((a, b) => a.rank - b.rank)[0];
  const appeal = [...m.appeals].sort((a, b) => a.rank - b.rank)[0];
  const concern = m.concerns[0];
  const topConcerns = m.concerns.slice(0, MAX_CONCERNS);
  const restConcerns = m.concerns.slice(MAX_CONCERNS);
  const missingFacts = factList.filter((f) => f.状態 !== "取得");

  const keyRows: { label: string; value: string | undefined; badge?: React.ReactNode; tone?: "warn" }[] = [
    { label: "第一ターゲット", value: target?.name, badge: <Badge kind="hypothesis" /> },
    { label: "最大の訴求", value: appeal?.text },
    { label: "最大の懸念", value: concern?.text, tone: "warn" },
  ];

  return (
    <div className="grid gap-4">
      <Lead
        title="推奨方針"
        badge={<Badge kind="ai" />}
        side={
          <dl className="grid gap-2">
            {keyRows.map((k) => (
              <div key={k.label} className={`grid gap-1 rounded-lg px-3 py-2 sm:grid-cols-[7.5em_minmax(0,1fr)] ${k.tone === "warn" ? "bg-[#fdf1e7]" : "bg-primary-soft/60"}`}>
                <dt className="text-[13px] text-sub">{k.label}</dt>
                <dd className={`text-[14px] font-bold leading-snug ${k.tone === "warn" ? "text-accent" : "text-ink"}`}>
                  {k.value ?? "なし"}
                  {k.badge && <span className="ml-1.5 align-middle">{k.badge}</span>}
                </dd>
              </div>
            ))}
          </dl>
        }
      >
        <Text>{m.summary.text}</Text>
        <Evidence ids={m.summary.evidence} facts={facts} />
        <div className="mt-3 rounded bg-subtle px-3 py-2 text-[12px] text-sub">AIが事実シートをもとに考えた提案です。数字はシステムが計算した値で、重要な項目は資料や現地で確認してください。</div>
      </Lead>

      <Card title="懸念点" badge={<Badge kind="ai" />}>
        {topConcerns.length === 0 ? (
          <div className="text-[13px] text-sub">懸念点はありません。</div>
        ) : (
          <ol className="grid gap-3 md:grid-cols-3">
            {topConcerns.map((c, i) => (
              <li key={i} className="flex gap-2.5 rounded-lg border border-line p-3">
                <span className="mt-0.5 w-6 h-6 shrink-0 rounded-full grid place-items-center bg-primary-soft text-[13px] font-bold text-primary">{i + 1}</span>
                <div className="min-w-0">
                  <div className="text-[15px] text-ink leading-relaxed">{c.text}</div>
                  <Evidence ids={c.evidence} facts={facts} />
                </div>
              </li>
            ))}
          </ol>
        )}
        {restConcerns.length > 0 && (
          <details className="mt-3 text-[13px]">
            <summary className="cursor-pointer text-primary">ほかの懸念点 {restConcerns.length}件</summary>
            <ul className="mt-2 grid gap-2">
              {restConcerns.map((c, i) => (
                <li key={i} className="text-body">
                  {c.text}
                  <Evidence ids={c.evidence} facts={facts} />
                </li>
              ))}
            </ul>
          </details>
        )}
      </Card>

      <Card title="不足情報・確認事項">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="min-w-0">
            <div className="mb-1.5 flex items-center gap-2 text-[13px] text-sub">
              事実シートから分からないこと <Badge kind="ai" />
            </div>
            {m.unknown.length === 0 ? (
              <div className="text-[13px] text-sub">ありません。</div>
            ) : (
              <ul className="grid gap-1 text-[14px] text-body">
                {m.unknown.map((u, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="mt-2 w-1.5 h-1.5 shrink-0 rounded-full bg-accent" aria-hidden />
                    {u}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="min-w-0">
            <div className="mb-1.5 flex items-center gap-2 text-[13px] text-sub">
              取得できず・要確認の事実 <Badge kind="system">システム</Badge>
            </div>
            {missingFacts.length === 0 ? (
              <div className="text-[13px] text-sub">ありません。</div>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {missingFacts.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => openFact(f.id)}
                    className="rounded-full border border-line bg-white px-2.5 py-1 text-[12px] text-body cursor-pointer hover:border-primary hover:text-primary"
                  >
                    <span className="font-mono text-sub mr-1">{f.id}</span>
                    {f.項目.replace(/（.*$/, "")}・{f.状態}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </Card>

      <Card title="詳細は各タブで確認">
        <div className="flex flex-wrap gap-2">
          {REPORT_TABS.filter((t) => t.key !== "summary").map((t) => (
            <TabLink key={t.key} tab={t.key} label={t.label} />
          ))}
        </div>
      </Card>
    </div>
  );
}
