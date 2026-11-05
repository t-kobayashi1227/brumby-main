"use client";

import Link from "next/link";
import { useState } from "react";
import type { StrategyResult } from "../../../../lib/agents/run";
import type { Fact } from "../../../../lib/facts/types";
import { SALE_STATUS_LABEL, SALE_STATUSES, grandTotal, type MediaResultTotal, type PartialSum } from "../../../../lib/records";
import { defaultBudgetIndex, groupMedia, MEDIA_NOTES, placeOfAnalysis, PORTAL_CATEGORY, PORTAL_DIFF_NOTE, type DisplayMedia } from "../../../../lib/report";
import { AlertIcon, ChartIcon, ClipboardIcon, MegaphoneIcon, SparkIcon } from "../../../_components/icons";
import CompetitorCompare from "./CompetitorCompare";
import { Ai, Card, Evidence, HypothesisBadge, InfoTip, Num, useReportNav } from "./parts";

// ③ 販売施策（2026-11-04 浩平さんの依頼で、B案「実行の流れ」を軸に作り直し。構成案は Claude Doc「販売施策タブの構成案」）
//   方針と4つの要点 → 競合と比べたおすすめポイントと懸念点（2026-11-05） → 掲載前に確かめること → 実行の4ステップ → 媒体の順位と配分（予算を切り替えて金額） → 販売記録の実績
// 画面では AI を動かさず、保存済みの答え（方針・訴求・媒体・伝え方・注意点）を並べ直すだけ。新しい中身はAIに作らせない
// 出さないもの：問い合わせ見込み・想定反響・成約までの期間・「推奨」の予算（根拠のある数字が無い）、予算ごとに媒体が変わるプラン
//   （今の試算は同じ配分×総額。媒体の最低料金・相性表をいただいてから）、保存しないチェックリスト（進み具合を記録する仕組みが無い）、円グラフ
// 配分（%）はAI（媒体担当）の暫定の見立て。金額は配分×総額をシステムが計算（lib/calc/budget.ts）
// 実績は販売記録の画面で入れた値を、システムが媒体ごとに足しただけ（lib/records.ts の totalsByMedia）

export interface MediaInfo {
  name: string;
  category: string;
  /** 媒体一覧の「主な目的」「届きやすい年代（見立て）」。「i」の補足に出す */
  purpose?: string;
  reachAges?: string;
}

/** 販売記録の画面で入れた値（page.tsx で読む）。記録が無ければ status は null、totals は空 */
export interface SalesRecords {
  status: string | null;
  listedOn: string | null;
  totals: MediaResultTotal[];
}

const manYen = (n: number) => `${n.toFixed(1)}万円`;

// 販売記録の一覧（app/(app)/records/page.tsx）の色にそろえる
const STATUS_BADGE: Record<string, string> = {
  販売前: "bg-[#f1f3f6] text-muted",
  販売中: "bg-primary-soft text-primary",
  成約: "bg-[#e9f8ec] text-[#157347]",
  販売中止: "bg-[#eceef2] text-[#5b6476]",
};

