---
title: MygramDB クエリ構文リファレンス - ブール検索文法
description: MygramDBのクエリ構文完全リファレンス。ブール演算 AND/OR/NOT、括弧、フレーズ検索、FILTER条件、SORT、LIMIT/OFFSET、BM25 _score、HIGHLIGHT、FUZZY、エラーハンドリング。
head:
  - - meta
    - name: keywords
      content: MygramDB クエリ構文, ブール検索, AND OR NOT, FILTER, SORT, BM25 スコアリング, HIGHLIGHT, あいまい検索, n-gram トークン化
---

# クエリ構文ガイド

MygramDBは、全文検索に必要なブール演算、フィルタ、ソート、ページネーションを小さな検索構文として提供します。

::: info SQLではありません
MygramDBのクエリはSQLではなく、検索用の小さなコマンド言語です。`SEARCH articles mysql FILTER status = 1 LIMIT 10` のように、検索語と検索オプションだけを記述します。
:::

## 目次

- [基本構文](#基本構文)
- [ブール演算子](#ブール演算子)
- [複雑なブール演算クエリ](#複雑なブール演算クエリ)
- [演算子の優先順位](#演算子の優先順位)
- [引用符によるフレーズ検索](#引用符によるフレーズ検索)
- [フィルタ条件](#フィルタ条件)
- [ソート (SORT句)](#ソート-sort句)
- [ページネーション (LIMIT/OFFSET)](#ページネーション-limitoffset)
- [BM25 関連度スコアリング (SORT _score)](#bm25-関連度スコアリング-sort-_score)
- [ハイライト (HIGHLIGHT)](#ハイライト-highlight)
- [あいまい検索 (FUZZY)](#あいまい検索-fuzzy)
- [エラーハンドリング](#エラーハンドリング)
- [パフォーマンスのヒント](#パフォーマンスのヒント)

---

## 基本構文

### コマンドフォーマット

```mygram
SEARCH <table> <query_expression> [FILTER ...] [SORT ...] [LIMIT ...] [OFFSET ...]
COUNT <table> <query_expression> [FILTER ...]
```

::: info テーブル名の指定
`<table>` は DB 修飾形式 `` `database.table` ``（例: `app_db.articles`）を受け付けます。単一データベース構成（設定されている個別のデータベースが1つだけ）の場合は、`articles` のような修飾なしのテーブル名も動作します。2つ以上のデータベースにまたがる構成の場合にのみ修飾が必要となり、修飾なしの名前は曖昧として拒否されます。
:::

### シンプルな検索

```mygram
SEARCH <table> <term>
```

例：
```mygram
SEARCH threads golang
```

区切り文字以外の句読点は語句に含められます。たとえば `c++`、`e-mail`、`v1.9.0` はそれぞれ1つの語として解析されます。

### レスポンスフォーマット

**SEARCHレスポンス:**
```mygram
OK RESULTS <total_count> <id1> <id2> <id3> ...
```

`total_count` は `LIMIT` と `OFFSET` を適用する前のマッチ総数で、同じ行のIDは現在のページです。サーバーは総数とページを1回のインデックス読み取りから求めるため、同じ結果集合を示します。

例：
```mygram
OK RESULTS 3 101 205 387
```

**COUNTレスポンス:**
```mygram
OK COUNT <number>
```

例：
```mygram
OK COUNT 42
```

---

## ブール演算子

### AND検索

**すべて**の指定された用語を含むドキュメントを検索します。

```mygram
SEARCH <table> term1 AND term2 AND term3
```

例：
```mygram
SEARCH threads golang AND tutorial
```

::: tip 空白区切りとの違い
単純な `golang tutorial` も実質的には「両方を含む」検索として扱われます。複雑な条件を書く場合は、読みやすさのために `AND` を明示すると安全です。
:::

### OR検索

指定された用語の**いずれか**を含むドキュメントを検索します。

```mygram
SEARCH <table> term1 OR term2 OR term3
```

例：
```mygram
SEARCH threads golang OR python OR rust
```

### NOT検索

特定の用語を含むドキュメントを除外します。

```mygram
SEARCH <table> term1 NOT term2
```

例：
```mygram
SEARCH threads tutorial NOT beginner
```

::: warning NOTの使い方
`NOT` は結果セットからドキュメントを除外します。先頭に `NOT` を置くクエリは候補が広くなりやすいため、大規模インデックスではできるだけ肯定条件と組み合わせてください。
:::

`AND NOT` も同じ除外条件として受け付けます。追加条件をすべて `AND` の後に出力する式変換器でも使えます。

```mygram
SEARCH threads tutorial AND NOT beginner
```

---

## 複雑なブール演算クエリ

### 優先順位を制御する括弧

括弧を使用して式をグループ化し、演算子の優先順位を制御できます：

```mygram
SEARCH <table> (term1 OR term2) AND term3
```

例：
```mygram
SEARCH threads (golang OR python) AND tutorial
```

これは「tutorial」**AND**（「golang」**OR**「python」）を含むドキュメントを検索します。

### ネストした式

複数レベルの括弧をネストできます：

```mygram
SEARCH <table> ((term1 OR term2) AND term3) OR term4
```

例：
```mygram
SEARCH threads ((golang OR python) AND web) OR rust
```

これは以下を検索します：
- 「web」**AND**（「golang」**OR**「python」）を含むドキュメント
- **または**「rust」を含むドキュメント

### 複雑なクエリの例

#### GoまたはPythonのチュートリアルを検索し、初心者向けコンテンツを除外

```mygram
SEARCH threads (golang OR python) AND tutorial NOT beginner
```

#### MySQLまたはPostgreSQLに関するデータベースコンテンツを検索し、SQLiteを除外

```mygram
SEARCH posts database AND (mysql OR postgresql) NOT sqlite
```

#### PythonまたはRで機械学習コンテンツを検索し、TensorFlowを除外

```mygram
SEARCH articles "machine learning" AND (python OR R) NOT tensorflow
```

---

## 演算子の優先順位

括弧が使用されていない場合、演算子は以下の優先順位を持ちます（高い順）：

1. **NOT** （最高）
2. **AND** （中）
3. **OR** （最低）

### 優先順位の例

**クエリ:** `a OR b AND c`
**解釈:** `a OR (b AND c)`

**クエリ:** `NOT a AND b`
**解釈:** `(NOT a) AND b`

**クエリ:** `a AND b OR c AND d`
**解釈:** `(a AND b) OR (c AND d)`

::: tip 括弧で意図を固定
厳密には不要な場合でも、複雑な条件では括弧を使うと読み間違いを防げます。
:::

---

## 引用符によるフレーズ検索

語句の並びを保ったフレーズ検索には、ダブルクォーテーション `"` またはシングルクォーテーション `'` を使います。

```mygram
SEARCH <table> "exact phrase"
SEARCH <table> 'machine learning'
```

### エスケープシーケンス

引用符で囲まれた文字列内では、次のエスケープシーケンスを使えます。

- `\n` - 改行
- `\t` - タブ
- `\r` - キャリッジリターン
- `\\` - バックスラッシュ
- `\"` - ダブルクォーテーション
- `\'` - シングルクォーテーション

例：
```mygram
SEARCH articles "hello \"world\""
```

### 引用符とブール演算子の組み合わせ

引用符で囲まれたフレーズはブール演算子と組み合わせることができます：

```mygram
SEARCH threads "web framework" AND (golang OR python)
SEARCH posts "machine learning" NOT "deep learning"
SEARCH articles required AND 'not'
```

引用した句のキーワードはリテラルとして扱われます。最後のクエリは `not` という語を必須にし、引用によって `NOT` 句にはなりません。

---

## フィルタ条件

`FILTER`句を使用して、カラム値で結果をフィルタリングします。

### 構文

```mygram
SEARCH <table> <query> FILTER <column> <operator> <value> [FILTER <col> <op> <val> ...]
```

複数のフィルタを指定できます（すべて一致する必要があります - AND論理）。

### サポートされる演算子

- `=` または `EQ` - 等しい
- `!=`、`<>`、または `NE` - 等しくない
- `>` または `GT` - より大きい
- `>=` または `GTE` - 以上
- `<` または `LT` - より小さい
- `<=` または `LTE` - 以下

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

**ブール演算クエリと組み合わせ:**
```mygram
SEARCH threads (golang OR python) AND tutorial FILTER status = published
```

### フィルタカラムの型

MygramDBでは、設定ファイルの `filters` または `required_filters` に登録したカラムを `FILTER` で絞り込めます。

- **整数**: `status=1`, `priority=5`
- **文字列**: `category=tech`, `author=john`
- **日付/時刻**: クエリの `date`、`datetime`、`timestamp` には整数の Unix エポック秒（例: `created_at=1704067200`）、`time` には符号付きの時間差を秒で指定し、負値や24時間を超える値も使えます

::: warning FILTERには設定が必要
`config.yaml` で `filters` と `required_filters` のどちらにも登録していないカラムは `FILTER` で使えません。同じカラムを両方に登録できます。`required_filters` は行のインデックス登録を決め、`FILTER` はリクエストごとに登録済みの行を絞り込みます。
:::

`required_filters` は行をインデックス対象に含めるかを決める設定で、構文も別です。ISO 8601 や時刻文字列の値は、クエリの `FILTER` には使いません。

### フィルタのパフォーマンス

- **ビットマップインデックス**: 低カーディナリティカラム（例：status, category）で非常に高速
- **フィルタリング順序**: フィルタはテキスト検索の積集合の後に適用されます

---

## ソート (SORT句)

`SORT`句を使用して検索結果をソートします。

### 構文

```mygram
SEARCH <table> <query> SORT [BY] <column> [ASC|DESC]
```

::: info SQLのORDER BYではありません
MygramDBでは `ORDER BY` 構文は使えません。検索結果の並び替えには `SORT` を使ってください。
:::

`BY` は省略できます。`SORT BY created_at DESC` と `SORT created_at DESC` は同じです。

数値型のフィルタカラムは宣言された型の順序で並びます。`bigint_unsigned` は 2^63 を超える値も符号なし整数として正しく並べます。

### デフォルトの動作

`SORT`が指定されていない場合、結果は**プライマリキーの降順**でソートされます（最新が最初）。

```mygram
SEARCH threads golang
-- 以下と同等: SEARCH threads golang SORT id DESC
```

### プライマリキーでソート

**完全な構文:**
```mygram
SEARCH threads golang SORT id ASC
SEARCH threads golang SORT id DESC
SEARCH threads golang SORT BY id DESC
```

**省略記法（推奨）:**
```mygram
SEARCH threads golang SORT ASC   -- プライマリキー昇順
SEARCH threads golang SORT DESC  -- プライマリキー降順
```

### フィルタカラムでソート

インデックス化された任意のフィルタカラムでソート：

```mygram
SEARCH threads golang SORT created_at DESC LIMIT 10
SEARCH threads golang SORT BY created_at DESC LIMIT 10
SEARCH posts database SORT _score ASC LIMIT 20
```

### ブール演算クエリとの組み合わせ

```mygram
SEARCH threads (golang OR python) AND tutorial SORT created_at DESC LIMIT 10
SEARCH posts ((mysql OR postgresql) AND database) NOT sqlite SORT _score ASC
```

### パフォーマンスの考慮事項

**ソートアルゴリズム:**
- **小さいLIMITあり**: `LIMIT + OFFSET` が結果件数の半分未満なら `partial_sort` を使います。計算量は O(N × log(K)) です（K = LIMIT + OFFSET）。
- **それ以外**: 完全ソートを使います。計算量は O(N × log(N)) です。
- **メモリ**: 対象件数によっては一時的なソートキー領域を確保するため、インプレース処理とは限りません。

**大規模な結果セット（例：100万件中80万件がヒット）の場合:**
- `LIMIT + OFFSET` を結果件数より十分小さくすると、partial_sortの対象になります
- プライマリキーでのソートも一致した結果を比較します。本番に近いデータで列ごとの性能を測定してください
- 結果はOFFSET/LIMIT適用**前に**ソートされます（正しいページネーション）

**パフォーマンス例:**
- 80万件の結果でLIMIT 100の場合はpartial_sortの対象になります
- 大きな結果セットでは一時的なソートキー領域が必要になることがあります

### カラム検証

- **プライマリキー**: 常に有効
- **フィルタカラム**: 設定済みである必要があります
- **存在しないカラム**: エラーとして拒否されます

---

## ページネーション (LIMIT/OFFSET)

`LIMIT`と`OFFSET`を使用して返される結果の数を制御します。

### LIMIT - 最大結果数

```mygram
SEARCH <table> <query> LIMIT <n>
```

例：
```mygram
SEARCH articles tech LIMIT 10
```

**デフォルト:** 100（config.yamlの`api.default_limit`で設定可能）
**範囲:** 1-1000。`api.default_limit` 自体は5〜1000の範囲でしか設定できませんが、クエリで `LIMIT` を明示する場合は1から1000まで指定できます。

MySQL形式の `LIMIT <offset>,<count>` も使えます。ただし、`OFFSET` 句と併用するとエラーになります。

### OFFSET - 結果のスキップ

```mygram
SEARCH <table> <query> OFFSET <n>
```

例：
```mygram
SEARCH articles tech LIMIT 10 OFFSET 20
```

これは結果21-30を返します（最初の20件をスキップ）。

### ページネーションの例

**ページ1（最初の10件）:**
```mygram
SEARCH articles tech LIMIT 10 OFFSET 0
```

**ページ2（結果11-20）:**
```mygram
SEARCH articles tech LIMIT 10 OFFSET 10
```

**ページ3（結果21-30）:**
```mygram
SEARCH articles tech LIMIT 10 OFFSET 20
```

### クエリ長の上限

MygramDB は、検索語・AND/NOT 条件・FILTER 値を合計したクエリ式が設定された長さを超えると `ERROR` を返します。

- **デフォルト:** 128文字
- **設定:** `api.max_query_length`（`0` で無効化）
- **エラー例:** `ERROR 3005 Query expression length (...) exceeds ...`

複雑な条件が必要な場合は、`config.yaml` で上限を調整するか、複数のクエリに分割してください。

### 複数のオプションを組み合わせた例

```mygram
SEARCH threads (golang OR python) AND tutorial
  FILTER status = published
  SORT created_at DESC
  LIMIT 10
  OFFSET 20
```

このクエリは：
1. 「tutorial」**AND**（「golang」**OR**「python」）を含むドキュメントを検索
2. 公開されたドキュメントのみにフィルタリング
3. 作成日でソート（最新が最初）
4. 結果21-30を返す（ページ3、1ページ10件）

### ページネーションの性能

- **LIMIT最適化**: `LIMIT + OFFSET` が結果件数の半分未満の場合だけpartial_sortを使う
- **OFFSETコスト**: O(N) ただし N = OFFSET（結果は生成されますが返されません）
- **ページネーション**: 一貫性のある順序が必要な場合は、`SORT` と `LIMIT` を組み合わせる
- **深いページネーション**: 大きなOFFSET値（例：10000+）は遅くなる可能性があります

---

## BM25 関連度スコアリング (SORT _score)

BM25ランキング関数を使用して、関連度順に結果をソートします。

::: info 用語補足
**BM25** は、検索語の出現回数、語の珍しさ、文書の長さを使って関連度を計算する代表的なランキング方式です。単純なID順ではなく「検索語により関連していそうな文書」を上に出したい場合に使います。
:::

### 構文

```mygram
SEARCH <table> <query> SORT _score [ASC|DESC]
```

### 動作原理

BM25は以下に基づいて各ドキュメントの関連度スコアを計算します：
- **TF（語句頻度）**: ドキュメント内での検索語句の出現回数
- **IDF（逆文書頻度）**: 全ドキュメント中での語句の希少性
- **ドキュメント長正規化**: マッチする語句を含む短いドキュメントがより高スコア

**パラメータ**（`config.yaml` の `bm25` セクションで変更可能）：
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

デフォルトのハイライト：
```mygram
SEARCH articles "機械学習" HIGHLIGHT LIMIT 10
```

カスタムタグ：
```mygram
SEARCH articles "golang" HIGHLIGHT TAG <strong> </strong> LIMIT 10
```

長いスニペットとより多くのフラグメント：
```mygram
SEARCH articles "データベース" HIGHLIGHT SNIPPET_LEN 200 MAX_FRAGMENTS 5 LIMIT 10
```

### 前提条件

ハイライトを使うために、`memory.verify_text` を `"ascii"` または `"all"` に設定する必要はありません。通常のサーバー初期化でスニペットに必要なテキストが保持されます。

### 他の句との組み合わせ

```mygram
SEARCH articles "技術" HIGHLIGHT TAG <b> </b> SORT _score DESC FILTER status = 1 LIMIT 10
```

---

## あいまい検索 (FUZZY)

レーベンシュタイン編集距離（挿入、削除、置換）内の語句をマッチします。

::: info 用語補足
**レーベンシュタイン編集距離**は、ある文字列を別の文字列に変えるために必要な挿入・削除・置換の回数です。`FUZZY 1` は1文字の打ち間違い程度、`FUZZY 2` はもう少し広い候補を許容します。
:::

### 構文

```mygram
SEARCH <table> <query> FUZZY [distance]
```

### パラメータ

- **distance** (オプション): `1`（デフォルト）または `2`
  - `1`: 1回の編集操作内のマッチ
  - `2`: 2回の編集操作内のマッチ

### 例

```mygram
SEARCH articles "まちがい" FUZZY LIMIT 10
SEARCH articles "データベス" FUZZY 2 LIMIT 10
```

### パフォーマンス

あいまい検索は、不要な距離計算を避けるため、長さの差で事前に候補を絞り込みます。`FUZZY` は同じクエリから `FUZZY` を外した検索結果をすべて含み、N-gramサイズ未満の短い語やCJK/ASCII混在語も保持します。編集距離に一致する追加結果が加わることがあります。性能を優先する場合は `FUZZY 1`（デフォルト）を使ってください。

`FUZZY` に指定できる距離は `1` または `2` だけです。それ以外の値は明示的なクエリエラーになります。

---

## エラーハンドリング

### 無効なクエリ

以下のクエリはエラーを返します：

**空の括弧:**
```mygram
SEARCH threads ()
ERROR 3000 Invalid query: empty expression in parentheses
```

**閉じられていない括弧:**
```mygram
SEARCH threads (golang AND python
ERROR 3000 Invalid query: unclosed parentheses
```

**余分な閉じ括弧:**
```mygram
SEARCH threads golang AND python)
ERROR 3000 Invalid query: unexpected closing parenthesis
```

**オペランドのない演算子:**
```mygram
SEARCH threads AND
ERROR 3000 Invalid query: operator without operands
```

**末尾の演算子:**
```mygram
SEARCH threads golang AND
ERROR 3000 Invalid query: trailing operator
```

**閉じられていない引用符:**
```mygram
SEARCH threads "golang tutorial
ERROR 3000 Invalid query: unclosed quote
```

### 無効なフィルタ

**存在しないテーブル:**
```mygram
SEARCH nonexistent tech
ERROR 4007 Table not found: nonexistent
```

**無効なフィルタカラム:**
```mygram
SEARCH articles tech FILTER invalid_column=1
ERROR 3006 Filter column not found: invalid_column
```

### 無効なソート

**存在しないカラム:**
```mygram
SEARCH articles tech SORT nonexistent DESC
ERROR 3007 Sort column 'nonexistent' not found. Column does not exist as filter column or primary key. Check column name spelling.
```

存在しないカラムはエラーとして拒否されます。

---

## パフォーマンスのヒント

各`SEARCH`は決まったパイプラインで実行されます。クエリはASTに解析され、N-gram参照で候補ドキュメントが得られ、AND・NOT・FILTERが順に候補集合を絞り込み、最後にSORTとLIMIT/OFFSETが結果ページを確定します。以下の各ヒントはこのパイプラインのどこか一段階に対応しており、DEBUGコマンドも同じ名前の段階ごとに所要時間を報告します。

<DocDiagram name="query-pipeline" alt="クエリはASTに解析され、N-gram参照で候補が得られ、AND積集合・NOT除外・FILTER適用の順に候補集合が絞り込まれます。SORTではLIMITとOFFSETの合計が結果件数の半分未満の場合だけ部分ソートを使い、最後にOFFSETとLIMITが適用されます。" />

### 1. 制約の強い用語を先に配置

```mygram
-- 良い: 具体的な用語を先に
SEARCH articles "machine learning" AND tutorial

-- 最適ではない: 一般的な用語を先に
SEARCH articles tutorial AND "machine learning"
```

### 2. 複雑な条件では括弧を使う

```mygram
-- 明示的で読みやすい
SEARCH threads (golang OR python) AND (web OR api)

-- 理解しにくい
SEARCH threads golang OR python AND web OR api
```

### 3. 先頭のNOT演算子を避ける

```mygram
-- 良い: 肯定的な用語を先に
SEARCH articles tech NOT old

-- 最適ではない: 先頭のNOT
SEARCH articles NOT old
```

先頭のNOTは除外前の候補が非常に広くなります。可能なら、先に肯定条件で候補を絞ってから `NOT` を使ってください。

### 4. フィルタとテキスト検索を組み合わせる

```mygram
-- 良い: フィルタで早期に結果を絞り込む
SEARCH articles tech FILTER category = ai FILTER status = 1

-- 動作するが効率は劣る
SEARCH articles tech AND ai AND published
```

インデックス化されたカラムのフィルタは、同じ条件を通常のテキスト検索語として扱うより高速です。

### 5. 大規模結果セットにはLIMITを付ける

```mygram
-- 良い: LIMITが結果件数に対して十分小さい場合はpartial_sortを使える
SEARCH articles tech SORT created_at DESC LIMIT 10

-- 遅い: すべての結果の完全ソート
SEARCH articles tech SORT created_at DESC
```

### 6. 深いページネーションを避ける

```mygram
-- 効率的
SEARCH articles tech LIMIT 10 OFFSET 0

-- 効率が劣る（大きなOFFSET）
SEARCH articles tech LIMIT 10 OFFSET 10000
```

深い結果にはカーソルベースのページネーションなどの代替戦略を検討してください。

### 7. ブール検索のキャッシュキーを保持する

ブール検索のキャッシュキーは、解析後のトークン、引用符、括弧の構造を保持します。全角空白、括弧、引用の違いによって別の式になるクエリは別のキャッシュエントリを使い、同じように解析される Unicode 空白は共有されることがあります。

---

## COUNTコマンド

すべてのブール演算クエリ構文は`COUNT`でも使用できます：

```mygram
COUNT <table> <query_expression> [FILTER ...]
```

例：
```mygram
COUNT threads (golang OR python) AND tutorial
COUNT articles tech FILTER status = 1 FILTER category = ai
COUNT posts database AND (mysql OR postgresql) NOT sqlite
```

**注意:** COUNTはSORT、LIMIT、OFFSETをサポートしません（カウントには不要）。

---

## 実装の詳細

### 文法（BNF）

クエリは適切な演算子優先順位を持つ抽象構文木（AST）に解析されます：

```bnf
query     → or_expr
or_expr   → and_expr (OR and_expr)*
and_expr  → not_expr (AND not_expr)*
not_expr  → NOT not_expr | primary
primary   → TERM | '(' or_expr ')'
```

### パフォーマンス特性

- **AND演算**: ソート済みポスティングリストを使用した効率的な積集合
- **OR演算**: 集合演算を使用した効率的な和集合
- **NOT演算**: すべてのドキュメントに対する補集合（潜在的に高コスト）
- **括弧**: パフォーマンスのオーバーヘッドなし。解析にのみ影響します

### N-gramトークン化

MygramDBはインデックス作成と検索にN-gramトークン化を使用します：

- **デフォルトN-gramサイズ**: 2（バイグラム） - テーブルごとに設定可能
- **CJKテキスト**: 漢字/かなに対して別のN-gramサイズ（設定可能）
- **Unicode正規化**: NFKC正規化、幅変換、オプションの小文字化

設定したN-gramサイズより短い検索語は、部分文字列検索のために保存済みの正規化済みテキストを使います。通常のサーバー初期化では `memory.verify_text` とは別にこのテキストが保持されます。明示的にテキスト保持を無効にした構成では、不完全な結果を返さず明示的なクエリエラーになります。

---

## スナップショット同期コマンド

### SYNCコマンド

MySQLからMygramDBへのスナップショット同期を手動で開始します。

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

詳しい使い方は [SYNCコマンドガイド](/ja/docs/sync-command) を参照してください。

### SYNC STATUSコマンド

`SYNC` 操作の進捗と状態を確認します。

**構文:**
```mygram
SYNC STATUS
```

**レスポンス例:**
```mygram
table=articles status=IN_PROGRESS progress=10000/25000 rows (40.0%) rate=5000 rows/s
table=articles status=COMPLETED rows=25000 time=5.2s gtid=uuid:123 replication=STARTED
status=IDLE message="No sync operation performed"
```

各フィールドの詳しい説明は [SYNCコマンドガイド](/ja/docs/sync-command) を参照してください。

---

## 関連情報

- [クエリガイド](/ja/docs/queries) - 実践的な検索例
- [SYNCコマンドガイド](/ja/docs/sync-command) - 手動スナップショット同期
- [プロトコルリファレンス](/ja/docs/protocol) - すべてのコマンドとプロトコルの詳細
- [設定ガイド](/ja/docs/configuration) - フィルタ、N-gramサイズ、制限の設定
- [パフォーマンスチューニング](/ja/docs/performance) - 高度な最適化手法
