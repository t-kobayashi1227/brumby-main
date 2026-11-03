import { describe, expect, it } from "vitest";
import { importSchema, parseAreaSqm, parseBuildingAge, parseParking, parsePriceManYen, parseWalkMin, parseYearMonth, toFormFields, type ImportOutput } from "../lib/property-import";

describe("数字への直し方", () => {
  it("価格を万円に直す", () => {
    expect(parsePriceManYen("2,480万円")).toBe(2480);
    expect(parsePriceManYen("２，４８０万円（税込）")).toBe(2480);
    expect(parsePriceManYen("1億2,000万円")).toBe(12000);
    expect(parsePriceManYen("1億円")).toBe(10000);
    expect(parsePriceManYen("24,800,000円")).toBe(2480);
    expect(parsePriceManYen("価格相談")).toBeNull();
  });

  it("面積は㎡を優先し、坪だけなら換算する", () => {
    expect(parseAreaSqm("105.98㎡（32.05坪）")).toBe(105.98);
    expect(parseAreaSqm("105.98m2")).toBe(105.98);
    expect(parseAreaSqm("165.3平米")).toBe(165.3);
    expect(parseAreaSqm("50坪")).toBe(165.29);
    expect(parseAreaSqm("広い")).toBeNull();
  });

  it("徒歩分と駐車台数", () => {
    expect(parseWalkMin("徒歩8分")).toBe(8);
    expect(parseWalkMin("徒歩約12分")).toBe(12);
    expect(parseParking("駐車2台")).toBe(2);
    expect(parseParking("カーポート１台")).toBe(1);
    expect(parseParking("駐車場なし")).toBe(0);
  });

  it("年月は西暦と和暦を読む", () => {
    expect(parseYearMonth("2015年3月築")).toEqual({ year: 2015, month: 3 });
    expect(parseYearMonth("平成27年3月")).toEqual({ year: 2015, month: 3 });
    expect(parseYearMonth("令和元年10月")).toEqual({ year: 2019, month: 10 });
    expect(parseYearMonth("昭和60年")).toEqual({ year: 1985, month: null });
  });

  it("築年数は満年数。新築・完成前は0", () => {
    const today = new Date(2026, 10, 3); // 2026-11-03
    expect(parseBuildingAge("2015年3月築", today)).toBe(11);
    expect(parseBuildingAge("2015年12月築", today)).toBe(10);
    expect(parseBuildingAge("平成27年", today)).toBe(11);
    expect(parseBuildingAge("築9年", today)).toBe(9);
    expect(parseBuildingAge("新築", today)).toBe(0);
    expect(parseBuildingAge("2027年3月完成予定", today)).toBe(0);
  });
});

const SOURCE = `
新潟市西区寺尾東3丁目　中古戸建
価格　２，４８０万円
所在地　新潟市西区寺尾東3丁目12-5
交通　JR越後線「寺尾」駅 徒歩8分
　　　新潟交通バス「寺尾小学校前」停 徒歩3分
間取り　4LDK+S
建物面積　105.98㎡（32.05坪）　土地面積　50坪
駐車　並列2台
築年月　平成27年3月　木造2階建
2023年キッチン・浴室リフォーム済み
南向きリビング、シャッター車庫あり
`;

function output(over: Partial<ImportOutput> = {}): ImportOutput {
  return {
    property_class: { value: "中古", evidence: "中古戸建" },
    price: "２，４８０万円",
    address: "新潟市西区寺尾東3丁目12-5",
    transports: [
      { mode: "電車", line: "JR越後線", stop_name: "寺尾", walk: "徒歩8分", evidence: "JR越後線「寺尾」駅 徒歩8分" },
      { mode: "バス", line: "新潟交通バス", stop_name: "寺尾小学校前", walk: "徒歩3分", evidence: "新潟交通バス「寺尾小学校前」停 徒歩3分" },
    ],
    layout: "4LDK+S",
    building_area: "105.98㎡（32.05坪）",
    land_area: "50坪",
    parking: "並列2台",
    built: "平成27年3月",
    floors: { value: "2階建", evidence: "木造2階建" },
    garden: { value: null, evidence: null },
    renovation: {
      value: "あり",
      evidence: "2023年キッチン・浴室リフォーム済み",
      year: "2023年",
      parts: [
        { part: "キッチン", evidence: "キッチン" },
        { part: "浴室", evidence: "浴室" },
      ],
    },
    features: ["南向きリビング", "シャッター車庫あり"],
    ...over,
  };
}

