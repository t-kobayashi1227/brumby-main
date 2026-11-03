"use client";

import { useState } from "react";
import type { PromptLogEntry } from "../../../../lib/agents/prompt-log";
import { ChatIcon } from "../../../_components/icons";
import { card } from "../../../_lib/ui";

// サマリーの最下部：このレポートを作るときに、AIへ実際に送った内容（指示文と入力）。最初は閉じておき、開いたときに読む（2026-11-03 浩平さん依頼）
// 事実シートを丸ごと送っているので大きい。ページには載せず、開いたときだけ API から読む。印刷（PDF）には出さない

const AGENT_LABEL: Record<string, string> = { 戦略: "戦略担当", 媒体: "媒体担当", 確認: "確認担当" };

type Load = { state: "idle" | "loading" } | { state: "error"; message: string } | { state: "done"; calls: PromptLogEntry[] };

export default function PromptLog({ propertyId, runId }: { propertyId: number; runId: number }) {
  const [load, setLoad] = useState<Load>({ state: "idle" });

  const fetchLog = async () => {
    setLoad({ state: "loading" });
    try {
      const res = await fetch(`/api/properties/${propertyId}/strategy/prompts?run=${runId}`, { cache: "no-store" });
      const body = (await res.json().catch(() => ({}))) as { calls?: PromptLogEntry[]; error?: string };
      if (!res.ok || !body.calls) throw new Error(body.error ?? `読めませんでした（HTTP ${res.status}）`);
      setLoad({ state: "done", calls: body.calls });
    } catch (e) {
      setLoad({ state: "error", message: e instanceof Error ? e.message : String(e) });
    }
  };

  return (
    <details
      className={`group ${card} p-5 min-w-0 print:hidden`}
      onToggle={(e) => {
        if ((e.currentTarget as HTMLDetailsElement).open && load.state === "idle") void fetchLog();
      }}
    >
      <summary className="flex cursor-pointer list-none items-center gap-2 text-[14px] font-bold text-ink [&::-webkit-details-marker]:hidden">
        <span className="grid size-7 place-items-center rounded-lg bg-subtle text-sub">
          <ChatIcon className="size-4" />
        </span>
        AIに送った内容（指示文と入力）
        <span className="ml-auto text-[12px] font-normal text-primary">
          <span className="group-open:hidden">開く ▾</span>
          <span className="hidden group-open:inline">閉じる ▴</span>
        </span>
      </summary>
      <div className="mt-3 grid gap-3">
        <div className="text-[12px] text-sub leading-relaxed">
          このレポートを作るときに、AIへ送った指示文と入力です。指示文はシステムプロンプト、入力はユーザーの発言として送っています。入力の JSON の部分は、読みやすいように改行と字下げを入れて出しています（中身は送ったものと同じで、文字数は送った分を数えています）。このほかに、答えの形（JSON の形）の指定も送っています。
        </div>
        {load.state === "loading" && <div className="text-[13px] text-sub">読み込んでいます…</div>}
        {load.state === "error" && (
          <div className="flex flex-wrap items-center gap-2 text-[13px] text-[#b91c1c]">
            {load.message}
            <button type="button" onClick={() => void fetchLog()} className="text-primary underline cursor-pointer">
              もう一度読む
            </button>
          </div>
        )}
        {load.state === "done" && load.calls.length === 0 && <div className="text-[13px] text-sub">この実行の記録はありません。</div>}
        {load.state === "done" &&
          load.calls.map((c, i) => (
            <section key={i} className="rounded-lg border border-line p-3 min-w-0">
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <span className="text-[14px] font-bold text-ink">
                  {i + 1}. {AGENT_LABEL[c.agent] ?? c.agent}
                </span>
                <span className="text-[12px] text-sub">
                  {c.model}
                  {c.effort && `・考える量 ${c.effort}`}
                  {c.status !== "succeeded" && `・${c.status === "failed" ? "失敗" : "途中"}`}
                </span>
              </div>
              <Block title={`指示文（prompts/${c.promptFile}${c.agent === "媒体" ? " の前に common.txt" : ""}）`}>
                {c.system ?? null}
              </Block>
              {c.system === null && (
                <div className="mt-1 text-[12px] text-accent">この実行のあとで指示文を直したため、送ったときの指示文は出せません（今の指示文とは違います）。</div>
              )}
              {c.messages.map((m, j) => (
                <Block key={j} title={c.messages.length > 1 ? `入力 ${j + 1}（${m.role}）` : "入力"} sentLength={m.content.length}>
                  {pretty(m.content)}
                </Block>
              ))}
            </section>
          ))}
      </div>
    </details>
  );
}

/** 開いて読む、文字のかたまり。長いので枠の中でスクロールし、コピーできるようにする */
function Block({ title, children, sentLength }: { title: string; children: string | null; sentLength?: number }) {
  const [copied, setCopied] = useState(false);
  if (children === null) return null;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(children);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // コピーできない環境では何もしない（文字を選んでコピーできる）
    }
  };
  return (
    <details className="mt-2 min-w-0">
      <summary className="cursor-pointer text-[13px] text-primary">
        {title}
        <span className="ml-1.5 text-[11px] text-muted">{(sentLength ?? children.length).toLocaleString("ja-JP")}文字</span>
      </summary>
      <div className="relative mt-1.5">
        <button type="button" onClick={() => void copy()} className="absolute right-2 top-2 rounded border border-line bg-white px-2 py-0.5 text-[11px] text-sub cursor-pointer hover:text-primary">
          <span aria-live="polite">{copied ? "コピーしました" : "コピー"}</span>
        </button>
        <pre className="max-h-[420px] overflow-auto whitespace-pre-wrap break-words rounded-md bg-subtle p-3 pr-24 text-[12px] leading-relaxed text-body">{children}</pre>
      </div>
    </details>
  );
}

/** 入力は、JSON の文字列（2026-11-04 より前）か、事実の表と JSON を見出しで並べた文字列。JSON の部分だけ読める形に整える */
function pretty(text: string): string {
  const json = (t: string) => {
    try {
      return JSON.stringify(JSON.parse(t), null, 2);
    } catch {
      return null;
    }
  };
  return json(text) ?? text.split("\n").map((line) => (/^[{[]/.test(line) ? (json(line) ?? line) : line)).join("\n");
}
