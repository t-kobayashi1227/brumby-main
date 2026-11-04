import { describe, expect, it } from "vitest";
import type { MediaOutput } from "../lib/agents/schemas";
import { compactValue, concernTopic, evidenceText, factOrigin, factUsage, groupByAspect, factsToCheck, nextCheck, placeOfAnalysis, plainIds, unknownToShow, withPlainIds, shortLabel, sourceList, splitValue, unitPriceOf, usedFactIds, summaryFeatures, featureText, targetDefinition, TARGET_IMAGES, targetPoints, TARGET_POINTS, MAX_TARGET_POINTS, defaultBudgetIndex, firstSentence, aspectLine, pickAspectFact, MEDIA_NOTES } from "../lib/report";
import type { StrategyOutput } from "../lib/agents/schemas";
import type { Fact } from "../lib/facts/types";

const fact = (id: string, 出典: string, 時点: string, 値: string | null = "x", 比較?: string): Fact => ({
  id,
  項目: `項目${id}`,
  値,
  ...(比較 ? { 比較 } : {}),
  出典,
  時点,
  状態: 値 === null ? "取得できず" : "取得",
});

const FACTS = [
  fact("A-03", "新潟市OD 町名別5歳階級人口", "2026-09", "15.8%", "西区 11.9%"),
  fact("L-11", "OpenStreetMap・新潟県 大規模小売店舗一覧", "2026-10-24・2026-09"),
  fact("H-02", "国土数値情報 A33", "2025"),
  fact("P-02", "入力", "2026-10"),
  fact("T-03", "国土数値情報 S12", "2024", null),
];

const DATASETS = [
  { id: "D10", name: "町名別5歳階級人口", provider: "新潟市OD", as_of: "2026-09", row_count: 1, attribution: "出典：新潟市オープンデータ（CC BY 2.1 JP）を加工して作成" },
  { id: "D28", name: "スーパー・ドラッグストア・コンビニ", provider: "OpenStreetMap（Geofabrik 中部地方）", as_of: "2026-10-24", row_count: 1, attribution: "© OpenStreetMap contributors（ODbL）" },
  { id: "D29", name: "大規模小売店舗一覧", provider: "新潟県", as_of: "2026-09", row_count: 1, attribution: null },
  { id: "D33", name: "土砂災害警戒区域（A33）", provider: "国土数値情報", as_of: "2025", row_count: 1, attribution: "この国土数値情報（土砂災害警戒区域データ）は…" },
  { id: "D34", name: "津波浸水想定（A40）", provider: "国土数値情報", as_of: "2017", row_count: 1, attribution: "出典：国土数値情報（国土交通省）を加工して作成（CC BY 4.0）" },
];

const s = (evidence: string[]) => ({ text: "t", evidence });
const main: StrategyOutput = {
  analysis: [{ topic: "立地", fact: "f", meaning: "m", use: "u", evidence: ["T-03"], confidence: "中" }],
  unknown: [],
  summary: s(["P-02", "A-03"]),
  targets: [{ rank: 1, name: "x", source: "候補", definition: null, reason: "r", evidence: ["A-03"], confidence: "高" }],
  not_fit: [{ name: "単身", reason: "r", evidence: ["H-99"] }],
  appeals: [{ rank: 1, ...s(["L-11"]) }],
  price_view: { position: "相場なみ", ...s(["P-02"]) },
  concerns: [{ ...s(["H-02"]), action: "a" }],
  direction: s([" A-03 "]),
};
const media: MediaOutput = { media: [], cautions: [] };

describe("レポートの根拠と出典", () => {
  it("使った事実ID（使用箇所と同じ集め方。分析は含め、画面に出さない合わない層は含めない）", () => {
    expect(usedFactIds(main, media)).toEqual(["P-02", "A-03", "H-02", "L-11", "T-03"]);
  });

  it("根拠の書き方。取れなかった事実は「不明」", () => {
    expect(evidenceText(FACTS[0])).toBe("項目A-03 15.8%（西区 11.9%）");
    expect(evidenceText(FACTS[4])).toBe("項目T-03 不明");
  });

  it("出典と時点の一覧（事実シートの順）と、使ったデータのクレジット文言", () => {
    const r = sourceList(FACTS, usedFactIds(main, media), DATASETS);
    expect(r.rows).toEqual([
      { 出典: "新潟市OD 町名別5歳階級人口", 時点: "2026-09" },
      { 出典: "OpenStreetMap・新潟県 大規模小売店舗一覧", 時点: "2026-10-24・2026-09" },
      { 出典: "国土数値情報 A33", 時点: "2025" },
      { 出典: "入力", 時点: "2026-10" },
      { 出典: "国土数値情報 S12", 時点: "2024" },
    ]);
    // 津波（A40）は使っていないので出さない。A33 は決まった文言
    expect(r.credits).toEqual(["出典：新潟市オープンデータ（CC BY 2.1 JP）を加工して作成", "© OpenStreetMap contributors（ODbL）", "この国土数値情報（土砂災害警戒区域データ）は…"]);
  });
});

