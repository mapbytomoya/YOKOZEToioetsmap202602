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
| `access` | 一般利用条件 | `unknown` |
| `access_note` | 利用条件の補足 | `声掛けの要否は未確認` |
| `facility_opening_hours` | 施設の利用時間 | `8:30-17:30` |
| `toilet_opening_hours` | トイレ固有の利用時間 | `unknown` |
| `fee` | 利用料金 | `unknown` |
| `wheelchair` | 車いす対応 | `unknown` |
| `changing_table` | おむつ交換台 | `unknown` |
| `ostomy` | オストメイト設備 | `unknown` |
| `gender` | 男女別・共用 | `unknown` |
| `verification_status` | 確認状態 | `reference` |
| `verification_method` | 確認方法 | `osm_reference` |
| `verification_date` | 確認日 | `2026-08-02` |
| `source_name` | 情報源名 | `横瀬町公式Webページ` |
| `source_url` | 情報源URL | `https://...` |
| `source_license` | 情報源のライセンス | `ODbL 1.0` |
| `coordinate_source` | 座標の情報源 | `OpenStreetMap` |
| `data_license` | このデータの扱い | `CC0 1.0 Universal` |
| `cc0_eligible` | CC0収録可否 | `false` |
| `notes` | 備考 | `正確な入口位置は未確認` |

## 推奨値

`category`: `public_toilet`, `park`, `station`, `public_facility`, `tourism`, `convenience`, `cafe`, `restaurant`, `other`

`access`: `public`, `customers`, `permission`, `restricted`, `unknown`

`wheelchair`: `yes`, `no`, `limited`, `unknown`

`changing_table`: `yes`, `no`, `unknown`

`ostomy`: `yes`, `no`, `unknown`

`gender`: `male`, `female`, `unisex`, `mixed`, `unknown`

`verification_status`: `reference`, `submitted`, `verified`

`verification_method`: `osm_reference`, `official_web`, `phone`, `email`, `field_survey`, `user_submission`, `unknown`

## ライセンス分離

- `reference`: OSMなど第三者由来または未確認の参考情報。CC0公開データに直接転用しません。
- `submitted`: GitHub Issueとして投稿された未確認情報。管理者確認前は地図へ自動表示せず、CC0公開データにも含めません。
- `verified`: 独立確認と権利確認が完了した情報。CC0公開用GeoJSONへ追加できます。

