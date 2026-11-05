"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { competitorPart } from "../../../../lib/agents/competitor-part";
import type { StrategyOutput } from "../../../../lib/agents/schemas";
import { competitorColumns, type CompetitorColumn, type CompetitorLink } from "../../../../lib/competitor-report";
import { IMAGE_KINDS, type ImageKind } from "../../../../lib/property-images";
import type { Fact } from "../../../../lib/facts/types";
import { AlertIcon, ChevronRightIcon, ScaleIcon, SparkIcon } from "../../../_components/icons";
import { Ai, Card, Evidence } from "./parts";

// 販売施策タブの「競合と比べたおすすめポイントと懸念点」（2026-11-05 浩平さん依頼）
// 競合は、物件情報の画面で選んだ、本システムで販売戦略を作った別の物件（最大3件）
// いちばん上に、競合と比べて事実で示せるこの物件の良さ（おすすめポイント）を出し、次に懸念点（最大2つ、対策は出さない）、
// その下に競合を列で並べる。1〜2件でも3列の幅にそろえ、空いた列は「未選択です」でグレーアウト（2026-11-05 浩平さん指示。1列だと画像と表が横に広がりすぎる）。狭い画面では縦に並べる
// 列の物件情報・特徴は事実（システムの登録値）、AIの見立ては競合の販売戦略からの引用、「買い手から見ると」はこの物件の戦略担当の見立て


/** 上のおすすめポイント・懸念点へ移る（列の札から） */
function jumpTo(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "center" });
}

function Against({ ns }: { ns: number[] }) {
  if (ns.length === 0) return null;
  return (
    <span className="flex flex-wrap gap-1">
      {ns.map((n) => (
        <span key={n} className="rounded bg-[#fff1d6] px-1.5 py-0.5 text-[11px] font-bold text-[#a15c00]">
          競合{n}と比べて
        </span>
      ))}
    </span>
  );
}

