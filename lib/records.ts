// 販売記録（docs/設計まとめ.md「販売記録」）の選択肢と、入力欄の読み取り
// 値は supabase/migrations/20261031120000_sales_records.sql の check 制約と合わせる

export const SALE_STATUSES = ["販売前", "販売中", "成約", "販売中止"] as const;
/** 画面に出す言葉（DBの値「成約」は画面では「販売済み」と出す。2026-11-03 浩平さん指示で言葉をそろえた） */
export const SALE_STATUS_LABEL: Record<(typeof SALE_STATUSES)[number], string> = { 販売前: "販売前", 販売中: "販売中", 成約: "販売済み", 販売中止: "販売中止" };
export const BUYER_AGE_BANDS = ["20代以下", "30代", "40代", "50代", "60代", "70代以上"] as const;
/** 媒体一覧にない媒体を選ぶときの値 */
export const OTHER_MEDIA = "other";

type Form = Pick<FormData, "get">;

function text(f: Form, name: string): string | null {
  const v = String(f.get(name) ?? "").trim();
  return v === "" ? null : v;
}

function num(f: Form, name: string, label: string, opts: { int?: boolean; positive?: boolean } = {}): number | null {
  const raw = text(f, name);
  if (raw === null) return null;
  const n = Number(raw.normalize("NFKC").replace(/[,，]/g, ""));
  if (!Number.isFinite(n)) throw new Error(`${label}には数字を入れてください`);
  if (opts.int && !Number.isInteger(n)) throw new Error(`${label}は整数で入れてください`);
  if (n < 0) throw new Error(`${label}は0以上にしてください`);
  if (opts.positive && n === 0) throw new Error(`${label}は0より大きい数にしてください`);
  return n;
}

function date(f: Form, name: string, label: string): string | null {
  const v = text(f, name);
  if (v === null) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(Date.parse(v))) throw new Error(`${label}の日付が正しくありません`);
  return v;
}

function choice<T extends string>(f: Form, name: string, choices: readonly T[], label: string): T | null {
  const v = text(f, name);
  if (v === null) return null;
  if (!(choices as readonly string[]).includes(v)) throw new Error(`${label}を選び直してください`);
  return v as T;
}

/** 媒体の欄：媒体一覧の ID か「その他」＋名前 */
function media(f: Form, idName: string, otherName: string, mediaIds: readonly string[], label: string, required: boolean) {
  const id = text(f, idName);
  if (id === null) {
    if (required) throw new Error(`${label}を選んでください`);
    return { media_id: null, other: null };
  }
  if (id === OTHER_MEDIA) {
    const other = text(f, otherName);
    if (other === null) throw new Error(`${label}が「その他」のときは、媒体の名前を入れてください`);
    return { media_id: null, other };
  }
  if (!mediaIds.includes(id)) throw new Error(`${label}を選び直してください`);
  return { media_id: id, other: null };
}

export function readSalesRecord(f: Form, opts: { mediaIds: readonly string[]; households: readonly string[] }) {
  const status = choice(f, "status", SALE_STATUSES, "販売の状況") ?? "販売中";
  const listed_on = date(f, "listed_on", "販売開始日");
  const contracted_on = date(f, "contracted_on", "成約日");
  if (listed_on && contracted_on && contracted_on < listed_on) throw new Error("成約日が販売開始日より前になっています");
  const contract_price_man_yen = num(f, "contract_price_man_yen", "成約価格", { int: true, positive: true });
  if (status === "成約" && (contracted_on === null || contract_price_man_yen === null)) throw new Error("販売済みのときは、成約日と成約価格を入れてください");
  const first = media(f, "buyer_first_media_id", "buyer_first_media_other", opts.mediaIds, "買主が最初に知った媒体", false);
  return {
    status,
    listed_on,
    list_price_man_yen: num(f, "list_price_man_yen", "販売開始時の価格", { int: true, positive: true }),
    price_cut_count: num(f, "price_cut_count", "値下げの回数", { int: true }) ?? 0,
    final_price_man_yen: num(f, "final_price_man_yen", "最後の売出価格", { int: true, positive: true }),
    contracted_on,
    contract_price_man_yen,
    buyer_age_band: choice(f, "buyer_age_band", BUYER_AGE_BANDS, "買主の年代"),
    buyer_household: choice(f, "buyer_household", [...opts.households, "その他"], "買主の世帯"),
    buyer_first_media_id: first.media_id,
    buyer_first_media_other: first.other,
    note: text(f, "note"),
  };
}

