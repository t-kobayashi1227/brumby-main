-- 庭・リフォームを任意にする（2026-11-03 浩平さん指示。物件資料に書かれておらず不明なことがあるため）
-- null は「不明（入力なし）」。事実シートでは「不明」と出す
-- 交通（property_transports）は行が無ければ入力なしなので、表は変えない

alter table public.properties alter column has_garden drop not null;
alter table public.properties alter column renovated drop not null;

-- リフォームの年と箇所は「あり」のときだけ持つ。renovated が null のときも持たない
-- （元の check は renovated が null だと通ってしまうため、is true で書き直す）
alter table public.properties drop constraint if exists properties_check;
alter table public.properties add constraint properties_renovation_detail_check
  check (renovated is true or (renovation_year is null and renovation_parts is null));
