"use client";

import type { StrategyResult } from "../../../../lib/agents/run";
import type { Fact } from "../../../../lib/facts/types";
import { aspectLine, firstSentence, groupByAspect, placeOfAnalysis, TARGET_IMAGES } from "../../../../lib/report";
import { CheckIcon, ChatIcon, DatabaseIcon, HomeIcon, MegaphoneIcon, PinIcon, TargetIcon, UsersIcon, YenIcon } from "../../../_components/icons";
import { Ai, Card, Evidence, FactChip, HypothesisBadge, Num, useReportNav } from "./parts";

// ② ターゲット・訴求：狙う層（第一〜第三候補）、訴求ポイント、顧客への伝え方（組み合わせた見立て）
// 2026-11-04 浩平さん指摘「文字が多く認知的負荷が高い。なぜそのターゲットかを簡潔に」で組み直し：
//   候補を横に並べ、理由はAIの文の最初の1文だけを見せ（firstSentence。中身は変えず「。」で切るだけ）、
//   その下に「地域の特性・物件との合い方・買える見込み」の3つの観点を、根拠の事実の短い1行（aspectLine）で出す。説明の残りと根拠のチップは開いて見る
// 順位はAIの見立てで、需要データで確かめたものではないため「仮説」を付ける。観点の分け方は事実の分類で決める（groupByAspect）
// AIが3つより少なく返したときは、足りない枠に「候補なし」を出す（推測で埋めない）

const RANK_LABEL = ["第一候補", "第二候補", "第三候補", "第四候補", "第五候補"];
const ASPECT_ICON = { area: PinIcon, fit: HomeIcon, afford: YenIcon, buyer: UsersIcon, other: DatabaseIcon } as const;
const SLOTS = 3;

type Target = StrategyResult["戦略"]["targets"][number];

