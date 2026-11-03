import Link from "next/link";
import { notFound } from "next/navigation";
import { getSql } from "../../../../../lib/db";
import { formatJstDateTime } from "../../../../../lib/facts/format";
import type { FactSheet } from "../../../../../lib/facts/types";
import { parsePropertyId } from "../../../../../lib/property";
import { btnPrimary, card, emptyState } from "../../../../_lib/ui";
import FactSheetRunner from "./FactSheetRunner";

// 事実シートの画面：周辺情報を取得して事実シートを作る（docs/実装の進め方.md「3. 事実シートの作成」）
// 事実の表は販売戦略の画面で見せる（2026-11-03 利用者の判断）。ここは取得の進み具合と、最新のシートの概要だけ
// 作り終えると、FactSheetRunner が販売戦略の画面へ自動で移る
// 地図で「この位置で確定」を押すと ?auto=1 で開き、周辺情報の取得を自動で始める（FactSheetRunner）

export const dynamic = "force-dynamic";

export default async function FactSheetPage({ params, searchParams }: PageProps<"/properties/[id]/facts">) {
  const { id } = await params;
  const sp = await searchParams;
  const propertyId = parsePropertyId(id);
  if (propertyId === null) notFound();

  const sql = getSql();
  const [property] = await sql<{ code: string }[]>`select code from properties where id = ${propertyId}`;
  if (!property) return <div className={emptyState}>物件 {propertyId} が見つかりません。</div>;
  const [latest] = await sql<{ id: string; content: FactSheet; created_at: Date }[]>`
    select id, content, created_at from fact_sheets where property_id = ${propertyId} order by created_at desc limit 1
  `;
  const facts = latest?.content.事実 ?? [];
  const missing = facts.filter((f) => f.状態 !== "取得");

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <Link href={`/properties/${propertyId}`} className="text-xs text-brand underline">
          ← 物件の画面に戻る
        </Link>
        <div className="text-sm font-bold text-ink mr-auto">物件ID {property.code} の事実シート</div>
        {latest && (
          <Link href={`/strategy/${propertyId}`} className={btnPrimary}>
            販売戦略へ進む →
          </Link>
        )}
      </div>
      <FactSheetRunner propertyId={propertyId} autoStart={sp.auto === "1"} hasSheet={!!latest} />
      {latest && (
        <section className={`${card} p-5 text-[13px] text-sub`}>
          最新の事実シート：{formatJstDateTime(latest.content.作成日時)}（距離はすべて{latest.content.距離の種類}）・事実 {facts.length}件・取得できず／要確認 {missing.length}件
          {missing.length > 0 && `（${missing.map((f) => f.id).join("、")}）`}。内容は
          <Link href={`/strategy/${propertyId}`} className="text-brand underline mx-1">
            販売戦略の画面
          </Link>
          で確認できます。
        </section>
      )}
    </div>
  );
}
