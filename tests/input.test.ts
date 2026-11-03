import { describe, expect, it } from "vitest";
import { checkInput, factsForAgent, factTable, mediaInput, shortValue, strategyInput } from "../lib/agents/input";
import type { Fact, FactSheet } from "../lib/facts/types";

const f = (id: string, 項目: string, 値: string | null = "x", extra: Partial<Fact> = {}): Fact => ({
  id,
  項目,
  値,
  出典: "出典",
  時点: "2026-10",
  状態: 値 === null ? "取得できず" : "取得",
  ...extra,
});

const FACTS: Fact[] = [
  f("P-02", "価格", "2,480万円"),
  f("P-12", "所在地", "新潟県新潟市西区架空町1丁目2番3号"),
  f("P-13", "広告予算の総額", "入力なし"),
  f("M-06", "近くの公示地（住宅地）", "35,800円/㎡（前年比+0.6%）、物件から直線650m、所在地：新潟県新潟市西区架空町２丁目１番"),
  f("A-06", "65歳以上の割合", null),
  f("A-09", "65歳以上の世帯員のいる世帯の割合", "30.0%"),
  f("A-12", "夫婦と子供から成る世帯の割合", "28.0%"),
  f("A-13", "夫婦のみの世帯の割合", "20.0%"),
  f("S-01", "小学校区", "架空小学校（物件から直線700m）"),
  f("L-01", "小学校（1km以内）", "1件：架空小学校 直線700m"),
  f("L-02", "中学校（1km以内）", "1件：架空中学校 直線900m"),
  f("L-03", "コンビニ（1km以内）", "3件：Aマート 直線200m、Bストア 直線500m、Cマート 直線800m", { 比較: "西区の町の平均 2.0件" }),
  f("L-04", "歯科（1km以内）", "2件：A歯科 直線300m、B歯科 直線600m"),
  f("L-05", "内科のある病院・診療所（1km以内）", "1件：架空内科 直線420m"),
  f("L-06", "眼科のある病院・診療所（1km以内）", "0件。3km以内になし"),
  f("T-04", "最寄りバス停（直線）", "架空停 直線120m"),
  f("T-05", "バス停（1km以内）", "2件：架空停 直線120m、西停 直線700m", { 比較: "西区の町の平均 16.5件" }),
  f("B-01", "月々の返済額（変動0.95%・35年）", "約6.2万円"),
  f("B-02", "必要年収（変動0.95%）", "約300万円"),
  f("B-05", "必要年収以上の世帯の割合（変動0.95%、全国の中古戸建を買った世帯の年収分布から）", "約85%"),
  f("B-07", "【若い夫婦・単身】の返済の目安（返済期間35年）", "代表年齢30・35歳。…"),
  f("B-08", "【60歳以上】の返済の目安（返済期間15年）", "代表年齢65歳。…"),
  f("B-10", "買主の年代（中古戸建を買った世帯の世帯主）", "30代 22.9%", { 状態: "要確認" }),
  f("B-11", "物件を探した方法（中古戸建を買った世帯、複数回答）", null),
  f("B-12", "Instagramの利用率（年代別）", "20代83%"),
  f("B-13", "Xの利用率（年代別）", "20代73%"),
  f("B-14", "テレビを情報源として重要と考える人の割合（年代別）", "70代91%"),
  f("B-15", "新聞を情報源として重要と考える人の割合（年代別）", "70代77%"),
  f("B-16", "ターゲット候補「若い夫婦」の定義", "世帯主が20〜30代前半の夫婦（代表年齢30歳）"),
  f("C-01", "SUUMO", "分類：不動産ポータル"),
  f("C-02", "新聞折込チラシ", "分類：紙"),
];
const SHEET: FactSheet = { 物件ID: "X", 作成日時: "2026-11-04T00:00:00Z", 距離の種類: "直線距離", 事実: FACTS };
const ids = (fs: Fact[]) => fs.map((x) => x.id);

