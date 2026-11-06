---
title: MygramDB クエリガイド - 検索・絞り込み・ソート・集計
description: MygramDB のクエリ実践ガイド。基本検索と Boolean 演算子、フレーズ検索、フィルタ、ソート、ハイライト、あいまい検索、FACET 集計、同義語展開、ページネーションを扱います。
head:
  - - meta
    - name: keywords
      content: MygramDB クエリガイド, 検索例, Boolean 検索, FILTER, SORT, HIGHLIGHT, FUZZY, FACET 集計, 同義語展開, ページネーション
---

# クエリガイド

MygramDB のクエリコマンドを、実際の例で紹介します。文法の詳細、制限、エラーメッセージは[クエリ構文リファレンス](/ja/docs/query-syntax)を参照してください。

::: warning 接続元 IP を許可
クエリを実行する前に、設定ファイルの `network.allow_cidrs` にクライアントの IP が含まれていることを確認してください。**CIDR** は `192.168.1.0/24` のような IP アドレス範囲の書き方です。一致するエントリがない場合、すべての接続が拒否されます。[ネットワークセキュリティ](/ja/docs/configuration#ネットワークセキュリティ)を参照してください。
:::

## mygram-cli で接続

```bash
mygram-cli -h localhost -p 11016
```

接続後、対話的にクエリを実行できます。

## 基本検索

```mygram
127.0.0.1:11016> SEARCH articles hello world
OK RESULTS 3 101 205 387
```

単一 DB 構成では `articles` はその DB 内のテーブルとして解決されます。複数 DB 構成では `<database>.<table>` 形式で指定してください。

```mygram
127.0.0.1:11016> SEARCH app_db.articles hello world
```

## Boolean 演算子

::: tip 演算子の読み方
`AND` は「両方含む」、`OR` は「どれかを含む」、`NOT` は「含むものを除外」です。複雑な条件では括弧を使うと意図が明確になります。
:::

### AND - すべての語句を含む

```mygram
127.0.0.1:11016> SEARCH articles golang AND tutorial
```

### OR - いずれかの語句を含む

```mygram
127.0.0.1:11016> SEARCH articles golang OR python OR rust
```

### NOT - 語句を除外

```mygram
127.0.0.1:11016> SEARCH articles tutorial NOT beginner
127.0.0.1:11016> SEARCH articles tutorial AND NOT beginner
127.0.0.1:11016> SEARCH articles required AND 'not'
```

`AND NOT` は `NOT` と同じ除外条件です。追加条件をすべて `AND` の後ろに付けて送るクライアント向けに受け付けます。

引用符で囲んだキーワードは、演算子ではなく通常の語として扱われます。最後のクエリは `not` という語を必須にし、`NOT` 演算子としては解釈されません。

先頭の `NOT` も使えますが、候補集合が広くなります。検索語やフィルタと組み合わせて絞り込んでください（[NOT 検索](/ja/docs/query-syntax#not-%E6%A4%9C%E7%B4%A2)を参照）。

### 組み合わせ

```mygram
127.0.0.1:11016> SEARCH articles (golang OR python) AND tutorial NOT beginner
```

## フレーズ検索

引用符で囲むと、語句の並びを保ったフレーズとして検索します。

```mygram
127.0.0.1:11016> SEARCH articles "machine learning"
127.0.0.1:11016> SEARCH articles '機械学習'
```

演算子と組み合わせることもできます。

```mygram
127.0.0.1:11016> SEARCH articles "web framework" AND (golang OR python)
```

## フィルタリング

カラムの値で絞り込みます。

```mygram
127.0.0.1:11016> SEARCH articles tech FILTER status = 1
127.0.0.1:11016> SEARCH articles tech FILTER views > 1000
127.0.0.1:11016> SEARCH articles tech FILTER created_at >= 1704067200
```

::: warning フィルタ対象カラムは設定が必要
`FILTER` で使えるのは、設定ファイルの `tables[*].filters` または `tables[*].required_filters` に定義したカラムです。定義していないカラムは、MySQL に存在していても MygramDB の検索時フィルタには使えません。同じカラムを両方に定義できます。`required_filters` は行をインデックスに登録するかどうかを決め、クエリの `FILTER` はリクエストごとに登録済みの行を絞り込みます。
:::

クエリの日時は数値で指定します。`date`、`datetime`、`timestamp` は Unix エポック秒です（`1704067200` は UTC の 2024-01-01 00:00:00）。`time` は符号付きの秒数で、負値や 24時間を超える値も使えます。`required_filters` で使う ISO 8601 などの文字列は、クエリの `FILTER` にそのまま指定しないでください。

複数のフィルタは AND 条件になります。

```mygram
127.0.0.1:11016> SEARCH articles tech FILTER status = 1 FILTER category_id = 5
```

### フィルタ演算子

`FILTER` では `=`、`!=` / `<>`、`>`、`>=`、`<`、`<=` を使えます。それぞれに英字の別名（`EQ`、`NE`、`GT`、`GTE`、`LT`、`LTE`）があります。一覧は[サポートされる演算子](/ja/docs/query-syntax#%E3%82%B5%E3%83%9B%E3%82%9A%E3%83%BC%E3%83%88%E3%81%95%E3%82%8C%E3%82%8B%E6%BC%94%E7%AE%97%E5%AD%90)を参照してください。

## ソート

主キーでソートします。

```mygram
127.0.0.1:11016> SEARCH articles golang SORT ASC
127.0.0.1:11016> SEARCH articles golang SORT DESC
```

カラムを指定してソートします。

```mygram
127.0.0.1:11016> SEARCH articles golang SORT created_at DESC
127.0.0.1:11016> SEARCH articles golang SORT BY created_at DESC
127.0.0.1:11016> SEARCH articles golang SORT _score ASC
```

`BY` は省略できます。カラムを指定しない `SORT ASC` と `SORT DESC` は、主キーの並び順を指定する省略形です。

### 関連度ソート（BM25）

予約カラム `_score` を指定すると、BM25 関連度でソートできます。

```mygram
127.0.0.1:11016> SEARCH articles "machine learning" SORT _score DESC LIMIT 10
```

BM25 は、クエリ時に語句頻度（TF）と逆文書頻度（IDF）を計算します。`bm25.k1`（デフォルト `1.2`）と `bm25.b`（デフォルト `0.75`）で調整できます。`SORT _score` には `bm25.enable: true` が必要です。詳細は [BM25 関連度スコアリング](/ja/docs/query-syntax#bm25-%E9%96%A2%E9%80%A3%E5%BA%A6%E3%82%B9%E3%82%B3%E3%82%A2%E3%83%AA%E3%83%B3%E3%82%AF%E3%82%99-sort-score)を参照してください。

## ハイライト

マッチした語句をタグで囲んだスニペットを返します。

```mygram
127.0.0.1:11016> SEARCH articles "machine learning" HIGHLIGHT LIMIT 10
127.0.0.1:11016> SEARCH articles "golang" HIGHLIGHT TAG <strong> </strong> LIMIT 10
127.0.0.1:11016> SEARCH articles "database" HIGHLIGHT SNIPPET_LEN 200 MAX_FRAGMENTS 5 LIMIT 10
```

タグのデフォルトは `<em>` と `</em>` です。`SNIPPET_LEN`（デフォルト 100）は 1 フラグメントあたりの最大コードポイント数、`MAX_FRAGMENTS`（デフォルト 3）は省略記号で連結する最大フラグメント数です。指定できる範囲は[ハイライト](/ja/docs/query-syntax#%E3%83%8F%E3%82%A4%E3%83%A9%E3%82%A4%E3%83%88-highlight)を参照してください。スニペットは、`memory.verify_text` が `"off"` の場合もサーバーが保持する正規化済みテキストから作られます。

## あいまい検索

Levenshtein 編集距離の範囲内にある語句にマッチします。

```mygram
127.0.0.1:11016> SEARCH articles "machne" FUZZY LIMIT 10
127.0.0.1:11016> SEARCH articles "databse" FUZZY 2 LIMIT 10
```

距離 `1`（デフォルト）は 1 回の編集（挿入、削除、置換）以内、`2` は 2 回の編集以内でマッチします。`FUZZY` は、同じクエリから `FUZZY` を外した検索結果もすべて含み、編集距離に一致する追加結果が加わることがあります。詳細は[あいまい検索](/ja/docs/query-syntax#%E3%81%82%E3%81%84%E3%81%BE%E3%81%84%E6%A4%9C%E7%B4%A2-fuzzy)を参照してください。

## FACET 集計

フィルタカラムの値を、件数付きで集計します。

```mygram
127.0.0.1:11016> FACET articles status
127.0.0.1:11016> FACET articles category "search text" FILTER status = 1 LIMIT 10
```

TCP レスポンスは件数の降順です。

```mygram
OK FACET <returned_value_count> <total_distinct_values>
<value1>\t<count1>
<value2>\t<count2>

```

ヘッダーの 1つ目の件数はこのページで返す値の数、2つ目はクエリに該当する異なる値の総数です。2つ目には、`LIMIT` や `OFFSET` で省略された値も含まれます。各値とドキュメント件数はタブで区切られ、空行でレスポンスが終わります。件数が同じ値も安定した順序で並ぶため、リクエストごとにページ内の並びが入れ替わることはありません。

集計対象をクエリで絞る場合は、`SEARCH` と同じ AND/NOT/FILTER/LIMIT 句を使えます。

FACET は HTTP でも `POST /tables/{identity}/facet` から利用できます。HTTP ボディでは `column`、任意の `q`、任意の `filters`、任意の `limit` を指定します。

## 同義語展開

同義語辞書（`tables[*].synonyms.enable: true`、[設定](/ja/docs/configuration#テーブル単位の同義語)を参照）が有効な場合、検索語句はクエリ時に同義語の OR グループへ自動展開されます。クエリの構文は変わりません。たとえば `car` を検索すると、TSV 辞書で同じグループに定義された `automobile` や `vehicle` にもマッチします。

同義語はテーブルごとの設定です。あいまい検索は別の実行パスを使うため、同じクエリ内では同義語展開と組み合わせません。

## ページネーション

```mygram
127.0.0.1:11016> SEARCH articles golang LIMIT 10
127.0.0.1:11016> SEARCH articles golang LIMIT 10 OFFSET 20
```

`OK RESULTS` の `total_count` はページネーション前のマッチ総数で、続く ID は現在のページです。詳細は[レスポンスフォーマット](/ja/docs/query-syntax#%E3%83%AC%E3%82%B9%E3%83%9B%E3%82%9A%E3%83%B3%E3%82%B9%E3%83%95%E3%82%A9%E3%83%BC%E3%83%9E%E3%83%83%E3%83%88)を参照してください。`LIMIT` の範囲と深いページのコストは[ページネーション](/ja/docs/query-syntax#%E3%83%98%E3%82%9A%E3%83%BC%E3%82%B7%E3%82%99%E3%83%8D%E3%83%BC%E3%82%B7%E3%83%A7%E3%83%B3-limit-offset)で説明しています。

## カウントクエリ

ID を返さず、件数だけを取得します。

```mygram
127.0.0.1:11016> COUNT articles golang AND tutorial
OK COUNT 42
```

## 実用例

### 最新の Go チュートリアルを検索

```mygram
127.0.0.1:11016> SEARCH articles golang AND tutorial FILTER status = 1 SORT created_at DESC LIMIT 20
```

### データベースに関する人気記事

```mygram
127.0.0.1:11016> SEARCH posts (mysql OR postgresql) AND performance FILTER views > 1000 SORT _score DESC LIMIT 10
```

### 関連度順＋ハイライト付き

```mygram
127.0.0.1:11016> SEARCH articles "machine learning" SORT _score DESC HIGHLIGHT LIMIT 10
```

### カテゴリ内のアクティブユーザー数

```mygram
127.0.0.1:11016> COUNT users tech FILTER status = 1 FILTER category_id = 5
```

## HTTP API

`SEARCH`、`COUNT`、`FACET`、ドキュメント GET は `/tables/{identity}/...` のルート形式で HTTP からも利用できます。HTTP の `q` はデフォルトでリテラル検索です。意図した Boolean 式を送る場合だけ `"mode": "boolean"` を指定してください。

```bash
curl -X POST http://localhost:8080/tables/articles/search \
  -H "Content-Type: application/json" \
  -d '{"q": "golang tutorial", "limit": 10}'

curl -X POST http://localhost:8080/tables/articles/count \
  -H "Content-Type: application/json" \
  -d '{"q": "golang"}'

curl -X POST http://localhost:8080/tables/articles/facet \
  -H "Content-Type: application/json" \
  -d '{"column": "category", "q": "golang", "limit": 10}'

curl -X POST http://localhost:8080/tables/articles/search \
  -H "Content-Type: application/json" \
  -d '{"q": "golang AND tutorial", "mode": "boolean", "limit": 10}'
```

2つ以上の DB を設定している場合は `/tables/app_db.articles/...` のように指定します。`SET`、`SHOW VARIABLES`、`SYNC`、`DUMP` などの管理系コマンドは TCP/CLI 専用です。

## 演算子の優先順位

括弧がない場合は `NOT`、`AND`、`OR` の順に強く結合します。たとえば `a OR b AND c` は `a OR (b AND c)` と解釈されます。意図を明確にするため、括弧を使ってください。そのほかの例は[演算子の優先順位](/ja/docs/query-syntax#%E6%BC%94%E7%AE%97%E5%AD%90%E3%81%AE%E5%84%AA%E5%85%88%E9%A0%86%E4%BD%8D)を参照してください。

## パフォーマンスのヒント

1. **LIMIT を使用** - 高速な部分ソートが有効
2. **具体的なフィルタを追加** - 結果セットを早期に削減
3. **OR より AND を優先** - AND クエリは通常高速
4. **フィルタカラムをインデックス** - 頻繁にフィルタするカラムを設定に追加

詳しくはリファレンスの[パフォーマンスのヒント](/ja/docs/query-syntax#%E3%83%8F%E3%82%9A%E3%83%95%E3%82%A9%E3%83%BC%E3%83%9E%E3%83%B3%E3%82%B9%E3%81%AE%E3%83%92%E3%83%B3%E3%83%88)を参照してください。

## 次のステップ

- [設定](/ja/docs/configuration) - フィルタカラムの設定
- [クイックスタート](/ja/docs/getting-started) - 入門ガイド

## 詳細ドキュメント

- [クエリ構文リファレンス（詳細）](/ja/docs/query-syntax)
- [HTTP API](/ja/docs/http-api)
- [プロトコルリファレンス](/ja/docs/protocol)
