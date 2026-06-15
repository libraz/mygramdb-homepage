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

```
SEARCH <table> <query_expression> [FILTER ...] [SORT ...] [LIMIT ...] [OFFSET ...]
COUNT <table> <query_expression> [FILTER ...]
```

::: info テーブル名の指定
`<table>` は DB 修飾形式 `` `database.table` ``（例: `app_db.articles`）を受け付けます。単一データベース構成（設定されている個別のデータベースが1つだけ）の場合は、`articles` のような修飾なしのテーブル名も動作します。2つ以上のデータベースにまたがる構成の場合にのみ修飾が必要となり、修飾なしの名前は曖昧として拒否されます。
:::

### シンプルな検索

```
SEARCH <table> <term>
```

例：
```
SEARCH threads golang
```

### レスポンスフォーマット

**SEARCHレスポンス:**
```
OK RESULTS <total_count> <id1> <id2> <id3> ...
```

例：
```
OK RESULTS 3 101 205 387
```

**COUNTレスポンス:**
```
OK COUNT <number>
```

例：
```
OK COUNT 42
```

---

## ブール演算子

### AND検索

**すべて**の指定された用語を含むドキュメントを検索します。

```
SEARCH <table> term1 AND term2 AND term3
```

例：
```
SEARCH threads golang AND tutorial
```

::: tip 空白区切りとの違い
単純な `golang tutorial` も実質的には「両方を含む」検索として扱われます。複雑な条件を書く場合は、読みやすさのために `AND` を明示すると安全です。
:::

### OR検索

指定された用語の**いずれか**を含むドキュメントを検索します。

```
SEARCH <table> term1 OR term2 OR term3
```

例：
```
SEARCH threads golang OR python OR rust
```

### NOT検索

特定の用語を含むドキュメントを除外します。

```
SEARCH <table> term1 NOT term2
```

例：
```
SEARCH threads tutorial NOT beginner
```

::: warning NOTの使い方
`NOT` は結果セットからドキュメントを除外します。先頭に `NOT` を置くクエリは候補が広くなりやすいため、大規模インデックスではできるだけ肯定条件と組み合わせてください。
:::

---

## 複雑なブール演算クエリ

### 優先順位を制御する括弧

括弧を使用して式をグループ化し、演算子の優先順位を制御できます：

```
SEARCH <table> (term1 OR term2) AND term3
```

例：
```
SEARCH threads (golang OR python) AND tutorial
```

これは「tutorial」**AND**（「golang」**OR**「python」）を含むドキュメントを検索します。

### ネストした式

複数レベルの括弧をネストできます：

```
SEARCH <table> ((term1 OR term2) AND term3) OR term4
```

例：
```
SEARCH threads ((golang OR python) AND web) OR rust
```

これは以下を検索します：
- 「web」**AND**（「golang」**OR**「python」）を含むドキュメント
- **または**「rust」を含むドキュメント

### 複雑なクエリの例

#### GoまたはPythonのチュートリアルを検索し、初心者向けコンテンツを除外

```
SEARCH threads (golang OR python) AND tutorial NOT beginner
```

#### MySQLまたはPostgreSQLに関するデータベースコンテンツを検索し、SQLiteを除外

```
SEARCH posts database AND (mysql OR postgresql) NOT sqlite
```

#### PythonまたはRで機械学習コンテンツを検索し、TensorFlowを除外

```
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

```
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
```
SEARCH articles "hello \"world\""
```

### 引用符とブール演算子の組み合わせ

引用符で囲まれたフレーズはブール演算子と組み合わせることができます：

```
SEARCH threads "web framework" AND (golang OR python)
SEARCH posts "machine learning" NOT "deep learning"
```

---

## フィルタ条件

`FILTER`句を使用して、カラム値で結果をフィルタリングします。

### 構文

```
SEARCH <table> <query> FILTER <column> <operator> <value> [FILTER <col> <op> <val> ...]
```

複数のフィルタを指定できます（すべて一致する必要があります - AND論理）。

### サポートされる演算子

- `=` または `EQ` - 等しい
- `!=` または `NE` - 等しくない
- `>` または `GT` - より大きい
- `>=` または `GTE` - 以上
- `<` または `LT` - より小さい
- `<=` または `LTE` - 以下