describe("6タブへの振り分け", () => {
  const an = (topic: StrategyOutput["analysis"][number]["topic"], evidence: string[]) => ({ topic, fact: "f", meaning: `m-${topic}`, use: "u", evidence, confidence: "中" as const });

  it("分析の出し先：価格・組み合わせはタブ、災害・規制の根拠は土地・災害、ほかは topic と根拠で決める", () => {
    expect(placeOfAnalysis(an("価格", ["M-01", "H-01"]))).toEqual({ tab: "price" });
    expect(placeOfAnalysis(an("組み合わせ", ["S-01"]))).toEqual({ tab: "target" });
    expect(placeOfAnalysis(an("立地", ["L-01", " H-02"]))).toEqual({ tab: "area", card: "land" });
    expect(placeOfAnalysis(an("立地", ["L-01"]))).toEqual({ tab: "area", card: "living" });
    expect(placeOfAnalysis(an("買い手", ["B-01"]))).toEqual({ tab: "area", card: "people" });
    expect(placeOfAnalysis(an("物件", ["P-01"]))).toEqual({ tab: "area", card: "property" });
    expect(placeOfAnalysis(an("その他", ["T-01"]))).toEqual({ tab: "area", card: "living" });
    expect(placeOfAnalysis(an("その他", []))).toEqual({ tab: "area", card: "property" });
  });

  it("使用箇所：事実IDごとに引いている文とタブ。合わない層は数えない", () => {
    const strategy: StrategyOutput = {
      ...main,
      not_fit: [{ name: "単身", reason: "r", evidence: ["T-03"] }],
      analysis: [an("価格", ["P-02"]), an("立地", ["L-11"])],
      unknown: [],
    };
    const u = factUsage(strategy, { media: [{ id: "C-01", name: "SUUMO", purpose: "p", target: "t", share: 100, share_reason: "s", reason: "mr", evidence: ["A-03"] }], cautions: [] });
    expect(u.get("P-02")?.map((x) => x.tab)).toEqual(["summary", "price", "price"]);
    expect(u.get("A-03")?.map((x) => `${x.tab}:${x.where}`)).toEqual(["summary:推奨方針（総合評価）", "target:第1候補 x", "sales:販売の方向性", "sales:媒体 SUUMO"]);
    expect(u.get("L-11")?.map((x) => x.tab)).toEqual(["target", "area"]);
    expect(u.has("T-03")).toBe(false);
  });
});

