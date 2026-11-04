import { describe, expect, it } from "vitest";
import { daysOnMarket, grandTotal, OTHER_MEDIA, readMediaResult, readSalesRecord, salesStage, totalsByMedia } from "../lib/records";

const form = (values: Record<string, string>) => ({ get: (k: string) => values[k] ?? null });
const OPTS = { mediaIds: ["C-01", "C-11"], households: ["若い夫婦", "60歳以上"] };

describe("readSalesRecord", () => {
  it("空の欄は null（不明）にし、値下げの回数は 0 にする", () => {
    const r = readSalesRecord(form({ status: "販売中" }), OPTS);
    expect(r).toMatchObject({ status: "販売中", listed_on: null, price_cut_count: 0, buyer_age_band: null, buyer_first_media_id: null });
  });

  it("販売済み（成約）のときは成約日と成約価格が要る", () => {
    expect(() => readSalesRecord(form({ status: "成約", contracted_on: "2026-12-01" }), OPTS)).toThrow("成約日と成約価格");
    const r = readSalesRecord(form({ status: "成約", listed_on: "2026-11-01", contracted_on: "2026-12-01", contract_price_man_yen: "2,380" }), OPTS);
    expect(r.contract_price_man_yen).toBe(2380);
  });

  it("成約日が販売開始日より前ならはじく", () => {
    expect(() => readSalesRecord(form({ listed_on: "2026-11-01", contracted_on: "2026-10-01" }), OPTS)).toThrow("前になっています");
  });

  it("選択肢にない値をはじく", () => {
    expect(() => readSalesRecord(form({ buyer_age_band: "80代" }), OPTS)).toThrow("買主の年代");
    expect(() => readSalesRecord(form({ buyer_household: "知らない世帯" }), OPTS)).toThrow("買主の世帯");
    expect(readSalesRecord(form({ buyer_household: "その他" }), OPTS)).toMatchObject({ buyer_household: "その他" });
  });

  it("最初に知った媒体：一覧の ID か、その他＋名前", () => {
    expect(readSalesRecord(form({ buyer_first_media_id: "C-11" }), OPTS)).toMatchObject({ buyer_first_media_id: "C-11", buyer_first_media_other: null });
    expect(readSalesRecord(form({ buyer_first_media_id: OTHER_MEDIA, buyer_first_media_other: "地元の情報誌" }), OPTS)).toMatchObject({ buyer_first_media_id: null, buyer_first_media_other: "地元の情報誌" });
    expect(() => readSalesRecord(form({ buyer_first_media_id: OTHER_MEDIA }), OPTS)).toThrow("媒体の名前");
    expect(() => readSalesRecord(form({ buyer_first_media_id: "C-99" }), OPTS)).toThrow("選び直して");
  });
});

describe("readMediaResult", () => {
  it("媒体と開始日は必須", () => {
    expect(() => readMediaResult(form({ started_on: "2026-11-01" }), OPTS)).toThrow("媒体を選んでください");
    expect(() => readMediaResult(form({ media_id: "C-01" }), OPTS)).toThrow("開始日");
  });

  it("費用は0.1万円単位にそろえ、空の件数は null、0 は 0 のまま", () => {
    const r = readMediaResult(form({ media_id: "C-01", started_on: "2026-11-01", cost_man_yen: "3.46", inquiries: "0", views: "" }), OPTS);
    expect(r).toMatchObject({ media_id: "C-01", other_name: null, cost_man_yen: 3.5, inquiries: 0, views: null });
  });

  it("小数の件数、負の数、終了日が開始日より前をはじく", () => {
    const base = { media_id: "C-01", started_on: "2026-11-01" };
    expect(() => readMediaResult(form({ ...base, inquiries: "1.5" }), OPTS)).toThrow("整数");
    expect(() => readMediaResult(form({ ...base, cost_man_yen: "-1" }), OPTS)).toThrow("0以上");
    expect(() => readMediaResult(form({ ...base, ended_on: "2026-10-31" }), OPTS)).toThrow("前になっています");
  });
});

