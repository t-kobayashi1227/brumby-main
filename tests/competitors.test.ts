import { describe, expect, it } from "vitest";
import { addressToChome, filterCandidates, formatCompetitorDistance, parseCompetitorIds, sortCandidates, type CompetitorCandidate } from "../lib/competitors";
import { diffPhrase, firstSentence, parseDiffs, parsePairs } from "../lib/competitor-report";
import { quoteCompetitorView } from "../lib/facts/competitor-quote";
import { factUsage, withPlainIds } from "../lib/report";
import type { MediaOutput, StrategyOutput } from "../lib/agents/schemas";
import type { Fact } from "../lib/facts/types";

// 競合物件を、本システムで販売戦略を作った物件から選ぶ（2026-11-05 浩平さん依頼）

const cand = (id: number, distance_m: number | null, strategy_on: string, extra: Partial<CompetitorCandidate> = {}): CompetitorCandidate => ({
  id,
  code: `B${id}`,
  property_class: "中古",
  area: "新潟市西区寺尾東2丁目",
  price_man_yen: 2000,
  layout: "4LDK",
  building_sqm: 100,
  land_sqm: 200,
  building_age: 10,
  distance_m,
  strategy_on,
  sale: "未設定",
  ...extra,
});

describe("競合の候補", () => {
  it("住所は丁目まで。丁目が無ければ末尾の番地を外す", () => {
    expect(addressToChome("新潟市西区寺尾東2丁目3-4")).toBe("新潟市西区寺尾東2丁目");
    expect(addressToChome("新潟市中央区古町通七丁目1010番地")).toBe("新潟市中央区古町通七丁目");
    expect(addressToChome("新潟市秋葉区新津123-4")).toBe("新潟市秋葉区新津");
    expect(addressToChome("新潟市秋葉区新津１２３番地")).toBe("新潟市秋葉区新津");
    expect(addressToChome("新潟市北区")).toBe("新潟市北区");
  });

  it("近い順。距離が無いものは後ろで、戦略を作った日が新しい順", () => {
    const rows = [cand(1, null, "2026-11-01"), cand(2, 900, "2026-10-01"), cand(3, 300, "2026-10-01"), cand(4, null, "2026-11-03")];
    expect(sortCandidates(rows).map((r) => r.id)).toEqual([3, 2, 4, 1]);
  });

  it("物件ID・所在地で絞り込む（全角・空白はそろえる）", () => {
    const rows = [cand(1, null, "x", { code: "AB-001" }), cand(2, null, "x", { area: "新潟市江南区亀田" })];
    expect(filterCandidates(rows, "ab－001").map((r) => r.id)).toEqual([1]);
    expect(filterCandidates(rows, "江南 区").map((r) => r.id)).toEqual([2]);
    expect(filterCandidates(rows, " ")).toHaveLength(2);
  });

  it("送られた番号：空は飛ばし、最大3件・自分自身・重なり・数でないものは誤り", () => {
    expect(parseCompetitorIds(["3", "", "5"], 1)).toEqual([3, 5]);
    expect(() => parseCompetitorIds(["1"], 1)).toThrow("この物件自身");
    expect(() => parseCompetitorIds(["2", "2"], 1)).toThrow("同じ物件");
    expect(() => parseCompetitorIds(["2", "3", "4", "5"], null)).toThrow("3件まで");
    expect(() => parseCompetitorIds(["x"], null)).toThrow("選び直して");
  });

  it("距離は事実と同じ書き方。位置が無ければ ―", () => {
    expect(formatCompetitorDistance(654)).toBe("直線650m");
    expect(formatCompetitorDistance(null)).toBe("―");
  });
});

