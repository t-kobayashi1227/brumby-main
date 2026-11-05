import Link from "next/link";
import { notFound } from "next/navigation";
import type { StrategyResult } from "../../../../lib/agents/run";
import { loadAreaMap } from "../../../../lib/area-map-load";
import { addressToChome } from "../../../../lib/competitors";
import { competitorColumns, selfColumn } from "../../../../lib/competitor-report";
import { quoteCompetitorView } from "../../../../lib/facts/competitor-quote";
import { IMAGE_KINDS, type ImageKind } from "../../../../lib/property-images";
import { loadAreaPrice } from "../../../../lib/area-price-load";
import { getSql, inOrder } from "../../../../lib/db";
import type { DatasetInfo } from "../../../../lib/facts/build";
import { formatJstDateTime, formatNumber, nowJstIso } from "../../../../lib/facts/format";
import type { FactSheet } from "../../../../lib/facts/types";
import { parsePropertyId } from "../../../../lib/property";
import { totalsByMedia } from "../../../../lib/records";
import { sourceList, usedFactIds } from "../../../../lib/report";
import { card, emptyState } from "../../../_lib/ui";
import FactSheetTable from "../../../_components/FactSheetTable";
import Report from "./Report";
import StrategyRunner, { type RunStatus } from "./StrategyRunner";

// ⑤販売戦略レポート（docs/設計まとめ.md「⑤画面の表示」）。[id] は物件の番号
// 上に物件の見出しと「戦略を作る」、その下に最新の完了した戦略を6つのタブで出す（2026-11-03 3タブから変更）。根拠は、その戦略に使った事実シートから引く
// 物件を登録した直後や地図で位置を確定したあとは ?auto=1 で開き、戦略づくりを自動で始める（StrategyRunner）
// 事実シートの表はこの画面だけで見せる。戦略がまだ無いときは最新の事実シートを出し、
// 戦略を作ったあとに周辺情報を取り直したときは、新しい事実シートを折りたたんで出す（レポートの「根拠データ」は、その戦略に使ったシートのまま）

export const dynamic = "force-dynamic";

/** 添付されている画像の枠を、画面に出す順（IMAGE_KINDS の順）にする */
const imageKindsOf = (kinds: string[]): ImageKind[] => IMAGE_KINDS.filter((k) => kinds.includes(k.kind)).map((k) => k.kind);

interface PropertyRow {
  code: string;
  property_class: string;
  price_man_yen: number;
  address: string;
  layout: string;
  building_sqm: string;
  land_sqm: string;
  parking: number;
  building_age: number;
  has_location: boolean;
  has_exterior: boolean;
  features: string | null;
  image_kinds: string[];
  updated_at: Date;
}

