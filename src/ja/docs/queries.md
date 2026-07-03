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
mygram> SEARCH articles hello world
OK RESULTS 3 101 205 387
```

単一DB構成では `articles` はそのDB内のテーブルとして解決されます。複数DB構成では `<database>.<table>` 形式で指定してください。

```mygram
mygram> SEARCH app_db.articles hello world
```

## ブール演算子

::: tip 演算子の読み方
`AND` は「両方含む」、`OR` は「どれかを含む」、`NOT` は「含むものを除外」です。複雑な条件では括弧を使うと意図が明確になります。
:::

### AND - すべての語句を含む

```mygram
mygram> SEARCH articles golang AND tutorial
```

### OR - いずれかの語句を含む

```mygram
mygram> SEARCH articles golang OR python OR rust
```

### NOT - 語句を除外

```mygram
mygram> SEARCH articles tutorial NOT beginner
```

`NOT` だけの検索はできません。除外条件は、検索語やフィルタなどの候補集合を絞り込むために使います。

### 組み合わせ

```mygram
mygram> SEARCH articles (golang OR python) AND tutorial NOT beginner
```

## フレーズ検索

引用符で囲むと、語句の並びを保ったフレーズとして検索します。

```mygram
mygram> SEARCH articles "machine learning"
mygram> SEARCH articles '機械学習'
```

演算子と組み合わせ：

```mygram
mygram> SEARCH articles "web framework" AND (golang OR python)
```

## フィルタリング

カラム値でフィルタ：

```mygram
mygram> SEARCH articles tech FILTER status = 1
mygram> SEARCH articles tech FILTER views > 1000
mygram> SEARCH articles tech FILTER created_at >= 2024-01-01
```

::: warning フィルタ対象カラムは設定が必要
`FILTER` で使えるのは、設定ファイルの `tables[*].filters` または `tables[*].required_filters` に定義したカラムです。定義していないカラムは、MySQLに存在していてもMygramDBの検索時フィルタには使えません。
:::

複数フィルタ（AND条件）：

```mygram
mygram> SEARCH articles tech FILTER status = 1 FILTER category_id = 5
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
mygram> SEARCH articles golang SORT ASC
mygram> SEARCH articles golang SORT DESC
```

カラムでソート：

```mygram
mygram> SEARCH articles golang SORT created_at DESC
mygram> SEARCH articles golang SORT score ASC
```

### 関連度ソート（BM25）

予約カラム `_score` を指定するとBM25関連度でソートできます（v1.6.0以降）：

```mygram
mygram> SEARCH articles "machine learning" SORT _score DESC LIMIT 10
```

BM25は `k1=1.2`、`b=0.75` をパラメータとし、クエリ時にIDFとTFを計算します。`SORT _score` を使用するには、保存された正規化テキストからTFを計算するため `verify_text` を `"ascii"` または `"all"` に設定する必要があります。

## ハイライト

マッチした語句をタグで囲んだスニペットを返却（v1.6.0以降）：

```mygram
mygram> SEARCH articles "machine learning" HIGHLIGHT LIMIT 10
mygram> SEARCH articles "golang" HIGHLIGHT TAG <strong> </strong> LIMIT 10
mygram> SEARCH articles "database" HIGHLIGHT SNIPPET_LEN 200 MAX_FRAGMENTS 5 LIMIT 10
```

| オプション | デフォルト | 範囲 | 説明 |
|--------|---------|-------|-------------|
| `TAG <open> <close>` | `<em>` / `</em>` | — | 開始/終了タグ |
| `SNIPPET_LEN <n>` | 100 | 1〜10,000 | 1フラグメントあたりの最大コードポイント数 |
| `MAX_FRAGMENTS <n>` | 3 | 1〜100 | `…` で連結する最大フラグメント数 |

HIGHLIGHTの使用には `verify_text` を `"ascii"` または `"all"` に設定する必要があります。

## ファジー検索

Levenshtein編集距離の範囲内で語句をマッチ（v1.6.0以降）：

```mygram
mygram> SEARCH articles "machne" FUZZY LIMIT 10
mygram> SEARCH articles "databse" FUZZY 2 LIMIT 10
```

距離 `1`（デフォルト）は1編集操作（挿入／削除／置換）以内、`2` は2編集操作以内でマッチします。候補は長さの差で事前フィルタされるため、オーバーヘッドは抑えられます。

## FACET集計

フィルタカラムの値を件数付きで集計（v1.6.0以降）：

```mygram
mygram> FACET articles status
mygram> FACET articles category "search text" FILTER status = 1 LIMIT 10
```

レスポンス（件数の降順）：

```mygram
OK FACET <column>
<value1> <count1>
<value2> <count2>
...
END
```

FACETは `SEARCH` と同じく AND/NOT/FILTER/LIMIT を組み合わせて、特定の検索結果にスコープを絞った集計も可能です。

v1.7.0以降、FACETはHTTPでも `POST /tables/{identity}/facet` から利用できます。HTTPボディでは `column`、任意の `q`、任意の `filters`、任意の `limit` を指定します。

## シノニム展開

シノニム辞書（`tables[*].synonyms.enable: true`、[設定](/ja/docs/configuration#テーブル単位のシノニム)を参照）が有効な場合、検索語句はクエリ時に同義語のORグループへ自動展開されます。クエリ側の構文変更は不要で、例えば `car` を検索すると、TSV辞書で同じグループに定義された `automobile` や `vehicle` にもマッチします。

シノニムはテーブルごとの設定です。ファジー検索は別の実行パスを使うため、同じクエリ内ではシノニム展開と組み合わせません。

## ページネーション

```mygram
mygram> SEARCH articles golang LIMIT 10
mygram> SEARCH articles golang LIMIT 10 OFFSET 20
```

## カウントクエリ

IDなしでカウントのみ取得：

```mygram
mygram> COUNT articles golang AND tutorial
OK COUNT 42
```

## 実用例

### 最新のGoチュートリアルを検索

```mygram
mygram> SEARCH articles golang AND tutorial FILTER status = 1 SORT created_at DESC LIMIT 20
```

### データベースに関する人気記事

```mygram
mygram> SEARCH posts (mysql OR postgresql) AND performance FILTER views > 1000 SORT score DESC LIMIT 10
```

### 関連度順＋ハイライト付き

```mygram
mygram> SEARCH articles "machine learning" SORT _score DESC HIGHLIGHT LIMIT 10
```

### カテゴリ内のアクティブユーザー数

```mygram
mygram> COUNT users tech FILTER status = 1 FILTER category_id = 5
```

## HTTP API

`SEARCH`、`COUNT`、`FACET`、ドキュメントGETはHTTPでも利用できます。v1.7.0以降は `/tables/{identity}/...` のルート形式を使います。

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
