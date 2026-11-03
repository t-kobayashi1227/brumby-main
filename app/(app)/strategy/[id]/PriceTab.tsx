"use client";

import type { StrategyResult } from "../../../../lib/agents/run";
import type { Fact } from "../../../../lib/facts/types";
import { categoryOf, placeOfAnalysis, unitPriceOf } from "../../../../lib/report";
import { AlertIcon, BuildingIcon, ChartIcon, ScaleIcon, SparkIcon, YenIcon } from "../../../_components/icons";
import { Ai, Card, Evidence, FactTiles } from "./parts";

// ④ 価格分析：システムが計算した相場との比較を主にし、AIの見方は添える形にする（2026-11-03 第2版）
// AIが付けた「割高・相場なみ・割安」「売れやすさ」のラベルは画面に出さない（DBには残る）。売れやすさは販売日数などのデータから出しておらず、
// 位置づけも坪単価の中央値1つとの比較なので、ラベルにすると断定に見えるため。代わりに比べた数字と条件をそのまま見せる
// 類似物件はポータルから集めない（プロジェクトのルール）。比べる物件は入力された競合物件だけ

export default function PriceTab({ r, facts, factList, priceManYen }: { r: StrategyResult; facts: Map<string, Fact>; factList: Fact[]; priceManYen: number }) {
  const pv = r.戦略.price_view;
  const market = factList.filter((f) => categoryOf(f.id) === "M");
  const competitors = factList.filter((f) => categoryOf(f.id) === "K");
  const analysis = r.戦略.analysis.filter((a) => placeOfAnalysis(a).tab === "price");

  // 坪単価と相場比（事実シートの値をそのまま読む。計算は事実シートを作るときに済んでいる）
  const unit = market.find((f) => f.項目.startsWith("延床の坪単価"));
  const ratio = market.find((f) => f.項目.startsWith("相場比"));
  const own = unitPriceOf(unit?.値);
  const med = unitPriceOf(unit?.比較);
  const condition = unit?.項目.match(/（(.+)）$/)?.[1];
  const countText = unit?.比較?.match(/（(\d+件)）/)?.[1];

  return (
    <div className="grid gap-4">
      <section className="rounded-[10px] border border-line bg-white p-5">
        <div className="mb-3 flex items-center gap-2">
          <span className="grid size-8 place-items-center rounded-lg bg-primary-soft text-primary">
            <ScaleIcon className="size-[18px]" />
          </span>
          <h2 className="text-[17px] font-bold text-ink">相場との比較</h2>
          <span className="text-[12px] text-sub">システムが公的データから計算</span>
        </div>
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.6fr)]">
          <Stat icon={<YenIcon className="size-5" />} label="現在価格" value={`${priceManYen.toLocaleString("ja-JP")}万円`} />
          <Stat
            icon={<ChartIcon className="size-5" />}
            label="延床の坪単価の比（物件÷中央値）"
            value={ratio?.値 ?? "取得できず"}
            note={ratio?.値 ? "1.00倍が中央値と同じ" : undefined}
            warn={!ratio?.値}
          />
          <div className="rounded-lg border border-line p-3">
            <div className="text-[12px] text-sub">延床の坪単価</div>
            {own !== null && med !== null ? <UnitBar own={own} med={med} /> : <div className="mt-1 text-[14px] text-accent">相場の中央値が出せていません</div>}
          </div>
        </div>
        <div className="mt-3 grid gap-1 rounded-lg bg-subtle px-3 py-2 text-[12px] text-body">
          <div>
            <span className="font-bold">比べた条件：</span>
            {condition ?? "―"}
            {unit && `／期間 ${unit.時点}`}
            {countText && `／${countText}の取引`}
            {unit && `／出典 ${unit.出典}`}
          </div>
          <div>延床の坪単価（価格÷延床面積）での比較です。土地の広さ・築年数の細かな差・リフォームの有無は入っていません。中央値だけで割高・割安と決めず、条件の近い取引で確かめてください。</div>
          <div>周辺の取引と比べた目安であり、価格の査定や保証ではありません。</div>
        </div>
      </section>

      <Card title="AIの見方" icon={SparkIcon}>
        <Ai>{pv.text}</Ai>
        <Evidence ids={pv.evidence} facts={facts} />
        {analysis.map((a, i) => (
          <div key={i} className="mt-3 border-t border-divider pt-3">
            <Ai size="sm">{a.meaning}</Ai>
            <div className="mt-1 pl-5 text-[13px] text-body">
              <span className="font-bold text-primary mr-1.5">販売での使い方</span>
              {a.use}
            </div>
            <div className="pl-5">
              <Evidence ids={a.evidence} facts={facts} />
            </div>
          </div>
        ))}
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="相場の事実" icon={ChartIcon}>
          <FactTiles facts={market} initial={6} empty="相場の事実はありません。" />
        </Card>
        <Card title="競合物件との比較" icon={BuildingIcon}>
          <div className="mb-2 text-[12px] text-sub">物件の登録で入力された競合物件です。差はシステムが計算しています。1件だけでは価格の妥当性は判断できないので、近い条件の物件を複数入れてください。</div>
          <FactTiles facts={competitors} cols="" empty="競合物件の入力はありません。物件情報の画面で入力すると、ここに比較が出ます。" />
        </Card>
      </div>
    </div>
  );
}

function Stat({ icon, label, value, note, warn = false }: { icon: React.ReactNode; label: string; value: string; note?: string; warn?: boolean }) {
  return (
    <div className="rounded-lg border border-line p-3">
      <div className="flex items-center gap-1.5 text-[12px] text-sub">
        <span className={warn ? "text-accent" : "text-primary"}>{warn ? <AlertIcon className="size-4" /> : icon}</span>
        {label}
      </div>
      <div className={`mt-1 text-[22px] font-bold ${warn ? "text-accent" : "text-ink"}`}>{value}</div>
      {note && <div className="text-[11px] text-sub">{note}</div>}
    </div>
  );
}

/** 物件と中央値の坪単価を、横棒2本で比べる */
function UnitBar({ own, med }: { own: number; med: number }) {
  const max = Math.max(own, med) * 1.1;
  const rows = [
    { label: "物件", v: own, color: "bg-primary" },
    { label: "中央値", v: med, color: "bg-chart" },
  ];
  return (
    <div className="mt-2 grid gap-1.5">
      {rows.map((x) => (
        <div key={x.label} className="grid grid-cols-[3.5em_minmax(0,1fr)_6.5em] items-center gap-2 text-[12px]">
          <span className="text-sub">{x.label}</span>
          <span className="h-3 rounded-full bg-divider">
            <span className={`block h-3 rounded-full ${x.color}`} style={{ width: `${(x.v / max) * 100}%` }} />
          </span>
          <span className="text-right font-bold text-ink">{x.v.toFixed(1)}万円/坪</span>
        </div>
      ))}
    </div>
  );
}
