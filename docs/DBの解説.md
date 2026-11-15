# DBの解説（新潟県全体のDB）

新潟県全体に広げたDBの、表と列の解説です。2026-11-15 時点のローカルのDBから読み出して書きました（件数もその時点）。

- 仕様の正本は `docs/設計まとめ.md`、表の定義は `supabase/migrations/` です。食い違うときはマイグレーションが正しい形です。
- データの取り込み方は `docs/データ取り込み一覧.md`、取り込みのスクリプトは `scripts/ingest/` です。
- 段階1のときの表ごとの説明（`docs/DBの形.md`）より新しく、列ごとの説明を足したものです。

## 1. 全体の決まり

- **DB：** Supabase（PostgreSQL）。PostGIS は `extensions` スキーマに入っています（`extensions.st_distance` などと書きます）。大きさは約 814MB（2026-11-15）です。
- **座標：** WGS84（EPSG:4326）で持ちます。
  - 点（施設・物件・公示地・町の中心）は `geography` 型です。`ST_DWithin(geog, 物件, 1000)` で1km以内、`ST_Distance` で直線距離（m）をそのまま出せます。
  - 面（町・区域・メッシュ）は `geometry` 型です。点が入るかは `ST_Intersects(geom, 物件::geometry)` で判定します。
  - 位置と形の列には、すべて空間インデックス（GiST）があります。
- **距離：** すべて直線距離です。徒歩分には直しません。
- **RLS：** すべての表で有効です。ポリシーは作っていないので、ブラウザ（anon キー）からは読めません。サーバー側から `DATABASE_URL` の接続か service role キーで読み書きします。
- **データの出どころ：** 公的データの行には `dataset_id`（`datasets.id`）が付きます。元の行は `raw`（JSON）に残します。事実の「出典」「時点」は `datasets` から引きます。
- **選択肢の値：** 物件区分・施設の種類・区域の種類などは日本語の文字で持ち、`check` 制約で決まった値だけを受け付けます。値はそのまま事実や画面に使えます。
- **取れなかった値：** 空（null）にします。推測で埋めません。事実シートでは「取得できず」になります。
- **金額の単位：** 列の名前の `_man_yen` は万円、`trade_price` は円です。面積の `_sqm` は㎡です。

## 2. 表の一覧

| まとまり | 表 | 中身 | 件数 |
| --- | --- | --- | --- |
| データの管理 | `datasets` | 使うデータの一覧（D01〜D43、B01〜B06）。時点・出典の文言・件数 | 43 |
| | `ingest_logs` | 取り込みのたびの記録と、確かめた結果 | 56 |
| | `api_access_logs` | 不動産情報ライブラリ API のアクセスログ（利用規約で保存） | 16,783 |
| 公的データ | `towns` | 町丁・字の境界と町の中心（D39） | 7,703 |
| | `area_stats` | 町・区・市町村の統計（年齢・世帯・持ち家など）を縦持ち | 399,886 |
| | `population_mesh` | 250mメッシュの将来推計人口（D11） | 31,061 |
| | `facilities` | 施設20種（学校・保育・公園・役所・駅・バス停・買い物・医療など） | 19,178 |
| | `ward_facility_averages` | 区・市町村ごとの「町の中心から1km以内の施設の件数」の平均 | 1,036 |
| | `zones` | 区域の形（用途地域・学区・洪水・土砂・津波・液状化・盛土） | 827,710 |
| | `school_zone_rules_all` | 通学区域一覧（町名・丁目・番地 → 小学校・中学校） | 3,211 |
| | `school_zone_rules`（ビュー） | 前のコード用。`school_zone_rules_all` の新潟市の行だけ | ― |
| | `transactions` | 取引価格・成約価格（D01） | 76,030 |
| | `land_prices` | 地価公示・地価調査（D02・D03） | 957 |
| | `reference_stats` | 買い手・媒体の統計（年代・年収・探した方法・媒体の利用率） | 111 |
| 前提と選択肢 | `assumptions` | 前提値（金利・頭金・返済負担率・建物の単価など） | 14 |
| | `target_candidates` | ターゲット候補6つ | 6 |
| | `media` | 媒体一覧 C-01〜C-16 | 16 |
| 物件（①入力） | `properties` | 物件 | 45 |
| | `property_transports` | 物件資料の交通（最大2つ） | 48 |
| | `property_images` | 物件の画像（外観・内観・間取り図） | 41 |
| | `property_competitors` | 競合に選んだ物件（本システムで戦略を作った別の物件） | 20 |
| | `competitors` | 手で入れる競合（**今は使っていない**。過去のデータのため残す） | 0 |
| 事実シートとAI（③④） | `fact_sheets` | 事実シート（エージェントに渡した JSON） | 96 |
| | `strategy_runs` | 戦略の実行1回分（進み具合・費用・⑤に渡す結果） | 66 |
| | `agent_calls` | エージェントの呼び出し1回ごとの入力・出力・トークン数・費用 | 224 |
| | `check_results` | 点検の結果（プログラムと AI） | 296 |
| | `strategy_reviews` | 戦略の評価（人が付ける点数・直した結果） | 0 |
| 販売記録 | `sales_records` | 販売の結果（1物件1行） | 1 |
| | `media_results` | 媒体ごとの実績（物件×媒体×期間） | 1 |

件数は試し物件を含みます（物件45件はすべて新潟市内の試し物件）。

## 3. つながり

```
datasets ─┬─ towns ── transactions（town_key_code。今は使っていない）
          ├─ area_stats / population_mesh / facilities / zones / land_prices
          ├─ school_zone_rules_all / reference_stats / assumptions（dataset_id は任意）
          └─ ingest_logs

properties ─┬─ property_transports（最大2）
            ├─ property_images（枠ごとに1枚）
            ├─ property_competitors ── properties（競合に選んだ別の物件）
            ├─ competitors（使っていない）
            ├─ sales_records（1物件1行）── strategy_runs（使った戦略。任意）
            ├─ media_results（何行でも。media_id で媒体一覧を指す）
            └─ fact_sheets ── strategy_runs ─┬─ agent_calls ── check_results
                                             ├─ check_results
                                             └─ strategy_reviews（1実行に1件）
```

