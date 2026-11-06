---
title: MygramDB クエリ構文リファレンス - Boolean 検索文法
description: MygramDB のクエリ構文完全リファレンス。Boolean 演算 AND/OR/NOT、括弧、フレーズ検索、FILTER 条件、SORT、LIMIT/OFFSET、BM25 _score、HIGHLIGHT、FUZZY、エラーハンドリング。
head:
  - - meta
    - name: keywords
      content: MygramDB クエリ構文, Boolean 検索, AND OR NOT, FILTER, SORT, BM25 スコアリング, HIGHLIGHT, あいまい検索, n-gram トークン化
---

# クエリ構文ガイド

クエリは、検索語を `AND`、`OR`、`NOT`、括弧、引用符で囲んだフレーズで組み合わせ、続けて `FILTER`、`SORT`、`LIMIT`、`OFFSET` を必要に応じて指定する形式です。このページはリファレンスです。用途別の例は[クエリガイド](/ja/docs/queries)を参照してください。

::: info SQL ではありません
MygramDB のクエリは SQL ではなく、検索用の小さなコマンド言語です。`SEARCH articles mysql FILTER status = 1 LIMIT 10` のように、検索語と検索オプションだけを記述します。
:::

## 目次

- [基本構文](#基本構文)
- [Boolean 演算子](#boolean-演算子)
- [複雑な Boolean 演算クエリ](#複雑な-boolean-演算クエリ)
- [演算子の優先順位](#演算子の優先順位)
- [引用符によるフレーズ検索](#%E5%BC%95%E7%94%A8%E7%AC%A6%E3%81%AB%E3%82%88%E3%82%8B%E3%83%95%E3%83%AC%E3%83%BC%E3%82%B9%E3%82%99%E6%A4%9C%E7%B4%A2)
- [フィルタ条件](#フィルタ条件)
- [ソート (SORT 句)](#ソート-sort-句)
- [ページネーション (LIMIT/OFFSET)](#%E3%83%98%E3%82%9A%E3%83%BC%E3%82%B7%E3%82%99%E3%83%8D%E3%83%BC%E3%82%B7%E3%83%A7%E3%83%B3-limit-offset)
- [BM25 関連度スコアリング (SORT _score)](#bm25-%E9%96%A2%E9%80%A3%E5%BA%A6%E3%82%B9%E3%82%B3%E3%82%A2%E3%83%AA%E3%83%B3%E3%82%AF%E3%82%99-sort-score)
- [ハイライト (HIGHLIGHT)](#ハイライト-highlight)
- [あいまい検索 (FUZZY)](#あいまい検索-fuzzy)
- [エラーハンドリング](#%E3%82%A8%E3%83%A9%E3%83%BC%E3%83%8F%E3%83%B3%E3%83%88%E3%82%99%E3%83%AA%E3%83%B3%E3%82%AF%E3%82%99)
- [パフォーマンスのヒント](#%E3%83%8F%E3%82%9A%E3%83%95%E3%82%A9%E3%83%BC%E3%83%9E%E3%83%B3%E3%82%B9%E3%81%AE%E3%83%92%E3%83%B3%E3%83%88)

---

## 基本構文

### コマンドフォーマット

```mygram
SEARCH <table> <query_expression> [FILTER ...] [SORT ...] [LIMIT ...] [OFFSET ...]
COUNT <table> <query_expression> [FILTER ...]
```

::: info テーブル名の指定
`<table>` は DB 修飾形式 `` `database.table` ``（例: `app_db.articles`）を受け付けます。単一データベース構成（設定しているデータベースが 1つだけ）では、`articles` のような修飾なしのテーブル名も使えます。修飾が必要になるのは 2つ以上のデータベースを設定している場合だけで、その場合、修飾なしの名前は曖昧として拒否されます。
:::

### シンプルな検索

```mygram
SEARCH <table> <term>
```

例:
```mygram
SEARCH threads golang
```

区切り文字以外の句読点は語句に含められます。たとえば `c++`、`e-mail`、`v1.9.0` はそれぞれ 1つの語として解析されます。

### レスポンスフォーマット

**SEARCH レスポンス:**
```mygram
OK RESULTS <total_count> <id1> <id2> <id3> ...
```

`total_count` は `LIMIT` と `OFFSET` を適用する前のマッチ総数で、同じ行の ID は現在のページです。サーバーは総数とページを 1回のインデックス読み取りから求めるため、同じ結果集合を示します。

例:
```mygram
OK RESULTS 3 101 205 387
```

**COUNT レスポンス:**
```mygram
OK COUNT <number>
```

例:
```mygram
OK COUNT 42
```

---

## Boolean 演算子

### AND 検索

指定した**すべて**の検索語を含むドキュメントを検索します。

::: tip 空白区切りとの違い
空白は AND ではありません。演算子がない `golang tutorial` は、引用符で囲んだ場合と同じく 1つの連続した文字列として検索されます。両方の語をドキュメント内のどこかに含むものを探すには `golang AND tutorial` と書きます。
:::

```mygram
SEARCH <table> term1 AND term2 AND term3
```

例:
```mygram
SEARCH threads golang AND tutorial
```

### OR 検索

指定された検索語の**いずれか**を含むドキュメントを検索します。

```mygram
SEARCH <table> term1 OR term2 OR term3
```

例:
```mygram
SEARCH threads golang OR python OR rust
```

### NOT 検索

特定の検索語を含むドキュメントを除外します。

::: warning NOT の使い方
`NOT` は結果セットからドキュメントを除外します。先頭に `NOT` を置くクエリは候補が非常に広くなるため、大規模インデックスでは肯定条件と組み合わせてください。
:::

```mygram
SEARCH <table> term1 NOT term2
```

例:
```mygram
SEARCH threads tutorial NOT beginner
```

`AND NOT` も同じ除外条件として受け付けます。追加条件をすべて `AND` の後ろに付けて出力する式変換器でも使えます。

```mygram
SEARCH threads tutorial AND NOT beginner
```

---

## 複雑な Boolean 演算クエリ

### 優先順位を制御する括弧

括弧で式をグループ化すると、演算子の優先順位を制御できます。

```mygram
SEARCH <table> (term1 OR term2) AND term3
```

例:
```mygram
SEARCH threads (golang OR python) AND tutorial
```

これは「tutorial」**AND**（「golang」**OR**「python」）を含むドキュメントを検索します。

### ネストした式

括弧は何段でもネストできます。

```mygram
SEARCH <table> ((term1 OR term2) AND term3) OR term4
```

例:
```mygram
SEARCH threads ((golang OR python) AND web) OR rust
```

これは次のドキュメントを検索します。
- 「web」**AND**（「golang」**OR**「python」）を含むドキュメント
- **または**「rust」を含むドキュメント

### 複雑なクエリの例

#### Go または Python のチュートリアルを検索し、初心者向けコンテンツを除外

```mygram
SEARCH threads (golang OR python) AND tutorial NOT beginner
```

#### MySQL または PostgreSQL に関するデータベースコンテンツを検索し、SQLite を除外

```mygram
SEARCH posts database AND (mysql OR postgresql) NOT sqlite
```

#### Python または R で機械学習コンテンツを検索し、TensorFlow を除外

```mygram
SEARCH articles "machine learning" AND (python OR R) NOT tensorflow
```

---

## 演算子の優先順位

括弧がない場合、演算子の優先順位は次のとおりです（高い順）。

1. **NOT**（最高）
2. **AND**（中）
3. **OR**（最低）

### 優先順位の例

| クエリ | 解釈 |
|--------|------|
| `a OR b AND c` | `a OR (b AND c)` |
| `NOT a AND b` | `(NOT a) AND b` |
| `a AND b OR c AND d` | `(a AND b) OR (c AND d)` |

::: tip 括弧で意図を固定
優先順位どおりで足りる場合は括弧を省略できますが、複雑な条件では括弧を付けると読み間違いを防げます。
:::

---

## 引用符によるフレーズ検索

語句の並びを保ったフレーズ検索には、ダブルクォーテーション `"` またはシングルクォーテーション `'` を使います。

```mygram
SEARCH <table> "exact phrase"
SEARCH <table> 'machine learning'
```

### エスケープシーケンス

引用符で囲んだ文字列では、次のエスケープシーケンスを使えます。

| シーケンス | 意味 |
|------------|------|
| `\n` | 改行 |
| `\t` | タブ |
| `\r` | キャリッジリターン |
| `\\` | バックスラッシュ |
| `\"` | ダブルクォーテーション |
| `\'` | シングルクォーテーション |

例:
```mygram
SEARCH articles "hello \"world\""
```

### 引用符と Boolean 演算子の組み合わせ

引用符で囲んだフレーズは、Boolean 演算子と組み合わせられます。

```mygram
SEARCH threads "web framework" AND (golang OR python)
SEARCH posts "machine learning" NOT "deep learning"
SEARCH articles required AND 'not'
```

引用符で囲んだキーワードは、演算子ではなく通常の語として扱われます。最後のクエリは `not` という語を必須にし、`NOT` 句にはなりません。

---

## フィルタ条件

`FILTER` 句で、カラムの値により結果を絞り込みます。

### 構文

```mygram
SEARCH <table> <query> FILTER <column> <operator> <value> [FILTER <col> <op> <val> ...]
```

`FILTER` は繰り返し指定でき、すべてに一致したドキュメントだけが残ります（AND 条件）。

### サポートされる演算子

| 演算子 | 別名 | 意味 |
|--------|------|------|
| `=` | `EQ` | 等しい |
| `!=` / `<>` | `NE` | 等しくない |
| `>` | `GT` | より大きい |
| `>=` | `GTE` | 以上 |
| `<` | `LT` | より小さい |
| `<=` | `LTE` | 以下 |

### 例

**単一フィルタ:**
```mygram
SEARCH articles tech FILTER status = 1
```

**複数フィルタ:**
```mygram
SEARCH articles tech FILTER status = 1 FILTER category = ai
```

**比較演算子:**
```mygram
SEARCH articles tech FILTER views > 1000
SEARCH articles tech FILTER created_at >= 1704067200
SEARCH articles tech FILTER priority != 0
SEARCH articles tech FILTER status <> archived
```

**Boolean 演算クエリと組み合わせ:**
```mygram
SEARCH threads (golang OR python) AND tutorial FILTER status = published
```

### フィルタカラムの型

`FILTER` で指定できる値の型は次のとおりです。

- **整数**: `status=1`, `priority=5`
- **文字列**: `category=tech`, `author=john`
- **日付/時刻**: クエリ時の `date`、`datetime`、`timestamp` の値は Unix エポック秒の整数です。たとえば `created_at >= 1704067200` は、2024-01-01 00:00:00 UTC 以降の値を選びます。`time` は符号付きの秒数で、`-90000` は -25時間を表します。

::: warning FILTER には設定が必要
`FILTER` で使えるのは、`config.yaml` の `filters` または `required_filters` に登録したカラムだけです。それ以外のカラムは拒否されます。
:::

`required_filters` は行をインデックス対象に含めるかを決める設定で、構文も別です。ISO 8601 や時刻文字列の値は、クエリの `FILTER` には使いません。同じカラムを両方に登録することもできます。`required_filters` は行のインデックス登録を決め、`FILTER` はリクエストごとに登録済みの行を絞り込みます。

### フィルタのパフォーマンス

- **ビットマップインデックス**: 低カーディナリティカラム（例: status, category）で非常に高速
- **フィルタリング順序**: フィルタはテキスト検索の積集合の後に適用されます

---

## ソート (SORT 句)

`SORT` 句を使用して検索結果をソートします。

### 構文

```mygram
SEARCH <table> <query> SORT [BY] <column> [ASC|DESC]
```

::: info SQL の ORDER BY ではありません
MygramDB では `ORDER BY` 構文は使えません。検索結果の並び替えには `SORT` を使ってください。
:::

`BY` は省略できます。`SORT BY created_at DESC` と `SORT created_at DESC` は同じです。

数値型のフィルタカラムは宣言された型の順序で並びます。`bigint_unsigned` は 2^63 を超える値も符号なし整数として正しく並べます。

### デフォルトの動作

`SORT` が指定されていない場合、結果は**主キーの降順**でソートされます（最新が最初）。

```mygram
SEARCH threads golang
-- 以下と同等: SEARCH threads golang SORT id DESC
```

### 主キーでソート

**完全な構文:**
```mygram
SEARCH threads golang SORT id ASC
SEARCH threads golang SORT id DESC
SEARCH threads golang SORT BY id DESC
```

**省略記法（推奨）:**
```mygram
SEARCH threads golang SORT ASC   -- 主キー昇順
SEARCH threads golang SORT DESC  -- 主キー降順
```

### フィルタカラムでソート

設定済みの任意のフィルタカラムでソートできます。

```mygram
SEARCH threads golang SORT created_at DESC LIMIT 10
SEARCH threads golang SORT BY created_at DESC LIMIT 10
SEARCH posts database SORT _score ASC LIMIT 20
```

### Boolean 演算クエリとの組み合わせ

```mygram
SEARCH threads (golang OR python) AND tutorial SORT created_at DESC LIMIT 10
SEARCH posts ((mysql OR postgresql) AND database) NOT sqlite SORT _score ASC
```

### パフォーマンスの考慮事項

**ソートアルゴリズム:**
- **小さい LIMIT あり**: `LIMIT + OFFSET` が結果件数の半分未満なら `partial_sort` を使います。計算量は O(N × log(K)) です（K = LIMIT + OFFSET）。
- **それ以外**: 完全ソートを使います。計算量は O(N × log(N)) です。`LIMIT` を省略した場合は `api.default_limit` を使います。実際に使うアルゴリズムは有効な LIMIT と OFFSET で決まります。
- **メモリ**: 対象件数によっては一時的なソートキー領域を確保するため、インプレース処理とは限りません。

**大規模な結果セット（例: 100万件中 80万件がヒット）の場合:**
- `LIMIT + OFFSET` を結果件数より十分小さくすると、partial_sort の対象になります
- 主キーでのソートも、一致した結果を比較します。本番に近いデータで、ソートするカラムごとの性能を測定してください
- 結果は OFFSET と LIMIT を適用する**前に**ソートされるため、ページネーションは正しく動作します。たとえば 80万件のマッチに `LIMIT 100` を指定すると、partial_sort の対象になります

### カラム検証

- **主キー**: 常に有効
- **フィルタカラム**: 設定済みである必要があります
- **存在しないカラム**: エラーとして拒否されます

---

## ページネーション (LIMIT/OFFSET)

`LIMIT` と `OFFSET` を使用して返される結果の数を制御します。

### LIMIT - 最大結果数

```mygram
SEARCH <table> <query> LIMIT <n>
```

例:
```mygram
SEARCH articles tech LIMIT 10
```

**デフォルト:** 100（config.yaml の `api.default_limit` で設定可能）
**範囲:** 1-1000。`api.default_limit` 自体は 5〜1000 の範囲でしか設定できませんが、クエリで `LIMIT` を明示する場合は 1 から 1000 まで指定できます。

MySQL 形式の `LIMIT <offset>,<count>` も使えます。ただし、`OFFSET` 句と併用するとエラーになります。

### OFFSET - 結果のスキップ

```mygram
SEARCH <table> <query> OFFSET <n>
```

例:
```mygram
SEARCH articles tech LIMIT 10 OFFSET 20
```

これは結果 21-30 を返します（最初の 20件をスキップ）。

### ページネーションの例

**ページ 1（最初の 10件）:**
```mygram
SEARCH articles tech LIMIT 10 OFFSET 0
```

**ページ 2（結果 11-20）:**
```mygram
SEARCH articles tech LIMIT 10 OFFSET 10
```

**ページ 3（結果 21-30）:**
```mygram
SEARCH articles tech LIMIT 10 OFFSET 20
```

### クエリ長の上限

MygramDB は、検索語・AND/NOT 条件・FILTER 値を合計したクエリ式が設定された長さを超えると `ERROR` を返します。

- **デフォルト:** 128文字
- **設定:** `api.max_query_length`（`0` で無効化）
- **エラー例:** `ERROR 3005 Query expression length (...) exceeds ...`

式を短く保つか、長い条件が必要な場合は `config.yaml` で上限を引き上げてください。

### 複数のオプションを組み合わせた例

```mygram
SEARCH threads (golang OR python) AND tutorial
  FILTER status = published
  SORT created_at DESC
  LIMIT 10
  OFFSET 20
```

このクエリは次の順に処理されます。
1. 「tutorial」**AND**（「golang」**OR**「python」）を含むドキュメントを検索
2. 公開されたドキュメントのみにフィルタリング
3. 作成日でソート（最新が最初）
4. 結果 21-30 を返す（ページ 3、1 ページあたり 10件）

### ページネーションの性能

- **OFFSET コスト**: O(N) ただし N = OFFSET（結果は生成されますが返されません）
- **推奨**: 一貫した順序でページを送るには、`SORT` と `LIMIT` を組み合わせる
- **深いページネーション**: 大きな OFFSET 値（例: 10000+）は遅くなる可能性があります

---

## BM25 関連度スコアリング (SORT _score)

BM25 ランキング関数を使用して、関連度順に結果をソートします。

::: info 用語補足
**BM25** は、検索語の出現回数、語の珍しさ、ドキュメントの長さを使って関連度を計算する代表的なランキング方式です。単純な ID 順ではなく「検索語により関連していそうなドキュメント」を上に出したい場合に使います。
:::

### 構文

```mygram
SEARCH <table> <query> SORT _score [ASC|DESC]
```

### 動作原理

BM25 は、次の 3つから各ドキュメントの関連度スコアを計算します。
- **TF（語句頻度）**: ドキュメント内での検索語句の出現回数
- **IDF（逆文書頻度）**: 全ドキュメント中での語句の希少性
- **ドキュメント長正規化**: マッチする語句を含む短いドキュメントがより高スコア

**パラメータ**（`config.yaml` の `bm25` セクションで変更可能）:
- `bm25.k1` — 語句頻度の飽和度（デフォルト `1.2`）
- `bm25.b` — ドキュメント長正規化（デフォルト `0.75`。0 = なし、1 = 完全）

### 例

```mygram
SEARCH articles "機械学習" SORT _score DESC LIMIT 10
SEARCH articles golang AND tutorial SORT _score LIMIT 20
```

### 前提条件

`SORT _score` には `bm25.enable: true` が必要です。`memory.verify_text` は N-gram の事後フィルタを制御する設定で、スコア計算に使う正規化済みテキストはこれとは別に保持されます。

| 設定 | 役割 | 未設定時のエラー |
|------|------|------------------|
| `bm25.enable: true` | 関連度スコアリングを有効化 | `SORT _score requires BM25 to be enabled in configuration` |

```yaml
bm25:
  enable: true
  k1: 1.2
  b: 0.75

memory:
  verify_text: "off"  # 事後フィルタの設定。スコア用テキストは保持されます
```

### フィルタとの組み合わせ

```mygram
SEARCH articles "データベース" SORT _score DESC FILTER category = tech LIMIT 10
```

---

## ハイライト (HIGHLIGHT)

検索語句をタグで囲んだテキストスニペットを返します。

::: tip 正規化済みテキストは保持されます
サーバーはクエリレベルの `HIGHLIGHT` 用に、`memory.verify_text: "off"` でも正規化済みテキストを保持します。`verify_text` は N-gram の事後フィルタを制御し、スニペット生成を無効にしません。
:::

### 構文

```mygram
SEARCH <table> <query> HIGHLIGHT [TAG <open> <close>] [SNIPPET_LEN <n>] [MAX_FRAGMENTS <n>]
```

### オプション

| オプション | デフォルト | 範囲 | 説明 |
|-----------|-----------|------|------|
| TAG | `<em>` / `</em>` | — | マッチした語句を囲むタグ |
| SNIPPET_LEN | 100 | 1–10,000 | スニペットフラグメントあたりの最大コードポイント数 |
| MAX_FRAGMENTS | 3 | 1–100 | 省略記号（...）で結合されるフラグメントの最大数 |

### 例

デフォルトのハイライト:
```mygram
SEARCH articles "機械学習" HIGHLIGHT LIMIT 10
```

カスタムタグ:
```mygram
SEARCH articles "golang" HIGHLIGHT TAG <strong> </strong> LIMIT 10
```

長いスニペットとより多くのフラグメント:
```mygram
SEARCH articles "データベース" HIGHLIGHT SNIPPET_LEN 200 MAX_FRAGMENTS 5 LIMIT 10
```

### 他の句との組み合わせ

```mygram
SEARCH articles "技術" HIGHLIGHT TAG <b> </b> SORT _score DESC FILTER status = 1 LIMIT 10
```

---

## あいまい検索 (FUZZY)

レーベンシュタイン編集距離（挿入、削除、置換）の範囲内にある語句にマッチします。

::: info 用語補足
**レーベンシュタイン編集距離**は、ある文字列を別の文字列に変えるために必要な挿入・削除・置換の回数です。`FUZZY 1` は 1文字の打ち間違い程度、`FUZZY 2` はもう少し広い候補を許容します。
:::

### 構文

```mygram
SEARCH <table> <query> FUZZY [distance]
```

### パラメータ

- **distance** (オプション): `1`（デフォルト）または `2`
  - `1`: 1回の編集操作以内でマッチ
  - `2`: 2回の編集操作以内でマッチ

### 例

```mygram
SEARCH articles "まちがい" FUZZY LIMIT 10
SEARCH articles "データベス" FUZZY 2 LIMIT 10
```

### パフォーマンス

あいまい検索は、不要な距離計算を避けるため、長さの差で事前に候補を絞り込みます。`FUZZY 1`（デフォルト）が最速です。

`FUZZY` は、同じクエリから `FUZZY` を外した検索結果をすべて含みます。N-gram サイズ未満の短い語や CJK/ASCII 混在語も含まれ、編集距離に一致する追加結果が加わることがあります。

`FUZZY` に指定できる距離は `1` または `2` だけです。それ以外の値はクエリエラーになります。

---

## エラーハンドリング

### 無効なクエリ

次のクエリはエラーを返します。構文エラーのコードは `3000` で、Boolean 式として解析できない式は `3010` になります。

| クエリ | レスポンス |
|--------|-----------|
| `SEARCH threads (golang AND python` | `ERROR 3000 Unclosed parenthesis` |
| `SEARCH threads golang AND python)` | `ERROR 3000 Unmatched closing parenthesis` |
| `SEARCH threads golang AND` | `ERROR 3000 AND requires a term` |
| `SEARCH threads golang NOT` | `ERROR 3000 NOT requires a term` |
| `SEARCH threads "golang tutorial` | `ERROR 3000 Unclosed quote: "` |

空の括弧や、グループ内で片側の項がない演算子は Boolean 式の解析で失敗し、`Expected term or opening parenthesis '('` などのメッセージが返ります。

### 無効なフィルタ

**存在しないテーブル:**
```mygram
SEARCH nonexistent tech
ERROR 4007 Table not found: nonexistent
```

**無効なフィルタカラム:**
```mygram
SEARCH articles tech FILTER bad!name=1
ERROR 3006 Invalid filter column
```

### 無効なソート

**存在しないカラム:**
```mygram
SEARCH articles tech SORT nonexistent DESC
ERROR 3007 Sort column 'nonexistent' not found. Column does not exist as filter column or primary key. Check column name spelling.
```

---

## パフォーマンスのヒント

各 `SEARCH` は決まったパイプラインで実行されます。クエリは AST に解析され、N-gram 参照で候補ドキュメントが得られ、AND・NOT・FILTER が順に候補集合を絞り込み、最後に SORT と LIMIT/OFFSET が結果ページを確定します。以下の各ヒントはこのパイプラインのどこか一段階に対応しており、DEBUG コマンドも同じ名前の段階ごとに所要時間を報告します。

<DocDiagram name="query-pipeline" alt="クエリはASTに解析され、N-gram参照で候補が得られ、AND積集合・NOT除外・FILTER適用の順に候補集合が絞り込まれます。SORTではLIMITとOFFSETの合計が結果件数の半分未満の場合だけ部分ソートを使い、最後にOFFSETとLIMITが適用されます。" />

### 1. 制約の強い検索語を先に配置 {#_1-制約の強い用語を先に配置}

```mygram
-- 良い: 具体的な検索語を先に
SEARCH articles "machine learning" AND tutorial

-- 最適ではない: 一般的な検索語を先に
SEARCH articles tutorial AND "machine learning"
```

### 2. 複雑な条件では括弧を使う

```mygram
-- 明示的で読みやすい
SEARCH threads (golang OR python) AND (web OR api)

-- 理解しにくい
SEARCH threads golang OR python AND web OR api
```

### 3. 先頭の NOT 演算子を避ける

```mygram
-- 良い: 肯定的な検索語を先に
SEARCH articles tech NOT old

-- 最適ではない: 先頭のNOT
SEARCH articles NOT old
```

先頭の NOT は除外前の候補が非常に広くなります。可能なら、先に肯定条件で候補を絞ってから `NOT` を使ってください。

### 4. フィルタとテキスト検索を組み合わせる

```mygram
-- 良い: フィルタで早期に結果を絞り込む
SEARCH articles tech FILTER category = ai FILTER status = 1

-- 動作するが効率は劣る
SEARCH articles tech AND ai AND published
```

インデックス化されたカラムのフィルタは、同じ条件を通常のテキスト検索語として扱うより高速です。

### 5. ソートするページの範囲を小さくする

マッチ件数の半分より `LIMIT + OFFSET` が小さい場合、サーバーは部分ソートを使います。`LIMIT` を省略すると `api.default_limit` が有効値になります。ページサイズが小さくても、OFFSET が大きいと完全ソートになることがあります。

```mygram
-- マッチ件数の半分より小さいページは部分ソートを使える
SEARCH articles tech SORT created_at DESC LIMIT 10

-- OFFSETが大きいと部分ソートを使えない場合がある
SEARCH articles tech SORT created_at DESC LIMIT 10 OFFSET 10000
```

### 6. 深いページネーションを避ける

```mygram
-- 効率的
SEARCH articles tech LIMIT 10 OFFSET 0

-- 効率が劣る（大きなOFFSET）
SEARCH articles tech LIMIT 10 OFFSET 10000
```

深い結果にはカーソルベースのページネーションなどの代替戦略を検討してください。

### 7. Boolean 検索のキャッシュキーを保持する

Boolean 検索のキャッシュキーは、解析後のトークン、引用符、括弧の構造を保持します。全角空白、括弧、引用の違いによって別の式になるクエリは別のキャッシュエントリを使い、同じように解析される Unicode 空白は共有されることがあります。

---

## COUNT コマンド

Boolean 演算クエリの構文はすべて `COUNT` でも使えます。

```mygram
COUNT <table> <query_expression> [FILTER ...]
```

例:
```mygram
COUNT threads (golang OR python) AND tutorial
COUNT articles tech FILTER status = 1 FILTER category = ai
COUNT posts database AND (mysql OR postgresql) NOT sqlite
```

**注意:** COUNT は SORT、LIMIT、OFFSET をサポートしません（カウントには不要）。

---

## 実装の詳細

### 文法（BNF）

クエリは次の文法で抽象構文木（AST）に解析されます。この文法が、上で説明した優先順位を表しています。

```text
query     → or_expr
or_expr   → and_expr (OR and_expr)*
and_expr  → not_expr (AND not_expr)*
not_expr  → NOT not_expr | primary
primary   → TERM | '(' or_expr ')'
```

### パフォーマンス特性

- **AND 演算**: ソート済みポスティングリストを使用した効率的な積集合
- **OR 演算**: 集合演算を使用した効率的な和集合
- **NOT 演算**: すべてのドキュメントに対する補集合（潜在的に高コスト）
- **括弧**: パフォーマンスのオーバーヘッドなし。解析にのみ影響します

### N-gram トークン化

MygramDB は、インデックス作成と検索に N-gram トークン化を使用します。

- **デフォルト N-gram サイズ**: 2（バイグラム） - テーブルごとに設定可能
- **CJK 漢字**: 漢字に対して個別の N-gram サイズを設定できます。かななど他の文字種には `ngram_size` を使います。
- **Unicode 正規化**: NFKC 正規化、幅変換、オプションの小文字化

設定した N-gram サイズより短い検索語は、`NOT` の語句を含め、部分文字列検索のために保存済みの正規化済みテキストを使います。通常のサーバー初期化では `memory.verify_text` とは別にこのテキストが保持されます。フォールバックに必要な正規化済みテキストがない場合、短い `NOT` の語句を無視したり不完全な結果を返したりせず、`ERROR 4000` になります。

---

## スナップショット同期コマンド

### SYNC コマンド

MySQL から MygramDB へのスナップショット同期を手動で開始します。

**構文:**
```mygram
SYNC <table_name>
```

**例:**
```mygram
SYNC articles
```

**レスポンス:**
```mygram
OK SYNC STARTED table=articles
```

詳しい使い方は [SYNC コマンドガイド](/ja/docs/sync-command) を参照してください。

### SYNC STATUS コマンド

`SYNC` 操作の進捗と状態を確認します。

**構文:**
```mygram
SYNC STATUS
```

**レスポンス例:**
```mygram
OK SYNC_STATUS
table=articles status=IN_PROGRESS progress=10000/25000 rows (40.0%) rate=5000 rows/s
```

```mygram
OK SYNC_STATUS
table=articles status=COMPLETED rows=25000 time=5.2s gtid=uuid:123 replication=STARTED
```

同期を一度も実行していない場合は、次のように返ります。

```mygram
OK SYNC_STATUS
status=IDLE message="No sync operation performed"
```

各フィールドの詳しい説明は [SYNC コマンドガイド](/ja/docs/sync-command) を参照してください。

---

## 関連情報

- [クエリガイド](/ja/docs/queries) - 実践的な検索例
- [SYNC コマンドガイド](/ja/docs/sync-command) - 手動スナップショット同期
- [プロトコルリファレンス](/ja/docs/protocol) - すべてのコマンドとプロトコルの詳細
- [設定ガイド](/ja/docs/configuration) - フィルタ、N-gram サイズ、制限の設定
- [パフォーマンスチューニング](/ja/docs/performance) - 高度な最適化手法
