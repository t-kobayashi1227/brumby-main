"use client";

import Link from "next/link";
import type { StrategyResult } from "../../../../lib/agents/run";
import type { Fact } from "../../../../lib/facts/types";
import { placeOfAnalysis } from "../../../../lib/report";
import { AlertIcon, ChartIcon, ChatIcon, ClipboardIcon, DocIcon, MegaphoneIcon, PencilIcon, YenIcon } from "../../../_components/icons";
import { Ai, Card, Evidence, Num, useReportNav } from "./parts";
import MediaDonut, { MEDIA_COLORS } from "./MediaDonut";

// ③ 販売施策：方針 → 実行の流れ → 媒体（推奨の順） → 予算シミュレーション → 媒体の注意点
// 実行の流れは、保存済みの答え（訴求・媒体・伝え方）を4つの段にまとめ直しただけで、新しい中身はAIに作らせない。進み具合（完了など）は記録の仕組みが無いので出さない
// 配分（%）はAI（媒体担当）の見立てで、費用・反響の実績に基づかない。順位を主に見せ、%は小さく添える。円グラフは①で総額が入っているときだけ出す
// 金額は配分×総額をシステムが計算（lib/calc/budget.ts）

export interface MediaInfo {
  name: string;
  category: string;
}

const manYen = (n: number) => `${n.toFixed(1)}万円`;

