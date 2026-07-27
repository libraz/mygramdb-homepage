---
title: MygramDB v1.7 へのアップグレード
description: v1.7へ移行する手順。DB修飾のテーブル識別子、新しい /tables/{identity} HTTPルート、複数DBのインデックス化、一貫スナップショットを説明します。
---

# v1.7 へのアップグレード

MygramDB v1.7.0 では、DB修飾テーブル識別子、複数DBのインデックス化、HTTP/TCP の主要検索APIの機能差分解消、複数テーブルの一貫スナップショットが追加されました。単一DB構成でTCP/CLIだけを使っている場合、多くのコマンドはそのまま動きます。一方、HTTPクライアントはテーブルルートの変更が必要です。

::: warning HTTPクライアントは必ず確認
v1.7.0ではHTTPのテーブルルートが変更されています。TCP/CLI中心の構成では影響が小さい一方、HTTPで検索しているアプリケーションはエンドポイント変更なしでは動きません。
:::

## 変更点

### HTTP テーブルルート

テーブル対象のHTTPエンドポイントはすべて `/tables/{identity}` 配下になりました。

| 操作 | v1.7.0 のルート |
|------|-----------------|
| 検索 | `POST /tables/{identity}/search` |
| カウント | `POST /tables/{identity}/count` |
| ファセット | `POST /tables/{identity}/facet` |
| ドキュメント取得 | `GET /tables/{identity}/{primary_key}` |

`{identity}` は、単一DB構成では修飾なしのテーブル名、複数DB構成では `app_db.articles` のようなDB修飾テーブル名です。

旧ルートの `/{table}/search`、`/{table}/count`、`/{table}/{primary_key}` と、暫定的な2セグメント形式の `/tables/{database}/{table}/...` は削除されています。

::: info 用語補足
**テーブル識別子**は、MygramDBが検索対象テーブルを一意に指すための名前です。複数DBを扱う場合、同じ `articles` というテーブル名が複数存在できるため、`app_db.articles` のようにDB名も含めて指定します。
:::

```bash
# v1.7以前
curl -X POST http://localhost:8080/articles/search \
  -H "Content-Type: application/json" \
  -d '{"q":"mysql"}'

# v1.7 単一DB構成
curl -X POST http://localhost:8080/tables/articles/search \
  -H "Content-Type: application/json" \
  -d '{"q":"mysql"}'

# v1.7 複数DB構成
curl -X POST http://localhost:8080/tables/app_db.articles/search \
  -H "Content-Type: application/json" \
  -d '{"q":"mysql"}'
```

### テーブル識別子

設定済みテーブルは、内部的に必ず `<database>.<table>` の有効識別子を持ちます。

```yaml
mysql:
  database: app_db

tables:
  - name: articles          # 有効識別子: app_db.articles
  - database: archive_db
    name: articles          # 有効識別子: archive_db.articles
```

設定内のすべてのテーブルが1つのDBに属する場合、修飾なしのテーブル名も引き続き使えます。

```mygram
SEARCH articles mysql
SYNC articles
GET articles 123
```

設定が2つ以上のDBにまたがる場合、TCP、CLI、C++、C API、HTTP のすべてで `<database>.<table>` の指定が必要です。

```mygram
SEARCH app_db.articles mysql
SYNC archive_db.articles
GET app_db.articles 123
```

複数DB構成で修飾なしのテーブル名を使うと、曖昧になる可能性があるためエラーになります。

## HTTPで追加された機能

`FACET` はHTTPからも利用できます。

```bash
curl -X POST http://localhost:8080/tables/app_db.articles/facet \
  -H "Content-Type: application/json" \
  -d '{
    "column": "category",
    "q": "database OR mysql",
    "filters": {"status": 1},
    "limit": 10
  }'
```

HTTP `/search` は、専用JSONフィールドでソート、ファジー検索、ハイライトに対応します。HTTP `/count` は意図的に厳密で、`limit`、`offset`、`sort`、`highlight`、`fuzzy` などの検索専用フィールドは無視せずエラーにします。

## スナップショットとダンプ

v1.7.0 では、ダンプメタデータにテーブルごとのDB名が保存されます。アップグレード直後はロールバック用に古いダンプを残し、その後新しくダンプを作成して、復元時にも修飾済みテーブル識別子が保持される状態にしてください。

::: tip アップグレード直後のダンプ
新しいバージョンで `DUMP SAVE` を作成しておくと、以後の復元で複数DBのテーブル識別子を正しく保持できます。ロールバック可能性が残っている間は、旧バージョンのダンプも消さずに残してください。
:::

レプリケーション有効かつ複数テーブル構成の場合、初期スナップショットはMySQL上の1つの一貫スナップショットで全テーブルを読み込み、共有GTIDを取得します。ダンプとスナップショットが並行する場合も、停止済みGTIDを調整して、正確な位置からレプリケーションを再開できるようにします。

## アップグレードチェックリスト

1. HTTPクライアントを `/{table}/...` から `/tables/{identity}/...` に変更する。
2. 2つ以上のDBを設定する場合、すべてのテーブル参照を `<database>.<table>` にする。
3. `mysql.database` 以外のDBにあるテーブルには `tables[*].database` を追加する。
4. ロールバックが不要になるまで旧ダンプを残す。
5. アップグレード後に `DUMP SAVE` を実行し、修飾済み識別子を含む新しいメタデータを作成する。
6. 各テーブルで `SYNC`、`SEARCH`、`/tables/{identity}/search`、`/tables/{identity}/count`、`/tables/{identity}/facet` を確認する。