外部キーで消し方を決めています。物件を消すと、交通・画像・競合の選択・事実シート・実行・呼び出し・点検・販売記録もまとめて消えます（`on delete cascade`）。`datasets` の行を消すと、そのデータの行も消えます。

## 4. 表ごとの列

型の「geography」「geometry」は PostGIS の型、「jsonb」は JSON、「text[]」は文字の配列です。「必須」は空にできない列です。

### 4.1 データの管理

#### `datasets`（使うデータの一覧）

| 列 | 型 | 必須 | 説明 |
| --- | --- | --- | --- |
| `id` | text | ○ | データの番号。D＋設計まとめの No（D01〜D39）、あとから足した D40〜D43、買い手・ローンの前提の B01〜B06。D32・D37 は欠番 |
| `no` | smallint | | 設計まとめの「②使用するデータ」の No。D40 以降と B は空 |
| `category` | text | ○ | 分類（価格・規制・エリア・学区・施設・交通・買い物・医療・災害・買い手） |
| `name` | text | ○ | データの名前。事実シートの出典は「`provider` `name`」の形で出す |
| `provider` | text | ○ | 提供元 |
| `as_of` | text | | データの時点。取り込んだとき、実際のデータの年月に直す（例：`2026-10-24`、`2020`、`R6推計`） |
| `method` | text | | 取り方（API・ファイル・手で整備 など） |
| `usage` | text | | 何に使うか |
| `attribution` | text | | 画面の出典一覧に出す文言（ライセンスの表示） |
| `row_count` | integer | | 取り込んだ件数。空はまだ取り込んでいない（その事実は「取得できず」になる） |
| `loaded_at` | timestamptz | | 最後に取り込んだ日時 |
| `note` | text | | 備考 |
| `created_at` / `updated_at` | timestamptz | ○ | 行を作った日時・直した日時 |

#### `ingest_logs`（取り込みの記録）

| 列 | 型 | 必須 | 説明 |
| --- | --- | --- | --- |
| `id` | bigint | ○ | 通し番号 |
| `dataset_id` | text | ○ | 取り込んだデータ |
| `command` | text | ○ | 流したコマンド（例：`ingest d21-clubs`） |
| `status` | text | ○ | `succeeded`（成功）・`failed`（失敗） |
| `row_count` | integer | | 入れた件数 |
| `checks` | jsonb | | 確かめた結果（位置を出せなかった行、重複をまとめた数など。取り込みごとに項目が違う） |
| `error` | text | | 失敗したときのエラー |
| `started_at` / `finished_at` | timestamptz | ○ | 始めた日時・終わった日時 |

取り込みは1つのトランザクションで「古い行を消す → 入れる → 数える → `datasets` を直す」を行うので、失敗しても使っているデータは壊れません。

#### `api_access_logs`（API のアクセスログ）

不動産情報ライブラリ API の利用規約で、アクセスログの保存が求められています。消さないでください。

| 列 | 型 | 必須 | 説明 |
| --- | --- | --- | --- |
| `id` | bigint | ○ | 通し番号 |
| `api` | text | ○ | API の番号（例：`XIT001`、`XKT002`） |
| `endpoint` | text | ○ | 呼んだ URL（キーは含まない） |
| `params` | jsonb | | 渡した引数 |
| `status_code` | integer | | HTTP の応答コード |
| `response_bytes` | integer | | 応答の大きさ |
| `duration_ms` | integer | | かかった時間 |
| `requested_at` | timestamptz | ○ | 呼んだ日時 |

### 4.2 公的データ

#### `towns`（町丁・字の境界、D39）

| 列 | 型 | 必須 | 説明 |
| --- | --- | --- | --- |
| `key_code` | text | ○ | e-Stat 小地域の KEY_CODE（11桁）。主キー |
| `dataset_id` | text | ○ | `D39` |
| `city_code` | text | ○ | 市区町村コード（新潟市は区ごと：中央区 15103 など）。県内37区・市町村 |
| `ward` | text | ○ | 区・市町村の名前（新潟市は「西区」、ほかは「長岡市」） |
| `name` | text | | 町丁・字の名前 |
| `hcode` | smallint | | 小地域の種類（8101：町丁目、8154：水面 など） |
| `geom` | geometry | ○ | 町の形 |
| `center` | geography | ○ | 町の中心（区・市町村の平均件数を数える起点） |

物件の位置からこの表を引いて、区・市町村（比べる相手）を決めます。新潟市は区、それ以外は市町村が比べる相手です。

#### `area_stats`（町・区・市町村の統計）

| 列 | 型 | 必須 | 説明 |
| --- | --- | --- | --- |
| `id` | bigint | ○ | 通し番号 |
| `dataset_id` | text | ○ | D05〜D08（国勢調査 2020）、D10（新潟市の町名別人口。今は使っていない） |
| `area_level` | text | ○ | `町`・`区`・`市`（新潟市の区は「区」、ほかの市町村は「市」） |
| `area_key` | text | ○ | 町は KEY_CODE（無ければ町名）、区は「西区」、市町村は「長岡市」など |
| `ward` | text | | その町のある区・市町村 |
| `area_name` | text | ○ | 地域の名前 |
| `metric` | text | ○ | 項目（下の表） |
| `value` | numeric | | 値。秘匿などで無いものは空 |
| `unit` | text | | 単位（人・世帯） |
| `raw` | jsonb | | 元の行・注記 |

同じ `dataset_id`・`area_level`・`area_key`・`metric` は1行だけです（一意の制約）。項目（`metric`）はデータごとに次のとおりです。

| データ | 項目 |
| --- | --- |
| D05 年齢別人口 | 総数（年齢「不詳」含む）、総数0〜4歳 … 総数70〜74歳、総数75歳以上、総数15歳未満、総数15〜64歳、総数65歳以上（20項目） |
| D06 家族類型別世帯数 | 一般世帯総数、親族のみの世帯、核家族世帯、うち夫婦のみの世帯、うち夫婦と子供から成る世帯、核家族以外の世帯 など（9項目） |
| D07 持ち家・借家別 | 住宅に住む一般世帯、持ち家、民営借家 |
| D08 住宅の建て方別 | 主世帯数、一戸建、長屋建、共同住宅（階数別）、その他（9項目） |
| D10 町名別5歳階級人口 | 世帯数、人口計、5歳階級（26項目）。2026-11 から事実シートでは使っていない（国勢調査にそろえた） |

