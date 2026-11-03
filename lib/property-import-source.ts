// 物件資料からの自動入力：資料の受け取り方（docs/設計まとめ.md「物件資料からの自動入力」）
// どの形で受け取っても、まず「資料のテキスト」にそろえ、そのあとの読み取り・照合・換算（property-import.ts）は共通にする
// 照合（AI が抜き出した文字が資料にあるか）はテキストで行うので、PDF などもテキストにしてから渡す
//
// 今はテキストの貼り付けだけ。広げるときは ImportSource に種類を足し、toSourceText に変換を足す
//   - PDF（文字の入った物件概要書・販売図面）："pdf"。PDF の文字の層を取り出してテキストにする
//   - 画像やスキャンした PDF（マイソク）："image"。文字起こししたテキストを担当者に見せてから読み取る（照合の元を人が確かめられるように）

import { IMPORT_MAX_CHARS } from "./property-import";

export const IMPORT_SOURCE_KINDS = ["text"] as const;
export type ImportSourceKind = (typeof IMPORT_SOURCE_KINDS)[number];

export type ImportSource = { kind: "text"; text: string };

/** 画面から送られた FormData を、資料の形に読む。ファイルも送れるよう FormData で受ける */
export function readImportSource(formData: FormData): ImportSource | { error: string } {
  const kind = String(formData.get("kind") ?? "text");
  switch (kind) {
    case "text":
      return { kind: "text", text: String(formData.get("text") ?? "") };
    default:
      return { error: "この形の資料にはまだ対応していません" };
  }
}

/** 資料をテキストにそろえる。空や長すぎるときは理由を返す */
export async function toSourceText(source: ImportSource): Promise<{ text: string } | { error: string }> {
  let text: string;
  switch (source.kind) {
    case "text":
      text = source.text.trim();
      break;
  }
  if (text === "") return { error: "物件の紹介文や物件資料のテキストを貼ってください" };
  if (text.length > IMPORT_MAX_CHARS) return { error: `長すぎます（${IMPORT_MAX_CHARS.toLocaleString()}文字まで）。物件1件分の部分だけを貼ってください` };
  return { text };
}