describe("見せ方の補助", () => {
  it("値を大きく出す部分と補足に分ける", () => {
    expect(splitValue("3件：A 直線240m、B 直線400m")).toEqual({ main: "3件", sub: "A 直線240m、B 直線400m" });
    expect(splitValue("0件。3km以内の最寄り：C 直線1.2km")).toEqual({ main: "0件", sub: "3km以内の最寄り：C 直線1.2km" });
    expect(splitValue("大島小学校（物件から直線350m）")).toEqual({ main: "大島小学校", sub: "（物件から直線350m）" });
    expect(splitValue(null)).toEqual({ main: "不明", sub: null });
    expect(splitValue("4LDK")).toEqual({ main: "4LDK", sub: null });
    expect(splitValue("候補：A小学校、B小学校")).toEqual({ main: "候補2件", sub: "A小学校、B小学校" });
    expect(splitValue("新潟駅（信越本線・白新線） 直線2.4km")).toEqual({ main: "新潟駅 直線2.4km", sub: "（信越本線・白新線）" });
    expect(splitValue("代表年齢35歳。変動0.9%：月々約6.6万円・必要年収約400万円")).toEqual({ main: "変動0.9%：月々約6.6万円・必要年収約4…", sub: "代表年齢35歳" });
    expect(splitValue("9,800円/㎡（前年比+1.2%）、物件から直線620m")).toEqual({ main: "9,800円/㎡", sub: "（前年比+1.2%）、物件から直線620m" });
    expect(compactValue("新潟駅（信越本線） 直線2.4km")).toBe("新潟駅 直線2.4km");
  });

  it("短い名前、出どころ、坪単価の読み取り", () => {
    expect(shortLabel("洪水の想定浸水深（想定最大規模）")).toBe("洪水の想定浸水深");
    expect(factOrigin(FACTS[3])).toBe("入力");
    expect(factOrigin({ ...FACTS[0], id: "M-01" })).toBe("システム計算");
    expect(factOrigin(FACTS[0])).toBe("公的・調査データ");
    expect(factOrigin({ ...FACTS[0], id: "M-06", 項目: "近くの公示地（住宅地）", 出典: "国土数値情報 L01" })).toBe("公的・調査データ");
    expect(factOrigin({ ...FACTS[0], id: "M-08", 項目: "土地の目安（近くの公示地の価格×土地面積）", 出典: "国土数値情報 L01" })).toBe("システム計算");
    expect(factOrigin({ ...FACTS[0], 出典: "OpenStreetMap" })).toBe("地図データ（OSM）");
    expect(shortLabel("月々の返済額（変動0.9%・35年）")).toBe("月々の返済額（変動0.9%）");
    expect(shortLabel("必要年収以上の世帯の割合（固定1.9%、全国の夫婦の年収分布から）")).toBe("必要年収以上の世帯の割合（固定1.9%）");
    expect(shortLabel("延床の坪単価（広さの近い取引の相場と比べる：西区・築20〜29年・延床84〜156㎡）")).toBe("延床の坪単価（広さの近い取引）");
    expect(shortLabel("延床の坪単価（西区・築20〜29年の戸建の相場と比べる）")).toBe("延床の坪単価");
    expect(shortLabel("交通1（物件資料の徒歩分）")).toBe("交通1（物件資料の徒歩分）");
    expect(shortLabel("【若い夫婦】の返済の目安（頭金なし、返済期間35年）")).toBe("若い夫婦 の返済の目安");
    expect(unitPriceOf("物件68.8万円/坪")).toBe(68.8);
    expect(unitPriceOf("中央区・築30年以上の中央値 52.1万円/坪（41件）")).toBe(52.1);
    expect(unitPriceOf(null)).toBeNull();
  });

  it("ターゲットの根拠を観点で分ける", () => {
    const fm = new Map<string, Fact>([
      ["B-01", { ...FACTS[0], id: "B-01", 項目: "月々の返済額（変動0.9%・35年）" }],
      ["B-09", { ...FACTS[0], id: "B-09", 項目: "買主の年代（二次取得の世帯主）" }],
    ]);
    expect(groupByAspect(["A-01", "P-02", "B-01", "S-01", "C-01", "B-09"], fm).map((g) => [g.key, g.ids])).toEqual([
      ["area", ["A-01", "S-01"]],
      ["fit", ["P-02"]],
      ["afford", ["B-01"]],
      ["buyer", ["B-09"]],
      ["other", ["C-01"]],
    ]);
  });

  it("取れなかった事実の次に確かめること", () => {
    expect(nextCheck({ ...FACTS[3], 項目: "リフォーム", 値: null }).who).toBe("売主・物件資料");
    expect(nextCheck({ ...FACTS[2], 項目: "液状化の発生傾向" }).what).toBe("物件の位置で液状化の発生傾向を確かめる");
    expect(nextCheck({ ...FACTS[0], id: "B-05", 項目: "買主の年代（二次取得の世帯主）", 状態: "要確認" }).who).toBe("元の資料");
    expect(nextCheck({ ...FACTS[0], id: "L-12", 項目: "放課後児童クラブ（1km以内）", 状態: "要確認", 比較: "データは2017-03時点。その後の閉所・新設を市の最新の一覧で確かめる" })).toEqual({ who: "市の一覧・現地", what: "近くの放課後児童クラブを、最新の一覧か現地で確かめる（データの時点より後の閉所・新設は入っていない）" });
  });
});