#### `population_mesh`（250mメッシュ将来推計人口、D11）

| 列 | 型 | 必須 | 説明 |
| --- | --- | --- | --- |
| `mesh_code` | text | ○ | メッシュの番号。主キー |
| `dataset_id` | text | ○ | `D11` |
| `geom` | geometry | ○ | メッシュの形 |
| `population` | jsonb | ○ | 年ごとの推計人口（`{"2020": 120, "2025": …, "2070": …, "市区町村コード": …}`） |

#### `facilities`（施設）

| 列 | 型 | 必須 | 説明 |
| --- | --- | --- | --- |
| `id` | bigint | ○ | 通し番号 |
| `dataset_id` | text | ○ | どのデータから入れたか（下の表） |
| `kind` | text | ○ | 施設の種類（20種類。下の表）。事実 L の種類の名前そのまま |
| `name` | text | ○ | 名前。同じ位置にまとめた放課後児童クラブは名前を並べたもの（例：「西小第一・第二・第三児童クラブ」） |
| `address` | text | | 住所（無いデータもある） |
| `departments` | text[] | | 医療の診療科（病院・診療所だけ）。`'小児科' = any(departments)` で探す |
| `attrs` | jsonb | | データごとの項目（下の表） |
| `source_ref` | text | | 元データの中での番号・ID |
| `geog` | geography | ○ | 位置（点） |
| `raw` | jsonb | | 元の行 |

種類とデータの組み合わせと件数です。同じ種類が複数のデータから入っているものは、`dataset_id` を分けずに `kind` で数えます（重なる店は取り込みのときに除いてある）。

| 種類（`kind`） | データ（件数） |
| --- | --- |
| 小学校・中学校 | D15（436）・D16（230）国土数値情報 P29 |
| 保育園・地域型保育 | D17（519）・D18（53）国土数値情報 P14 |
| 幼稚園・認定こども園 | D19（64）・D20（210）国土数値情報 P29 |
| 放課後児童クラブ | D21（416）各市町村のホームページの一覧 |
| 公園 | D22（1,327）新潟市OD（新潟市）、D43（732）OSM（新潟市以外） |
| 図書館 | D23（127）XKT017 を各館のホームページで直した CSV |
| 役所 | D24（38）国土数値情報 P05（本庁舎） |
| 駅 | D25（201）国土数値情報 N02 |
| バス停 | D27（8,653）国土数値情報 P11（事業者ごとの点。同じ名前の点は1つの停留所として数える） |
| スーパー | D28 OSM（261）、D29 大規模小売店舗一覧（146）、D40 Overture（88） |
| ドラッグストア | D28 OSM（120）、D29（58）、D40 Overture（253） |
| コンビニ | D28 OSM（623）、D40 Overture（622） |
| 大規模小売店舗 | D29（693） |
| 病院・診療所・歯科・薬局 | D30（115・1,112・923・1,158）医療情報ネット |

`attrs` の項目は、データごとに次のとおりです。

| データ | `attrs` の項目 |
| --- | --- |
| D15・D16・D19・D20 | `city_code`、`設置者` |
| D17・D18 | `city_code`、`種類` |
| D21 | `市町村`、`クラブ`（まとめたクラブの名前の配列）、`場所`、`ページの時点`、`確認日`、`確認したURL`、`位置`（位置の出し方）、`小学校`（P29 の学校の位置を使ったとき）、`当たった住所` |
| D22 | `面積_㎡` |
| D23 | `状態`、`確認日`、`確認したURL`、`元データ`、`位置`、`当たった住所` |
| D24 | `city_code` |
| D25 | `路線`（配列）、`乗降客数_2024`（53駅だけ。D26）、`乗降客数の備考` |
| D27 | `事業者`、`系統`、`系統数` |
| D28 | `osm_id`、`fclass`、`形`（点・建物）、`種類の補正`（名前で種類を直したとき） |
| D29 | `店舗面積_㎡`、`主な小売店舗`、`スーパー等の判定`、`開店日`、`閉店時刻`、`位置`、`位置を出した住所`、`住所から推定した位置`、`当たった住所`、`補った理由` |
| D30 | `city_code`、`位置`、`当たった住所` |
| D40 | `overture_id`、`提供元`、`確からしさ`、`種類`、`補った理由` |
| D43 | `osm_id`、`形`（点・形） |

`位置` が「住所から推定」の行は、国土地理院の住所検索で位置を出したものです。大字・町名までしか当たらなかった行は位置が粗くなります（D21・D23 の取り込みの記録に一覧があります）。

#### `ward_facility_averages`（区・市町村の平均件数）

| 列 | 型 | 必須 | 説明 |
| --- | --- | --- | --- |
| `ward` | text | ○ | 区・市町村の名前（`towns.ward` と同じ。新潟市は区、ほかは市町村） |
| `kind` | text | ○ | 施設の種類。診療科は「診療科:内科」のような名前 |
| `radius_m` | integer | ○ | 数える範囲（今は 1000 だけ） |
| `avg_count` | numeric | ○ | 区・市町村の中の町の中心から、範囲内にある施設の数の平均 |
| `town_count` | integer | ○ | 平均に使った町の数 |
| `computed_at` | timestamptz | ○ | 計算した日時 |

施設を入れ直したら計算し直します（`npm run ingest -- ward-averages` と `ward-averages area=pref`）。37区・市町村 × 28種類（20種類＋診療科8種類）です。

#### `zones`（区域の形）

| 列 | 型 | 必須 | 説明 |
| --- | --- | --- | --- |
| `id` | bigint | ○ | 通し番号 |
| `dataset_id` | text | ○ | どのデータか（下の表） |
| `kind` | text | ○ | 区域の種類（8種類。下の表） |
| `label` | text | ○ | 事実の「値」にそのまま使う文言（例：`第一種低層住居専用地域`、`0.5〜3.0m`） |
| `attrs` | jsonb | | データごとの項目（下の表） |
| `geom` | geometry | ○ | 区域の形 |
| `raw` | jsonb | | 元の行 |