export default async function StrategyDetailPage({ params, searchParams }: PageProps<"/strategy/[id]">) {
  const { id } = await params;
  const sp = await searchParams;
  const propertyId = parsePropertyId(id);
  if (propertyId === null) notFound();

  const sql = getSql();
  const [p] = await sql<PropertyRow[]>`
    select code, property_class, price_man_yen, address, layout, building_sqm, land_sqm, parking, building_age, geog is not null as has_location,
      exists(select 1 from property_images i where i.property_id = properties.id and i.kind = '外観') as has_exterior,
      features, array(select kind from property_images i where i.property_id = properties.id) as image_kinds, updated_at
    from properties where id = ${propertyId}
  `;
  if (!p) return <div className={emptyState}>物件 {propertyId} が見つかりません。</div>;

  const transports = await sql<{ mode: string; line: string | null; stop_name: string; walk_min: number }[]>`
    select mode, line, stop_name, walk_min from property_transports where property_id = ${propertyId} order by position
  `;
  const [latestRun] = await sql<{ id: string; status: RunStatus["status"]; stage: string | null; error: string | null; cost_usd: string; started_at: Date | null }[]>`
    select id, status, stage, error, cost_usd, started_at from strategy_runs where property_id = ${propertyId} order by created_at desc limit 1
  `;
  const [latestSheet] = await sql<{ id: string; content: FactSheet }[]>`
    select id, content from fact_sheets where property_id = ${propertyId} order by created_at desc limit 1
  `;
  const [done] = await sql<{ result: StrategyResult; finished_at: Date; content: FactSheet; cost_usd: string; fact_sheet_id: string; run_id: string }[]>`
    select r.id as run_id, r.result, r.finished_at, r.cost_usd, f.content, r.fact_sheet_id
    from strategy_runs r join fact_sheets f on f.id = r.fact_sheet_id
    where r.property_id = ${propertyId} and r.status = 'succeeded' and r.form = '3回'
    order by r.finished_at desc limit 1
  `;

  // 戦略がまだ無いときの案内は、上のカード（StrategyRunner）の説明・進み具合・失敗の表示に任せる（2026-11-03）
  // 以前はここに「まだ販売戦略がありません。上の『戦略を作る』を押してください」を出していたが、登録後の自動作成中にも出て進み具合と食い違うため外した
  let report: React.ReactNode = latestSheet ? <LatestFactSheet sheet={latestSheet.content} /> : null;
  if (done) {
    const [datasets, media, areaMap, areaPrice, saleRows, resultRows, competitorRows] = await inOrder(
      () => sql<(DatasetInfo & { attribution: string | null })[]>`select id, name, provider, as_of, row_count, attribution from datasets`,
      () => sql<{ id: string; name: string; category: string; purpose: string; reach_ages: string }[]>`select id, name, category, purpose, reach_ages from media`,
      () => loadAreaMap(sql, propertyId),
      () => loadAreaPrice(sql, propertyId, done.content.事実),
      // 販売施策タブの「販売記録の実績」（2026-11-04）。販売記録の画面で入れた値を読むだけで、ここでは書かない
      () => sql<{ status: string; listed_on: string | null }[]>`select status, listed_on::text from sales_records where property_id = ${propertyId}`,
      () => sql<{ media_id: string | null; name: string; started_on: string; cost_man_yen: string | null; inquiries: number | null; viewings: number | null }[]>`
        select r.media_id, coalesce(m.name, r.other_name) as name, r.started_on::text, r.cost_man_yen, r.inquiries, r.viewings
        from media_results r left join media m on m.id = r.media_id
        where r.property_id = ${propertyId} order by r.started_on, r.id
      `,
      // 販売施策タブの競合の列から、その物件の販売戦略へ移るための番号と、列に出す画像の枠（事実シートには物件IDだけがある。消えた物件は出ない）
      async () => {
        const codes = competitorColumns(done.content.事実).flatMap((c) => (c.code ? [c.code] : []));
        return codes.length
          ? await sql<{ id: string; code: string; image_kinds: string[] }[]>`
              select id, code, array(select kind from property_images i where i.property_id = properties.id) as image_kinds
              from properties where code in ${sql(codes)}
            `
          : [];
      },
    );
    const records = {
      status: saleRows[0]?.status ?? null,
      listedOn: saleRows[0]?.listed_on ?? null,
      totals: totalsByMedia(resultRows.map((r) => ({ ...r, cost_man_yen: r.cost_man_yen === null ? null : Number(r.cost_man_yen) }))),
    };
    const facts = done.content.事実;
    const { rows, credits: usedCredits } = sourceList(facts, usedFactIds(done.result.戦略, done.result.媒体), [...datasets]);
    // 地図の施設と区の価格相場はAIが根拠に引いていなくても画面に出すので、そのデータのクレジットも足す（2026-11-03）
    const shown = new Set([...(areaMap?.datasetIds ?? []), ...(areaPrice.ok ? ["D01"] : [])]);
    const credits = [...new Set([...usedCredits, ...datasets.filter((d) => d.attribution && shown.has(d.id)).map((d) => d.attribution as string)])];
    const refetched = latestSheet && String(latestSheet.id) !== String(done.fact_sheet_id);
    report = (
      <>
        {refetched && (
          <LatestFactSheet
            sheet={latestSheet.content}
            collapsed
            note="レポートを作ったあとに、新しい事実シートを作りました。下のレポートは前回の事実シートで作っています。新しい事実シートは、戦略を作り直し終えると反映されます。"
          />
        )}
        <Report
          result={done.result}
          facts={facts}
          sources={rows}
          credits={credits}
          mediaInfo={Object.fromEntries(media.map((m) => [m.id, { name: m.name, category: m.category, purpose: m.purpose, reachAges: m.reach_ages }]))}
          sheetCreatedAt={formatJstDateTime(done.content.作成日時)}
          propertyId={propertyId}
          runId={Number(done.run_id)}
          areaMap={areaMap}
          areaPrice={areaPrice}
          records={records}
          exteriorImage={p.has_exterior ? `/properties/${propertyId}/images/exterior` : null}
          selfColumn={{
            ...selfColumn({
              code: p.code,
              area: addressToChome(p.address),
              property_class: p.property_class,
              price_man_yen: p.price_man_yen,
              layout: p.layout,
              building_sqm: Number(p.building_sqm),
              land_sqm: Number(p.land_sqm),
              building_age: p.building_age,
              features: p.features,
              view: quoteCompetitorView(done.result.戦略, facts, nowJstIso(new Date(done.finished_at)).slice(0, 10), p.updated_at > done.finished_at),
            }),
            id: propertyId,
            images: imageKindsOf(p.image_kinds),
          }}
          propertyImages={imageKindsOf(p.image_kinds)}
          competitorLinks={Object.fromEntries(
            competitorRows.map((c) => [c.code, { id: Number(c.id), images: imageKindsOf(c.image_kinds) }]),
          )}
        />
      </>
    );
  }

  const initial: RunStatus | null = latestRun
    ? {
        id: Number(latestRun.id),
        status: latestRun.status,
        stage: latestRun.stage,
        error: latestRun.error,
        costUsd: Number(latestRun.cost_usd),
        startedAt: latestRun.started_at?.toISOString() ?? null,
      }
    : null;
  // 交通は入力された値（駅・バス停まで徒歩◯分）をそのまま出す。システムで計算した距離ではない
  const access = transports.map((t) => `${t.line ? `${t.line} ` : ""}${t.mode === "バス" ? `「${t.stop_name}」停` : t.stop_name} 徒歩${t.walk_min}分`);

  return (
    // 事実シートの表（最小幅1110px）が画面幅を押し広げず、カードの中で横スクロールになるよう minmax(0,1fr) にする
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
      <div className="flex flex-wrap items-center gap-3 print:hidden">
        <Link href="/properties" className="text-xs text-brand underline">
          ← 物件一覧に戻る
        </Link>
        <div className="mr-auto" />
        <Link href={`/properties/${propertyId}`} className="text-xs text-brand underline">
          物件情報を直す
        </Link>
      </div>

      <StrategyRunner propertyId={propertyId} initial={initial} autoStart={sp.auto === "1"} hasReport={!!done} lastCreatedAt={done ? formatJstDateTime(done.finished_at) : null} hasLocation={p.has_location}>
        <div className="text-[12px] text-muted">
          物件ID {p.code}・{p.property_class}・{p.building_age === 0 ? "新築" : `築${p.building_age}年`}
        </div>
        <div className="mt-0.5 flex flex-wrap items-baseline gap-x-3">
          <h1 className="text-[20px] font-bold text-ink">
            {p.address} {p.layout}
          </h1>
          <span className="text-[24px] font-bold text-primary">{formatNumber(p.price_man_yen)}万円</span>
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {[`土地 ${Number(p.land_sqm)}㎡`, `建物 ${Number(p.building_sqm)}㎡`, `駐車場 ${p.parking}台`, ...access].map((c) => (
            <span key={c} className="rounded bg-subtle border border-line px-2 py-0.5 text-[12px] text-body">
              {c}
            </span>
          ))}
        </div>
      </StrategyRunner>
      {report}
    </div>
  );
}

