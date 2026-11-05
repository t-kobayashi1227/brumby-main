"use client";

import { useMemo, useState } from "react";
import { filterCandidates, formatCompetitorDistance, MAX_COMPETITORS, type CompetitorCandidate } from "../../../lib/competitors";
import { formatNumber } from "../../../lib/facts/format";
import { CloseIcon, PlusIcon, SearchIcon } from "../../_components/icons";
import { badge, SALE_BADGE } from "../../_lib/ui";

// 競合物件を、本システムで販売戦略を作った別の物件から最大2件選ぶ（2026-11-05 浩平さん依頼。同日に3件→2件）
// 選んだ物件の番号を hidden の competitor_id で送る（選んだ順）。確かめと保存は actions.ts
// 選んだ物件の物件情報・特徴・販売戦略（AIの見立て）を引用して、この物件と比べる。レポートが変わるのは戦略を作り直したとき

const age = (n: number) => (n === 0 ? "新築" : `築${n}年`);

function Specs({ c }: { c: CompetitorCandidate }) {
  return (
    <span className="tabular-nums">
      {formatNumber(c.price_man_yen)}万円・{c.layout}・建物{formatNumber(c.building_sqm, 1)}㎡・土地{formatNumber(c.land_sqm, 1)}㎡・{age(c.building_age)}
    </span>
  );
}

