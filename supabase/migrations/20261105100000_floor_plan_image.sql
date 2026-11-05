-- 間取り図の画像（2026-11-05 浩平さん依頼）
-- 物件に添付して保存し、戦略を作るときに戦略担当の呼び出しにだけ添える。null は添付なし
-- 画面で長い辺 2,000px の JPEG に縮めてから送る。上限は 3MB（lib/floor-plan.ts）
alter table public.properties add column if not exists floor_plan_image bytea;
alter table public.properties add column if not exists floor_plan_image_type text;
alter table public.properties add constraint properties_floor_plan_image_check check (
  (floor_plan_image is null and floor_plan_image_type is null)
  or (floor_plan_image_type in ('image/png', 'image/jpeg', 'image/webp') and octet_length(floor_plan_image) <= 3145728)
);