### 例

**単一フィルタ:**
```
SEARCH articles tech FILTER status = 1
```

**複数フィルタ:**
```
SEARCH articles tech FILTER status = 1 FILTER category = ai
```

**比較演算子:**
```
SEARCH articles tech FILTER views > 1000
SEARCH articles tech FILTER created_at >= 2024-01-01
SEARCH articles tech FILTER priority != 0
```

**ブール演算クエリと組み合わせ:**
```
SEARCH threads (golang OR python) AND tutorial FILTER status = published
```

### フィルタカラムの型

MygramDBでは、設定ファイルで `filters` に登録したカラムだけを `FILTER` で絞り込めます。

- **整数**: `status=1`, `priority=5`
- **文字列**: `category=tech`, `author=john`
- **日付/時刻**: `created_at=2024-01-15T10:30:00`

::: warning FILTERには設定が必要
`config.yaml` で `filters` に登録していないカラムは `FILTER` で使えません。行をインデックス対象に含めるかどうかを決める `required_filters` とは別の設定です。
:::

### フィルタのパフォーマンス

- **ビットマップインデックス**: 低カーディナリティカラム（例：status, category）で非常に高速
- **辞書圧縮**: 文字列カラムで効率的
- **フィルタリング順序**: フィルタはテキスト検索の積集合の後に適用されます

---

## ソート (SORT句)

`SORT`句を使用して検索結果をソートします。

### 構文

```
SEARCH <table> <query> SORT <column> [ASC|DESC]
```

::: info SQLのORDER BYではありません
MygramDBでは `ORDER BY` 構文は使えません。検索結果の並び替えには `SORT` を使ってください。
:::

### デフォルトの動作

`SORT`が指定されていない場合、結果は**プライマリキーの降順**でソートされます（最新が最初）。

```
SEARCH threads golang
-- 以下と同等: SEARCH threads golang SORT id DESC
```

### プライマリキーでソート

**完全な構文:**
```
SEARCH threads golang SORT id ASC
SEARCH threads golang SORT id DESC
```

**省略記法（推奨）:**
```
SEARCH threads golang SORT ASC   -- プライマリキー昇順
SEARCH threads golang SORT DESC  -- プライマリキー降順
```

### フィルタカラムでソート

インデックス化された任意のフィルタカラムでソート：

```
SEARCH threads golang SORT created_at DESC LIMIT 10
SEARCH posts database SORT score ASC LIMIT 20
```

### ブール演算クエリとの組み合わせ

```
SEARCH threads (golang OR python) AND tutorial SORT created_at DESC LIMIT 10
SEARCH posts ((mysql OR postgresql) AND database) NOT sqlite SORT score ASC
```

### パフォーマンスの考慮事項

**ソートアルゴリズム:**
- **LIMITあり**: `partial_sort`を使用 - O(N × log(K)) ただし K = LIMIT + OFFSET
- **LIMITなし**: 完全ソート - O(N × log(N))
- **メモリ**: インプレースソート、追加メモリ割り当てなし

**大規模な結果セット（例：100万件中80万件がヒット）の場合:**
- partial_sort最適化を活用するため、画面表示やAPI応答ではできるだけ `LIMIT` を指定してください（条件によっては約3倍高速）
- 数値キーの場合、プライマリキーのソートはフィルタカラムより高速です
- 結果はOFFSET/LIMIT適用**前に**ソートされます（正しいページネーション）

**パフォーマンス例:**
- 80万件の結果でLIMIT 100の場合：partial_sortで約3倍高速
- インプレースソート：メモリオーバーヘッドなし

### カラム検証

- **プライマリキー**: 常に有効
- **フィルタカラム**: 少なくとも1つのドキュメントに存在する必要があります
- **存在しないカラム**: 警告としてログに記録され、NULL値として扱われます（最後にソート）

---

## ページネーション (LIMIT/OFFSET)

`LIMIT`と`OFFSET`を使用して返される結果の数を制御します。

### LIMIT - 最大結果数

```
SEARCH <table> <query> LIMIT <n>
```

例：
```
SEARCH articles tech LIMIT 10
```

