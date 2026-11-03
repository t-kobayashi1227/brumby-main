"use client";

import type { StrategyResult } from "../../../../lib/agents/run";
import type { Fact } from "../../../../lib/facts/types";
import { categoryOf, placeOfAnalysis } from "../../../../lib/report";
import { Badge, Card, Evidence, FactList, Lead, Text } from "./parts";

// ④ 価格分析：価格の見方（AI）と、相場（M）・入力された競合物件（K）の事実（システム）を分けて出す
// 類似物件はポータルから集めない（プロジェクトのルール）。比べる物件は、入力された競合物件だけを出す
// 価格を維持・調整する金額の目安はAIに作らせない

export default function PriceTab({ r, facts, factList, priceManYen }: { r: StrategyResult; facts: Map<string, Fact>; factList: Fact[]; priceManYen: number }) {
  const pv = r.戦略.price_view;
  const market = factList.filter((f) => categoryOf(f.id) === "M");
  const competitors = factList.filter((f) => categoryOf(f.id) === "K");
  const analysis = r.戦略.analysis.filter((a) => placeOfAnalysis(a).tab === "price");

  return (
    <div className="grid gap-4">
      <Lead
        title="価格の見方"
        badge={<Badge kind="ai" />}
        side={
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-lg border border-line p-2.5">
              <div className="text-[12px] text-sub">現在価格</div>
              <div className="mt-1 text-[18px] font-bold text-primary whitespace-nowrap">{priceManYen.toLocaleString("ja-JP")}万円</div>
            </div>
            <div className="rounded-lg border border-line p-2.5">
              <div className="text-[12px] text-sub">相場との位置</div>
              <div className="mt-1 text-[16px] font-bold text-ink">{pv.position}</div>
            </div>
            <div className="rounded-lg border border-line p-2.5">
              <div className="text-[12px] text-sub">売れやすさ</div>
              <div className="mt-1 text-[16px] font-bold text-ink">{pv.sellability}</div>
            </div>
          </div>
        }
      >
        <Text>{pv.text}</Text>
        <Evidence ids={pv.evidence} facts={facts} />
        <div className="mt-3 grid gap-1 text-[12px] text-sub">
          <div>周辺の取引と比べた目安であり、価格の査定や保証ではありません。</div>
          <div>中央値だけで割高・割安と決めず、場所・広さ・築年数・リフォームなどの条件をそろえて確かめてください。</div>
        </div>
      </Lead>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="相場との比較" badge={<Badge kind="system" />}>
          <div className="mb-2 text-[12px] text-sub">国土交通省の不動産取引価格情報などから、システムが計算した値です。</div>
          <FactList facts={market} empty="相場の事実はありません。" />
        </Card>

        <Card title="競合物件との比較" badge={<Badge kind="input" />}>
          <div className="mb-2 text-[12px] text-sub">物件の登録で入力された競合物件です。差はシステムが計算しています。</div>
          <FactList facts={competitors} empty="競合物件の入力はありません。物件情報の画面で入力すると、ここに比較が出ます。" />
        </Card>
      </div>

      {analysis.length > 0 && (
        <Card title="価格についての分析" badge={<Badge kind="ai" />}>
          <ul className="grid gap-3">
            {analysis.map((a, i) => (
              <li key={i} className="grid gap-1">
                <div className="text-[13px] text-sub">事実：{a.fact}</div>
                <div>
                  <span className="text-[12px] font-bold text-primary mr-1.5">買い手にとって</span>
                  <span className="text-[15px] text-ink leading-relaxed">{a.meaning}</span>
                </div>
                <div>
                  <span className="text-[12px] font-bold text-primary mr-1.5">販売での使い方</span>
                  <span className="text-[15px] text-ink leading-relaxed">{a.use}</span>
                </div>
                <Evidence ids={a.evidence} facts={facts} />
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
