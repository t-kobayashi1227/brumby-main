import Link from "next/link";
import { getSql } from "../../../lib/db";
import { formatNumber } from "../../../lib/facts/format";
import { daysOnMarket, salesStage, type SalesStage } from "../../../lib/records";
import { card, emptyState, tableHead } from "../../_lib/ui";

// 販売実績の一覧（docs/設計まとめ.md「販売実績」）。登録した物件ごとに、ステータスと媒体の実績の合計を出す
// ステータスは販売実績の入力と販売戦略の作成状況から決め、色分けのバッジで出す（lib/records.ts の salesStage）
// 行を押すと、その物件の記録の画面（/records/[id]）を開く

export const dynamic = "force-dynamic";

const COLS = "grid-cols-[1.1fr_2fr_1fr_0.9fr_0.8fr_0.8fr_0.8fr_0.8fr]";

// 段階が進むほど濃い色にする。販売中止は灰色
const STAGE_BADGE: Record<SalesStage, string> = {
  未着手: "bg-[#f1f3f6] text-muted",
  戦略作成中: "bg-[#fff4e0] text-[#b25e09]",
  戦略作成済み: "bg-[#f1ebfb] text-[#6b3fb8]",
  販売中: "bg-primary-soft text-primary",
  販売済み: "bg-[#e9f8ec] text-[#157347]",
  販売中止: "bg-[#eceef2] text-[#5b6476]",
};

export default async function RecordListPage() {
  const rows = await getSql()<
    {
      id: string;
      code: string;
      address: string;
      status: string | null;
      strategy_done: boolean;
      strategy_latest: string | null;
      listed_on: string | null;
      contracted_on: string | null;
      media_count: number;
      cost: string | null;
      inquiries: number | null;
    }[]
  >`
    select p.id, p.code, p.address, s.status,
      exists (select 1 from strategy_runs done where done.property_id = p.id and done.status = 'succeeded') as strategy_done,
      (select r.status from strategy_runs r where r.property_id = p.id order by r.created_at desc limit 1) as strategy_latest,
      s.listed_on::text, s.contracted_on::text,
      count(m.id)::int as media_count, sum(m.cost_man_yen) as cost, sum(m.inquiries)::int as inquiries
    from properties p
    left join sales_records s on s.property_id = p.id
    left join media_results m on m.property_id = p.id
    group by p.id, s.property_id
    order by p.id
  `;

  return (
    <div className="grid gap-4">
      <p className="text-[13px] text-body">
        実際に販売した結果を物件ごとに記録します。ここで入力したデータは、今後AIに渡す学習データとして蓄積します。件数が貯まったら、媒体ごとの費用の目安などを集計して販売戦略の根拠に使います。
      </p>
      {rows.length === 0 ? (
        <div className={emptyState}>物件がありません。「物件一覧」から物件を登録してください。</div>
      ) : (
        <div className={`${card} p-5`}>
          <div className={`${tableHead} ${COLS} text-[12px] text-muted`}>
            <div>物件ID</div>
            <div>住所</div>
            <div>ステータス</div>
            <div>販売開始日</div>
            <div>成約まで</div>
            <div>媒体の行数</div>
            <div>費用の合計</div>
            <div>問い合わせ</div>
          </div>
          {rows.map((r) => {
            const days = daysOnMarket(r.listed_on, r.contracted_on);
            const stage = salesStage(r.status, { hasSucceeded: r.strategy_done, latest: r.strategy_latest });
            return (
              <Link key={r.id} href={`/records/${r.id}`} className={`grid ${COLS} gap-2 px-1 py-3 border-b border-canvas text-[13px] text-ink hover:bg-subtle`}>
                <div className="font-bold">{r.code}</div>
                <div>{r.address}</div>
                <div>
                  <span className={`inline-block whitespace-nowrap rounded-full px-2.5 py-0.5 text-[11px] font-bold ${STAGE_BADGE[stage]}`}>{stage}</span>
                </div>
                <div className="tabular-nums">{r.listed_on ?? "―"}</div>
                <div className="tabular-nums">{days !== null ? `${formatNumber(days)}日` : "―"}</div>
                <div className="tabular-nums">{r.media_count}件</div>
                <div className="tabular-nums">{r.cost !== null ? `${formatNumber(Number(r.cost), 1)}万円` : "―"}</div>
                <div className="tabular-nums">{r.inquiries !== null ? `${r.inquiries}件` : "―"}</div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
