"use client";

import { FEW_TRADES, type AreaPriceData } from "../../../../lib/area-price";
import { formatNumber } from "../../../../lib/facts/format";
import { YenIcon } from "../../../_components/icons";
import { Card } from "./parts";

// サマリーの「周辺の価格相場」（2026-11-03）。数字はすべてプログラムで出したもの（lib/area-price.ts）。AIは使わない
// 区×築年数帯の戸建ての取引（不動産取引価格情報）の総額の中央値・価格帯・直近1年の件数と、半年ごとの中央値の推移

const man = (yen: number) => formatNumber(Math.round(yen / 10_000));

export default function AreaPrice({ data }: { data: AreaPriceData | null }) {
  if (!data) {
    return (
      <Card title="周辺の価格相場" icon={YenIcon}>
        <div className="text-[13px] text-sub">物件のある区の、同じ築年数の戸建ての取引が見つからないため、価格相場を出せません。</div>
      </Card>
    );
  }
  const values = data.series.flatMap((s) => (s.median === null ? [] : [s.median]));
  const top = niceMax(Math.max(...values, data.ownPrice));
  const ticks = [0, top / 2, top];
  const ownPct = (data.ownPrice / top) * 100;

  return (
    <Card title={`周辺の価格相場（${data.ward}・${data.band}の戸建て）`} icon={YenIcon}>
      <div className="grid grid-cols-3 gap-2 max-sm:grid-cols-1">
        <Tile label="価格の中央値" value={`${man(data.median)}万円`} big />
        <Tile label="価格帯（中央の半分）" value={`${man(data.p25)}〜${man(data.p75)}万円`} />
        <Tile label="直近1年の取引件数" value={`${data.recent.count}件`} sub={`${data.recent.from}〜${data.recent.to}`} />
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-0.5 text-[12px] text-sub">
        <span>
          この物件 <b className="text-ink">{man(data.ownPrice)}万円</b>
        </span>
        <span>
          延床の坪単価の中央値 <b className="text-ink">{(Math.round(data.unitMedian / 1000) / 10).toFixed(1)}万円/坪</b>
        </span>
        <span>
          {data.fromYear}〜{data.toYear}年の取引 {data.count}件から
        </span>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1">
        <div className="text-[13px] font-bold text-ink">価格の推移（半年ごとの中央値）</div>
        <span className="inline-flex items-center gap-1.5 text-[11px] text-sub">
          <span className="w-5 border-t-2 border-dashed border-[#e5262a]/70" />
          この物件 {man(data.ownPrice)}万円
        </span>
      </div>
      <div className="mt-2 grid grid-cols-[auto_minmax(0,1fr)] gap-x-2">
        {/* 目盛り */}
        <div className="relative h-[160px] w-10 text-right text-[11px] text-muted">
          {ticks.map((t) => (
            <span key={t} className="absolute right-0 -translate-y-1/2" style={{ top: `${100 - (t / top) * 100}%` }}>
              {formatNumber(Math.round(t / 10_000))}
            </span>
          ))}
        </div>
        <div className="relative h-[160px] border-b border-line">
          {ticks.slice(1).map((t) => (
            <div key={t} className="absolute inset-x-0 border-t border-divider" style={{ top: `${100 - (t / top) * 100}%` }} />
          ))}
          {/* この物件の価格の線 */}
          <div className="absolute inset-x-0 border-t-2 border-dashed border-[#e5262a]/70" style={{ top: `${100 - ownPct}%` }}>
            
          </div>
          <div
            className="absolute inset-0 grid items-end gap-2 px-1"
            style={{
              gridTemplateColumns: `repeat(${data.series.length}, minmax(0, 1fr))`,
            }}
          >
            {data.series.map((s) => {
              const few = s.count < FEW_TRADES;
              return (
                <div key={s.label} className="relative flex h-full flex-col justify-end items-center" title={`${s.label}：${s.count}件`}>
                  {s.median !== null && (
                    <>
                      <span className={`mb-0.5 text-[11px] font-bold ${few ? "text-muted" : "text-ink"}`}>{man(s.median)}</span>
                      <div className={`w-full max-w-[44px] rounded-t ${few ? "bg-[#2563eb]/30" : "bg-[#2563eb]"}`} style={{ height: `${(s.median / top) * 100}%` }} />
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>
        <div />
        <div
          className="grid gap-2 px-1 pt-1"
          style={{
            gridTemplateColumns: `repeat(${data.series.length}, minmax(0, 1fr))`,
          }}
        >
          {data.series.map((s) => (
            <div key={s.label} className="text-center text-[11px] leading-tight text-sub">
              {s.label}
              <div className="text-muted">{s.count}件</div>
            </div>
          ))}
        </div>
      </div>
      <div className="mt-2 grid gap-0.5 text-[11px] text-muted">
        <div>
          単位は万円。薄い棒は取引が{FEW_TRADES}
          件未満の半年で、ぶれが大きい値です。
        </div>
        <div>総額は家の広さで変わります。この物件との比べ方は、価格分析タブの坪単価の比較をご覧ください。</div>
        <div>出典：不動産取引価格情報（国土交通省）。戸建てだけで、事情のある取引（調停・競売・関係者間など）は除いています。価格の計算はシステムで行っています。</div>
      </div>
    </Card>
  );
}

function Tile({ label, value, sub, big = false }: { label: string; value: string; sub?: string; big?: boolean }) {
  return (
    <div className="rounded-lg border border-line bg-subtle/60 px-3 py-2.5">
      <div className="text-[12px] text-sub">{label}</div>
      <div className={`font-bold text-ink ${big ? "text-[22px]" : "text-[16px]"}`}>{value}</div>
      {sub && <div className="text-[11px] text-muted">{sub}</div>}
    </div>
  );
}

/** 目盛りの上限：最大値の1.15倍を、1,000万円単位に切り上げる */
function niceMax(v: number): number {
  const step = 10_000_000;
  return Math.max(step, Math.ceil((v * 1.15) / step) * step);
}
