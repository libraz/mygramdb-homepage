# クエリガイド

MygramDBで効果的に検索する方法を学びましょう。

> [!WARNING]
> クエリを実行する前に、設定ファイルの `allow_cidrs` にIPアドレスが登録されていることを確認してください。CIDR登録がない場合、すべての接続が拒否されます。[ネットワークセキュリティ](/ja/docs/configuration#ネットワークセキュリティ)を参照してください。

## mygram-cliで接続

```bash
mygram-cli -h localhost -p 11016
```

接続後、対話的にクエリを実行できます。

## 基本検索

```
mygram> SEARCH articles hello world
OK RESULTS 3 101 205 387
```

## ブール演算子

### AND - すべての語句を含む

```
mygram> SEARCH articles golang AND tutorial
```

### OR - いずれかの語句を含む

```
mygram> SEARCH articles golang OR python OR rust
```

### NOT - 語句を除外

```
mygram> SEARCH articles tutorial NOT beginner
```

### 組み合わせ

```
mygram> SEARCH articles (golang OR python) AND tutorial NOT beginner
```

## フレーズ検索

引用符で完全一致：

```
mygram> SEARCH articles "machine learning"
mygram> SEARCH articles '機械学習'
```

演算子と組み合わせ：

```
mygram> SEARCH articles "web framework" AND (golang OR python)
```

## フィルタリング

カラム値でフィルタ：

```
mygram> SEARCH articles tech FILTER status = 1
mygram> SEARCH articles tech FILTER views > 1000
mygram> SEARCH articles tech FILTER created_at >= 2024-01-01
```

複数フィルタ（AND条件）：

```
mygram> SEARCH articles tech FILTER status = 1 FILTER category_id = 5
```

### フィルタ演算子

| 演算子 | 別名 | 説明 |
|----------|-------|-------------|
| `=` | `EQ` | 等しい |
| `!=` | `NE` | 等しくない |
| `>` | `GT` | より大きい |
| `>=` | `GTE` | 以上 |
| `<` | `LT` | より小さい |
| `<=` | `LTE` | 以下 |

## ソート

プライマリキーでソート：

```
mygram> SEARCH articles golang SORT ASC
mygram> SEARCH articles golang SORT DESC
```

カラムでソート：

```
mygram> SEARCH articles golang SORT created_at DESC
mygram> SEARCH articles golang SORT score ASC
```

### 関連度ソート（BM25）

予約カラム `_score` を指定するとBM25関連度でソートできます（v1.6.0以降）：

```
mygram> SEARCH articles "machine learning" SORT _score DESC LIMIT 10
```

BM25は `k1=1.2`、`b=0.75` をパラメータとし、クエリ時にIDFとTFを計算します。`SORT _score` を使用するには、保存された正規化テキストからTFを計算するため `verify_text` を `"ascii"` または `"all"` に設定する必要があります。

## ハイライト

マッチした語句をタグで囲んだスニペットを返却（v1.6.0以降）：

```
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

```
mygram> SEARCH articles "machne" FUZZY LIMIT 10
mygram> SEARCH articles "databse" FUZZY 2 LIMIT 10
```

距離 `1`（デフォルト）は1編集操作（挿入／削除／置換）以内、`2` は2編集操作以内でマッチします。候補は長さの差で事前フィルタされるため、オーバーヘッドは抑えられます。

## FACET集計

フィルタカラムの値を件数付きで集計（v1.6.0以降）：

```
mygram> FACET articles status
mygram> FACET articles category "search text" FILTER status = 1 LIMIT 10
```

HTTP：

```bash
curl -X POST http://localhost:8080/articles/facet \
  -H "Content-Type: application/json" \
  -d '{"column": "category", "q": "検索テキスト", "filters": {"status": 1}, "limit": 10}'
```

結果は件数の降順で返されます。検索クエリ（AND/NOT/FILTERのフルクローズ対応）にマッチするドキュメントに限定することも可能です。

## シノニム展開

シノニム辞書（`synonyms.enable: true`、[設定](/ja/docs/configuration#シノニム辞書)を参照）が有効な場合、検索語句はクエリ時に同義語のORグループへ自動展開されます。クエリ側の構文変更は不要で、例えば `car` を検索すると、TSV辞書で同じグループに定義された `automobile` や `vehicle` にもマッチします。

## ページネーション

```
mygram> SEARCH articles golang LIMIT 10
mygram> SEARCH articles golang LIMIT 10 OFFSET 20
```

## カウントクエリ

IDなしでカウントのみ取得：

```
mygram> COUNT articles golang AND tutorial
OK COUNT 42
```

## 実用例

### 最新のGoチュートリアルを検索

```
mygram> SEARCH articles golang AND tutorial FILTER status = 1 SORT created_at DESC LIMIT 20
```

### データベースに関する人気記事

```
mygram> SEARCH posts (mysql OR postgresql) AND performance FILTER views > 1000 SORT score DESC LIMIT 10
```

### 関連度順＋ハイライト付き

```
mygram> SEARCH articles "machine learning" SORT _score DESC HIGHLIGHT LIMIT 10
```

### カテゴリ内のアクティブユーザー数

```
mygram> COUNT users tech FILTER status = 1 FILTER category_id = 5
```

## HTTP API

すべてのクエリはHTTPでも利用可能（POST + JSONボディ）：

```bash
curl -X POST http://localhost:8080/articles/search \
  -H "Content-Type: application/json" \
  -d '{"q": "golang tutorial", "limit": 10}'
```

```bash
curl -X POST http://localhost:8080/articles/search \
  -H "Content-Type: application/json" \
  -d '{"q": "golang", "limit": 0}'
```

## 演算子の優先順位

括弧がない場合、演算子は以下の順序で評価されます：

1. **NOT**（最高）
2. **AND**
3. **OR**（最低）

例：`a OR b AND c` は `a OR (b AND c)` と解釈されます

> [!TIP]
> 意図を明確にし、予期しない結果を避けるため括弧を使用してください。

## パフォーマンスのヒント

1. **LIMITを使用** - 高速な部分ソートが有効
2. **具体的なフィルタを追加** - 結果セットを早期に削減
3. **ORよりANDを優先** - ANDクエリは通常高速
4. **フィルタカラムをインデックス** - 頻繁にフィルタするカラムを設定に追加

## 次のステップ

- [設定](/ja/docs/configuration) - フィルタカラムの設定
- [クイックスタート](/ja/docs/getting-started) - 入門ガイド

## 詳細ドキュメント

- [クエリ構文リファレンス（詳細）](https://github.com/libraz/mygram-db/blob/main/docs/ja/query_syntax.md)
- [HTTP API](https://github.com/libraz/mygram-db/blob/main/docs/ja/http-api.md)
- [プロトコルリファレンス](https://github.com/libraz/mygram-db/blob/main/docs/ja/protocol.md)
