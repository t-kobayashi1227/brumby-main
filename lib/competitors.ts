// 競合物件を、本システムで販売戦略を作った別の物件から選ぶ（2026-11-05 浩平さん依頼）
// 画面（ブラウザ）でも読むので、DBに触る処理は lib/competitors-load.ts に分ける

import type { SaleState } from "./listView";
import { normalizeForSearch } from "./listView";
import { formatDistance } from "./facts/format";

/** 1物件に選べる競合の数（2026-11-05 浩平さん指示で3件→2件。比べる3列の1列目はこの物件） */
export const MAX_COMPETITORS = 2;

/** 競合の候補（入力画面の「競合を選ぶ」の一覧の1行） */
export interface CompetitorCandidate {
  /** properties.id */
  id: number;
  code: string;
  property_class: string;
  /** 所在地（丁目まで） */
  area: string;
  price_man_yen: number;
  layout: string;
  building_sqm: number;
  land_sqm: number;
  building_age: number;
  /** この物件からの直線距離（m）。どちらかの位置がないときは null */
  distance_m: number | null;
  /** 販売戦略を作った日時（日本時間の YYYY-MM-DD HH:MI、一番新しいもの）。並べ替えにも使うので分まで持つ（2026-11-06） */
  strategy_on: string;
  /** 販売記録の販売状況。記録がなければ「未設定」 */
  sale: SaleState;
}

/**
 * 住所を丁目までにする（番地を出さない）。丁目が無い住所は、末尾の番地（数字と「番地」「-」など）を外す
 * 例：「新潟市西区寺尾東2丁目3-4」→「新潟市西区寺尾東2丁目」、「新潟市秋葉区新津123-4」→「新潟市秋葉区新津」
 */
export function addressToChome(address: string): string {
  const a = address.trim();
  const chome = /^(.*?[0-9０-９一二三四五六七八九十]+丁目)/.exec(a);
  if (chome) return chome[1];
  const rest = a.replace(/[0-9０-９]+[0-9０-９\-‐－ー―番地号のノ]*$/, "").trim();
  return rest === "" ? a : rest;
}

/** 候補の並び：近い順（距離がないものは後ろ）。距離が同じ・どちらもないときは、戦略を作った日時が新しい順（分まで。日付だけだと同じ日に作った物件が登録順に並んでいた） */
export function sortCandidates(rows: CompetitorCandidate[]): CompetitorCandidate[] {
  return [...rows].sort((a, b) => {
    if (a.distance_m !== null && b.distance_m !== null && a.distance_m !== b.distance_m) return a.distance_m - b.distance_m;
    if (a.distance_m === null && b.distance_m !== null) return 1;
    if (a.distance_m !== null && b.distance_m === null) return -1;
    return b.strategy_on.localeCompare(a.strategy_on) || a.id - b.id;
  });
}

/** 物件ID・所在地で候補を絞る */
export function filterCandidates(rows: CompetitorCandidate[], query: string): CompetitorCandidate[] {
  const q = normalizeForSearch(query);
  if (q === "") return rows;
  return rows.filter((r) => normalizeForSearch(r.code).includes(q) || normalizeForSearch(r.area).includes(q));
}

/**
 * フォームから送られた競合の物件番号を読む（選んだ順）。数でないもの・重なり・自分自身は誤り、最大 MAX_COMPETITORS 件
 * 戦略を作った物件かどうかは、保存の処理（actions.ts）が DB で確かめる
 */
export function parseCompetitorIds(values: unknown[], selfId: number | null): number[] {
  const ids: number[] = [];
  for (const v of values) {
    const s = String(v ?? "").trim();
    if (s === "") continue;
    if (!/^\d+$/.test(s)) throw new Error("競合物件の選び方が正しくありません。選び直してください");
    const id = Number(s);
    if (selfId !== null && id === selfId) throw new Error("競合物件に、この物件自身は選べません");
    if (ids.includes(id)) throw new Error("競合物件に、同じ物件が2回選ばれています");
    ids.push(id);
  }
  if (ids.length > MAX_COMPETITORS) throw new Error(`競合物件は${MAX_COMPETITORS}件までです`);
  return ids;
}

/** 距離の表示（候補の一覧・比較の見出し）。事実シートと同じ書き方。位置がないときは「―」 */
export function formatCompetitorDistance(m: number | null): string {
  return m === null ? "―" : formatDistance(m);
}
