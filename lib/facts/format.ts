// 事実の「値」の書き方。距離はすべて直線距離で「直線」と書き、徒歩分には直さない（CLAUDE.md）

/**
 * 直線距離：1km未満は10m単位（直線650m）、1km以上は0.1km単位（直線1.1km）
 * 1km未満は丸めても1000mにせず990mにする。1km以内の一覧に「直線1000m」と出て境目の外に見えないように（docs/履歴/事実シートの修正_実装案.md 1.5）
 */
export function formatDistance(meters: number): string {
  if (meters < 1000) return `直線${Math.min(990, Math.round(meters / 10) * 10)}m`;
  return `直線${(Math.round(meters / 100) / 10).toFixed(1)}km`;
}

/** 日本時間の今日（YYYY-MM-DD） */
export function todayJst(now = new Date()): string {
  return now.toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });
}

/** 日本時間の ISO 形式（2026-10-23T15:30:00+09:00） */
export function nowJstIso(now = new Date()): string {
  return `${new Date(now.getTime() + 9 * 3600_000).toISOString().slice(0, 19)}+09:00`;
}

/** 画面に出す日本時間の日時（2026/11/1 21:30）。秒は出さない */
export function formatJstDateTime(value: Date | string): string {
  return new Date(value).toLocaleString("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * 年齢 → 年代の言い方（30 → 「30代前半」、35 → 「30代半ば」、38 → 「30代後半」）
 * ターゲット候補の返済の目安で、計算に使う年齢を「代表年齢55歳」ではなく年代で伝えるため（2026-11-04 浩平さん指摘）
 * 一の位が0〜3は前半、4〜6は半ば、7〜9は後半
 */
export function ageBand(age: number): string {
  const decade = Math.floor(age / 10) * 10;
  const r = age - decade;
  return `${decade}代${r <= 3 ? "前半" : r <= 6 ? "半ば" : "後半"}`;
}

/** 3桁ごとのカンマ */
export function formatNumber(n: number, digits = 0): string {
  return n.toLocaleString("ja-JP", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

/** 面積 → 「100㎡」「120.09㎡」（小数は2桁まで、末尾の0は付けない） */
export function formatSqm(n: number): string {
  const s = formatNumber(n, Number.isInteger(n) ? 0 : 2);
  return `${s.includes(".") ? s.replace(/\.?0+$/, "") : s}㎡`;
}

/** 円 → 「2,480万円」（1万円単位で四捨五入） */
export function formatManYen(yen: number): string {
  return `${formatNumber(Math.round(yen / 10_000))}万円`;
}

/** 円 → 「6.6万円」（0.1万円単位で四捨五入） */
export function formatManYen1(yen: number): string {
  return `${(Math.round(yen / 1000) / 10).toFixed(1)}万円`;
}

/** 割合（%） → 「15.8%」 */
export function formatPct(pct: number, digits = 1): string {
  return `${pct.toFixed(digits)}%`;
}

/** 変化率（%） → 「+2.4%」「-8.2%」 */
export function formatChange(pct: number, digits = 1): string {
  const r = Number(pct.toFixed(digits));
  return `${r > 0 ? "+" : ""}${r.toFixed(digits)}%`;
}

export interface NearbyItem {
  name: string;
  distance_m: number;
}

/** 1km以内の一覧に出す数（近い順） */
const LIST_LIMIT = 5;

/**
 * 周りの施設の値（設計まとめ「周りの施設（L）の渡し方」）
 * 1km以内にあれば「3件：○○ 直線650m、…」（6件以上は近い順に5件と「ほかN件」）
 * 無ければ「0件。3km以内の最寄り：○○ 直線1.1km」か「0件。3km以内になし」
 */
export function formatNearby(within1km: NearbyItem[], nearest3km: NearbyItem | null): string {
  if (within1km.length === 0) {
    return nearest3km ? `0件。3km以内の最寄り：${nearest3km.name} ${formatDistance(nearest3km.distance_m)}` : "0件。3km以内になし";
  }
  const shown = within1km.slice(0, LIST_LIMIT).map((f) => `${f.name} ${formatDistance(f.distance_m)}`);
  const rest = within1km.length - shown.length;
  return `${within1km.length}件：${shown.join("、")}${rest > 0 ? ` ほか${rest}件` : ""}`;
}

/** 中央値。空なら null */
export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}
