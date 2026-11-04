"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { formatJstDateTime, formatNumber } from "../../../lib/facts/format";
import { matchesQuery, paginate, saleStateOrder, SALE_STATES, type RecordState, type SaleState } from "../../../lib/listView";
import type { PartialSum } from "../../../lib/records";
import { FilterSelect, Pagination, SearchBox } from "../../_components/ListToolbar";
import { ChevronRightIcon, PencilIcon } from "../../_components/icons";
import { badge, btnRow, btnRowPrimary, card } from "../../_lib/ui";

export interface RecordRow {
  id: string;
  code: string;
  address: string;
  sale: SaleState;
  record: RecordState;
  listedOn: string | null;
  cost: PartialSum;
  inquiries: PartialSum;
  viewings: PartialSum;
  /** 販売記録か媒体の実績が最後に変わった日時（ISO）。まだ何も入れていなければ null */
  updatedAt: string | null;
}

const MIN_W = "min-w-[1040px]";

const COLS = "grid-cols-[2.4fr_0.9fr_0.9fr_1fr_0.8fr_0.7fr_0.9fr_1.2fr_auto]";

const SALE_BADGE: Record<SaleState, string> = {
  販売中: "bg-primary-soft text-primary",
  販売前: "bg-[#e6f6f7] text-[#0f6e78]",
  販売済み: "bg-[#e9f8ec] text-[#157347]",
  販売中止: "bg-[#eceef2] text-[#5b6476]",
  未設定: "bg-[#f1f3f6] text-muted",
};

const RECORD_BADGE: Record<RecordState, string> = {
  記録あり: "bg-primary-soft text-primary",
  未記録: "bg-[#fff4e0] text-[#b25e09]",
};

const RECORD_STATES = ["記録あり", "未記録"] as const;

/** 合計の出し方：実績が無ければ「―」、どの行にも入っていなければ「未入力」、一部だけなら「一部未入力」を添える */
function Sum({ v, record, unit, digits = 0 }: { v: PartialSum; record: RecordState; unit: string; digits?: number }) {
  if (record === "未記録") return <span className="text-muted">―</span>;
  if (v.sum === null) return <span className="text-[12px] text-muted">未入力</span>;
  return (
    <span>
      {formatNumber(v.sum, digits)}
      {unit}
      {v.partial && <span className="block text-[10px] text-muted">一部未入力</span>}
    </span>
  );
}

export default function RecordTable({ rows }: { rows: RecordRow[] }) {
  const [query, setQuery] = useState("");
  const [sale, setSale] = useState<SaleState | "">("");
  const [record, setRecord] = useState<RecordState | "">("");
  const [page, setPage] = useState(1);
  // 検索・絞り込みを変えたら1ページ目に戻す
  const reset = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setPage(1);
  };

  const shown = useMemo(
    () =>
      rows
        .filter((r) => matchesQuery([r.code, r.address], query) && (sale === "" || r.sale === sale) && (record === "" || r.record === record))
        .sort((a, b) => saleStateOrder(a.sale) - saleStateOrder(b.sale) || Number(a.id) - Number(b.id)),
    [rows, query, sale, record],
  );
  const pg = paginate(shown.length, page);

  return (
    <div className="grid gap-3">
      <div className={`${card} flex flex-wrap items-center gap-3 p-3`}>
        <SearchBox value={query} onChange={reset(setQuery)} placeholder="物件ID・住所で検索" />
        <FilterSelect label="販売状況" value={sale} options={SALE_STATES} onChange={reset(setSale)} />
        <FilterSelect label="記録" value={record} options={RECORD_STATES} onChange={reset(setRecord)} />
      </div>
      <div className={`${card} overflow-x-auto p-5`}>
        {/* 狭い画面では表を横にスクロールする（列をつぶして折り返さない） */}
        <div className={`grid ${COLS} ${MIN_W} gap-3 px-1 pb-2 border-b border-canvas text-[12px] text-muted`}>
          <div>物件</div>
          <div>販売状況</div>
          <div>記録</div>
          <div>販売開始日</div>
          <div className="text-right">問い合わせ</div>
          <div className="text-right">内見</div>
          <div className="text-right">費用合計</div>
          <div>最終更新</div>
          <div className="w-[96px]" />
        </div>
        {shown.length === 0 ? (
          <div className="py-10 text-center text-[13px] text-muted">条件に合う物件がありません</div>
        ) : (
          shown.slice(pg.start, pg.end).map((r) => (
            <div key={r.id} className={`relative grid ${COLS} ${MIN_W} items-center gap-3 px-1 py-3 border-b border-canvas text-[13px] text-ink hover:bg-subtle`}>
              <Link href={`/records/${r.id}`} className="absolute inset-0" aria-label={`物件 ${r.code} の販売記録を開く`} />
              <div className="min-w-0">
                <div className="truncate">{r.address}</div>
                <div className="mt-0.5 text-[11px] font-bold text-body">{r.code}</div>
              </div>
              <div>
                <span className={`${badge} ${SALE_BADGE[r.sale]}`}>{r.sale}</span>
              </div>
              <div>
                <span className={`${badge} ${RECORD_BADGE[r.record]}`}>{r.record}</span>
              </div>
              <div className="tabular-nums">{r.listedOn ? r.listedOn.replaceAll("-", "/") : <span className="text-muted">―</span>}</div>
              <div className="text-right tabular-nums">
                <Sum v={r.inquiries} record={r.record} unit="件" />
              </div>
              <div className="text-right tabular-nums">
                <Sum v={r.viewings} record={r.record} unit="件" />
              </div>
              <div className="text-right tabular-nums">
                <Sum v={r.cost} record={r.record} unit="万円" digits={1} />
              </div>
              <div className="text-[12px] text-body tabular-nums">{r.updatedAt ? formatJstDateTime(r.updatedAt) : <span className="text-muted">―</span>}</div>
              <div className="w-[96px] text-right">
                {r.record === "未記録" ? (
                  <Link href={`/records/${r.id}`} className={btnRowPrimary}>
                    <PencilIcon className="size-3.5" />
                    記録する
                  </Link>
                ) : (
                  <Link href={`/records/${r.id}`} className={btnRow}>
                    詳細
                    <ChevronRightIcon className="size-3.5" />
                  </Link>
                )}
              </div>
            </div>
          ))
        )}
        <Pagination total={shown.length} allTotal={rows.length} from={pg.from} to={pg.to} current={pg.current} pages={pg.pages} onPage={setPage} />
      </div>
    </div>
  );
}
