"use client";

import type { StrategyResult } from "../../../../lib/agents/run";
import type { Fact } from "../../../../lib/facts/types";
import { AREA_CARDS, categoryOf, placeOfAnalysis } from "../../../../lib/report";
import { Badge, Card, Evidence, FactList, Fold, Lead } from "./parts";

// ⑤ エリア分析：人口・世帯／交通・生活／土地・災害／物件の競争力 の4枚のカード
// 各カードで、AIの見立て（分析の「買い手にとっての意味」「販売での使い方」）と、事実（システム・入力）を分けて出す
// 分析をどのカードに出すかは placeOfAnalysis（プログラム）で決める

export default function AreaTab({ r, facts, factList }: { r: StrategyResult; facts: Map<string, Fact>; factList: Fact[] }) {
  const analysis = r.戦略.analysis.map((a) => ({ a, place: placeOfAnalysis(a) }));

  return (
    <div className="grid gap-4">
      <Lead title="エリア分析の見方">
        <p className="text-[14px] text-body leading-relaxed">
          カードごとに、AIの見立てと、その元になった事実（公的データ・入力）を分けて出しています。災害は公的なハザードマップ等の値で、距離はすべて直線距離です。
        </p>
      </Lead>

      <div className="grid gap-4 lg:grid-cols-2">
        {AREA_CARDS.map((c) => {
          const items = analysis.filter((x) => x.place.tab === "area" && x.place.card === c.key).map((x) => x.a);
          const cardFacts = factList.filter((f) => c.categories.includes(categoryOf(f.id)!));
          const caution = cardFacts.filter((f) => f.状態 !== "取得").length;
          return (
            <Card key={c.key} title={c.title}>
              {items.length === 0 ? (
                <div className="text-[13px] text-sub">このカードに当たるAIの見立てはありません。</div>
              ) : (
                <ul className="grid gap-3">
                  {items.map((a, i) => (
                    <li key={i} className="grid gap-1 border-b border-divider pb-3 last:border-0 last:pb-0">
                      <div className="flex items-start gap-2">
                        <Badge kind="ai" />
                        <span className="text-[15px] text-ink leading-relaxed">{a.meaning}</span>
                      </div>
                      <div className="text-[13px] text-body leading-relaxed">
                        <span className="font-bold text-primary mr-1.5">販売での使い方</span>
                        {a.use}
                      </div>
                      <Evidence ids={a.evidence} facts={facts} />
                    </li>
                  ))}
                </ul>
              )}
              <Fold
                summary={
                  <>
                    事実 {cardFacts.length}件を見る{caution > 0 ? `（取得できず・要確認 ${caution}件）` : ""}
                  </>
                }
              >
                <FactList facts={cardFacts} />
              </Fold>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
