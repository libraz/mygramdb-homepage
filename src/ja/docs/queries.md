---
title: MygramDB クエリガイド - 検索・絞り込み・ソート・集計
description: MygramDBのクエリ実践ガイド。基本検索とブール演算子、フレーズ検索、フィルタ、ソート、ハイライト、ファジー検索、FACET集計、シノニム展開、ページネーションを扱います。
head:
  - - meta
    - name: keywords
      content: MygramDB クエリガイド, 検索例, ブール検索, FILTER, SORT, HIGHLIGHT, FUZZY, FACET 集計, シノニム展開, ページネーション
---

# クエリガイド

MygramDBで効果的に検索する方法を学びましょう。

::: warning 接続元IPを許可
クエリを実行する前に、設定ファイルの `allow_cidrs` にIPアドレスが登録されていることを確認してください。CIDR登録がない場合、すべての接続が拒否されます。[ネットワークセキュリティ](/ja/docs/configuration#ネットワークセキュリティ)を参照してください。
:::

::: info 用語補足
**CIDR** はIPアドレス範囲の書き方です。接続できない場合は、まず `network.allow_cidrs` にクライアントのIPが含まれているか確認してください。
:::

## mygram-cliで接続

```bash
mygram-cli -h localhost -p 11016
```

接続後、対話的にクエリを実行できます。

## 基本検索

```mygram
127.0.0.1:11016> SEARCH articles hello world
OK RESULTS 3 101 205 387
```

単一DB構成では `articles` はそのDB内のテーブルとして解決されます。複数DB構成では `<database>.<table>` 形式で指定してください。

```mygram
127.0.0.1:11016> SEARCH app_db.articles hello world
```

## ブール演算子

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

`AND NOT` はここでの `NOT` と同じ除外条件です。追加条件をすべて `AND` の後に表現するクライアントでも使えます。

引用したキーワードはリテラルとして扱われます。最後のクエリは `not` という語を必須にし、引用符によって `NOT` 演算子としては解釈されません。

先頭の `NOT` も使えますが、候補集合が広くなりやすいため、通常は検索語やフィルタと組み合わせて絞り込みます。

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

演算子と組み合わせ：

```mygram
127.0.0.1:11016> SEARCH articles "web framework" AND (golang OR python)
```

## フィルタリング

カラム値でフィルタ：

```mygram
127.0.0.1:11016> SEARCH articles tech FILTER status = 1
127.0.0.1:11016> SEARCH articles tech FILTER views > 1000
127.0.0.1:11016> SEARCH articles tech FILTER created_at >= 1704067200
```

::: warning フィルタ対象カラムは設定が必要
`FILTER` で使えるのは、設定ファイルの `tables[*].filters` または `tables[*].required_filters` に定義したカラムです。定義していないカラムは、MySQLに存在していてもMygramDBの検索時フィルタには使えません。同じカラムを両方に定義できます。`required_filters` は行をインデックスに登録するかどうかを決め、クエリの `FILTER` はリクエストごとに登録済みの行を絞り込みます。
:::

クエリの日時フィルタには数値を指定します。`date`、`datetime`、`timestamp` は Unix エポック秒、`time` は符号付きの時間差を秒で指定し、負値や24時間を超える値も使えます。たとえば `1704067200` は UTC の 2024-01-01 00:00:00 を表します。設定の `required_filters` は ISO 8601 など独自の日時形式を使うため、その文字列をクエリの `FILTER` にそのまま指定しないでください。

複数フィルタ（AND条件）：

```mygram
127.0.0.1:11016> SEARCH articles tech FILTER status = 1 FILTER category_id = 5
```

### フィルタ演算子

| 演算子 | 別名 | 説明 |
|----------|-------|-------------|
| `=` | `EQ` | 等しい |
| `!=` / `<>` | `NE` | 等しくない |
| `>` | `GT` | より大きい |
| `>=` | `GTE` | 以上 |
| `<` | `LT` | より小さい |
| `<=` | `LTE` | 以下 |

## ソート

プライマリキーでソート：

```mygram
127.0.0.1:11016> SEARCH articles golang SORT ASC
127.0.0.1:11016> SEARCH articles golang SORT DESC
```

カラムでソート：

```mygram
127.0.0.1:11016> SEARCH articles golang SORT created_at DESC
127.0.0.1:11016> SEARCH articles golang SORT BY created_at DESC
127.0.0.1:11016> SEARCH articles golang SORT _score ASC
```

`BY` は省略できます。カラムを指定する2つの形式はどちらも有効です。`SORT ASC` と `SORT DESC` は引き続きプライマリキーの並び順を指定する省略形です。

数値型のフィルタカラムは宣言された型の順序で並びます。`bigint_unsigned` は 2^63 を超える値も符号なし整数として正しく並べます。

### 関連度ソート（BM25）

予約カラム `_score` を指定するとBM25関連度でソートできます：

```mygram
127.0.0.1:11016> SEARCH articles "machine learning" SORT _score DESC LIMIT 10
```

BM25はクエリ時にIDFとTFを計算します。パラメータは `bm25.k1`（デフォルト `1.2`）と `bm25.b`（デフォルト `0.75`）で調整できます。`SORT _score` には `bm25.enable: true` が必要です。スコア計算に使う正規化済みテキストは、N-gramの事後フィルタを制御する `memory.verify_text` とは別にサーバーが保持します。

## ハイライト

マッチした語句をタグで囲んだスニペットを返却します：

```mygram
127.0.0.1:11016> SEARCH articles "machine learning" HIGHLIGHT LIMIT 10
127.0.0.1:11016> SEARCH articles "golang" HIGHLIGHT TAG <strong> </strong> LIMIT 10
127.0.0.1:11016> SEARCH articles "database" HIGHLIGHT SNIPPET_LEN 200 MAX_FRAGMENTS 5 LIMIT 10
```

| オプション | デフォルト | 範囲 | 説明 |
|--------|---------|-------|-------------|
| `TAG <open> <close>` | `<em>` / `</em>` | — | 開始/終了タグ |
| `SNIPPET_LEN <n>` | 100 | 1〜10,000 | 1フラグメントあたりの最大コードポイント数 |
| `MAX_FRAGMENTS <n>` | 3 | 1〜100 | `…` で連結する最大フラグメント数 |

HIGHLIGHTは、`memory.verify_text` が `"off"` の場合もサーバーが保持する正規化済みテキストを使います。

## ファジー検索

Levenshtein編集距離の範囲内で語句をマッチします：

```mygram
127.0.0.1:11016> SEARCH articles "machne" FUZZY LIMIT 10
127.0.0.1:11016> SEARCH articles "databse" FUZZY 2 LIMIT 10
```

距離 `1`（デフォルト）は1編集操作（挿入／削除／置換）以内、`2` は2編集操作以内でマッチします。長さで候補を絞ることで距離計算を抑えます。`FUZZY` は同じクエリから `FUZZY` を外した検索結果をすべて含みます。N-gramサイズ未満の短い語やCJK/ASCII混在語も含まれ、編集距離に一致する追加結果が加わることがあります。

## FACET集計

フィルタカラムの値を件数付きで集計します：

```mygram
127.0.0.1:11016> FACET articles status
127.0.0.1:11016> FACET articles category "search text" FILTER status = 1 LIMIT 10
```

TCPレスポンス（件数の降順）：

```mygram
OK FACET <returned_value_count> <total_distinct_values>
<value1>\t<count1>
<value2>\t<count2>

```

ヘッダーの1つ目の件数はこのページで返す値の数、2つ目はクエリに該当する異なる値の総数です。2つ目には、`LIMIT` や `OFFSET` で省略された値も含まれます。各値とドキュメント件数はタブで区切られ、空行でレスポンスが終わります。

件数の多い値から返し、件数が同じ値も安定した順序で並べます。ページ間で同数の値の並びが変わらないため、`OFFSET` で値を重複または取りこぼしません。FACETは `SEARCH` と同じく AND/NOT/FILTER/LIMIT を組み合わせて、特定の検索結果にスコープを絞った集計も可能です。

FACETはHTTPでも `POST /tables/{identity}/facet` から利用できます。HTTPボディでは `column`、任意の `q`、任意の `filters`、任意の `limit` を指定します。

## シノニム展開

シノニム辞書（`tables[*].synonyms.enable: true`、[設定](/ja/docs/configuration#%E3%83%86%E3%83%BC%E3%83%95%E3%82%99%E3%83%AB%E5%8D%98%E4%BD%8D%E3%81%AE%E3%82%B7%E3%83%8E%E3%83%8B%E3%83%A0)を参照）が有効な場合、検索語句はクエリ時に同義語のORグループへ自動展開されます。クエリ側の構文変更は不要で、例えば `car` を検索すると、TSV辞書で同じグループに定義された `automobile` や `vehicle` にもマッチします。

シノニムはテーブルごとの設定です。ファジー検索は別の実行パスを使うため、同じクエリ内ではシノニム展開と組み合わせません。

## ページネーション

```mygram
127.0.0.1:11016> SEARCH articles golang LIMIT 10
127.0.0.1:11016> SEARCH articles golang LIMIT 10 OFFSET 20
```

`OK RESULTS` の `total_count` はページング前のマッチ総数で、返されるIDは現在のページです。サーバーは総数とページを1回のインデックス読み取りから求めるため、同じ結果集合を示します。

ブール検索のキャッシュキーは、解析後のトークン、引用符、括弧の構造を保持します。全角空白、括弧、引用の違いによって別の式になるクエリは別のキャッシュエントリを使い、同じように解析される Unicode 空白は共有されることがあります。

## カウントクエリ

IDなしでカウントのみ取得：

```mygram
127.0.0.1:11016> COUNT articles golang AND tutorial
OK COUNT 42
```

## 実用例

### 最新のGoチュートリアルを検索

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

`SEARCH`、`COUNT`、`FACET`、ドキュメントGETは `/tables/{identity}/...` のルート形式でHTTPからも利用できます。HTTPの `q` は既定でリテラル検索です。意図したBoolean式を送る場合だけ `"mode": "boolean"` を指定してください。

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

2つ以上のDBを設定している場合は `/tables/app_db.articles/...` のように指定します。`SET`、`SHOW VARIABLES`、`SYNC`、`DUMP` などの管理系コマンドはTCP/CLI専用です。

## 演算子の優先順位

括弧がない場合、演算子は以下の順序で評価されます：

1. **NOT**（最高）
2. **AND**
3. **OR**（最低）

例：`a OR b AND c` は `a OR (b AND c)` と解釈されます

::: tip 括弧で意図を固定
意図を明確にし、予期しない結果を避けるため括弧を使用してください。
:::

## パフォーマンスのヒント

1. **LIMITを使用** - 高速な部分ソートが有効
2. **具体的なフィルタを追加** - 結果セットを早期に削減
3. **ORよりANDを優先** - ANDクエリは通常高速
4. **フィルタカラムをインデックス** - 頻繁にフィルタするカラムを設定に追加

## 次のステップ

- [設定](/ja/docs/configuration) - フィルタカラムの設定
- [クイックスタート](/ja/docs/getting-started) - 入門ガイド

## 詳細ドキュメント

- [クエリ構文リファレンス（詳細）](/ja/docs/query-syntax)
- [HTTP API](/ja/docs/http-api)
- [プロトコルリファレンス](/ja/docs/protocol)
