// サマリーの「周辺の価格相場」をDBから作る（サーバー側だけで使う）。計算は lib/area-price.ts

import type { Sql } from "./db";
import { houseTrades } from "./facts/collect";
import { areaPrice, type AreaPriceData } from "./area-price";

export async function loadAreaPrice(sql: Sql, propertyId: number): Promise<AreaPriceData | null> {
  const [p] = await sql<{ price_man_yen: number; building_age: number; city_code: string | null; ward: string | null }[]>`
    select p.price_man_yen, p.building_age, t.city_code, t.ward
    from properties p
    left join lateral (
      select city_code, ward from towns
      where p.geog is not null and extensions.st_intersects(geom, p.geog::extensions.geometry) and coalesce(hcode, 0) <> 8154 and name is not null
      limit 1
    ) t on true
    where p.id = ${propertyId}
  `;
  if (!p?.city_code) return null;
  const [latest] = await sql<{ year: number | null }[]>`select max(year) as year from transactions`;
  if (latest?.year == null) return null;
  const rows = await houseTrades(sql, p.city_code);
  return areaPrice(
    rows.map((r) => ({ year: r.year, quarter: r.quarter, building_year: r.building_year, price: Number(r.trade_price), floor_sqm: Number(r.floor_sqm) })),
    p.ward ?? "区",
    p.building_age,
    p.price_man_yen * 10_000,
    latest.year,
  );
}
