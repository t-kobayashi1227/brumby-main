import { unzipSync } from "fflate";
import { geocodeAddress } from "../../../lib/geocode";
import { csvRecords, decode, parseCsv } from "../lib/files";
import { insertFacilities, type FacilityRow } from "../lib/facilities";
import { sleep } from "../lib/reinfolib";
import { defineJob } from "../lib/runner";

// D30 病院・診療所・歯科・薬局（医療情報ネットのオープンデータ、厚生労働省）
// npm run ingest -- iryou date=2026-10-24
// data/raw/iryou/ に、ダウンロードした zip（施設票・診療科票・薬局の CSV が入ったもの）を置く。date はダウンロードした日（データの時点）
// 新潟県（都道府県コード 15）だけを入れる
// 緯度経度が 0 の行は、住所から国土地理院の住所検索で位置を出す（設計まとめ「DBを作るときに確かめること」）。出せなかった行は入れない
// 緯度経度が新潟県の外（下の枠の外）になる行も、元データの誤りとして住所から位置を出し直す（2026-11-15。村上市の診療所が秋田・山形、
// 五泉市の歯科が東京駅の位置になっていた）
// 診療科は、同じ施設・同じ科が診療時間帯ごとに複数行あるので、施設ごとにまとめて departments に入れる

const PREF = "15";

/** 新潟県を囲む枠（町の境界 D39 の範囲 137.63〜139.90、36.74〜38.55 に少し余白を足した） */
const PREF_BOX = { minLon: 137.5, maxLon: 140.0, minLat: 36.6, maxLat: 38.7 };

/** 緯度経度が使えないか（0・空、または新潟県の枠の外）。使えないなら住所から位置を出す */
export function needsGeocode(lon: number, lat: number): "missing" | "outside" | null {
  if (!lon || !lat || !Number.isFinite(lon) || !Number.isFinite(lat)) return "missing";
  if (lon < PREF_BOX.minLon || lon > PREF_BOX.maxLon || lat < PREF_BOX.minLat || lat > PREF_BOX.maxLat) return "outside";
  return null;
}

interface Source {
  kind: string;
  facility: RegExp;
  departments?: RegExp;
  name: string;
}

