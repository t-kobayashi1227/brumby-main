"use client";

import { useMemo, useState } from "react";
import { FACT_CATEGORIES, type Fact, type FactCategory, type FactStatus } from "../../../../lib/facts/types";
import { categoryOf, TAB_LABEL, type FactUse, type SourceRow } from "../../../../lib/report";
import { Badge, Card, useReportNav } from "./parts";

// ⑥ 根拠データ：事実シートを、検索・分類・状態・使用の有無で絞り込んで見る。行を押すと右に詳細と、その事実を引いている文を出す
// 状態は事実シートの「取得／取得できず／要確認」（システムが付けたもの）。「検証済み」の印は使わない

const STATUSES: FactStatus[] = ["取得", "要確認", "取得できず"];

function TimePoint({ value }: { value: string }) {
  const i = value.indexOf("（");
  if (i <= 0) return <span className="whitespace-nowrap">{value}</span>;
  return (
    <>
      <span className="whitespace-nowrap">{value.slice(0, i)}</span>
      <span className="block text-[12px] text-sub">{value.slice(i)}</span>
    </>
  );
}

function StatusChip({ status }: { status: FactStatus }) {
  return <span className={`inline-block whitespace-nowrap rounded px-2 py-0.5 text-[12px] ${status === "取得" ? "bg-primary-soft text-primary" : "bg-[#fdf1e7] text-accent"}`}>{status}</span>;
}

const pill = (on: boolean) => `rounded-full border px-3 py-1 text-[13px] cursor-pointer ${on ? "border-primary bg-primary text-white" : "border-line bg-white text-body hover:border-primary"}`;

