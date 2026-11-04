"use client";

import { createContext, useContext, useState } from "react";
import type { Fact } from "../../../../lib/facts/types";
import { categoryOf, compactValue, evidenceText, factOrigin, shortLabel, splitValue, type ReportTab } from "../../../../lib/report";
import { card } from "../../../_lib/ui";
import {
  AlertIcon,
  AreaIcon,
  BookIcon,
  BuildingIcon,
  BusIcon,
  CalendarIcon,
  CarIcon,
  CartIcon,
  ChartIcon,
  DatabaseIcon,
  FloorPlanIcon,
  HomeIcon,
  LayersIcon,
  MapIcon,
  MedicalIcon,
  MegaphoneIcon,
  MountainIcon,
  PieIcon,
  PinIcon,
  SchoolIcon,
  SparkIcon,
  TrainIcon,
  TreeIcon,
  TrendIcon,
  UsersIcon,
  WaveIcon,
  WrenchIcon,
  YenIcon,
} from "../../../_components/icons";

// 6タブのレポートで共通に使う部品（2026-11-03 第2版）
// 見分け方を3つにそろえる：事実（入力・公的データ・地図データ・システム計算・設定値）／AIの見立て（✦）／要確認（▲）
// カードごとに「AIの見立て」の札を付けるのはやめ、AIの文の頭に ✦ を付ける。「検証済み」の印は使わない

/** 他のタブから、根拠データタブの事実を開く */
export const ReportNav = createContext<{ goTab: (tab: ReportTab) => void; openFact: (id: string) => void }>({
  goTab: () => {},
  openFact: () => {},
});
export const useReportNav = () => useContext(ReportNav);

type IconComp = (p: { className?: string }) => React.ReactElement;

/** 事実の項目に合うアイコン（言葉で決める。合わなければ分類のアイコン） */
const ICON_WORDS: [RegExp, IconComp][] = [
  [/小学校|中学校|学区|通学/, SchoolIcon],
  [/保育|幼稚園|こども園|児童/, UsersIcon],
  [/公園|庭/, TreeIcon],
  [/スーパー|ドラッグ|コンビニ|買い物|小売/, CartIcon],
  [/病院|診療|歯科|薬局|科（|医療|内科|小児科|外科|眼科|皮膚科|産婦人科|耳鼻/, MedicalIcon],
  [/図書館/, BookIcon],
  [/役所/, BuildingIcon],
  [/駅/, TrainIcon],
  [/バス/, BusIcon],
  [/洪水|津波|浸水/, WaveIcon],
  [/土砂/, MountainIcon],
  [/液状化|盛土/, LayersIcon],
  [/用途地域/, MapIcon],
  [/将来/, TrendIcon],
  [/割合|率/, PieIcon],
  [/人口|世帯|年代|買主/, UsersIcon],
  [/町/, PinIcon],
  [/リフォーム/, WrenchIcon],
  [/駐車/, CarIcon],
  [/間取り/, FloorPlanIcon],
  [/面積/, AreaIcon],
  [/築/, CalendarIcon],
  [/返済|年収|価格|公示|土地と建物/, YenIcon],
  [/坪単価|相場/, ChartIcon],
  [/競合/, BuildingIcon],
  [/媒体|探した方法|利用/, MegaphoneIcon],
];
/** 事実のアイコンの要素（アイコンの部品は普通の関数なので、呼んで要素にする） */
export function factIcon(f: Pick<Fact, "id" | "項目">, className: string): React.ReactElement {
  return iconFor(f)({ className });
}

function iconFor(f: Pick<Fact, "id" | "項目">): IconComp {
  const label = shortLabel(f.項目);
  for (const [re, icon] of ICON_WORDS) if (re.test(label)) return icon;
  const c = categoryOf(f.id);
  if (c === "P") return HomeIcon;
  if (c === "H") return AlertIcon;
  return DatabaseIcon;
}

const isCaution = (f: Fact) => f.状態 !== "取得";

/** 画面上部の凡例。見分け方を一度だけ説明する */
export function Legend() {
  return (
    <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-sub">
      <span className="flex items-center gap-1">
        <DatabaseIcon className="size-3.5 text-primary" />
        事実（入力・公的データ・地図データ・システム計算・設定値）
      </span>
      <span className="flex items-center gap-1">
        <SparkIcon className="size-3.5 text-[#6b4fc0]" />
        AIの見立て（事実からの推論）
      </span>
      <span className="flex items-center gap-1">
        <AlertIcon className="size-3.5 text-accent" />
        要確認・取得できず
      </span>
    </div>
  );
}

