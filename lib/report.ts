// ⑤レポート画面の組み立て（docs/設計まとめ.md「根拠と出典」）。表示だけを行い、AI は動かさない

import { competitorPart } from "./agents/competitor-part";
import { salesFocusOf } from "./agents/sales-focus";
import type { MediaOutput, StrategyOutput } from "./agents/schemas";
import { sourceOf, type DatasetInfo } from "./facts/build";
import { FACT_CATEGORIES, type Fact, type FactCategory } from "./facts/types";

/** 地図・ライブラリなど、事実とは別に常に出すクレジット */
export const FIXED_CREDITS = ["地図：国土地理院 淡色地図（地理院タイル）", "住所検索：国土地理院 地理院地図の住所検索"];

/** 画面に出す文に付いた事実ID（重なりなし）。根拠データタブの「使用箇所」と同じ集め方（factUsage）にそろえる。画面に出さない合わない層は含めない */
/**
 * AIの sales_focus のうち、画面に出すもの（2026-11-05 浩平さん指示）。枠は出さず、種類が「確かめる」のときだけ
 * 「最初にやること」をサマリーの「データの注意点」に1件として出す。ほかの種類と以前の答えは null
 */
export function focusToCheck(main: StrategyOutput): { action: string; evidence: string[] } | null {
  const focus = salesFocusOf(main);
  return focus && focus.kind === "確かめる" ? { action: focus.action, evidence: focus.evidence } : null;
}

export function usedFactIds(main: StrategyOutput, media: MediaOutput): string[] {
  return [...factUsage(main, media).keys()];
}

/** 根拠の1件の書き方：「0〜14歳の割合 15.8%（西区 11.9%）」。取れなかった事実は「不明」 */
export function evidenceText(f: Fact): string {
  return `${f.項目} ${f.値 ?? "不明"}${f.比較 ? `（${f.比較}）` : ""}`;
}

export interface SourceRow {
  出典: string;
  時点: string;
}

/**
 * 出典の一覧：使った事実の出典と時点（重なりなし）と、そのデータの決まったクレジット文言
 * クレジットは datasets.attribution。事実の出典にそのデータの出典の文言（sourceOf）が入っていれば、使ったデータとみなす
 */
