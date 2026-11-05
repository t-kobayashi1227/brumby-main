-- 物件の画像（外観・内観・間取り図。2026-11-05 浩平さん依頼）
-- 枠ごとに1枚。戦略を作るときに戦略担当の呼び出しにだけ添える
-- 画面で長い辺 2,000px の JPEG に縮めてから送る。上限は 3MB（lib/property-images.ts）
create table public.property_images (
  property_id bigint not null references public.properties (id) on delete cascade,
  kind text not null check (kind in ('外観', '内観', '間取り図')),
  image bytea not null check (octet_length(image) <= 3145728),
  media_type text not null check (media_type in ('image/png', 'image/jpeg', 'image/webp')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (property_id, kind)
);

create trigger property_images_set_updated_at
  before update on public.property_images
  for each row execute function public.set_updated_at();

-- 表はサーバー側から service role キーで読み書きする（ほかの表と同じ）
alter table public.property_images enable row level security;
