"use client";

import { FEW_TOTAL, FEW_TRADES, type AreaPriceMissing, type AreaPriceResult } from "../../../../lib/area-price";
import { formatNumber } from "../../../../lib/facts/format";
import { YenIcon } from "../../../_components/icons";
import { Card } from "./parts";

// サマリーの「区の価格相場」（2026-11-03）。数字はすべてプログラムで出したもの（lib/area-price.ts）。AIは使わない
// 比べ方は事実シート・価格分析タブと同じ延床の坪単価。総額は参考の価格帯だけにし、物件の総額と並べて比べない（相場の出し方変更.md 3.6）

const man = (yen: number) => formatNumber(Math.round(yen / 10_000));
const tsubo = (yen: number) => (Math.round(yen / 1000) / 10).toFixed(1);

const MISSING: Record<AreaPriceMissing, string> = {
  no_ward: "物件の位置が新潟市の区に入らないため、価格相場を出せません。",
  no_transactions: "取引のデータがまだ取り込まれていないため、価格相場を出せません。",
  no_band_trades: "物件のある区で、同じ築年数の戸建ての取引が見つからないため、価格相場を出せません。",
};

export default function AreaPrice({ result }: { result: AreaPriceResult }) {
  if (!result.ok) {
    return (
      <Card title="区の価格相場" icon={YenIcon}>
        <div className="text-[13px] text-sub">{MISSING[result.reason]}</div>
      </Card>
    );
  }
  const data = result.data;
  const values = data.series.flatMap((s) => (s.unitMedian === null ? [] : [s.unitMedian]));
  const top = niceMax(Math.max(...values, data.ownUnit ?? 0, data.unitMedian));
  const ticks = [0, top / 2, top];
  const y = (v: number) => `${100 - (v / top) * 100}%`;
  const few = data.count < FEW_TOTAL;

  return (
    <Card title={`${data.ward}の価格相場（${data.band}の戸建て）`} icon={YenIcon}>
      <div className="grid grid-cols-2 gap-2">
        <Tile
          label="延床の坪単価の中央値"
          value={`${tsubo(data.unitMedian)}万円/坪`}
          sub={`${data.fromYear}〜${data.toYear}年・${data.count}件${data.widened ? "（直近5年が少ないため全期間）" : ""}${few ? "・件数が少ない" : ""}`}
          big
          warn={few}
        />
        <Tile label="この物件の坪単価" value={data.ownUnit !== null ? `${tsubo(data.ownUnit)}万円/坪` : "出せません"} sub="レポート作成時の価格・建物面積から" big />
        <Tile
          label="よくある価格帯（総額）"
          value={data.priceRange ? `${man(data.priceRange.p25)}〜${man(data.priceRange.p75)}万円` : "件数が少ないため出していません"}
          sub="真ん中の半数の取引。広さで変わるので参考"
          small={!data.priceRange}
        />
        <Tile label="直近1年の取引件数" value={`${data.recent.count}件`} sub={`${data.recent.from}〜${data.recent.to}`} />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1">
        <div className="text-[13px] font-bold text-ink">坪単価の推移（半年ごとの中央値）</div>
        {data.ownUnit !== null && (
          <span className="inline-flex items-center gap-1.5 text-[11px] text-sub">
            <span className="w-5 border-t-2 border-dashed border-[#e5262a]/70" />
            この物件 {tsubo(data.ownUnit)}万円/坪
          </span>
        )}
      </div>
      <div className="mt-2 grid grid-cols-[auto_minmax(0,1fr)] gap-x-2">
        {/* 目盛り（万円/坪） */}
        <div className="relative h-[160px] w-8 text-right text-[11px] text-muted">
          {ticks.map((t) => (
            <span key={t} className="absolute right-0 -translate-y-1/2" style={{ top: y(t) }}>
              {Math.round(t / 10_000)}
            </span>
          ))}
        </div>
        <div className="relative h-[160px] border-b border-line">
          {ticks.slice(1).map((t) => (
            <div key={t} className="absolute inset-x-0 border-t border-divider" style={{ top: y(t) }} />
          ))}
          {data.ownUnit !== null && <div className="absolute inset-x-0 border-t-2 border-dashed border-[#e5262a]/70" style={{ top: y(data.ownUnit) }} />}
          <div className="absolute inset-0 grid items-end gap-1.5 px-1" style={{ gridTemplateColumns: `repeat(${data.series.length}, minmax(0, 1fr))` }}>
            {data.series.map((s) => {
              const faint = s.count < FEW_TRADES || !!s.partial;
              return (
                <div key={`${s.year}${s.half}`} className="relative flex h-full flex-col items-center justify-end" title={`${s.year}${s.half}：${s.count}件`}>
                  {s.unitMedian !== null && (
                    <>
                      <span className={`relative z-10 mb-0.5 whitespace-nowrap rounded bg-white/80 px-0.5 text-[11px] font-bold ${faint ? "text-muted" : "text-ink"}`}>{tsubo(s.unitMedian)}</span>
                      <div className={`w-full max-w-[44px] rounded-t ${faint ? "bg-[#2563eb]/30" : "bg-[#2563eb]"}`} style={{ height: `${(s.unitMedian / top) * 100}%` }} />
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>
        <div />
        <div className="grid gap-1.5 px-1 pt-1" style={{ gridTemplateColumns: `repeat(${data.series.length}, minmax(0, 1fr))` }}>
          {data.series.map((s) => (
            <div key={`${s.year}${s.half}`} className="whitespace-nowrap text-center text-[11px] leading-tight text-sub">
              {s.year}
              <div>
                {s.half}
                {s.partial && <span className="text-muted">*</span>}
              </div>
              <div className="text-muted">{s.count}件</div>
            </div>
          ))}
        </div>
      </div>
      <div className="mt-2 grid gap-0.5 text-[11px] text-muted">
        <div>
          単位は万円/坪（延床面積あたり）。薄い棒は取引が{FEW_TRADES}件未満の半年{data.series.some((s) => s.partial) ? "と、データが途中までの半年（*）" : ""}で、ぶれが大きい値です。
          {data.series.find((s) => s.partial) && ` *は${data.series.find((s) => s.partial)!.partial}の分だけです。`}
        </div>
        <div>区全体の取引です（地図の円の中に限りません）。取引はいまの取込分で計算するため、価格分析タブの相場と件数が違うことがあります。</div>
        <div>出典：不動産取引価格情報（国土交通省）。戸建てだけで、事情のある取引（調停・競売・関係者間など）は除いています。計算はシステムで行っています。</div>
      </div>
    </Card>
  );
}

function Tile({ label, value, sub, big = false, small = false, warn = false }: { label: string; value: string; sub?: string; big?: boolean; small?: boolean; warn?: boolean }) {
  return (
    <div className="min-w-0 rounded-lg border border-line bg-subtle/60 px-3 py-2.5">
      <div className="text-[12px] text-sub">{label}</div>
      <div className={`font-bold text-ink ${big ? "text-[20px]" : small ? "text-[13px]" : "text-[16px]"}`}>{value}</div>
      {sub && <div className={`text-[11px] ${warn ? "text-accent" : "text-muted"}`}>{sub}</div>}
    </div>
  );
}

/** 目盛りの上限：最大値の1.15倍を、10万円/坪単位に切り上げる */
function niceMax(v: number): number {
  const step = 100_000;
  return Math.max(step, Math.ceil((v * 1.15) / step) * step);
}
