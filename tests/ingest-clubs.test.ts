import { describe, expect, it } from "vitest";
import { CLUB_COLUMNS, findSchool, groupClubs, mergeNames, parseClubCsv, schoolNameIn, withDbColumns, type Located } from "../scripts/ingest/jobs/d21-clubs";

// D21 放課後児童クラブ（各市町村のホームページの一覧を写した CSV）の取り込み。クラブ名・住所は架空

const csv = (rows: Partial<Record<(typeof CLUB_COLUMNS)[number], string>>[]) =>
  [CLUB_COLUMNS.join(","), ...rows.map((r) => CLUB_COLUMNS.map((c) => `"${r[c] ?? ""}"`).join(","))].join("\r\n");

describe("放課後児童クラブの CSV", () => {
  it("列と値を読む。確認日は Excel の 2026/11/5 も受け付ける", () => {
    const rows = parseClubCsv(
      "﻿" + csv([{ 市町村: "架空市", 名前: "架空児童クラブ", 所在地: "架空町1-2", 場所: "架空小学校内", 確認日: "2026/11/5", 確認したURL: "https://example.jp/" }]),
    );
    expect(rows).toEqual([
      expect.objectContaining({ line: 2, city: "架空市", name: "架空児童クラブ", address: "架空町1-2", place: "架空小学校内", lat: null, lon: null, checkedOn: "2026-11-05" }),
    ]);
  });

  it("名前・市町村が空、緯度だけ、県の外の緯度経度、位置を出す住所の緯度経度が県の外の行は、行の番号を付けてまとめてエラー", () => {
    const text = csv([
      { 市町村: "架空市", 名前: "" },
      { 市町村: "", 名前: "A" },
      { 市町村: "架空市", 名前: "B", 緯度: "37.9" },
      { 市町村: "架空市", 名前: "C", 緯度: "139.0", 経度: "37.9" },
      { 市町村: "架空市", 名前: "D", 位置を出す住所: "35.0, 139.0" },
    ]);
    expect(() => parseClubCsv(text)).toThrow(/2行目.*名前が空[\s\S]*3行目.*市町村が空[\s\S]*4行目.*両方[\s\S]*5行目.*範囲の外[\s\S]*6行目.*範囲の外/);
  });

  it("「廃止」の列は任意。書いてあれば ended に入る（無い CSV は空）", () => {
    const text = [
      [...CLUB_COLUMNS, "廃止"].join(","),
      ["架空市", "続くクラブ", "", "", "", "", "", "", "", "", "", ""].join(","),
      ["架空市", "終わるクラブ", "", "", "", "", "", "", "", "", "", "令和8年で終了"].join(","),
    ].join("\r\n");
    expect(parseClubCsv(text).map((r) => [r.name, r.ended])).toEqual([
      ["続くクラブ", ""],
      ["終わるクラブ", "令和8年で終了"],
    ]);
    expect(parseClubCsv(csv([{ 市町村: "架空市", 名前: "A" }]))[0].ended).toBe("");
  });

  it("列が足りなければエラー", () => {
    expect(() => parseClubCsv("市町村,名前\r\n架空市,A")).toThrow(/「所在地」/);
  });
});

describe("場所から小学校の名前を取り出す", () => {
  it("「○○小学校内」「○○小学校敷地内」「○○小学校（集会室）」から学校の名前を取る", () => {
    expect(schoolNameIn("大野小学校内（1階）")).toBe("大野小学校");
    expect(schoolNameIn("金津小学校敷地内")).toBe("金津小学校");
    expect(schoolNameIn("小千谷小学校（集会室）")).toBe("小千谷小学校");
    expect(schoolNameIn("上越教育大学附属小学校内")).toBe("上越教育大学附属小学校");
  });

  it("名前の無い「単独（小学校敷地内）」と「小学校区」は学校にしない", () => {
    expect(schoolNameIn("単独（小学校敷地内）")).toBeNull();
    expect(schoolNameIn("見附第二小学校区ふるさとセンター内")).toBeNull();
    expect(schoolNameIn("夢の木はうす")).toBeNull();
  });

  it("P29 の学校を、市町村と「○○立」を除いた名前で選ぶ。附属校は名前の末尾で選ぶ。同じ名前が他の市町村にあっても選ばない", () => {
    const schools = [
      { name: "架空市立能生小学校", cityCode: "15216", lon: 137.9, lat: 37.1 },
      { name: "架空市立中能生小学校", cityCode: "15216", lon: 137.9, lat: 37.0 },
      { name: "別市立能生小学校", cityCode: "15222", lon: 138.2, lat: 37.1 },
      { name: "新潟大学附属新潟小学校", cityCode: "15103", lon: 139.0, lat: 37.9 },
    ];
    expect(findSchool(schools, "15216", "能生小学校")?.name).toBe("架空市立能生小学校");
    expect(findSchool(schools, "15216", "架空小学校")).toBeNull();
    // 新潟市は区が違っても新潟市の中で探す（P29 の市区町村コードは区ごと）
    expect(findSchool(schools, "15101", "附属新潟小学校")?.name).toBe("新潟大学附属新潟小学校");
  });
});

