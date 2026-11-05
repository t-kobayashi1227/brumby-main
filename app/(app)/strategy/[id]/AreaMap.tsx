"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import "maplibre-gl/dist/maplibre-gl.css";
import type { Map as MapLibreMap, Marker } from "maplibre-gl";
import { circleRing, FACILITY_GROUPS, PER_KIND_LIMIT, MAP_COLORS, MAP_LABELS, pointOnRing, RINGS_M, type AreaMapData, type FacilityGroup, type MapPoint, type MapPointKind } from "../../../../lib/area-map";
import { MapIcon } from "../../../_components/icons";
import { Card } from "./parts";

// エリア分析の地図（2026-11-03）。対象物件・競合物件・成約事例・生活施設を色分けしたピンで出し、1km・3kmの円を重ねる
// 地図は MapLibre GL＋国土地理院の淡色地図（出典を表示する）。点の選び方と色は lib/area-map.ts、DBから引くのは lib/area-map-load.ts

type Layer = "competitor" | "sold" | FacilityGroup;

const DEFAULT_ON: Layer[] = ["competitor", "sold", "education", "shopping", "medical", "park", "public", "transit"];

function pinElement(p: MapPoint): HTMLElement {
  const color = MAP_COLORS[p.kind];
  const size = p.kind === "target" ? 40 : p.kind === "facility" ? 22 : 28;
  const el = document.createElement("div");
  el.style.cursor = "pointer";
  el.style.display = "flex";
  el.style.alignItems = "center";
  el.style.gap = "4px";
  el.innerHTML = `<svg width="${size}" height="${Math.round(size * 1.35)}" viewBox="0 0 24 32" aria-hidden="true" style="filter:drop-shadow(0 1px 1.5px rgba(0,0,0,.35))"><path d="M12 0C5.4 0 0 5.3 0 11.9 0 20.8 12 32 12 32s12-11.2 12-20.1C24 5.3 18.6 0 12 0z" fill="${color}"/><circle cx="12" cy="11.5" r="${p.kind === "target" ? 4.6 : 4}" fill="#fff"/></svg>`;
  el.setAttribute("aria-label", `${MAP_LABELS[p.kind]}：${p.title}`);
  if (p.kind === "target") {
    // 「対象物件」の札をピンの右に添える（見本の画像と同じ）
    const tag = document.createElement("span");
    tag.textContent = "対象物件";
    tag.style.cssText = `background:#fff;color:${color};font-weight:700;font-size:13px;padding:2px 7px;border-radius:4px;box-shadow:0 1px 3px rgba(0,0,0,.25);white-space:nowrap;margin-bottom:22px`;
    el.appendChild(tag);
  }
  return el;
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

function layerOf(p: MapPoint): Layer | null {
  if (p.kind === "competitor" || p.kind === "sold") return p.kind;
  if (p.kind === "facility" && p.group) return p.group;
  return null;
}

/** compact：サマリーの2カラムに置くとき。地図を低くし、説明を短くする */
export default function AreaMap({ data, compact = false }: { data: AreaMapData; compact?: boolean }) {
  const box = useRef<HTMLDivElement>(null);
  const markers = useRef<{ layer: Layer | null; marker: Marker }[]>([]);
  const [on, setOn] = useState<Set<Layer>>(() => new Set(DEFAULT_ON));
  const [failed, setFailed] = useState(false);

  const counts = useMemo(() => {
    const c = new Map<Layer | MapPointKind, number>();
    for (const p of data.points) {
      c.set(p.kind, (c.get(p.kind) ?? 0) + 1);
      const l = layerOf(p);
      if (l && p.kind === "facility") c.set(l, (c.get(l) ?? 0) + 1);
    }
    return c;
  }, [data]);

  useEffect(() => {
    let disposed = false;
    let map: MapLibreMap | null = null;
    (async () => {
      try {
        const maplibregl = await import("maplibre-gl");
        if (disposed || !box.current) return;
        // LocationMap.tsx と同じく、worker のファイルを静的ファイルとして出させてその URL を渡す（Turbopack 対策）
        maplibregl.setWorkerUrl(new URL("../../../../node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs", import.meta.url).href);
        const { lon, lat } = data.center;
        const outer = circleRing(lon, lat, RINGS_M[1]);
        const lons = outer.map((c) => c[0]);
        const lats = outer.map((c) => c[1]);
        const m = new maplibregl.Map({
          container: box.current,
          bounds: [
            [Math.min(...lons), Math.min(...lats)],
            [Math.max(...lons), Math.max(...lats)],
          ],
          fitBoundsOptions: { padding: 16 },
          cooperativeGestures: true,
          style: {
            version: 8,
            sources: {
              pale: {
                type: "raster",
                tiles: ["https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png"],
                tileSize: 256,
                maxzoom: 18,
                attribution: '<a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank" rel="noreferrer">国土地理院</a>',
              },
              rings: {
                type: "geojson",
                data: {
                  type: "FeatureCollection",
                  features: RINGS_M.map((r) => ({ type: "Feature", properties: { r }, geometry: { type: "Polygon", coordinates: [circleRing(lon, lat, r)] } })),
                },
              },
            },
            layers: [
              { id: "pale", type: "raster", source: "pale" },
              { id: "rings-fill", type: "fill", source: "rings", paint: { "fill-color": MAP_COLORS.target, "fill-opacity": ["case", ["==", ["get", "r"], RINGS_M[0]], 0.1, 0.05] } },
              { id: "rings-line", type: "line", source: "rings", paint: { "line-color": MAP_COLORS.target, "line-width": 1.5, "line-opacity": 0.6, "line-dasharray": [3, 2] } },
            ],
          },
        });
        map = m;
        m.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");

        // 遠い順に置き、対象物件が一番上に来るようにする
        const ordered = [...data.points].sort((a, b) => (b.distance_m ?? -1) - (a.distance_m ?? -1));
        markers.current = ordered.map((p) => {
          const popup = new maplibregl.Popup({ offset: p.kind === "target" ? 44 : 26, closeButton: false, maxWidth: "260px" }).setHTML(
            `<div style="font-size:12px;line-height:1.5"><div style="font-weight:700;color:${MAP_COLORS[p.kind]}">${escapeHtml(MAP_LABELS[p.kind])}</div><div style="font-weight:700;color:#111827">${escapeHtml(p.title)}</div>${p.lines.map((l) => `<div style="color:#374151">${escapeHtml(l)}</div>`).join("")}</div>`,
          );
          const marker = new maplibregl.Marker({ element: pinElement(p), anchor: p.kind === "target" ? "bottom-left" : "bottom" }).setLngLat([p.lon, p.lat]).setPopup(popup).addTo(m);
          if (p.kind === "target") marker.setOffset([-20, 0]);
          return { layer: layerOf(p), marker };
        });

        // 円の札（1km・3km）。ピンに隠れないよう、ピンのあとに北西の縁へ置く
        for (const r of RINGS_M) {
          const el = document.createElement("div");
          el.textContent = `${r / 1000}km`;
          el.style.cssText = "background:rgba(255,255,255,.92);color:#1f2937;font-weight:700;font-size:13px;padding:1px 7px;border-radius:4px;box-shadow:0 1px 2px rgba(0,0,0,.2);pointer-events:none";
          new maplibregl.Marker({ element: el, anchor: "center" }).setLngLat(pointOnRing(lon, lat, r, 315)).addTo(m);
        }
      } catch {
        if (!disposed) setFailed(true);
      }
    })();
    return () => {
      disposed = true;
      markers.current = [];
      map?.remove();
    };
  }, [data]);

  // 切り替えボタンで、ピンを出し入れする
  useEffect(() => {
    for (const { layer, marker } of markers.current) {
      const el = marker.getElement();
      el.style.display = layer === null || on.has(layer) ? "" : "none";
    }
  }, [on, data]);

  const toggle = (l: Layer) =>
    setOn((prev) => {
      const next = new Set(prev);
      if (next.has(l)) next.delete(l);
      else next.add(l);
      return next;
    });

  const chips: { key: Layer; label: string; color: string; count: number }[] = [
    { key: "competitor", label: MAP_LABELS.competitor, color: MAP_COLORS.competitor, count: counts.get("competitor") ?? 0 },
    { key: "sold", label: MAP_LABELS.sold, color: MAP_COLORS.sold, count: counts.get("sold") ?? 0 },
    ...FACILITY_GROUPS.map((g) => ({ key: g.key as Layer, label: g.label, color: MAP_COLORS.facility, count: counts.get(g.key) ?? 0 })),
  ];

  return (
    <Card title="エリアの地図" icon={MapIcon}>
      <div className="mb-2 flex flex-wrap gap-1.5 print:hidden">
        {chips.map((c) => {
          const active = on.has(c.key);
          return (
            <button
              key={c.key}
              type="button"
              onClick={() => toggle(c.key)}
              aria-pressed={active}
              className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-[12px] transition-colors ${active ? "border-line bg-white text-ink" : "border-transparent bg-subtle text-muted"}`}
            >
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: active ? c.color : "#cbd5e1" }} />
              {c.label}
              <span className="text-muted">{c.count}</span>
            </button>
          );
        })}
      </div>
      <div className="relative">
        <div ref={box} className={`${compact ? "h-[360px]" : "h-[420px]"} max-md:h-[340px] overflow-hidden rounded-md border border-line bg-subtle`} />
        {failed && <div className="absolute inset-0 grid place-items-center text-[13px] text-sub">地図を読み込めませんでした。</div>}
        <ul className="pointer-events-none absolute bottom-2 left-2 grid max-md:hidden gap-1 rounded-md bg-white/95 px-3 py-2 text-[12px] text-ink shadow">
          {(["target", "competitor", "sold", "facility"] as MapPointKind[]).map((k) => (
            <li key={k} className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: MAP_COLORS[k] }} />
              {MAP_LABELS[k]}
            </li>
          ))}
        </ul>
      </div>
      <div className="mt-2 grid gap-0.5 text-[11px] text-muted">
        <div>円は対象物件からの直線距離（1km・3km）です。ピンを押すと名前と直線距離が出ます。</div>
        {compact ? (
          <div>
            色分けの決め方と注意点は、エリア分析タブの地図の下に書いています。
            {data.competitorsWithoutLocation > 0 && ` 位置が無い競合物件 ${data.competitorsWithoutLocation}件は地図に出ていません。`}
          </div>
        ) : (
          <div>
            競合物件は物件情報の画面で選んだ物件の登録位置、成約事例は販売記録で販売の状況を「販売済み」にした自社の物件（3km以内）、生活施設は取り込み済みの公的データ（種類ごとに1km以内を近い順に{PER_KIND_LIMIT}件まで、無ければ3km以内の最寄り）です。ボタンの数字は地図に出した件数で、バス停は乗り場（ポール）ごとに数えるため、事実シートの件数と違うことがあります。
            {data.cut.length > 0 && ` 1km以内に多いため近い${PER_KIND_LIMIT}件だけ出した種類：${data.cut.map((c) => `${c.kind}（${c.total}件）`).join("、")}。`}
          {data.competitorsWithoutLocation > 0 && ` 位置が無い競合物件 ${data.competitorsWithoutLocation}件は地図に出ていません。`}
          </div>
        )}
        {!compact && <div>地図はいまの登録内容で描いています。レポートを作ったあとに競合や販売記録を直した場合は、レポートの数字と違うことがあります。地図：国土地理院 淡色地図</div>}
        {compact && <div>地図：国土地理院 淡色地図</div>}
      </div>
    </Card>
  );
}
