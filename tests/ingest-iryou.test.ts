import { describe, expect, it } from "vitest";
import { needsGeocode } from "../scripts/ingest/jobs/iryou";

// D30 医療情報ネットの取り込み：緯度経度を使えるかの判定

describe("医療情報ネットの位置", () => {
  it("新潟県の中の緯度経度はそのまま使う", () => {
    expect(needsGeocode(139.0236, 37.9162)).toBeNull(); // 新潟市
    expect(needsGeocode(138.2551, 37.1554)).toBeNull(); // 上越市
    expect(needsGeocode(139.25, 38.47)).toBeNull(); // 粟島浦村
  });

  it("0・空は住所から出す", () => {
    expect(needsGeocode(0, 0)).toBe("missing");
    expect(needsGeocode(Number(""), 37.9)).toBe("missing");
    expect(needsGeocode(Number.NaN, 37.9)).toBe("missing");
  });

  it("県の外の緯度経度は元データの誤りとして住所から出し直す", () => {
    expect(needsGeocode(139.767306, 35.680959)).toBe("outside"); // 東京駅
    expect(needsGeocode(140.186497, 39.214009)).toBe("outside"); // 秋田・山形
  });
});
