import { SpinnerIcon } from "../../../_components/icons";
import { card } from "../../../_lib/ui";

// 販売戦略の画面を開くあいだ、すぐ出す画面（2026-11-05 浩平さん指摘「処理は続いているが画面が切り替わらず分かりにくい」）
// 物件情報の保存のあと、ここが先に出て、画面ができると戦略づくりの進み具合（StrategyRunner）に替わる

export default function Loading() {
  return (
    <div className="grid gap-4">
      <div className={`${card} flex items-center gap-3 p-5`} role="status">
        <SpinnerIcon className="size-5 shrink-0 animate-spin text-primary" />
        <div>
          <div className="text-[14px] font-bold text-ink">販売戦略の画面を開いています…</div>
          <div className="mt-0.5 text-[12px] text-sub">作り直すときは、開いたあと周辺情報の取得と戦略づくりが始まり、ここに進み具合が出ます。</div>
        </div>
      </div>
      <div className={`${card} h-48 animate-pulse bg-subtle`} aria-hidden />
      <div className={`${card} h-32 animate-pulse bg-subtle`} aria-hidden />
    </div>
  );
}
