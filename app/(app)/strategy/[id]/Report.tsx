"use client";

import { useMemo, useRef, useState } from "react";
import type { StrategyResult } from "../../../../lib/agents/run";
import type { Fact } from "../../../../lib/facts/types";
import { factUsage, FIXED_CREDITS, REPORT_TABS, unknownToShow, usedFactIds, withPlainIds, type ReportTab, type SourceRow } from "../../../../lib/report";
import UnderlineTabs from "../../../_components/UnderlineTabs";
import type { AreaMapData } from "../../../../lib/area-map";
import type { AreaPriceResult } from "../../../../lib/area-price";
import AreaTab from "./AreaTab";
import EvidenceTab from "./EvidenceTab";
import { Legend, ReportNav } from "./parts";
import PriceTab from "./PriceTab";
import SalesTab, { type MediaInfo, type SalesRecords } from "./SalesTab";
import SummaryTab from "./SummaryTab";
import TargetTab from "./TargetTab";
import type { CompetitorLink, SelfColumnView } from "../../../../lib/competitor-report";
import type { ImageKind } from "../../../../lib/property-images";

// ⑤販売戦略レポート（docs/設計まとめ.md「⑤画面の表示」）
// 2026-11-03 浩平さんの変更仕様で、3タブ（販売戦略・根拠データ・エリア分析）から6タブに組み直した：
//   サマリー → ターゲット・訴求 → 販売施策 → 価格分析 → エリア分析 → 根拠データ
// 画面では AI を動かさず、保存した結果（strategy_runs.result）と事実シートを振り分けて出すだけ。AIの答えの形も変えていない
// 金額は lib/calc/budget.ts で計算済み。合わない層（not_fit）と懸念点の対策案（action）は画面に出さない（DBには残る）

export default function Report({
  result: saved,
  facts,
  sources,
  credits,
  mediaInfo,
  sheetCreatedAt,
  propertyId,
  runId,
  areaMap,
  areaPrice,
  records,
  exteriorImage,
  competitorLinks = {},
  selfColumn = null,
  propertyImages = [],
}: {
  result: StrategyResult;
  facts: Fact[];
  sources: SourceRow[];
  credits: string[];
  mediaInfo: Record<string, MediaInfo>;
  sheetCreatedAt: string;
  propertyId: number;
  /** このレポートを作った実行（AIに送った内容を読むのに使う） */
  runId: number;
  /** エリア分析の地図に出す点（位置が無い物件は null） */
  areaMap: AreaMapData | null;
  /** サマリーの区の価格相場（区×築年数帯の取引から計算） */
  areaPrice: AreaPriceResult;
  /** 販売記録の画面で入れた販売の状況と、媒体ごとの実績の合計（販売施策タブに出す） */
  records: SalesRecords;
  /** 入力画面で添付した外観の写真の URL。無ければ null（販売施策タブは既定の絵を出す） */
  exteriorImage: string | null;
  /** 競合の物件ID → その物件の番号（販売施策タブの競合の列から、その物件の販売戦略へ） */
  competitorLinks?: Record<string, CompetitorLink>;
  /** 比べる3列の1列目（この物件） */
  selfColumn?: SelfColumnView | null;
  /** 入力画面で添付した物件の画像の枠（サマリーのターゲットの絵の2枚目以降） */
  propertyImages?: ImageKind[];
}) {
  const [tab, setTab] = useState<ReportTab>("summary");
  const [selectedFact, setSelectedFact] = useState<string | null>(null);
  const byId = useMemo(() => new Map(facts.map((f) => [f.id, f])), [facts]);
  // AIの文に入った事実ID（［P-10］など）は、名前に置き換えるか外して出す（2026-11-04 浩平さん指摘）。DBの答えはそのまま
  // 「分からないこと」は、重要でない取れなかった事実（統計・乗降客数など）だけを挙げた項目を外す（lib/report.ts の unknownToShow）
  const result = useMemo(() => {
    const unknown = unknownToShow(saved.戦略.unknown, facts, usedFactIds(saved.戦略, saved.媒体));
    return { ...saved, 戦略: withPlainIds({ ...saved.戦略, unknown }, byId), 媒体: withPlainIds(saved.媒体, byId) };
  }, [saved, facts, byId]);
  const usage = useMemo(() => factUsage(result.戦略, result.媒体, (id, f) => mediaInfo[id]?.name ?? f), [result, mediaInfo]);

  // 画面のスクロールは main の中で起きるので、window ではなくタブの位置へ戻す
  const top = useRef<HTMLDivElement>(null);
  const nav = useMemo(() => {
    const toTop = () => top.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    return {
      goTab: (t: ReportTab) => {
        setTab(t);
        toTop();
      },
      openFact: (id: string) => {
        setSelectedFact(id);
        setTab("evidence");
        toTop();
      },
    };
  }, []);

  return (
    <ReportNav.Provider value={nav}>
      {/* sticky の要素は scrollIntoView で戻せないので、その上に目印を置く */}
      <div ref={top} className="scroll-mt-4" />
      <div className="sticky top-0 z-10 -mx-1 bg-canvas/95 px-1 pt-1 backdrop-blur print:hidden">
        <UnderlineTabs tabs={[...REPORT_TABS]} active={tab} onChange={(k) => setTab(k as ReportTab)} />
      </div>
      <Legend />
      {tab === "summary" && <SummaryTab r={result} facts={byId} factList={facts} propertyId={propertyId} runId={runId} areaMap={areaMap} areaPrice={areaPrice} propertyImages={propertyImages} />}
      {tab === "target" && <TargetTab r={result} facts={byId} />}
      {tab === "sales" && <SalesTab r={result} facts={byId} mediaInfo={mediaInfo} propertyId={propertyId} records={records} exteriorImage={exteriorImage} competitorLinks={competitorLinks} selfColumn={selfColumn} />}
      {tab === "price" && <PriceTab r={result} facts={byId} factList={facts} />}
      {tab === "area" && <AreaTab r={result} facts={byId} factList={facts} areaMap={areaMap} />}
      {tab === "evidence" && <EvidenceTab facts={facts} usage={usage} sources={sources} sheetCreatedAt={sheetCreatedAt} selected={selectedFact} onSelect={setSelectedFact} />}
      {/* ライセンス・利用規約で表示が要る文言だけを、短い段落にまとめて出す。地図のクレジットは、エリア分析に地図を出すとき（2026-11-03）だけ載せる */}
      <footer className="mt-6 grid gap-1.5 text-[12px] text-sub leading-relaxed">
        <p>{[...credits, ...FIXED_CREDITS.filter((c) => areaMap || !c.startsWith("地図："))].join("／")}</p>
        <p>このレポートは公開データと物件情報をもとにAIが作成した販売戦略の参考です。</p>
      </footer>
    </ReportNav.Provider>
  );
}
