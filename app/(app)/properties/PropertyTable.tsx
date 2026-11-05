"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { formatJstDateTime, formatNumber } from "../../../lib/facts/format";
import { compareNullable, matchesQuery, paginate, STRATEGY_STATES, type StrategyState } from "../../../lib/listView";
import { FilterSelect, Pagination, SearchBox, SortHeader } from "../../_components/ListToolbar";
import { ChevronRightIcon, SparkIcon, SpinnerIcon } from "../../_components/icons";
import { badge, btnRow, card } from "../../_lib/ui";

export interface PropertyRow {
  id: string;
  code: string;
  propertyClass: string;
  address: string;
  priceManYen: number;
  layout: string;
  strategy: StrategyState;
  firstTarget: string | null;
  /** 物件情報か販売戦略が最後に変わった日時（ISO） */
  updatedAt: string;
}

const MIN_W = "min-w-[960px]";

const COLS = "grid-cols-[2.6fr_1.2fr_1.1fr_1.3fr_1.1fr_auto]";

const STRATEGY_BADGE: Record<StrategyState, string> = {
  戦略作成済み: "bg-[#f1ebfb] text-[#6b3fb8]",
  作成中: "bg-[#fff4e0] text-[#b25e09]",
  作成失敗: "bg-[#fdecec] text-[#b91c1c]",
  未作成: "bg-[#f1f3f6] text-muted",
};

type SortKey = "id" | "price" | "updated";

export default function PropertyTable({ rows }: { rows: PropertyRow[] }) {
  const [query, setQuery] = useState("");
  const [state, setState] = useState<StrategyState | "">("");
  // 既定は新しく登録した順。登録した物件が、10件ずつのページ送りの最後のページに隠れないように（2026-11-05 浩平さん指摘）
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "id", dir: "desc" });
  const [page, setPage] = useState(1);
  // 検索・絞り込み・並び替えを変えたら1ページ目に戻す
  const reset = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setPage(1);
  };

  const shown = useMemo(() => {
    const list = rows.filter((r) => matchesQuery([r.code, r.address], query) && (state === "" || r.strategy === state));
    const value = (r: PropertyRow) => (sort.key === "price" ? r.priceManYen : sort.key === "updated" ? Date.parse(r.updatedAt) : Number(r.id));
    return [...list].sort((a, b) => compareNullable(value(a), value(b), sort.dir));
  }, [rows, query, state, sort]);
  const pg = paginate(shown.length, page);

  return (
    <div className="grid gap-3">
      <div className={`${card} flex flex-wrap items-center gap-3 p-3`}>
        <SearchBox value={query} onChange={reset(setQuery)} placeholder="物件ID・住所で検索" />
        <FilterSelect label="販売戦略" value={state} options={STRATEGY_STATES} onChange={reset(setState)} />
      </div>
      <div className={`${card} overflow-x-auto p-5`}>
        {/* 狭い画面では表を横にスクロールする（列をつぶして折り返さない） */}
        <div className={`grid ${COLS} ${MIN_W} gap-3 px-1 pb-2 border-b border-canvas text-[12px] text-muted`}>
          <SortHeader label="物件" sortKey="id" sort={sort} onSort={reset(setSort)} />
          <SortHeader label="価格・間取り" sortKey="price" sort={sort} onSort={reset(setSort)} />
          <div>販売戦略</div>
          <div title="AIが販売戦略で一番に挙げたターゲット。確定した買主像ではありません">第1ターゲット（AIの案）</div>
          <SortHeader label="最終更新" sortKey="updated" sort={sort} onSort={reset(setSort)} />
          <div className="w-[104px]" />
        </div>
        {shown.length === 0 ? (
          <div className="py-10 text-center text-[13px] text-muted">条件に合う物件がありません</div>
        ) : (
          shown.slice(pg.start, pg.end).map((p) => (
            // 行全体を販売戦略の画面へのリンクにする。右端の「詳細を見る」は押せる場所を見えるようにするため
            <div key={p.id} className={`relative grid ${COLS} ${MIN_W} items-center gap-3 px-1 py-3 border-b border-canvas text-[13px] text-ink hover:bg-subtle`}>
              <Link href={`/strategy/${p.id}`} className="absolute inset-0" aria-label={`物件 ${p.code} の販売戦略を開く`} />
              <div className="min-w-0">
                <div className="truncate">{p.address}</div>
                <div className="mt-0.5 text-[11px] text-muted">
                  <span className="font-bold text-body">{p.code}</span>・{p.propertyClass}
                </div>
              </div>
              <div className="tabular-nums">
                {formatNumber(p.priceManYen)}万円
                <span className="ml-1.5 text-body">{p.layout}</span>
              </div>
              <div>
                <span className={`${badge} gap-1 ${STRATEGY_BADGE[p.strategy]}`}>
                  {p.strategy === "作成中" ? <SpinnerIcon className="size-3 animate-spin" /> : p.strategy === "戦略作成済み" ? <SparkIcon className="size-3" /> : null}
                  {p.strategy}
                </span>
              </div>
              <div className="text-body">{p.firstTarget ?? "―"}</div>
              <div className="text-[12px] text-body tabular-nums">{formatJstDateTime(p.updatedAt)}</div>
              <div className="w-[104px] text-right">
                <Link href={`/strategy/${p.id}`} className={btnRow}>
                  詳細を見る
                  <ChevronRightIcon className="size-3.5" />
                </Link>
              </div>
            </div>
          ))
        )}
        <Pagination total={shown.length} allTotal={rows.length} from={pg.from} to={pg.to} current={pg.current} pages={pg.pages} onPage={setPage} />
      </div>
    </div>
  );
}