const SOURCES: Source[] = [
  { kind: "病院", facility: /病院 \(施設票\)\.csv$/, departments: /病院 \(診療科・診療時間票）\.csv$/, name: "正式名称" },
  { kind: "診療所", facility: /\/診療所 \(施設票\)\.csv$/, departments: /\/診療所 \(診療科・診療時間票）\.csv$/, name: "正式名称" },
  { kind: "歯科", facility: /歯科診療所 \(施設票\)\.csv$/, name: "正式名称" },
  { kind: "薬局", facility: /薬局\.csv$/, name: "名称" },
];

interface Facility {
  id: string;
  kind: string;
  name: string;
  address: string;
  cityCode: string;
  lon: number;
  lat: number;
  geocoded: string | null;
}

interface Prepared {
  rows: FacilityRow[];
}

export const iryou = defineJob<Prepared>({
  datasets: ["D30"],
  rawDir: "iryou",
  table: "facilities",
  options: ["date"],

  async prepare({ args, raw, log, setAsOf, check }) {
    if (!args.date || !/^\d{4}-\d{2}-\d{2}$/.test(args.date)) throw new Error("ダウンロードした日を入れてください（例：npm run ingest -- iryou date=2026-10-24）");
    setAsOf("D30", `${args.date}（ダウンロード日）`);

    const zip = raw.find(/\.zip$/i, "医療情報ネットのオープンデータの zip");
    const files = unzipSync(zip.body);
    const text = (pattern: RegExp) => {
      const name = Object.keys(files).find((n) => pattern.test(`/${n}`));
      if (!name) throw new Error(`zip の中に ${pattern} がありません（中身：${Object.keys(files).join(", ")}）`);
      return decode(files[name], "utf-8").replace(/^﻿/, "");
    };

    const facilities: Facility[] = [];
    const departments = new Map<string, Set<string>>();
    for (const s of SOURCES) {
      const records = csvRecords(text(s.facility));
      const header = parseCsv(records.next().value ?? "")[0];
      const col = (name: string) => {
        const i = header.indexOf(name);
        if (i < 0) throw new Error(`${s.kind} の CSV に ${name} の列がありません`);
        return i;
      };
      const [id, name, pref, city, address, lat, lon] = ["ID", s.name, "都道府県コード", "市区町村コード", "所在地", "所在地座標（緯度）", "所在地座標（経度）"].map(col);
      const ids = new Set<string>();
      for (const rec of records) {
        // 都道府県コードを見る前に全部の列を分けると遅いので、"15" を含む行だけを分ける
        if (!rec.includes(`"${PREF}"`)) continue;
        const r = parseCsv(rec)[0];
        if (r[pref] !== PREF) continue;
        ids.add(r[id]);
        facilities.push({ id: r[id], kind: s.kind, name: r[name], address: r[address], cityCode: PREF + r[city], lon: Number(r[lon]), lat: Number(r[lat]), geocoded: null });
      }

      if (s.departments) {
        const deptRecords = csvRecords(text(s.departments));
        const dh = parseCsv(deptRecords.next().value ?? "")[0];
        const [di, dn] = [dh.indexOf("ID"), dh.indexOf("診療科目名")];
        for (const rec of deptRecords) {
          // ID は1列目。新潟県の施設の行だけを分ける
          const firstId = rec.slice(1, rec.indexOf('"', 1));
          if (!ids.has(firstId)) continue;
          const r = parseCsv(rec)[0];
          const set = departments.get(r[di]) ?? new Set<string>();
          if (r[dn]) set.add(r[dn]);
          departments.set(r[di], set);
        }
      }
      log(`${s.kind}：新潟県 ${ids.size}件`);
    }

    // 緯度経度が 0 の行と、県の外になる行は、住所から位置を出す
    const missing = facilities.filter((f) => needsGeocode(f.lon, f.lat) === "missing");
    const outside = facilities.filter((f) => needsGeocode(f.lon, f.lat) === "outside");
    log(`緯度経度が 0 の ${missing.length}件と、県の外の ${outside.length}件を、住所から探します`);
    let found = 0;
    for (const f of [...missing, ...outside]) {
      const hit = await geocodeAddress(f.address);
      // 住所から出した位置も県の外なら使わない
      if (hit && needsGeocode(hit.lon, hit.lat) === null) {
        Object.assign(f, { lon: hit.lon, lat: hit.lat, geocoded: hit.title });
        found++;
      } else {
        Object.assign(f, { lon: 0, lat: 0 });
      }
      await sleep(200);
    }
    check("緯度経度が0の行", Object.fromEntries(SOURCES.map((s) => [s.kind, missing.filter((f) => f.kind === s.kind).length])));
    check("緯度経度が県の外の行", outside.map((f) => `${f.kind} ${f.name}（${f.address}）`));
    check("住所から位置を出せた行", found);
    check("位置を出せず入れなかった行", missing.length + outside.length - found);
    log(`住所から ${found}件の位置を出しました（出せなかった ${missing.length + outside.length - found}件は入れません）`);

    const rows: FacilityRow[] = facilities
      .filter((f) => needsGeocode(f.lon, f.lat) === null)
      .map((f) => ({
        dataset_id: "D30",
        kind: f.kind,
        name: f.name,
        address: f.address,
        departments: departments.has(f.id) ? [...departments.get(f.id)!] : null,
        attrs: { city_code: f.cityCode, ...(f.geocoded ? { 位置: "住所から推定（国土地理院 住所検索）", 当たった住所: f.geocoded } : {}) },
        source_ref: f.id,
        lon: f.lon,
        lat: f.lat,
      }));
    return { rows };
  },

  async load({ sql, prepared, log }) {
    await insertFacilities(sql, prepared.rows);
    log(`${prepared.rows.length}件を入れました`);
  },
});
