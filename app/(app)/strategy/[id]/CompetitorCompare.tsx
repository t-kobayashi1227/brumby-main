"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { competitorPart } from "../../../../lib/agents/competitor-part";
import type { StrategyOutput } from "../../../../lib/agents/schemas";
import { competitorColumns, type CompetitorColumn, type CompetitorLink, type CompetitorRow, type SelfColumnView } from "../../../../lib/competitor-report";
import { MAX_COMPETITORS } from "../../../../lib/competitors";
import { IMAGE_KINDS, type ImageKind } from "../../../../lib/property-images";
import type { Fact } from "../../../../lib/facts/types";
import { AlertIcon, ChevronRightIcon, ScaleIcon, SparkIcon } from "../../../_components/icons";
import { Ai, Card, Evidence } from "./parts";

// 販売施策タブの「競合と比べたおすすめポイントと懸念点」（2026-11-05 浩平さん依頼）
// 競合は、物件情報の画面で選んだ、本システムで販売戦略を作った別の物件（最大2件。同日に3件→2件）
// いちばん上のおすすめポイントの枠に、競合と比べて事実で示せるこの物件の良さと、「競合と比べて｜懸念点1｜懸念点2」の3つを並べる
// （2026-11-05 浩平さん指示で「最初にやる打ち出し方」「先にやる理由」は出さない。AIの答えには残る。懸念点の対策も出さない）
// その下に3列：1列目はこの物件、2・3列目は競合。選んでいない列は「未選択です」でグレーアウト（2026-11-05 浩平さん指示）。狭い画面では縦に並べ、空いた列は出さない
// 列の物件情報・特徴は事実（システムの登録値）、AIの見立ては販売戦略からの引用、「買い手から見ると」はこの物件の戦略担当の見立て

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
  selfColumn,
}: {
  strategy: StrategyOutput;
  facts: Map<string, Fact>;
  propertyId: number;
  competitorLinks: Record<string, CompetitorLink>;
  /** 1列目に出すこの物件。無ければ競合だけを並べる */
  selfColumn: SelfColumnView | null;
}) {
  const columns = competitorColumns([...facts.values()]);
  const part = competitorPart(strategy);
  const help = (
    <>
      競合は、物件情報の画面で選んだ物件（本システムで販売戦略を作った物件、最大{MAX_COMPETITORS}件）です。物件情報と特徴は登録された値、「AIの見立て」はその物件の販売戦略からの引用です。おすすめポイント・懸念点・「買い手から見ると」は、事実をもとにAIが考えた見立て（✦）です。
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

  // 3列：この物件＋競合（上限を2件にする前に3件選んで作った戦略は、4列になる）
  const data = [...(selfColumn ? [selfData(selfColumn)] : []), ...columns.map((col) => competitorData(col, col.code ? competitorLinks[col.code] : undefined))];
  const empty = Math.max(0, MAX_COMPETITORS - columns.length);
  const slots = data.length + empty;

  return (
    <Card title="競合と比べたおすすめポイントと懸念点" icon={ScaleIcon} help={help}>
      {!part ? (
        <p className="mb-4 rounded-lg border border-line bg-subtle px-4 py-3 text-[13px] text-sub">
          このレポートは、競合と比べる前の形で作っています。戦略を作り直すと、競合と比べたおすすめポイントと懸念点が出ます。
        </p>
      ) : (
        // おすすめポイント（競合と比べて事実で示せる、この物件の良さ。1つだけ）と、その下に「競合と比べて｜懸念点1｜懸念点2」
        <div id="competitor-edge" className={`mb-4 scroll-mt-24 rounded-lg border p-4 ${edge ? "border-[#bfe5c6] bg-[#f1faf3]" : "border-line bg-subtle"}`}>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-2.5 py-0.5 text-[12px] font-bold text-white ${edge ? "bg-[#157347]" : "bg-[#9aa3ae]"}`}>おすすめポイント</span>
            {edge && <Against ns={edgeAgainst} />}
          </div>
          {edge ? <Ai strong>{edge.point}</Ai> : <p className="text-[13px] text-sub">競合と比べて、事実で示せる強みは見つかりませんでした。</p>}
          <div className="mt-3 grid gap-2 md:grid-cols-3">
            {edge && (
              <div className="min-w-0 rounded-md bg-white/80 px-3 py-2">
                <div className="text-[11px] font-bold text-[#157347]">競合と比べて</div>
                <div className="mt-0.5">
                  <Ai size="sm">{edge.cause}</Ai>
                </div>
                <Evidence ids={edge.evidence} facts={facts} max={2} />
              </div>
            )}
            {/* 懸念点（競合の方が選ばれやすくなる点。最大2つ。対策は出さない） */}
            {concerns.map((c) => (
              <div key={c.rank} id={`competitor-concern-${concernNo.get(c.rank)}`} className="min-w-0 scroll-mt-24 rounded-md border border-[#f3d9a6] bg-[#fffaf0] px-3 py-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="flex items-center gap-1 text-[11px] font-bold text-[#a15c00]">
                    <AlertIcon className="size-3.5" />
                    懸念点{concernNo.get(c.rank)}
                  </span>
                  <Against ns={concernAgainst(c.rank)} />
                </div>
                <div className="mt-0.5">
                  <Ai size="sm" strong>
                    {c.concern}
                  </Ai>
                </div>
                <div className="mt-1 pl-5 text-[12px] text-body">
                  <span className="font-bold text-sub">競合と比べて：</span>
                  {c.cause}
                </div>
                <Evidence ids={c.evidence} facts={facts} max={2} />
              </div>
            ))}
            {concerns.length === 0 && <p className="self-center px-3 py-2 text-[12px] text-muted">競合と比べた懸念点は見つかりませんでした。</p>}
          </div>
        </div>
      )}

      <div className={`grid gap-3 ${slots > 3 ? "md:grid-cols-4" : "md:grid-cols-3"}`}>
        {data.map((col) => (
          <Column key={col.key} col={col} note={col.n === null ? null : (notes.get(col.n) ?? null)} concernNo={concernNo} facts={facts} />
        ))}
        {/* 選んでいない列は「未選択です」でグレーアウト（2026-11-05 浩平さん指示）。狭い画面と印刷では出さない */}
        {Array.from({ length: empty }, (_, i) => (
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

/** 列に出す中身。競合の列は事実シートの K から、この物件の列は登録値とこの画面の戦略から作る */
interface ColumnData {
  key: string;
  /** 競合の番号。この物件の列は null */
  n: number | null;
  /** 「競合1」「この物件」 */
  badge: string;
  self: boolean;
  code: string | null;
  area: string | null;
  distance: string | null;
  rows: CompetitorRow[];
  features: string | null;
  view: { firstTarget: string | null; summary: string | null; createdOn: string | null; stale: boolean } | null;
  viewTitle: string;
  /** 画像を読む物件の番号。物件が消えていれば undefined */
  photoId: number | undefined;
  images: ImageKind[];
  /** 「販売戦略を見る」の行き先。この物件の列では出さない */
  strategyId: number | undefined;
}

function competitorData(col: CompetitorColumn, link: CompetitorLink | undefined): ColumnData {
  return {
    key: col.infoId,
    n: col.n,
    badge: `競合${col.n}`,
    self: false,
    code: col.code,
    area: col.area,
    distance: col.distance,
    rows: col.rows,
    features: col.features?.値 && col.features.値 !== "入力なし" ? col.features.値 : null,
    view: col.view,
    viewTitle: "競合のAIの見立て（引用）",
    photoId: link?.id,
    images: link?.images ?? [],
    strategyId: link?.id,
  };
}

function selfData(c: SelfColumnView): ColumnData {
  return {
    key: "self",
    n: null,
    badge: "この物件",
    self: true,
    code: c.code,
    area: c.area,
    distance: null,
    rows: c.rows,
    features: c.features,
    view: c.summary || c.firstTarget ? { firstTarget: c.firstTarget, summary: c.summary, createdOn: c.createdOn, stale: c.stale } : null,
    viewTitle: "この物件のAIの見立て",
    photoId: c.id,
    images: c.images,
    strategyId: undefined,
  };
}

function Column({
  col,
  note,
  concernNo,
  facts,
}: {
  col: ColumnData;
  note: NonNullable<ReturnType<typeof competitorPart>>["competitors"][number] | null;
  concernNo: Map<number, number>;
  facts: Map<string, Fact>;
}) {
  const [open, setOpen] = useState(false);
  const features = col.features;
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
    <section className={`flex min-w-0 flex-col gap-3 rounded-lg border p-4 ${col.self ? "border-[#b9cdf3] bg-[#f7faff]" : "border-line bg-white"}`}>
      {/* 見出し：競合N（またはこの物件）・物件ID・所在地（丁目まで）・直線距離 */}
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded px-1.5 py-0.5 text-[11px] font-bold text-white ${col.self ? "bg-primary" : "bg-[#f59e0b]"}`}>{col.badge}</span>
          <span className="text-[14px] font-bold text-ink">{col.code ?? "物件IDなし"}</span>
          {col.strategyId !== undefined && (
            <Link href={`/strategy/${col.strategyId}`} className="ml-auto flex items-center text-[12px] text-brand underline print:hidden">
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

      {/* 物件の画像（2026-11-05 浩平さん依頼）。1枚も無いときは既定の絵 */}
      <Photos propertyId={col.photoId} kinds={col.images} code={col.code} />

      {/* 物件情報と、この物件との差（システムの登録値と計算。この物件の列は差を出さない） */}
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

      {/* 競合の列は、その物件の販売戦略からの引用。この物件の列は、この画面の販売戦略 */}
      <div className={`rounded-md px-3 py-2 ${col.self ? "bg-white" : "bg-subtle"}`}>
        <div className="flex flex-wrap items-center gap-x-2 text-[11px] font-bold text-sub">
          {col.viewTitle}
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