export function Card({ title, icon: Icon, children, className = "", aside }: { title?: string; icon?: IconComp; children: React.ReactNode; className?: string; aside?: React.ReactNode }) {
  return (
    <section className={`${card} p-5 break-inside-avoid min-w-0 ${className}`}>
      {title && (
        <div className="flex flex-wrap items-center gap-2 mb-3">
          {Icon && (
            <span className="grid size-8 place-items-center rounded-lg bg-primary-soft text-primary">
              <Icon className="size-[18px]" />
            </span>
          )}
          <h2 className="text-[16px] font-bold text-ink">{title}</h2>
          {aside && <div className="ml-auto">{aside}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

/** AIの見立ての文。頭に ✦ を付けて、事実と見分ける */
export function Ai({ children, size = "md", strong = false }: { children: React.ReactNode; size?: "md" | "sm"; strong?: boolean }) {
  return (
    <p className={`flex gap-1.5 leading-relaxed ${size === "md" ? "text-[15px]" : "text-[13px]"} ${strong ? "font-bold text-ink" : "text-ink"}`}>
      <SparkIcon className={`${size === "md" ? "mt-1 size-4" : "mt-0.5 size-3.5"} shrink-0 text-[#6b4fc0]`} />
      <span className="min-w-0">{children}</span>
    </p>
  );
}

export function HypothesisBadge() {
  return <span className="inline-block whitespace-nowrap rounded bg-[#f1ecfb] px-1.5 py-0.5 text-[11px] font-bold text-[#5b3fa8]">仮説</span>;
}

/** 根拠の事実1件の小さなチップ。項目と値の要点が分かるように出し、押すと根拠データタブで開く */
export function FactChip({ f, id }: { f: Fact | undefined; id: string }) {
  const { openFact } = useReportNav();
  if (!f) return <span className="rounded border border-line px-1.5 py-0.5 font-mono text-[11px] text-muted">{id}</span>;
  const caution = isCaution(f);
  return (
    <button
      type="button"
      onClick={() => openFact(f.id)}
      title={`${f.id}　${evidenceText(f)}\n出典：${f.出典}（${f.時点}）${caution ? `\n状態：${f.状態}` : ""}`}
      className={`inline-flex max-w-full items-center gap-1 rounded-full border px-2 py-0.5 text-[12px] cursor-pointer ${
        caution ? "border-[#f3c9a8] bg-[#fdf1e7] text-accent" : "border-line bg-white text-body hover:border-primary hover:text-primary"
      }`}
    >
      {caution ? <AlertIcon className="size-3.5 shrink-0" /> : factIcon(f, "size-3.5 shrink-0 text-primary")}
      <span className="max-w-[26em] truncate">
        {shortLabel(f.項目).slice(0, 20)}
        <span className="mx-1 text-muted">|</span>
        <span className="font-bold">{compactValue(f.値)}</span>
      </span>
    </button>
  );
}

/** 文の根拠。件数ではなく、どの事実かが分かるチップで出す。多いときは3つまで見せて残りは開く。max=0 は「N件を見る」で開くまで閉じておく */
export function Evidence({ ids, facts, max = 3 }: { ids: string[]; facts: Map<string, Fact>; max?: number }) {
  const [open, setOpen] = useState(false);
  const list = [...new Set(ids.map((i) => i.trim()).filter(Boolean))];
  if (list.length === 0) return null;
  const shown = open ? list : list.slice(0, max);
  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-1">
      <span className="text-[11px] text-muted">根拠</span>
      {shown.map((id) => (
        <FactChip key={id} id={id} f={facts.get(id)} />
      ))}
      {list.length > max && (
        <button type="button" onClick={() => setOpen(!open)} className="text-[12px] text-primary cursor-pointer">
          {open ? "たたむ" : max === 0 ? `${list.length}件を見る` : `ほか${list.length - max}件`}
        </button>
      )}
    </div>
  );
}

/** 事実を数字で見せるタイル。アイコン・短い名前・大きな値・補足・比較。押すと根拠データで開く */
export function FactTile({ f }: { f: Fact }) {
  const { openFact } = useReportNav();
  const v = splitValue(f.値);
  const caution = isCaution(f);
  return (
    <button
      type="button"
      onClick={() => openFact(f.id)}
      title={`${f.id}　${f.項目}\n${f.値 ?? "不明"}${f.比較 ? `\n比較：${f.比較}` : ""}\n出典：${f.出典}（${f.時点}）`}
      className={`flex min-w-0 gap-2.5 rounded-lg border p-2.5 text-left cursor-pointer ${caution ? "border-[#f3c9a8] bg-[#fffaf5]" : "border-line bg-white hover:border-primary"}`}
    >
      <span className={`grid size-8 shrink-0 place-items-center rounded-lg ${caution ? "bg-[#fdf1e7] text-accent" : "bg-primary-soft text-primary"}`}>
        {caution ? <AlertIcon className="size-[18px]" /> : factIcon(f, "size-[18px]")}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[12px] text-sub">{shortLabel(f.項目)}</span>
        <span className={`block truncate text-[16px] font-bold leading-snug ${caution ? "text-accent" : "text-ink"}`}>{f.状態 === "取得" || v.main.startsWith(f.状態) ? v.main : `${v.main}（${f.状態}）`}</span>
        {v.sub && <span className="block line-clamp-2 break-words text-[12px] text-body">{v.sub}</span>}
        {f.比較 && <span className="block line-clamp-2 break-words text-[11px] text-sub">比較：{f.比較}</span>}
        <span className="block truncate text-[11px] text-muted">
          {factOrigin(f)}・{f.時点}
        </span>
      </span>
    </button>
  );
}

/** タイルを並べる。多いときは初めの何件かだけ見せる */
export function FactTiles({ facts, initial = 6, empty = "この分類の事実はありません。", cols = "sm:grid-cols-2" }: { facts: Fact[]; initial?: number; empty?: string; cols?: string }) {
  const [all, setAll] = useState(false);
  if (facts.length === 0) return <div className="text-[13px] text-sub">{empty}</div>;
  const shown = all ? facts : facts.slice(0, initial);
  return (
    <div>
      <div className={`grid gap-2 ${cols}`}>
        {shown.map((f) => (
          <FactTile key={f.id} f={f} />
        ))}
      </div>
      {facts.length > initial && (
        <button type="button" onClick={() => setAll(!all)} className="mt-2 text-[13px] text-primary cursor-pointer">
          {all ? "たたむ" : `ほか${facts.length - initial}件の事実を見る`}
        </button>
      )}
    </div>
  );
}

/** 番号つきの丸 */
export function Num({ n, strong = false }: { n: number; strong?: boolean }) {
  return <span className={`grid size-6 shrink-0 place-items-center rounded-full text-[12px] font-bold ${strong ? "bg-primary text-white" : "bg-primary-soft text-primary"}`}>{n}</span>;
}