export default function TargetTab({ r, facts }: { r: StrategyResult; facts: Map<string, Fact> }) {
  const m = r.戦略;
  const targets = [...m.targets].sort((a, b) => a.rank - b.rank);
  const appeals = [...m.appeals].sort((a, b) => a.rank - b.rank).slice(0, 3);
  const combos = m.analysis.filter((a) => placeOfAnalysis(a).tab === "target");
  const empty = Math.max(0, SLOTS - targets.length);

  return (
    <div className="grid gap-4">
      <Card title="狙うターゲット" icon={TargetIcon} aside={<HypothesisBadge />}>
        <div className="mb-3 text-[12px] text-sub">順位はAIの見立てです。反響を見て見直してください。</div>
        <ol className="grid gap-3 lg:grid-cols-3">
          {targets.map((t) => (
            <TargetCard key={`${t.rank}-${t.name}`} t={t} facts={facts} />
          ))}
          {Array.from({ length: empty }, (_, i) => (
            <li key={`empty-${i}`} className="grid min-h-[100px] place-items-center rounded-lg border border-dashed border-line p-4 text-center">
              <div>
                <div className="text-[13px] font-bold text-sub">{RANK_LABEL[targets.length + i]}はありません</div>
                <div className="mt-1 text-[12px] text-muted">AIが、根拠のそろう候補はここまでと判断しました。</div>
              </div>
            </li>
          ))}
        </ol>
      </Card>

      <Card title="主な訴求ポイント" icon={MegaphoneIcon}>
        <ol className="grid gap-3 lg:grid-cols-3">
          {appeals.map((a, i) => (
            <li key={i} className="flex gap-2.5 rounded-lg border border-line p-3">
              <Num n={i + 1} strong={i === 0} />
              <div className="min-w-0">
                <Ai size="sm" strong>
                  {a.text}
                </Ai>
                <Evidence ids={a.evidence} facts={facts} max={0} />
              </div>
            </li>
          ))}
        </ol>
      </Card>

      <Card title="顧客への伝え方" icon={ChatIcon}>
        {combos.length === 0 ? (
          <div className="text-[13px] text-sub">組み合わせた見立てはありません。</div>
        ) : (
          <ul className={`grid gap-3 ${combos.length === 1 ? "" : combos.length === 2 ? "md:grid-cols-2" : "md:grid-cols-2 lg:grid-cols-3"}`}>
            {combos.map((a, i) => (
              <li key={i} className="min-w-0 rounded-lg border border-line p-3">
                <Ai size="sm">{a.use}</Ai>
                <details className="mt-1.5">
                  <summary className="cursor-pointer text-[12px] text-primary underline">買い手にとっての意味と根拠</summary>
                  <div className="mt-1.5 grid gap-1">
                    <Ai size="sm">{a.meaning}</Ai>
                    <Evidence ids={a.evidence} facts={facts} />
                  </div>
                </details>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

/** 候補1つ：絵・順位・名前・理由の一言・3つの観点。説明の残りと根拠のチップは開いて見る */
function TargetCard({ t, facts }: { t: Target; facts: Map<string, Fact> }) {
  const { openFact } = useReportNav();
  const main = t.rank === 1;
  const image = t.source !== "エージェント提案" ? TARGET_IMAGES[t.name] : undefined;
  const { head, rest } = firstSentence(t.reason);
  // 一覧では3つの観点だけ。「買い手の傾向」「その他」の根拠は「説明と根拠をすべて見る」で出す
  const groups = groupByAspect(t.evidence, facts).filter((g) => !g.optional);

  return (
    // 横幅が狭いあいだ（lg未満）は絵を左に置いた横長のカード、広いときは絵を上にして3つ並べる
    <li className={`flex min-w-0 flex-col overflow-hidden rounded-lg border sm:flex-row lg:flex-col ${main ? "border-primary/50 bg-primary-soft/25" : "border-line"}`}>
      {image ? (
        // eslint-disable-next-line @next/next/no-img-element -- public/ の絵をそのまま出す（next.config.ts で画像の最適化を止めている）
        <img src={image} alt={`${t.name}のイメージ`} className="aspect-[2/1] w-full shrink-0 border-b border-line object-cover object-[50%_70%] sm:aspect-auto sm:w-[34%] sm:border-b-0 sm:border-r lg:aspect-[2/1] lg:w-full lg:border-r-0 lg:border-b print:hidden" />
      ) : (
        <div className="grid aspect-[2/1] w-full shrink-0 place-items-center border-b border-line bg-primary-soft/40 text-primary sm:aspect-auto sm:w-[34%] sm:border-b-0 sm:border-r lg:aspect-[2/1] lg:w-full lg:border-r-0 lg:border-b print:hidden">
          <UsersIcon className="size-10" />
        </div>
      )}
      <div className="grid min-w-0 flex-1 content-start gap-2 p-3">
        <div>
          <span className={`rounded px-2 py-0.5 text-[12px] font-bold ${main ? "bg-primary text-white" : "bg-primary-soft text-primary"}`}>{RANK_LABEL[t.rank - 1] ?? `第${t.rank}候補`}</span>
          <div className="mt-1 text-[18px] font-bold leading-snug text-ink">{t.name}</div>
          {t.source === "エージェント提案" && <div className="text-[12px] text-sub">AIが加えた候補{t.definition ? `：${t.definition}` : ""}</div>}
        </div>

        <Ai size="sm" strong>
          {head}
        </Ai>

        {/* 選んだ理由の観点。根拠の事実を1つ短く出し、ほかは件数だけ。押すと根拠データで開く */}
        <ul className="grid gap-1">
          {groups.map((g) => {
            const Icon = ASPECT_ICON[g.key as keyof typeof ASPECT_ICON] ?? DatabaseIcon;
            const f = g.ids.map((id) => facts.get(id)).find((x): x is Fact => !!x);
            const line = f ? aspectLine(f) : null;
            return (
              <li key={g.key} className="grid grid-cols-[1rem_minmax(0,1fr)] items-start gap-x-1.5 text-[12px]">
                {g.ids.length > 0 ? <CheckIcon className="mt-0.5 size-3.5 text-[#157347]" /> : <span className="text-center text-muted">－</span>}
                <div className="min-w-0">
                  <span className="flex items-center gap-1 text-sub">
                    <Icon className="size-3.5 shrink-0" />
                    {g.title}
                    {g.ids.length > 1 && <span className="text-[11px] text-muted">（根拠{g.ids.length}件）</span>}
                  </span>
                  {line && f ? (
                    <button type="button" onClick={() => openFact(f.id)} className="block max-w-full cursor-pointer text-left text-[13px] text-ink hover:text-primary" title={`${line.label} ${line.value}`}>
                      <span className="line-clamp-2">
                        {line.label} <span className="font-bold">{line.value}</span>
                      </span>
                    </button>
                  ) : (
                    <span className="text-muted">根拠なし</span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>

        <details>
          <summary className="cursor-pointer text-[12px] text-primary underline print:hidden">説明と根拠をすべて見る</summary>
          <div className="mt-1.5 grid gap-1.5">
            {rest && <Ai size="sm">{rest}</Ai>}
            <div className="flex flex-wrap gap-1">
              {[...new Set(t.evidence.map((e) => e.trim()).filter(Boolean))].map((id) => (
                <FactChip key={id} id={id} f={facts.get(id)} />
              ))}
            </div>
          </div>
        </details>
      </div>
    </li>
  );
}
