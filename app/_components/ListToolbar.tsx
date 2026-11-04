"use client";

import { ChevronDownIcon, SearchIcon } from "./icons";

// 一覧の上に置く検索と絞り込み（物件一覧・販売記録で共通）。件数が少ないうちは、絞り込みは画面の中だけで行う

export function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <label className="relative flex min-w-0 flex-1 items-center">
      <SearchIcon className="pointer-events-none absolute left-3 size-4 text-muted" />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="w-full rounded-lg border border-field bg-white py-2 pl-9 pr-3 text-[13px] text-ink placeholder:text-muted focus:border-primary focus:outline-none"
      />
    </label>
  );
}

export function FilterSelect<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T | "";
  options: readonly T[];
  onChange: (v: T | "") => void;
}) {
  return (
    <label className="flex shrink-0 items-center gap-2 text-[12px] text-body">
      {label}
      <span className="relative">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value as T | "")}
          className="appearance-none rounded-lg border border-field bg-white py-2 pl-3 pr-8 text-[13px] text-ink focus:border-primary focus:outline-none"
        >
          <option value="">すべて</option>
          {options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
        <ChevronDownIcon className="pointer-events-none absolute right-2.5 top-1/2 size-4 -translate-y-1/2 text-muted" />
      </span>
    </label>
  );
}

/** 並び替えのできる見出し。押すたびに 降順 → 昇順 と切り替える */
export function SortHeader<K extends string>({
  label,
  sortKey,
  sort,
  onSort,
  className = "",
}: {
  label: string;
  sortKey: K;
  sort: { key: K; dir: "asc" | "desc" };
  onSort: (s: { key: K; dir: "asc" | "desc" }) => void;
  className?: string;
}) {
  const active = sort.key === sortKey;
  const next = active && sort.dir === "desc" ? "asc" : "desc";
  return (
    <button
      type="button"
      onClick={() => onSort({ key: sortKey, dir: next })}
      className={`flex items-center gap-1 text-left cursor-pointer hover:text-ink ${active ? "font-bold text-ink" : ""} ${className}`}
      aria-label={`${label}で並び替え`}
    >
      {label}
      <span className="text-[10px]" aria-hidden="true">
        {active ? (sort.dir === "desc" ? "▼" : "▲") : "↕"}
      </span>
    </button>
  );
}

/** 一覧の下のページ送り。件数の表示と、前へ・ページ番号・次へ。1ページに収まるときは件数だけ出す */
export function Pagination({
  total,
  allTotal,
  from,
  to,
  current,
  pages,
  onPage,
}: {
  /** 絞り込んだあとの件数 */
  total: number;
  /** 絞り込む前の件数 */
  allTotal: number;
  from: number;
  to: number;
  current: number;
  pages: number;
  onPage: (page: number) => void;
}) {
  // 絞り込み中は「13件中 2件が該当」、ページが分かれるときは表示中の範囲を添える
  const label =
    total !== allTotal
      ? `${allTotal}件中 ${total}件が該当${pages > 1 ? `（${from}–${to}件を表示）` : ""}`
      : `全${total}件中 ${from}–${to}件を表示`;
  const btn = "flex size-8 items-center justify-center rounded-md border text-[12px] font-bold";
  return (
    <div className="flex items-center justify-between pt-3">
      <div className="text-[11px] text-muted">
        {label}
      </div>
      {pages > 1 && (
        <nav className="flex items-center gap-1.5" aria-label="ページ送り">
          <button type="button" className={`${btn} border-field bg-white text-body disabled:opacity-40 cursor-pointer disabled:cursor-default`} disabled={current === 1} onClick={() => onPage(current - 1)} aria-label="前のページ">
            ‹
          </button>
          {Array.from({ length: pages }, (_, i) => i + 1).map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => onPage(n)}
              aria-current={n === current ? "page" : undefined}
              className={`${btn} cursor-pointer ${n === current ? "border-primary bg-primary text-white" : "border-field bg-white text-body hover:border-primary hover:text-primary"}`}
            >
              {n}
            </button>
          ))}
          <button type="button" className={`${btn} border-field bg-white text-body disabled:opacity-40 cursor-pointer disabled:cursor-default`} disabled={current === pages} onClick={() => onPage(current + 1)} aria-label="次のページ">
            ›
          </button>
        </nav>
      )}
    </div>
  );
}
