import { describe, expect, it } from "vitest";
import { foldKana, parseAddress, pinAddress, resolveZone, schoolFullName, zoneRuleCity, type ZoneRow } from "../lib/facts/school-zones";
import { tableRows } from "../scripts/ingest/lib/html-table";
import { moveAppendixToItsChome, parseNagaokaAppendix, parseNagaokaAreas, parseNagaokaPage, rangesFor, type NagaokaAppendix } from "../scripts/ingest/jobs/d41-nagaoka-school-zones";
import { parseTsubameName, parseTsubamePage, tsubameRules } from "../scripts/ingest/jobs/d42-tsubame-school-zones";

// 町名・学校名は架空（書き方だけ市の表に合わせる）

describe("HTML の表（縦につないだセル）", () => {
  it("rowspan のセルを、つながる行にも入れる", () => {
    const html = `<table><tr><th>小学校</th><th>通学区域</th><th>中学校</th></tr>
      <tr><td rowspan="2">架空小</td><td>甲町1</td><td>架空中</td></tr>
      <tr><td>乙町</td><td>架空西中</td></tr></table>`;
    expect(tableRows(html)).toEqual([
      ["小学校", "通学区域", "中学校"],
      ["架空小", "甲町1", "架空中"],
      ["架空小", "乙町", "架空西中"],
    ]);
  });
});

describe("長岡市の通学区域の欄", () => {
  it("丁目を分け、「の一部」と附表を読む。数字だけの語は前の町の続き", () => {
    const areas = parseNagaokaAreas("甲町1、2 乙町3の一部 (附表1に示す区域) 丙町1の一部 (附表2に示す区域を除く。) 3 丁町");
    expect(areas.map((a) => [a.town, a.chome, a.scope, a.appendix])).toEqual([
      ["甲町", 1, "全部", null],
      ["甲町", 2, "全部", null],
      ["乙町", 3, "一部", { nos: [1], except: false }],
      ["丙町", 1, "一部", { nos: [2], except: true }],
      ["丙町", 3, "全部", null],
      ["丁町", null, "全部", null],
    ]);
  });

  it("「、」のあとに別の町名が続く書き方と、附表でない注記", () => {
    const areas = parseNagaokaAreas("甲1、2、甲町 乙 (川の東側区域) 丙の一部 (附表3及び4に示す区域)");
    expect(areas.map((a) => [a.town, a.chome, a.scope])).toEqual([
      ["甲", 1, "全部"],
      ["甲", 2, "全部"],
      ["甲町", null, "全部"],
      ["乙", null, "一部"],
      ["丙", null, "一部"],
    ]);
    expect(areas[3].appendix).toBeNull();
    expect(areas[4].appendix).toEqual({ nos: [3, 4], except: false });
  });

  it("学校名の略を正式名にする", () => {
    expect(schoolFullName("架空小")).toBe("架空小学校");
    expect(schoolFullName("架空中")).toBe("架空中学校");
    expect(schoolFullName("架空中学校")).toBe("架空中学校");
  });
});

describe("長岡市の附表", () => {
  it("番・号の範囲を読む", () => {
    const a = parseNagaokaAppendix(5, "甲町3のうち 1番24、26 2番17から20、24 3番 4番 15、19 10番から12番まで");
    expect(a).toMatchObject({ town: "甲町", chome: 3 });
    expect(a!.ranges).toEqual([
      { ban: [1, 1], go: [[24, 24], [26, 26]] },
      { ban: [2, 2], go: [[17, 20], [24, 24]] },
      { ban: [3, 3] },
      { ban: [4, 4], go: [[15, 15], [19, 19]] },
      { ban: [10, 12] },
    ]);
  });

  it("地番（NのM）と枝番の無い地番", () => {
    expect(parseNagaokaAppendix(48, "乙2のうち 173の2 201 230の5から230の7まで")!.ranges).toEqual([
      { ban: [173, 173], go: [[2, 2]] },
      { ban: [201, 201] },
      { ban: [230, 230], go: [[5, 7]] },
    ]);
  });

  it("甲乙・注記・「の一部」がある附表は番地で決めない（null）。削除は読まない", () => {
    expect(parseNagaokaAppendix(2, "甲町1のうち 1671番 甲1671番")!.ranges).toBeNull();
    expect(parseNagaokaAppendix(3, "甲町1のうち 4番 (旧乙町区域のみ)")!.ranges).toBeNull();
    expect(parseNagaokaAppendix(56, "甲町のうち 1206、1207の一部")!.ranges).toBeNull();
    expect(parseNagaokaAppendix(18, "削除")).toBeNull();
  });

  it("附表の町・丁目が行と違えば使わない。「1、2、3の一部」の附表が1丁目なら、一部なのは1丁目", () => {
    const appendices = new Map<number, NagaokaAppendix>([
      [51, { no: 51, town: "甲南", chome: 1, text: "甲南1のうち 1番", ranges: [{ ban: [1, 1] }] }],
      [49, { no: 49, town: "乙", chome: 3, text: "乙3のうち 250の2", ranges: [{ ban: [250, 250], go: [[2, 2]] }] }],
    ]);
    const moved = moveAppendixToItsChome(parseNagaokaAreas("甲南1、2、3の一部 (附表51に示す区域を除く。)"), appendices);
    expect(moved.map((a) => [a.chome, a.scope])).toEqual([[1, "一部"], [2, "全部"], [3, "全部"]]);
    expect(rangesFor(moved[0], appendices)).toEqual({ except: [{ ban: [1, 1] }] });
    // 別の町の附表（市の規則の書き誤り）は当てず、番地では決めない
    const [wrong] = parseNagaokaAreas("丙町の一部 (附表49に示す区域)");
    expect(rangesFor(wrong, appendices)).toBeNull();
  });

  it("ページから別表第1と附表を読む", () => {
    const html = `<table><tr><td>小学校</td><td>通学区域</td><td>中学校</td></tr>
      <tr><td rowspan="2">架空小</td><td>甲町1、2</td><td>架空中</td></tr><tr><td>乙町3の一部 (附表1に示す区域)</td><td>架空西中</td></tr></table>
      <table>${Array.from({ length: 10 }, (_, i) => `<tr><td>${i + 1}</td><td>${i === 1 ? "削除" : `乙町3のうち ${i + 1}番`}</td></tr>`).join("")}</table>`;
    const page = parseNagaokaPage(html);
    expect(page.rows).toEqual([
      { elementary: "架空小学校", areas: "甲町1、2", juniorHigh: "架空中学校" },
      { elementary: "架空小学校", areas: "乙町3の一部 (附表1に示す区域)", juniorHigh: "架空西中学校" },
    ]);
    expect(page.appendices.size).toBe(9);
    expect(page.appendices.get(1)!.ranges).toEqual([{ ban: [1, 1] }]);
  });
});

