"use client";

import type { StrategyResult } from "../../../../lib/agents/run";
import { vsNextOf } from "../../../../lib/agents/sales-focus";
import type { Fact } from "../../../../lib/facts/types";
import { baseTargets, firstSentence, groupByAspect, pickAspectFact, placeOfAnalysis, TARGET_IMAGES } from "../../../../lib/report";
import { AlertIcon, ChatIcon, DatabaseIcon, HomeIcon, MegaphoneIcon, PinIcon, TargetIcon, UsersIcon, YenIcon } from "../../../_components/icons";
import { Ai, Card, Evidence, FactChip, HypothesisBadge, Num, useReportNav } from "./parts";

// ② ターゲット・訴求：狙う層（第一〜第三候補）、訴求ポイント、顧客への伝え方（組み合わせた見立て）
// 2026-11-04 浩平さん指摘「文字が多く認知的負荷が高い。なぜそのターゲットかを簡潔に」で組み直し：
//   候補を横に並べ、理由はAIの文の最初の1文だけを見せ（firstSentence。中身は変えず「。」で切るだけ）、
//   その下に「地域の特性・物件との合い方・買える見込み」の3つの観点を、根拠の事実の短い1行（pickAspectFact・aspectLine）で出す。印は付けない（「検証済み」の印は使わない決まり）。説明の残りと根拠のチップは開いて見る
// 順位はAIの見立てで、需要データで確かめたものではないため「仮説」を付ける。観点の分け方は事実の分類で決める（groupByAspect）
// AIが3つより少なく返したときは、足りない枠に「候補なし」を出す（推測で埋めない）

const RANK_LABEL = ["第一候補", "第二候補", "第三候補", "第四候補", "第五候補"];
const ASPECT_ICON = { area: PinIcon, fit: HomeIcon, afford: YenIcon, buyer: UsersIcon, other: DatabaseIcon } as const;
const SLOTS = 3;

type Target = StrategyResult["戦略"]["targets"][number];

