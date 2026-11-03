"use client";

import type { StrategyResult } from "../../../../lib/agents/run";
import type { Fact } from "../../../../lib/facts/types";
import { AREA_CARDS, categoryOf, placeOfAnalysis, type AreaCard } from "../../../../lib/report";
import { AlertIcon, BusIcon, HomeIcon, UsersIcon } from "../../../_components/icons";
import { Ai, Card, Evidence, FactTiles } from "./parts";

// ⑤ エリア分析：人口・世帯／交通・生活／土地・災害／物件の競争力 の4枚（2026-11-03 第2版）
// 先に事実を数字のタイルで見せ、その下にAIの見立てを短く添える。分析をどのカードに出すかは placeOfAnalysis（プログラム）で決める

const CARD_ICON: Record<AreaCard, (p: { className?: string }) => React.ReactElement> = {
  people: UsersIcon,
  living: BusIcon,
  land: AlertIcon,
  property: HomeIcon,
};

const CARD_NOTE: Partial<Record<AreaCard, string>> = {
  living: "距離はすべて直線距離です（道のりではありません）。",
  land: "物件の位置（1点）を公的データの区域に重ねた結果です。区域の境界に近いときは、ハザードマップで位置を確かめてください。",
};

export default function AreaTab({ r, facts, factList }: { r: StrategyResult; facts: Map<string, Fact>; factList: Fact[] }) {
  const analysis = r.戦略.analysis.map((a) => ({ a, place: placeOfAnalysis(a) }));

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {AREA_CARDS.map((c) => {
        const items = analysis.filter((x) => x.place.tab === "area" && x.place.card === c.key).map((x) => x.a);
        const cardFacts = factList.filter((f) => c.categories.includes(categoryOf(f.id)!));
        return (
          <Card key={c.key} title={c.title} icon={CARD_ICON[c.key]}>
            {CARD_NOTE[c.key] && <div className="mb-2 text-[12px] text-sub">{CARD_NOTE[c.key]}</div>}
            <FactTiles facts={cardFacts} initial={6} />
            {items.length > 0 && (
              <ul className="mt-3 grid gap-2.5 border-t border-divider pt-3">
                {items.map((a, i) => (
                  <li key={i}>
                    <Ai size="sm">{a.meaning}</Ai>
                    <div className="mt-0.5 pl-5 text-[13px] text-body">
                      <span className="font-bold text-primary mr-1.5">販売での使い方</span>
                      {a.use}
                    </div>
                    <div className="pl-5">
                      <Evidence ids={a.evidence} facts={facts} max={2} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        );
      })}
    </div>
  );
}
