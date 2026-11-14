-- 通学区域一覧に、長岡市（D41）と燕市（D42）を足す（2026-11-11）
-- 国土数値情報の学区（D12 小学校区・D13 中学校区）に長岡市・燕市が入っていないため、市の一覧で補う
-- 一覧に市町村の列が無いと、同じ町名（例：新潟市と燕市の「緑町」）を取り違えるので、city_code を足す
--   新潟市は区ではなく市のコード 15100（区は ward の列と読み取ったページで分ける）
--
-- 前のコード（main・develop-v4。2026-11-12 時点）も、このDBでそのまま動くようにする（2026-11-12 小林さんと決定）
--   前のコードは school_zone_rules を市で絞らずに読むため、長岡市・燕市の行が見えると新潟市の物件の学区を取り違える
--   そこで、全市の行を持つ表を school_zone_rules_all にし、school_zone_rules は新潟市の行だけを見せるビューにする
--   新しいコードは school_zone_rules_all を読む。前のコードの新潟市の取り込み（D14）は、ビューを通して入れられる
--   （単純なビューなので行の追加・削除ができる。city_code は既定値の 15100 になる）
--   前のコードを使わなくなったら、ビューを消し、表の名前を school_zone_rules に戻してよい

alter table public.school_zone_rules rename to school_zone_rules_all;
alter table public.school_zone_rules_all add column city_code text not null default '15100';
comment on table public.school_zone_rules_all is '通学区域一覧（新潟市 D14・長岡市 D41・燕市 D42）。町名・丁目・番地 → 小学校・中学校';
comment on column public.school_zone_rules_all.city_code is '市のコード（新潟市 15100・長岡市 15202・燕市 15213）。新潟市は区に分けない。既定値 15100 は前のコードの取り込みのため';
comment on column public.school_zone_rules_all.lot_ranges is '読み取った番・号の範囲（例：[{"ban":[2,2],"go":[[1,8]]}]）。「附表に示す区域を除く」は {"except":[…]}。読み取れない書き方は null';

drop index if exists public.school_zone_rules_town_idx;
create index on public.school_zone_rules_all (city_code, town);

-- 前のコード用：新潟市の行だけ。security_invoker で、読む人の権限（RLS）のまま読む
create view public.school_zone_rules with (security_invoker = true) as
  select id, dataset_id, ward, town, chome, town_text, lot_scope, lot_text, lot_ranges, elementary_school, junior_high_school, source_url
  from public.school_zone_rules_all
  where city_code = '15100';
comment on view public.school_zone_rules is '前のコード（2026-11-12 時点の main・develop-v4）用。新潟市の行だけを見せる。新しいコードは school_zone_rules_all を使う';

insert into public.datasets (id, category, name, provider, as_of, method, usage, attribution) values
  ('D41', '学区', '長岡市立学校通学区域規則', '長岡市教育委員会', null, 'ファイル',
   '長岡市の物件で、住所の町・丁目（と附表の番地）から小学校・中学校を決める', '出典：長岡市立学校通学区域規則（長岡市例規集）'),
  ('D42', '学区', '学校区一覧', '燕市教育委員会', null, 'ファイル',
   '燕市の物件で、住所の町・丁目から小学校・中学校を決める（行政区で分かれる町は要確認）', '出典：燕市「学校区一覧」（燕市オープンデータ、CC BY 4.0）')
on conflict (id) do nothing;