describe("AIに送る事実の選び方", () => {
  it("どの担当にも送らない事実", () => {
    for (const agent of ["戦略", "媒体", "確認"] as const) {
      const got = ids(factsForAgent(SHEET, agent));
      for (const id of ["P-13", "A-09", "A-12", "L-02", "L-04", "L-06", "B-13", "B-14"]) expect(got, `${agent} ${id}`).not.toContain(id);
    }
  });

  it("戦略担当：取得できず・要確認は残し、媒体を選ぶための統計は送らない", () => {
    const got = ids(factsForAgent(SHEET, "戦略"));
    expect(got).toEqual(expect.arrayContaining(["P-02", "A-06", "A-13", "S-01", "L-05", "B-07", "B-08", "B-10", "B-12", "B-16", "C-01"]));
    expect(got).not.toContain("B-11");
    expect(got).not.toContain("B-15");
  });

  it("学区が取れていれば小学校（1km以内）は送らない。学区が要確認なら送る", () => {
    expect(ids(factsForAgent(SHEET, "戦略"))).not.toContain("L-01");
    const unsure = { ...SHEET, 事実: FACTS.map((x) => (x.id === "S-01" ? { ...x, 状態: "要確認" as const } : x)) };
    expect(ids(factsForAgent(unsure, "戦略"))).toContain("L-01");
  });

  it("同じ返済期間の返済の目安があれば、前提どおりの返済額などは送らない。無ければ送る", () => {
    const got = ids(factsForAgent(SHEET, "戦略"));
    for (const id of ["B-01", "B-02", "B-05"]) expect(got).not.toContain(id);
    const no35 = { ...SHEET, 事実: FACTS.filter((x) => x.id !== "B-07") };
    expect(ids(factsForAgent(no35, "戦略"))).toEqual(expect.arrayContaining(["B-01", "B-02", "B-05"]));
  });

  it("媒体担当：P・B・C だけで、ローンの行と買主の年代は送らない", () => {
    const got = ids(factsForAgent(SHEET, "媒体"));
    expect(got.every((id) => /^[PBC]-/.test(id))).toBe(true);
    for (const id of ["B-07", "B-08", "B-10"]) expect(got).not.toContain(id);
    expect(got).toEqual(expect.arrayContaining(["P-02", "B-11", "B-12", "B-15", "B-16", "C-01"]));
  });

  it("確認担当：戦略担当と媒体担当に送った事実の全部", () => {
    const union = new Set([...ids(factsForAgent(SHEET, "戦略")), ...ids(factsForAgent(SHEET, "媒体"))]);
    expect(new Set(ids(factsForAgent(SHEET, "確認")))).toEqual(union);
  });
});

describe("値を短くする", () => {
  const byId = (id: string) => FACTS.find((x) => x.id === id)!;
  it("所在地は丁目まで。読み取れなければそのまま", () => {
    expect(shortValue(byId("P-12"))).toBe("新潟県新潟市西区架空町1丁目");
    expect(shortValue(f("P-12", "所在地", "新潟県新潟市西区架空字東123"))).toBe("新潟県新潟市西区架空字東123");
  });
  it("公示地は所在地を外す", () => {
    expect(shortValue(byId("M-06"))).toBe("35,800円/㎡（前年比+0.6%）、物件から直線650m");
  });
  it("コンビニは件数と最寄り1件、バス停は件数だけ。0件の書き方は変えない", () => {
    expect(shortValue(byId("L-03"))).toBe("3件（最寄り：Aマート 直線200m）");
    expect(shortValue(byId("T-05"))).toBe("2件");
    expect(shortValue(f("L-03", "コンビニ（1km以内）", "0件。3km以内の最寄り：Aマート 直線1.2km"))).toBe("0件。3km以内の最寄り：Aマート 直線1.2km");
  });
});

describe("表の形", () => {
  it("見出しは1回。取得は空欄、取得できずは値が空欄。区切りと改行は置き換える", () => {
    const t = factTable([f("P-02", "価格", "2,480万円"), f("A-06", "65歳以上の割合", null), f("P-11", "特徴", "南向き|角地\n駐車2台")]).split("\n");
    expect(t[0]).toBe("id|項目|値|比較|出典|時点|状態");
    expect(t[1]).toBe("P-02|価格|2,480万円||出典|2026-10|");
    expect(t[2]).toBe("A-06|65歳以上の割合|||出典|2026-10|取得できず");
    expect(t[3]).toBe("P-11|特徴|南向き／角地 駐車2台||出典|2026-10|");
  });

  it("戦略担当には媒体一覧を名前だけで渡す", () => {
    const s = strategyInput(SHEET);
    expect(s).toContain("媒体一覧（名前だけ。媒体を選ぶのは媒体担当）：C-01 SUUMO、C-02 新聞折込チラシ");
    expect(s).not.toContain("分類：不動産ポータル");
    expect(s.startsWith("距離の種類：直線距離")).toBe(true);
  });

  it("媒体と確認には答えを JSON で添える。媒体には距離の種類を送らない", () => {
    expect(mediaInput(SHEET, { targets: [] })).toContain('メインの答え（JSON）：\n{"targets":[]}');
    expect(mediaInput(SHEET, {})).not.toContain("距離の種類");
    expect(mediaInput(SHEET, {})).toContain("C-01|SUUMO|分類：不動産ポータル");
    expect(checkInput(SHEET, { ok: 1 })).toContain('点検する文章（JSON）：\n{"ok":1}');
  });
});