/** 最新の事実シート（戦略にまだ使っていないもの）。collapsed のときは、表を開いて見る形にする */
function LatestFactSheet({ sheet, collapsed = false, note }: { sheet: FactSheet; collapsed?: boolean; note?: string }) {
  const facts = sheet.事実;
  const missing = facts.filter((f) => f.状態 !== "取得");
  const summary = (
    <>
      事実シート作成：{formatJstDateTime(sheet.作成日時)}（距離はすべて{sheet.距離の種類}）・事実 {facts.length}件・取得できず／要確認 {missing.length}件
      {missing.length > 0 && `（${missing.map((f) => f.id).join("、")}）`}
    </>
  );
  if (collapsed) {
    return (
      <details className={`${card} p-5 min-w-0 print:hidden`}>
        <summary className="cursor-pointer text-[13px] text-sub">
          {note && <span className="block text-ink mb-1">{note}</span>}
          新しい事実シートを見る（{summary}）
        </summary>
        <div className="mt-4">
          <FactSheetTable facts={facts} />
        </div>
      </details>
    );
  }
  return (
    <section className={`${card} p-5 min-w-0`}>
      <div className="text-[15px] font-bold text-ink mb-1">事実シート</div>
      <div className="text-[13px] text-sub mb-4">{summary}</div>
      <FactSheetTable facts={facts} />
    </section>
  );
}
