-- 競合物件を、本システムで販売戦略を作った別の物件から選ぶ（2026-11-05 浩平さん依頼）
-- 1物件につき最大3件。競合の物件情報・特徴・その物件の販売戦略（AIの見立て）を引用し、この物件と比べる
-- 手で入れる競合（competitors 表）は使わなくなった。過去のデータを残すため表は消さない
create table public.property_competitors (
  property_id bigint not null references public.properties (id) on delete cascade,
  competitor_id bigint not null references public.properties (id) on delete cascade,
  position smallint not null check (position between 1 and 3),
  created_at timestamptz not null default now(),
  primary key (property_id, position),
  unique (property_id, competitor_id),
  check (property_id <> competitor_id)
);

create index on public.property_competitors (competitor_id);

-- 表はサーバー側から service role キーで読み書きする（ほかの表と同じ）
alter table public.property_competitors enable row level security;
