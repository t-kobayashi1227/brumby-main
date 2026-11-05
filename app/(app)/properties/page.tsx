import Link from "next/link";
import { getSql } from "../../../lib/db";
import { JUST_REGISTERED_MINUTES, strategyState } from "../../../lib/listView";
import { PlusIcon } from "../../_components/icons";
import { btnAction, emptyState } from "../../_lib/ui";
import PropertyTable, { type PropertyRow } from "./PropertyTable";

// 物件一覧。物件ごとに販売戦略の作成状態と第1ターゲット（AIの案）を出し、行か「詳細を見る」で販売戦略の画面（/strategy/[id]）を開く
// 検索（物件ID・住所）と販売戦略の状態での絞り込み、価格・最終更新での並び替えは画面の中で行う（PropertyTable）
// 2026-11-05 浩平さんの UI/UX レビューで、「完了」を「戦略作成済み」に、区分は物件IDの横に小さく、最終更新を追加
// 新しい物件は右上の「新規登録」から入力する（/properties/new）
// 「登録して販売戦略を作成」を押すと物件はその時点で保存されるので、戦略づくりの途中で一覧に戻っても出る。並びの既定は新しく登録した順

export const dynamic = "force-dynamic";

export default async function PropertyListPage() {
  const rows = await getSql()<
    {
      id: string;
      code: string;
      property_class: string;
      address: string;
      price_man_yen: number;
      layout: string;
      latest: string | null;
      just_registered: boolean;
      first_target: string | null;
      updated_at: Date;
    }[]
  >`
    select p.id, p.code, p.property_class, p.address, p.price_man_yen, p.layout, r.status as latest,
      (r.status is null and p.geog is not null and p.created_at > now() - make_interval(mins => ${JUST_REGISTERED_MINUTES})) as just_registered,
      (select done.result -> '戦略' -> 'targets' -> 0 ->> 'name' from strategy_runs done
        where done.property_id = p.id and done.status = 'succeeded' and done.form = '3回' order by done.finished_at desc limit 1) as first_target,
      greatest(p.updated_at, r.created_at, r.finished_at) as updated_at
    from properties p
    left join lateral (select status, created_at, finished_at from strategy_runs where property_id = p.id order by created_at desc limit 1) r on true
    order by p.id
  `;

  const data: PropertyRow[] = rows.map((p) => ({
    id: p.id,
    code: p.code,
    propertyClass: p.property_class,
    address: p.address,
    priceManYen: p.price_man_yen,
    layout: p.layout,
    strategy: strategyState(p.latest, p.just_registered),
    firstTarget: p.first_target,
    updatedAt: p.updated_at.toISOString(),
  }));

  return (
    <div className="grid gap-4">
      <div className="flex items-center">
        <div className="text-[13px] text-body mr-auto">登録物件 {rows.length}件</div>
        <Link href="/properties/new" className={btnAction}>
          <PlusIcon className="size-4" />
          新規登録
        </Link>
      </div>
      {rows.length === 0 ? (
        <div className={emptyState}>物件がありません。「新規登録」から物件情報を入力してください。</div>
      ) : (
        <PropertyTable rows={data} />
      )}
    </div>
  );
}
