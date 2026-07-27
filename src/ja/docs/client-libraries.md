---
title: Node.js / Python / Go クライアントライブラリ
description: MygramDB公式クライアントライブラリの使い方。Node.js、Python、Goのインストール、検索、Raw Boolean検索、FACET、HIGHLIGHT、SYNC、v1.7の複数DB対応。
head:
  - - meta
    - name: keywords
      content: MygramDB Node.js, MygramDB Python, MygramDB Go, mygramdb-client, go-mygram-client, クライアントライブラリ, search_raw, SearchRaw, SYNC
---

# Node.js / Python / Go クライアントライブラリ

MygramDBには、TCPプロトコルを直接扱う公式クライアントライブラリがあります。アプリケーションから検索・カウント・ドキュメント取得・FACET・同期操作を呼び出す場合は、HTTP APIを自前で組むより各言語のクライアントを使うと実装を小さくできます。

::: info このページで扱うライブラリ
このページはアプリケーション向けの Node.js / Python / Go クライアントを扱います。MygramDB本体に同梱されるC/C++ライブラリは [libmygramclient](/ja/docs/client-library) を参照してください。
:::

## 対応状況

| 言語 | パッケージ | 要件 | 特徴 |
|------|------------|------|------|
| Node.js | `mygramdb-client` v1.4.0 | Node.js 22+ | TypeScript型定義、純JavaScript実装、任意のネイティブバインディング |
| Python | `mygramdb-client` v1.3.0 | Python 3.9+ | asyncio、外部依存なし、dataclass型 |
| Go | `github.com/libraz/go-mygram-client` | Go 1.23+ | 標準ライブラリのみ、`context.Context` 対応、並行利用可能 |

::: warning 検索対象データは先に同期してください
クライアントライブラリはMygramDBサーバーへコマンドを送るための薄いラッパーです。既存データがまだ読み込まれていない場合は、先に `SYNC <table>` を実行してください。詳しくは [SYNCコマンド](/ja/docs/sync-command) を参照してください。
:::

## 共通の考え方

- テーブル名には、単一DB構成では `articles`、複数DB構成では `app_db.articles` のようなDB修飾名を使います。
- 通常の `search()` / `Search()` は、単純な検索語やAND/NOT中心の検索に向いています。
- `OR` や括弧を含むブール式は、検索式パーサーで変換して `searchRaw()` / `SearchRaw()` / `search_raw()` に渡します。
- BM25関連度ソート、ハイライト、ファジー検索、FACETはサーバー側の設定にも依存します。
- `SET`、`SHOW VARIABLES`、`SYNC` などの管理系操作はTCP経由で実行されます。

::: info 用語補足
**Raw Boolean検索**は、`AND` / `OR` / `NOT` / 括弧を含む検索式を、サーバーのクエリパーサーにそのまま渡す検索方法です。`search()` が組み立てる単純検索では表現しにくい `python OR (ruby AND rails)` のような条件に使います。
:::

## Node.js / TypeScript

### インストール

```bash
npm install mygramdb-client
```

```bash
yarn add mygramdb-client
pnpm add mygramdb-client
bun add mygramdb-client
```

### 基本検索

```ts
import { createMygramClient } from 'mygramdb-client'

const client = createMygramClient({
  host: 'localhost',
  port: 11016
})

await client.connect()

const results = await client.search('articles', 'hello', {
  limit: 100,
  sortColumn: 'created_at',
  sortDesc: true
})

console.log(`${results.totalCount} 件の結果`)

const count = await client.count('articles', 'technology')
const doc = await client.get('articles', '12345')

client.disconnect()
```

### 複数DBとRaw Boolean検索

```ts
import {
  convertSearchExpression,
  qualifyTableIdentity,
  parseTableIdentity
} from 'mygramdb-client'

const table = qualifyTableIdentity('articles', 'app_db') // app_db.articles
console.log(parseTableIdentity(table)) // { database: 'app_db', table: 'articles' }

const raw = convertSearchExpression('python OR (ruby AND rails)')
const res = await client.searchRaw(table, raw, { limit: 50 })
```

### BM25 / HIGHLIGHT / FUZZY / FACET

```ts
const ranked = await client.search('articles', 'machine learning', {
  sortColumn: '_score',
  sortDesc: true,
  limit: 10
})

const highlighted = await client.search('articles', 'golang', {
  highlight: {
    openTag: '<strong>',
    closeTag: '</strong>',
    snippetLen: 200,
    maxFragments: 3
  },
  sortColumn: '_score',
  sortDesc: true,
  limit: 10
})

const fuzzy = await client.search('articles', 'machne', {
  fuzzy: 1,
  limit: 10
})

const facets = await client.facet('articles', 'category', {
  query: 'machine learning',
  filters: { status: '1' },
  limit: 10
})
```

### ランタイム変数とSYNC

```ts
await client.setVariable('logging.level', 'info')
console.log(await client.showVariables('logging%'))

await client.sync('app_db.articles')
console.log(await client.syncStatus())
await client.syncStop('app_db.articles')
```

## Python

### インストール

```bash
pip install mygramdb-client
```

### 基本検索

```python
import asyncio
from mygramdb_client import MygramClient, ClientConfig, SearchOptions

async def main():
    async with MygramClient(ClientConfig(host='localhost', port=11016)) as client:
        results = await client.search(
            'articles',
            'hello',
            SearchOptions(limit=100, sort_column='created_at', sort_desc=True),
        )
        print(f'{results.total_count} 件の結果')

        count = await client.count('articles', 'technology')
        doc = await client.get('articles', '12345')

asyncio.run(main())
```

### 複数DBとRaw Boolean検索

