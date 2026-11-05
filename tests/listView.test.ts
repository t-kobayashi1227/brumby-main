import { describe, expect, it } from "vitest";
import { compareNullable, matchesQuery, paginate, recordState, saleState, saleStateOrder, strategyState } from "../lib/listView";

describe("strategyState", () => {
  it("一番新しい実行の状態から決める", () => {
    expect(strategyState("succeeded")).toBe("戦略作成済み");
    expect(strategyState("queued")).toBe("作成中");
    expect(strategyState("running")).toBe("作成中");
    expect(strategyState("failed")).toBe("作成失敗");
    expect(strategyState(null)).toBe("未作成");
    // 登録の直後（周辺情報を集めていて、まだ実行の行が無い）は作成中
    expect(strategyState(null, true)).toBe("作成中");
    expect(strategyState("succeeded", true)).toBe("戦略作成済み");
  });
});

describe("saleState", () => {
  it("販売記録の入力だけで決め、販売戦略の有無は見ない", () => {
    expect(saleState("成約")).toBe("販売済み");
    expect(saleState("販売中")).toBe("販売中");
    expect(saleState("販売前")).toBe("販売前");
    expect(saleState("販売中止")).toBe("販売中止");
    expect(saleState(null)).toBe("未設定");
  });

  it("販売中を先に並べる", () => {
    expect(saleStateOrder("販売中")).toBeLessThan(saleStateOrder("未設定"));
    expect(saleStateOrder("未設定")).toBeLessThan(saleStateOrder("販売済み"));
  });
});

describe("recordState", () => {
  it("媒体の実績が1行でもあれば記録あり（0件の実績も記録あり）", () => {
    expect(recordState(0)).toBe("未記録");
    expect(recordState(1)).toBe("記録あり");
  });
});

describe("matchesQuery", () => {
  it("物件ID・住所の一部で当たり、全角・半角や大文字・小文字を区別しない", () => {
    const f = ["BR-2026-0011", "新潟県新潟市中央区大島１９２－８"];
    expect(matchesQuery(f, "")).toBe(true);
    expect(matchesQuery(f, "br-2026-0011")).toBe(true);
    expect(matchesQuery(f, "0011")).toBe(true);
    expect(matchesQuery(f, "大島192")).toBe(true);
    expect(matchesQuery(f, "中央区 大島")).toBe(true);
    expect(matchesQuery(f, "西区")).toBe(false);
  });
});

describe("compareNullable", () => {
  it("null は向きにかかわらず最後", () => {
    const xs = [3, null, 1, 2];
    expect([...xs].sort((a, b) => compareNullable(a, b, "asc"))).toEqual([1, 2, 3, null]);
    expect([...xs].sort((a, b) => compareNullable(a, b, "desc"))).toEqual([3, 2, 1, null]);
  });
});

describe("paginate", () => {
  it("10件ずつに分け、最後のページは残りだけ", () => {
    expect(paginate(13, 1)).toMatchObject({ pages: 2, current: 1, start: 0, end: 10, from: 1, to: 10 });
    expect(paginate(13, 2)).toMatchObject({ pages: 2, current: 2, start: 10, end: 13, from: 11, to: 13 });
  });

  it("ちょうど10件なら1ページ", () => {
    expect(paginate(10, 1)).toMatchObject({ pages: 1, from: 1, to: 10 });
  });

  it("範囲外のページは端に寄せる（絞り込みで件数が減ったとき）", () => {
    expect(paginate(3, 2)).toMatchObject({ pages: 1, current: 1, from: 1, to: 3 });
    expect(paginate(13, 0)).toMatchObject({ current: 1 });
  });

  it("0件でも1ページとして扱い、0–0件と出す", () => {
    expect(paginate(0, 1)).toMatchObject({ pages: 1, current: 1, start: 0, end: 0, from: 0, to: 0 });
  });
});