| 種類（`kind`） | データ | 行 | `label` の種類 | `attrs` の項目 |
| --- | --- | --- | --- | --- |
| 用途地域 | D04 XKT002 | 1,657 | 12 | `city_code`、`youto_id`、`decision_date` |
| 小学校区・中学校区 | D12 A27・D13 A32 | 2,251・2,015 | 251・124 | `学校名`、`行政区域コード` |
| 洪水浸水想定 | D31 A31a | 462,916 | 6 | `河川名`、`河川番号`、`浸水深ランク`、`区域の通し番号` |
| 土砂災害警戒区域 | D33 A33 | 43,094 | 5 | `現象`、`区域`、`区域名`、`区域番号`、`所在地`、`告示日`、`特別警戒区域が未指定`、`区域の通し番号` |
| 津波浸水想定 | D34 A40 | 99,248 | 7 | `区分`、`区域の通し番号` |
| 液状化の傾向 | D35 XKT025 | 221,329 | 28 | `level`、`mesh_code`、`topographic_code` |
| 大規模盛土造成地 | D36 A54 | 185 | 3 | `盛土区分`、`盛土番号`、`市区町村`、`市区町村コード`、`区域の通し番号` |

- 洪水は、同じ地点が複数の川の区域に入るのが普通です。事実には一番深いもの（`attrs.浸水深ランク` が最大）を使います。同じ区域が何行にも分かれているので、数えるときは `label` と `attrs.河川名` で distinct を取ります。
- 新潟市には大規模盛土造成地がありません。新潟市の物件は「該当なし」です（「取得できず」ではない）。

#### `school_zone_rules_all`（通学区域一覧）と `school_zone_rules`（ビュー）

| 列 | 型 | 必須 | 説明 |
| --- | --- | --- | --- |
| `id` | bigint | ○ | 通し番号 |
| `dataset_id` | text | ○ | D14（新潟市）・D41（長岡市）・D42（燕市） |
| `city_code` | text | ○ | 市のコード（新潟市 15100・長岡市 15202・燕市 15213）。新潟市は区に分けない |
| `ward` | text | | 同じ町名が複数の区にある町だけ、区の名前 |
| `town` | text | ○ | 町名 |
| `chome` | smallint | | 丁目（無ければ空） |
| `town_text` | text | ○ | 元の表の町名の書き方 |
| `lot_scope` | text | ○ | `全部`（町・丁目の全体）・`一部`（`lot_ranges` の範囲だけ） |
| `lot_text` | text | ○ | 元の表の番地の書き方 |
| `lot_ranges` | jsonb | | 読み取った番・号の範囲（例：`[{"ban":[2,2],"go":[[1,8]]}]`）。「附表に示す区域を除く」は `{"except":[…]}`。読み取れない書き方は空 |
| `elementary_school` | text | ○ | 小学校 |
| `junior_high_school` | text | ○ | 中学校 |
| `source_url` | text | ○ | 元のページ |

- この3市は、物件の住所をこの表と照らし合わせて学区を決めます（`lib/facts/school-zones.ts`）。それ以外の市町村は、国土数値情報の学区の形（`zones` の小学校区・中学校区）で決めます。
- `school_zone_rules` は、前のコード（2026-11-12 時点の main・develop-v4）のためのビューで、新潟市の行だけを見せます。新しいコードは `school_zone_rules_all` を使います。

#### `transactions`（取引価格・成約価格、D01）

| 列 | 型 | 必須 | 説明 |
| --- | --- | --- | --- |
| `id` | bigint | ○ | 通し番号 |
| `dataset_id` | text | ○ | `D01` |
| `row_hash` | text | ○ | 元の行のハッシュ（同じ取引を2回入れないため。`dataset_id` と組で一意） |
| `price_category` | text | | `不動産取引価格情報`・`成約価格情報` |
| `type` | text | | 種類（`宅地(土地と建物)`、`宅地(土地)`、`中古マンション等`、`農地`、`林地`） |
| `municipality_code` | text | ○ | 市区町村コード |
| `ward` | text | | 区・市町村の名前 |
| `district_name` | text | | 地区名 |
| `year` / `quarter` | smallint | ○ | 取引の年と四半期（1〜4）。2015Q1〜2026Q1 |
| `trade_price` | bigint | | 取引の総額（**円**） |
| `land_sqm` / `floor_sqm` | numeric | | 土地面積・延床面積（㎡） |
| `building_year` | smallint | | 建築年 |
| `floor_plan` / `structure` | text | | 間取り・構造 |
| `raw` | jsonb | ○ | 元の行（`PricePerUnit`：坪単価、`UnitPrice`：㎡単価 など） |
| `town_key_code` | text | | 町への対応。**今は使っておらず、全件が空** |
| `town_match` | text | | 町への対応の仕方。**今は使っておらず、全件が空** |

相場は、物件のある区・市町村の「宅地(土地と建物)」の取引を、築年数の帯に分けた中央値で出します（町では件数が足りないため）。

#### `land_prices`（地価公示・地価調査、D02・D03）

| 列 | 型 | 必須 | 説明 |
| --- | --- | --- | --- |
| `id` | bigint | ○ | 通し番号 |
| `dataset_id` | text | ○ | D02（地価公示 427地点）・D03（地価調査 530地点） |
| `point_id` | text | ○ | 標準地・基準地の番号 |
| `year` | smallint | ○ | 年（今は 2026 だけ） |
| `price_per_sqm` | integer | | 1㎡あたりの価格（円） |
| `change_rate` | numeric | | 前年からの変動率（%） |
| `use_category` | text | | 用途（住宅地・商業地 など） |
| `address` | text | | 所在地 |
| `geog` | geography | ○ | 位置 |
| `raw` | jsonb | ○ | 元の行（地積など） |

#### `reference_stats`（買い手・媒体の統計）