export default function CompetitorCompare({
  strategy,
  facts,
  propertyId,
  competitorLinks,
}: {
  strategy: StrategyOutput;
  facts: Map<string, Fact>;
  propertyId: number;
  competitorLinks: Record<string, CompetitorLink>;
}) {
  const columns = competitorColumns([...facts.values()]);
  const part = competitorPart(strategy);
  const help = (
    <>
      競合は、物件情報の画面で選んだ物件（本システムで販売戦略を作った物件）です。物件情報と特徴は登録された値、「AIの見立て」はその物件の販売戦略からの引用です。おすすめポイント・懸念点・「買い手から見ると」は、事実をもとにAIが考えた見立て（✦）です。
    </>
  );

  if (columns.length === 0) {
    return (
      <Card title="競合と比べたおすすめポイントと懸念点" icon={ScaleIcon} help={help}>
        <p className="text-[13px] text-sub">
          物件情報の画面で競合を選ぶと、ここにおすすめポイントと比較が出ます。
          <Link href={`/properties/${propertyId}?rebuild=1`} className="ml-2 text-brand underline">
            競合を選ぶ
          </Link>
        </p>
      </Card>
    );
  }

  // 列の番号（競合N）。AIの答えは「物件情報」の事実IDで競合を指す
  const nOf = new Map(columns.map((c) => [c.infoId, c.n]));
  const notes = new Map((part?.competitors ?? []).filter((c) => nOf.has(c.fact_id)).map((c) => [nOf.get(c.fact_id)!, c]));
  const concerns = part ? [...part.competitor_concerns].sort((a, b) => a.rank - b.rank) : [];
  // 懸念点の rank → 画面の番号（外した懸念点があっても1から振る）
  const concernNo = new Map(concerns.map((c, i) => [c.rank, i + 1]));
  const edgeAgainst = [...notes].filter(([, c]) => c.about_edge).map(([n]) => n);
  const concernAgainst = (rank: number) => [...notes].filter(([, c]) => c.concern_ranks.includes(rank)).map(([n]) => n);
  const edge = part?.competitor_edge ?? null;

  return (
    <Card title="競合と比べたおすすめポイントと懸念点" icon={ScaleIcon} help={help}>
      {!part ? (
        <p className="mb-4 rounded-lg border border-line bg-subtle px-4 py-3 text-[13px] text-sub">
          このレポートは、競合と比べる前の形で作っています。戦略を作り直すと、競合と比べたおすすめポイントと懸念点が出ます。
        </p>
      ) : (
        <div className="mb-4 grid grid-cols-[minmax(0,1fr)] gap-3">
          {/* おすすめポイント（競合と比べて事実で示せる、この物件の良さ。1つだけ） */}
          {edge ? (
            <div id="competitor-edge" className="scroll-mt-24 rounded-lg border border-[#bfe5c6] bg-[#f1faf3] p-4">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-[#157347] px-2.5 py-0.5 text-[12px] font-bold text-white">おすすめポイント</span>
                <Against ns={edgeAgainst} />
              </div>
              <Ai strong>{edge.point}</Ai>
              <dl className="mt-3 grid gap-2 md:grid-cols-3">
                {[
                  { k: "競合と比べて", v: edge.cause },
                  { k: "最初にやる打ち出し方", v: edge.action },
                  { k: "先にやる理由", v: edge.why_first },
                ].map((x) => (
                  <div key={x.k} className="min-w-0 rounded-md bg-white/80 px-3 py-2">
                    <dt className="text-[11px] font-bold text-[#157347]">{x.k}</dt>
                    <dd className="mt-0.5">
                      <Ai size="sm">{x.v}</Ai>
                    </dd>
                  </div>
                ))}
              </dl>
              <Evidence ids={edge.evidence} facts={facts} />
            </div>
          ) : (
            <p className="rounded-lg border border-line bg-subtle px-4 py-3 text-[13px] text-sub">競合と比べて、事実で示せる強みは見つかりませんでした。</p>
          )}

          {/* 懸念点（競合の方が選ばれやすくなる点。最大2つ。対策は出さない） */}
          {concerns.map((c) => (
            <div key={c.rank} id={`competitor-concern-${concernNo.get(c.rank)}`} className="scroll-mt-24 rounded-lg border border-[#f3d9a6] bg-[#fffaf0] p-4">
              <div className="mb-1.5 flex flex-wrap items-center gap-2">
                <span className="flex items-center gap-1 rounded-full bg-[#fdebc8] px-2.5 py-0.5 text-[12px] font-bold text-[#a15c00]">
                  <AlertIcon className="size-3.5" />
                  懸念点{concernNo.get(c.rank)}
                </span>
                <Against ns={concernAgainst(c.rank)} />
              </div>
              <Ai size="sm" strong>
                {c.concern}
              </Ai>
              <div className="mt-1 pl-5 text-[12px] text-body">
                <span className="font-bold text-sub">競合と比べて：</span>
                {c.cause}
              </div>
              <Evidence ids={c.evidence} facts={facts} max={2} />
            </div>
          ))}
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-3">
        {columns.map((col) => (
          <Column key={col.infoId} col={col} note={notes.get(col.n) ?? null} concernNo={concernNo} link={col.code ? competitorLinks[col.code] : undefined} facts={facts} />
        ))}
        {/* 選んでいない列は「未選択です」でグレーアウト（2026-11-05 浩平さん指示）。狭い画面では縦に並ぶので出さない */}
        {Array.from({ length: Math.max(0, 3 - columns.length) }, (_, i) => (
          <div
            key={`empty-${i}`}
            className="hidden min-h-[200px] flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-line bg-subtle text-[13px] text-muted md:flex print:hidden"
          >
            <span className="rounded bg-[#d4d8de] px-1.5 py-0.5 text-[11px] font-bold text-white">競合{columns.length + i + 1}</span>
            未選択です
          </div>
        ))}
      </div>
    </Card>
  );
}

function Column({
  col,
  note,
  concernNo,
  link,
  facts,
}: {
  col: CompetitorColumn;
  note: NonNullable<ReturnType<typeof competitorPart>>["competitors"][number] | null;
  concernNo: Map<number, number>;
  link: CompetitorLink | undefined;
  facts: Map<string, Fact>;
}) {
  const [open, setOpen] = useState(false);
  const features = col.features?.値 && col.features.値 !== "入力なし" ? col.features.値 : null;
  // 3行に収まらないときだけ「続きを見る」を出す（列の幅で行数が変わるので、描いたあとに測る）
  const textRef = useRef<HTMLParagraphElement>(null);
  const [long, setLong] = useState(false);
  useEffect(() => {
    const el = textRef.current;
    if (!el || open) return;
    const check = () => setLong(el.scrollHeight > el.clientHeight + 1);
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, [features, open]);
  const ranks = (note?.concern_ranks ?? []).filter((r) => concernNo.has(r));
  return (
    <section className="flex min-w-0 flex-col gap-3 rounded-lg border border-line bg-white p-4">
      {/* 見出し：競合N・物件ID・所在地（丁目まで）・直線距離 */}
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded bg-[#f59e0b] px-1.5 py-0.5 text-[11px] font-bold text-white">競合{col.n}</span>
          <span className="text-[14px] font-bold text-ink">{col.code ?? "物件IDなし"}</span>
          {link !== undefined && (
            <Link href={`/strategy/${link.id}`} className="ml-auto flex items-center text-[12px] text-brand underline print:hidden">
              販売戦略を見る
              <ChevronRightIcon className="size-3.5" />
            </Link>
          )}
        </div>
        <div className="mt-1 text-[12px] text-sub">
          {col.area ?? "所在地なし"}
          {col.distance && (
            <span className="ml-2 whitespace-nowrap">{col.distance.startsWith("取得できず") ? "この物件からの距離：取得できず" : `この物件から${col.distance}`}</span>
          )}
        </div>
      </div>

      {/* 競合の物件の画像（2026-11-05 浩平さん依頼）。1枚も無いときは既定の絵 */}
      <Photos propertyId={link?.id} kinds={link?.images ?? []} code={col.code} />

      {/* 物件情報と、この物件との差（システムの登録値と計算） */}
      <dl className="grid gap-1 text-[13px]">
        {col.rows.map((r) => (
          <div key={r.label} className="grid grid-cols-[5.5em_minmax(0,1fr)] gap-2 border-b border-divider pb-1 last:border-0">
            <dt className="text-sub">{r.label}</dt>
            <dd className="min-w-0 text-ink">
              <span className="font-bold tabular-nums">{r.value}</span>
              {r.diff && <span className="ml-1.5 text-[11px] text-sub">（{r.diff}）</span>}
            </dd>
          </div>
        ))}
      </dl>

      {/* 特徴（物件資料の入力のまま）。長いときは3行で畳む */}
      <div>
        <div className="text-[11px] font-bold text-sub">特徴</div>
        {features ? (
          <>
            <p ref={textRef} className={`mt-0.5 whitespace-pre-wrap text-[12px] leading-relaxed text-body ${open ? "" : "line-clamp-3"}`}>
              {features}
            </p>
            {(long || open) && (
              <button type="button" onClick={() => setOpen(!open)} className="mt-0.5 text-[11px] text-brand underline cursor-pointer print:hidden">
                {open ? "閉じる" : "続きを見る"}
              </button>
            )}
          </>
        ) : (
          <p className="mt-0.5 text-[12px] text-muted">入力なし</p>
        )}
      </div>

      {/* 競合の販売戦略からの引用（その物件のためにAIが書いた文） */}
      <div className="rounded-md bg-subtle px-3 py-2">
        <div className="flex flex-wrap items-center gap-x-2 text-[11px] font-bold text-sub">
          競合のAIの見立て（引用）
          {col.view?.createdOn && <span className="font-normal text-muted">{col.view.createdOn}作成</span>}
        </div>
        {col.view ? (
          <>
            {col.view.firstTarget && (
              <div className="mt-1 text-[12px] text-body">
                第1ターゲット：<span className="font-bold text-ink">{col.view.firstTarget}</span>
              </div>
            )}
            {col.view.summary && (
              <p className="mt-0.5 flex gap-1 text-[12px] leading-relaxed text-body">
                <SparkIcon className="mt-0.5 size-3 shrink-0 text-[#6b4fc0]" />
                <span className="min-w-0">{col.view.summary}</span>
              </p>
            )}
            {col.view.stale && (
              <p className="mt-1 flex items-center gap-1 text-[11px] text-accent">
                <AlertIcon className="size-3.5" />
                戦略を作ったあとに物件情報が直されています
              </p>
            )}
          </>
        ) : (
          <p className="mt-1 text-[12px] text-muted">取得できず</p>
        )}
      </div>

      {/* この物件の戦略担当の見立て：買い手が見比べたときの見え方 */}
      {note && (
        <div className="mt-auto rounded-md border border-[#e3dcf5] bg-[#faf8ff] px-3 py-2">
          <div className="text-[11px] font-bold text-[#5b3fa8]">買い手から見ると</div>
          <div className="mt-1">
            <Ai size="sm">{note.buyer_view.text}</Ai>
          </div>
          {(note.about_edge || ranks.length > 0) && (
            <div className="mt-1.5 flex flex-wrap gap-1 pl-5 print:hidden">
              {note.about_edge && (
                <button type="button" onClick={() => jumpTo("competitor-edge")} className="rounded bg-[#e9f8ec] px-1.5 py-0.5 text-[11px] font-bold text-[#157347] cursor-pointer hover:underline">
                  おすすめ
                </button>
              )}
              {ranks.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => jumpTo(`competitor-concern-${concernNo.get(r)}`)}
                  className="rounded bg-[#fff1d6] px-1.5 py-0.5 text-[11px] font-bold text-[#a15c00] cursor-pointer hover:underline"
                >
                  懸念点{concernNo.get(r)}
                </button>
              ))}
            </div>
          )}
          <div className="pl-5">
            <Evidence ids={note.buyer_view.evidence} facts={facts} max={2} />
          </div>
        </div>
      )}
    </section>
  );
}

/** 列の見出しの下の画像。大きく1枚（外観→内観→間取り図の順で最初のもの）、2枚以上あれば下の小さい画像で切り替える */
function Photos({ propertyId, kinds, code }: { propertyId: number | undefined; kinds: ImageKind[]; code: string | null }) {
  const [shown, setShown] = useState<ImageKind | null>(null);
  const slots = propertyId === undefined ? [] : IMAGE_KINDS.filter((k) => kinds.includes(k.kind));
  const current = slots.find((k) => k.kind === shown) ?? slots[0];
  // 間取り図は切れないように全体を見せる。写真は枠いっぱいに出す
  const fit = (kind: ImageKind) => (kind === "間取り図" ? "object-contain bg-white" : "object-cover bg-subtle");
  if (!current || propertyId === undefined) {
    return (
      <div className="relative overflow-hidden rounded-md border border-divider">
        {/* eslint-disable-next-line @next/next/no-img-element -- 画像の最適化は止めている（next.config.ts） */}
        <img src="/sales/house.webp" alt="" aria-hidden className="aspect-[16/9] max-h-44 w-full object-cover opacity-80" />
        <span className="absolute bottom-1.5 left-1.5 rounded bg-white/90 px-1.5 py-0.5 text-[10px] text-sub">画像の登録なし（イメージ）</span>
      </div>
    );
  }
  const src = (slug: string) => `/properties/${propertyId}/images/${slug}`;
  return (
    <div className="grid gap-1.5">
      <a href={src(current.slug)} target="_blank" rel="noreferrer" className="relative block overflow-hidden rounded-md border border-divider" aria-label={`${code ?? "競合"}の${current.fact}を大きく見る`}>
        {/* eslint-disable-next-line @next/next/no-img-element -- 画像の最適化は止めている（next.config.ts） */}
        <img src={src(current.slug)} alt={`${code ?? "競合"}の${current.fact}`} loading="lazy" className={`aspect-[16/9] max-h-44 w-full ${fit(current.kind)}`} />
        <span className="absolute bottom-1.5 left-1.5 rounded bg-white/90 px-1.5 py-0.5 text-[10px] font-bold text-sub">{current.kind}</span>
      </a>
      {slots.length > 1 && (
        <div className="flex gap-1.5 print:hidden">
          {slots.map((k) => (
            <button
              key={k.kind}
              type="button"
              onClick={() => setShown(k.kind)}
              aria-label={`${k.fact}を見る`}
              aria-pressed={k.kind === current.kind}
              className={`w-16 overflow-hidden rounded border-2 cursor-pointer ${k.kind === current.kind ? "border-[#f59e0b]" : "border-transparent opacity-70 hover:opacity-100"}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- 画像の最適化は止めている（next.config.ts） */}
              <img src={src(k.slug)} alt="" loading="lazy" className={`aspect-[4/3] w-full ${fit(k.kind)}`} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
