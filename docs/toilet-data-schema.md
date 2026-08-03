# 横瀬町トイレデータスキーマ

このスキーマは、投稿データ、参考データ、確認済みCC0データで共通して使うためのプロパティ定義です。不明な値は空文字や推測値ではなく、`unknown` または `null` で記録します。

## GeoJSON形式

- 形式: GeoJSON `FeatureCollection`
- ジオメトリ: `Point`
- 座標順: `[longitude, latitude]`
- 50MB未満の小規模データはGeoJSONで管理します
- OSM参考地点とCC0確認済み地点を同じGeoJSONへ混在させません

## プロパティ

| プロパティ | 内容 | 例 |
|---|---|---|
| `id` | データ内で一意のID | `verified-yokoze-station-toilet-2026-08-02` |
| `name` | 施設名 | `ウォーターパーク・シラヤマ` |
| `category` | 施設種別 | `park` |
| `longitude` | 経度 | `139.106441` |
| `latitude` | 緯度 | `35.989121` |
| `toilet_exists` | 投稿者がトイレの存在を確認したか | `yes` |
| `access` | 一般利用条件 | `unknown` |
| `access_note` | 利用条件の補足 | `声掛けの要否は未確認` |
| `facility_opening_hours` | 施設の利用時間 | `8:30-17:30` |
| `toilet_opening_hours` | トイレ固有の利用時間 | `unknown` |
| `fee` | 利用料金 | `unknown` |
| `exterior_note` | 建物の外観や入口の特徴 | `駐車場奥の木造建物` |
| `flush_type` | 水洗方式 | `flush` |
| `toilet_style` | 洋式・和式の区分 | `both` |
| `equipment_note` | その他の設備や特徴 | `入口に段差あり` |
| `wheelchair` | 車いす対応 | `unknown` |
| `changing_table` | おむつ交換台 | `unknown` |
| `ostomy` | オストメイト設備 | `unknown` |
| `gender` | 男女別・共用 | `unknown` |
| `verification_status` | 確認状態 | `reference` |
| `submission_type` | 新規地点か既存OSM地点の確認情報か | `edit_existing` |
| `submission_destination` | 希望する更新経路 | `atlas` |
| `source_osm_id` | 参照したOSMオブジェクトID | `node/9896819269` |
| `source_osm_name` | 参照時点のOSM上の名称 | `横瀬駅前観光トイレ` |
| `source_osm_longitude` | 参照時点のOSM経度 | `139.106441` |
| `source_osm_latitude` | 参照時点のOSM緯度 | `35.989121` |
| `verification_method` | 確認方法 | `osm_reference` |
| `verification_date` | 確認日 | `2026-08-02` |
| `source_name` | 情報源名 | `横瀬町公式Webページ` |
| `source_url` | 情報源URL | `https://...` |
| `source_license` | 情報源のライセンス | `ODbL 1.0` |
| `coordinate_source` | 座標の情報源 | `OpenStreetMap` |
| `data_license` | このデータの扱い | `CC0 1.0 Universal` |
| `cc0_eligible` | CC0収録可否 | `false` |
| `cc0_publication_consent` | 投稿者のCC0公開同意 | `true` |
| `automated_intake` | IssueからActionsで自動生成したか | `true` |
| `source_issue_number` | 元のGitHub Issue番号 | `24` |
| `source_issue_url` | 元のGitHub Issue URL | `https://github.com/.../issues/24` |
| `notes` | 備考 | `正確な入口位置は未確認` |

## 推奨値

`category`: `public_toilet`, `park`, `station`, `public_facility`, `tourism`, `convenience`, `cafe`, `restaurant`, `other`

`access`: `public`, `customers`, `permission`, `restricted`, `unknown`

`wheelchair`: `yes`, `no`, `limited`, `unknown`

`changing_table`: `yes`, `no`, `unknown`

`ostomy`: `yes`, `no`, `unknown`

`gender`: `male`, `female`, `unisex`, `mixed`, `unknown`

`verification_status`: `reference`, `submitted`, `verified`

`toilet_exists`: `yes`, `no`, `unknown`

`submission_type`: `new`, `edit_existing`

`submission_destination`: `atlas`, `atlas_and_osm_note`

`flush_type`: `flush`, `non_flush`, `other`, `unknown`

`toilet_style`: `western`, `japanese`, `both`, `other`, `unknown`

`verification_method`: `osm_reference`, `official_web`, `phone`, `email`, `field_survey`, `user_submission`, `unknown`

## ライセンス分離

- `reference`: OSMなど第三者由来または未確認の参考情報。CC0公開データに直接転用しません。
- `submitted`: GitHub Issue等で提供された未確認情報。Issue経路ではGitHub Actionsが形式・座標を検査して青い確認待ちピンとして自動表示します。`cc0_publication_consent` が `true` でも `cc0_eligible: false` とし、CC0公開データには含めません。
- `verified`: 独立確認と権利確認が完了した情報。CC0公開用GeoJSONへ追加できます。

`source_osm_*` は参考元を追跡するためのフィールドです。OSM値を投稿者の確認情報である `name`、`category`、座標、設備属性へ自動転記してはいけません。OSM参考レイヤーはODbL、確認済みレイヤーはCC0として、ファイルと表示を分離します。
