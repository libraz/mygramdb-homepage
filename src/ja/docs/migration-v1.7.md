---
title: MygramDB v1.7 へのアップグレード
description: v1.7 へ移行する手順。DB 修飾のテーブル識別子、新しい /tables/{identity} HTTP ルート、複数 DB のインデックス化、一貫スナップショットを説明します。
---

# v1.7 へのアップグレード

::: warning HTTP クライアントは必ず確認
v1.7.0 では HTTP のテーブルルートが変わりました。TCP/CLI 中心の構成では影響が小さいものの、HTTP で検索しているアプリケーションは、エンドポイントを変更しないと動きません。
:::

MygramDB v1.7.0 では、DB 修飾のテーブル識別子、複数 DB のインデックス化、主要な検索 API での HTTP と TCP の機能差の解消、複数テーブルにまたがる一貫スナップショットが加わりました。単一 DB 構成で TCP/CLI だけを使っている場合、ほとんどのコマンドはそのまま動きます。HTTP クライアントは、テーブルルートを変更する必要があります。

## 変更点

### HTTP テーブルルート

::: info 用語補足
**テーブル識別子**は、MygramDB が検索対象のテーブルを一意に指すための名前です。複数 DB を扱う場合、同じ `articles` というテーブル名が複数存在しうるため、`app_db.articles` のように DB 名も含めて指定します。
:::

テーブルを対象とする HTTP エンドポイントは、すべて `/tables/{identity}` 配下になりました。

| 操作 | v1.7.0 のルート |
|------|-----------------|
| 検索 | `POST /tables/{identity}/search` |
| カウント | `POST /tables/{identity}/count` |
| ファセット | `POST /tables/{identity}/facet` |
| ドキュメント取得 | `GET /tables/{identity}/{primary_key}` |

`{identity}` は、単一 DB 構成では修飾なしのテーブル名、複数 DB 構成では `app_db.articles` のような DB 修飾テーブル名です。

旧ルートの `/{table}/search`、`/{table}/count`、`/{table}/{primary_key}` と、暫定的な 2 セグメント形式の `/tables/{database}/{table}/...` は削除されています。

```bash
# v1.7 より前
curl -X POST http://localhost:8080/articles/search \
  -H "Content-Type: application/json" \
  -d '{"q":"mysql"}'

# v1.7 単一 DB 構成
curl -X POST http://localhost:8080/tables/articles/search \
  -H "Content-Type: application/json" \
  -d '{"q":"mysql"}'

# v1.7 複数 DB 構成
curl -X POST http://localhost:8080/tables/app_db.articles/search \
  -H "Content-Type: application/json" \
  -d '{"q":"mysql"}'
```

### テーブル識別子

設定済みのテーブルは、必ず `<database>.<table>` 形式のテーブル識別子を持ちます。

```yaml
mysql:
  database: app_db

tables:
  - name: articles          # テーブル識別子: app_db.articles
  - database: archive_db
    name: articles          # テーブル識別子: archive_db.articles
```

設定内のすべてのテーブルが 1つの DB に属する場合、修飾なしのテーブル名も引き続き使えます。

```mygram
SEARCH articles mysql
SYNC articles
GET articles 123
```

設定が 2つ以上の DB にまたがる場合、TCP、CLI、C++、C API、HTTP のすべてで `<database>.<table>` の指定が必要です。

```mygram
SEARCH app_db.articles mysql
SYNC archive_db.articles
GET app_db.articles 123
```

複数 DB 構成で修飾なしのテーブル名を使うと、どの DB のテーブルか曖昧になるため、エラーになります。

## HTTP で追加された機能

`FACET` は HTTP からも利用できます。

```bash
curl -X POST http://localhost:8080/tables/app_db.articles/facet \
  -H "Content-Type: application/json" \
  -d '{
    "column": "category",
    "q": "database OR mysql",
    "mode": "boolean",
    "filters": {"status": 1},
    "limit": 10
  }'
```

HTTP の `/search` は、専用の JSON フィールドでソート、あいまい検索、ハイライトに対応します。HTTP の `/count` は意図的に厳密で、`limit`、`offset`、`sort`、`highlight`、`fuzzy` などの検索専用フィールドが来ても、無視せずにエラーにします。

## スナップショットとダンプ

::: tip アップグレード直後にダンプを取る
新しいバージョンで `DUMP SAVE` を実行しておくと、以後の復元で複数 DB のテーブル識別子が正しく保持されます。ロールバックの可能性が残っている間は、旧バージョンのダンプも消さずに残してください。
:::

v1.7.0 では、ダンプのメタデータにテーブルごとの DB 名が保存されます。

レプリケーションが有効で複数テーブルを設定している場合、初期スナップショットは MySQL の 1 つの一貫スナップショットから全テーブルを読み込み、共有 GTID を取得します。ダンプとスナップショットが同時に動くときは、ドレイン済みの GTID で両者を調整するため、ダンプから正確な位置でレプリケーションを再開できます。

## アップグレードチェックリスト

1. HTTP クライアントを `/{table}/...` から `/tables/{identity}/...` に変更する。
2. 2つ以上の DB を設定する場合、すべてのテーブル参照を `<database>.<table>` にする。
3. `mysql.database` 以外の DB にあるテーブルには `tables[*].database` を追加する。
4. ロールバックが不要になるまで旧ダンプを残す。
5. アップグレード後に `DUMP SAVE` を実行し、修飾済み識別子を含む新しいメタデータを作成する。
6. 各テーブルで `SYNC`、`SEARCH`、`/tables/{identity}/search`、`/tables/{identity}/count`、`/tables/{identity}/facet` を確認する。
