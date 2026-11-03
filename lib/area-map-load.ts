// エリア分析の地図に出す点をDBから引く（サーバー側だけで使う）。形と色は lib/area-map.ts
// 地図は「いまのDB」の位置を出す。レポートを作ったあとに競合や販売記録を直すと、地図には新しい内容が出る

import { inOrder, type Sql } from "./db";
import { formatNumber } from "./facts/format";
import { cutFacilities, facilityGroupOf, formatDistance, pickFacilities, RINGS_M, type AreaMapData, type FacilityRow, type MapPoint } from "./area-map";

export async function loadAreaMap(sql: Sql, propertyId: number): Promise<AreaMapData | null> {
  const [p] = await sql<{ code: string; address: string; price_man_yen: number; lon: number | null; lat: number | null }[]>`
    select code, address, price_man_yen,
      extensions.st_x(geog::extensions.geometry) as lon, extensions.st_y(geog::extensions.geometry) as lat
    from properties where id = ${propertyId}
  `;
  if (!p || p.lon === null || p.lat === null) return null;
  const pt = sql`extensions.st_setsrid(extensions.st_point(${p.lon}, ${p.lat}), 4326)::extensions.geography`;
  const far = RINGS_M[1];

  const [competitors, sold, facilities, [station]] = await inOrder(
    () => sql<{ position: number; price_man_yen: number | null; address: string | null; building_sqm: string | null; land_sqm: string | null; building_age: number | null; lon: number | null; lat: number | null; distance_m: number | null }[]>`
      select position, price_man_yen, address, building_sqm, land_sqm, building_age,
        extensions.st_x(geog::extensions.geometry) as lon, extensions.st_y(geog::extensions.geometry) as lat,
        extensions.st_distance(geog, ${pt}) as distance_m
      from competitors where property_id = ${propertyId} order by position
    `,
    // 成約事例：販売記録で「成約」になっている自社の他の物件（3km以内）
    () => sql<{ code: string; address: string; layout: string; building_age: number; contract_price_man_yen: number | null; contracted_on: string | null; lon: number; lat: number; distance_m: number }[]>`
      select p.code, p.address, p.layout, p.building_age, s.contract_price_man_yen, to_char(s.contracted_on, 'YYYY-MM-DD') as contracted_on,
        extensions.st_x(p.geog::extensions.geometry) as lon, extensions.st_y(p.geog::extensions.geometry) as lat,
        extensions.st_distance(p.geog, ${pt}) as distance_m
      from sales_records s join properties p on p.id = s.property_id
      where s.status = '成約' and p.id <> ${propertyId} and p.geog is not null and extensions.st_dwithin(p.geog, ${pt}, ${far})
      order by distance_m
    `,
    () => sql<{ kind: string; name: string; dataset_id: string; lon: number; lat: number; distance_m: number }[]>`
      select kind, name, dataset_id,
        extensions.st_x(geog::extensions.geometry) as lon, extensions.st_y(geog::extensions.geometry) as lat,
        extensions.st_distance(geog, ${pt}) as distance_m
      from facilities where extensions.st_dwithin(geog, ${pt}, ${far})
      order by distance_m
    `,
    // 駅は3kmより遠いこともあるので、最寄りを別に引く
    () => sql<{ kind: string; name: string; dataset_id: string; lon: number; lat: number; distance_m: number }[]>`
      select kind, name, dataset_id,
        extensions.st_x(geog::extensions.geometry) as lon, extensions.st_y(geog::extensions.geometry) as lat,
        extensions.st_distance(geog, ${pt}) as distance_m
      from facilities where kind = '駅' order by geog operator(extensions.<->) ${pt} limit 1
    `,
  );

  const facilityRows: FacilityRow[] = facilities.map((f) => ({ ...f, lon: Number(f.lon), lat: Number(f.lat), distance_m: Number(f.distance_m) }));
  if (station && !facilityRows.some((f) => f.kind === "駅")) facilityRows.push({ ...station, lon: Number(station.lon), lat: Number(station.lat), distance_m: Number(station.distance_m) });

  const picked = pickFacilities(facilityRows);
  const points: MapPoint[] = [
    { kind: "target", lon: Number(p.lon), lat: Number(p.lat), title: `対象物件（${p.code}）`, lines: [p.address, `${formatNumber(p.price_man_yen)}万円`], distance_m: null },
    ...competitors
      .filter((c) => c.lon !== null && c.lat !== null)
      .map(
        (c): MapPoint => ({
          kind: "competitor",
          lon: Number(c.lon),
          lat: Number(c.lat),
          title: `競合物件 ${c.position}`,
          lines: [
            c.address ?? "住所の入力なし",
            [c.price_man_yen !== null ? `${formatNumber(c.price_man_yen)}万円` : null, c.building_age !== null ? (c.building_age === 0 ? "新築" : `築${c.building_age}年`) : null]
              .filter(Boolean)
              .join("・"),
            [c.land_sqm !== null ? `土地 ${Number(c.land_sqm)}㎡` : null, c.building_sqm !== null ? `建物 ${Number(c.building_sqm)}㎡` : null].filter(Boolean).join("・"),
            formatDistance(Number(c.distance_m)),
          ].filter((l) => l !== ""),
          distance_m: Number(c.distance_m),
        }),
      ),
    ...sold.map(
      (s): MapPoint => ({
        kind: "sold",
        lon: Number(s.lon),
        lat: Number(s.lat),
        title: `成約事例（${s.code}）`,
        lines: [
          `${s.address} ${s.layout}`,
          [s.contract_price_man_yen !== null ? `成約 ${formatNumber(s.contract_price_man_yen)}万円` : "成約価格の入力なし", s.contracted_on ? `${s.contracted_on}` : null].filter(Boolean).join("・"),
          formatDistance(Number(s.distance_m)),
        ],
        distance_m: Number(s.distance_m),
      }),
    ),
    ...picked.map(
      (f): MapPoint => ({
        kind: "facility",
        lon: f.lon,
        lat: f.lat,
        title: f.name,
        lines: [f.kind, formatDistance(f.distance_m)],
        group: facilityGroupOf(f.kind)!,
        distance_m: f.distance_m,
      }),
    ),
  ];

  return {
    center: { lon: Number(p.lon), lat: Number(p.lat) },
    points,
    datasetIds: [...new Set(picked.flatMap((f) => (f.dataset_id ? [f.dataset_id] : [])))],
    cut: cutFacilities(facilityRows),
    competitorsWithoutLocation: competitors.filter((c) => c.lon === null || c.lat === null).length,
  };
}
