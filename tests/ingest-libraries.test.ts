import { describe, expect, it } from "vitest";
import {
  addressChangedButKeptCoords,
  asOfOf,
  cityNameOf,
  CSV_COLUMNS,
  decodeCsv,
  draftCsv,
  featureKey,
  isTownLevelHit,
  locationPlan,
  normalizeDate,
  parseLibraryCsv,
  type LibraryRow,
} from "../scripts/ingest/jobs/d23-libraries";

const header = CSV_COLUMNS.join(",");
/** 列の順に値を並べた1行（足りない列は空） */
const line = (v: Partial<Record<(typeof CSV_COLUMNS)[number], string>>) => CSV_COLUMNS.map((c) => v[c] ?? "").join(",");
const csv = (...rows: string[]) => [header, ...rows].join("\r\n");

const ok = {
  元のID: "XKT017:15201:1",
  状態: "そのまま",
  名前: "新潟市立中央図書館",
  市町村: "新潟市中央区",
  住所: "新潟市中央区明石2-1-10",
  緯度: "37.9116",
  経度: "139.0573",
  確認日: "2026-11-14",
};

describe("parseLibraryCsv", () => {
  it("BOM 付きの CSV を読み、値を整える", () => {
    const [r] = parseLibraryCsv("﻿" + csv(line(ok)));
    expect(r).toMatchObject({ line: 2, sourceId: "XKT017:15201:1", state: "そのまま", lat: 37.9116, lon: 139.0573, checkedOn: "2026-11-14" });
  });

  it("全部空の行は飛ばす", () => {
    expect(parseLibraryCsv(csv(line(ok), line({}), ""))).toHaveLength(1);
  });

  it("列が足りなければエラー", () => {
    expect(() => parseLibraryCsv("名前,住所\r\nA,B")).toThrow(/「元のID」/);
  });

  it("状態の値が違えばエラー（行の番号付き）", () => {
    expect(() => parseLibraryCsv(csv(line({ ...ok, 状態: "OK" })))).toThrow(/2行目.*状態は/);
  });

  it("緯度だけ・県の外・住所も緯度経度も無い行はエラー", () => {
    expect(() => parseLibraryCsv(csv(line({ ...ok, 経度: "" })))).toThrow(/両方/);
    expect(() => parseLibraryCsv(csv(line({ ...ok, 緯度: "139.0573", 経度: "37.9116" })))).toThrow(/範囲の外/);
    expect(() => parseLibraryCsv(csv(line({ ...ok, 緯度: "", 経度: "", 住所: "" })))).toThrow(/住所が要ります/);
  });

  it("閉館は住所も位置も無くてよい", () => {
    expect(parseLibraryCsv(csv(line({ ...ok, 状態: "閉館", 緯度: "", 経度: "", 住所: "" })))[0].state).toBe("閉館");
  });

  it("元のID の重なりはエラー", () => {
    expect(() => parseLibraryCsv(csv(line(ok), line({ ...ok, 名前: "別の館" })))).toThrow(/重なっています/);
  });

  it("おかしな行はまとめて知らせる", () => {
    expect(() => parseLibraryCsv(csv(line({ ...ok, 状態: "" }), line({ ...ok, 元のID: "", 名前: "" })))).toThrow(/2行目[\s\S]*3行目/);
  });
});

describe("normalizeDate", () => {
  it("Excel の書き方（2026/1/5）も YYYY-MM-DD にする", () => {
    expect(normalizeDate("2026/1/5")).toBe("2026-01-05");
    expect(normalizeDate("2026-11-14")).toBe("2026-11-14");
    expect(normalizeDate(" ")).toBeNull();
  });
  it("ありえない日付・別の形はエラー", () => {
    expect(() => normalizeDate("2026-02-30")).toThrow();
    expect(() => normalizeDate("11月14日")).toThrow();
  });
});

describe("decodeCsv", () => {
  it("BOM 付き UTF-8・BOM 無し UTF-8・Shift_JIS（Excel の普通の CSV）を読む", () => {
    const utf8 = new TextEncoder().encode("名前,図書館");
    expect(decodeCsv(new Uint8Array([0xef, 0xbb, 0xbf, ...utf8]))).toBe("名前,図書館");
    expect(decodeCsv(utf8)).toBe("名前,図書館");
    // 「図書館」の Shift_JIS
    expect(decodeCsv(new Uint8Array([0x90, 0x7d, 0x8f, 0x91, 0x8a, 0xd9]))).toBe("図書館");
  });
});

