import { getSql } from "../../../lib/db";
import { recordState, saleState } from "../../../lib/listView";
import { card, emptyState } from "../../_lib/ui";
import RecordTable, { type RecordRow } from "./RecordTable";

// 販売記録の一覧（docs/設計まとめ.md「販売記録」）。実際の販売活動と結果を物件ごとに記録・確認する
// 2026-11-05 浩平さんの UI/UX レビューで、物件一覧（販売戦略の作成状態）と役割を分けた
// - 販売状況は販売記録の入力（sales_records.status）だけで決め、販売戦略の有無は出さない。まだ入れていなければ「未設定」
// - 媒体ごとの実績（media_results）が1行もなければ「未記録」。実績を入れて問い合わせが0件だった物件（0件）と分ける
// - 並びは販売中の物件が先（lib/listView.ts の SALE_STATES の順）
// 行か右端のボタンで、その物件の記録の画面（/records/[id]）を開く

export const dynamic = "force-dynamic";

export default async function RecordListPage() {
  const rows = await getSql()<
    {
      id: string;
      code: string;
      address: string;
      status: string | null;
      listed_on: string | null;
      media_count: number;
      cost: string | null;
      cost_filled: number;
      inquiries: number | null;
      inquiries_filled: number;
      viewings: number | null;
      viewings_filled: number;
      updated_at: Date | null;
    }[]
  >`
    select p.id, p.code, p.address, s.status, s.listed_on::text,
      count(m.id)::int as media_count,
      sum(m.cost_man_yen) as cost, count(m.cost_man_yen)::int as cost_filled,
      sum(m.inquiries)::int as inquiries, count(m.inquiries)::int as inquiries_filled,
      sum(m.viewings)::int as viewings, count(m.viewings)::int as viewings_filled,
      greatest(s.updated_at, max(m.created_at)) as updated_at
    from properties p
    left join sales_records s on s.property_id = p.id
    left join media_results m on m.property_id = p.id
    group by p.id, s.property_id
    order by p.id
  `;

  const data: RecordRow[] = rows.map((r) => ({
    id: r.id,
    code: r.code,
    address: r.address,
    sale: saleState(r.status),
    record: recordState(r.media_count),
    listedOn: r.listed_on,
    // 入っていない行があれば「一部未入力」と分かるようにする（推測で0にしない）
    cost: { sum: r.cost === null ? null : Number(r.cost), partial: r.cost_filled < r.media_count },
    inquiries: { sum: r.inquiries, partial: r.inquiries_filled < r.media_count },
    viewings: { sum: r.viewings, partial: r.viewings_filled < r.media_count },
    updatedAt: r.updated_at ? r.updated_at.toISOString() : null,
  }));

  const selling = data.filter((r) => r.sale === "販売中").length;
  const recorded = data.filter((r) => r.record === "記録あり").length;

  return (
    <div className="grid gap-4">
      <p className="text-[13px] text-body">
        各物件の実際の販売活動とその結果を記録します。ここで入力したデータは、今後AIに渡す学習データとして蓄積し、件数が貯まったら媒体ごとの費用の目安などを集計して販売戦略の根拠に使います。
      </p>
      {rows.length === 0 ? (
        <div className={emptyState}>物件がありません。「物件一覧」から物件を登録してください。</div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-3">
            <Stat label="販売中" value={selling} note={`全${data.length}件中`} />
            <Stat label="活動記録あり" value={recorded} note="媒体の実績を1件以上記録" />
            <Stat label="活動未記録" value={data.length - recorded} note="まだ記録がない物件" warn={data.length - recorded > 0} />
          </div>
          {recorded === 0 && (
            <div className={`${card} border-dashed px-5 py-4 text-[13px] text-body`}>
              <div className="font-bold text-ink">販売活動の記録はまだありません</div>
              <div className="mt-1">販売開始日、媒体の利用、問い合わせ、内見、費用などを記録すると、販売戦略の振り返りに活用できます。各物件の「記録する」から入力してください。</div>
            </div>
          )}
          <RecordTable rows={data} />
        </>
      )}
    </div>
  );
}

function Stat({ label, value, note, warn = false }: { label: string; value: number; note: string; warn?: boolean }) {
  return (
    <div className={`${card} px-5 py-4`}>
      <div className="text-[12px] font-bold text-body">{label}</div>
      <div className={`mt-1 text-[22px] font-bold tabular-nums ${warn ? "text-[#b25e09]" : "text-ink"}`}>
        {value}
        <span className="ml-0.5 text-[13px]">件</span>
      </div>
      <div className="text-[11px] text-muted">{note}</div>
    </div>
  );
}