| 列 | 型 | 必須 | 説明 |
| --- | --- | --- | --- |
| `id` | bigint | ○ | 通し番号 |
| `dataset_id` | text | ○ | B02（住宅市場動向調査）・B06（情報通信メディアの利用時間と情報行動に関する調査） |
| `category` | text | ○ | まとまり（世帯主の年齢、世帯年収の分布、物件を探した方法、SNS・動画の利用率、情報源としての重要度） |
| `segment` | text | ○ | 区分（新築・中古、年代 など） |
| `item` | text | ○ | 項目 |
| `value` | numeric | | 値 |
| `unit` | text | | 単位 |
| `sort` | smallint | | 並び順 |
| `source` | text | | 出典の場所（例：報告書 p.39）。事実シートの出典に使う |
| `note` | text | | 備考 |

### 4.3 前提と選択肢

#### `assumptions`（前提値）

| 列 | 型 | 必須 | 説明 |
| --- | --- | --- | --- |
| `id` | bigint | ○ | 通し番号。事実シートの `assumption_ids` で、どの行を使ったかを残す |
| `key` | text | ○ | 項目（変動金利、全期間固定金利、頭金の割合、返済負担率、返済期間、完済年齢の上限、住み替えの頭金、建物の単価・耐用年数 など） |
| `value` | numeric | ○ | 値 |
| `unit` | text | ○ | 単位（%・年・歳・万円・円/㎡） |
| `basis` | text | ○ | 根拠 |
| `as_of` | text | ○ | 時点 |
| `effective_from` | date | ○ | 適用開始日。`key` と組で一意 |
| `dataset_id` | text | | 元のデータ（B04 など。任意） |
| `created_at` | timestamptz | ○ | 行を作った日時 |

値を変えるときは行を**足します**（古い行は消さない）。計算には「適用開始日が今日以前で一番新しい行」を使います。今は変動金利が 2026-10 の 1.3% と 2026-11 の 0.95% の2行あり、0.95% が使われます。

#### `target_candidates`（ターゲット候補）

| 列 | 型 | 必須 | 説明 |
| --- | --- | --- | --- |
| `id` | smallint | ○ | 1〜6 |
| `name` | text | ○ | 若い夫婦、小中学生のいる家族、50代の住み替え、60歳以上、単身、親と同居 |
| `representative_age` | smallint | ○ | 代表年齢（ローンの完済年齢の計算に使う） |
| `definition` | text | | 定義 |
| `note` | text | | 備考 |
| `uses_resale_down_payment` | boolean | ○ | 住み替えの頭金での返済も出す候補か（50代の住み替え・60歳以上が true） |

#### `media`（媒体一覧）

| 列 | 型 | 必須 | 説明 |
| --- | --- | --- | --- |
| `id` | text | ○ | C-01〜C-16（SUUMO、アットホーム、LIFULL HOME'S、自社ホームページ、Google検索広告、SNS広告5つ、YouTube広告、新聞折込チラシ、ポスティング、フリーペーパー、現地看板、オープンハウス、LINE公式・メール） |
| `name` | text | ○ | 媒体の名前 |
| `category` | text | ○ | 分類（不動産ポータル・自社・ネット広告・SNS広告・動画広告・紙・現地） |
| `purpose` | text | ○ | 何に向くか |
| `reach_ages` | text | ○ | 届く年代 |
| `sort` | smallint | ○ | 並び順 |

### 4.4 物件（①入力）

#### `properties`（物件）

| 列 | 型 | 必須 | 説明 |
| --- | --- | --- | --- |
| `id` | bigint | ○ | 通し番号 |
| `code` | text | | 物件ID（例：`BR-2026-0001`）。登録したときにトリガーが付ける。一意 |
| `property_class` | text | ○ | `新築`・`中古` |
| `price_man_yen` | integer | ○ | 価格（万円、1以上） |
| `address` | text | ○ | 住所 |
| `geog` | geography | | 位置（住所検索か、地図のピンで直した位置） |
| `location_source` | text | | `住所検索`・`手で修正` |
| `geocode_title` | text | | 住所検索で当たった住所 |
| `layout` | text | ○ | 間取り（入力のまま。例：4LDK+S） |
| `rooms` / `storerooms` | smallint | | 居室の数・納戸の数（登録時にプログラムで `layout` から分ける。4LDK+S → 4 と 1） |
| `building_sqm` / `land_sqm` | numeric | ○ | 建物面積・土地面積（㎡、0より大きい） |
| `parking` | smallint | ○ | 駐車場の台数 |
| `building_age` | smallint | ○ | 築年数 |
| `floors` | text | ○ | `平屋`・`2階建`・`3階建以上` |
| `has_garden` | boolean | | 庭の有無（空は入力なし） |
| `renovated` | boolean | | リフォームの有無 |
| `renovation_year` | smallint | | リフォームの年（リフォーム「あり」のときだけ入れられる） |
| `renovation_parts` | text[] | | リフォームの箇所（キッチン・浴室・トイレ・洗面・内装全面・内装一部・外壁・屋根・その他） |
| `features` | text | | 特徴（自由記述） |
| `ad_budget_man_yen` | integer | | 広告予算（万円） |
| `created_at` / `updated_at` | timestamptz | ○ | 登録・更新の日時 |

#### `property_transports`（物件資料の交通）

| 列 | 型 | 必須 | 説明 |
| --- | --- | --- | --- |
| `property_id` | bigint | ○ | 物件 |
| `position` | smallint | ○ | 1・2（最大2つ）。`property_id` と組で主キー |
| `mode` | text | ○ | `電車`・`バス` |
| `line` | text | | 路線 |
| `stop_name` | text | ○ | 駅・バス停の名前 |
| `walk_min` | smallint | ○ | 物件資料に書かれた徒歩分（システムが計算した値ではない） |

#### `property_images`（物件の画像）

| 列 | 型 | 必須 | 説明 |
| --- | --- | --- | --- |
| `property_id` | bigint | ○ | 物件 |
| `kind` | text | ○ | `外観`・`内観`・`間取り図`。`property_id` と組で主キー（枠ごとに1枚） |
| `image` | bytea | ○ | 画像そのもの（3MB まで。画面で長い辺 2,000px の JPEG に縮めてから送る） |
| `media_type` | text | ○ | `image/png`・`image/jpeg`・`image/webp` |
| `created_at` / `updated_at` | timestamptz | ○ | 登録・更新の日時 |

