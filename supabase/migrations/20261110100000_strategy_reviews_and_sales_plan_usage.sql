-- 今の Supabase（brumby-poc）にだけあった表と列を、マイグレーションにする（2026-11-10）
-- 誰がいつ作ったかは不明。どれも中身は空だったが、新しいDBにも残すため、今の定義をそのまま写す

-- 販売の記録に、どの実行の戦略を使ったかと、その使い方を持たせる
alter table public.sales_records
  add column if not exists strategy_run_id bigint references public.strategy_runs (id) on delete set null,
  add column if not exists plan_usage text;
alter table public.sales_records drop constraint if exists sales_records_plan_usage_check;
alter table public.sales_records add constraint sales_records_plan_usage_check
  check (plan_usage = any (array['そのまま使った', '一部変えて使った', '使わなかった']));

-- 戦略の評価（1つの実行に1件）
create table if not exists public.strategy_reviews (
  id bigint generated always as identity primary key,
  run_id bigint not null unique references public.strategy_runs (id) on delete cascade,
  reviewer text not null default '小林',
  scores jsonb not null,
  comments jsonb not null default '{}'::jsonb,
  revised_output jsonb not null,
  status text not null default 'draft' check (status in ('draft', 'approved')),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  approved_at timestamptz,
  check ((status = 'approved') = (approved_at is not null)),
  constraint strategy_reviews_scores_check check (
    (scores ->> 'target')::int between 1 and 5
    and (scores ->> 'appeal')::int between 1 and 5
    and (scores ->> 'evidence')::int between 1 and 5
    and (scores ->> 'media')::int between 1 and 5
    and (scores ->> 'budget')::int between 1 and 5
  )
);

create index if not exists strategy_reviews_run_id_idx on public.strategy_reviews (run_id);

create or replace trigger strategy_reviews_set_updated_at
  before update on public.strategy_reviews
  for each row execute function public.set_updated_at();

alter table public.strategy_reviews enable row level security;

-- 取引価格の列の説明（今の Supabase にだけあったもの）
comment on column public.transactions.year is '取引の年';
comment on column public.transactions.trade_price is '取引の総額（円）';
comment on column public.transactions.land_sqm is '土地面積';
comment on column public.transactions.floor_sqm is '延床面積';
comment on column public.transactions.building_year is '建築年';
comment on column public.transactions.raw is 'PricePerUnit：坪単価、UnitPrice：㎡単価';