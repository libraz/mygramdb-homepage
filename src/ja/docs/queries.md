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

### カテゴリ内のアクティブユーザー数

```
mygram> COUNT users tech FILTER status = 1 FILTER category_id = 5
```

## HTTP API

すべてのクエリはHTTPでも利用可能：

```bash
curl "http://localhost:8080/search?table=articles&q=golang+tutorial&limit=10"
```

```bash
curl "http://localhost:8080/count?table=articles&q=golang"
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
