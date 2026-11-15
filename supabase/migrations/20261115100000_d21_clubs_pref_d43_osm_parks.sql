-- D21 放課後児童クラブを新潟県全体にし、D22 公園を OSM で補う D43 を足す（2026-11-15）
--
-- D21：各市町村のホームページの一覧を写した CSV（data/manual/放課後児童クラブ.csv）を正本にして入れる
--   取り込みは scripts/ingest/jobs/d21-clubs.ts（npm run ingest -- d21-clubs）。時点（as_of）は取り込みのとき、CSV の確認日の年月に直す
--   新潟市もオープンデータ（2017-03、ひまわりクラブだけ）から、市のホームページの一覧（ひまわりクラブ・民設）に入れ替えた
--   一覧が見つからなかった市町村は事実シートで「取得できず」にする（lib/facts/build.ts、docs/参考/放課後児童クラブ調査_2026-11-14.md）
-- D43：公園（OpenStreetMap、新潟市以外）。新潟市は D22（新潟市オープンデータ）を使う
--   取り込みは scripts/ingest/jobs/osm-parks.ts（npm run ingest -- osm-parks。D28 と同じ Geofabrik のファイル）

update public.datasets set
  -- 事実シートの出典は「提供元 名前」の形なので、名前に提供元を重ねない（「各市町村のホームページ（燕市はオープンデータ） 放課後児童クラブ」）
  name = '放課後児童クラブ',
  provider = '各市町村のホームページ（燕市はオープンデータ）',
  as_of = null,
  method = '手で整備（CSV）',
  usage = '最寄りまでの距離（一覧が見つからない市町村を除く新潟県全体）',
  attribution = '出典：各市町村のホームページの放課後児童クラブの一覧を加工して作成（燕市：燕市オープンデータ、クリエイティブ・コモンズ・ライセンス 表示 4.0 国際）'
where id = 'D21';

insert into public.datasets (id, category, name, provider, as_of, method, usage, attribution)
select 'D43', category, '公園（OSM、新潟市以外）', 'OpenStreetMap（Geofabrik 中部地方）', null, 'ファイル（月1回）',
  '1km以内の数・最寄り（新潟市以外。新潟市は D22 を使う）', '© OpenStreetMap contributors（ODbL）'
from public.datasets where id = 'D22'
on conflict (id) do nothing;
