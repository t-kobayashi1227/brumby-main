// 競合物件の候補と、選んだ競合をDBから引く（サーバー側だけで使う）。形と並びは lib/competitors.ts

import type { Sql } from "./db";
import { addressToChome, sortCandidates, type CompetitorCandidate } from "./competitors";
import { saleState } from "./listView";

/** 戦略を作り終えた物件の条件（3回の形で、戦略の答えがあるもの）。SQL の where に埋め込む */
const done = (sql: Sql) => sql`status = 'succeeded' and form = '3回' and result -> '戦略' is not null`;

/**
 * 競合に選べる物件：販売戦略を作り終えた物件（この物件を除く）。近い順
 * selfId が null（新しく登録するとき）は位置がないので、戦略を作った日が新しい順
 */
export async function loadCompetitorCandidates(sql: Sql, selfId: number | null): Promise<CompetitorCandidate[]> {
  const self = selfId ?? 0;
  const rows = await sql<
    {
      id: string;
      code: string;
      property_class: string;
      address: string;
      price_man_yen: number;
      layout: string;
      building_sqm: string;
      land_sqm: string;
      building_age: number;
      distance_m: number | null;
      strategy_on: string;
      sale_status: string | null;
    }[]
  >`
    select p.id, p.code, p.property_class, p.address, p.price_man_yen, p.layout, p.building_sqm, p.land_sqm, p.building_age,
      extensions.st_distance(p.geog, (select geog from properties where id = ${self})) as distance_m,
      to_char(r.finished_at at time zone 'Asia/Tokyo', 'YYYY-MM-DD') as strategy_on,
      s.status as sale_status
    from properties p
    join lateral (
      select finished_at from strategy_runs where property_id = p.id and ${done(sql)} order by finished_at desc limit 1
    ) r on true
    left join sales_records s on s.property_id = p.id
    where p.id <> ${self}
  `;
  return sortCandidates(
    rows.map((r) => ({
      id: Number(r.id),
      code: r.code,
      property_class: r.property_class,
      area: addressToChome(r.address),
      price_man_yen: r.price_man_yen,
      layout: r.layout,
      building_sqm: Number(r.building_sqm),
      land_sqm: Number(r.land_sqm),
      building_age: r.building_age,
      distance_m: r.distance_m === null ? null : Number(r.distance_m),
      strategy_on: r.strategy_on,
      sale: saleState(r.sale_status),
    })),
  );
}

/** この物件で選んでいる競合の物件番号（選んだ順） */
export async function loadCompetitorIds(sql: Sql, propertyId: number): Promise<number[]> {
  const rows = await sql<{ competitor_id: string }[]>`
    select competitor_id from property_competitors where property_id = ${propertyId} order by position
  `;
  return rows.map((r) => Number(r.competitor_id));
}

/** 選んだ物件が、どれも販売戦略を作り終えた物件か。そうでない物件の番号を返す */
export async function competitorsWithoutStrategy(sql: Sql, ids: number[]): Promise<number[]> {
  if (ids.length === 0) return [];
  const rows = await sql<{ id: string }[]>`
    select p.id from properties p
    where p.id in ${sql(ids)} and exists (select 1 from strategy_runs where property_id = p.id and ${done(sql)})
  `;
  const ok = new Set(rows.map((r) => Number(r.id)));
  return ids.filter((id) => !ok.has(id));
}
