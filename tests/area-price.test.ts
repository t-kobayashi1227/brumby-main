import { describe, expect, it } from "vitest";
import { areaPrice, FEW_TOTAL, numberIn, quantile, type PriceTrade } from "../lib/area-price";
import { pricePerTsubo } from "../lib/facts/build";

const t = (year: number, quarter: number, age: number, man: number, floor = 100): PriceTrade => ({ year, quarter, building_year: year - age, price: man * 10_000, floor_sqm: floor });
const unit = (man: number, floor = 100) => pricePerTsubo(man * 10_000, floor);

describe("区の価格相場", () => {
  it("分位数は線形補間", () => {
    expect(quantile([1, 2, 3, 4], 0.25)).toBeCloseTo(1.75);
    expect(quantile([5], 0.75)).toBe(5);
  });

  it("事実シートの値から数を読む", () => {
    expect(numberIn("3,980万円")).toBe(3980);
    expect(numberIn("98.5㎡")).toBe(98.5);
    expect(numberIn("新築（築0年）")).toBe(0);
    expect(numberIn("築12年")).toBe(12);
    expect(numberIn(null)).toBeNull();
  });

  const trades = [
    t(2023, 1, 0, 3000),
    t(2023, 3, 1, 3200),
    t(2024, 2, 0, 3400),
    t(2024, 4, 0, 3600),
    t(2025, 1, 0, 3800),
    t(2025, 2, 1, 4000),
    t(2025, 3, 0, 4200),
    // 帯の外（築20年）は使わない
    t(2025, 3, 20, 1500),
  ];

  it("同じ築年数帯の坪単価で中央値・直近1年の件数・半年ごとの推移を出す", () => {
    const r = areaPrice(trades, "中央区", 0, unit(3980), { year: 2025, quarter: 4 })!;
    expect(r.band).toBe("築0〜1年");
    expect(r.count).toBe(7);
    expect(r.unitMedian).toBeCloseTo(unit(3600));
    expect(r.ownUnit).toBeCloseTo(unit(3980));
    expect(r.priceRange).toBeNull(); // 7件は FEW_TOTAL 未満
    expect(r.widened).toBe(false);
    // 最新は 2025年4Q。直近4四半期は 2025年1〜12月
    expect(r.recent).toEqual({ count: 3, from: "2025年1月", to: "2025年12月" });
    expect(r.series.map((s) => `${s.year}${s.half}`)).toEqual(["2023上期", "2023下期", "2024上期", "2024下期", "2025上期", "2025下期"]);
    expect(r.series.map((s) => s.count)).toEqual([1, 1, 1, 1, 2, 1]);
    expect(r.series[4].unitMedian).toBeCloseTo(unit(3900));
    expect(r.series.some((s) => s.partial)).toBe(false);
  });

  it("起点は取り込んだ取引全体の最新の四半期。帯に取引が無い期間も0件と出し、途中までの半年に印を付ける", () => {
    const r = areaPrice(trades, "中央区", 0, null, { year: 2026, quarter: 3 })!;
    expect(r.recent).toEqual({ count: 0, from: "2025年10月", to: "2026年9月" });
    const last = r.series[r.series.length - 1];
    expect(`${last.year}${last.half}`).toBe("2026下期");
    expect(last.partial).toBe("7〜9月");
    expect(last.count).toBe(0);
    expect(last.unitMedian).toBeNull();
  });

  it("件数が足りれば価格帯（25〜75%）を出す", () => {
    const many = Array.from({ length: FEW_TOTAL }, (_, i) => t(2025, 1, 0, 3000 + i * 100));
    const r = areaPrice(many, "中央区", 0, null, { year: 2025, quarter: 1 })!;
    expect(r.priceRange).toEqual({ p25: 3225 * 10_000, p75: 3675 * 10_000 });
  });

  it("帯に取引が無ければ null", () => {
    expect(areaPrice([t(2025, 1, 30, 1000)], "中央区", 0, null, { year: 2025, quarter: 1 })).toBeNull();
  });
});