戦略を作るとき、戦略担当の呼び出しにだけ添えます。画像は Storage に移していません（物件が数千件を超えるなどしたら移す）。

#### `property_competitors`（競合に選んだ物件）

| 列 | 型 | 必須 | 説明 |
| --- | --- | --- | --- |
| `property_id` | bigint | ○ | この物件 |
| `competitor_id` | bigint | ○ | 競合に選んだ別の物件（本システムで販売戦略を作った物件）。自分自身は選べない |
| `position` | smallint | ○ | 並び順。`property_id` と組で主キー |
| `created_at` | timestamptz | ○ | 選んだ日時 |

DB は1物件3件まで受け付けますが、設計まとめと画面は最大2件です（2026-11-05 変更）。事実シートでは、競合の物件情報・特徴・その物件の販売戦略からの引用（AI の見立て）を K の事実にします。

#### `competitors`（手で入れる競合。使っていない）

`property_id`、`position`、`price_man_yen`、`address`、`geog`、`building_sqm`、`land_sqm`、`building_age`、`created_at` を持ちます。2026-11-05 から `property_competitors` に替わり、コードのどこからも使っていません。消すマイグレーションは受け渡しのあとに作る予定です。

### 4.5 事実シートとAI（③④）

#### `fact_sheets`（事実シート）

| 列 | 型 | 必須 | 説明 |
| --- | --- | --- | --- |
| `id` | bigint | ○ | 通し番号 |
| `property_id` | bigint | ○ | 物件 |
| `content` | jsonb | ○ | 事実シート（下の形） |
| `assumption_ids` | bigint[] | ○ | 使った前提値（`assumptions.id`） |
| `created_at` | timestamptz | ○ | 作った日時 |

`content` の形：

```json
{
  "物件ID": "BR-2026-0001",
  "作成日時": "2026-11-15T…",
  "距離の種類": "直線",
  "事実": [
    { "id": "L-07", "項目": "放課後児童クラブ（1km以内）", "値": "…", "比較": "…", "出典": "…", "時点": "2026-11", "状態": "取得" }
  ]
}
```

- `id` は「英字1文字＋番号」です。英字は分類（P 物件、M 相場、A エリア、S 学区、R 規制、L 生活施設、T 交通、H 災害、B 買い手、K 競合、C 媒体）です。
- `値` は取れなかったとき null、`状態` は `取得`・`取得できず`・`要確認` の3つです。`比較` は区・市町村の平均などとの比べ（無い事実もある）です。
- 作り直すたびに行を足し、古いシートも残します。作り方は `lib/facts/`（`collect.ts` が SQL で集め、`build.ts` が組み立てる）です。

#### `strategy_runs`（戦略の実行）

| 列 | 型 | 必須 | 説明 |
| --- | --- | --- | --- |
| `id` | bigint | ○ | 通し番号 |
| `property_id` | bigint | ○ | 物件 |
| `fact_sheet_id` | bigint | ○ | 使った事実シート |
| `status` | text | ○ | `queued`・`running`・`succeeded`・`failed` |
| `stage` | text | | 今の段階（分析・戦略・メイン・媒体・確認・作り直し・金額の計算） |
| `result` | jsonb | | ⑤レポートに渡す結果。「3回」は `{fact_sheet_id, 構成, 戦略担当, 戦略, 媒体, 予算シミュレーション}`、古い「7回」は `{fact_sheet_id, 分析, メイン, 媒体, 予算シミュレーション}` |
| `input_tokens` / `output_tokens` | integer | ○ | トークン数の合計 |
| `cost_usd` | numeric | ○ | 費用の合計（ドル） |
| `error` | text | | 失敗したときのエラー |
| `created_at` / `started_at` / `finished_at` | timestamptz | | 作った・始めた・終わった日時 |
| `form` | text | ○ | 作り方。`3回`（2026-10-31 から。戦略担当1体）・`7回`（それより前） |

同じ物件で同時に動く実行は1つだけです（`strategy_runs_one_active` のインデックス）。

#### `agent_calls`（エージェントの呼び出し）

| 列 | 型 | 必須 | 説明 |
| --- | --- | --- | --- |
| `id` | bigint | ○ | 通し番号 |
| `run_id` | bigint | ○ | 実行 |
| `agent` | text | ○ | 担当（戦略・媒体・確認。古い「7回」は物件・立地・価格・買い手・メイン） |
| `attempt` | smallint | ○ | 1：最初、2：作り直し（今は作り直さないので、すべて1）。`run_id`・`agent` と組で一意 |
| `model` | text | ○ | 使ったモデル（`lib/agents/cost.ts` の料金表にあるもの） |
| `prompt_file` | text | ○ | 指示文のファイル（`prompts/`） |
| `prompt_sha256` | text | ○ | 指示文の中身のハッシュ（どの版で動かしたかが分かる） |
| `input` | jsonb | ○ | 渡した入力 |
| `output` | jsonb | | 返ってきた出力（JSON に直したもの） |
| `raw_text` | text | | 返ってきた文そのまま |
| `status` | text | ○ | `running`・`succeeded`・`failed` |
| `input_tokens` / `output_tokens` | integer | | トークン数 |
| `cache_read_tokens` / `cache_creation_tokens` | integer | | プロンプトキャッシュのトークン数 |
| `cost_usd` | numeric | | 費用（ドル） |
| `error` | text | | 失敗したときのエラー |
| `started_at` / `finished_at` | timestamptz | | 始めた・終わった日時 |
| `effort` | text | | 考える量の設定 |

#### `check_results`（点検の結果）

