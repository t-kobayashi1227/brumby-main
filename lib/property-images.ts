// 物件の画像（外観・内観・間取り図。docs/設計まとめ.md「物件の画像」、2026-11-05 浩平さん依頼）
// 物件に1枚ずつ添付して保存し、戦略を作るときに戦略担当の呼び出しにだけ添える。画像を読むためだけのAIの呼び出しはしない
// 画像はログにも agent_calls の入力にも残さない（種類と大きさだけ）

import type { ImageInput } from "./agents/llm";

/** 添付できる画像の枠。並びは画面・事実・AIに添える順 */
export const IMAGE_KINDS = [
  { kind: "外観", slug: "exterior", fact: "外観の写真" },
  { kind: "内観", slug: "interior", fact: "内観の写真" },
  { kind: "間取り図", slug: "floor-plan", fact: "間取り図" },
] as const;
export type ImageKind = (typeof IMAGE_KINDS)[number]["kind"];

/** 事実の値（どの枠も同じ） */
export const IMAGE_FACT_VALUE = "画像あり（戦略担当に画像で渡す）";

/** 受け取る画像の大きさの上限。画面では長い辺を IMAGE_MAX_SIDE まで縮めてから送るので、ふつうはずっと小さい */
export const IMAGE_MAX_BYTES = 3 * 1024 * 1024;
/** 画面で縮める長い辺（ピクセル）。間取り図の帖数の小さな文字が読める大きさにする */
export const IMAGE_MAX_SIDE = 2000;
/** 画面で縮めたあとの1枚の大きさの目安。3枚と入力欄を合わせても、保存の送信の上限（next.config.ts、4.5MB）に収まるようにする */
export const IMAGE_SEND_BYTES = 1.4 * 1024 * 1024;

export function kindBySlug(slug: string) {
  return IMAGE_KINDS.find((k) => k.slug === slug) ?? null;
}

/** ファイルの先頭のバイトから画像の種類を決める（ファイル名や申告の種類は信じない）。対応しない種類は null */
export function detectImageType(bytes: Uint8Array): ImageInput["mediaType"] | null {
  const starts = (sig: number[], offset = 0) => sig.every((b, i) => bytes[offset + i] === b);
  if (starts([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (starts([0xff, 0xd8, 0xff])) return "image/jpeg";
  if (starts([0x52, 0x49, 0x46, 0x46]) && starts([0x57, 0x45, 0x42, 0x50], 8)) return "image/webp";
  return null;
}

export type ImageUpload = { kind: ImageKind; action: "remove" } | { kind: ImageKind; action: "replace"; mediaType: ImageInput["mediaType"]; bytes: Uint8Array };

/**
 * 保存の FormData から、枠ごとに画像をどうするかを読む（変えない枠は返さない）
 * - image_<slug>_action が "replace" なら image_<slug> のファイルを確かめて返す。"remove" なら外す
 * - 誤りがあれば例外（ほかの欄と同じく、何も保存しない）
 */
export async function readImageUploads(formData: FormData): Promise<ImageUpload[]> {
  const out: ImageUpload[] = [];
  for (const { kind, slug } of IMAGE_KINDS) {
    const action = String(formData.get(`image_${slug}_action`) ?? "keep");
    if (action === "remove") out.push({ kind, action });
    if (action !== "replace") continue;
    const file = formData.get(`image_${slug}`);
    if (!(file instanceof Blob) || file.size === 0) throw new Error(`${kind}の画像を選んでください`);
    if (file.size > IMAGE_MAX_BYTES) throw new Error(`${kind}の画像が大きすぎます（3MBまで）`);
    const bytes = new Uint8Array(await file.arrayBuffer());
    const mediaType = detectImageType(bytes);
    if (!mediaType) throw new Error(`${kind}の画像は PNG・JPEG・WebP にしてください（PDF には対応していません）`);
    out.push({ kind, action, mediaType, bytes });
  }
  return out;
}

/** DB の画像を、AI に添える形にする。枠の順に並べ、事実シートに無い枠と種類の分からない画像は添えない */
export function toImageInputs(rows: { kind: string; image: Uint8Array; media_type: string }[], factIds: Map<string, string>): ImageInput[] {
  const out: ImageInput[] = [];
  for (const { kind, fact } of IMAGE_KINDS) {
    const row = rows.find((r) => r.kind === kind);
    const id = factIds.get(fact);
    if (!row || !id) continue;
    const detected = detectImageType(row.image);
    if (!detected || detected !== row.media_type) continue;
    out.push({ mediaType: detected, base64: Buffer.from(row.image).toString("base64"), label: `${fact}（${id}）` });
  }
  return out;
}
