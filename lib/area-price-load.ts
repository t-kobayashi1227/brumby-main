// サマリーの「区の価格相場」をDBから作る（サーバー側だけで使う）。計算は lib/area-price.ts
// 物件の価格・建物面積・築年数は、レポートを作ったときの事実シート（P）から取る（価格分析タブと同じく、物件情報をあとで直してもレポートとずれない）
// 取引はいまの取込分で計算するので、取り込み直したあとは事実シートの M-01 と件数が違うことがある（画面に注記）

import type { Sql } from "./db";
import { houseTrades } from "./facts/collect";
import { pricePerTsubo } from "./facts/build";
import type { Fact } from "./facts/types";
import { areaPrice, numberIn, type AreaPriceResult } from "./area-price";

const pick = (facts: Fact[], label: string) => facts.find((f) => f.id.startsWith("P-") && f.項目 === label)?.値 ?? null;

export async function loadAreaPrice(sql: Sql, propertyId: number, facts: Fact[]): Promise<AreaPriceResult> {
  const [p] = await sql<{ price_man_yen: number; building_sqm: string; building_age: number; city_code: string | null; ward: string | null }[]>`
    select p.price_man_yen, p.building_sqm, p.building_age, t.city_code, t.ward
    from properties p
    left join lateral (
      select city_code, ward from towns
      where p.geog is not null and extensions.st_intersects(geom, p.geog::extensions.geometry) and coalesce(hcode, 0) <> 8154 and name is not null
      limit 1
    ) t on true
    where p.id = ${propertyId}
  `;
  if (!p?.city_code) return { ok: false, reason: "no_ward" };
  const [latest] = await sql<{ year: number; quarter: number }[]>`select year, quarter from transactions order by year desc, quarter desc limit 1`;
  if (!latest) return { ok: false, reason: "no_transactions" };

  // レポート作成時の値。事実シートで読めないときだけ、いまの物件情報を使う
  const priceMan = numberIn(pick(facts, "価格")) ?? p.price_man_yen;
  const floor = numberIn(pick(facts, "建物面積")) ?? Number(p.building_sqm);
  const age = numberIn(pick(facts, "築年数")) ?? p.building_age;

  const rows = await houseTrades(sql, p.city_code);
  const data = areaPrice(
    rows.map((r) => ({ year: r.year, quarter: r.quarter, building_year: r.building_year, price: Number(r.trade_price), floor_sqm: Number(r.floor_sqm) })),
    p.ward ?? "区",
    age,
    floor > 0 ? pricePerTsubo(priceMan * 10_000, floor) : null,
    { year: Number(latest.year), quarter: Number(latest.quarter) },
  );
  return data ? { ok: true, data } : { ok: false, reason: "no_band_trades" };
}