| 列 | 型 | 必須 | 説明 |
| --- | --- | --- | --- |
| `id` | bigint | ○ | 通し番号 |
| `run_id` | bigint | ○ | 実行 |
| `agent_call_id` | bigint | | 点検した呼び出し（AI の点検のとき） |
| `round` | smallint | ○ | 1・2（作り直しの前・後） |
| `checker` | text | ○ | `プログラム`・`AI` |
| `target` | text | ○ | 点検した出力（`メイン`・`戦略`・`媒体`） |
| `location` | text | ○ | 出力の中の場所 |
| `check_name` | text | ○ | 点検の項目 |
| `problem` | text | ○ | 見つかった問題 |
| `action` | text | ○ | どうしたか（`作り直し`・`外す`・`記録だけ`・`なし`） |
| `created_at` | timestamptz | ○ | 記録した日時 |

#### `strategy_reviews`（戦略の評価）

| 列 | 型 | 必須 | 説明 |
| --- | --- | --- | --- |
| `id` | bigint | ○ | 通し番号 |
| `run_id` | bigint | ○ | 評価した実行（1つの実行に1件） |
| `reviewer` | text | ○ | 評価した人 |
| `scores` | jsonb | ○ | 点数（`target`・`appeal`・`evidence`・`media`・`budget` をそれぞれ1〜5） |
| `comments` | jsonb | ○ | 項目ごとのコメント |
| `revised_output` | jsonb | ○ | 人が直した戦略 |
| `status` | text | ○ | `draft`・`approved`（`approved` のときだけ `approved_at` が入る） |
| `note` | text | | 備考 |
| `created_at` / `updated_at` / `approved_at` | timestamptz | | 作った・直した・承認した日時 |

brumby-poc にだけあった表を、2026-11-10 にマイグレーションにしたものです。まだ中身はありません。

### 4.6 販売記録

#### `sales_records`（販売の結果、1物件1行）

| 列 | 型 | 必須 | 説明 |
| --- | --- | --- | --- |
| `property_id` | bigint | ○ | 物件（主キー） |
| `status` | text | ○ | `販売前`・`販売中`・`成約`・`販売中止` |
| `listed_on` | date | | 販売開始日 |
| `list_price_man_yen` | integer | | 売り出し価格（万円） |
| `price_cut_count` | smallint | ○ | 値下げの回数 |
| `final_price_man_yen` | integer | | 最後の売り出し価格（万円） |
| `contracted_on` | date | | 成約日（販売開始日より後） |
| `contract_price_man_yen` | integer | | 成約価格（万円） |
| `buyer_age_band` | text | | 買主の年代（20代以下・30代・40代・50代・60代・70代以上） |
| `buyer_household` | text | | 買主の世帯 |
| `buyer_first_media_id` | text | | 買主が最初に知った媒体（`media.id`） |
| `buyer_first_media_other` | text | | 媒体一覧に無い媒体の名前（`buyer_first_media_id` とどちらか一方） |
| `note` | text | | 備考 |
| `strategy_run_id` | bigint | | 使った戦略の実行 |
| `plan_usage` | text | | 戦略の使い方（`そのまま使った`・`一部変えて使った`・`使わなかった`） |
| `created_at` / `updated_at` | timestamptz | ○ | 登録・更新の日時 |

#### `media_results`（媒体ごとの実績）

| 列 | 型 | 必須 | 説明 |
| --- | --- | --- | --- |
| `id` | bigint | ○ | 通し番号 |
| `property_id` | bigint | ○ | 物件 |
| `media_id` | text | | 媒体（`media.id`） |
| `other_name` | text | | 媒体一覧に無い媒体の名前（`media_id` とどちらか一方は必須） |
| `started_on` / `ended_on` | date | | 期間（終わりは始まりより後） |
| `cost_man_yen` | numeric | | 費用（万円） |
| `reach_count` | integer | | 配った数・表示回数 |
| `views` | integer | | 閲覧数 |
| `inquiries` | integer | | 問い合わせ数 |
| `viewings` | integer | | 内見数 |
| `note` | text | | 備考 |
| `created_at` | timestamptz | ○ | 登録した日時 |

## 5. データの一覧（`datasets`）