```python
import asyncio
from mygramdb_client import (
    ClientConfig,
    MygramClient,
    SearchRawOptions,
    convert_search_expression,
    parse_table_identity,
    qualify_table_identity,
)

async def main():
    async with MygramClient(ClientConfig(host='localhost', port=11016)) as client:
        table = qualify_table_identity('articles', 'app_db')  # app_db.articles
        print(parse_table_identity(table))                    # ('app_db', 'articles')

        raw = convert_search_expression('python OR (ruby AND rails)')
        res = await client.search_raw(table, raw, SearchRawOptions(limit=50))

        highlighted = await client.search_raw_with_highlights(
            table,
            raw,
            SearchRawOptions(limit=10),
        )

asyncio.run(main())
```

### HIGHLIGHT / FACET / SYNC

```python
import asyncio
from mygramdb_client import ClientConfig, FacetOptions, MygramClient, SearchOptions

async def main():
    async with MygramClient(ClientConfig(host='localhost', port=11016)) as client:
        res = await client.search_with_highlights(
            'articles',
            'golang',
            SearchOptions(limit=10, sort_column='_score', sort_desc=True),
        )

        facets = await client.facet(
            'articles',
            'category',
            FacetOptions(query='machine learning', filters={'status': '1'}, limit=10),
        )

        await client.set_variable('logging.level', 'info')
        print(await client.show_variables('logging%'))

        await client.sync('app_db.articles')
        print(await client.sync_status())
        await client.sync_stop('app_db.articles')

asyncio.run(main())
```

## Go

### インストール

```bash
go get github.com/libraz/go-mygram-client
```

### 基本検索

```go
package main

import (
	"fmt"
	"log"

	mygram "github.com/libraz/go-mygram-client"
)

func main() {
	client := mygram.NewClient("localhost:11016")
	defer client.Close()

	if err := client.Connect(); err != nil {
		log.Fatal(err)
	}

	resp, err := client.Search("articles", "hello", mygram.SearchOptions{
		Limit:      100,
		SortColumn: "created_at",
		SortDesc:   true,
	})
	if err != nil {
		log.Fatal(err)
	}

	fmt.Printf("Found %d results\n", resp.TotalCount)
}
```

### 複数DBとRaw Boolean検索

```go
table, _ := mygram.QualifyTableIdentity("articles", "app_db")
db, name, _ := mygram.ParseTableIdentity(table)
fmt.Println(db, name) // app_db articles

raw, _ := mygram.ConvertSearchExpression("python OR (ruby AND rails)")
resp, _ := client.SearchRaw(table, raw, mygram.SearchRawOptions{Limit: 50})
fmt.Println(resp.TotalCount)

resp, _ = client.SearchRawWithHighlights(
	table,
	raw,
	mygram.SearchRawOptions{Limit: 10},
)
fmt.Println(resp.Results)
```

### BM25 / HIGHLIGHT / FUZZY / FACET / SYNC

```go
ranked, _ := client.Search("articles", "machine learning", mygram.SearchOptions{
	SortColumn: "_score",
	SortDesc:   true,
	Limit:      10,
})
fmt.Println(ranked.TotalCount)

highlighted, _ := client.Search("articles", "golang", mygram.SearchOptions{
	Highlight: &mygram.HighlightOptions{
		OpenTag:      "<strong>",
		CloseTag:     "</strong>",
		SnippetLen:   200,
		MaxFragments: 3,
	},
	SortColumn: "_score",
	SortDesc:   true,
	Limit:      10,
})
if len(highlighted.Results) > 0 {
	fmt.Println(highlighted.Results[0].Snippet)
}

fuzzy, _ := client.Search("articles", "machne", mygram.SearchOptions{
	Fuzzy: 1,
	Limit: 10,
})
fmt.Println(fuzzy.TotalCount)

facets, _ := client.Facet("articles", "category", mygram.FacetOptions{
	Query:   "machine learning",
	Filters: map[string]string{"status": "1"},
	Limit:   10,
})
fmt.Println(facets.Results)

_ = client.SetVariable("logging.level", "info")
vars, _ := client.ShowVariables("logging%")
fmt.Println(vars)

_, _ = client.Sync("app_db.articles")
status, _ := client.SyncStatus()
fmt.Println(status)
_, _ = client.SyncStop("app_db.articles")
```

::: tip Goクライアントの並行利用
Goクライアントは並行利用を想定した実装です。リクエスト単位のキャンセルやタイムアウトが必要な場合は、`SearchContext`、`SearchRawContext`、`SyncContext` などの `context.Context` 付きメソッドを使ってください。
:::

## 機能別の参照先

| 機能 | サーバー側ドキュメント |
|------|------------------------|
| 検索構文、`AND` / `OR` / `NOT` | [クエリ構文](/ja/docs/query-syntax) |
| BM25 `_score` | [クエリガイド - 関連度ソート](/ja/docs/queries#関連度ソートbm25) |
| HIGHLIGHT | [クエリガイド - ハイライト](/ja/docs/queries#ハイライト) |
| FUZZY | [クエリガイド - ファジー検索](/ja/docs/queries#ファジー検索) |
| FACET | [クエリガイド - FACET集計](/ja/docs/queries#facet集計) |
| `SYNC` | [SYNCコマンド](/ja/docs/sync-command) |
| ランタイム変数 | [運用ガイド](/ja/docs/operations) |

## リポジトリ

- [node-mygramdb-client](https://github.com/libraz/node-mygramdb-client)
- [python-mygramdb-client](https://github.com/libraz/python-mygramdb-client)
- [go-mygram-client](https://github.com/libraz/go-mygram-client)