**デフォルト:** 100（config.yamlの`api.default_limit`で設定可能）
**範囲:** 5-1000（`kMinLimit`と`kMaxLimit`で設定可能）

### OFFSET - 結果のスキップ

```
SEARCH <table> <query> OFFSET <n>
```

例：
```
SEARCH articles tech LIMIT 10 OFFSET 20
```

これは結果21-30を返します（最初の20件をスキップ）。

### ページネーションの例

**ページ1（最初の10件）:**
```
SEARCH articles tech LIMIT 10 OFFSET 0
```

**ページ2（結果11-20）:**
```
SEARCH articles tech LIMIT 10 OFFSET 10
```

**ページ3（結果21-30）:**
```
SEARCH articles tech LIMIT 10 OFFSET 20
```

### クエリ長の上限

MygramDB は、検索語・AND/NOT 条件・FILTER 値を合計したクエリ式が設定された長さを超えると `ERROR` を返します。

- **デフォルト:** 128文字
- **設定:** `api.max_query_length`（`0` で無効化）
- **エラー例:** `ERROR Query expression length (...) exceeds ...`

複雑な条件が必要な場合は、`config.yaml` で上限を調整するか、複数のクエリに分割してください。

### 複数のオプションを組み合わせた例

```
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

- **LIMIT最適化**: partial_sortを有効化（大規模結果セットで有利）
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

```
SEARCH <table> <query> SORT _score [ASC|DESC]
```

### 動作原理

BM25は以下に基づいて各ドキュメントの関連度スコアを計算します：
- **TF（語句頻度）**: ドキュメント内での検索語句の出現回数
- **IDF（逆文書頻度）**: 全ドキュメント中での語句の希少性
- **ドキュメント長正規化**: マッチする語句を含む短いドキュメントがより高スコア

**パラメータ**（組み込み、設定変更不可）：
- `k1 = 1.2` — 語句頻度の飽和度
- `b = 0.75` — ドキュメント長正規化（0 = なし、1 = 完全）

### 例

```
SEARCH articles "機械学習" SORT _score DESC LIMIT 10
SEARCH articles golang AND tutorial SORT _score LIMIT 20
```

### 前提条件

BM25スコアリングには、正規化テキストの保存が必要です。設定で `verify_text` を `"ascii"` または `"all"` に設定してください。

```yaml
memory:
  verify_text: "all"  # または "ascii"
```

### フィルタとの組み合わせ

```
SEARCH articles "データベース" SORT _score DESC FILTER category = tech LIMIT 10
```

---

## ハイライト (HIGHLIGHT)

検索語句をタグで囲んだテキストスニペットを返します。

::: tip verify_text が必要
ハイライトは保存済みの正規化テキストからスニペットを切り出します。`verify_text: "off"` のままでは本文を保持しないため、ハイライトは利用できません。
:::

### 構文

```
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
```
SEARCH articles "機械学習" HIGHLIGHT LIMIT 10
```

カスタムタグ：
```
SEARCH articles "golang" HIGHLIGHT TAG <strong> </strong> LIMIT 10
```

長いスニペットとより多くのフラグメント：
```
SEARCH articles "データベース" HIGHLIGHT SNIPPET_LEN 200 MAX_FRAGMENTS 5 LIMIT 10
```

### 前提条件

ハイライトには、設定で `verify_text` を `"ascii"` または `"all"` に設定する必要があります。

### 他の句との組み合わせ

```
SEARCH articles "技術" HIGHLIGHT TAG <b> </b> SORT _score DESC FILTER status = 1 LIMIT 10
```

---

## あいまい検索 (FUZZY)

レーベンシュタイン編集距離（挿入、削除、置換）内の語句をマッチします。

::: info 用語補足
**レーベンシュタイン編集距離**は、ある文字列を別の文字列に変えるために必要な挿入・削除・置換の回数です。`FUZZY 1` は1文字の打ち間違い程度、`FUZZY 2` はもう少し広い候補を許容します。
:::

### 構文

```
SEARCH <table> <query> FUZZY [distance]
```

### パラメータ

- **distance** (オプション): `1`（デフォルト）または `2`
  - `1`: 1回の編集操作内のマッチ
  - `2`: 2回の編集操作内のマッチ

### 例

