// 間取り図の画像（docs/設計まとめ.md「間取り図の画像」、2026-11-05 浩平さん依頼）
// 物件に添付して保存し、戦略を作るときに戦略担当の呼び出しにだけ添える。画像を読むためだけのAIの呼び出しはしない
// 画像はログにも agent_calls の入力にも残さない（種類と大きさだけ）

import type { ImageInput } from "./agents/llm";

/** 受け取る画像の大きさの上限。画面では長い辺を FLOOR_PLAN_MAX_SIDE まで縮めてから送るので、ふつうはずっと小さい */
export const FLOOR_PLAN_MAX_BYTES = 3 * 1024 * 1024;
/** 画面で縮める長い辺（ピクセル）。帖数の小さな文字が読める大きさにする */
export const FLOOR_PLAN_MAX_SIDE = 2000;

/** ファイルの先頭のバイトから画像の種類を決める（ファイル名や申告の種類は信じない）。対応しない種類は null */
export function detectImageType(bytes: Uint8Array): ImageInput["mediaType"] | null {
  const starts = (sig: number[], offset = 0) => sig.every((b, i) => bytes[offset + i] === b);
  if (starts([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (starts([0xff, 0xd8, 0xff])) return "image/jpeg";
  if (starts([0x52, 0x49, 0x46, 0x46]) && starts([0x57, 0x45, 0x42, 0x50], 8)) return "image/webp";
  return null;
}

export interface FloorPlanImage {
  mediaType: ImageInput["mediaType"];
  bytes: Uint8Array;
}

/**
 * 保存の FormData から、間取り図をどうするかを読む
 * - floor_plan_action が "replace" なら floor_plan_image のファイルを確かめて返す
 * - "remove" なら削除、それ以外（"keep" や無し）は変えない
 */
export async function readFloorPlanUpload(formData: FormData): Promise<{ action: "keep" } | { action: "remove" } | { action: "replace"; image: FloorPlanImage }> {
  const action = String(formData.get("floor_plan_action") ?? "keep");
  if (action === "remove") return { action: "remove" };
  if (action !== "replace") return { action: "keep" };
  const file = formData.get("floor_plan_image");
  if (!(file instanceof Blob) || file.size === 0) throw new Error("間取り図の画像を選んでください");
  if (file.size > FLOOR_PLAN_MAX_BYTES) throw new Error("間取り図の画像が大きすぎます（3MBまで）");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const mediaType = detectImageType(bytes);
  if (!mediaType) throw new Error("間取り図の画像は PNG・JPEG・WebP にしてください（PDF には対応していません）");
  return { action: "replace", image: { mediaType, bytes } };
}

/** DB の値を AI に添える形にする。種類が分からないものは添えない */
export function toImageInput(bytes: Uint8Array | null, mediaType: string | null): ImageInput | null {
  if (!bytes || bytes.length === 0) return null;
  const detected = detectImageType(bytes);
  if (!detected || (mediaType && detected !== mediaType)) return null;
  return { mediaType: detected, base64: Buffer.from(bytes).toString("base64") };
}
