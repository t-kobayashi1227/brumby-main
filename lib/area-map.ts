// エリア分析の地図（2026-11-03 浩平さん依頼「分析結果のエリアの位置をカラフルな地図で」）
// 対象物件・競合物件（販売中）・成約事例・生活施設を色分けしたピンで出し、1km・3kmの円を重ねる
// 位置はすべてDBにあるもの（物件の登録時の位置、競合の住所から出した位置、取り込み済みの公的データ）。ポータルからは集めない
// この表は画面（ブラウザ）でも読むので、DBに触る処理は lib/area-map-load.ts に分ける

export type MapPointKind = "target" | "competitor" | "sold" | "facility";

/** 生活施設の分け方（地図の切り替えボタン）。施設の種類（facilities.kind）をまとめる */
export const FACILITY_GROUPS = [
  { key: "education", label: "学校・子育て", kinds: ["小学校", "中学校", "保育園", "地域型保育", "幼稚園", "認定こども園", "放課後児童クラブ"] },
  { key: "shopping", label: "買い物", kinds: ["スーパー", "ドラッグストア", "コンビニ", "大規模小売店舗"] },
  { key: "medical", label: "医療", kinds: ["病院", "診療所", "歯科", "薬局"] },
  { key: "park", label: "公園", kinds: ["公園"] },
  { key: "public", label: "役所・図書館", kinds: ["役所", "図書館"] },
  { key: "transit", label: "駅・バス停", kinds: ["駅", "バス停"] },
] as const;

export type FacilityGroup = (typeof FACILITY_GROUPS)[number]["key"];

export function facilityGroupOf(kind: string): FacilityGroup | null {
  return FACILITY_GROUPS.find((g) => (g.kinds as readonly string[]).includes(kind))?.key ?? null;
}

/** 色（凡例と同じ）。対象は赤、競合はオレンジ、成約は緑、生活施設は青 */
export const MAP_COLORS: Record<MapPointKind, string> = {
  target: "#e5262a",
  competitor: "#f59e0b",
  sold: "#16a34a",
  facility: "#2563eb",
};

export const MAP_LABELS: Record<MapPointKind, string> = {
  target: "対象物件",
  competitor: "競合物件（販売中）",
  sold: "成約事例",
  facility: "生活施設",
};

export interface MapPoint {
  kind: MapPointKind;
  lon: number;
  lat: number;
  /** ピンを押したときの見出し */
  title: string;
  /** ピンを押したときの説明（1行ずつ） */
  lines: string[];
  /** 生活施設だけ */
  group?: FacilityGroup;
  /** 対象物件からの直線距離（m）。対象物件は null */
  distance_m: number | null;
}

export interface AreaMapData {
  center: { lon: number; lat: number };
  points: MapPoint[];
  /** 地図に出した生活施設のデータ（datasets.id）。フッターのクレジットに使う */
  datasetIds: string[];
  /** 種類ごとの上限で地図に出さなかった施設（種類と、1km以内の件数） */
  cut: { kind: string; total: number }[];
  /** 競合物件のうち、住所から位置が出ず地図に置けなかった件数 */
  competitorsWithoutLocation: number;
}

/** 円の半径（m）。事実シートの「1km以内」「3km以内」と同じ */
export const RINGS_M = [1000, 3000] as const;

const EARTH_R = 6371008.8;

/** 中心から半径 r（m）の円を、steps 個の点で近似した輪（GeoJSON の座標、最後の点は最初と同じ） */
export function circleRing(lon: number, lat: number, r: number, steps = 96): [number, number][] {
  const φ1 = (lat * Math.PI) / 180;
  const λ1 = (lon * Math.PI) / 180;
  const δ = r / EARTH_R;
  const ring: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const θ = ((i % steps) / steps) * 2 * Math.PI;
    const φ2 = Math.asin(Math.sin(φ1) * Math.cos(δ) + Math.cos(φ1) * Math.sin(δ) * Math.cos(θ));
    const λ2 = λ1 + Math.atan2(Math.sin(θ) * Math.sin(δ) * Math.cos(φ1), Math.cos(δ) - Math.sin(φ1) * Math.sin(φ2));
    ring.push([(λ2 * 180) / Math.PI, (φ2 * 180) / Math.PI]);
  }
  return ring;
}

/** 中心から方位 bearing（度、北が0で時計回り）へ r（m）の点（円の「1km」「3km」の札を置く位置） */
export function pointOnRing(lon: number, lat: number, r: number, bearing: number): [number, number] {
  return circleRing(lon, lat, r, 360)[Math.round(((bearing % 360) + 360) % 360)];
}

/** 距離の書き方（直線）。1km未満は m、以上は km（小数1桁） */
export function formatDistance(m: number): string {
  return m < 1000 ? `直線 ${Math.round(m)}m` : `直線 ${(m / 1000).toFixed(1)}km`;
}

export interface FacilityRow {
  kind: string;
  dataset_id?: string;
  name: string;
  lon: number;
  lat: number;
  distance_m: number;
}

/**
 * 地図に出す生活施設を選ぶ。種類ごとに、1km以内はすべて、無ければ3km以内の最寄り1つ（事実シートの「1km以内の一覧」「3km以内の最寄り」と同じ考え方）
 * バス停は数が多いので1km以内だけ。駅は3kmより遠くても最寄りを1つ出す（rows に入っていれば）
 * rows は近い順に並んでいること
 */
export function pickFacilities(rows: FacilityRow[], perKindLimit = PER_KIND_LIMIT): FacilityRow[] {
  const byKind = new Map<string, FacilityRow[]>();
  for (const r of rows) {
    if (!facilityGroupOf(r.kind)) continue;
    const list = byKind.get(r.kind) ?? [];
    list.push(r);
    byKind.set(r.kind, list);
  }
  const out: FacilityRow[] = [];
  for (const [kind, list] of byKind) {
    const near = list.filter((r) => r.distance_m <= RINGS_M[0]);
    if (near.length > 0) out.push(...near.slice(0, perKindLimit));
    else if (kind !== "バス停" && (kind === "駅" || list[0].distance_m <= RINGS_M[1])) out.push(list[0]);
  }
  return out.sort((a, b) => a.distance_m - b.distance_m);
}

/** 1km以内の施設が多い種類は、近い順にこの件数まで地図に出す（ピンで地図が埋まらないように） */
export const PER_KIND_LIMIT = 30;

/** 上限で地図に出さなかった種類と、1km以内の件数（地図の注記に使う） */
export function cutFacilities(rows: FacilityRow[], perKindLimit = PER_KIND_LIMIT): { kind: string; total: number }[] {
  const near = new Map<string, number>();
  for (const r of rows) if (facilityGroupOf(r.kind) && r.distance_m <= RINGS_M[0]) near.set(r.kind, (near.get(r.kind) ?? 0) + 1);
  return [...near].filter(([, n]) => n > perKindLimit).map(([kind, total]) => ({ kind, total }));
}