export default function CompetitorPicker({ candidates, initialIds, isNew }: { candidates: CompetitorCandidate[]; initialIds: number[]; isNew: boolean }) {
  const byId = useMemo(() => new Map(candidates.map((c) => [c.id, c])), [candidates]);
  // 候補に無くなった物件（戦略を消した・物件を消した）は外して見せる。保存すると外れる
  const [ids, setIds] = useState(() => initialIds.filter((id) => byId.has(id)));
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const dropped = initialIds.length - initialIds.filter((id) => byId.has(id)).length;
  const full = ids.length >= MAX_COMPETITORS;
  const shown = filterCandidates(candidates, query);
  const selected = ids.map((id) => byId.get(id)!);

  return (
    <div className="grid gap-3">
      {ids.map((id) => (
        <input key={id} type="hidden" name="competitor_id" value={id} />
      ))}

      {selected.length > 0 ? (
        <div className={`grid gap-3 ${selected.length === 1 ? "" : selected.length === 2 ? "sm:grid-cols-2" : "sm:grid-cols-3"}`}>
          {selected.map((c, i) => (
            <div key={c.id} className="rounded-lg border border-[#f5d48a] bg-[#fffaf0] px-3.5 py-3">
              <div className="flex items-center gap-2">
                <span className="rounded bg-[#f59e0b] px-1.5 py-0.5 text-[11px] font-bold text-white">競合{i + 1}</span>
                <span className="text-[13px] font-bold text-ink">{c.code}</span>
                <span className={`${badge} ${SALE_BADGE[c.sale]}`}>{c.sale}</span>
                <button
                  type="button"
                  onClick={() => setIds(ids.filter((x) => x !== c.id))}
                  aria-label={`競合${i + 1}（${c.code}）を外す`}
                  className="ml-auto flex items-center gap-0.5 rounded-md px-1.5 py-1 text-xs text-sub hover:text-[#e5484d] cursor-pointer"
                >
                  <CloseIcon className="size-3.5" />
                  外す
                </button>
              </div>
              <div className="mt-1.5 text-xs text-body">{c.area}</div>
              <div className="mt-0.5 text-xs text-body">
                <Specs c={c} />
              </div>
              <div className="mt-0.5 text-[11px] text-muted">
                {formatCompetitorDistance(c.distance_m)}・戦略作成 {c.strategy_on}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-sub">まだ選んでいません。販売戦略を作った物件から、最大{MAX_COMPETITORS}件を選べます。</p>
      )}
      {dropped > 0 && <p className="text-[11px] text-[#b25e09]">選んでいた競合のうち{dropped}件は、販売戦略が見つからないため外しました。保存すると反映されます。</p>}

      <button
        type="button"
        onClick={() => setOpen(!open)}
        disabled={full && !open}
        aria-expanded={open}
        className="flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-[#9dbaf0] py-2.5 text-[13px] font-bold text-primary cursor-pointer hover:bg-primary-soft disabled:cursor-not-allowed disabled:opacity-50"
      >
        {open ? (
          "一覧を閉じる"
        ) : full ? (
          `${MAX_COMPETITORS}件選びました（外すと選び直せます）`
        ) : (
          <>
            <PlusIcon className="size-4" />
            競合を選ぶ（あと{MAX_COMPETITORS - ids.length}件）
          </>
        )}
      </button>

      {open && (
        <div className="grid gap-2 rounded-lg border border-line bg-subtle p-3">
          {candidates.length === 0 ? (
            <p className="py-4 text-center text-xs text-sub">販売戦略を作った物件がまだありません。ほかの物件で戦略を作ると、ここから選べます。</p>
          ) : (
            <>
              <label className="relative flex items-center">
                <SearchIcon className="pointer-events-none absolute left-3 size-4 text-muted" />
                <input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  // 一覧の絞り込みで Enter を押しても、物件の保存にならないようにする
                  onKeyDown={(e) => e.key === "Enter" && e.preventDefault()}
                  placeholder="物件ID・所在地で絞り込む"
                  aria-label="物件ID・所在地で絞り込む"
                  className="w-full rounded-lg border border-field bg-white py-2 pl-9 pr-3 text-[13px] text-ink placeholder:text-muted focus:border-primary focus:outline-none"
                />
              </label>
              <div className="text-[11px] text-muted">
                {isNew ? "販売戦略を作った日時が新しい順です。距離は、この物件を登録して位置が決まると出ます。" : "この物件から近い順です（直線距離）。"}
              </div>
              <ul className="grid max-h-80 gap-1.5 overflow-y-auto">
                {shown.map((c) => {
                  const picked = ids.includes(c.id);
                  return (
                    <li key={c.id} className={`flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border bg-white px-3 py-2 ${picked ? "border-[#f5d48a]" : "border-line"}`}>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[13px] font-bold text-ink">{c.code}</span>
                          <span className="text-xs text-body">{c.area}</span>
                          <span className={`${badge} ${SALE_BADGE[c.sale]}`}>{c.sale}</span>
                        </div>
                        <div className="mt-0.5 text-xs text-body">
                          <Specs c={c} />
                        </div>
                        <div className="mt-0.5 text-[11px] text-muted">
                          {formatCompetitorDistance(c.distance_m)}・戦略作成 {c.strategy_on}
                        </div>
                      </div>
                      {picked ? (
                        <button type="button" onClick={() => setIds(ids.filter((x) => x !== c.id))} className="rounded-md border border-field bg-white px-3 py-1.5 text-xs font-bold text-sub cursor-pointer hover:text-[#e5484d]">
                          選択中・外す
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={full}
                          onClick={() => {
                            const next = [...ids, c.id];
                            setIds(next);
                            if (next.length >= MAX_COMPETITORS) setOpen(false);
                          }}
                          className="rounded-md bg-primary px-3 py-1.5 text-xs font-bold text-white cursor-pointer hover:bg-[#2459b0] disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          選ぶ
                        </button>
                      )}
                    </li>
                  );
                })}
                {shown.length === 0 && <li className="py-4 text-center text-xs text-sub">当てはまる物件がありません。</li>}
              </ul>
            </>
          )}
        </div>
      )}
      <p className="text-[11px] text-muted">
        選んだ物件の物件情報・特徴・販売戦略（AIの見立て）を引用して、この物件と比べます。結果は販売戦略の「販売施策」タブに出ます。
        {isNew ? "" : "選び直したあとは、戦略を作り直すと反映されます。"}
      </p>
    </div>
  );
}