export default function EvidenceTab({
  facts,
  usage,
  sources,
  sheetCreatedAt,
  selected,
  onSelect,
}: {
  facts: Fact[];
  usage: Map<string, FactUse[]>;
  sources: SourceRow[];
  sheetCreatedAt: string;
  selected: string | null;
  onSelect: (id: string) => void;
}) {
  const { goTab } = useReportNav();
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<FactCategory | "">("");
  const [status, setStatus] = useState<FactStatus | "">("");
  const [usedOnly, setUsedOnly] = useState(false);

  const cats = (Object.keys(FACT_CATEGORIES) as FactCategory[]).filter((c) => facts.some((f) => categoryOf(f.id) === c));
  const shown = useMemo(() => {
    const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return facts.filter((f) => {
      if (cat && categoryOf(f.id) !== cat) return false;
      if (status && f.状態 !== status) return false;
      if (usedOnly && !usage.has(f.id)) return false;
      const hay = `${f.id} ${f.項目} ${f.値 ?? "不明"} ${f.比較 ?? ""} ${f.出典}`.toLowerCase();
      return words.every((w) => hay.includes(w));
    });
  }, [facts, q, cat, status, usedOnly, usage]);

  const current = facts.find((f) => f.id === selected) ?? shown[0] ?? null;
  const uses = current ? (usage.get(current.id) ?? []) : [];

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
      <section className="rounded-[10px] border border-line bg-white p-4 grid gap-3">
        <div className="text-[13px] text-sub">
          戦略の各文は、ここにある事実のIDを根拠にしています。事実シート作成：{sheetCreatedAt}（距離はすべて直線距離）。ID の英字は事実の分類です。
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="根拠を検索（項目・値・出典・ID）"
            className="h-9 w-full max-w-[320px] rounded-md border border-field px-3 text-[13px] text-ink"
          />
          <select value={cat} onChange={(e) => setCat(e.target.value as FactCategory | "")} className="h-9 rounded-md border border-field bg-white px-2 text-[13px] text-ink">
            <option value="">すべての分類</option>
            {cats.map((c) => (
              <option key={c} value={c}>
                {c}：{FACT_CATEGORIES[c].name}
              </option>
            ))}
          </select>
          <span className="mx-1 h-6 w-px bg-line" aria-hidden />
          <button type="button" className={pill(status === "")} onClick={() => setStatus("")}>
            すべての状態
          </button>
          {STATUSES.map((s) => (
            <button key={s} type="button" className={pill(status === s)} onClick={() => setStatus(status === s ? "" : s)}>
              {s}
            </button>
          ))}
          <label className="ml-1 flex items-center gap-1.5 text-[13px] text-body cursor-pointer">
            <input type="checkbox" checked={usedOnly} onChange={(e) => setUsedOnly(e.target.checked)} />
            戦略で使った事実だけ
          </label>
          <span className="ml-auto text-[13px] text-sub">
            {shown.length} / {facts.length}件
          </span>
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px] items-start">
        <Card title="根拠一覧" className="overflow-hidden">
          <div className="overflow-x-auto -mx-5 -mb-5">
            <table className="w-full min-w-[760px] table-fixed text-[13px] text-ink border-collapse">
              <colgroup>
                <col style={{ width: 64 }} />
                <col />
                <col style={{ width: 200 }} />
                <col style={{ width: 120 }} />
                <col style={{ width: 84 }} />
                <col style={{ width: 150 }} />
              </colgroup>
              <thead>
                <tr className="text-left text-sub bg-subtle">
                  {["ID", "項目", "出典", "時点", "状態", "使用箇所"].map((h) => (
                    <th key={h} className="px-3 py-2 font-bold text-[12px] whitespace-nowrap border-b border-line">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {shown.map((f) => {
                  const tabs = [...new Set((usage.get(f.id) ?? []).map((u) => u.tab))];
                  const active = current?.id === f.id;
                  return (
                    <tr
                      key={f.id}
                      onClick={() => onSelect(f.id)}
                      className={`cursor-pointer align-top border-b border-line ${active ? "bg-primary-soft/60" : "hover:bg-primary-soft/30"}`}
                    >
                      <td className="px-3 py-2.5 font-mono text-[12px] text-sub whitespace-nowrap">{f.id}</td>
                      <td className="px-3 py-2.5 leading-relaxed">
                        <div className="font-bold">{f.項目}</div>
                        <div className={`text-[12px] ${f.値 === null ? "text-sub" : "text-body"} line-clamp-2`}>{f.値 ?? "不明"}</div>
                      </td>
                      <td className="px-3 py-2.5 text-body leading-relaxed">{f.出典}</td>
                      <td className="px-3 py-2.5 text-body leading-relaxed">
                        <TimePoint value={f.時点} />
                      </td>
                      <td className="px-3 py-2.5">
                        <StatusChip status={f.状態} />
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex flex-wrap gap-1">
                          {tabs.length === 0 ? (
                            <span className="text-[12px] text-muted">―</span>
                          ) : (
                            tabs.map((t) => (
                              <span key={t} className="rounded bg-subtle border border-line px-1.5 py-0.5 text-[11px] text-body whitespace-nowrap">
                                {TAB_LABEL[t]}
                              </span>
                            ))
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {shown.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-3 py-6 text-center text-sub">
                      条件に合う事実はありません。
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>

        <Card title="根拠の詳細" className="xl:sticky xl:top-4">
          {!current ? (
            <div className="text-[13px] text-sub">一覧の行を押すと、詳細が出ます。</div>
          ) : (
            <div className="grid gap-3 text-[13px]">
              <dl className="grid grid-cols-[5em_minmax(0,1fr)] gap-x-3 gap-y-2">
                <dt className="text-sub">ID</dt>
                <dd className="font-mono">
                  {current.id}
                  <span className="ml-2 font-sans text-sub">{FACT_CATEGORIES[categoryOf(current.id)!]?.name}</span>
                </dd>
                <dt className="text-sub">項目</dt>
                <dd className="font-bold text-ink">{current.項目}</dd>
                <dt className="text-sub">値</dt>
                <dd className={current.値 === null ? "text-sub" : "text-ink"}>{current.値 ?? "不明"}</dd>
                {current.比較 && (
                  <>
                    <dt className="text-sub">比較</dt>
                    <dd className="text-body">{current.比較}</dd>
                  </>
                )}
                <dt className="text-sub">出典</dt>
                <dd className="text-body">{current.出典}</dd>
                <dt className="text-sub">時点</dt>
                <dd className="text-body">{current.時点}</dd>
                <dt className="text-sub">状態</dt>
                <dd>
                  <StatusChip status={current.状態} />
                </dd>
                <dt className="text-sub">取得</dt>
                <dd className="text-body">事実シート作成 {sheetCreatedAt}</dd>
              </dl>
              <div>
                <div className="mb-1.5 flex items-center gap-2 text-sub">
                  この事実を根拠にしている文 <Badge kind="ai" />
                </div>
                {uses.length === 0 ? (
                  <div className="text-sub">画面の文では使っていません。</div>
                ) : (
                  <ul className="grid gap-2">
                    {uses.map((u, i) => (
                      <li key={i} className="rounded border border-line p-2">
                        <button type="button" onClick={() => goTab(u.tab)} className="text-[12px] font-bold text-primary underline underline-offset-2 cursor-pointer">
                          {TAB_LABEL[u.tab]}・{u.where}
                        </button>
                        <div className="mt-0.5 text-body leading-relaxed">{u.text}</div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
        </Card>
      </div>

      <Card title="出典一覧">
        <table className="w-full text-[14px] text-body border-collapse">
          <thead>
            <tr className="text-left text-sub border-b border-line">
              <th className="py-1.5 pr-3 font-normal">出典</th>
              <th className="py-1.5 font-normal">時点</th>
            </tr>
          </thead>
          <tbody>
            {sources.map((s) => (
              <tr key={`${s.出典}|${s.時点}`} className="border-b border-canvas">
                <td className="py-1.5 pr-3">{s.出典}</td>
                <td className="py-1.5 whitespace-nowrap text-sub">{s.時点}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