describe("同じ位置のクラブの名前をまとめる", () => {
  it("違うのが「第一」「第二」などだけなら縮める", () => {
    expect(mergeNames(["西小第一児童クラブ", "西小第二児童クラブ", "西小第三児童クラブ"])).toBe("西小第一・第二・第三児童クラブ");
    expect(mergeNames(["架空ひまわりクラブ 第1", "架空ひまわりクラブ 第2"])).toBe("架空ひまわりクラブ 第1・第2");
    expect(mergeNames(["架空友遊くらぶ第一", "架空友遊くらぶ第二"])).toBe("架空友遊くらぶ第一・第二");
    expect(mergeNames(["田尻第一児童クラブ", "田尻第二児童クラブ"])).toBe("田尻第一・第二児童クラブ");
  });

  it("名前が違うものは「・」でつなぐ", () => {
    expect(mergeNames(["わかばクラブ", "金城クラブ"])).toBe("わかばクラブ・金城クラブ");
    expect(mergeNames(["猿橋児童クラブ", "猿橋第2児童クラブ"])).toBe("猿橋児童クラブ・猿橋第2児童クラブ");
    expect(mergeNames(["大島児童会館", "大島第二児童クラブ"])).toBe("大島児童会館・大島第二児童クラブ");
  });

  it("1つなら、そのまま。同じ名前が重なれば1つにする", () => {
    expect(mergeNames(["架空児童クラブ"])).toBe("架空児童クラブ");
    expect(mergeNames(["架空児童クラブ", "架空児童クラブ"])).toBe("架空児童クラブ");
  });

  it("同じ市町村で同じ位置のクラブを1件にまとめる。大字までの位置は住所の文字が同じときだけ。位置の無い行は入れない", () => {
    const base = { searchAddress: "", pageAsOf: "", checkedOn: null, url: null, memo: "", place: "", hitTitle: null, school: null, ended: "" };
    const r = (line: number, city: string, name: string, address: string, lon: number | null, lat: number | null, how: Located["how"]): Located => ({
      ...base,
      line,
      city,
      name,
      address,
      lon,
      lat,
      how,
    });
    const groups = groupClubs([
      r(2, "新潟市北区", "架空 第1", "新潟市北区架空1", 139.1, 37.9, "住所から推定（国土地理院 住所検索）"),
      r(3, "新潟市北区", "架空 第2", "新潟市北区架空1", 139.1, 37.9, "住所から推定（国土地理院 住所検索）"),
      r(4, "架空市", "甲クラブ", "大字甲1", 138.5, 37.5, "住所から推定（大字・町名まで）"),
      r(5, "架空市", "乙クラブ", "大字甲2", 138.5, 37.5, "住所から推定（大字・町名まで）"),
      r(6, "架空市", "丙クラブ", "", null, null, null),
    ]);
    expect(groups.map((g) => g.name)).toEqual(["架空 第1・第2", "甲クラブ", "乙クラブ"]);
  });
});

describe("DB に入れた位置を CSV に書き戻す", () => {
  const base = { address: "", place: "", searchAddress: "", pageAsOf: "", checkedOn: null, url: null, memo: "", ended: "", hitTitle: null, school: null };
  const loc = (line: number, name: string, lon: number | null, lat: number | null, how: Located["how"], extra: Partial<Located> = {}): Located => ({
    ...base, line, city: "架空市", name, lon, lat, how, ...extra,
  });

  it("DB の列を足し、ほかの列と空の行はそのまま。入れなかった行は理由を書く", () => {
    const text = "﻿市町村,名前,メモ,廃止\n架空市,Aクラブ,\"a,b\",\n架空市,Bクラブ,,\n,,,\n架空市,Cクラブ,,令和8年で終了\n";
    const out = withDbColumns(text, [
      loc(2, "Aクラブ", 139.1234567, 37.7654321, "住所から推定（大字・町名まで）", { hitTitle: "新潟県架空市架空" }),
      loc(3, "Bクラブ", null, null, null),
    ]);
    expect(out.split("\n")).toEqual([
      "﻿市町村,名前,メモ,廃止,DBの緯度,DBの経度,DBの位置の出し方,DBの当たった住所・学校",
      '架空市,Aクラブ,"a,b",,37.765432,139.123457,住所から推定（大字・町名まで）,新潟県架空市架空',
      "架空市,Bクラブ,,,,,位置を出せず入れていない,",
      ",,,,,,,",
      "架空市,Cクラブ,,令和8年で終了,,,廃止のため入れていない,",
      "",
    ]);
  });

  it("書き戻した CSV を、もう一度そのまま読める（DB の列は読み込みで使わない）", () => {
    const text = csv([{ 市町村: "架空市", 名前: "架空児童クラブ", 所在地: "架空町1-2", 確認日: "2026/11/5" }]);
    const before = parseClubCsv(text);
    const after = parseClubCsv(withDbColumns(text, [loc(2, "架空児童クラブ", 139.5, 37.5, "住所から推定（国土地理院 住所検索）")]));
    expect(after).toEqual(before);
  });

  it("もう一度書き戻すと、DB の列を上書きする（列は増えない）", () => {
    const text = "市町村,名前,DBの緯度,DBの経度,DBの位置の出し方,DBの当たった住所・学校\n架空市,Aクラブ,1,2,古い,古い\n";
    const out = withDbColumns(text, [loc(2, "Aクラブ", 139.5, 37.5, "P29 の小学校の位置", { school: "架空市立架空小学校" })]);
    expect(out.split("\n")[1]).toBe("架空市,Aクラブ,37.500000,139.500000,P29 の小学校の位置,架空市立架空小学校");
    expect(out.split("\n")[0]).toBe("﻿市町村,名前,DBの緯度,DBの経度,DBの位置の出し方,DBの当たった住所・学校");
  });
});