describe("daysOnMarket", () => {
  it("販売開始日から成約日までの日数。どちらかが無ければ null", () => {
    expect(daysOnMarket("2026-11-01", "2026-12-01")).toBe(30);
    expect(daysOnMarket(null, "2026-12-01")).toBeNull();
  });
});

describe("salesStage", () => {
  const none = { hasSucceeded: false, latest: null };
  const done = { hasSucceeded: true, latest: "succeeded" };

  it("販売の入力があればそれを優先し、成約は販売済みにする", () => {
    expect(salesStage("成約", done)).toBe("販売済み");
    expect(salesStage("販売中", none)).toBe("販売中");
    expect(salesStage("販売中止", done)).toBe("販売中止");
  });

  it("入力が無いか販売前なら、販売戦略の有無で決める", () => {
    expect(salesStage(null, done)).toBe("戦略作成済み");
    expect(salesStage("販売前", done)).toBe("戦略作成済み");
    expect(salesStage(null, { hasSucceeded: false, latest: "running" })).toBe("戦略作成中");
    expect(salesStage(null, { hasSucceeded: false, latest: "failed" })).toBe("未着手");
    expect(salesStage("販売前", none)).toBe("未着手");
  });

  it("最新の実行が失敗でも、前に完了した戦略があれば戦略作成済み", () => {
    expect(salesStage(null, { hasSucceeded: true, latest: "failed" })).toBe("戦略作成済み");
  });
});

describe("totalsByMedia", () => {
  const row = (media_id: string | null, name: string, started_on: string, cost: number | null, inquiries: number | null, viewings: number | null) => ({
    media_id,
    name,
    started_on,
    cost_man_yen: cost,
    inquiries,
    viewings,
  });

  it("媒体ごとに足し、最初に掲載した順に並べる", () => {
    const t = totalsByMedia([
      row("M02", "SUUMO", "2026-10-10", 3.3, 2, 1),
      row("M01", "自社HP", "2026-10-01", null, 1, 0),
      row("M02", "SUUMO", "2026-09-20", 0.1, 3, null),
    ]);
    expect(t.map((x) => x.mediaId)).toEqual(["M02", "M01"]);
    expect(t[0]).toEqual({ mediaId: "M02", name: "SUUMO", periods: 2, firstStartedOn: "2026-09-20", costManYen: 3.4, inquiries: 5, viewings: 1 });
  });

  it("どの行にも入っていない値は null（0件と分ける）", () => {
    const [t] = totalsByMedia([row("M01", "自社HP", "2026-10-01", null, null, 0)]);
    expect(t.costManYen).toBeNull();
    expect(t.inquiries).toBeNull();
    expect(t.viewings).toBe(0);
  });

  it("「その他」の媒体は名前でまとめる", () => {
    const t = totalsByMedia([row(null, "地域情報誌", "2026-10-01", 1, 1, 1), row(null, "チラシ", "2026-10-02", 1, 0, 0), row(null, "地域情報誌", "2026-10-03", 1, 1, 0)]);
    expect(t.map((x) => [x.name, x.periods])).toEqual([
      ["地域情報誌", 2],
      ["チラシ", 1],
    ]);
  });

  it("記録が無ければ空", () => {
    expect(totalsByMedia([])).toEqual([]);
  });
});

describe("grandTotal", () => {
  it("全媒体の合計。どれにも無い値は null", () => {
    const t = totalsByMedia([
      { media_id: "M01", name: "A", started_on: "2026-10-01", cost_man_yen: 0.1, inquiries: 1, viewings: null },
      { media_id: "M02", name: "B", started_on: "2026-10-01", cost_man_yen: 0.2, inquiries: null, viewings: null },
    ]);
    expect(grandTotal(t)).toEqual({ costManYen: 0.3, inquiries: 1, viewings: null });
  });
});