| id | データ | 提供元 | 時点 | 件数 | 入る表 |
| --- | --- | --- | --- | --- | --- |
| D01 | 取引価格・成約価格（XIT001） | 不動産情報ライブラリ | 2015Q1〜2026Q1 | 76,030 | transactions |
| D02 | 地価公示（L01） | 国土数値情報 | 2026 | 427 | land_prices |
| D03 | 都道府県地価調査（L02） | 国土数値情報 | 2026 | 530 | land_prices |
| D04 | 用途地域（XKT002） | 不動産情報ライブラリ | 2026-07 | 1,657 | zones |
| D05〜D08 | 年齢別人口・家族類型・持ち家・建て方 | e-Stat 国勢調査 | 2020 | 172,960 など | area_stats |
| D09 | 核家族世帯割合など（T001090） | e-Stat 国勢調査 | 2020 | 未取り込み | 使っていない（D06 から計算） |
| D10 | 町名別5歳階級人口 | 新潟市OD | 2026-09 | 45,318 | area_stats（使っていない） |
| D11 | 250mメッシュ将来推計人口 | 国土数値情報 | R6推計 | 31,061 | population_mesh |
| D12・D13 | 小学校区（A27）・中学校区（A32） | 国土数値情報 | 2023 | 2,251・2,015 | zones |
| D14 | 通学区域一覧（新潟市） | 新潟市教育委員会 | 2026-04-01 | 1,977 | school_zone_rules_all |
| D15〜D20 | 小学校・中学校・保育園・地域型保育・幼稚園・認定こども園 | 国土数値情報 P29・P14 | 2023 | 4.2 の表 | facilities |
| D21 | 放課後児童クラブ | 各市町村のホームページ（燕市はオープンデータ） | 2026-11 | 416 | facilities |
| D22 | 公園・緑地（新潟市） | 新潟市OD | 2019-12 | 1,327 | facilities |
| D23 | 図書館 | 不動産情報ライブラリ（P27）＋各館のホームページ | 2026-11 | 127 | facilities |
| D24 | 市役所・区役所 | 国土数値情報 P05 | 2022 | 38 | facilities |
| D25・D26 | 鉄道・駅（N02）・駅別乗降客数（S12） | 国土数値情報 | 2025・2024 | 201・53 | facilities（D26 は駅の `attrs`） |
| D27 | バス停留所（P11） | 国土数値情報 | 2022 | 8,653 | facilities |
| D28 | スーパー・ドラッグストア・コンビニ | OpenStreetMap | 2026-10-24 | 1,004 | facilities |
| D29 | 大規模小売店舗一覧 | 新潟県 | 2026-09 | 897 | facilities |
| D30 | 病院・診療所・歯科・薬局 | 医療情報ネット | 2026-10-24 | 3,308 | facilities |
| D31 | 洪水浸水想定区域（A31a） | 国土数値情報 | 2025 | 462,916 | zones |
| D33 | 土砂災害警戒区域（A33） | 国土数値情報 | 2025 | 43,094 | zones |
| D34 | 津波浸水想定（A40） | 国土数値情報 | 2017 | 99,248 | zones |
| D35 | 液状化の発生傾向（XKT025） | 不動産情報ライブラリ | 2024-10 | 221,329 | zones |
| D36 | 大規模盛土造成地（A54） | 国土数値情報 | 2023 | 185 | zones |
| D38 | 液状化しやすさマップ | 北陸地方整備局 | ― | ― | 参照のみ（DBに入れない） |
| D39 | 町丁・字等の境界 | e-Stat 国勢調査 | 2020 | 7,703 | towns |
| D40 | スーパー・ドラッグストア・コンビニ（Overture） | Overture Maps Foundation | 2026-11-11 | 963 | facilities |
| D41 | 長岡市立学校通学区域規則 | 長岡市教育委員会 | 令和7年3月27日改正 | 1,028 | school_zone_rules_all |
| D42 | 学校区一覧（燕市） | 燕市教育委員会 | 2025-04-01 | 206 | school_zone_rules_all |
| D43 | 公園（OSM、新潟市以外） | OpenStreetMap | 2026-10-24 | 732 | facilities |
| B01 | フラット35利用者調査 | 住宅金融支援機構 | 2025年度 | ― | 前提値の根拠（assumptions） |
| B02 | 住宅市場動向調査 | 国土交通省 | 令和7年度 | 41 | reference_stats |
| B03 | 民間住宅ローンの実態に関する調査 | 国土交通省 | 令和7年度 | ― | 前提値の根拠 |
| B04・B05 | 変動金利・フラット35の金利 | 第四北越銀行・住宅金融支援機構 | 2026-10 | ― | 前提値の根拠 |
| B06 | 情報通信メディアの利用時間と情報行動に関する調査 | 総務省 | 令和7年度 | 70 | reference_stats |

最新の件数と時点は `npm run ingest -- status` で見られます。

### 一部の市町村の分しか無いデータ

事実シートでは、物件の市町村が入っていないデータを「0件」ではなく「取得できず」にします（`lib/facts/build.ts` の `PARTIAL_AREA_DATASETS`）。

| データ | 入っていない市町村 |
| --- | --- |
| D21 放課後児童クラブ | 粟島浦村（一覧が見つからない） |
| D22 公園・緑地 | 新潟市以外（D43 で補うので、公園の事実としては県全体） |
| D14・D41・D42 通学区域 | 新潟市・長岡市・燕市以外（国土数値情報の学区の形を使う） |

## 6. ライセンスと守ること

- 出典の文言は `datasets.attribution` にあり、画面の出典一覧に出します。
- 不動産情報ライブラリの API はアクセスログを保存します（`api_access_logs`）。サービス名に「不動産情報ライブラリ」を使いません。
- 国土数値情報の P27（図書館の下書きに使った文化施設）は非商用です。中身を各館のホームページで確かめて直したうえで使うことを、小林さんが判断しました（2026-11-14）。P13（都市公園）は非商用なので使っていません。
- OpenStreetMap（D28・D43）は ODbL、Overture（D40）は CDLA Permissive 2.0（Foursquare 由来は Apache 2.0）、燕市のオープンデータは CC BY 4.0 です。

## 7. よく使う確かめ方（SQL）

```sql
-- 表と件数
select relname as 表, n_live_tup as 件数 from pg_stat_user_tables order by relname;

-- データの一覧（件数と時点）
select id, name, as_of, row_count, loaded_at from datasets order by id;

-- 施設の種類とデータの組み合わせ
select kind, dataset_id, count(*) from facilities group by 1, 2 order by 1, 2;

-- いま使われる前提値
select distinct on (key) key, value, unit, as_of, effective_from
from assumptions where effective_from <= current_date
order by key, effective_from desc;

-- ある地点から1km以内の施設（直線距離）
select kind, name, round(extensions.st_distance(geog, p)::numeric) as 直線m
from facilities, (select extensions.st_setsrid(extensions.st_point(139.0364, 37.9161), 4326)::extensions.geography as p) x
where extensions.st_dwithin(geog, p, 1000)
order by 3;

-- 最後の取り込みの確かめた結果（位置を出せなかった行など）
select command, finished_at, jsonb_pretty(checks) from ingest_logs where dataset_id = 'D21' order by finished_at desc limit 1;
```

## 8. 気をつけること

- **`scratch_overture`：** マイグレーションに無い作業用の表（Overture の店を調べたときのもの）でしたが、書き出しの前に消しました（2026-11-15）。
- **`competitors`：** 使っていない表です（4.4）。消すマイグレーションは受け渡しのあとに作ります。
- **`transactions.town_key_code`・`town_match`：** 全件が空です。相場は区・市町村で出すので使っていません。
- **`school_zone_rules`：** 表ではなくビューです。前のコードを動かすためのもので、新しいコードは `school_zone_rules_all` を使います。新しいコードは古いDBでは動きません（`school_zone_rules_all` が無いため）。
- **使っていないデータの行：** `datasets` には D09・D10・D38 と B01・B03〜B05 の行がありますが、表に行が無い（または事実シートで使っていない）データです。
- **位置の粗い施設：** 住所検索が大字・町名までしか当たらなかった施設は、位置が数百m〜1km以上ずれることがあります（D21・D23 の `attrs.位置` と、取り込みの記録の `checks` で分かる）。
- **OSM の公園（D43）：** 漏れが多く、新潟市以外の公園の件数は少なめに出ます。比べる相手は同じ市町村の中なので、比較は同じデータどうしです。
