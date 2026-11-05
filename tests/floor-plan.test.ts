import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { readPrompt } from "../lib/agents/prompts";
import { detectImageType, readFloorPlanImage, toFloorPlanNotes } from "../lib/floor-plan";

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

  it("画面から送られた画像を base64 にする。空・大きすぎ・違う種類は理由を返す", async () => {
    const fd = (blob?: Blob) => {
      const f = new FormData();
      if (blob) f.set("image", blob, "x");
      return f;
    };
    const ok = await readFloorPlanImage(fd(new Blob([new Uint8Array(JPEG)])));
    expect(ok).toEqual({ mediaType: "image/jpeg", base64: Buffer.from(JPEG).toString("base64") });
    expect(await readFloorPlanImage(fd())).toHaveProperty("error");
    expect(await readFloorPlanImage(fd(new Blob([new TextEncoder().encode("%PDF-1.7")])))).toHaveProperty("error");
    expect(await readFloorPlanImage(fd(new Blob([new Uint8Array(3 * 1024 * 1024 + 1)])))).toHaveProperty("error");
  });
});

describe("読み取った特徴を欄の文にする", () => {
  it("1行1項目。空白をそろえ、空と重複を除き、12項目まで", () => {
    const items = ["1階：LDK 18帖", "  1階：LDK  18帖 ", "", ...Array.from({ length: 15 }, (_, i) => `項目${i}`)];
    const notes = toFloorPlanNotes({ readable: true, reason: null, items });
    const lines = notes.split("\n");
    expect(lines[0]).toBe("1階：LDK 18帖");
    expect(lines).toHaveLength(12);
    expect(new Set(lines).size).toBe(12);
  });
});

describe("間取り図の指示文は設計まとめと一字一句同じ", () => {
  it("prompts/floor-plan.txt", () => {
    const doc = readFileSync("docs/設計まとめ.md", "utf8").replace(/\r\n/g, "\n");
    const section = doc.slice(doc.indexOf("### 間取り図の読み取り"), doc.indexOf("### 項目ごとの扱い"));
    const block = /```text\n([\s\S]*?)\n```/.exec(section)?.[1];
    expect(readPrompt("floor-plan.txt")).toBe(block);
  });
});
