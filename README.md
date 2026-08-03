# 横瀬町トイレアクセスマップ

埼玉県秩父郡横瀬町で利用できるトイレ情報を、地図上で確認・更新するための静的Webサイトです。

## 公開サイト

```text
https://mapbytomoya.github.io/YOKOZEToioetsmap202602/
```

## 主な機能

- 横瀬町内のトイレ候補を地図上に表示
- 車いす対応状況による色分けと絞り込み
- OpenStreetMap上の情報を編集するためのリンク
- 現地で確認したトイレ情報の投稿下書き作成
- GeoJSON・SVGデータの取り込みプレビュー
- スマートフォンとパソコンの両方に対応

## データについて

表示データは、出典と確認状態が異なる二つのレイヤーに分けて管理しています。

- `data/reference/`: OpenStreetMap由来の参考候補です。ODbL 1.0の条件に従います。
- `data/verified/`: 独立確認を終えた公開用データです。CC0 1.0 Universalで公開します。

参考候補は、位置・設備・利用条件がすべて確認済みという意味ではありません。現地確認や施設への問い合わせを終えた情報だけを、確認済みデータへ追加します。

## 情報を更新する方法

地図上のトイレを選択すると、次の操作ができます。

1. OpenStreetMap上の位置や基本情報を編集する
2. 現地調査や問い合わせで確認した情報を提供する

情報提供用の下書きはログインなしで作成できます。GitHub Issueを利用する場合は、GitHubアカウントが必要です。

## ローカルで確認する

リポジトリのルートで静的HTTPサーバーを起動します。

```bash
python3 -m http.server 8000
```

ブラウザで次のURLを開きます。

```text
http://localhost:8000/
```

## GitHub Pagesへの公開

`main` ブランチへpushすると、`.github/workflows/deploy-pages.yml` によりGitHub Pagesへ自動デプロイされます。

初回のみ、リポジトリの **Settings → Pages → Build and deployment → Source** を **GitHub Actions** に設定してください。

## ライセンス

コードと各データのライセンス範囲については、[LICENSE](LICENSE)および各データディレクトリのREADMEを確認してください。
