import { describe, expect, it } from "vitest";
import { withImages } from "../lib/agents/llm";
import { detectImageType, readImageUploads, toImageInputs } from "../lib/property-images";

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0];
const JPEG = [0xff, 0xd8, 0xff, 0xe0, 0, 0];
const WEBP = [0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50];

describe("画像の種類", () => {
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

describe("保存のときの画像の扱い", () => {
  const fd = (entries: Record<string, string | Blob>) => {
    const f = new FormData();
    for (const [k, v] of Object.entries(entries)) f.set(k, v);
    return f;
  };
  const jpeg = () => new Blob([new Uint8Array(JPEG)]);

  it("差し替えた枠と外した枠だけを返す。指定なし・keep は触らない", async () => {
    expect(await readImageUploads(fd({}))).toEqual([]);
    expect(await readImageUploads(fd({ image_exterior_action: "keep", image_exterior: jpeg() }))).toEqual([]);
    const r = await readImageUploads(fd({ image_exterior_action: "replace", image_exterior: jpeg(), "image_floor-plan_action": "remove" }));
    expect(r).toMatchObject([
      { kind: "外観", action: "replace", mediaType: "image/jpeg" },
      { kind: "間取り図", action: "remove" },
    ]);
  });

  it("差し替えで、空・大きすぎ・違う種類は保存しない（枠の名前つきの例外）", async () => {
    await expect(readImageUploads(fd({ image_interior_action: "replace" }))).rejects.toThrow("内観の画像を選んで");
    await expect(readImageUploads(fd({ image_interior_action: "replace", image_interior: new Blob([new TextEncoder().encode("%PDF-1.7")]) }))).rejects.toThrow("PNG");
    await expect(readImageUploads(fd({ image_interior_action: "replace", image_interior: new Blob([new Uint8Array(3 * 1024 * 1024 + 1)]) }))).rejects.toThrow("3MB");
  });
});

describe("DB の画像を AI に添える形にする", () => {
  const ids = new Map([
    ["外観の写真", "P-15"],
    ["間取り図", "P-16"],
  ]);

  it("枠の順（外観・内観・間取り図）に、事実IDのラベルを付ける。事実に無い枠と種類の合わない画像は添えない", () => {
    const rows = [
      { kind: "間取り図", image: new Uint8Array(PNG), media_type: "image/png" },
      { kind: "内観", image: new Uint8Array(JPEG), media_type: "image/jpeg" }, // 事実シートに無い
      { kind: "外観", image: new Uint8Array(JPEG), media_type: "image/jpeg" },
    ];
    const out = toImageInputs(rows, ids);
    expect(out.map((i) => i.label)).toEqual(["外観の写真（P-15）", "間取り図（P-16）"]);
    expect(out[1]).toMatchObject({ mediaType: "image/png", base64: Buffer.from(PNG).toString("base64") });
    expect(toImageInputs([{ kind: "外観", image: new Uint8Array(PNG), media_type: "image/jpeg" }], ids)).toEqual([]);
  });

  it("最後の user の発言だけを「ラベル・画像…＋文字」にし、画像がなければそのまま", () => {
    const msgs = [{ role: "user" as const, content: "事実" }];
    const block = (i: { base64: string }) => ({ type: "image", data: i.base64 });
    const text = (t: string) => ({ type: "text", text: t });
    expect(withImages(msgs, undefined, block, text)).toBe(msgs);
    expect(withImages(msgs, [{ mediaType: "image/jpeg", base64: "AAAA", label: "外観の写真（P-15）" }], block, text)).toEqual([
      { role: "user", content: [text("画像：外観の写真（P-15）"), block({ base64: "AAAA" }), text("事実")] },
    ]);
  });
});
