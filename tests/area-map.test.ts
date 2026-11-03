import { describe, expect, it } from "vitest";
import { circleRing, facilityGroupOf, formatDistance, pointOnRing, pickFacilities, type FacilityRow } from "../lib/area-map";

// 2点の直線距離（m、球面）
function haversine(a: [number, number], b: [number, number]) {
  const R = 6371008.8;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dφ = toRad(b[1] - a[1]);
  const dλ = toRad(b[0] - a[0]);
  const h = Math.sin(dφ / 2) ** 2 + Math.cos(toRad(a[1])) * Math.cos(toRad(b[1])) * Math.sin(dλ / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

describe("エリアの地図", () => {
  const c: [number, number] = [139.0364, 37.9161];

  it("円の点は、どれも中心から半径の距離にあり、輪は閉じている", () => {
    const ring = circleRing(c[0], c[1], 1000, 48);
    expect(ring).toHaveLength(49);
    expect(ring[0]).toEqual(ring[48]);
    for (const p of ring) expect(haversine(c, p)).toBeCloseTo(1000, 0);
    expect(haversine(c, pointOnRing(c[0], c[1], 3000, 315))).toBeCloseTo(3000, 0);
  });

  it("距離は直線と書き、1km未満は m、以上は km", () => {
    expect(formatDistance(412.4)).toBe("直線 412m");
    expect(formatDistance(1530)).toBe("直線 1.5km");
  });

  it("施設は種類ごとに1km以内すべて、無ければ3km以内の最寄り1つ。バス停は1km以内だけ、駅は遠くても最寄り", () => {
    const f = (kind: string, name: string, distance_m: number): FacilityRow => ({ kind, name, distance_m, lon: 0, lat: 0 });
    const rows = [
      f("スーパー", "A", 300),
      f("スーパー", "B", 800),
      f("スーパー", "C", 1500),
      f("病院", "D", 1800),
      f("病院", "E", 2500),
      f("バス停", "F", 1200),
      f("駅", "G", 4200),
      f("その他", "H", 100),
    ];
    expect(pickFacilities(rows).map((r) => r.name)).toEqual(["A", "B", "D", "G"]);
    expect(facilityGroupOf("認定こども園")).toBe("education");
    expect(facilityGroupOf("その他")).toBeNull();
  });
});
