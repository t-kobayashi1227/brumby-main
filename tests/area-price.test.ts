import { describe, expect, it } from "vitest";
import { areaPrice, quantile, type PriceTrade } from "../lib/area-price";

const t = (year: number, quarter: number, age: number, man: number, floor = 100): PriceTrade => ({ year, quarter, building_year: year - age, price: man * 10_000, floor_sqm: floor });

describe("周辺の価格相場", () => {
  it("分位数は線形補間", () => {
    expect(quantile([1, 2, 3, 4], 0.25)).toBeCloseTo(1.75);
    expect(quantile([5], 0.75)).toBe(5);
  });

  it("同じ築年数帯だけで中央値・価格帯・直近1年の件数・半年ごとの推移を出す", () => {
    const trades = [
      // 新築（築0〜1年）
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
    const r = areaPrice(trades, "中央区", 0, 3980 * 10_000, 2025)!;
    expect(r.band).toBe("築0〜1年");
    expect(r.count).toBe(7);
    expect(r.median).toBe(3600 * 10_000);
    expect(r.p25).toBe(3300 * 10_000);
    expect(r.p75).toBe(3900 * 10_000);
    // 最新は 2025年3Q。直近4四半期は 2024年4Q〜2025年3Q
    expect(r.recent).toEqual({ count: 4, from: "2024年4Q", to: "2025年3Q" });
    expect(r.series.map((s) => s.label)).toEqual(["2023上期", "2023下期", "2024上期", "2024下期", "2025上期", "2025下期"]);
    expect(r.series.map((s) => s.count)).toEqual([1, 1, 1, 1, 2, 1]);
    expect(r.series[4].median).toBe(3900 * 10_000);
  });

  it("帯に取引が無ければ null", () => {
    expect(areaPrice([t(2025, 1, 30, 1000)], "中央区", 0, 1, 2025)).toBeNull();
  });
});