export default function SalesTab({
  r,
  facts,
  mediaInfo,
  propertyId,
  records,
  exteriorImage,
  competitorLinks,
}: {
  r: StrategyResult;
  facts: Map<string, Fact>;
  mediaInfo: Record<string, MediaInfo>;
  propertyId: number;
  records: SalesRecords;
  /** 添付した外観の写真。あれば方針の右の絵の代わりに出す（2026-11-05 浩平さん依頼）。無ければ既定の絵 */
  exteriorImage: string | null;
  /** 競合の物件ID → その物件の番号（競合の販売戦略へのリンク） */
  competitorLinks: Record<string, number>;
}) {
  const m = r.戦略;
  // 不動産ポータル（SUUMO・アットホームなど）は1行にまとめる（2026-11-04 浩平さん指摘。lib/report.ts の groupMedia）
  const media = groupMedia(r.媒体.media, (id) => mediaInfo[id]);
  const sims = r.予算シミュレーション;
  const inputSim = sims.find((s) => s.isInput) ?? null;
  const appeals = [...m.appeals].sort((a, b) => a.rank - b.rank).slice(0, 3);
  const main = [...m.targets].sort((a, b) => a.rank - b.rank)[0];
  const first = media[0];

  const tiles: { label: string; value: React.ReactNode; sub?: React.ReactNode }[] = [
    { label: "メインの買い手", value: main ? main.name : "未設定", sub: main ? <HypothesisBadge /> : undefined },
    // 媒体の目的と訴求はAIの文なので ✦ を付ける（事実と見分ける決まり）
    {
      label: "最初に出す媒体",
      value: first ? first.name : "未設定",
      sub: first ? (
        <span className="flex gap-1 text-[12px] text-sub">
          <SparkIcon className="mt-0.5 size-3 shrink-0 text-[#6b4fc0]" />
          <span className="min-w-0">{first.purpose}</span>
        </span>
      ) : undefined,
    },
    {
      label: "掲載の軸にする訴求",
      value: appeals[0] ? (
        <span className="flex gap-1 text-[14px]">
          <SparkIcon className="mt-1 size-3 shrink-0 text-[#6b4fc0]" />
          <span className="min-w-0">{appeals[0].text}</span>
        </span>
      ) : (
        "未設定"
      ),
    },
    {
      label: "予算の前提",
      value: inputSim ? `${inputSim.totalManYen}万円` : "未入力",
      sub: <span className="text-[12px] text-sub">{inputSim ? "物件情報で入れた総額" : "下の試算は20万円で表示（切り替え可）"}</span>,
    },
  ];

  return (
    <div className="grid gap-4">
      {/* 方針と4つの要点 */}
      <section className="overflow-hidden rounded-[10px] border border-line bg-white">
        <div className="grid md:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
          <div className="min-w-0 p-5">
            <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="grid size-8 place-items-center rounded-lg bg-primary-soft text-primary">
                <ClipboardIcon className="size-[18px]" />
              </span>
              <h2 className="text-[17px] font-bold text-ink">販売施策の方針</h2>
              <span className="text-[12px] text-sub">掲載の準備から見直しまで、下の順に進めます。</span>
            </div>
            <Ai>{m.direction.text}</Ai>
            <Evidence ids={m.direction.evidence} facts={facts} />
            <dl className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {tiles.map((t) => (
                <div key={t.label} className="min-w-0 rounded-lg border border-line bg-subtle/60 px-3 py-2">
                  <dt className="text-[11px] text-sub">{t.label}</dt>
                  <dd className="mt-0.5 text-[15px] font-bold leading-snug text-ink break-words">{t.value}</dd>
                  {t.sub && <dd className="mt-0.5">{t.sub}</dd>}
                </div>
              ))}
            </dl>
          </div>
          {/* 外観の写真を添付していればそれを、無ければ既定の絵を出す。eslint-disable-next-line は画像の最適化を止めているため（next.config.ts） */}
          {exteriorImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={exteriorImage} alt="外観の写真" className="hidden h-full min-h-[220px] w-full bg-subtle object-cover md:block print:hidden" />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src="/sales/house.webp" alt="" aria-hidden className="hidden h-full min-h-[220px] w-full object-cover md:block print:hidden" />
          )}
        </div>
      </section>

      {/* 競合と比べたおすすめポイントと懸念点、競合ごとの列（2026-11-05 浩平さん依頼。掲載前に確かめることの上） */}
      <CompetitorCompare strategy={m} facts={facts} propertyId={propertyId} competitorLinks={competitorLinks} />

      {/* 掲載前に確かめること（媒体担当の注意点）。対策案（action）は出さない決まり（懸念点と同じ） */}
      {r.媒体.cautions.length > 0 && (
        <Card title="掲載前に確かめること" icon={AlertIcon}>
          <ul className="grid gap-2">
            {r.媒体.cautions.map((c, i) => (
              <li key={i} className="rounded-lg border border-[#f3d9a6] bg-[#fffaf0] px-3 py-2">
                <Ai size="sm">{c.text}</Ai>
                <Evidence ids={c.evidence} facts={facts} max={2} />
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Steps r={r} appeals={appeals} media={media} propertyId={propertyId} records={records} />

      <MediaPlan key={sims.map((s) => `${s.totalManYen}${s.isInput ? "i" : ""}`).join(",")} media={media} sims={sims} mediaInfo={mediaInfo} facts={facts} />

      <RecordResults records={records} propertyId={propertyId} />
    </div>
  );
}

/** 実行の4ステップ。表示だけで、進み具合（済み・未）は記録の仕組みが無いので出さない */
function Steps({
  r,
  appeals,
  media,
  propertyId,
  records,
}: {
  r: StrategyResult;
  appeals: StrategyResult["戦略"]["appeals"];
  media: DisplayMedia[];
  propertyId: number;
  records: SalesRecords;
}) {
  const { goTab } = useReportNav();
  const combo = r.戦略.analysis.find((a) => placeOfAnalysis(a).tab === "target");
  const recorded = grandTotal(records.totals);

  const steps: { image: string; title: string; lead: string; body: React.ReactNode }[] = [
    {
      image: "/sales/prepare.webp",
      title: "掲載の準備",
      lead: "写真と掲載文の軸にする訴求",
      body: (
        <ul className="grid gap-1">
          {appeals.map((a, i) => (
            <li key={i}>
              <Ai size="sm">{a.text}</Ai>
            </li>
          ))}
        </ul>
      ),
    },
    {
      image: "/sales/listing.webp",
      title: "媒体に掲載する",
      lead: "順位の高い媒体から出す",
      body: (
        <ol className="grid gap-1 text-[13px] text-ink">
          {media.slice(0, 3).map((x, i) => (
            <li key={x.key} className="flex items-center gap-1.5">
              <Num n={i + 1} strong={i === 0} />
              <span className="min-w-0 break-words">{x.name}</span>
            </li>
          ))}
        </ol>
      ),
    },
    {
      image: "/sales/viewing.webp",
      title: "内見で伝える",
      lead: "買い手への伝え方",
      body: combo ? (
        <Ai size="sm">{combo.use}</Ai>
      ) : (
        <button type="button" onClick={() => goTab("target")} className="text-[13px] text-primary underline cursor-pointer">
          ターゲット・訴求タブを見る
        </button>
      ),
    },
    {
      image: "/sales/review.webp",
      title: "反響を記録して見直す",
      lead: "問い合わせ・内見の数を媒体ごとに残す",
      body: (
        <div className="grid gap-1 text-[13px]">
          {records.totals.length > 0 && (
            <div className="text-ink">
              記録のある媒体 {records.totals.length}つ
              {recorded.inquiries.sum !== null && `・問い合わせ ${recorded.inquiries.sum}件${recorded.inquiries.partial ? "（一部不明）" : ""}`}
            </div>
          )}
          <Link href={`/records/${propertyId}`} className="text-primary underline">
            販売記録を開く
          </Link>
        </div>
      ),
    },
  ];

  return (
    <Card title="実行の4ステップ" icon={ChartIcon}>
      <ol className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {steps.map((s, i) => (
          <li key={s.title} className="flex min-w-0 flex-col overflow-hidden rounded-lg border border-line">
            {/* eslint-disable-next-line @next/next/no-img-element -- public/ の絵をそのまま出す（next.config.ts で画像の最適化を止めている） */}
            <img src={s.image} alt="" aria-hidden className="aspect-[16/9] w-full border-b border-line object-cover print:hidden" />
            <div className="min-w-0 p-3">
              <div className="mb-1 flex items-center gap-2">
                <Num n={i + 1} strong={i === 0} />
                <span className="text-[14px] font-bold text-ink">{s.title}</span>
              </div>
              <div className="mb-1.5 text-[12px] text-sub">{s.lead}</div>
              {s.body}
            </div>
          </li>
        ))}
      </ol>
    </Card>
  );
}

/** 媒体の順位と配分。予算を切り替えると、その総額での金額（システムの計算）を出す */
function MediaPlan({
  media,
  sims,
  mediaInfo,
  facts,
}: {
  media: DisplayMedia[];
  sims: StrategyResult["予算シミュレーション"];
  mediaInfo: Record<string, MediaInfo>;
  facts: Map<string, Fact>;
}) {
  const [picked, setPicked] = useState(() => defaultBudgetIndex(sims));
  const sim = sims[picked] ?? null;
  // まとめた行（不動産ポータル）は、元の媒体ごとの金額を足す。0.1万円単位の誤差が出ないよう10倍して整数で足す
  const amountOf = (ids: string[]) => ids.reduce((a, id) => a + Math.round((sim?.rows.find((row) => row.id === id)?.amountManYen ?? 0) * 10), 0) / 10;

  // ①の総額が10万・20万・30万円と同じときは、同じ金額の切り替えを2つ出さない
  const inputTotal = sims.find((s) => s.isInput)?.totalManYen;
  const choices = sims.map((s, i) => ({ s, i })).filter(({ s }) => s.isInput || s.totalManYen !== inputTotal);
  const toggle =
    sims.length > 0 ? (
      <div role="group" aria-label="予算の総額" className="flex flex-wrap gap-1 print:hidden">
        {choices.map(({ s, i }) => (
          <button
            key={`${s.totalManYen}-${s.isInput}`}
            type="button"
            onClick={() => setPicked(i)}
            aria-pressed={i === picked}
            className={`rounded-full border px-3 py-1 text-[12px] cursor-pointer ${i === picked ? "border-primary bg-primary text-white" : "border-line bg-white text-body hover:bg-subtle"}`}
          >
            {s.isInput ? `物件情報の総額 ${s.totalManYen}万円` : `${s.totalManYen}万円`}
          </button>
        ))}
      </div>
    ) : undefined;

  return (
    <Card title="媒体の順位と配分" icon={MegaphoneIcon} aside={toggle} help={<PlanHelp />} className="print:[print-color-adjust:exact]">
      <div className="mb-3 grid gap-0.5 rounded-lg bg-subtle px-3 py-2 text-[12px] text-body">
        <div className="font-bold text-accent">参考の配分を示した試算です。正式な費用・見積もりではありません。</div>
        <div>配分はAIの暫定の見立てで、費用・反響の実績には基づきません。金額は、配分（%）×総額をシステムが0.1万円単位で計算しています。媒体の掲載料・最低料金、写真撮影などの制作費は入っていません。</div>
        {sim && <div className="hidden print:block">試算の総額：{sim.totalManYen}万円{sim.isInput ? "（物件情報の総額）" : ""}</div>}
      </div>
      <ol className="grid gap-2">
        {media.map((x, i) => (
          <li key={x.key} className="rounded-lg border border-line p-3">
            <div className="flex gap-2.5">
              <Num n={i + 1} strong={i === 0} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  <span className="inline-flex items-center gap-0.5">
                    <span className="text-[15px] font-bold text-ink">{x.name}</span>
                    <InfoTip label={`${x.name}の特徴`}>
                      <MediaHelp x={x} mediaInfo={mediaInfo} />
                    </InfoTip>
                  </span>
                  {x.category !== PORTAL_CATEGORY && <span className="rounded bg-subtle px-1.5 py-0.5 text-[11px] text-sub">{x.category ?? "その他"}</span>}
                  <span className="flex min-w-0 items-center gap-1 text-[12px] text-sub">
                    <SparkIcon className="size-3 shrink-0 text-[#6b4fc0]" />
                    <span className="min-w-0 break-words">
                      {x.purpose}・{x.target}
                    </span>
                  </span>
                </div>
                <div className="mt-2 flex items-center gap-3">
                  <div className="h-2.5 min-w-0 flex-1 overflow-hidden rounded-full bg-subtle" aria-hidden>
                    <div className={`h-full rounded-full ${i === 0 ? "bg-primary" : "bg-primary/55"}`} style={{ width: `${Math.max(0, Math.min(100, x.share))}%` }} />
                  </div>
                  <span className="w-[3.2em] shrink-0 text-right text-[12px] text-sub">{x.share}%</span>
                  {sim && <span className="w-[5.5em] shrink-0 text-right text-[14px] font-bold text-ink">{manYen(amountOf(x.ids))}</span>}
                </div>
                <details className="mt-1.5 print:hidden">
                  <summary className="cursor-pointer text-[12px] text-primary underline">理由を見る</summary>
                  <Reasons x={x} facts={facts} />
                </details>
                {/* 閉じた details は印刷されないので、印刷では理由をそのまま出す */}
                <div className="hidden print:block">
                  <Reasons x={x} facts={facts} />
                </div>
              </div>
            </div>
          </li>
        ))}
      </ol>
      {sim && (
        <div className="mt-2 text-right text-[13px] text-sub">
          合計 <span className="font-bold text-ink">{manYen(sim.totalManYen)}</span>
        </div>
      )}
    </Card>
  );
}

/** 「媒体の順位と配分」の決め方。だれ（AI／システム）が何を決めているかを短く */
function PlanHelp() {
  return (
    <span className="grid gap-1.5">
      <span className="block font-bold text-ink">順位と配分の決め方</span>
      <span className="block">
        <b>媒体と配分（%）</b>：AIが16の媒体から3〜6件を選んで決めます。材料は、ターゲット、年代別のメディア利用率と家の探し方の統計、各媒体の目的と届きやすい年代です。不動産ポータルは必ず入れます。
      </span>
      <span className="block">
        <b>不動産ポータル</b>：SUUMO・アットホームなどは違いがはっきりしないため、1つにまとめて配分を足しています。
      </span>
      <span className="block">
        <b>順位</b>：配分の大きい順に並べています。
      </span>
      <span className="block">
        <b>金額</b>：配分×総額をシステムが計算します。
      </span>
      <span className="block text-muted">掲載料・反響の実績はまだ使っていません。</span>
    </span>
  );
}

/** 媒体1行の特徴。説明は画面に固定の一般的な説明、分類・目的・年代は媒体一覧（DB）の値。不動産ポータルは、まとめた媒体の名前と配分も出す */
function MediaHelp({ x, mediaInfo }: { x: DisplayMedia; mediaInfo: Record<string, MediaInfo> }) {
  const portal = x.category === PORTAL_CATEGORY;
  const note = MEDIA_NOTES[x.ids[0]];
  const infos = x.ids.map((id) => mediaInfo[id]).filter((i): i is MediaInfo => Boolean(i));
  const ages = infos.filter((i) => i.reachAges);
  return (
    <span className="grid gap-1.5">
      {note && <span className="block text-ink">{note}</span>}
      {portal && (
        <span className="block">
          <span className="text-muted">この物件で使う：</span>
          <span className="font-bold text-ink">{x.members.map((m) => `${m.name}（${m.share}%）`).join("、")}</span>
        </span>
      )}
      <span className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5">
        {!portal && x.category && (
          <>
            <span className="text-muted">分類</span>
            <span>{x.category}</span>
          </>
        )}
        {infos[0]?.purpose && (
          <>
            <span className="text-muted">主な目的</span>
            <span>{[...new Set(infos.map((i) => i.purpose).filter(Boolean))].join("・")}</span>
          </>
        )}
        {ages.length > 0 && (
          <>
            <span className="text-muted">届きやすい年代</span>
            <span>
              {portal ? ages.map((i) => `${i.name} ${i.reachAges}`).join("、") : ages[0].reachAges}（当社の見立て）
            </span>
          </>
        )}
      </span>
      {portal && <span className="block text-muted">{PORTAL_DIFF_NOTE}</span>}
    </span>
  );
}

/** 理由（AIの文）。まとめた行は、元の媒体ごとに名前を付けて並べる */
function Reasons({ x, facts }: { x: DisplayMedia; facts: Map<string, Fact> }) {
  const many = x.members.length > 1;
  return (
    <div className="mt-1.5 grid gap-1.5">
      {x.members.map((m) => (
        <div key={m.id} className="grid gap-1">
          {many && <div className="text-[12px] font-bold text-sub">{m.name}（{m.share}%）</div>}
          <Ai size="sm">{m.reason}</Ai>
          <Ai size="sm">配分：{m.share_reason}</Ai>
        </div>
      ))}
      <Evidence ids={x.evidence} facts={facts} max={2} />
    </div>
  );
}

/** 販売記録の実績。記録が1件も無ければ出さない（4ステップ目の「販売記録を開く」から入れる） */
function RecordResults({ records, propertyId }: { records: SalesRecords; propertyId: number }) {
  if (records.status === null && records.totals.length === 0) return null;
  const total = grandTotal(records.totals);
  // 入っていない値は推測で0にしない。一部の期間だけ入っているときは「一部不明」を添える
  const cell = (v: PartialSum, unit: "件" | "万円") =>
    v.sum === null ? (
      <span className="text-muted">不明</span>
    ) : (
      <>
        {unit === "万円" ? manYen(v.sum) : `${v.sum}件`}
        {v.partial && <span className="ml-1 text-[11px] font-normal text-muted">（一部不明）</span>}
      </>
    );
  const statusLabel = records.status && (SALE_STATUSES as readonly string[]).includes(records.status) ? SALE_STATUS_LABEL[records.status as (typeof SALE_STATUSES)[number]] : records.status;

  return (
    <Card
      title="販売記録の実績"
      icon={ChartIcon}
      aside={
        <Link href={`/records/${propertyId}`} className="text-[12px] text-primary underline">
          販売記録を開く
        </Link>
      }
    >
      <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-body">
        {statusLabel && <span className={`rounded px-2 py-0.5 text-[12px] font-bold ${STATUS_BADGE[records.status ?? ""] ?? "bg-subtle text-sub"}`}>{statusLabel}</span>}
        {records.listedOn && <span>販売開始 {records.listedOn}</span>}
        <span className="text-sub">販売記録の画面で入れた値を、媒体ごとに足しています。入っていない値は「不明」です。</span>
      </div>
      {records.totals.length === 0 ? (
        <div className="text-[13px] text-sub">媒体ごとの実績はまだありません。</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[14px] text-ink">
            <thead>
              <tr className="border-b border-line text-sub">
                <th className="py-2 pr-2 text-left font-normal">媒体</th>
                <th className="py-2 pr-2 text-left font-normal whitespace-nowrap">掲載</th>
                <th className="py-2 pr-2 text-right font-normal">費用</th>
                <th className="py-2 pr-2 text-right font-normal whitespace-nowrap">問い合わせ</th>
                <th className="py-2 pr-2 text-right font-normal">内見</th>
              </tr>
            </thead>
            <tbody>
              {records.totals.map((t) => (
                <tr key={t.mediaId ?? `other:${t.name}`} className="border-b border-canvas">
                  <td className="py-2 pr-2">{t.name}</td>
                  <td className="py-2 pr-2 text-[13px] text-body whitespace-nowrap">
                    {t.periods}回（初回 {t.firstStartedOn}）
                  </td>
                  <td className="py-2 pr-2 text-right whitespace-nowrap">{cell(t.costManYen, "万円")}</td>
                  <td className="py-2 pr-2 text-right whitespace-nowrap">{cell(t.inquiries, "件")}</td>
                  <td className="py-2 pr-2 text-right whitespace-nowrap">{cell(t.viewings, "件")}</td>
                </tr>
              ))}
              {records.totals.length > 1 && (
                <tr className="font-bold">
                  <td className="py-2 pr-2">合計</td>
                  <td />
                  <td className="py-2 pr-2 text-right whitespace-nowrap">{cell(total.costManYen, "万円")}</td>
                  <td className="py-2 pr-2 text-right whitespace-nowrap">{cell(total.inquiries, "件")}</td>
                  <td className="py-2 pr-2 text-right whitespace-nowrap">{cell(total.viewings, "件")}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