const row = (v: Partial<LibraryRow>): LibraryRow => ({
  line: 2,
  sourceId: null,
  state: "そのまま",
  name: "館",
  city: "長岡市",
  address: "長岡市学校町1-2-2",
  lat: null,
  lon: null,
  checkedOn: null,
  url: null,
  originalAddress: null,
  ...v,
});

describe("locationPlan", () => {
  it("緯度・経度があればそれを使う", () => {
    expect(locationPlan(row({ lat: 37.44, lon: 138.85 }))).toEqual({ kind: "csv", lon: 138.85, lat: 37.44 });
  });
  it("無ければ住所検索。市町村の無い住所には市町村を足す", () => {
    expect(locationPlan(row({}))).toEqual({ kind: "geocode", query: "長岡市学校町1-2-2" });
    expect(locationPlan(row({ address: "学校町1-2-2" }))).toEqual({ kind: "geocode", query: "長岡市学校町1-2-2" });
  });
  it("郡から書いた住所には市町村を足さず、全角の数字は半角にする", () => {
    expect(locationPlan(row({ city: "弥彦村", address: "西蒲原郡弥彦村大字矢作402" }))).toEqual({ kind: "geocode", query: "西蒲原郡弥彦村大字矢作402" });
    expect(locationPlan(row({ city: "阿賀町", address: "東蒲原郡阿賀町鹿瀬８９８５－１" }))).toEqual({ kind: "geocode", query: "東蒲原郡阿賀町鹿瀬8985-1" });
  });
});

describe("addressChangedButKeptCoords", () => {
  it("住所を直して緯度・経度を残した行を見つける", () => {
    expect(addressChangedButKeptCoords(row({ lat: 37.4, lon: 138.8, originalAddress: "長岡市旧住所" }))).toBe(true);
    expect(addressChangedButKeptCoords(row({ lat: 37.4, lon: 138.8, originalAddress: "長岡市学校町1-2-2" }))).toBe(false);
    expect(addressChangedButKeptCoords(row({ originalAddress: "長岡市旧住所" }))).toBe(false);
  });
});

describe("isTownLevelHit", () => {
  it("大字・町名までの当たりを見分ける", () => {
    expect(isTownLevelHit("新潟県十日町市松代")).toBe(true);
    expect(isTownLevelHit("新潟県三条市元町")).toBe(true);
    expect(isTownLevelHit("新潟県新潟市中央区上近江一丁目")).toBe(false);
    expect(isTownLevelHit("新潟県長岡市大手通二丁目3番")).toBe(false);
    expect(isTownLevelHit("新潟県新発田市諏訪町1-2-12")).toBe(false);
  });
});

describe("asOfOf", () => {
  it("確認日が無ければ 2013", () => {
    expect(asOfOf([row({ state: "未確認" })])).toBe("2013");
  });
  it("一番新しい確認日の年月。閉館の行は見ない", () => {
    expect(asOfOf([row({ checkedOn: "2026-10-30" }), row({ checkedOn: "2026-11-02" }), row({ state: "閉館", checkedOn: "2026-12-01" })])).toBe("2026-11");
  });
  it("未確認が残れば「（一部2013）」を付ける", () => {
    expect(asOfOf([row({ checkedOn: "2026-11-02" }), row({ state: "未確認" })])).toBe("2026-11（一部2013）");
  });
});

describe("下書き", () => {
  it("featureKey は点だけ。同じ館は同じキー", () => {
    const f = { geometry: { type: "Point", coordinates: [139.0573001, 37.9116] }, properties: { P27_001: "15103", P27_005_ja: "中央図書館" } };
    expect(featureKey(f)).toBe("15103|中央図書館|139.057300,37.911600");
    expect(featureKey({ ...f, geometry: { type: "Polygon", coordinates: [] } })).toBeNull();
  });

  it("cityNameOf：新潟市は区を付ける", () => {
    expect(cityNameOf("15103", "中央区")).toBe("新潟市中央区");
    expect(cityNameOf("15202", "長岡市")).toBe("長岡市");
  });

  it("書き出した下書きを、そのまま読み込める", () => {
    const text = draftCsv([{ sourceId: "XKT017:15202:1", name: "長岡市立中央図書館", city: "長岡市", address: "長岡市学校町1-2-2", lon: 138.85, lat: 37.44 }]);
    expect(text.startsWith("﻿")).toBe(true);
    const [r] = parseLibraryCsv(text);
    expect(r).toMatchObject({ sourceId: "XKT017:15202:1", state: "未確認", lat: 37.44, lon: 138.85, originalAddress: "長岡市学校町1-2-2" });
  });
});
