import { describe, expect, it } from "vitest";
import { shpBbox } from "../scripts/ingest/jobs/ksj-zones";

describe("Shapefile の範囲を先頭から読む（洪水の川を、読む前に範囲で飛ばすため）", () => {
  it("ヘッダーの 36〜68 バイト目の [西, 南, 東, 北]", () => {
    const header = new Uint8Array(100);
    const view = new DataView(header.buffer);
    [137.2, 36.6, 137.5, 36.9].forEach((v, i) => view.setFloat64(36 + i * 8, v, true));
    expect(shpBbox(header)).toEqual([137.2, 36.6, 137.5, 36.9]);
  });
});
