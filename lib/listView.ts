// 物件一覧・販売記録の一覧で使う、状態の言葉・検索・並び替え（2026-11-05 浩平さんの UI/UX レビュー）
// 物件一覧は「販売戦略の作成状態」、販売記録は「販売状況」と「活動の記録状況」を出し、2つを混ぜない

/** 販売戦略の作成状態（物件一覧の「販売戦略」欄と絞り込み） */
export const STRATEGY_STATES = ["戦略作成済み", "作成中", "作成失敗", "未作成"] as const;
export type StrategyState = (typeof STRATEGY_STATES)[number];

/**
 * 一番新しい実行（strategy_runs.status）から、作成状態を決める
 * 「完了」だと販売が終わったのかAIの作成が終わったのか分かりにくいため、「戦略作成済み」と言い切る
 */
export function strategyState(latest: string | null): StrategyState {
  if (latest === "succeeded") return "戦略作成済み";
  if (latest === "queued" || latest === "running") return "作成中";
  if (latest === "failed") return "作成失敗";
  return "未作成";
}

/** 販売状況（販売記録の一覧）。販売記録をまだ入れていない物件は「未設定」 */
export const SALE_STATES = ["販売中", "販売前", "未設定", "販売済み", "販売中止"] as const;
export type SaleState = (typeof SALE_STATES)[number];

/** sales_records.status（DBの値）→ 画面の言葉。DBの「成約」は画面では「販売済み」（2026-11-03 浩平さん指示） */
export function saleState(status: string | null): SaleState {
  if (status === "成約") return "販売済み";
  if (status === "販売中" || status === "販売前" || status === "販売中止") return status;
  return "未設定";
}

/** 販売記録の一覧の既定の並び：販売中の物件を先に出す（SALE_STATES の順） */
export function saleStateOrder(s: SaleState): number {
  return SALE_STATES.indexOf(s);
}

/** 活動の記録状況。媒体ごとの実績（media_results）が1行でもあれば「記録あり」 */
export type RecordState = "記録あり" | "未記録";
export function recordState(mediaRows: number): RecordState {
  return mediaRows > 0 ? "記録あり" : "未記録";
}

/** 検索用に文字をそろえる（全角の数字・英字・記号を半角に、空白を消し、英字は大文字に） */
export function normalizeForSearch(s: string): string {
  return s.normalize("NFKC").replace(/\s+/g, "").toUpperCase();
}

/** 物件ID・住所に、検索の言葉が含まれるか。空の検索はすべて当てはまる */
export function matchesQuery(fields: (string | null)[], query: string): boolean {
  const q = normalizeForSearch(query);
  if (q === "") return true;
  return fields.some((f) => f !== null && normalizeForSearch(f).includes(q));
}

/**
 * 値の比べ方（並び替え用）。null は向きにかかわらず最後に回す
 */
export function compareNullable(a: number | null, b: number | null, dir: "asc" | "desc"): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return dir === "asc" ? a - b : b - a;
}
