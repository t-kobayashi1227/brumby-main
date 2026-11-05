import { describe, expect, it } from "vitest";
import { detectImageType, readFloorPlanUpload, toImageInput } from "../lib/floor-plan";

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0];
const JPEG = [0xff, 0xd8, 0xff, 0xe0, 0, 0];
const WEBP = [0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50];

describe("間取り図の画像の種類", () => {
  it("先頭のバイトで PNG・JPEG・WebP を見分ける", () => {
    expect(detectImageType(new Uint8Array(PNG))).toBe("image/png");
    expect(detectImageType(new Uint8Array(JPEG))).toBe("image/jpeg");
    expect(detectImageType(new Uint8Array(WEBP))).toBe("image/webp");
  });

  it("PDF や名前だけ画像のファイルは受けない", () => {
    expect(detectImageType(new TextEncoder().encode("%PDF-1.7"))).toBeNull();
    expect(detectImageType(new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x41, 0x56, 0x45]))).toBeNull(); // WAV
  });
});

describe("保存のときの間取り図の扱い", () => {
  const fd = (action?: string, blob?: Blob) => {
    const f = new FormData();
    if (action) f.set("floor_plan_action", action);
    if (blob) f.set("floor_plan_image", blob, "x");
    return f;
  };

  it("差し替えのときだけ画像を確かめて返す。指定なしはそのまま、remove は外す", async () => {
    expect(await readFloorPlanUpload(fd())).toEqual({ action: "keep" });
    expect(await readFloorPlanUpload(fd("keep", new Blob([new Uint8Array(JPEG)])))).toEqual({ action: "keep" });
    expect(await readFloorPlanUpload(fd("remove"))).toEqual({ action: "remove" });
    const r = await readFloorPlanUpload(fd("replace", new Blob([new Uint8Array(JPEG)])));
    expect(r).toMatchObject({ action: "replace", image: { mediaType: "image/jpeg" } });
  });

  it("差し替えで、空・大きすぎ・違う種類は保存しない（例外で理由を返す）", async () => {
    await expect(readFloorPlanUpload(fd("replace"))).rejects.toThrow("選んで");
    await expect(readFloorPlanUpload(fd("replace", new Blob([new TextEncoder().encode("%PDF-1.7")])))).rejects.toThrow("PNG");
    await expect(readFloorPlanUpload(fd("replace", new Blob([new Uint8Array(3 * 1024 * 1024 + 1)])))).rejects.toThrow("3MB");
  });
});

describe("DB の画像を AI に添える形にする", () => {
  it("種類を先頭のバイトで確かめ、base64 にする。無い・種類が合わないものは添えない", () => {
    expect(toImageInput(new Uint8Array(PNG), "image/png")).toEqual({ mediaType: "image/png", base64: Buffer.from(PNG).toString("base64") });
    expect(toImageInput(null, null)).toBeNull();
    expect(toImageInput(new Uint8Array(PNG), "image/jpeg")).toBeNull();
    expect(toImageInput(new TextEncoder().encode("%PDF-1.7"), "image/png")).toBeNull();
  });
});

describe("AI に画像を添える形", async () => {
  const { withImages } = await import("../lib/agents/llm");
  const img = { mediaType: "image/jpeg" as const, base64: "AAAA" };
  it("最後の user の発言だけを「画像＋文字」にし、画像がなければそのまま", () => {
    const msgs = [{ role: "user" as const, content: "事実" }];
    expect(withImages(msgs, undefined, (i) => i.base64, (t) => t)).toBe(msgs);
    expect(withImages(msgs, [img], (i) => ({ type: "image", data: i.base64 }), (t) => ({ type: "text", text: t }))).toEqual([
      { role: "user", content: [{ type: "image", data: "AAAA" }, { type: "text", text: "事実" }] },
    ]);
  });
});
