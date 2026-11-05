import { getSql } from "../../../../lib/db";
import { loadCompetitorCandidates } from "../../../../lib/competitors-load";
import PropertyForm from "../PropertyForm";

// ①物件情報の入力（docs/設計まとめ.md「①物件情報の入力」）。登録すると物件の画面へ進み、地図で位置を確かめる
// 見出しはこの画面で出す（ヘッダーの題名は routes.ts の ownHeading で消している）

export const dynamic = "force-dynamic";

export default async function NewPropertyPage() {
  // 競合に選べる物件（販売戦略を作った物件）。まだ位置がないので、戦略を作った日が新しい順
  const candidates = await loadCompetitorCandidates(getSql(), null);
  return (
    <PropertyForm
      competitorCandidates={candidates}
      heading={
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h1 className="text-[22px] font-bold text-ink">物件情報の入力</h1>
          <p className="text-[13px] text-sub">物件の基本情報を入力すると、データをもとにAIが販売戦略を考えます。</p>
        </div>
      }
    />
  );
}