export function sourceList(facts: Fact[], usedIds: string[], datasets: (DatasetInfo & { attribution: string | null })[]): { rows: SourceRow[]; credits: string[] } {
  const used = facts.filter((f) => usedIds.includes(f.id));
  const seen = new Set<string>();
  const rows: SourceRow[] = [];
  for (const f of used) {
    const key = `${f.出典}|${f.時点}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({ 出典: f.出典, 時点: f.時点 });
  }
  const credits = datasets
    .filter((d) => d.attribution && used.some((f) => f.出典.includes(sourceOf(d))))
    .map((d) => d.attribution as string);
  return { rows, credits: [...new Set(credits)] };
}

// ---- 6タブ（2026-11-03 浩平さんの変更仕様「BRUMBY_販売戦略結果画面_UIUX変更点」） ----
// AIの答えの形は変えず、保存した答えと事実シートを、表示の段階でタブに振り分ける（AIの呼び出しは増やさない）

export const REPORT_TABS = [
  { key: "summary", label: "サマリー" },
  { key: "target", label: "ターゲット・訴求" },
  { key: "sales", label: "販売施策" },
  { key: "price", label: "価格分析" },
  { key: "area", label: "エリア分析" },
  { key: "evidence", label: "根拠データ" },
] as const;
export type ReportTab = (typeof REPORT_TABS)[number]["key"];
export const TAB_LABEL = Object.fromEntries(REPORT_TABS.map((t) => [t.key, t.label])) as Record<ReportTab, string>;

/** エリア分析タブの4枚のカード */
export type AreaCard = "people" | "living" | "land" | "property";
export const AREA_CARDS: { key: AreaCard; title: string; categories: FactCategory[] }[] = [
  { key: "people", title: "人口・世帯", categories: ["A"] },
  { key: "living", title: "交通・生活", categories: ["S", "L", "T"] },
  { key: "land", title: "土地・災害", categories: ["R", "H"] },
  { key: "property", title: "物件の競争力", categories: ["P"] },
];

/** 事実IDの英字（P-01 → P）。分類にない英字は null */
export function categoryOf(id: string): FactCategory | null {
  const c = id.trim().split("-")[0];
  return c in FACT_CATEGORIES ? (c as FactCategory) : null;
}

type Analysis = StrategyOutput["analysis"][number];

/**
 * AIの分析1件をどこに出すか。プログラムで決める（AIに振り分けさせない）
 * 価格 → 価格分析タブ、組み合わせ → ターゲット・訴求タブ（顧客への伝え方）、それ以外はエリア分析のカード
 * エリアのカードは、災害・規制の事実を根拠にしていれば「土地・災害」、それ以外は topic で決める
 */
export function placeOfAnalysis(a: Analysis): { tab: "price" | "target" } | { tab: "area"; card: AreaCard } {
  if (a.topic === "価格") return { tab: "price" };
  if (a.topic === "組み合わせ") return { tab: "target" };
  const cats = a.evidence.map(categoryOf);
  if (cats.includes("H") || cats.includes("R")) return { tab: "area", card: "land" };
  if (a.topic === "立地") return { tab: "area", card: "living" };
  if (a.topic === "買い手") return { tab: "area", card: "people" };
  if (a.topic === "物件") return { tab: "area", card: "property" };
  // その他：根拠の最初の分類で決める
  const first = cats.find((c) => c !== null);
  if (first === "A" || first === "B") return { tab: "area", card: "people" };
  if (first === "S" || first === "L" || first === "T") return { tab: "area", card: "living" };
  return { tab: "area", card: "property" };
}

/** 事実を引いているAIの文1つ */
export interface FactUse {
  tab: ReportTab;
  /** どこの文か（例：第1ターゲット、訴求1） */
  where: string;
  text: string;
}

/**
 * 事実IDごとに、その事実を根拠にしている画面上の文（根拠データタブの「使用箇所」）
 * 画面に出さない合わない層（not_fit）は数えない
 */
export function factUsage(main: StrategyOutput, media: MediaOutput, mediaName: (id: string, fallback: string) => string = (_, f) => f): Map<string, FactUse[]> {
  const out = new Map<string, FactUse[]>();
  const add = (evidence: string[], use: FactUse) => {
    for (const id of new Set(evidence.map((e) => e.trim()).filter(Boolean))) {
      const list = out.get(id) ?? [];
      list.push(use);
      out.set(id, list);
    }
  };
  const check = focusToCheck(main);
  if (check) add(check.evidence, { tab: "summary", where: "データの注意点（掲載前に確かめること）", text: check.action });
  add(main.summary.evidence, { tab: "summary", where: "推奨方針（総合評価）", text: main.summary.text });
  main.concerns.forEach((c, i) => add(c.evidence, { tab: "summary", where: `買い手が気にしそうな点${i + 1}`, text: c.text }));
  [...main.targets].sort((a, b) => a.rank - b.rank).forEach((t) => add(t.evidence, { tab: "target", where: `第${t.rank}候補 ${t.name}`, text: t.reason }));
  [...main.appeals].sort((a, b) => a.rank - b.rank).slice(0, 3).forEach((a, i) => add(a.evidence, { tab: "target", where: `訴求${i + 1}`, text: a.text }));
  add(main.direction.evidence, { tab: "sales", where: "販売の方向性", text: main.direction.text });
  media.media.forEach((m) => add(m.evidence, { tab: "sales", where: `媒体 ${mediaName(m.id, m.name)}`, text: m.reason }));
  media.cautions.forEach((c, i) => add(c.evidence, { tab: "sales", where: `媒体の注意点${i + 1}`, text: c.text }));
  add(main.price_view.evidence, { tab: "price", where: "価格の見方", text: main.price_view.text });
  // 競合と比べた部分（2026-11-05）。以前の答えには無い
  const comp = competitorPart(main);
  if (comp) {
    if (comp.competitor_edge) add(comp.competitor_edge.evidence, { tab: "sales", where: "競合と比べたおすすめポイント", text: comp.competitor_edge.point });
    comp.competitor_concerns.forEach((c, i) => add(c.evidence, { tab: "sales", where: `競合と比べた懸念点${i + 1}`, text: c.concern }));
    comp.competitors.forEach((c) => add(c.buyer_view.evidence, { tab: "sales", where: "競合ごとの見え方", text: c.buyer_view.text }));
  }
  for (const a of main.analysis) {
    const place = placeOfAnalysis(a);
    const where = place.tab === "area" ? `分析（${AREA_CARDS.find((c) => c.key === place.card)!.title}）` : `分析（${a.topic}）`;
    add(a.evidence, { tab: place.tab, where, text: a.meaning });
  }
  return out;
}

// ---- 見せ方の補助（2026-11-03 第2版：数字とアイコンで見せる、取得状態と出どころを分ける） ----

/** 事実の出どころ。「取得」は値を取れたことで、内容を人が確かめたことではないため、状態とは別に出す */
export type FactOrigin = "入力" | "公的・調査データ" | "地図データ（OSM）" | "システム計算" | "設定値";
/** 相場（M）のうち、公示地・基準地の値をそのまま出す事実（計算していない） */
const RAW_LAND_PRICE = /^近くの(公示地|基準地)/;
export function factOrigin(f: Fact): FactOrigin {
  if (f.出典.startsWith("入力")) return "入力";
  // 競合（K）は本システムに登録した物件の値と、その物件の販売戦略の引用（2026-11-05）
  if (categoryOf(f.id) === "K") return "入力";
  if (f.出典.includes("計算") || (categoryOf(f.id) === "M" && !RAW_LAND_PRICE.test(f.項目))) return "システム計算";
  if (f.出典.includes("一覧（")) return "設定値";
  if (f.出典.includes("OpenStreetMap")) return "地図データ（OSM）";
  return "公的・調査データ";
}

/**
 * 項目の短い名前。末尾の（…）は、見分けに要るものだけ短くして残す
 * 「洪水の想定浸水深（想定最大規模）」→「洪水の想定浸水深」
 * 「月々の返済額（変動0.9%・35年）」→「月々の返済額（変動0.9%）」（変動と固定を見分ける）
 * 「延床の坪単価（広さの近い取引の相場と比べる：…）」→「延床の坪単価（広さの近い取引）」
 * 「交通1（物件資料の徒歩分）」はそのまま（直線距離ではないことを示す）
 */
export function shortLabel(項目: string): string {
  const named = 項目.replace(/^【(.+?)】/, "$1 ");
  const m = named.match(/^(.*?)（([^（）]*)）$/);
  if (!m) return named;
  const [, head, inner] = m;
  if (!head) return named;
  if (inner.includes("物件資料")) return named;
  if (/^(変動|固定)/.test(inner) || /^[^、・]*(変動|固定)/.test(inner)) return `${head}（${inner.split(/[、・]/)[0]}）`;
  if (inner.startsWith("広さの近い取引")) return `${head}（広さの近い取引）`;
  return head;
}

/**
 * 返済の目安の値の頭にある年齢（返済の目安の主は年齢ではなく返済のため、チップや1行では外す）
 * 今の形「50代半ばで借りる場合（55歳で計算）。変動0.9%：…」と、前の形「代表年齢55歳。変動0.9%：…」（保存済みの事実シート）の両方を読む
 */
const AGE_HEAD = /^(代表年齢[^。]*|[^。（]*で借りる場合（[^（）]*）)。([\s\S]+)$/;
const dropAgeHead = (v: string) => v.match(AGE_HEAD)?.[2] ?? v;

/** チップに出す値：（…）の補足を外し、返済の目安は年齢を外す。長さは画面（CSS）で切る */
export function compactValue(値: string | null): string {
  if (値 === null) return "不明";
  const age = 値.match(AGE_HEAD);
  const v = age ? age[2] : 値;
  return v.replace(/（[^（）]*）/g, "").replace(/\s+/g, " ").trim() || v;
}

/**
 * 値を、大きく出す部分（main）と補足（sub）に分ける。表示だけに使い、値そのものは変えない
 * 「3件：A 直線240m、B 直線400m」→ main「3件」sub「A 直線240m、B 直線400m」
 * 「候補：A小学校、B小学校」→ main「候補2件」sub「A小学校、B小学校」（1つ目を答えのように見せない）
 * 「新潟駅（信越本線・白新線） 直線2.4km」→ main「新潟駅 直線2.4km」sub「（信越本線・白新線）」（距離を落とさない）
 * 並びの値（「A、B」）は main に1つ目、sub に残りを出す。タイルは sub も見せる
 */
export function splitValue(値: string | null): { main: string; sub: string | null } {
  if (値 === null) return { main: "不明", sub: null };
  const count = 値.match(/^(\d+件)[：。]([\s\S]*)$/);
  if (count) {
    const rest = count[2].trim();
    return { main: count[1], sub: rest ? rest : null };
  }
  const cand = 値.match(/^候補：([\s\S]+)$/);
  if (cand) return { main: `候補${cand[1].split("、").length}件`, sub: cand[1] };
  const age = 値.match(AGE_HEAD);
  const body = age ? age[2] : 値;
  const head = compactValue(body).split(/[。、]/)[0].trim();
  const main = head.length > 24 ? `${head.slice(0, 22)}…` : head;
  let sub: string | null;
  if (body.startsWith(head)) sub = body.slice(head.length).replace(/^[、。\s]+/, "").trim() || null;
  else sub = (body.match(/（[^（）]*）/g) ?? []).join("") || null;
  if (age) sub = [age[1], sub].filter(Boolean).join("。");
  return { main, sub };
}

/** ターゲットの根拠を観点で分ける（事実の分類と項目で機械的に分ける。AIの答えの形は変えない） */
const AFFORD = /^(月々の返済額|必要年収|【.+】の返済の目安)/;
export const TARGET_ASPECTS: { key: string; title: string; test: (id: string, f: Fact | undefined) => boolean }[] = [
  { key: "area", title: "地域の特性", test: (id) => ["A", "S", "L", "T", "H", "R"].includes(categoryOf(id) ?? "") },
  { key: "fit", title: "物件との合い方", test: (id) => ["P", "M", "K"].includes(categoryOf(id) ?? "") },
  { key: "afford", title: "買える見込み", test: (id, f) => categoryOf(id) === "B" && !!f && AFFORD.test(f.項目) },
];
/** 3つの観点（根拠が無くても出す）と、どれにも当たらない根拠（「買い手の傾向」「その他」。あるときだけ） */
export function groupByAspect(evidence: string[], facts: Map<string, Fact>): { key: string; title: string; ids: string[]; optional: boolean }[] {
  const ids = [...new Set(evidence.map((e) => e.trim()).filter(Boolean))];
  const groups = TARGET_ASPECTS.map((a) => ({ key: a.key, title: a.title, ids: ids.filter((id) => a.test(id, facts.get(id))), optional: false }));
  const placed = new Set(groups.flatMap((g) => g.ids));
  const rest = ids.filter((id) => !placed.has(id));
  const buyer = rest.filter((id) => categoryOf(id) === "B");
  const other = rest.filter((id) => categoryOf(id) !== "B");
  if (buyer.length) groups.push({ key: "buyer", title: "買い手の傾向", ids: buyer, optional: true });
  if (other.length) groups.push({ key: "other", title: "その他", ids: other, optional: true });
  return groups;
}

/** 取得できず・要確認の事実ごとの、次に確かめること（決まった文。AIは使わない） */
export function nextCheck(f: Fact): { who: string; what: string } {
  const c = categoryOf(f.id);
  const name = shortLabel(f.項目);
  if (c === "K") {
    return f.項目.endsWith("AIの見立て")
      ? { who: "競合の物件の画面", what: `${name}は、競合の物件情報を直す前の戦略からの引用なので、競合の戦略を作り直してから比べ直す` }
      : { who: "競合の物件の画面", what: `${name}を、競合の物件の画面で確かめる` };
  }
  if (factOrigin(f) === "入力" || c === "P") return { who: "売主・物件資料", what: `${name}を確認し、物件情報に入力する` };
  if (c === "H" || c === "R") return { who: "ハザードマップ・都市計画図", what: `物件の位置で${name}を確かめる` };
  if (c === "S") return { who: "市の通学区域", what: `住所から${name}を確かめる` };
  if (f.状態 === "要確認" && /^データは.+時点/.test(f.比較 ?? "")) return { who: "市の一覧・現地", what: `近くの${name}を、最新の一覧か現地で確かめる（データの時点より後の閉所・新設は入っていない）` };
  if (f.状態 === "要確認") return { who: "元の資料", what: `${name}は値に確かめる点があるので、元の資料で確かめる` };
  if (c === "M") return { who: "取引事例・査定資料", what: `${name}は公的データで出せなかったので、近い条件の取引を確かめる` };
  if (c === "L" || c === "T") return { who: "地図・現地", what: `${name}を地図か現地で確かめる` };
  return { who: "資料", what: `${name}は公的データで取れなかったので、必要なら資料で確かめる` };
}

/** 「物件68.8万円/坪」「…の中央値 52.1万円/坪（41件）」から坪単価（万円）を読む。読めなければ null */
export function unitPriceOf(text: string | null | undefined): number | null {
  const m = text?.match(/([\d,]+(?:\.\d+)?)万円\/坪/);
  return m ? Number(m[1].replace(/,/g, "")) : null;
}

/**
 * 「データの注意点」（旧「次に確かめること」）に出す事実（2026-11-04 浩平さん指摘：重要でない項目まで出すと大げさ）。
 * 取得できず・要確認の事実のうち、販売の前に確かめる意味があるものだけを出す
 * - 災害（H）と学区（S）：買い手への説明に要るので、取れなかったときは必ず確かめる
 * - それ以外：戦略の根拠に使った「要確認」の事実だけ（根拠にした以上、確かめないと見立てが崩れる）
 * 統計・施設の件数・乗降客数などが取れなかったことや、任意の入力が空なことは出さない（根拠データタブには残る）
 */
export function factsToCheck(facts: Fact[], usedIds: Iterable<string>): Fact[] {
  const used = new Set(usedIds);
  return facts.filter((f) => {
    if (f.状態 === "取得") return false;
    const c = categoryOf(f.id);
    if (c === "H" || c === "S") return true;
    return f.状態 === "要確認" && used.has(f.id);
  });
}

/** 事実ID（P-10 など）。分類は事実シートの分類だけ */
const FACT_ID = /(?<![A-Za-z0-9])[PMRASLTHBKC]-\d{2}(?![0-9])/g;
/** 事実IDだけが入ったかっこ（「（P-10）」「［P-10、L-04］」など） */
const ID_BRACKETS = /\s*[（(［[【]\s*(?:事実ID[:：]\s*)?[PMRASLTHBKC]-\d{2}(?:\s*[、,・／/]\s*[PMRASLTHBKC]-\d{2})*\s*[）)］\]】]/g;

/**
 * AIの文に入った事実IDを、利用者に分かる形にする（2026-11-04 浩平さん指摘：［P-10］は利用者向けではない）。
 * かっこで添えたIDは外し（根拠は文の下のチップで見える）、文の中のIDは事実の名前に置き換える。事実にない番号はそのまま
 */
export function plainIds(text: string, facts: Map<string, Fact>): string {
  return text
    .replace(ID_BRACKETS, "")
    .replace(FACT_ID, (id) => {
      const f = facts.get(id);
      if (!f) return id; // 事実にない番号は、IDではない文字（区画の番号など）かもしれないので触らない
      // 「（直線）」「（1km以内）」は文の意味を変えるので残す（徒歩距離や「まったく無い」と読まれないように）
      const scope = /（([^（）]*(直線|以内)[^（）]*)）$/.exec(f.項目);
      const name = shortLabel(f.項目);
      return scope && !name.includes(scope[1]) ? `${name}（${scope[1]}）` : name;
    })
    .replace(/[ 　]{2,}/g, " ")
    .trim();
}

/** 答えの文の中の事実IDを全部 plainIds で直す。evidence・id は事実IDそのものなので触らない */
export function withPlainIds<T>(value: T, facts: Map<string, Fact>): T {
  const walk = (v: unknown, key?: string): unknown => {
    if (key === "evidence" || key === "id" || key === "fact_id") return v;
    if (typeof v === "string") return plainIds(v, facts);
    if (Array.isArray(v)) return v.map((x) => walk(x));
    if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x, k)]));
    return v;
  };
  return walk(value) as T;
}

/**
 * AIが「事実シートから分からない」と挙げたこと（unknown）のうち、画面に出すもの。
 * 挙げた事実IDが、どれも「データの注意点」に出さない取得できず・要確認の事実（統計・乗降客数・古い施設データなど）なら出さない。
 * IDが無い項目や、取れている事実を挙げた項目（例：店名に「仮称」が入る）は出す。文の中のIDで判断するので、plainIds の前に使う
 */
export function unknownToShow(unknown: string[], facts: Fact[], usedIds: Iterable<string>): string[] {
  const shown = new Set(factsToCheck(facts, usedIds).map((f) => f.id));
  const minor = new Set(facts.filter((f) => f.状態 !== "取得" && !shown.has(f.id)).map((f) => f.id));
  return unknown.filter((u) => {
    const ids = u.match(FACT_ID) ?? [];
    return ids.length === 0 || ids.some((id) => !minor.has(id));
  });
}

/**
 * 懸念点の札（価格・災害・物件など）。根拠の事実の分類からプログラムで決める（AIには振り分けさせない。2026-11-04 浩平さん指摘：何の話か一目で分からない）
 * 先に当たったものを使う：災害 → 価格（相場、または物件の価格）→ 物件 → 立地（学区・施設・交通）→ エリア → 買い手 → 競合
 */
export function concernTopic(evidence: string[], facts: Map<string, Fact>): string | null {
  const cats = new Set(evidence.map((id) => categoryOf(id)).filter(Boolean));
  const price = evidence.some((id) => facts.get(id.trim())?.項目 === "価格");
  if (cats.has("H")) return "災害";
  if (cats.has("M") || price) return "価格";
  if (cats.has("P") || cats.has("R")) return "物件";
  if (cats.has("S") || cats.has("L") || cats.has("T")) return "立地";
  if (cats.has("A")) return "エリア";
  if (cats.has("B")) return "買い手";
  if (cats.has("K")) return "競合";
  return null;
}

// ---- サマリーの「販売の基本戦略」（2026-11-04 浩平さん依頼） ----

/**
 * 基本の6候補の絵（public/targets/）。AIが加えた候補には絵を出さない
 * 2026-11-04 浩平さん提供の青い横長の絵（2:1）に6枚とも差し替え。50代の住み替えはダンボールなし、単身はポシェットなしの版。外側の白い縁は切り落として720x360にしている
 */
export const TARGET_IMAGES: Record<string, string> = {
  若い夫婦: "/targets/young-couple.webp",
  小中学生のいる家族: "/targets/school-family.webp",
  "50代の住み替え": "/targets/fifties-move.webp",
  "60歳以上": "/targets/senior.webp",
  単身: "/targets/single.webp",
  親と同居: "/targets/with-parents.webp",
};

/**
 * 登録済みの基本の6候補と、その説明（ターゲット・訴求タブの「ターゲット像」の補足。2026-11-06 浩平さん依頼）
 * 説明はこの戦略に使った事実シートの定義（targetDefinition と同じ読み方）。無ければ null
 */
export function baseTargets(facts: Fact[]): { name: string; definition: string | null }[] {
  return Object.keys(TARGET_IMAGES).map((name) => ({ name, definition: targetDefinition({ name, source: "候補", definition: null }, facts) }));
}

/**
 * ターゲットの説明。AIが加えた候補は AI の definition、基本の候補は事実 B「ターゲット候補「…」の定義」の値
 * 前の事実シートは末尾に「（代表年齢30歳）」（返済の計算に使う仮の年齢）が付いているので外す。単身の「年代は問わない」と食い違って見えるため
 */
export function targetDefinition(t: { name: string; source: string; definition: string | null }, facts: Fact[]): string | null {
  if (t.source === "エージェント提案") return t.definition?.trim() || null;
  const f = facts.find((x) => x.項目 === `ターゲット候補「${t.name}」の定義`);
  if (!f?.値 || f.値.startsWith("定義は未設定")) return null;
  return f.値.replace(/（代表年齢\d+歳）$/, "").trim() || null;
}

/**
 * ターゲットが重視しやすい点（2026-11-04 浩平さん指摘「公園・こども園は重要度が高くない。ターゲットに合う要素を、多すぎない数で」）
 * 何を重視するかは、調査で重視される項目から決めたたたき台（docs/参考/ペルソナの根拠_統計メモ.md）。BRUMBY様の実務感覚で直す前提
 *   全類型：住宅の質では広さ・間取りが1位（住生活総合調査 図70）。中古戸建を選んだ理由は価格が上位（住宅市場動向調査）
 *   若い夫婦：価格・交通（住宅市場動向調査 若者夫婦）／小中学生のいる家族：広さ・間取りが最も重要、子育て・教育環境（図14・図71）
 *   50代の住み替え：今の家を売って買う二次取得。中古はリフォームで快適が理由の上位（住宅市場動向調査）
 *   60歳以上：買物・医療（図71 65歳以上夫婦）、段差のなさ（図70）／単身：通勤・買物（図71 単独）
 *   親と同居：広さ・間取り（図70）、高齢の親と住む（医療）。地方は車が要るので駐車（調査の裏付けはなく、たたき台）
 * 値は事実シートの値をそのまま短くするだけで、AIは使わない。取れなかった・要確認の事実は飛ばして次の項目を出す
 */
type PointKey = "loan" | "size" | "land" | "elementary" | "juniorHigh" | "station" | "bus" | "supermarket" | "medical" | "floors" | "parking" | "renovation";
export const TARGET_POINTS: Record<string, PointKey[]> = {
  若い夫婦: ["loan", "size", "station", "supermarket", "renovation"],
  小中学生のいる家族: ["elementary", "juniorHigh", "size", "loan", "supermarket"],
  "50代の住み替え": ["loan", "size", "renovation", "supermarket", "medical"],
  "60歳以上": ["supermarket", "medical", "floors", "bus", "loan"],
  単身: ["station", "supermarket", "loan", "size", "bus"],
  親と同居: ["size", "land", "parking", "medical", "loan"],
};
/** サマリーに出す重視しやすい点の数（多すぎないように） */
export const MAX_TARGET_POINTS = 4;

export interface TargetPoint {
  label: string;
  value: string;
  /** 押したときに開く事実（最初の1件）と、使った事実 */
  ids: string[];
}

const usable = (f: Fact | undefined): f is Fact => !!f && f.状態 === "取得" && !!f.値;
const byItem = (facts: Fact[], 項目: string) => facts.find((f) => f.項目 === 項目);
/** 「A 直線320m（…）」の後ろの補足を外す */
const dropTail = (v: string) => v.replace(/（[^（）]*）$/, "").trim();
/** 施設の件数の値：「3件：A 直線320m、…」→「A 直線320m（1km以内3件）」、「0件。3km以内の最寄り：A 直線1.1km」→「1km以内になし（最寄り A 直線1.1km）」 */
function nearbyText(v: string): string {
  const count = v.match(/^(\d+)件：([^、]+?)(?:、| ほか|$)/);
  if (count) return `${count[2].trim()}（1km以内${count[1]}件）`;
  const none = v.match(/^0件。3km以内の最寄り：(.+)$/);
  if (none) return `1km以内になし（最寄り ${none[1].trim()}）`;
  if (/^0件。3km以内になし/.test(v)) return "3km以内になし";
  return v;
}

function point(key: PointKey, target: string, facts: Fact[]): TargetPoint | null {
  const one = (項目: string, label: string, text: (v: string) => string = (v) => v): TargetPoint | null => {
    const f = byItem(facts, 項目);
    return usable(f) ? { label, value: text(f.値!), ids: [f.id] } : null;
  };
  switch (key) {
    case "loan": {
      // 候補の名前が入った返済の目安。住み替えの候補は、今の家を売ったお金を頭金にした行を先に使う
      const rows = facts.filter((f) => usable(f) && f.項目.includes("】の返済の目安（") && (f.項目.match(/^【(.+?)】/)?.[1].split("・") ?? []).includes(target));
      const f = rows.find((r) => r.項目.replace(/^【.+?】/, "").includes("住み替え")) ?? rows[0];
      if (!f) return null;
      const term = f.項目.match(/返済期間(\d+)年/)?.[1];
      const down = f.項目.match(/頭金([\d.]+%|[\d,]+万円)/)?.[1];
      // 「変動0.95%：月々約6.2万円・必要年収約300万円（…）」→「月々約6.2万円」。1つ目（変動）の月々の返済だけ出す（2026-11-04 浩平さん指示：必要年収と金利は出さない）
      const first = dropAgeHead(f.値!).split("。")[0];
      const monthly = first.match(/月々約[\d.,]+万円/)?.[0];
      if (!monthly) return null;
      return { label: `返済の目安（${down ? `住み替えで頭金${down}・` : ""}${term ?? "?"}年）`, value: monthly, ids: [f.id] };
    }
    case "size": {
      const layout = byItem(facts, "間取り");
      const area = byItem(facts, "建物面積");
      const l = usable(layout) ? (layout.値!.match(/（([^（）]+)）$/)?.[1] ?? layout.値!) : null;
      const parts = [l && !l.includes("書き方") ? l : null, usable(area) ? `建物${area.値}` : null].filter(Boolean);
      return parts.length ? { label: "広さ・間取り", value: parts.join("・"), ids: [layout, area].filter(usable).map((f) => f.id) } : null;
    }
    case "land": {
      const land = byItem(facts, "土地面積");
      const garden = byItem(facts, "庭");
      if (!usable(land)) return null;
      return { label: "土地", value: `${land.値}${usable(garden) ? `・庭${garden.値}` : ""}`, ids: [land, garden].filter(usable).map((f) => f.id) };
    }
    case "elementary":
      return one("小学校区", "小学校区", (v) => v.replace("物件から", ""));
    case "juniorHigh":
      return one("中学校区", "中学校区", (v) => v.replace("物件から", ""));
    case "station":
      return one("最寄り駅（直線）", "最寄り駅", (v) => v.replace(/（[^（）]*）/, "").replace(/\s+/g, " ").trim());
    case "bus":
      return one("最寄りバス停（直線）", "最寄りバス停", dropTail);
    case "supermarket":
      return one("スーパー（1km以内）", "スーパー", nearbyText);
    case "medical":
      return one("内科のある病院・診療所（1km以内）", "内科", nearbyText);
    case "floors":
      return one("階数", "階数");
    case "parking":
      return one("駐車台数", "駐車");
    case "renovation":
      return one("リフォーム", "リフォーム");
  }
}

/** 基本の候補が重視しやすい点を、この物件の事実で出す。AIが加えた候補や表にない名前は null（呼び出し側で根拠の事実を出す） */
export function targetPoints(target: string, facts: Fact[], max = MAX_TARGET_POINTS): TargetPoint[] | null {
  const keys = TARGET_POINTS[target];
  if (!keys) return null;
  const out: TargetPoint[] = [];
  for (const k of keys) {
    const p = point(k, target, facts);
    if (p) out.push(p);
    if (out.length >= max) break;
  }
  return out;
}

/** 物件の見出しにすでに出ている、または特徴と呼べない P の項目 */
const NOT_FEATURE = /^(価格|所在地|物件区分|広告予算の総額|土地面積|築年数|階数)$/;
/** 特徴に使う分類：物件・学区・周りの施設・交通 */
const FEATURE_CATEGORIES: FactCategory[] = ["P", "S", "L", "T"];

/**
 * AIが加えた候補のときに「物件のポイント」に出す事実（重視しやすい点の表がないため）。AIが訴求・推奨方針・第一ターゲットの根拠に引いた事実のうち、物件と立地の強みになるものだけ
 * 取れなかった・要確認の事実（データの注意点に出す）、0件の施設、物件の見出しと同じ項目は外す。文はAIに作らせず、事実の値をそのまま短くする
 */
export function summaryFeatures(main: Pick<StrategyOutput, "appeals" | "summary" | "targets">, facts: Map<string, Fact>, max = MAX_TARGET_POINTS): Fact[] {
  const appeals = [...main.appeals].sort((a, b) => a.rank - b.rank);
  const first = [...main.targets].sort((a, b) => a.rank - b.rank)[0];
  const ids = [...appeals.flatMap((a) => a.evidence), ...main.summary.evidence, ...(first?.evidence ?? [])].map((i) => i.trim());
  const out: Fact[] = [];
  for (const id of new Set(ids)) {
    const f = facts.get(id);
    if (!f || f.状態 !== "取得" || !f.値) continue;
    if (!FEATURE_CATEGORIES.includes(categoryOf(id) as FactCategory)) continue;
    if (categoryOf(id) === "P" && NOT_FEATURE.test(f.項目)) continue;
    if (/^0件/.test(f.値) || /^(不明|なし|入力なし)/.test(f.値)) continue;
    // 公園・保育の施設は販売の決め手になりにくい（2026-11-04 浩平さん指摘。住生活総合調査でも公園は重視の上位に入らない）
    if (/^(公園|保育|地域型保育|幼稚園|認定こども園|こども園|放課後児童クラブ)/.test(f.項目)) continue;
    out.push(f);
    if (out.length >= max) break;
  }
  return out;
}

/**
 * 特徴の1行。値を書き換えずに短くするだけ
 * 「3件：A 直線320m、B …」→「A 直線320m（1km以内3件）」、間取り「居室4・納戸0（4LDK）」→「4LDK」
 */
export function featureText(f: Fact): { label: string; value: string } {
  const label = shortLabel(f.項目);
  const v = f.値 ?? "";
  if (f.項目 === "間取り") {
    const m = v.match(/（([^（）]+)）$/);
    return { label, value: m && !m[1].includes("書き方") ? m[1] : v };
  }
  const count = v.match(/^(\d+)件：([^、]+?)(?:、| ほか|$)/);
  if (count) {
    const scope = f.項目.match(/（(\d+(?:\.\d+)?k?m以内)）$/)?.[1] ?? "";
    return { label, value: `${count[2].trim()}（${scope}${count[1]}件）` };
  }
  return { label, value: v.replace(/\s+/g, " ").trim() };
}

/** 販売施策タブで最初に選んでおく予算：①の総額があればそれ、無ければ20万円、それも無ければ最初の列（2026-11-04 浩平さん了承の推奨案） */
export function defaultBudgetIndex(sims: { totalManYen: number; isInput: boolean }[]): number {
  const input = sims.findIndex((s) => s.isInput);
  if (input >= 0) return input;
  const twenty = sims.findIndex((s) => s.totalManYen === 20);
  return twenty >= 0 ? twenty : 0;
}

/**
 * AIの文を、最初の1文と残りに分ける（ターゲット・訴求タブで、理由を一言で見せて残りは開いて読む。2026-11-04 浩平さん指摘「文字が多い」）
 * 文の中身は変えず、「。」で切るだけ。「。」が無い・1文だけのときは rest が null
 */
export function firstSentence(text: string): { head: string; rest: string | null } {
  const t = text.trim();
  const i = t.indexOf("。");
  if (i < 0 || i === t.length - 1) return { head: t, rest: null };
  return { head: t.slice(0, i + 1), rest: t.slice(i + 1).trim() || null };
}

/**
 * 根拠の事実を「何が・どうか」の短い1行にする（ターゲットを選んだ理由の観点ごとに1つ見せる）。値は書き換えず短くするだけ
 * 返済は月々の返済額だけ（必要年収・金利は出さない。2026-11-04 浩平さん指示）。必要年収の事実は null（1行に出さない）
 * 施設の件数は最寄り1つと件数
 */
export function aspectLine(f: Fact): { label: string; value: string } | null {
  if (/^必要年収/.test(f.項目)) return null;
  if (/の返済の目安/.test(f.項目)) {
    const monthly = dropAgeHead(f.値 ?? "").split("。")[0].match(/月々約[\d.,]+万円/)?.[0];
    return monthly ? { label: "返済の目安", value: monthly } : null;
  }
  if (/^月々の返済額/.test(f.項目)) return f.値 ? { label: "月々の返済額", value: f.値 } : null;
  const { label, value } = featureText(f);
  const short = label.replace(/^ターゲット候補「(.+)」の定義$/, "$1の定義");
  // 末尾の補足（系統・路線など）は外す。件数の補足（1km以内3件）は残す
  return { label: short, value: value.replace(/（(?![^（）]*件）)[^（）]*）$/, "").trim() || value };
}

/**
 * 観点ごとに1行で見せる事実を選ぶ。事実シートにあるIDだけを数え、状態が「取得」で値のある事実を、AIが挙げた順に先に使う
 * 1行にできない事実（必要年収など）は飛ばす。取れた事実が無く要確認・取得できずだけのときは、その事実を caution 付きで返す
 */
export function pickAspectFact(ids: string[], facts: Map<string, Fact>): { fact: Fact; line: { label: string; value: string } | null; caution: boolean; count: number } | null {
  const resolved = ids.map((id) => facts.get(id)).filter((f): f is Fact => !!f);
  if (resolved.length === 0) return null;
  for (const f of resolved) {
    if (f.状態 !== "取得" || !f.値) continue;
    const line = aspectLine(f);
    if (line) return { fact: f, line, caution: false, count: resolved.length };
  }
  const f = resolved.find((x) => x.状態 !== "取得") ?? resolved[0];
  return { fact: f, line: f.状態 === "取得" ? null : { label: shortLabel(f.項目), value: f.状態 }, caution: f.状態 !== "取得", count: resolved.length };
}

/**
 * 媒体の短い説明（販売施策タブの「i」の補足。2026-11-04 浩平さん依頼「それぞれの特徴を利用者がわかるように」）
 * 画面に固定で書いた一般的な説明で、AIの文でも、この物件の事実でもない。届き方の強さ・閲覧数・掲載料の比較は入れない（根拠のデータがまだ無い）
 */
export const MEDIA_NOTES: Record<string, string> = {
  "C-01": "家を探している人が、地域や条件で物件を検索する不動産ポータルサイトです。",
  "C-02": "家を探している人が、地域や条件で物件を検索する不動産ポータルサイトです。",
  "C-03": "家を探している人が、地域や条件で物件を検索する不動産ポータルサイトです。",
  "C-04": "自社サイトの物件ページです。ほかの媒体で知った人が、会社や物件を確かめに来る受け皿になります。",
  "C-05": "「新潟市 中古戸建」のような検索をした人に出る広告です。家を探している人に届きます。",
  "C-06": "写真や動画で見せるSNSの広告です。まだ家を探していない人にも知ってもらえます。",
  "C-07": "年代や地域を絞って出せるSNSの広告です。",
  "C-08": "短い動画で見せるSNSの広告です。",
  "C-09": "LINEのトーク一覧やニュースの面に出る広告です。",
  "C-10": "動画の前や途中に流れる広告です。家の中の様子を動画で伝えられます。",
  "C-11": "新聞に入れて、地域の家庭に配る紙の広告です。",
  "C-12": "物件の近くの家のポストに、チラシを直接配ります。近所での住み替えを考える人に届きます。",
  "C-13": "地域で無料で配られる情報誌に載せます。",
  "C-14": "物件の前に立てる看板やのぼりです。通りかかった人に売り出し中だと知らせます。",
  "C-15": "日にちを決めて、家の中を見てもらう現地の見学会です。",
  "C-16": "自社に登録しているお客様に、LINEやメールで新しい物件を知らせます。",
};

/** 不動産ポータルをまとめた理由（今の媒体一覧では、ポータルどうしの違いは届きやすい年代の見立てだけ） */
export const PORTAL_DIFF_NOTE = "ポータルどうしの違いは、今は「届きやすい年代」の見立てだけなので、1つにまとめて表示しています。掲載料・閲覧数・反響の差は、まだ入っていません。";

export const PORTAL_CATEGORY = "不動産ポータル";

type MediaRow = MediaOutput["media"][number];

/** 画面に出す媒体の1行。不動産ポータルは members に元の媒体（SUUMO・アットホームなど）を持つ */
export interface DisplayMedia {
  key: string;
  ids: string[];
  name: string;
  category: string | null;
  share: number;
  purpose: string;
  target: string;
  evidence: string[];
  members: { id: string; name: string; share: number; reason: string; share_reason: string }[];
}

/**
 * AIの媒体を画面の行にする。不動産ポータル（SUUMO・アットホーム・LIFULL HOME'S）は1行「不動産ポータル」にまとめ、配分は足す
 * （2026-11-04 浩平さん指摘「明確な違いがない場合は分けない方が説得力がある。ツールチップにSUUMOやアットホームであることを含めて」）
 * AIの答えそのものは変えない（保存した答え・点検・販売記録は媒体ごとのまま）。並びは配分の大きい順
 */
export function groupMedia(media: MediaRow[], info: (id: string) => { name?: string; category?: string } | undefined): DisplayMedia[] {
  const uniq = (xs: string[]) => [...new Set(xs.map((x) => x.trim()).filter(Boolean))];
  const one = (m: MediaRow, name: string, category: string | null): DisplayMedia => ({
    key: m.id,
    ids: [m.id],
    name,
    category,
    share: m.share,
    purpose: m.purpose,
    target: m.target,
    evidence: m.evidence,
    members: [{ id: m.id, name, share: m.share, reason: m.reason, share_reason: m.share_reason }],
  });
  const portals = media.filter((m) => info(m.id)?.category === PORTAL_CATEGORY).sort((a, b) => b.share - a.share);
  const rows = media.filter((m) => info(m.id)?.category !== PORTAL_CATEGORY).map((m) => one(m, info(m.id)?.name ?? m.name, info(m.id)?.category ?? null));
  if (portals.length > 0) {
    rows.push({
      key: "portal",
      ids: portals.map((m) => m.id),
      name: PORTAL_CATEGORY,
      category: PORTAL_CATEGORY,
      share: portals.reduce((a, m) => a + m.share, 0),
      purpose: uniq(portals.map((m) => m.purpose)).join("・"),
      target: uniq(portals.map((m) => m.target)).join("、"),
      evidence: uniq(portals.flatMap((m) => m.evidence)),
      members: portals.map((m) => ({ id: m.id, name: info(m.id)?.name ?? m.name, share: m.share, reason: m.reason, share_reason: m.share_reason })),
    });
  }
  return rows.sort((a, b) => b.share - a.share);
}
