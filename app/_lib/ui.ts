// Shared Tailwind class strings for recurring UI patterns.

export const card = "bg-white border border-line rounded-[10px]";

export const btnPrimary = "px-5 py-2.5 bg-brand rounded-md text-white text-[13px] font-bold cursor-pointer";

/** 新しいデザイン（2026-10-26）の青い主ボタン */
export const btnAction = "flex items-center gap-1.5 rounded-lg bg-primary px-5 py-2.5 text-[13px] font-bold text-white shadow-sm cursor-pointer hover:bg-[#2459b0] disabled:opacity-60";

export const btnSecondary = "px-5 py-2.5 bg-white border border-field rounded-md text-body text-[13px] cursor-pointer";

export const tableHead = "grid gap-2 text-base px-1 pb-2 border-b border-canvas";

export const emptyState = `${card} p-10 text-center text-[13px] text-muted`;

// ---- class helpers for stateful UI parts ----

export function navItemClass(active: boolean): string {
  return `flex items-center gap-3 px-3.5 py-3 rounded-lg text-[13px] cursor-pointer text-white ${active ? "bg-white/20 font-bold" : "hover:bg-white/10"}`;
}

export function underlineTabClass(active: boolean): string {
  return `px-4 py-2.5 text-[13px] cursor-pointer whitespace-nowrap ${active ? "text-brand font-bold border-b-2 border-brand" : "text-muted"}`;
}

/** 一覧の状態バッジ（色は呼ぶ側で足す） */
export const badge = "inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-[11px] font-bold";

/** 販売状況のバッジの色（販売記録の一覧・競合の選択で同じ色） */
export const SALE_BADGE: Record<"販売中" | "販売前" | "販売済み" | "販売中止" | "未設定", string> = {
  販売中: "bg-primary-soft text-primary",
  販売前: "bg-[#e6f6f7] text-[#0f6e78]",
  販売済み: "bg-[#e9f8ec] text-[#157347]",
  販売中止: "bg-[#eceef2] text-[#5b6476]",
  未設定: "bg-[#f1f3f6] text-muted",
};

/** 一覧の行の右端の小さなボタン */
export const btnRow = "relative z-10 inline-flex items-center gap-0.5 whitespace-nowrap rounded-md border border-field bg-white px-3 py-1.5 text-[12px] font-bold text-body hover:border-primary hover:text-primary";
export const btnRowPrimary = "relative z-10 inline-flex items-center gap-1 whitespace-nowrap rounded-md bg-primary px-3 py-1.5 text-[12px] font-bold text-white hover:bg-[#2459b0]";
