-- D40 スーパー・ドラッグストア・コンビニ（Overture Maps Places）を、データの一覧に足す（2026-11-11）
-- OSM（D28）は新潟市以外の店が大きく抜けているため、OSM と大規模小売店舗一覧（D29）に無い店を Overture で補う
-- 取り込みは scripts/ingest/jobs/overture.ts（npm run ingest -- overture date=<ダウンロードした日>）

insert into public.datasets (id, category, name, provider, as_of, method, usage, attribution) values
  ('D40', '買い物', 'スーパー・ドラッグストア・コンビニ（Overture）', 'Overture Maps Foundation', null, 'ファイル',
   'OSM・大規模小売店舗一覧に無い店を補う（同じ種類・同じチェーンの店が100m以内、または同じ種類の店が30m以内に無ければ追加）',
   '© Overture Maps Foundation（CDLA Permissive 2.0。Foursquare 由来の分は Apache 2.0）')
on conflict (id) do nothing;