describe("データの注意点に出す事実", () => {
  const f = (id: string, 項目: string, 状態: Fact["状態"]): Fact => ({ id, 項目, 値: 状態 === "取得できず" ? null : "x", 出典: "x", 時点: "x", 状態 });
  const list = [
    f("H-01", "洪水の想定浸水深（想定最大規模）", "取得できず"),
    f("S-02", "中学校区", "要確認"),
    f("L-12", "放課後児童クラブ（1km以内）", "要確認"),
    f("T-03", "最寄り駅の乗降客数（1日あたり）", "取得できず"),
    f("P-10", "リフォーム", "要確認"),
    f("B-10", "買主の年代（中古戸建を買った世帯の世帯主）", "要確認"),
    f("P-02", "価格", "取得"),
  ];
  it("災害・学区は必ず出し、ほかは根拠に使った要確認の事実だけ", () => {
    expect(factsToCheck(list, []).map((x) => x.id)).toEqual(["H-01", "S-02"]);
    expect(factsToCheck(list, ["B-10", "T-03", "P-02"]).map((x) => x.id)).toEqual(["H-01", "S-02", "B-10"]);
  });
});

describe("AIの文の事実IDを利用者向けにする", () => {
  const byId = new Map<string, Fact>([
    ["P-10", { id: "P-10", 項目: "リフォーム", 値: null, 出典: "入力", 時点: "2026-11", 状態: "要確認" }],
    ["L-04", { id: "L-04", 項目: "小児科のある病院・診療所（1km以内）", 値: "0件", 出典: "x", 時点: "x", 状態: "取得" }],
  ]);
  it("かっこで添えたIDは外し、文の中のIDは名前にする", () => {
    expect(plainIds("リフォームの有無が分からない［P-10］", byId)).toBe("リフォームの有無が分からない");
    expect(plainIds("近くに小児科がない（L-04、P-10）。", byId)).toBe("近くに小児科がない。");
    expect(plainIds("P-10が未入力のため確かめる", byId)).toBe("リフォームが未入力のため確かめる");
    expect(plainIds("L-04は0件", byId)).toBe("小児科のある病院・診療所（1km以内）は0件");
    expect(plainIds("P-99が未入力、A-01区画", byId)).toBe("P-99が未入力、A-01区画");
    expect(plainIds("X-01 や claude-sonnet-5-5 はそのまま", byId)).toBe("X-01 や claude-sonnet-5-5 はそのまま");
  });
  it("evidence と id は変えない", () => {
    const out = withPlainIds({ text: "庭がある（P-10）", evidence: ["P-10"], items: [{ id: "C-01", reason: "L-04が0件" }] }, byId);
    expect(out).toEqual({ text: "庭がある", evidence: ["P-10"], items: [{ id: "C-01", reason: "小児科のある病院・診療所（1km以内）が0件" }] });
  });
});

describe("AIが分からないと挙げたことのうち出すもの", () => {
  const f = (id: string, 状態: Fact["状態"]): Fact => ({ id, 項目: id, 値: 状態 === "取得できず" ? null : "x", 出典: "x", 時点: "x", 状態 });
  const facts = [f("T-03", "取得できず"), f("P-10", "要確認"), f("L-07", "要確認"), f("L-11", "取得"), f("L-14", "取得"), f("H-01", "取得できず")];
  it("重要でない取れなかった事実だけを挙げた項目は出さない", () => {
    const unknown = [
      "最寄り駅の乗降客数は取得できていない。［T-03］",
      "リフォームの実施年が不明。［P-10］",
      "放課後児童クラブは2017-03時点。［L-07］",
      "「（仮称）」の店は営業状況を確かめるまで訴求しない。［L-11］［L-14］",
      "洪水の浸水深が取れていない（H-01）",
      "引き渡し時期が事実シートにない",
    ];
    expect(unknownToShow(unknown, facts, [])).toEqual([unknown[3], unknown[4], unknown[5]]);
    expect(unknownToShow(unknown, facts, ["P-10"])).toContain(unknown[1]);
  });
});

describe("懸念点の札", () => {
  const byId = new Map<string, Fact>([["P-02", { id: "P-02", 項目: "価格", 値: "x", 出典: "入力", 時点: "x", 状態: "取得" }]]);
  it("根拠の分類から決める", () => {
    expect(concernTopic(["P-02", "M-05", "P-10"], byId)).toBe("価格");
    expect(concernTopic(["H-01", "H-04"], byId)).toBe("災害");
    expect(concernTopic(["P-10"], byId)).toBe("物件");
    expect(concernTopic(["L-04", "A-03"], byId)).toBe("立地");
    expect(concernTopic([], byId)).toBeNull();
  });
});

