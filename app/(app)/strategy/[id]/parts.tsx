"use client";

import { createContext, useContext } from "react";
import type { Fact } from "../../../../lib/facts/types";
import { evidenceText, type ReportTab } from "../../../../lib/report";
import { card } from "../../../_lib/ui";

// 6タブのレポートで共通に使う部品（2026-11-03）
// 事実（システムが集めた値）と、AIの見立てを見分けられるよう、印（Badge）を付けて出す。「検証済み」の印は使わない

/** 他のタブから、根拠データタブの事実を開く */
export const ReportNav = createContext<{ goTab: (tab: ReportTab) => void; openFact: (id: string) => void }>({
  goTab: () => {},
  openFact: () => {},
});
export const useReportNav = () => useContext(ReportNav);

type BadgeKind = "ai" | "hypothesis" | "system" | "input" | "caution";
const BADGE: Record<BadgeKind, { label: string; className: string }> = {
  ai: { label: "AIの見立て", className: "bg-[#f1ecfb] text-[#5b3fa8]" },
  hypothesis: { label: "仮説", className: "bg-[#f1ecfb] text-[#5b3fa8]" },
  system: { label: "システム計算・公的データ", className: "bg-primary-soft text-primary" },
  input: { label: "入力", className: "bg-subtle border border-line text-sub" },
  caution: { label: "要確認", className: "bg-[#fdf1e7] text-accent" },
};

export function Badge({ kind, children }: { kind: BadgeKind; children?: React.ReactNode }) {
  const b = BADGE[kind];
  return <span className={`inline-block whitespace-nowrap rounded px-1.5 py-0.5 text-[11px] font-bold ${b.className}`}>{children ?? b.label}</span>;
}

export function Card({ title, badge, children, className = "", aside }: { title?: string; badge?: React.ReactNode; children: React.ReactNode; className?: string; aside?: React.ReactNode }) {
  return (
    <section className={`${card} p-5 break-inside-avoid min-w-0 ${className}`}>
      {title && (
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <h2 className="text-[16px] font-bold text-ink">{title}</h2>
          {badge}
          {aside && <div className="ml-auto">{aside}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

/** 各タブの先頭の結論（1〜2行） */
export function Lead({ title, badge, children, side }: { title: string; badge?: React.ReactNode; children: React.ReactNode; side?: React.ReactNode }) {
  return (
    <section className={`${card} p-5 break-inside-avoid`}>
      <div className={`grid gap-4 ${side ? "lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] lg:divide-x lg:divide-line" : ""}`}>
        <div className="min-w-0 lg:pr-4">
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <h2 className="text-[17px] font-bold text-ink">{title}</h2>
            {badge}
          </div>
          {children}
        </div>
        {side && <div className="min-w-0 lg:pl-4">{side}</div>}
      </div>
    </section>
  );
}

export function Text({ children }: { children: React.ReactNode }) {
  return <p className="text-[15px] text-ink leading-relaxed">{children}</p>;
}

export function RankBadge({ rank }: { rank: number }) {
  return <span className={`mt-0.5 w-5 h-5 shrink-0 rounded-full grid place-items-center text-[12px] font-bold ${rank === 1 ? "bg-primary text-white" : "bg-primary-soft text-primary"}`}>{rank}</span>;
}

/** 文の下に小さく出す根拠のチップ。初めは件数だけを出し、押すと各事実の値・出典・時点が開く。IDを押すと根拠データタブでその事実を開く */
export function Evidence({ ids, facts }: { ids: string[]; facts: Map<string, Fact> }) {
  const { openFact } = useReportNav();
  const list = [...new Set(ids.map((i) => i.trim()).filter(Boolean))];
  if (list.length === 0) return null;
  return (
    <details className="group/ev mt-1.5 text-[12px]">
      <summary className="inline-flex cursor-pointer list-none items-center gap-1 rounded bg-subtle border border-line px-2 py-0.5 text-sub hover:border-primary hover:text-primary [&::-webkit-details-marker]:hidden">
        根拠 {list.length}件<span className="group-open/ev:rotate-90 transition-transform">▸</span>
      </summary>
      <ul className="mt-1.5 grid gap-1.5 rounded bg-subtle px-3 py-2 text-body leading-relaxed">
        {list.map((id) => {
          const f = facts.get(id);
          return (
            <li key={id}>
              {f ? evidenceText(f) : `${id}（事実シートにないID）`}
              <div className="text-sub">
                {f ? (
                  <button type="button" onClick={() => openFact(id)} className="font-mono text-primary underline underline-offset-2 cursor-pointer print:no-underline">
                    {id}
                  </button>
                ) : (
                  <span className="font-mono">{id}</span>
                )}
                {f && `・${f.出典}（${f.時点}）${f.状態 !== "取得" ? `・${f.状態}` : ""}`}
              </div>
            </li>
          );
        })}
      </ul>
    </details>
  );
}

/** 事実の短い一覧（項目・値・比較・状態）。IDを押すと根拠データタブで開く */
export function FactList({ facts, empty = "この分類の事実はありません。" }: { facts: Fact[]; empty?: string }) {
  const { openFact } = useReportNav();
  if (facts.length === 0) return <div className="text-[13px] text-sub">{empty}</div>;
  return (
    <ul className="divide-y divide-line">
      {facts.map((f) => (
        <li key={f.id} className="grid gap-x-3 gap-y-0.5 py-2 text-[13px] sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          <div className="min-w-0 text-body">
            <button type="button" onClick={() => openFact(f.id)} className="mr-1.5 font-mono text-[12px] text-primary underline underline-offset-2 cursor-pointer">
              {f.id}
            </button>
            {f.項目}
          </div>
          <div className="min-w-0">
            <span className={f.値 === null ? "text-sub" : "text-ink"}>{f.値 ?? "不明"}</span>
            {f.状態 !== "取得" && <span className="ml-1.5"><Badge kind="caution">{f.状態}</Badge></span>}
            {f.比較 && <div className="text-[12px] text-sub">比較：{f.比較}</div>}
          </div>
        </li>
      ))}
    </ul>
  );
}

/** 開くと中身が見える欄（初めは閉じる） */
export function Fold({ summary, children, defaultOpen = false }: { summary: React.ReactNode; children: React.ReactNode; defaultOpen?: boolean }) {
  return (
    <details className="group mt-3" open={defaultOpen}>
      <summary className="flex cursor-pointer list-none items-center gap-1.5 text-[13px] text-primary [&::-webkit-details-marker]:hidden">
        <span className="group-open:rotate-90 transition-transform">▸</span>
        {summary}
      </summary>
      <div className="mt-2">{children}</div>
    </details>
  );
}

/** 他のタブへ移るボタン */
export function TabLink({ tab, label }: { tab: ReportTab; label: string }) {
  const { goTab } = useReportNav();
  return (
    <button type="button" onClick={() => goTab(tab)} className="inline-flex items-center gap-1 rounded-md border border-line bg-white px-3 py-1.5 text-[13px] text-ink cursor-pointer hover:border-primary hover:text-primary">
      {label} <span aria-hidden>›</span>
    </button>
  );
}
