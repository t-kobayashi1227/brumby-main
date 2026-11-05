// 間取り図の読み取り（docs/設計まとめ.md「間取り図の読み取り」、2026-11-05 浩平さん依頼）
// 担当者が添えた間取り図の画像を、AI に1回だけ見せて、間取りの特徴を短い文で書き出させる
// 書き出した文は入力画面の欄に下書きとして入れ、担当者が確かめて保存する。戦略づくりの各AIは、その文を事実（P）として読む
// 画像は保存せず、ログにも出さない。ログに出すのはトークン数と費用だけ

import { z } from "zod/v4";
import type { ImageInput } from "./agents/llm";

/** 受け取る画像の大きさの上限。画面では長い辺を FLOOR_PLAN_MAX_SIDE まで縮めてから送るので、ふつうはずっと小さい */
export const FLOOR_PLAN_MAX_BYTES = 3 * 1024 * 1024;
/** 画面で縮める長い辺（ピクセル）。帖数の小さな文字が読める大きさにする */
export const FLOOR_PLAN_MAX_SIDE = 2000;
/** 保存する特徴の文の上限 */
export const FLOOR_PLAN_NOTES_MAX_CHARS = 2000;
/** 書き出す項目の上限（指示文と同じ） */
const MAX_ITEMS = 12;

export const floorPlanSchema = z.object({
  readable: z.boolean().describe("間取り図として読み取れたか"),
  reason: z.string().nullable().describe("読み取れなかったときの理由。読み取れたときは null"),
  items: z.array(z.string()).describe("間取りの特徴。図に描かれたことだけを1項目1文で"),
});
export type FloorPlanOutput = z.infer<typeof floorPlanSchema>;

/** ファイルの先頭のバイトから画像の種類を決める（ファイル名や申告の種類は信じない）。対応しない種類は null */
export function detectImageType(bytes: Uint8Array): ImageInput["mediaType"] | null {
  const starts = (sig: number[], offset = 0) => sig.every((b, i) => bytes[offset + i] === b);
  if (starts([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (starts([0xff, 0xd8, 0xff])) return "image/jpeg";
  if (starts([0x52, 0x49, 0x46, 0x46]) && starts([0x57, 0x45, 0x42, 0x50], 8)) return "image/webp";
  return null;
}

/** 画面から送られた画像を確かめて、AI に添える形にする */
export async function readFloorPlanImage(formData: FormData): Promise<ImageInput | { error: string }> {
  const file = formData.get("image");
  if (!(file instanceof Blob) || file.size === 0) return { error: "間取り図の画像を選んでください" };
  if (file.size > FLOOR_PLAN_MAX_BYTES) return { error: "画像が大きすぎます（3MBまで）" };
  const bytes = new Uint8Array(await file.arrayBuffer());
  const mediaType = detectImageType(bytes);
  if (!mediaType) return { error: "画像は PNG・JPEG・WebP にしてください（PDF には対応していません）" };
  return { mediaType, base64: Buffer.from(bytes).toString("base64") };
}

/** AI の答えを、欄に入れる文にする（1行1項目）。空・重複は除き、上限の数で切る */
export function toFloorPlanNotes(output: FloorPlanOutput): string {
  const items = output.items
    .map((s) => s.replace(/\s+/g, " ").trim())
    .filter((s, i, all) => s !== "" && all.indexOf(s) === i)
    .slice(0, MAX_ITEMS);
  return items.join("\n");
}