describe("販売の基本戦略", () => {
  const F = (id: string, 項目: string, 値: string | null, 状態: Fact["状態"] = 値 === null ? "取得できず" : "取得"): Fact => ({ id, 項目, 値, 出典: "入力", 時点: "2026-11", 状態 });
  const list: Fact[] = [
    F("P-02", "価格", "2,499万円"),
    F("P-03", "間取り", "居室4・納戸0（4LDK）"),
    F("P-06", "駐車台数", "2台"),
    F("P-09", "庭", "不明（入力なし）", "要確認"),
    F("P-10", "リフォーム", "年は不明：キッチン・浴室を交換"),
    F("M-02", "相場比", "1.61倍"),
    F("L-01", "認定こども園（1km以内）", "3件：こどものいえこども園 直線320m、B園 直線700m"),
    F("L-02", "公園（1km以内）", "34件：大島公園 直線80m ほか33件"),
    F("L-03", "スーパー（1km以内）", "0件。3km以内の最寄り：A 直線1.4km"),
    F("B-07", "ターゲット候補「若い夫婦」の定義", "世帯主が20代〜30代前半の世帯（代表年齢30歳）"),
    F("B-08", "ターゲット候補「単身」の定義", "定義は未設定（代表年齢35歳）"),
  ];
  const byId = new Map(list.map((f) => [f.id, f]));
  const main = {
    summary: { text: "", evidence: ["P-02", "M-02", "P-10"] },
    appeals: [
      { rank: 2, text: "", evidence: ["L-02", "L-03"] },
      { rank: 1, text: "", evidence: ["P-03", "P-09", "L-01"] },
    ],
    targets: [{ rank: 1, name: "若い夫婦", source: "候補" as const, definition: null, reason: "", evidence: ["P-06"], confidence: "中" as const }],
  };

  it("AIが加えた候補の特徴は訴求の順位順に、物件・立地の取れた事実だけ。価格・相場・要確認・0件・公園と保育の施設は入れない", () => {
    expect(summaryFeatures(main, byId).map((f) => f.id)).toEqual(["P-03", "P-10", "P-06"]);
    expect(summaryFeatures(main, byId, 1).map((f) => f.id)).toEqual(["P-03"]);
  });

  describe("ターゲットが重視しやすい点", () => {
    const sheet: Fact[] = [
      ...list,
      F("P-04", "建物面積", "105.5㎡"),
      F("P-05", "土地面積", "200㎡"),
      F("P-08", "階数", "2階建"),
      F("S-01", "小学校区", "架空小学校（物件から直線700m）"),
      F("S-02", "中学校区", "候補：A中、B中", "要確認"),
      F("T-02", "最寄り駅（直線）", "架空駅（越後線） 直線1.5km"),
      F("T-04", "最寄りバス停（直線）", "架空停 直線120m（系統数 3：架空交通）"),
      F("L-05", "内科のある病院・診療所（1km以内）", "1件：架空内科医院 直線420m"),
      F("B-01", "【若い夫婦・単身】の返済の目安（返済期間35年）", "代表年齢30・35歳。変動0.95%：月々約6.2万円・必要年収約300万円（必要年収以上の割合 約85%）。固定3.83%：月々約9.7万円"),
      F("B-02", "【50代の住み替え】の返済の目安（返済期間20年）", "代表年齢55歳。変動0.95%：月々約10.5万円・必要年収約505万円（必要年収以上の割合 約60%）"),
      F("B-03", "【50代の住み替え】の返済の目安（住み替えで頭金49.2%の場合（平均の自己資金比率）、返済期間20年）", "代表年齢55歳。変動0.95%：月々約5.9万円・必要年収約285万円"),
    ];
    const show = (name: string) => targetPoints(name, sheet)?.map((p) => `${p.label}：${p.value}`);

    it("若い夫婦は返済・広さ・駅・スーパーの4つ。値は事実のまま短くする", () => {
      expect(show("若い夫婦")).toEqual([
        "返済の目安（35年）：月々約6.2万円",
        "広さ・間取り：4LDK・建物105.5㎡",
        "最寄り駅：架空駅 直線1.5km",
        "スーパー：1km以内になし（最寄り A 直線1.4km）",
      ]);
    });

    it("要確認の事実は飛ばして次の項目を出す（中学校区が要確認なら、返済・スーパーで4つにする）", () => {
      expect(show("小中学生のいる家族")).toEqual(["小学校区：架空小学校（直線700m）", "広さ・間取り：4LDK・建物105.5㎡", "スーパー：1km以内になし（最寄り A 直線1.4km）"]);
    });

    it("住み替えの候補は、今の家を売って頭金にした返済を使う", () => {
      expect(show("50代の住み替え")?.[0]).toBe("返済の目安（住み替えで頭金49.2%・20年）：月々約5.9万円");
    });

    it("60歳以上は買い物・医療・階数・バス停", () => {
      expect(show("60歳以上")).toEqual(["スーパー：1km以内になし（最寄り A 直線1.4km）", "内科：架空内科医院 直線420m（1km以内1件）", "階数：2階建", "最寄りバス停：架空停 直線120m"]);
    });

    it("どの候補も4つまで。公園・こども園は出さない。表にない候補は null", () => {
      for (const n of Object.keys(TARGET_POINTS)) {
        const ps = targetPoints(n, sheet)!;
        expect(ps.length).toBeLessThanOrEqual(MAX_TARGET_POINTS);
        expect(ps.some((p) => /公園|こども園/.test(p.label))).toBe(false);
      }
      expect(targetPoints("共働きの車2台世帯", sheet)).toBeNull();
    });
  });

  it("特徴の値は書き換えずに短くする", () => {
    expect(featureText(byId.get("P-03")!)).toEqual({ label: "間取り", value: "4LDK" });
    expect(featureText(byId.get("L-01")!)).toEqual({ label: "認定こども園", value: "こどものいえこども園 直線320m（1km以内3件）" });
    expect(featureText(byId.get("L-02")!)).toEqual({ label: "公園", value: "大島公園 直線80m（1km以内34件）" });
    expect(featureText(byId.get("P-10")!).value).toBe("年は不明：キッチン・浴室を交換");
  });

  it("ターゲットの説明は事実の定義から代表年齢を外す。AIが加えた候補はAIの説明、未設定は出さない", () => {
    expect(targetDefinition({ name: "若い夫婦", source: "候補", definition: null }, list)).toBe("世帯主が20代〜30代前半の世帯");
    expect(targetDefinition({ name: "単身", source: "候補", definition: null }, list)).toBeNull();
    expect(targetDefinition({ name: "親と同居", source: "候補", definition: null }, list)).toBeNull();
    expect(targetDefinition({ name: "車2台の世帯", source: "エージェント提案", definition: " 車で通勤する世帯 " }, list)).toBe("車で通勤する世帯");
  });

  it("基本の6候補には絵がある", () => {
    for (const n of ["若い夫婦", "小中学生のいる家族", "50代の住み替え", "60歳以上", "単身", "親と同居"]) expect(TARGET_IMAGES[n]).toMatch(/^\/targets\/.+\.webp$/);
  });
});

