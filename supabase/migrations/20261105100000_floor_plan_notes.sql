-- 間取り図から読み取った特徴（2026-11-05 浩平さん依頼）
-- 入力画面で間取り図の画像を AI に1回読ませ、書き出した文を担当者が確かめて保存する。画像そのものは保存しない
-- null は入力なし。事実シートでは、入力があるときだけ P の事実にする
alter table public.properties add column if not exists floor_plan_notes text;
alter table public.properties add constraint properties_floor_plan_notes_length check (floor_plan_notes is null or char_length(floor_plan_notes) <= 2000);