describe("燕市の学校区一覧", () => {
  it("行政区の名前を、住所の町名・丁目にする", () => {
    expect(parseTsubameName("甲町一丁目")).toMatchObject({ town: "甲町", chome: 1, partial: false });
    expect(parseTsubameName("甲本町二丁目1")).toMatchObject({ town: "甲本町", chome: 2, partial: true });
    expect(parseTsubameName("甲通五の1")).toMatchObject({ town: "甲通", chome: 5, partial: true });
    expect(parseTsubameName("甲通四")).toMatchObject({ town: "甲通", chome: 4, partial: false });
    expect(parseTsubameName("乙三区")).toMatchObject({ town: "乙", chome: null, partial: true });
    expect(parseTsubameName("丙")).toMatchObject({ town: "丙", chome: null, partial: false });
  });

  it("同じ町名が2つの学校区にあれば、どちらも重なり（shared）にする。同じ学校の重なりは1行にまとめる", () => {
    const html = `<table><thead><tr><th>町名(行政区)</th><th>小学校名</th><th>中学校名</th></tr></thead><tbody>
      <tr><td>甲町一丁目、丙、乙三区、乙四区</td><td>架空東小学校</td><td>架空中学校</td></tr>
      <tr><td><p>丙、丁</p></td><td>架空西小学校</td><td>架空中学校</td></tr></tbody></table>`;
    const rules = tsubameRules(parseTsubamePage(html));
    expect(rules.map((r) => [r.town, r.chome, r.elementary, r.partial, r.shared])).toEqual([
      ["甲町", 1, "架空東小学校", false, false],
      ["丙", null, "架空東小学校", false, true],
      ["乙", null, "架空東小学校", true, false],
      ["丙", null, "架空西小学校", false, true],
      ["丁", null, "架空西小学校", false, false],
    ]);
    expect(rules[2].text).toBe("乙三区、乙四区");
  });
});

describe("長岡市・燕市の住所との照らし合わせ", () => {
  const row = (r: Partial<ZoneRow>): ZoneRow => ({
    ward: null, town: "甲町", chome: null, lot_scope: "全部", lot_text: "全部", lot_ranges: null,
    elementary_school: "架空小学校", junior_high_school: "架空中学校", ...r,
  });

  it("長岡市・燕市の住所を読み、区は持たない", () => {
    expect(parseAddress("新潟県長岡市甲町3丁目12番5号")).toEqual({ cityCode: "15202", ward: null, rest: "甲町3丁目12番5号" });
    expect(parseAddress("燕市甲町1丁目2-3")).toEqual({ cityCode: "15213", ward: null, rest: "甲町1丁目2-3" });
    expect(zoneRuleCity("15104")).toBe("15100");
    expect(zoneRuleCity("15202")).toBe("15202");
    expect(zoneRuleCity("15204")).toBeNull();
  });

  it("「附表に示す区域を除く」：附表の番地なら外れ、それ以外なら学区", () => {
    const rows = [
      row({ chome: 3, lot_scope: "一部", lot_ranges: [{ ban: [12, 14] }], elementary_school: "架空東小学校" }),
      row({ chome: 3, lot_scope: "一部", lot_ranges: { except: [{ ban: [12, 14] }] }, elementary_school: "架空西小学校" }),
    ];
    const at = (rest: string) => resolveZone(rows, { cityCode: "15202", ward: null, rest }).elementary;
    expect(at("甲町3丁目13番1号")).toMatchObject({ status: "decided", school: "架空東小学校" });
    expect(at("甲町3丁目2番1号")).toMatchObject({ status: "decided", school: "架空西小学校" });
    // 番地が分からなければ両方の候補
    expect(at("甲町3丁目")).toMatchObject({ status: "ambiguous" });
  });

  it("「ヶ」と「ケ」の違い、全角の数字、「大字」を吸収する", () => {
    expect(foldKana("釜ヶ島")).toBe("釜ケ島");
    const rows = [row({ town: "甲ケ島", chome: 2 })];
    const addr = pinAddress({ name: "大字甲ヶ島２丁目", ward: "長岡市" }, null, rows, "15202");
    expect(addr).toEqual({ cityCode: "15202", ward: null, rest: "甲ヶ島2丁目" });
    expect(resolveZone(rows, addr).elementary).toMatchObject({ status: "decided", school: "架空小学校" });
  });
});
