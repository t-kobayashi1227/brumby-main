import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { bannedWords, checkCompetitors, checkProgram, checkSalesFocus, isGuideFlow, removeSentences, splitWhere, strengthFacts } from "../lib/agents/checks";
import { salesFocusOf, vsNextOf } from "../lib/agents/sales-focus";
import { competitorPart } from "../lib/agents/competitor-part";
import { z } from "zod/v4";
import { costUsd, providerOf, resolveModels } from "../lib/agents/cost";
import { parseJson } from "../lib/agents/llm";
import { agentPrompt, PROMPT_FILES, readPrompt } from "../lib/agents/prompts";
import { mainPart, strategySchema, type MediaOutput, type StrategyOutput } from "../lib/agents/schemas";
import { allocate, simulate } from "../lib/calc/budget";
import type { Fact } from "../lib/facts/types";

describe("指示文は設計まとめと一字一句同じ", () => {
  const doc = readFileSync("docs/設計まとめ.md", "utf8").replace(/\r\n/g, "\n");
  const section = doc.slice(doc.indexOf("## エージェントの指示文"), doc.indexOf("### 指示文の練り方"));
  const blocks = Object.fromEntries([...section.matchAll(/### (\S+)\n\n```text\n([\s\S]*?)\n```/g)].map((m) => [m[1], m[2]]));

  it("共通の指示と3つのエージェント", () => {
    expect(readPrompt("common.txt")).toBe(blocks["共通の指示"]);
    for (const [agent, file] of Object.entries(PROMPT_FILES)) expect(readPrompt(file), agent).toBe(blocks[agent]);
  });

  it("媒体には共通の指示を前に付け、戦略と確認には付けない", () => {
    const media = agentPrompt("媒体");
    expect(media.system.startsWith(blocks["共通の指示"])).toBe(true);
    expect(media.system.endsWith(blocks["媒体"])).toBe(true);
    expect(media.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(agentPrompt("戦略")).toMatchObject({ file: "strategy.txt", system: blocks["戦略"] });
    expect(agentPrompt("確認")).toMatchObject({ file: "check.txt", system: blocks["確認"] });
  });
});

const fact = (id: string, 状態: Fact["状態"] = "取得"): Fact => ({ id, 項目: id, 値: 状態 === "取得できず" ? null : "x", 出典: "x", 時点: "x", 状態 });
const FACTS = [fact("P-02"), fact("L-04"), fact("T-03", "取得できず"), fact("S-02", "要確認"), fact("B-06")];
const MEDIA_IDS = Array.from({ length: 16 }, (_, i) => `C-${String(i + 1).padStart(2, "0")}`);

const analysis = (evidence: string[], meaning = "意味"): StrategyOutput["analysis"][number] => ({
  topic: "組み合わせ",
  fact: "事実",
  meaning,
  use: "使い方",
  evidence,
  confidence: "中",
});

function main(overrides: Partial<StrategyOutput> = {}): StrategyOutput {
  return {
    analysis: [analysis(["L-04"])],
    unknown: [],
    summary: { text: "総合評価", evidence: ["P-02"] },
    sales_focus: { kind: "強みを伝える", point: "公園が近い", why_this_property: "理由", why_first: "先にやる理由", action: "写真を出す", evidence: ["P-02"] },
    targets: [{ rank: 1, name: "若い夫婦", source: "候補", definition: null, reason: "理由", vs_next: null, evidence: ["B-06"], confidence: "中" }],
    not_fit: [],
    appeals: [
      { rank: 1, text: "公園が近い", evidence: ["L-04"] },
      { rank: 2, text: "IDなし", evidence: [] },
    ],
    price_view: { position: "相場なみ", text: "価格", evidence: ["P-02"] },
    concerns: [{ text: "駅の乗降客数", action: "説明する", evidence: ["T-03"] }],
    direction: { text: "方向性", evidence: ["S-02"] },
    competitor_edge: null,
    competitor_concerns: [],
    competitors: [],
    ...overrides,
  };
}

function media(overrides: Partial<MediaOutput> = {}): MediaOutput {
  return {
    media: [
      { id: "C-01", name: "SUUMO", purpose: "問い合わせ", target: "第1ターゲット", share: 50, share_reason: "s", reason: "r", evidence: ["B-06"] },
      { id: "C-06", name: "Instagram広告", purpose: "認知", target: "第1ターゲット", share: 30, share_reason: "s", reason: "r", evidence: ["B-06"] },
      { id: "C-12", name: "ポスティング", purpose: "認知", target: "第2ターゲット", share: 20, share_reason: "s", reason: "r", evidence: ["X-99"] },
    ],
    cautions: [],
    ...overrides,
  };
}

describe("点検（プログラム）", () => {
  it("IDのない文は外し、知らないIDと「取得できず」は作り直し。要確認だけが根拠の文は記録だけ", () => {
    const issues = checkProgram(main(), media(), FACTS, MEDIA_IDS);
    expect(issues).toEqual([
      { target: "戦略", location: "appeals[1]", check_name: "IDのない文", problem: "根拠の事実IDがありません", action: "外す" },
      { target: "戦略", location: "concerns[0]", check_name: "取得できずの事実を根拠にしている", problem: "「取得できず」の事実です：T-03", action: "作り直し" },
      { target: "戦略", location: "direction", check_name: "要確認の事実だけを根拠にしている", problem: "根拠がすべて「要確認」の事実です：S-02", action: "記録だけ" },
      { target: "媒体", location: "media[2]", check_name: "IDが事実シートにない", problem: "事実シートにないIDです：X-99", action: "作り直し" },
    ]);
  });

  it("要確認の事実がほかの事実と一緒なら、記録しない", () => {
    const issues = checkProgram(main({ direction: { text: "方向性", evidence: ["S-02", "L-04"] } }), media(), FACTS, MEDIA_IDS);
    expect(issues.some((i) => i.check_name === "要確認の事実だけを根拠にしている")).toBe(false);
  });

  it("価格の見方は「判定保留」を選べる", () => {
    expect(strategySchema.shape.price_view.parse({ position: "判定保留", text: "価格", evidence: ["M-02"] }).position).toBe("判定保留");
  });

  it("1つしかない文（総合評価など）にIDがなければ、外せないので作り直し", () => {
    const issues = checkProgram(main({ summary: { text: "x", evidence: [" "] } }), media(), FACTS, MEDIA_IDS);
    expect(issues[0]).toMatchObject({ location: "summary", action: "作り直し" });
  });

  it("媒体は一覧の中から3〜6件、重ならず、配分の合計100", () => {
    const two = media({ media: media().media.slice(0, 2) });
    const problems = checkProgram(main(), two, FACTS, MEDIA_IDS).filter((i) => i.location === "media").map((i) => i.problem);
    expect(problems).toEqual(["媒体が2件です（3〜6件にする）", "配分の合計が80%です（100%にする）"]);
    const bad = media({ media: [...media().media.slice(0, 2), { ...media().media[0], id: "C-99", share: 20 }] });
    expect(checkProgram(main(), bad, FACTS, MEDIA_IDS).map((i) => i.problem)).toContain("媒体一覧にない媒体です：C-99");
  });

  it("割合の理由（share_reason）も禁止語を点検する", () => {
    const m = media();
    m.media[0] = { ...m.media[0], share_reason: "最適な割合" };
    expect(checkProgram(main(), m, FACTS, MEDIA_IDS)).toContainEqual(
      { target: "媒体", location: "media[0]", check_name: "禁止語", problem: "禁止語があります：最適", action: "記録だけ" },
    );
  });

  it("「外す」の文だけ取り除く", () => {
    const issues = checkProgram(main(), media(), FACTS, MEDIA_IDS);
    const r = removeSentences(main(), media(), issues);
    expect(r.main.appeals.map((a) => a.text)).toEqual(["公園が近い"]);
    expect(r.main.concerns).toHaveLength(1);
    expect(r.media.media).toHaveLength(3);
  });

  it("確認エージェントの場所を、戦略か媒体かに分ける", () => {
    expect(splitWhere("appeals[1]")).toEqual({ target: "戦略", location: "appeals[1]" });
    expect(splitWhere("analysis[2]")).toEqual({ target: "戦略", location: "analysis[2]" });
    expect(splitWhere("戦略.appeals[0]")).toEqual({ target: "戦略", location: "appeals[0]" });
    expect(splitWhere("media[0]")).toEqual({ target: "媒体", location: "media[0]" });
    expect(splitWhere("cautions[0]")).toEqual({ target: "媒体", location: "cautions[0]" });
    expect(splitWhere("媒体.media[2]")).toEqual({ target: "媒体", location: "media[2]" });
  });
});

describe("禁止語（記録だけ）", () => {
  const facts = [...FACTS, { ...fact("T-01"), 値: "白山駅 徒歩12分" }];

  it("禁止語を見つける。「徒歩○分」は交通の事実と同じ分数なら通す", () => {
    expect(bannedWords("必ず売れる最適な家", facts)).toEqual(["必ず", "最適"]);
    expect(bannedWords("白山駅まで徒歩12分", facts)).toEqual([]);
    expect(bannedWords("白山駅まで徒歩10分", facts)).toEqual(["徒歩"]);
    expect(bannedWords("駅まで徒歩圏", facts)).toEqual(["徒歩"]);
  });

  it("作り直しも外しもせず、記録だけ", () => {
    const issues = checkProgram(main({ direction: { text: "人気の学区を推す", evidence: ["S-02"] } }), media(), facts, MEDIA_IDS);
    expect(issues).toContainEqual({ target: "戦略", location: "direction", check_name: "禁止語", problem: "禁止語があります：人気の", action: "記録だけ" });
  });
});

describe("戦略担当の分析", () => {
  const strategy = () => main({ analysis: [analysis(["L-04"]), analysis([], "最適な家")] });

  it("分析の文も点検する", () => {
    const issues = checkProgram(strategy(), media(), FACTS, MEDIA_IDS);
    expect(issues.filter((i) => i.location === "analysis[1]")).toEqual([
      { target: "戦略", location: "analysis[1]", check_name: "禁止語", problem: "禁止語があります：最適", action: "記録だけ" },
      { target: "戦略", location: "analysis[1]", check_name: "IDのない文", problem: "根拠の事実IDがありません", action: "外す" },
    ]);
  });

  it("「外す」の分析を取り除き、媒体には分析を除いた部分だけを渡す", () => {
    const r = removeSentences(strategy(), media(), checkProgram(strategy(), media(), FACTS, MEDIA_IDS));
    expect(r.main.analysis).toHaveLength(1);
    expect(r.main.appeals).toHaveLength(1);
    const forMedia = mainPart(r.main);
    expect("analysis" in forMedia || "unknown" in forMedia).toBe(false);
    expect(forMedia.targets[0].name).toBe("若い夫婦");
  });
});

describe("競合と比べた部分（2026-11-05）", () => {
  const k = (id: string, 項目: string): Fact => ({ id, 項目, 値: "x", 出典: "x", 時点: "x", 状態: "取得" });
  const KF = [...FACTS, k("K-01", "競合1：物件情報"), k("K-02", "競合1：特徴"), k("K-03", "競合1：AIの見立て"), k("K-04", "競合2：物件情報"), k("K-05", "競合2：特徴"), k("K-06", "競合2：AIの見立て")];
  const edge = (evidence: string[]) => ({ point: "広い庭", cause: "競合1より土地が広い", action: "庭の写真を先頭に", why_first: "第1ターゲットに効く", evidence });
  const concern = (rank: number, evidence: string[]) => ({ rank, concern: "価格が高く見える", cause: "競合2より高い", evidence });
  const note = (fact_id: string, about_edge = false, concern_ranks: number[] = []) => ({ fact_id, buyer_view: { text: "見え方", evidence: [fact_id, "P-02"] }, about_edge, concern_ranks });
  const ok = () =>
    main({
      competitor_edge: edge(["K-01", "P-02"]),
      competitor_concerns: [concern(1, ["K-04", "P-02"])],
      competitors: [note("K-01", true), note("K-04", false, [1])],
    });
  const compIssues = (m: StrategyOutput) => checkCompetitors(m, KF);

  it("形が合っていれば何も挙げない", () => {
    expect(compIssues(ok())).toEqual([]);
  });

  it("根拠に競合とこの物件の事実が両方なければ外す", () => {
    const issues = compIssues(main({ ...ok(), competitor_edge: edge(["P-02"]), competitor_concerns: [concern(1, ["K-04", "K-05"])] }));
    expect(issues.map((i) => [i.location, i.check_name, i.action])).toEqual([
      ["competitor_edge", "競合と比べた根拠がそろっていない", "外す"],
      ["competitor_concerns[0]", "競合と比べた根拠がそろっていない", "外す"],
    ]);
  });

  it("懸念点は2つまで。rank の並びが違えば記録だけ", () => {
    const issues = compIssues(main({ ...ok(), competitor_concerns: [concern(1, ["K-04", "P-02"]), concern(3, ["K-04", "P-02"]), concern(4, ["K-01", "P-02"])] }));
    expect(issues.map((i) => [i.location, i.check_name, i.action])).toEqual([
      ["competitor_concerns[2]", "懸念点が多すぎる", "外す"],
      ["competitor_concerns", "懸念点の順番", "記録だけ"],
    ]);
  });

  it("競合ごとの見え方は「物件情報」の事実を指す。重なり・足りない競合・無い rank を挙げる", () => {
    const issues = compIssues(main({ ...ok(), competitors: [note("K-02"), note("K-01", true, [5]), note("K-01")] }));
    expect(issues.map((i) => [i.location, i.check_name, i.action])).toEqual([
      ["competitors[0]", "競合の事実IDが違う", "外す"],
      ["competitors[1]", "懸念点の rank が無い", "記録だけ"],
      ["competitors[2]", "同じ競合が2回ある", "外す"],
      ["competitors", "競合の見え方が足りない", "記録だけ"],
    ]);
  });

  it("checkProgram でも点検し、外した文は答えから取り除く（おすすめポイントは null）", () => {
    const m = main({ ...ok(), competitor_edge: edge(["K-01"]), competitors: [note("K-02"), note("K-01", true), note("K-04")] });
    const issues = checkProgram(m, media(), KF, MEDIA_IDS);
    const r = removeSentences(m, media(), issues);
    expect(r.main.competitor_edge).toBeNull();
    expect(r.main.competitors.map((c) => c.fact_id)).toEqual(["K-01", "K-04"]);
    expect(r.main.competitor_concerns).toHaveLength(1);
  });

  it("以前の答え（競合の部分が無い）は点検しない", () => {
    const old = main();
    const legacy = { ...old } as Partial<StrategyOutput>;
    delete legacy.competitor_edge;
    delete legacy.competitor_concerns;
    delete legacy.competitors;
    expect(competitorPart(legacy as StrategyOutput)).toBeNull();
    expect(compIssues(legacy as StrategyOutput)).toEqual([]);
    expect("competitor_edge" in removeSentences(legacy as StrategyOutput, media(), []).main).toBe(false);
  });

  it("媒体担当には競合と比べた部分を渡さない", () => {
    const forMedia = mainPart(ok());
    expect("competitor_edge" in forMedia || "competitor_concerns" in forMedia || "competitors" in forMedia).toBe(false);
  });

  it("答えの形：おすすめポイントは null にできる", () => {
    expect(strategySchema.shape.competitor_edge.parse(null)).toBeNull();
    expect(() => strategySchema.shape.competitors.parse([{ fact_id: "K-01", buyer_view: { text: "t", evidence: [] }, about_edge: "yes", concern_ranks: [] }])).toThrow();
  });
});

describe("配分から金額（予算シミュレーション）", () => {
  const shares = [
    { id: "C-01", share: 40 },
    { id: "C-06", share: 30 },
    { id: "C-12", share: 20 },
    { id: "C-14", share: 10 },
  ];

  it("設計まとめの例：40・30・20・10%", () => {
    expect(allocate(shares, 10).map((a) => a.amountManYen)).toEqual([4, 3, 2, 1]);
    expect(allocate(shares, 30).map((a) => a.amountManYen)).toEqual([12, 9, 6, 3]);
  });

  it("0.1万円単位で丸め、合計のずれは配分の最も大きい媒体で合わせる", () => {
    const thirds = [
      { id: "a", share: 33 },
      { id: "b", share: 34 },
      { id: "c", share: 33 },
    ];
    const r = allocate(thirds, 10);
    expect(r.map((a) => a.amountManYen)).toEqual([3.3, 3.4, 3.3]);
    const odd = allocate(
      [
        { id: "a", share: 45 },
        { id: "b", share: 55 },
      ],
      0.3,
    );
    // 0.135→0.1、0.165→0.2：合計 0.3 で合う
    expect(odd.reduce((s, a) => s + a.amountManYen, 0)).toBeCloseTo(0.3, 6);
  });

  it("①の総額があれば一番左の列に足す", () => {
    expect(simulate(shares, 50).map((c) => [c.totalManYen, c.isInput])).toEqual([
      [50, true],
      [10, false],
      [20, false],
      [30, false],
    ]);
    expect(simulate(shares, null).map((c) => c.totalManYen)).toEqual([10, 20, 30]);
  });
});

describe("費用（claude-haiku-5-5）", () => {
  it("100K トークン以下は入力 $0.10・出力 $0.50（1M トークンあたり）", () => {
    expect(costUsd({ input_tokens: 20_000, output_tokens: 2_000 }, "claude-haiku-5-5")).toBeCloseTo(0.003, 9);
  });

  it("キャッシュの書き込みは1.25倍、読み込みは0.1倍", () => {
    expect(costUsd({ input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 10_000, cache_read_input_tokens: 10_000 }, "claude-haiku-5-5")).toBeCloseTo(0.00135, 9);
  });

  it("100K トークンを超えると高い料金表", () => {
    expect(costUsd({ input_tokens: 200_000, output_tokens: 1_000 }, "claude-haiku-5-5")).toBeCloseTo(0.1025, 9);
  });
});

describe("費用（claude-sonnet-5-5）", () => {
  it("入力 $2.00・出力 $10.00（1M トークンあたり）。長いプロンプトでも同じ料金表", () => {
    expect(costUsd({ input_tokens: 20_000, output_tokens: 10_000 }, "claude-sonnet-5-5")).toBeCloseTo(0.14, 9);
    expect(costUsd({ input_tokens: 200_000, output_tokens: 0 }, "claude-sonnet-5-5")).toBeCloseTo(0.4, 9);
  });

  it("キャッシュの書き込みは1.25倍、読み込みは0.1倍", () => {
    expect(costUsd({ input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 10_000, cache_read_input_tokens: 10_000 }, "claude-sonnet-5-5")).toBeCloseTo(0.027, 9);
  });
});

describe("費用（OpenAI）", () => {
  it("gpt-6.1-sol は入力 $2.00・キャッシュ読み込み $0.10・出力 $10.00（1M トークンあたり）", () => {
    expect(costUsd({ input_tokens: 20_000, output_tokens: 10_000, cache_read_input_tokens: 10_000 }, "gpt-6.1-sol")).toBeCloseTo(0.141, 9);
  });

  it("gpt-6-luna は入力 $0.10・キャッシュ読み込み $0.01・出力 $0.50。長いプロンプトでも同じ料金表", () => {
    expect(costUsd({ input_tokens: 200_000, output_tokens: 2_000, cache_read_input_tokens: 100_000 }, "gpt-6-luna")).toBeCloseTo(0.022, 9);
  });
});

describe("提供元とモデルの選び方（環境変数）", () => {
  it("何も設定しなければ Anthropic の Sonnet と Haiku", () => {
    expect(resolveModels({})).toEqual({ provider: "anthropic", strategy: "claude-sonnet-5-5", media: "claude-haiku-5-5" });
  });

  it("AI_PROVIDER=openai だけで OpenAI の既定のモデルになる（大文字・空白も受ける）", () => {
    expect(resolveModels({ AI_PROVIDER: " OpenAI " })).toEqual({ provider: "openai", strategy: "gpt-6.1-sol", media: "gpt-6-luna" });
  });

  it("担当ごとのモデルを変えられる", () => {
    expect(resolveModels({ AI_PROVIDER: "openai", AI_MODEL_HIGH: "gpt-6.1-terra" }).strategy).toBe("gpt-6.1-terra");
    expect(resolveModels({ AI_MODEL_HIGH: "", AI_MODEL_LIGHT: "claude-sonnet-5-5" })).toEqual({ provider: "anthropic", strategy: "claude-sonnet-5-5", media: "claude-sonnet-5-5" });
  });

  it("知らない提供元・料金表にないモデル・提供元と合わないモデルは例外", () => {
    expect(() => resolveModels({ AI_PROVIDER: "chatgpt" })).toThrow(/AI_PROVIDER/);
    expect(() => resolveModels({ AI_MODEL_LIGHT: "gpt-4o" })).toThrow(/料金表/);
    expect(() => resolveModels({ AI_PROVIDER: "openai", AI_MODEL_HIGH: "claude-sonnet-5-5" })).toThrow(/AI_PROVIDER/);
  });

  it("モデル名から提供元がわかる", () => {
    expect(providerOf("claude-haiku-5-5")).toBe("anthropic");
    expect(providerOf("gpt-6-luna")).toBe("openai");
  });
});

describe("OpenAI の答えの読み取り", () => {
  const schema = z.object({ ok: z.boolean(), n: z.number().int() });

  it("形に合う JSON は読む", () => {
    expect(parseJson('{"ok":true,"n":3}', schema)).toEqual({ ok: true, n: 3 });
  });

  it("壊れた JSON・形に合わない JSON は null（例外にしない）", () => {
    expect(parseJson('{"ok":true,', schema)).toBeNull();
    expect(parseJson('{"ok":"yes","n":3}', schema)).toBeNull();
    expect(parseJson("", schema)).toBeNull();
  });
});

describe("この物件でいちばん大事なこと・第1と第2の差（2026-11-05）", () => {
  const SF = [
    ...FACTS,
    { ...fact("P-01"), 項目: "物件区分", 値: "新築" },
    { ...fact("P-11"), 項目: "リフォーム", 値: "2024年：キッチン・浴室" },
    { ...fact("P-12"), 項目: "リフォーム", 値: "不明（入力なし）", 状態: "要確認" as const },
    { ...fact("T-01"), 項目: "交通1（物件資料の徒歩分）", 値: "白山駅 徒歩8分" },
  ];
  const target = (rank: number, vs_next: string | null): StrategyOutput["targets"][number] => ({
    rank, name: `候補${rank}`, source: "候補", definition: null, reason: "理由", vs_next, evidence: ["B-06"], confidence: "中",
  });
  const names = (issues: { check_name: string }[]) => issues.map((i) => i.check_name);

  it("強みの事実は新築・リフォームあり・交通を拾い、不明のリフォームは拾わない", () => {
    expect(strengthFacts(SF)).toEqual([
      { label: "新築", ids: ["P-01"] },
      { label: "リフォーム", ids: ["P-11"] },
      { label: "交通", ids: ["T-01"] },
    ]);
    expect(strengthFacts([{ ...fact("P-01"), 項目: "物件区分", 値: "中古" }, { ...fact("P-11"), 項目: "リフォーム", 値: "なし" }])).toEqual([]);
  });

  it("案内の流れの型は「問い合わせ」と「内見・内覧」の両方で見る", () => {
    expect(isGuideFlow("問い合わせを集め、内見で広さを見せる")).toBe(true);
    expect(isGuideFlow("問い合わせの後に内覧へ")).toBe(true);
    expect(isGuideFlow("子育て世帯に学区の近さを推す")).toBe(false);
  });

  it("強みを根拠に使っていれば記録しない。使っていない強みと案内の型は記録だけ", () => {
    const used = main({
      sales_focus: { ...main().sales_focus, evidence: ["P-01", "T-01"] },
      appeals: [{ rank: 1, text: "リフォーム済み", evidence: ["P-11"] }],
    });
    expect(checkSalesFocus(used, SF)).toEqual([]);

    const issues = checkSalesFocus(main({ direction: { text: "問い合わせから内見へ案内する", evidence: ["S-02"] } }), SF);
    expect(names(issues)).toEqual(["案内の流れの型", "強みの取りこぼし", "強みの取りこぼし", "強みの取りこぼし"]);
    expect(issues.every((i) => i.action === "記録だけ")).toBe(true);
    expect(issues[1].problem).toContain("新築の事実（P-01）");
  });

  it("いちばん大事なことの根拠に物件（P）の事実が無ければ作り直し", () => {
    const issues = checkSalesFocus(main({ sales_focus: { ...main().sales_focus, evidence: ["L-04", "P-99"] } }), FACTS);
    expect(issues).toContainEqual(expect.objectContaining({ location: "sales_focus", check_name: "いちばん大事なことに物件の根拠がない", action: "作り直し" }));
  });

  it("「不安を取り除く」「確かめる」の根拠が築年数・リフォーム・要確認だけなら記録だけ", () => {
    const facts = [...FACTS, { ...fact("P-07"), 項目: "築年数", 値: "築46年" }, { ...fact("P-12"), 項目: "リフォーム", 値: "不明（入力なし）", 状態: "要確認" as const }, { ...fact("H-01"), 項目: "液状化", 値: "非常に液状化しやすい" }];
    const focus = (kind: "強みを伝える" | "不安を取り除く" | "確かめる", evidence: string[]) => main({ sales_focus: { ...main().sales_focus, kind, evidence } });
    const old = checkSalesFocus(focus("確かめる", ["P-07", "P-12", "S-02"]), facts);
    expect(old).toContainEqual(expect.objectContaining({ location: "sales_focus", check_name: "築古だけが理由", action: "記録だけ" }));
    expect(names(checkSalesFocus(focus("不安を取り除く", ["P-07", "H-01"]), facts))).not.toContain("築古だけが理由");
    expect(names(checkSalesFocus(focus("強みを伝える", ["P-07"]), facts))).not.toContain("築古だけが理由");
  });

  it("vs_next は第1候補だけ。第1に無い・第2以降にあるときは記録だけ", () => {
    expect(names(checkSalesFocus(main({ targets: [target(1, "間取りが4LDK"), target(2, null)] }), FACTS))).toEqual([]);
    expect(names(checkSalesFocus(main({ targets: [target(1, "はっきりした差なし"), target(2, null)] }), FACTS))).toEqual([]);
    const issues = checkSalesFocus(main({ targets: [target(2, "x"), target(1, " ")] }), FACTS);
    expect(issues.map((i) => [i.location, i.problem])).toEqual([
      ["targets[1]", "第1候補に、第2候補より上にした理由（vs_next）がありません"],
      ["targets[0]", "第1候補以外に vs_next があります"],
    ]);
    // 候補が1つだけなら比べる相手がないので求めない
    expect(names(checkSalesFocus(main({ targets: [target(1, null)] }), FACTS))).toEqual([]);
  });

  it("sales_focus の事実IDもほかの文と同じく点検する（無いIDは作り直し）", () => {
    const issues = checkProgram(main({ sales_focus: { ...main().sales_focus, evidence: ["P-02", "X-01"] } }), media(), FACTS, MEDIA_IDS);
    expect(issues).toContainEqual(expect.objectContaining({ location: "sales_focus", action: "作り直し", problem: expect.stringContaining("X-01") }));
  });

  it("以前の答え（sales_focus・vs_next が無い）は案内の型だけ見て、ほかは点検しない", () => {
    const legacy = { ...main(), targets: [{ ...target(1, null) }, { ...target(2, null) }] } as Partial<StrategyOutput>;
    delete legacy.sales_focus;
    for (const t of legacy.targets!) delete (t as Partial<typeof t>).vs_next;
    expect(salesFocusOf(legacy as StrategyOutput)).toBeNull();
    expect(vsNextOf(legacy.targets![0])).toBeNull();
    expect(checkSalesFocus(legacy as StrategyOutput, SF)).toEqual([]);
    expect(checkProgram(legacy as StrategyOutput, media(), FACTS, MEDIA_IDS).some((i) => i.location === "sales_focus")).toBe(false);
  });

  it("媒体担当には sales_focus を渡さない", () => {
    expect("sales_focus" in mainPart(main())).toBe(false);
  });
});
