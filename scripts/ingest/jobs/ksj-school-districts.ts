import { unzipSync } from "fflate";
import type { Feature, Geometry } from "geojson";
import { readShapefile } from "../lib/files";
import { defineJob, insertRows, type IngestJob } from "../lib/runner";

// D12 小学校区（A27）・D13 中学校区（A32）。国土数値情報、2023年度版（2024-06 更新）
//   npm run ingest -- a27-school-districts
//   npm run ingest -- a32-school-districts
// data/raw/A27/・data/raw/A32/ に「新潟」の zip を置く（ファイル名は変えてよい。フォルダの中の zip をすべて読む）
// 新潟市の分は入っていない（2026-10-04 に確認）。新潟市は通学区域一覧（D14）で決め、それ以外の市町村をこの形で決める（lib/facts/collect.ts）
// 属性の名前は版によって違うので、値の形で見分ける（学校名：「〜小学校」「〜中学校」で終わる、市区町村コード：5桁の数字）
// 取り込んだあと、学区の入っている市町村と入っていない市町村を表示する（入っていない市町村の物件は「取得できず」になる）

type Properties = Record<string, unknown>;

/** 属性から、学校名の項目と市区町村コードの項目を見分ける。学校名が見つからなければエラー（属性の一覧を出す） */
export function detectDistrictFields(samples: Properties[], suffix: "小学校" | "中学校"): { name: string; code: string | null } {
  const keys = [...new Set(samples.flatMap((p) => Object.keys(p)))];
  const share = (key: string, test: (v: string) => boolean) => samples.filter((p) => test(String(p[key] ?? "").trim())).length / Math.max(samples.length, 1);
  const byName = keys.map((k) => ({ k, s: share(k, (v) => v.endsWith(suffix)) })).sort((a, b) => b.s - a.s)[0];
  if (!byName || byName.s < 0.5) {
    const example = samples[0] ? JSON.stringify(samples[0]) : "（属性なし）";
    throw new Error(`学校名（「〜${suffix}」で終わる値）の項目が見つかりません。属性の例：${example}`);
  }
  const code = keys.find((k) => k !== byName.k && share(k, (v) => /^\d{5}$/.test(v)) >= 0.9) ?? null;
  return { name: byName.k, code };
}

function districtJob(dataset: "D12" | "D13", rawDir: "A27" | "A32", kind: "小学校区" | "中学校区", suffix: "小学校" | "中学校"): IngestJob<unknown> {
  return defineJob({
    datasets: [dataset],
    rawDir,
    table: "zones",
    options: [],

    async load({ sql, raw, log, check }) {
      const zips = raw.findAll(/\.zip$/i, `国土数値情報 ${kind}（${rawDir}、2023年度、新潟）の zip`);
      const features: Feature<Geometry, Properties>[] = [];
      let files = 0;
      for (const zip of zips) {
        const parts = unzipSync(zip.body, { filter: (f) => /\.(shp|dbf|cpg)$/i.test(f.name) });
        const byBase = new Map<string, { shp?: Uint8Array; dbf?: Uint8Array; cpg?: Uint8Array }>();
        for (const [name, body] of Object.entries(parts)) {
          const m = /^(.*)\.(shp|dbf|cpg)$/i.exec(name);
          if (!m) continue;
          const entry = byBase.get(m[1]) ?? {};
          entry[m[2].toLowerCase() as "shp" | "dbf" | "cpg"] = body;
          byBase.set(m[1], entry);
        }
        for (const p of byBase.values()) {
          if (!p.shp || !p.dbf) continue;
          // 文字コードは .cpg に書かれていればそれに従う（国土数値情報は版によって UTF-8 と Shift_JIS がある）
          const cpg = p.cpg ? new TextDecoder().decode(p.cpg).trim().toLowerCase() : "";
          const encoding = /utf-?8/.test(cpg) ? "utf-8" : "shift_jis";
          let polygons = 0;
          for await (const f of readShapefile(p.shp, p.dbf, encoding)) {
            if (f.geometry?.type !== "Polygon" && f.geometry?.type !== "MultiPolygon") continue;
            features.push(f);
            polygons++;
          }
          if (polygons > 0) files++;
        }
      }
      if (features.length === 0) throw new Error(`zip の中に${kind}の面（Polygon）がありません`);

      const fields = detectDistrictFields(features.slice(0, 1000).map((f) => f.properties), suffix);
      log(`面のあるファイル ${files}個、${features.length}区域を読みました。属性：学校名は ${fields.name}、市区町村コードは ${fields.code ?? "（見つからない）"}`);
      const rows = features
        .map((f) => {
          const p = f.properties;
          const school = String(p[fields.name] ?? "").trim();
          const code = fields.code ? String(p[fields.code] ?? "").trim() || null : null;
          return { label: school, attrs: { 学校名: school, 行政区域コード: code }, raw: p, geojson: JSON.stringify(f.geometry) };
        })
        .filter((r) => r.label);

      await sql`create temp table district_rows (label text, attrs jsonb, raw jsonb, geojson text) on commit drop`;
      await insertRows(sql, "district_rows", rows.map((r) => ({ ...r, attrs: sql.json(r.attrs as never), raw: sql.json(r.raw as never) })), 200);
      // 壊れた形を直し、頂点256以下の切れ端に分けて入れる（点が入るかの判定を速くするため。ほかの区域と同じ）
      const [{ n }] = await sql<{ n: number }[]>`
        with ins as (
          insert into zones (dataset_id, kind, label, attrs, geom, raw)
          select ${dataset}, ${kind}, d.label, d.attrs, extensions.st_multi(p.geom), d.raw
          from district_rows d,
            lateral extensions.st_subdivide(
              extensions.st_collectionextract(extensions.st_makevalid(extensions.st_setsrid(extensions.st_geomfromgeojson(d.geojson), 4326)), 3),
              256
            ) as p(geom)
          returning 1
        )
        select count(*)::int as n from ins
      `;
      log(`${kind}：${rows.length}区域を、${n}行（切れ端）に分けて入れました`);

      // 学区の入っている市町村（新潟市は対象外）
      const covered = new Set(rows.map((r) => r.attrs.行政区域コード).filter(Boolean));
      const munis = await sql<{ city_code: string; ward: string }[]>`
        select distinct city_code, ward from towns where city_code like '15%' and city_code not like '151%' order by city_code
      `;
      const missing = munis.filter((m) => !covered.has(m.city_code)).map((m) => m.ward);
      if (fields.code) log(`学区の入っている市町村 ${munis.length - missing.length} / ${munis.length}。入っていない市町村：${missing.join("、") || "なし"}`);
      check("区域の数", rows.length);
      check("学校名の項目", fields.name);
      check("市区町村コードの項目", fields.code);
      check("学区の入っていない市町村", fields.code ? missing : "市区町村コードの項目が無いため数えられない");
    },
  });
}

export const a27SchoolDistricts = districtJob("D12", "A27", "小学校区", "小学校");
export const a32SchoolDistricts = districtJob("D13", "A32", "中学校区", "中学校");