export default function TargetTab({ r, facts }: { r: StrategyResult; facts: Map<string, Fact> }) {
  const m = r.戦略;
  // 順位の数字ではなく並び順で「第一〜第三」と呼ぶ（点検で外れた候補があっても番号が飛ばない）。4つ目以降は出さない
  const targets = [...m.targets].sort((a, b) => a.rank - b.rank).slice(0, SLOTS);
  const appeals = [...m.appeals].sort((a, b) => a.rank - b.rank).slice(0, 3);
  const combos = m.analysis.filter((a) => placeOfAnalysis(a).tab === "target");
  const empty = Math.max(0, SLOTS - targets.length);

  return (
    <div className="grid gap-4">
      <Card title="ターゲット像" icon={TargetIcon} aside={<HypothesisBadge />} help={<BaseTargetsHelp facts={facts} />}>
        <div className="mb-3 text-[12px] text-sub">順位はAIの見立てです。反響を見て見直してください。</div>
        <ol className="grid gap-3 lg:grid-cols-3">
          {targets.map((t, i) => (
            <TargetCard key={`${t.rank}-${t.name}`} t={t} position={i} facts={facts} />
          ))}
          {Array.from({ length: empty }, (_, i) => (
            <li key={`empty-${i}`} className="grid min-h-[100px] place-items-center rounded-lg border border-dashed border-line p-4 text-center">
              <div>
                <div className="text-[13px] font-bold text-sub">{RANK_LABEL[targets.length + i]}はありません</div>
                <div className="mt-1 text-[12px] text-muted">この答えには、この順位の候補がありません。戦略を作り直してください。</div>
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
                <details className="mt-1.5 print:hidden">
                  <summary className="cursor-pointer text-[12px] text-primary underline">買い手にとっての意味と根拠</summary>
                  <div className="mt-1.5 grid gap-1">
                    <Ai size="sm">{a.meaning}</Ai>
                    <Evidence ids={a.evidence} facts={facts} />
                  </div>
                </details>
                <div className="mt-1.5 hidden gap-1 print:grid">
                  <Ai size="sm">{a.meaning}</Ai>
                  <Evidence ids={a.evidence} facts={facts} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

/** 候補1つ：絵・順位・名前・理由の一言・3つの観点。説明の残りと根拠のチップは開いて見る */
function TargetCard({ t, position, facts }: { t: Target; position: number; facts: Map<string, Fact> }) {
  const { openFact } = useReportNav();
  const main = position === 0;
  const image = t.source !== "エージェント提案" ? TARGET_IMAGES[t.name] : undefined;
  const { head, rest } = firstSentence(t.reason);
  const vsNext = vsNextOf(t);
  // 一覧では3つの観点だけ。「買い手の傾向」「その他」の根拠は「説明と根拠をすべて見る」で出す
  const groups = groupByAspect(t.evidence, facts).filter((g) => !g.optional);

  return (
    // 横幅が狭いあいだ（lg未満）は絵を左上に小さく置いた横長のカード、広いときは絵を上にして3つ並べる（絵は2:1のまま切らない）
    <li className={`flex min-w-0 flex-col overflow-hidden rounded-lg border sm:flex-row lg:flex-col ${main ? "border-primary/50 bg-primary-soft/25" : "border-line"}`}>
      {image ? (
        // eslint-disable-next-line @next/next/no-img-element -- public/ の絵をそのまま出す（next.config.ts で画像の最適化を止めている）
        <img src={image} alt={`${t.name}のイメージ`} className="aspect-[2/1] w-full shrink-0 border-b border-line bg-[#e3f0fd] object-cover sm:m-3 sm:mr-0 sm:w-[38%] sm:self-start sm:rounded-md sm:border lg:m-0 lg:w-full lg:rounded-none lg:border-0 lg:border-b print:hidden" />
      ) : (
        <div className="grid aspect-[2/1] w-full shrink-0 place-items-center border-b border-line bg-primary-soft/40 text-primary sm:m-3 sm:mr-0 sm:w-[38%] sm:self-start sm:rounded-md sm:border lg:m-0 lg:w-full lg:rounded-none lg:border-0 lg:border-b print:hidden">
          <UsersIcon className="size-10" />
        </div>
      )}
      <div className="grid min-w-0 flex-1 content-start gap-2 p-3">
        <div>
          <span className={`rounded px-2 py-0.5 text-[12px] font-bold ${main ? "bg-primary text-white" : "bg-primary-soft text-primary"}`}>{RANK_LABEL[position]}</span>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className="text-[18px] font-bold leading-snug text-ink">{t.name}</span>
            {/* 指示文で候補を必ず3つにしたので、根拠がそろわない候補は confidence「低」で来る（2026-11-04 浩平さん了承）。その候補だけに札を付ける */}
            {t.confidence === "低" && <span className="rounded bg-[#fdf1e7] px-1.5 py-0.5 text-[11px] font-bold text-accent">根拠が少ない</span>}
          </div>
          {t.source === "エージェント提案" && <div className="text-[12px] text-sub">AIが加えた候補{t.definition ? `：${t.definition}` : ""}</div>}
        </div>

        <Ai size="sm" strong>
          {head}
        </Ai>

        {/* 第一候補だけ：第二候補より上にした理由（2026-11-05〜。以前の答えには無い） */}
        {main && vsNext && (
          <div className="rounded-md bg-white/70 px-2.5 py-1.5 text-[12px]">
            <span className="text-sub">第二候補より上にした理由：</span>
            <span className="text-ink">{vsNext}</span>
          </div>
        )}

        {/* 選んだ理由の観点。根拠の事実を1つ短く出し、ほかは件数だけ。押すと根拠データで開く */}
        <ul className="grid gap-1">
          {groups.map((g) => {
            const Icon = ASPECT_ICON[g.key as keyof typeof ASPECT_ICON] ?? DatabaseIcon;
            // 事実シートにある根拠だけを数え、取れた事実を先に1つ短く出す。要確認・取得できずだけなら、その状態を注意の色で出す（lib/report.ts の pickAspectFact）
            const pick = pickAspectFact(g.ids, facts);
            return (
              <li key={g.key} className="min-w-0 text-[12px]">
                <span className="flex items-center gap-1 text-sub">
                  <Icon className="size-3.5 shrink-0" />
                  {g.title}
                  {pick && pick.count > 1 && <span className="text-[11px] text-muted">（根拠{pick.count}件）</span>}
                </span>
                {pick?.line ? (
                  <button
                    type="button"
                    onClick={() => openFact(pick.fact.id)}
                    className={`block max-w-full cursor-pointer pl-[1.125rem] text-left text-[13px] hover:text-primary ${pick.caution ? "text-accent" : "text-ink"}`}
                    title={`${pick.line.label} ${pick.line.value}`}
                  >
                    <span className="line-clamp-2">
                      {pick.caution && <AlertIcon className="mr-0.5 inline size-3.5 align-[-2px]" />}
                      {pick.line.label} <span className="font-bold">{pick.line.value}</span>
                    </span>
                  </button>
                ) : (
                  <span className="block pl-[1.125rem] text-muted">{pick ? `根拠${pick.count}件（下で見る）` : "根拠なし"}</span>
                )}
              </li>
            );
          })}
        </ul>

        <details className="print:hidden">
          <summary className="cursor-pointer text-[12px] text-primary underline">説明と根拠をすべて見る</summary>
          <More rest={rest} evidence={t.evidence} facts={facts} />
        </details>
        {/* 閉じた details は印刷されないので、印刷では残りの説明と根拠をそのまま出す */}
        <div className="hidden print:block">
          <More rest={rest} evidence={t.evidence} facts={facts} />
        </div>
      </div>
    </li>
  );
}

function More({ rest, evidence, facts }: { rest: string | null; evidence: string[]; facts: Map<string, Fact> }) {
  return (
    <div className="mt-1.5 grid gap-1.5">
      {rest && <Ai size="sm">{rest}</Ai>}
      <div className="flex flex-wrap gap-1">
        {[...new Set(evidence.map((e) => e.trim()).filter(Boolean))].map((id) => (
          <FactChip key={id} id={id} f={facts.get(id)} />
        ))}
      </div>
    </div>
  );
}

/** 「ターゲット像」の補足：登録済みの基本の6候補の概要（2026-11-06 浩平さん依頼）。AIはこの中から選び、合わない層が見えるときだけ候補を足す */
function BaseTargetsHelp({ facts }: { facts: Map<string, Fact> }) {
  const list = baseTargets([...facts.values()]);
  return (
    <span className="grid gap-1.5">
      <span>AIは、登録済みの次の6つから3つを選びます。当てはまらない層が事実から見えるときは、新しい候補を足すことがあります。</span>
      {list.map((t) => (
        <span key={t.name} className="block">
          <span className="font-bold">{t.name}</span>：{t.definition ?? "説明なし"}
        </span>
      ))}
    </span>
  );
}