export function readMediaResult(f: Form, opts: { mediaIds: readonly string[] }) {
  const m = media(f, "media_id", "other_name", opts.mediaIds, "媒体", true);
  const started_on = date(f, "started_on", "開始日");
  if (started_on === null) throw new Error("開始日を入れてください");
  const ended_on = date(f, "ended_on", "終了日");
  if (ended_on && ended_on < started_on) throw new Error("終了日が開始日より前になっています");
  const cost = num(f, "cost_man_yen", "費用");
  return {
    media_id: m.media_id,
    other_name: m.other,
    started_on,
    ended_on,
    // 0.1万円単位にそろえる
    cost_man_yen: cost === null ? null : Math.round(cost * 10) / 10,
    reach_count: num(f, "reach_count", "表示回数・配布部数", { int: true }),
    views: num(f, "views", "閲覧数", { int: true }),
    inquiries: num(f, "inquiries", "問い合わせ件数", { int: true }),
    viewings: num(f, "viewings", "内見件数", { int: true }),
    note: text(f, "note"),
  };
}

/** 販売開始日から成約日までの日数（どちらかが無ければ null） */
export function daysOnMarket(listedOn: string | null, contractedOn: string | null): number | null {
  if (!listedOn || !contractedOn) return null;
  return Math.round((Date.parse(contractedOn) - Date.parse(listedOn)) / 86_400_000);
}

/** 販売記録の一覧に出すステータス（色分けのバッジ） */
export type SalesStage = "未着手" | "戦略作成中" | "戦略作成済み" | "販売中" | "販売済み" | "販売中止";

/**
 * 販売記録の入力（sales_records.status）と販売戦略の作成状況（strategy_runs）から、物件がいまどの段階にあるかを決める
 * - 販売の入力があれば、それを優先する（DBの値「成約」は「販売済み」と表示する）
 * - 入力が無い、または「販売前」のときは、販売戦略の有無で決める（一度でも完了していれば「戦略作成済み」）
 */
export function salesStage(saleStatus: string | null, strategy: { hasSucceeded: boolean; latest: string | null }): SalesStage {
  if (saleStatus === "成約") return "販売済み";
  if (saleStatus === "販売中") return "販売中";
  if (saleStatus === "販売中止") return "販売中止";
  if (strategy.hasSucceeded) return "戦略作成済み";
  if (strategy.latest === "queued" || strategy.latest === "running") return "戦略作成中";
  return "未着手";
}

/** 販売施策タブの「販売記録の実績」に出す、媒体ごとの合計 */
export interface MediaResultTotal {
  /** 媒体一覧の ID。「その他」の媒体は null */
  mediaId: string | null;
  name: string;
  /** 記録の行数（掲載の期間の数） */
  periods: number;
  /** 一番早い開始日（YYYY-MM-DD） */
  firstStartedOn: string;
  /** 合計。どの行にも入っていなければ null（0件と「記録なし」を分ける） */
  costManYen: number | null;
  inquiries: number | null;
  viewings: number | null;
}

type ResultRow = { media_id: string | null; name: string; started_on: string; cost_man_yen: number | null; inquiries: number | null; viewings: number | null };

const addOrNull = (a: number | null, b: number | null) => (b === null ? a : (a ?? 0) + b);

/**
 * 媒体ごとの実績（media_results の行）を媒体ごとに足し合わせる。数えるのはシステムで、AI は使わない
 * - 媒体一覧の媒体は ID で、「その他」は名前でまとめる
 * - 費用は0.1万円単位で丸める（小数の足し算の誤差を出さない）
 * - 並びは最初に掲載した順（同じ日は記録の順）
 */
export function totalsByMedia(rows: ResultRow[]): MediaResultTotal[] {
  const byKey = new Map<string, MediaResultTotal>();
  for (const r of rows) {
    const key = r.media_id ? `id:${r.media_id}` : `other:${r.name}`;
    const t = byKey.get(key) ?? { mediaId: r.media_id, name: r.name, periods: 0, firstStartedOn: r.started_on, costManYen: null, inquiries: null, viewings: null };
    t.periods += 1;
    if (r.started_on < t.firstStartedOn) t.firstStartedOn = r.started_on;
    t.costManYen = addOrNull(t.costManYen, r.cost_man_yen);
    if (t.costManYen !== null) t.costManYen = Math.round(t.costManYen * 10) / 10;
    t.inquiries = addOrNull(t.inquiries, r.inquiries);
    t.viewings = addOrNull(t.viewings, r.viewings);
    byKey.set(key, t);
  }
  return [...byKey.values()].sort((a, b) => (a.firstStartedOn < b.firstStartedOn ? -1 : a.firstStartedOn > b.firstStartedOn ? 1 : 0));
}

/** 媒体ごとの合計を、全媒体でもう一度足す（表の「合計」行） */
export function grandTotal(totals: MediaResultTotal[]): Pick<MediaResultTotal, "costManYen" | "inquiries" | "viewings"> {
  const sum = (k: "costManYen" | "inquiries" | "viewings") => totals.reduce<number | null>((a, t) => addOrNull(a, t[k]), null);
  const cost = sum("costManYen");
  return { costManYen: cost === null ? null : Math.round(cost * 10) / 10, inquiries: sum("inquiries"), viewings: sum("viewings") };
}