describe("toFormFields", () => {
  const today = new Date(2026, 10, 3);

  it("資料にある文字を、入力欄の値に直す", () => {
    const r = toFormFields(output(), SOURCE, today);
    expect(r.fields).toEqual({
      property_class: "中古",
      price_man_yen: "2480",
      address: "新潟市西区寺尾東3丁目12-5",
      t1_mode: "電車",
      t1_line: "JR越後線",
      t1_stop_name: "寺尾",
      t1_walk_min: "8",
      t2_mode: "バス",
      t2_line: "新潟交通バス",
      t2_stop_name: "寺尾小学校前",
      t2_walk_min: "3",
      layout: "4LDK+S",
      building_sqm: "105.98",
      land_sqm: "165.29",
      parking: "2",
      building_age: "11",
      floors: "2階建",
      renovated: "あり",
      renovation_year: "2023",
      features: "南向きリビング、シャッター車庫あり",
    });
    expect(r.renovationParts).toEqual(["キッチン", "浴室"]);
    expect(r.missing).toEqual(["庭"]);
  });

  it("資料に無い文字（AI が作った値）は入れない", () => {
    const r = toFormFields(output({ price: "2,580万円", address: "新潟市西区寺尾東3丁目99", features: ["駅近", "南向きリビング"] }), SOURCE, today);
    expect(r.fields.price_man_yen).toBeUndefined();
    expect(r.fields.address).toBeUndefined();
    expect(r.fields.features).toBe("南向きリビング");
    expect(r.missing).toContain("価格");
    expect(r.missing).toContain("住所");
  });

  it("選択肢は、根拠が資料に無ければ入れない", () => {
    const r = toFormFields(output({ garden: { value: "あり", evidence: "広い庭" } }), SOURCE, today);
    expect(r.fields.has_garden).toBeUndefined();
  });

  it("交通は徒歩分が読めないものを飛ばす", () => {
    const o = output();
    o.transports[0] = { ...o.transports[0], walk: null };
    const r = toFormFields(o, SOURCE, today);
    expect(r.fields.t1_stop_name).toBe("寺尾小学校前");
    expect(r.fields.t2_mode).toBeUndefined();
  });

  it("読めない間取りは入れない", () => {
    const r = toFormFields(output({ layout: "4LDK+書斎" }), "4LDK+書斎", today);
    expect(r.fields.layout).toBeUndefined();
  });

  it("答えの形は structured outputs に渡せる（JSON Schema にできる）", () => {
    expect(() => importSchema.toJSONSchema()).not.toThrow();
  });
});

describe("資料の受け取り（property-import-source）", async () => {
  const { readImportSource, toSourceText } = await import("../lib/property-import-source");

  it("テキストを受け取り、前後の空白を除く", async () => {
    const fd = new FormData();
    fd.set("kind", "text");
    fd.set("text", "  価格 2,480万円 \n");
    const source = readImportSource(fd);
    expect(source).toEqual({ kind: "text", text: "  価格 2,480万円 \n" });
    expect(await toSourceText(source as { kind: "text"; text: string })).toEqual({ text: "価格 2,480万円" });
  });

  it("まだ対応していない種類・空・長すぎるものは理由を返す", async () => {
    const fd = new FormData();
    fd.set("kind", "pdf");
    expect(readImportSource(fd)).toHaveProperty("error");
    expect(await toSourceText({ kind: "text", text: "  " })).toHaveProperty("error");
    expect(await toSourceText({ kind: "text", text: "あ".repeat(20001) })).toHaveProperty("error");
  });
});
