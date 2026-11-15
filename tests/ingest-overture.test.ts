import { describe, expect, it } from "vitest";
import { chainKey, dedupeShops, kindOfOverture, notInExisting, sameShop, type ShopPoint } from "../scripts/ingest/jobs/overture";

// 店の名前・位置は架空（新潟駅の近くの緯度経度を使う）
const at = (name: string, kind: ShopPoint["kind"], dLonM = 0, dLatM = 0) => ({ name, kind, lon: 139.0612 + dLonM / 88_000, lat: 37.9122 + dLatM / 111_000 });

describe("Overture の種類（kindOfOverture）", () => {
  it("コンビニ・スーパー・ドラッグストアを決める", () => {
    expect(kindOfOverture("convenience_store", "セブン-イレブン 新潟駅前店")).toBe("コンビニ");
    expect(kindOfOverture("grocery_store", "原信 架空店")).toBe("スーパー");
    expect(kindOfOverture("drugstore", "架空ドラッグ")).toBe("ドラッグストア");
  });

  it("薬局はドラッグストアのチェーン名のときだけドラッグストアにし、ほかの薬局は使わない（医療情報ネットを使う）", () => {
    expect(kindOfOverture("pharmacy", "ウエルシア 架空店")).toBe("ドラッグストア");
    expect(kindOfOverture("pharmacy", "クスリのアオキ 架空店")).toBe("ドラッグストア");
    expect(kindOfOverture("pharmacy", "架空調剤薬局")).toBeNull();
    expect(kindOfOverture("liquor_store", "架空酒店")).toBeNull();
  });

  it("名前がチェーン名か、スーパーと分かる言葉の店だけを使う（酒蔵・豆腐店・個人の商店は使わない）", () => {
    expect(kindOfOverture("grocery_store", "架空マーケット")).toBe("スーパー");
    expect(kindOfOverture("grocery_store", "業務スーパー架空店")).toBe("スーパー");
    expect(kindOfOverture("grocery_store", "架空酒造")).toBeNull();
    expect(kindOfOverture("grocery_store", "架空豆腐店")).toBeNull();
    expect(kindOfOverture("grocery_store", "架空商店")).toBeNull();
    expect(kindOfOverture("grocery_store", "架空中央魚市場")).toBeNull();
    expect(kindOfOverture("grocery_store", "原信 架空Dc")).toBeNull();
    expect(kindOfOverture("grocery_store", "清水フードセンター 架空店")).toBe("スーパー");
    expect(kindOfOverture("convenience_store", "ローソン 架空店")).toBe("コンビニ");
    expect(kindOfOverture("convenience_store", "架空商店")).toBeNull();
    expect(kindOfOverture("convenience_store", "セーブオン 架空店")).toBeNull();
    expect(kindOfOverture("drugstore", "架空薬品")).toBe("ドラッグストア");
    expect(kindOfOverture("drugstore", "架空化粧品店")).toBeNull();
  });
});

describe("同じ店の見分け", () => {
  it("チェーン名は書き方の違いをそろえる", () => {
    expect(chainKey("セブン-イレブン 新潟駅前店")).toBe(chainKey("7-Eleven Niigata"));
    expect(chainKey("ファミリーマート")).toBe(chainKey("FamilyMart"));
    expect(chainKey("ローソン")).not.toBe(chainKey("ファミリーマート"));
  });

  it("同じチェーンは50m以内、チェーンを問わなければ15m以内を同じ店とみなす", () => {
    const a = at("セブン-イレブン 架空店", "コンビニ");
    expect(sameShop(a, at("7-Eleven 架空", "コンビニ", 40), 50, 15)).toBe(true);
    expect(sameShop(a, at("ローソン 架空店", "コンビニ", 40), 50, 15)).toBe(false);
    expect(sameShop(a, at("ローソン 架空店", "コンビニ", 10), 50, 15)).toBe(true);
    expect(sameShop(a, at("セブン-イレブン 架空店", "スーパー", 0), 50, 15)).toBe(false);
  });

  it("Overture の中の重複は、確からしさの高い方を残す", () => {
    const shops = [
      { ...at("7-Eleven 架空", "コンビニ" as const, 20), confidence: 0.6 },
      { ...at("セブン-イレブン 架空店", "コンビニ" as const), confidence: 0.9 },
      { ...at("ローソン 架空店", "コンビニ" as const, 200), confidence: 0.8 },
    ];
    expect(dedupeShops(shops).map((s) => s.name)).toEqual(["セブン-イレブン 架空店", "ローソン 架空店"]);
  });

  it("OSM・一覧にもうある店は足さない（同じチェーンは100m以内、チェーンを問わなければ30m以内）", () => {
    const existing = [at("セブンイレブン新潟架空店", "コンビニ"), at("原信", "スーパー", 500)];
    const shops = [at("7-Eleven", "コンビニ", 80), at("ローソン", "コンビニ", 80), at("ローソン", "コンビニ", 20), at("ウオロク", "スーパー", 560)];
    expect(notInExisting(shops, existing).map((s) => s.name)).toEqual(["ローソン", "ウオロク"]);
  });

  it("名の知れたチェーンは、位置のずれを見込んで300m以内なら同じ店とみなす（それ以外の名前は100m）", () => {
    const existing = [at("セブンイレブン新潟架空店", "コンビニ"), at("架空マーケット", "スーパー")];
    const shops = [at("7-Eleven", "コンビニ", 250), at("7-Eleven", "コンビニ", 350), at("架空マーケット", "スーパー", 250)];
    expect(notInExisting(shops, existing).map((s) => [s.name, s.lon])).toEqual([
      ["7-Eleven", shops[1].lon],
      ["架空マーケット", shops[2].lon],
    ]);
  });
});
