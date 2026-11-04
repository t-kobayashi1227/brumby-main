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
