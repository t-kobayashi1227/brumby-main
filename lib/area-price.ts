// サマリーの「区の価格相場」（2026-11-03 浩平さん依頼、見本画像あり。同日のレビューで坪単価を主にした）
// 物件のある区の、同じ築年数帯の戸建ての取引（D01 不動産取引価格情報）から、プログラムで中央値・価格帯・件数・半年ごとの推移を出す。AIは使わない
// 取引の条件と帯・年の範囲は事実シートの相場（M-01、lib/facts/collect.ts の houseTrades と build.ts の selectMarket）と同じにする
// 比べ方は事実シートと同じく延床の坪単価（docs/履歴/相場の出し方変更.md 3.6「総額の相場・相場比は出さない」）。総額は参考として価格帯だけ出し、物件の線は引かない

import { ageBandOf, bandLabel, pricePerTsubo, selectMarket } from "./facts/build";
import { median } from "./facts/format";

export interface PriceTrade {
  year: number;
  quarter: number;
  building_year: number;
  /** 円 */
  price: number;
  floor_sqm: number;
}

export interface PricePoint {
  /** 例：2025 */
  year: number;
  /** 上期・下期 */
  half: "上期" | "下期";
  /** 半年の延床の坪単価の中央値（円/坪）。取引が無ければ null */
  unitMedian: number | null;
  count: number;
  /** 取り込んだデータが半年の途中までのとき、入っている月（例：1〜3月） */
  partial?: string;
}

/** 取り込んだ取引の最新の四半期 */
export interface LatestQuarter {
  year: number;
  quarter: number;
}

export interface AreaPriceData {
  ward: string;
  /** 例：築0〜1年 */
  band: string;
  /** 中央値・価格帯に使った取引の年の範囲（M-01 と同じ） */
  fromYear: number;
  toYear: number;
  count: number;
  /** 直近5年の取引が少なく、全部の年に広げたとき true（M-01 と同じ決まり） */
  widened: boolean;
  /** 延床の坪単価の中央値（円/坪） */
  unitMedian: number;
  /** 総額の 25%〜75%（真ん中の半数の取引が入る幅）。件数が少ないときは null */
  priceRange: { p25: number; p75: number } | null;
  /** 直近1年（取り込んだ最新の四半期から4四半期）の取引件数と、その範囲（例：2025年7月〜2026年6月） */
  recent: { count: number; from: string; to: string };
  /** 半年ごとの坪単価の中央値（古い順、取り込んだ最新の半年まで） */
  series: PricePoint[];
  /** レポート作成時の物件の坪単価（円/坪）。事実シートの価格・建物面積から。出せなければ null */
  ownUnit: number | null;
}

/** 推移に出す半年の数（3年分） */
export const SERIES_HALVES = 6;
/** 半年の件数がこれ未満なら、画面で「件数が少ない」と薄く出す */
export const FEW_TRADES = 5;
/** 相場全体の件数がこれ未満なら、価格帯を出さずに「件数が少ない」と書く（事実シートの M-05 と同じ線） */
export const FEW_TOTAL = 10;
/** 「直近5年」（build.ts の MARKET_RECENT_YEARS と同じ） */
const RECENT_YEARS = 5;

/** 分位数（線形補間）。values は空でないこと */
export function quantile(values: number[], q: number): number {
  const s = [...values].sort((a, b) => a - b);
  const pos = (s.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return s[lo] + (s[hi] - s[lo]) * (pos - lo);
}

/** 四半期の通し番号（年×4＋0〜3） */
const key = (t: { year: number; quarter: number }) => t.year * 4 + (t.quarter - 1);
/** 四半期の最初・最後の月で書く：2025年7月 */
const monthLabel = (k: number, end: boolean) => `${Math.floor(k / 4)}年${(k % 4) * 3 + (end ? 3 : 1)}月`;

/**
 * 区の戸建ての取引から、物件と同じ築年数帯の価格相場を作る。帯に入る取引が無ければ null
 * trades は区の戸建ての取引（houseTrades）。latest は取り込んだ取引全体の最新の四半期（帯に取引が無い期間も「0件」と見せるため、帯の取引からは決めない）
 * buildingAge・ownUnit はレポート作成時の事実シートの値
 */
export function areaPrice(trades: PriceTrade[], ward: string, buildingAge: number, ownUnit: number | null, latest: LatestQuarter): AreaPriceData | null {
  const band = ageBandOf(buildingAge);
  const inBand = trades.filter((t) => {
    const age = t.year - t.building_year;
    return age >= band.from && (band.to === null || age <= band.to);
  });
  const m = selectMarket(
    inBand.map((t) => ({ year: t.year, building_year: t.building_year, price: t.price, floor_sqm: t.floor_sqm, land_sqm: null })),
    band,
    latest.year,
  );
  if (!m) return null;
  const prices = m.trades.map((t) => t.price);

  const last = key(latest);
  const recentCount = inBand.filter((t) => key(t) > last - 4 && key(t) <= last).length;

  // 半年の通し番号（年×2＋0/1）。最新の半年が上期の1Q・下期の3Qで終わっていれば、途中までのデータ
  const lastHalf = Math.floor(last / 2);
  const series: PricePoint[] = [];
  for (let h = lastHalf - SERIES_HALVES + 1; h <= lastHalf; h++) {
    const year = Math.floor(h / 2);
    const isFirst = h % 2 === 0;
    const inHalf = inBand.filter((t) => t.year === year && (t.quarter <= 2) === isFirst);
    const point: PricePoint = {
      year,
      half: isFirst ? "上期" : "下期",
      unitMedian: median(inHalf.map((t) => pricePerTsubo(t.price, t.floor_sqm))),
      count: inHalf.length,
    };
    if (h === lastHalf && last % 2 === 0) point.partial = isFirst ? "1〜3月" : "7〜9月";
    series.push(point);
  }

  return {
    ward,
    band: bandLabel(band),
    fromYear: m.fromYear,
    toYear: m.toYear,
    count: prices.length,
    widened: m.fromYear <= latest.year - RECENT_YEARS,
    unitMedian: median(m.trades.map((t) => pricePerTsubo(t.price, t.floor_sqm)))!,
    priceRange: prices.length >= FEW_TOTAL ? { p25: quantile(prices, 0.25), p75: quantile(prices, 0.75) } : null,
    recent: { count: recentCount, from: monthLabel(last - 3, false), to: monthLabel(last, true) },
    series,
    ownUnit,
  };
}

/** 価格相場を出せなかった理由（画面の文言を分ける） */
export type AreaPriceMissing = "no_ward" | "no_transactions" | "no_band_trades";

export type AreaPriceResult = { ok: true; data: AreaPriceData } | { ok: false; reason: AreaPriceMissing };

/** 事実シートの値から数を読む：「3,980万円」→ 3980、「98.5㎡」→ 98.5、「築12年」「新築（築0年）」→ 12・0。読めなければ null */
export function numberIn(value: string | null | undefined): number | null {
  if (!value) return null;
  const m = value.replace(/,/g, "").match(/\d+(?:\.\d+)?/g);
  if (!m) return null;
  return Number(m[m.length - 1]);
}