describe("defaultBudgetIndex", () => {
  it("①の総額があればそれを選ぶ", () => {
    expect(defaultBudgetIndex([{ totalManYen: 15, isInput: true }, { totalManYen: 10, isInput: false }, { totalManYen: 20, isInput: false }])).toBe(0);
  });
  it("総額が無ければ20万円", () => {
    expect(defaultBudgetIndex([{ totalManYen: 10, isInput: false }, { totalManYen: 20, isInput: false }, { totalManYen: 30, isInput: false }])).toBe(1);
  });
  it("20万円も無ければ最初の列", () => {
    expect(defaultBudgetIndex([{ totalManYen: 10, isInput: false }])).toBe(0);
    expect(defaultBudgetIndex([])).toBe(0);
  });
});

describe("firstSentence", () => {
  it("最初の「。」で分ける", () => {
    expect(firstSentence("Aです。Bです。Cです。")).toEqual({ head: "Aです。", rest: "Bです。Cです。" });
  });
  it("1文だけ・「。」が無いときは rest が null", () => {
    expect(firstSentence("Aです。")).toEqual({ head: "Aです。", rest: null });
    expect(firstSentence(" A ")).toEqual({ head: "A", rest: null });
  });
});

describe("aspectLine", () => {
  const f = (項目: string, 値: string): Fact => ({ id: "X-01", 項目, 値, 出典: "s", 時点: "t", 状態: "取得" });
  it("返済の目安は月々の返済額だけ", () => {
    expect(aspectLine(f("【50代の住み替え】の返済の目安（返済期間25年）", "代表年齢55歳。変動1.3%：月々約5.4万円・必要年収約260万円。固定1.9%：月々約5.8万円"))).toEqual({ label: "返済の目安", value: "月々約5.4万円" });
  });
  it("施設の件数は最寄りと件数", () => {
    expect(aspectLine(f("スーパー（1km以内）", "3件：Aストア 直線320m、B 直線500m"))).toEqual({ label: "スーパー", value: "Aストア 直線320m（1km以内3件）" });
  });
  it("末尾の補足を外す", () => {
    expect(aspectLine(f("最寄りバス停（直線）", "草水 直線90m（系統数1：新潟交通観光バス）"))).toEqual({ label: "最寄りバス停", value: "草水 直線90m" });
  });
  it("ターゲット候補の定義は短い名前にする", () => {
    expect(aspectLine(f("ターゲット候補「50代の住み替え」の定義", "世帯主が50代"))?.label).toBe("50代の住み替えの定義");
  });
});

