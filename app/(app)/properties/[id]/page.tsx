import Link from "next/link";
import { notFound } from "next/navigation";
import { getSql, inOrder } from "../../../../lib/db";
import { parsePropertyId } from "../../../../lib/property";
import { emptyState } from "../../../_lib/ui";
import LocationMap from "../LocationMap";
import PropertyForm, { type PropertyValues, type TransportValues } from "../PropertyForm";
import { loadCompetitorCandidates, loadCompetitorIds } from "../../../../lib/competitors-load";

// 物件の画面：登録した内容の変更と、地図での位置の確認（docs/設計まとめ.md「入力画面の動き」）
// 販売戦略の画面の「物件情報を直す」（保存してもこの画面に残る）と「戦略を作り直す」（?rebuild=1、保存すると作り直しへ進む）から開く

export const dynamic = "force-dynamic";

interface PropertyRow {
  /** bigint の列は postgres.js から文字で返る。画面ではページの番号（propertyId）を使う */
  id: string;
  code: string;
  property_class: string;
  price_man_yen: number;
  address: string;
  layout: string;
  building_sqm: string;
  land_sqm: string;
  parking: number;
  building_age: number;
  floors: string;
  has_garden: boolean | null;
  renovated: boolean | null;
  renovation_year: number | null;
  renovation_parts: string[] | null;
  features: string | null;
  image_kinds: string[];
  ad_budget_man_yen: number | null;
  location_source: string | null;
  geocode_title: string | null;
  lon: number | null;
  lat: number | null;
}

export default async function PropertyPage({ params, searchParams }: PageProps<"/properties/[id]">) {
  const { id } = await params;
  const sp = await searchParams;
  const propertyId = parsePropertyId(id);
  if (propertyId === null) notFound();
  // 販売戦略の画面の「戦略を作り直す」から開いたとき（?rebuild=1）。保存すると戦略の作り直しへ進む
  const rebuild = sp.rebuild === "1";

  const sql = getSql();
  const [p] = await sql<PropertyRow[]>`
    select id, code, property_class, price_man_yen, address, layout, building_sqm, land_sqm, parking, building_age, floors,
      has_garden, renovated, renovation_year, renovation_parts, features, ad_budget_man_yen,
      array(select kind from property_images i where i.property_id = properties.id) as image_kinds, location_source, geocode_title,
      extensions.st_x(geog::extensions.geometry) as lon, extensions.st_y(geog::extensions.geometry) as lat
    from properties where id = ${propertyId}
  `;
  if (!p) return <div className={emptyState}>物件 {propertyId} が見つかりません。</div>;

  const [transports, competitorIds, candidates] = await inOrder(
    () => sql<TransportValues[]>`select mode, line, stop_name, walk_min from property_transports where property_id = ${propertyId} order by position`,
    () => loadCompetitorIds(sql, propertyId),
    () => loadCompetitorCandidates(sql, propertyId),
  );

  // numeric の列は文字で返るので、数にする
  const toNum = (v: string | null) => (v === null ? null : Number(v));
  const values: PropertyValues = {
    id: propertyId,
    property_class: p.property_class,
    price_man_yen: p.price_man_yen,
    address: p.address,
    layout: p.layout,
    building_sqm: toNum(p.building_sqm),
    land_sqm: toNum(p.land_sqm),
    parking: p.parking,
    building_age: p.building_age,
    floors: p.floors,
    has_garden: p.has_garden,
    renovated: p.renovated,
    renovation_year: p.renovation_year,
    renovation_parts: p.renovation_parts,
    features: p.features,
    image_kinds: p.image_kinds,
    ad_budget_man_yen: p.ad_budget_man_yen,
    transports: [...transports],
    competitor_ids: competitorIds,
  };

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/properties" className="text-xs text-brand underline">
          ← 物件一覧に戻る
        </Link>
        <div className="text-sm font-bold text-ink mr-auto">物件ID {p.code}</div>
        <Link href={`/strategy/${propertyId}`} className="text-xs text-brand underline">
          販売戦略を見る →
        </Link>
      </div>
      {rebuild && (
        <div className="rounded-md border border-[#b9cdf0] bg-primary-soft px-4 py-3 text-xs text-ink">
          登録した物件情報を入れてあります。変わったところを直して「保存して戦略を作り直す」を押すと、販売戦略の画面に移って作り直しを始めます。
          <Link href={`/strategy/${propertyId}`} className="ml-2 text-brand underline">
            作り直さずに戻る
          </Link>
        </div>
      )}
      {sp.created === "1" && (
        <div className="rounded-md border border-[#bfe5c6] bg-[#e9f8ec] px-4 py-3 text-xs text-[#157347]">
          登録しました。住所から位置を出せなかったため、下の地図をクリックしてピンを置き、「この位置で確定」を押してください。販売戦略づくりに進みます。
        </div>
      )}
      <LocationMap propertyId={propertyId} lon={p.lon} lat={p.lat} source={p.location_source} geocodeTitle={p.geocode_title} />
      <PropertyForm values={values} rebuild={rebuild} competitorCandidates={candidates} />
    </div>
  );
}
