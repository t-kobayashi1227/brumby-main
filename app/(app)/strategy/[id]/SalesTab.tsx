"use client";

import type { StrategyResult } from "../../../../lib/agents/run";
import type { Fact } from "../../../../lib/facts/types";
import { Badge, Card, Evidence, Lead, Text } from "./parts";
import MediaDonut, { MEDIA_COLORS } from "./MediaDonut";

// ③ 販売施策：販売の方向性、媒体（媒体一覧の分類でまとめる）、配分と予算シミュレーション、媒体の注意点
// 配分（%）はAI（媒体担当）、金額は配分×総額をシステムが計算（lib/calc/budget.ts）
// 「優先掲載／追加検証」のような区分はAIに新たに付けさせることになるので使わず、媒体一覧マスタの分類でまとめる
// 実行計画の進み具合や運用ルール（停止条件など）は、記録する仕組みとBRUMBY様のルールが無いので出さない

export interface MediaInfo {
  name: string;
  category: string;
}

const manYen = (n: number) => `${n.toFixed(1)}万円`;

export default function SalesTab({ r, facts, mediaInfo }: { r: StrategyResult; facts: Map<string, Fact>; mediaInfo: Record<string, MediaInfo> }) {
  const m = r.戦略;
  const media = r.媒体;
  const sims = r.予算シミュレーション;
  const inputSim = sims.find((s) => s.isInput) ?? null;
  const nameOf = (id: string, fallback: string) => mediaInfo[id]?.name ?? fallback;
  const colorOf = (id: string) => MEDIA_COLORS[media.media.findIndex((x) => x.id === id) % MEDIA_COLORS.length];

  // 媒体一覧の分類ごとにまとめる（並びは配分の大きい分類から）
  const groups = new Map<string, typeof media.media>();
  for (const x of media.media) {
    const cat = mediaInfo[x.id]?.category ?? "その他";
    groups.set(cat, [...(groups.get(cat) ?? []), x]);
  }
  const groupList = [...groups.entries()]
    .map(([category, items]) => ({ category, items, share: items.reduce((s, x) => s + x.share, 0) }))
    .sort((a, b) => b.share - a.share);

  return (
    <div className="grid gap-4">
      <Lead title="販売施策の方針" badge={<Badge kind="ai" />}>
        <Text>{m.direction.text}</Text>
        <Evidence ids={m.direction.evidence} facts={facts} />
      </Lead>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <Card title="販売チャネル" badge={<Badge kind="ai" />}>
          <div className="grid gap-4">
            {groupList.map((g) => (
              <div key={g.category}>
                <div className="mb-1.5 flex items-center gap-2 text-[13px] text-sub">
                  <span className="font-bold text-ink">{g.category}</span>
                  <span>配分 計{g.share}%</span>
                </div>
                <ul className="grid gap-2">
                  {g.items.map((x) => (
                    <li key={x.id} className="rounded-lg border border-line p-3">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="w-2.5 h-2.5 shrink-0 rounded-sm" style={{ background: colorOf(x.id) }} aria-hidden />
                        <span className="text-[15px] font-bold text-ink">{nameOf(x.id, x.name)}</span>
                        <span className="text-[12px] text-sub">{x.purpose}・{x.target}</span>
                        <span className="ml-auto text-[14px] font-bold text-ink">{x.share}%</span>
                      </div>
                      <p className="mt-1 text-[14px] text-body leading-relaxed">{x.reason}</p>
                      {x.share_reason && <p className="mt-0.5 text-[12px] text-sub leading-relaxed">配分の理由：{x.share_reason}</p>}
                      <Evidence ids={x.evidence} facts={facts} />
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </Card>

        <Card title="配分" badge={<Badge kind="ai">配分はAIの見立て</Badge>}>
          <div className="flex flex-col items-center gap-3">
            <MediaDonut items={media.media.map((x) => ({ label: nameOf(x.id, x.name), share: x.share }))} totalManYen={inputSim?.totalManYen ?? null} />
            <ul className="grid w-full gap-1 text-[13px]">
              {media.media.map((x) => (
                <li key={x.id} className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 shrink-0 rounded-sm" style={{ background: colorOf(x.id) }} aria-hidden />
                  <span className="mr-auto text-ink">{nameOf(x.id, x.name)}</span>
                  <span className="font-bold text-ink">{x.share}%</span>
                </li>
              ))}
            </ul>
            <div className="text-[12px] text-sub leading-relaxed">PoCでは媒体の費用の目安と反響の実績がないため、ターゲットへの届きやすさだけで決めた暫定の配分です。販売の記録がたまったら見直します。</div>
          </div>
        </Card>
      </div>

      <Card title="予算シミュレーション" badge={<Badge kind="system">システム計算</Badge>}>
        <div className="text-[14px] text-accent mb-2">参考の配分を示した試算です。正式な費用・見積もりではありません。</div>
        <div className="overflow-x-auto">
          <table className="w-full text-[14px] text-ink border-collapse">
            <thead>
              <tr className="text-sub border-b border-line">
                <th className="py-2 pr-2 font-normal text-left">媒体</th>
                <th className="py-2 pr-2 font-normal text-right">配分</th>
                {sims.map((s) => (
                  <th key={`${s.totalManYen}-${s.isInput}`} className="py-2 pr-2 font-normal text-right whitespace-nowrap">
                    {s.totalManYen}万円{s.isInput ? "（入力の総額）" : ""}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {media.media.map((x) => (
                <tr key={x.id} className="border-b border-canvas">
                  <td className="py-2 pr-2">{nameOf(x.id, x.name)}</td>
                  <td className="py-2 pr-2 text-right">{x.share}%</td>
                  {sims.map((s) => (
                    <td key={`${s.totalManYen}-${s.isInput}`} className="py-2 pr-2 text-right whitespace-nowrap">
                      {manYen(s.rows.find((row) => row.id === x.id)?.amountManYen ?? 0)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {media.cautions.length > 0 && (
        <Card title="媒体の注意点" badge={<Badge kind="ai" />}>
          <ul className="grid gap-3">
            {media.cautions.map((c, i) => (
              <li key={i} className="flex gap-2.5">
                <span className="mt-1.5 w-2 h-2 shrink-0 rounded-full bg-accent" aria-hidden />
                <div className="min-w-0">
                  <Text>{c.text}</Text>
                  <Evidence ids={c.evidence} facts={facts} />
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