describe("aspectLine の返済・年収", () => {
  const f = (項目: string, 値: string): Fact => ({ id: "B-01", 項目, 値, 出典: "s", 時点: "t", 状態: "取得" });
  it("必要年収は1行にしない", () => {
    expect(aspectLine(f("必要年収（変動0.95%）", "約300万円"))).toBeNull();
    expect(aspectLine(f("必要年収以上の世帯の割合（変動0.95%、全国）", "約85%"))).toBeNull();
  });
  it("月々の返済額は金利を外した名前にする", () => {
    expect(aspectLine(f("月々の返済額（変動0.95%・35年）", "約6.2万円"))).toEqual({ label: "月々の返済額", value: "約6.2万円" });
  });
  it("返済の目安に月々が無ければ null", () => {
    expect(aspectLine(f("【若い夫婦】の返済の目安（返済期間35年）", "代表年齢30歳。計算できず"))).toBeNull();
  });
});

describe("pickAspectFact", () => {
  const mk = (id: string, 項目: string, 値: string | null, 状態: Fact["状態"] = "取得"): Fact => ({ id, 項目, 値, 出典: "s", 時点: "t", 状態 });
  const facts = new Map(
    [
      mk("B-02", "必要年収（変動0.95%）", "約300万円"),
      mk("B-07", "【若い夫婦】の返済の目安（返済期間35年）", "代表年齢30歳。変動0.95%：月々約6.2万円・必要年収約300万円"),
      mk("S-01", "小学校区", "架空小学校", "要確認"),
      mk("T-03", "最寄り駅の乗降客数（1日あたり）", null, "取得できず"),
      mk("T-04", "最寄りバス停（直線）", "架空停 直線120m（系統数 3）"),
    ].map((f) => [f.id, f]),
  );
  it("必要年収を飛ばし、返済の目安の月々を出す", () => {
    expect(pickAspectFact(["B-02", "B-07"], facts)).toMatchObject({ line: { label: "返済の目安", value: "月々約6.2万円" }, caution: false, count: 2 });
  });
  it("取れた事実を先に使う", () => {
    expect(pickAspectFact(["S-01", "T-04"], facts)).toMatchObject({ line: { label: "最寄りバス停", value: "架空停 直線120m" }, caution: false });
  });
  it("要確認・取得できずだけなら、その状態を caution で返す", () => {
    expect(pickAspectFact(["T-03"], facts)).toMatchObject({ line: { value: "取得できず" }, caution: true, count: 1 });
  });
  it("事実シートに無いIDは数えない", () => {
    expect(pickAspectFact(["A-99"], facts)).toBeNull();
    expect(pickAspectFact(["A-99", "T-04"], facts)?.count).toBe(1);
  });
});

describe("媒体の補足", () => {
  it("媒体一覧の16件すべてに短い説明がある（C-01〜C-16）", async () => {
    const { readFileSync } = await import("node:fs");
    const sql = readFileSync("supabase/migrations/20261025100200_assumptions.sql", "utf8");
    const ids = [...sql.matchAll(/\('(C-\d{2})'/g)].map((m) => m[1]);
    expect(ids).toHaveLength(16);
    expect(Object.keys(MEDIA_NOTES).sort()).toEqual(ids.sort());
    // 強さを言い切る言葉（最大・No.1 など）は書かない
    for (const t of Object.values(MEDIA_NOTES)) expect(t).not.toMatch(/最大|最多|No\.?1|一番|必ず/);
  });
});