describe("競合のAIの見立ての引用", () => {
  const facts: Fact[] = [{ id: "L-04", 項目: "スーパー（1km以内）", 値: "3件", 出典: "x", 時点: "x", 状態: "取得" }];
  const strategy = {
    summary: { text: "買い物が便利な中古戸建て（L-04）。", evidence: ["L-04"] },
    appeals: [
      { rank: 2, text: "二つ目", evidence: [] },
      { rank: 1, text: "L-04 が3件", evidence: [] },
      { rank: 3, text: "三つ目", evidence: [] },
      { rank: 4, text: "四つ目", evidence: [] },
    ],
    targets: [
      { rank: 2, name: "単身" },
      { rank: 1, name: "若い夫婦" },
    ],
  };

  it("競合の事実シートで事実IDを名前に直し、訴求は rank 順に3つまで", () => {
    expect(quoteCompetitorView(strategy, facts, "2026-11-01", false)).toEqual({
      summary: "買い物が便利な中古戸建て。",
      appeals: ["スーパー（1km以内） が3件", "二つ目", "三つ目"],
      first_target: "若い夫婦",
      created_on: "2026-11-01",
      stale: false,
    });
  });

  it("総合評価が無い・形が違うときは null", () => {
    expect(quoteCompetitorView(null, facts, "2026-11-01", false)).toBeNull();
    expect(quoteCompetitorView({ appeals: [] }, facts, "2026-11-01", false)).toBeNull();
  });
});

describe("販売施策タブの競合の列（読み分け）", () => {
  it("「項目：値」と差の比較を読み分ける", () => {
    expect(parsePairs("物件ID：A1、価格：2,380万円、壊れた値")).toEqual(
      new Map([
        ["物件ID", "A1"],
        ["価格", "2,380万円"],
      ]),
    );
    expect(parseDiffs("この物件との差（この物件−競合）：価格 +1,100万円、土地面積 -10.5㎡、築年数 0年")).toEqual(
      new Map([
        ["価格", { n: 1100, unit: "万円" }],
        ["土地面積", { n: -10.5, unit: "㎡" }],
        ["築年数", { n: 0, unit: "年" }],
      ]),
    );
  });

  it("差を、この物件から見た言葉にする", () => {
    expect(diffPhrase("価格", { n: -1100, unit: "万円" })).toBe("この物件が1,100万円安い");
    expect(diffPhrase("建物面積", { n: 0, unit: "㎡" })).toBe("この物件と同じ広さ");
    expect(diffPhrase("築年数", { n: -3, unit: "年" })).toBe("この物件が3年新しい");
    expect(diffPhrase("間取り", { n: 1, unit: "" })).toBeNull();
    expect(diffPhrase("価格", undefined)).toBeNull();
  });

  it("最初の1文", () => {
    expect(firstSentence("一文目。二文目。")).toBe("一文目。");
    expect(firstSentence("句点なし")).toBe("句点なし");
  });
});

describe("レポートでの競合と比べた部分", () => {
  const facts = new Map<string, Fact>([["K-01", { id: "K-01", 項目: "競合1：物件情報", 値: "x", 出典: "x", 時点: "x", 状態: "取得" }]]);
  const main = {
    analysis: [],
    unknown: [],
    summary: { text: "t", evidence: [] },
    targets: [],
    not_fit: [],
    appeals: [],
    price_view: { position: "相場なみ", text: "t", evidence: [] },
    concerns: [],
    direction: { text: "t", evidence: [] },
    competitor_edge: { point: "K-01 より広い", cause: "c", action: "a", why_first: "w", evidence: ["K-01", "P-02"] },
    competitor_concerns: [{ rank: 1, concern: "高い", cause: "c", evidence: ["K-01", "P-03"] }],
    competitors: [{ fact_id: "K-01", buyer_view: { text: "見え方", evidence: ["K-01"] }, about_edge: true, concern_ranks: [1] }],
  } as StrategyOutput;
  const media: MediaOutput = { media: [], cautions: [] };

  it("文の中のIDは名前に直し、fact_id は事実IDのまま残す", () => {
    const r = withPlainIds(main, facts);
    expect(r.competitor_edge?.point).toBe("競合1：物件情報 より広い");
    expect(r.competitors[0].fact_id).toBe("K-01");
  });

  it("使用箇所は販売施策タブ", () => {
    const usage = factUsage(main, media);
    expect(usage.get("K-01")?.map((u) => [u.tab, u.where])).toEqual([
      ["sales", "競合と比べたおすすめポイント"],
      ["sales", "競合と比べた懸念点1"],
      ["sales", "競合ごとの見え方"],
    ]);
    expect(usage.get("P-03")?.[0].where).toBe("競合と比べた懸念点1");
  });
});