export default function SalesTab({ r, facts, mediaInfo, propertyId }: { r: StrategyResult; facts: Map<string, Fact>; mediaInfo: Record<string, MediaInfo>; propertyId: number }) {
  const { goTab } = useReportNav();
  const m = r.戦略;
  const media = [...r.媒体.media].sort((a, b) => b.share - a.share);
  const sims = r.予算シミュレーション;
  const inputSim = sims.find((s) => s.isInput) ?? null;
  const nameOf = (id: string, fallback: string) => mediaInfo[id]?.name ?? fallback;
  const colorOf = (id: string) => MEDIA_COLORS[r.媒体.media.findIndex((x) => x.id === id) % MEDIA_COLORS.length];
  const appeals = [...m.appeals].sort((a, b) => a.rank - b.rank).slice(0, 3);
  const combo = m.analysis.find((a) => placeOfAnalysis(a).tab === "target");

  const steps: { icon: typeof DocIcon; title: string; body: React.ReactNode }[] = [
    {
      icon: DocIcon,
      title: "掲載の準備",
      body: (
        <>
          <div className="text-[12px] text-sub mb-1">訴求を掲載文と写真の軸にする</div>
          <ul className="grid gap-0.5 text-[13px] text-ink">
            {appeals.map((a, i) => (
              <li key={i} className="truncate" title={a.text}>
                ・{a.text}
              </li>
            ))}
          </ul>
        </>
      ),
    },
    {
      icon: MegaphoneIcon,
      title: "媒体に出す",
      body: (
        <>
          <div className="text-[12px] text-sub mb-1">推奨の順に出す</div>
          <div className="text-[13px] text-ink">{media.slice(0, 3).map((x) => nameOf(x.id, x.name)).join("・")}</div>
        </>
      ),
    },
    {
      icon: ChatIcon,
      title: "内見で伝える",
      body: (
        <>
          <div className="text-[12px] text-sub mb-1">顧客への伝え方</div>
          {combo ? (
            <div className="text-[13px] text-ink line-clamp-3">{combo.use}</div>
          ) : (
            <button type="button" onClick={() => goTab("target")} className="text-[13px] text-primary underline cursor-pointer">
              ターゲット・訴求タブを見る
            </button>
          )}
        </>
      ),
    },
    {
      icon: PencilIcon,
      title: "反響を記録して見直す",
      body: (
        <>
          <div className="text-[12px] text-sub mb-1">問い合わせ・内見の数を媒体ごとに残す</div>
          <Link href={`/records/${propertyId}`} className="text-[13px] text-primary underline">
            販売の記録を開く
          </Link>
        </>
      ),
    },
  ];

  return (
    <div className="grid gap-4">
      <Card title="販売施策の方針" icon={ClipboardIcon}>
        <Ai>{m.direction.text}</Ai>
        <Evidence ids={m.direction.evidence} facts={facts} />
      </Card>

      <Card title="実行の流れ" icon={ChartIcon}>
        <ol className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {steps.map((s, i) => (
            <li key={s.title} className="relative flex gap-2.5 rounded-lg border border-line p-3">
              <Num n={i + 1} strong={i === 0} />
              <div className="min-w-0">
                <div className="mb-1 flex items-center gap-1.5 text-[14px] font-bold text-ink">
                  <s.icon className="size-4 text-primary" />
                  {s.title}
                </div>
                {s.body}
              </div>
            </li>
          ))}
        </ol>
      </Card>

      <div className={`grid gap-4 ${inputSim ? "lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]" : ""}`}>
        <Card title="推奨する媒体" icon={MegaphoneIcon}>
          <ol className={`grid gap-2 ${inputSim ? "" : "md:grid-cols-2"}`}>
            {media.map((x, i) => (
              <li key={x.id} className="flex gap-2.5 rounded-lg border border-line p-3">
                <Num n={i + 1} strong={i === 0} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    <span className="text-[15px] font-bold text-ink">{nameOf(x.id, x.name)}</span>
                    <span className="rounded bg-subtle px-1.5 py-0.5 text-[11px] text-sub">{mediaInfo[x.id]?.category ?? "その他"}</span>
                    <span className="text-[12px] text-sub">
                      {x.purpose}・{x.target}
                    </span>
                    <span className="ml-auto text-[12px] text-sub" title="配分はAIの見立て（費用・反響の実績には基づかない）">
                      配分 {x.share}%
                    </span>
                  </div>
                  <div className="mt-1">
                    <Ai size="sm">{x.reason}</Ai>
                  </div>
                  <Evidence ids={x.evidence} facts={facts} max={2} />
                </div>
              </li>
            ))}
          </ol>
        </Card>

        {inputSim && (
          <Card title={`入力の予算 ${inputSim.totalManYen}万円の内訳`} icon={YenIcon}>
            <div className="flex flex-col items-center gap-3">
              <MediaDonut items={r.媒体.media.map((x) => ({ label: nameOf(x.id, x.name), share: x.share }))} totalManYen={inputSim.totalManYen} />
              <ul className="grid w-full gap-1 text-[13px]">
                {r.媒体.media.map((x) => (
                  <li key={x.id} className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 shrink-0 rounded-sm" style={{ background: colorOf(x.id) }} aria-hidden />
                    <span className="mr-auto text-ink">{nameOf(x.id, x.name)}</span>
                    <span className="font-bold text-ink">{manYen(inputSim.rows.find((row) => row.id === x.id)?.amountManYen ?? 0)}</span>
                  </li>
                ))}
              </ul>
            </div>
          </Card>
        )}
      </div>

      <Card title="予算シミュレーション" icon={YenIcon}>
        <div className="mb-3 grid gap-1 rounded-lg bg-subtle px-3 py-2 text-[12px] text-body">
          <div className="font-bold text-accent">参考の配分を示した試算です。正式な費用・見積もりではありません。</div>
          <div>計算：AIが決めた配分（%）× 総額。システムが0.1万円単位で計算しています。</div>
          <div>前提：媒体ごとの掲載料・最低料金、写真撮影などの制作費は入っていません（PoCでは費用の目安が空欄）。配分は反響の実績に基づかない暫定の値です。</div>
        </div>
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
              {media.map((x) => (
                <tr key={x.id} className="border-b border-canvas">
                  <td className="py-2 pr-2">{nameOf(x.id, x.name)}</td>
                  <td className="py-2 pr-2 text-right text-sub">{x.share}%</td>
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

      {r.媒体.cautions.length > 0 && (
        <Card title="媒体の注意点" icon={AlertIcon}>
          <ul className="grid gap-3">
            {r.媒体.cautions.map((c, i) => (
              <li key={i}>
                <Ai>{c.text}</Ai>
                <Evidence ids={c.evidence} facts={facts} />
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
