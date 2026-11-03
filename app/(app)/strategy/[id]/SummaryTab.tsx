"use client";

import type { StrategyResult } from "../../../../lib/agents/run";
import type { Fact } from "../../../../lib/facts/types";
import { nextCheck, shortLabel } from "../../../../lib/report";
import { AlertIcon, ClipboardIcon, MegaphoneIcon, SearchIcon, SparkIcon, TargetIcon } from "../../../_components/icons";
import { Ai, Card, Evidence, HypothesisBadge, Num, useReportNav } from "./parts";

// ① サマリー：結論（推奨方針・第一ターゲット・最大の訴求）→ 懸念点 → 次に確かめること
// 懸念点の対策案（concerns[].action）は出さない（10/26 決定を 2026-11-03 に浩平さんが再確認）。AIの答えとDBには残る
// 「次に確かめること」は、取得できず・要確認の事実から決まった文で作る（AIは使わない。lib/report.ts の nextCheck）

const MAX_CONCERNS = 3;

export default function SummaryTab({ r, facts, factList }: { r: StrategyResult; facts: Map<string, Fact>; factList: Fact[] }) {
  const { openFact } = useReportNav();
  const m = r.戦略;
  const target = [...m.targets].sort((a, b) => a.rank - b.rank)[0];
  const appeal = [...m.appeals].sort((a, b) => a.rank - b.rank)[0];
  const topConcerns = m.concerns.slice(0, MAX_CONCERNS);
  const restConcerns = m.concerns.slice(MAX_CONCERNS);
  const missingFacts = factList.filter((f) => f.状態 !== "取得");

  return (
    <div className="grid gap-4">
      <section className="rounded-[10px] border border-line bg-white p-5">
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
          <div className="min-w-0">
            <div className="mb-2 flex items-center gap-2">
              <span className="grid size-8 place-items-center rounded-lg bg-[#f1ecfb] text-[#6b4fc0]">
                <SparkIcon className="size-[18px]" />
              </span>
              <h2 className="text-[17px] font-bold text-ink">推奨方針</h2>
            </div>
            <Ai>{m.summary.text}</Ai>
            <Evidence ids={m.summary.evidence} facts={facts} />
          </div>
          <div className="grid gap-2 content-start">
            <KeyRow icon={<TargetIcon className="size-5" />} label="第一ターゲット" value={target?.name} badge={<HypothesisBadge />} />
            <KeyRow icon={<MegaphoneIcon className="size-5" />} label="最大の訴求" value={appeal?.text} />
            <KeyRow
              icon={<SearchIcon className="size-5" />}
              label="確かめる事実"
              value={missingFacts.length ? `${missingFacts.length}件（下に一覧）` : "なし"}
              tone={missingFacts.length ? "warn" : undefined}
            />
          </div>
        </div>
      </section>

      <Card title="懸念点" icon={AlertIcon}>
        {topConcerns.length === 0 ? (
          <div className="text-[13px] text-sub">懸念点はありません。</div>
        ) : (
          <ol className="grid gap-3 md:grid-cols-3">
            {topConcerns.map((c, i) => (
              <li key={i} className="flex gap-2.5 rounded-lg border border-line bg-[#fffaf5] p-3">
                <Num n={i + 1} />
                <div className="min-w-0">
                  <Ai>{c.text}</Ai>
                  <Evidence ids={c.evidence} facts={facts} max={2} />
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
                <li key={i}>
                  <Ai size="sm">{c.text}</Ai>
                  <Evidence ids={c.evidence} facts={facts} max={2} />
                </li>
              ))}
            </ul>
          </details>
        )}
      </Card>

      <Card title="次に確かめること" icon={ClipboardIcon}>
        {missingFacts.length === 0 && m.unknown.length === 0 ? (
          <div className="text-[13px] text-sub">確かめることはありません。</div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
            <div className="min-w-0">
              <div className="mb-2 text-[12px] text-sub">データが取れなかった・要確認の事実です。物件の入力で補えるものは、物件情報に入れて戦略を作り直すと反映されます。</div>
              <ul className="grid gap-2">
                {missingFacts.map((f) => {
                  const n = nextCheck(f);
                  return (
                    <li key={f.id} className="flex items-start gap-2.5 rounded-lg border border-line p-2.5">
                      <AlertIcon className="mt-0.5 size-4 shrink-0 text-accent" />
                      <div className="min-w-0 flex-1">
                        <div className="text-[14px] font-bold text-ink">{n.what}</div>
                        <div className="text-[12px] text-sub">
                          確認先：{n.who}・
                          <button type="button" onClick={() => openFact(f.id)} className="text-primary underline underline-offset-2 cursor-pointer">
                            {f.id} {shortLabel(f.項目)}（{f.状態}）
                          </button>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
            {m.unknown.length > 0 && (
              <div className="min-w-0">
                <div className="mb-2 text-[12px] text-sub">AIが「事実シートから分からない」と挙げたこと</div>
                <ul className="grid gap-1.5">
                  {m.unknown.map((u, i) => (
                    <li key={i}>
                      <Ai size="sm">{u}</Ai>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}

function KeyRow({ icon, label, value, badge, tone }: { icon: React.ReactNode; label: string; value: string | undefined; badge?: React.ReactNode; tone?: "warn" }) {
  return (
    <div className={`flex items-center gap-3 rounded-lg px-3 py-2.5 ${tone === "warn" ? "bg-[#fdf1e7]" : "bg-primary-soft/60"}`}>
      <span className={tone === "warn" ? "text-accent" : "text-primary"}>{icon}</span>
      <div className="min-w-0">
        <div className="text-[12px] text-sub">{label}</div>
        <div className={`text-[14px] font-bold leading-snug ${tone === "warn" ? "text-accent" : "text-ink"}`}>
          {value ?? "なし"}
          {badge && <span className="ml-1.5 align-middle">{badge}</span>}
        </div>
      </div>
    </div>
  );
}