```
SEARCH articles "まちがい" FUZZY LIMIT 10
SEARCH articles "データベス" FUZZY 2 LIMIT 10
```

### パフォーマンス

あいまい検索は、不要な距離計算を避けるため、長さの差で事前に候補を絞り込みます。性能を優先する場合は `FUZZY 1`（デフォルト）を使ってください。

---

## エラーハンドリング

### 無効なクエリ

以下のクエリはエラーを返します：

**空の括弧:**
```
SEARCH threads ()
ERROR Invalid query: empty expression in parentheses
```

**閉じられていない括弧:**
```
SEARCH threads (golang AND python
ERROR Invalid query: unclosed parentheses
```

**余分な閉じ括弧:**
```
SEARCH threads golang AND python)
ERROR Invalid query: unexpected closing parenthesis
```

**オペランドのない演算子:**
```
SEARCH threads AND
ERROR Invalid query: operator without operands
```

**末尾の演算子:**
```
SEARCH threads golang AND
ERROR Invalid query: trailing operator
```

**閉じられていない引用符:**
```
SEARCH threads "golang tutorial
ERROR Invalid query: unclosed quote
```

### 無効なフィルタ

**存在しないテーブル:**
```
SEARCH nonexistent tech
ERROR Table not found: nonexistent
```

**無効なフィルタカラム:**
```
SEARCH articles tech FILTER invalid_column=1
ERROR Filter column not found: invalid_column
```

### 無効なソート

**存在しないカラム:**
```
SEARCH articles tech SORT nonexistent DESC
WARNING Column 'nonexistent' not found in documents, treating as NULL
```

注意：存在しないカラムは警告を生成しますがエラーにはなりません（NULLとして扱われます）。

---

## パフォーマンスのヒント

### 1. 制約の強い用語を先に配置

```
-- 良い: 具体的な用語を先に
SEARCH articles "machine learning" AND tutorial

-- 最適ではない: 一般的な用語を先に
SEARCH articles tutorial AND "machine learning"
```

### 2. 複雑な条件では括弧を使う

```
-- 明示的で読みやすい
SEARCH threads (golang OR python) AND (web OR api)

-- 理解しにくい
SEARCH threads golang OR python AND web OR api
```

### 3. 先頭のNOT演算子を避ける

```
-- 良い: 肯定的な用語を先に
SEARCH articles tech NOT old

-- 最適ではない: 先頭のNOT
SEARCH articles NOT old
```

先頭のNOTは除外前の候補が非常に広くなります。可能なら、先に肯定条件で候補を絞ってから `NOT` を使ってください。

### 4. フィルタとテキスト検索を組み合わせる

```
-- 良い: フィルタで早期に結果を絞り込む
SEARCH articles tech FILTER category = ai FILTER status = 1

-- 動作するが効率は劣る
SEARCH articles tech AND ai AND published
```

インデックス化されたカラムのフィルタは、同じ条件を通常のテキスト検索語として扱うより高速です。

### 5. 大規模結果セットにはLIMITを付ける

```
-- 良い: partial_sort最適化を使用
SEARCH articles tech SORT created_at DESC LIMIT 10

-- 遅い: すべての結果の完全ソート
SEARCH articles tech SORT created_at DESC
```

### 6. 深いページネーションを避ける

```
-- 効率的
SEARCH articles tech LIMIT 10 OFFSET 0

-- 効率が劣る（大きなOFFSET）
SEARCH articles tech LIMIT 10 OFFSET 10000
```

深い結果にはカーソルベースのページネーションなどの代替戦略を検討してください。

---

## COUNTコマンド

すべてのブール演算クエリ構文は`COUNT`でも使用できます：

```
COUNT <table> <query_expression> [FILTER ...]
```

例：
```
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

---

## 関連情報

- [クエリガイド](/ja/docs/queries) - 実践的な検索例
- [SYNCコマンドガイド](/ja/docs/sync-command) - 手動スナップショット同期
- [プロトコルリファレンス](/ja/docs/protocol) - すべてのコマンドとプロトコルの詳細
- [設定ガイド](/ja/docs/configuration) - フィルタ、N-gramサイズ、制限の設定
- [パフォーマンスチューニング](/ja/docs/performance) - 高度な最適化手法
```
