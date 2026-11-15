import { describe, expect, it } from "vitest";
import { dedupeParks, insideRing, ringCenter } from "../scripts/ingest/jobs/osm-parks";

// D43 公園（OSM、新潟市以外）の取り込み。位置は架空

const square = (x: number, y: number, d: number) => [
  [x, y],
  [x + d, y],
  [x + d, y + d],
  [x, y + d],
  [x, y],
];

describe("OSM の公園", () => {
  it("点が形の中にあるかを判定する", () => {
    expect(insideRing(139.005, 37.905, square(139, 37.9, 0.01))).toBe(true);
    expect(insideRing(139.02, 37.905, square(139, 37.9, 0.01))).toBe(false);
  });

  it("形の位置は外周の頂点の平均（閉じるための最後の点は数えない）", () => {
    expect(ringCenter(square(139, 37.9, 0.01))).toEqual({ lon: expect.closeTo(139.005, 9), lat: expect.closeTo(37.905, 9) });
  });

  it("同じ osm_id は形を残して1つにし、形の中にある点の公園を除く。形の外の点は残す", () => {
    const ring = square(139, 37.9, 0.01);
    const { kept, sameId, insideShape } = dedupeParks([
      { osmId: "1", name: "架空公園", layer: "gis_osm_pois_a_free_1", ring, lon: 139.005, lat: 37.905 },
      { osmId: "1", name: "架空公園", layer: "gis_osm_landuse_a_free_1", ring, lon: 139.005, lat: 37.905 },
      { osmId: "2", name: "架空公園の遊び場", layer: "gis_osm_pois_free_1", ring: null, lon: 139.002, lat: 37.902 },
      { osmId: "3", name: "離れた公園", layer: "gis_osm_pois_free_1", ring: null, lon: 139.05, lat: 37.95 },
    ]);
    expect(kept.map((p) => p.osmId)).toEqual(["1", "3"]);
    expect(sameId).toBe(1);
    expect(insideShape).toBe(1);
  });

  it("同じ osm_id で点が先に来ても、形の方を残す", () => {
    const ring = square(139, 37.9, 0.01);
    const { kept } = dedupeParks([
      { osmId: "1", name: "架空公園", layer: "gis_osm_pois_free_1", ring: null, lon: 139.005, lat: 37.905 },
      { osmId: "1", name: "架空公園", layer: "gis_osm_pois_a_free_1", ring, lon: 139.005, lat: 37.905 },
    ]);
    expect(kept).toHaveLength(1);
    expect(kept[0].ring).not.toBeNull();
  });
});
