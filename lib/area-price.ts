// サマリーの「周辺の価格相場」（2026-11-03 浩平さん依頼、見本画像あり）
// 物件のある区の、同じ築年数帯の戸建ての取引（D01 不動産取引価格情報）から、プログラムで中央値・価格帯・件数・半年ごとの推移を出す。AIは使わない
// 取引の条件と帯・年の範囲は事実シートの相場（M-01、lib/facts/collect.ts の houseTrades と build.ts の selectMarket）と同じにする
// 総額は広さで変わるので、比べるときの主は事実シートの坪単価（M-01・M-02）。ここでは延床の坪単価の中央値も並べる

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
  /** 例：2025上期 */
  label: string;
  /** 半年の取引の総額の中央値（円）。取引が無ければ null */
  median: number | null;
  count: number;
}

export interface AreaPriceData {
  ward: string;
  /** 例：築0〜1年 */
  band: string;
  /** 中央値・価格帯に使った取引の年の範囲（M-01 と同じ） */
  fromYear: number;
  toYear: number;
  count: number;
  /** 総額の中央値（円） */
  median: number;
  /** 価格帯：総額の 25%〜75%（中央の半分の取引が入る幅） */
  p25: number;
  p75: number;
  /** 延床の坪単価の中央値（円/坪） */
  unitMedian: number;
  /** 直近1年（取り込んだ最新の四半期から4四半期）の取引件数と、その範囲 */
  recent: { count: number; from: string; to: string };
  /** 半年ごとの総額の中央値（古い順、最新の半年まで） */
  series: PricePoint[];
  /** 対象物件の価格（円） */
  ownPrice: number;
}

/** 推移に出す半年の数（3年分） */
export const SERIES_HALVES = 6;
/** 半年の件数がこれ未満なら、画面で「件数が少ない」と薄く出す */
export const FEW_TRADES = 3;

/** 分位数（線形補間）。values は空でないこと */
export function quantile(values: number[], q: number): number {
  const s = [...values].sort((a, b) => a - b);
  const pos = (s.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return s[lo] + (s[hi] - s[lo]) * (pos - lo);
}

const half = (quarter: number) => (quarter <= 2 ? 0 : 1);
const halfLabel = (year: number, h: number) => `${year}${h === 0 ? "上期" : "下期"}`;

/**
 * 区の戸建ての取引から、物件と同じ築年数帯の価格相場を作る。帯に入る取引が無ければ null
 * trades は区の戸建ての取引（houseTrades）。latestYear は取り込んだ取引の最新の年（M-01 の「直近5年」の起点）
 */
export function areaPrice(trades: PriceTrade[], ward: string, buildingAge: number, ownPriceYen: number, latestYear: number): AreaPriceData | null {
  const band = ageBandOf(buildingAge);
  const inBand = trades.filter((t) => {
    const age = t.year - t.building_year;
    return age >= band.from && (band.to === null || age <= band.to);
  });
  const m = selectMarket(
    inBand.map((t) => ({ year: t.year, building_year: t.building_year, price: t.price, floor_sqm: t.floor_sqm, land_sqm: null })),
    band,
    latestYear,
  );
  if (!m) return null;
  const prices = m.trades.map((t) => t.price);

  // 最新の四半期（帯の取引で一番新しいもの）から数える
  const key = (t: { year: number; quarter: number }) => t.year * 4 + (t.quarter - 1);
  const last = Math.max(...inBand.map(key));
  const qLabel = (k: number) => `${Math.floor(k / 4)}年${(k % 4) + 1}Q`;
  const recentCount = inBand.filter((t) => key(t) > last - 4).length;

  const lastHalf = Math.floor(last / 4) * 2 + half((last % 4) + 1);
  const series: PricePoint[] = [];
  for (let h = lastHalf - SERIES_HALVES + 1; h <= lastHalf; h++) {
    const year = Math.floor(h / 2);
    const inHalf = inBand.filter((t) => t.year === year && half(t.quarter) === h % 2).map((t) => t.price);
    series.push({ label: halfLabel(year, h % 2), median: median(inHalf), count: inHalf.length });
  }

  return {
    ward,
    band: bandLabel(band),
    fromYear: m.fromYear,
    toYear: m.toYear,
    count: prices.length,
    median: median(prices)!,
    p25: quantile(prices, 0.25),
    p75: quantile(prices, 0.75),
    unitMedian: median(m.trades.map((t) => pricePerTsubo(t.price, t.floor_sqm)))!,
    recent: { count: recentCount, from: qLabel(last - 3), to: qLabel(last) },
    series,
    ownPrice: ownPriceYen,
  };
}
