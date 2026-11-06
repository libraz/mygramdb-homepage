---
title: Node.js / Python / Go クライアントライブラリ
description: MygramDB 公式クライアントライブラリの使い方。Node.js、Python、Go と同梱 C/C++ SDK のインストール、検索、Raw Boolean 検索、FACET、HIGHLIGHT、SYNC、複数 DB 対応。
head:
  - - meta
    - name: keywords
      content: MygramDB Node.js, MygramDB Python, MygramDB Go, mygramdb-client, go-mygram-client, クライアントライブラリ, search_raw, SearchRaw, SYNC
---

# Node.js / Python / Go クライアントライブラリ

MygramDB には、アプリケーションコードから使える公式の TCP クライアントライブラリがあります。型付きの検索、カウント、ドキュメント取得、FACET、ランタイム変数、オンデマンド同期を、TCP プロトコルを自前で実装せずに呼び出せます。

::: info このページで扱うライブラリ
このページはアプリケーション向けの Node.js / Python / Go クライアントと、同梱 C/C++ SDK の位置付けを扱います。C/C++ API、CMake パッケージ、pkg-config の使い方は [libmygramclient](/ja/docs/client-library) を参照してください。
:::

## 対応状況

| 言語 | パッケージ | 要件 | 特徴 |
|------|------------|------|------|
| Node.js | `mygramdb-client` | Node.js 22+ | TypeScript 型定義、純 JavaScript 実装、任意のネイティブバインディング |
| Python | `mygramdb-client` | Python 3.11+ | asyncio、外部依存なし、dataclass 型 |
| Go | `github.com/libraz/go-mygram-client` | Go 1.26+ | 標準ライブラリのみ、`context.Context` 対応、並行利用可能 |
| C / C++ | 同梱の `libmygramclient` | C11 / C++17 | C と C++ API、インストール可能な SDK |

C/C++ SDK は、CMake ターゲットの `MygramDB::client_static` と `MygramDB::client_shared`、および pkg-config 用の `mygramclient.pc` をインストールします。

::: tip MygramDB v1.12 向けのリリース
v1.11 と v1.12 のサーバーには、`mygramdb-client` 1.7.0（Node.js）、`mygramdb-client` 1.6.0（Python）、`go-mygram-client` v0.7.0（Go）以降を使ってください。これらのリリースは応答をコマンドごとに区切って読むので、`FACET`、`CONFIG HELP <path>`、`SYNC STATUS`、失敗した `HIGHLIGHT` / `DEBUG` 付き検索の応答を正しい終端まで読み取ります。引用符付けもサーバーと同じく Unicode の `White_Space` に従い、設定変数のエラー `1008` と `1009` にも名前が付きました。
:::

::: warning 検索対象データは先に同期してください
クライアントライブラリは MygramDB サーバーへコマンドを送るための薄いラッパーです。既存データがまだ読み込まれていない場合は、先に `SYNC <table>` を実行してください。詳しくは [SYNC コマンド](/ja/docs/sync-command) を参照してください。
:::

::: warning C/C++ プログラムの再ビルド
共有ライブラリの soname は 2（`VERSION 2.0.0`）で、公開検索式構造体のレイアウトが変わりました。現在のヘッダーでネイティブプログラムを再ビルドしてリンクし直してください。C/C++ API は [libmygramclient](/ja/docs/client-library) を参照してください。
:::

## 共通の考え方

::: info 用語補足
**Raw Boolean 検索**は、`AND` / `OR` / `NOT` / 括弧を含む検索式を、サーバーのクエリパーサーにそのまま渡す検索方法です。`search()` が組み立てる単純検索では表現できない `python OR (ruby AND rails)` のような条件に使います。
:::

- テーブル名には、単一 DB 構成では `articles`、複数 DB 構成では `app_db.articles` のような DB 修飾名を使います。
- `search()` / `Search()` は、単純な検索語や AND/NOT 中心の検索に向いています。
- `OR` や括弧を含む検索式は、変換してから `searchRaw()` / `SearchRaw()` / `search_raw()` に渡します。
- Web 構文の変換関数は、単独の `or` を `OR` として扱います。`order` のようなリテラル語やアポストロフィを含む語は引用符で囲み、グループ内のマイナスは `NOT` に変換します。フレーズと OR グループは 1 回だけ出力されるので、結果はそのまま Raw 検索メソッドに渡してください。
- 変換関数は、サーバーと同じ規則で式をグループ化します。暗黙の AND は `OR` より強く結合するので、`a OR b c` は括弧付きの形と同じ `(a OR b c)` に変換されます。否定したグループはグループ全体を除外し、`x +(a -(b OR c))` は `x AND (a NOT (b OR c))` になります。`OR-tools` のように `OR` で始まるだけの語は検索語のままです。括弧の外の `OR` の直前や直後に `+` / `-` を付けた式（`+a OR b`）は、オペランド不足としてエラーになります。
- 検索レスポンスには、現在のページの結果と、`limit` / `offset` 適用前のマッチ総数が含まれます。
- FACET もページ分割されます。各値の `count` はその値を持つドキュメント数で、`totalCount` / `total_count` / `TotalCount` はページ分割前の異なる値の総数です。件数が同じ値は、ページをまたいでも順序が変わりません。
- BM25 関連度ソート、ハイライト、あいまい検索、FACET は、サーバー側のテーブル設定にも依存します。
- ランタイム変数と `SYNC` は TCP コマンドで、クライアントライブラリから呼び出せます。

::: warning 管理系コマンドには認証が必要です
`CONFIG`、`SET` / `SHOW VARIABLES`、`DUMP`、`REPLICATION`、`SYNC`、`OPTIMIZE`、`DEBUG`、`CACHE` に認証が必要なのは、サーバーの `api.admin_token` が空でない場合だけです。`search`、`count`、`get`、`facet`、`INFO` は認証なしで使えます。ただし `api.admin_token` を設定している場合、`INFO` は接続が `AUTH` を完了するまでレプリケーションのセクションを省略します。

クライアントが新しい接続ごとに `AUTH` を送るようにするには、`adminToken`（Node.js）、`admin_token`（Python）、`AdminToken`（Go）を設定します。自動再接続のときも `AUTH` を送ります。`sendCommand()` や `send_command()` で手動送信した `AUTH` はその接続にだけ有効です。再接続後も管理操作を続けたい場合は、SDK の設定項目を使ってください。
:::

## インストール

使う言語のパッケージをインストールします。

::: code-group

```bash [Node.js (npm)]
npm install mygramdb-client
```

```bash [Node.js (yarn, pnpm, bun)]
yarn add mygramdb-client
pnpm add mygramdb-client
bun add mygramdb-client
```

```bash [Python]
pip install mygramdb-client
```

```bash [Go]
go get github.com/libraz/go-mygram-client
```

:::

## 基本検索

接続して `created_at` 順に検索し、続けて件数のカウントと主キーによるドキュメント取得を行う例です。

::: code-group

```ts [Node.js]
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

```python [Python]
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

```go [Go]
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

:::

## 複数 DB と Raw Boolean 検索

DB 修飾テーブル名の生成と分解、Web 構文の検索式の変換、変換結果を使った Raw Boolean 検索の例です。

::: code-group

```ts [Node.js]
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

```python [Python]
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
    config = ClientConfig(
        host='localhost',
        port=11016,
        admin_token=os.environ.get('MYGRAM_API_ADMIN_TOKEN', ''),
    )
    async with MygramClient(config) as client:
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

```go [Go]
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

:::

::: warning 解析済み検索式の形が変わりました
`parseSearchExpression()` / `parse_search_expression()` / `ParseSearchExpression()` が返す `SearchExpression` から、`optionalTerms` / `optional_terms` / `OptionalTerms` が削除されました。このフィールドは常に空でした。代わりに `requiredIsGroup` と `excludedIsGroup`（`required_is_group` / `excluded_is_group`、`RequiredIsGroup` / `ExcludedIsGroup`）が必須語・除外語の配列と同じ並びで、`(...)` グループの要素に印を付けます。そのため `"(a OR b)"` のようにグループに見える引用フレーズは、リテラルのフレーズとして扱われます。削除されたフィールドを読んでいるコードは修正してください。
:::

## 高度な検索と管理操作

以下の例では、BM25 ソート、HIGHLIGHT、FACET、ランタイム変数、`SYNC` を扱います。Node.js と Go の例では FUZZY も扱い、Python の例ではすべてを 1 つのプログラムにまとめています。

### Node.js / TypeScript

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

```ts
const adminToken = process.env.MYGRAM_API_ADMIN_TOKEN
const adminClient = createMygramClient({
  host: 'localhost',
  port: 11016,
  ...(adminToken ? { adminToken } : {})
})
await adminClient.connect()

await adminClient.setVariable('logging.level', 'info')
console.log(await adminClient.showVariables('logging%'))

await adminClient.sync('app_db.articles')
console.log(await adminClient.syncStatus())
await adminClient.syncStop('app_db.articles')
adminClient.disconnect()
```

サーバーに `api.admin_token` を設定した場合は、`MYGRAM_API_ADMIN_TOKEN` に同じ値を設定してください。クライアントは `connect()` の際と再接続時に認証します。

### Python

```python
import asyncio
import os
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

サーバーに `api.admin_token` を設定した場合は、`MYGRAM_API_ADMIN_TOKEN` に同じ値を設定してください。`ClientConfig` に指定すると、クライアントは接続時と自動再接続時に認証します。

### Go

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
```

```go
package main

import (
	"fmt"
	"log"
	"os"

	mygram "github.com/libraz/go-mygram-client"
)

func main() {
	adminToken := os.Getenv("MYGRAM_API_ADMIN_TOKEN")
	client := mygram.NewClientWithConfig(mygram.ClientConfig{
		Host:       "localhost",
		Port:       11016,
		AdminToken: adminToken,
	})
	defer client.Close()
	if err := client.Connect(); err != nil {
		log.Fatal(err)
	}

	if err := client.SetVariable("logging.level", "info"); err != nil {
		log.Fatal(err)
	}
	vars, err := client.ShowVariables("logging%")
	if err != nil {
		log.Fatal(err)
	}
	fmt.Println(vars)

	if _, err := client.Sync("app_db.articles"); err != nil {
		log.Fatal(err)
	}
	status, err := client.SyncStatus()
	if err != nil {
		log.Fatal(err)
	}
	fmt.Println(status)
	if _, err := client.SyncStop("app_db.articles"); err != nil {
		log.Fatal(err)
	}
}
```

サーバーに `api.admin_token` を設定した場合は、`MYGRAM_API_ADMIN_TOKEN` に同じ値を設定してください。`ClientConfig.AdminToken` は、再接続を含む各接続で送信されます。

::: tip Go クライアントの並行利用
Go クライアントは並行利用を想定した実装です。リクエスト単位のキャンセルやタイムアウトが必要な場合は、`SearchContext`、`SearchRawContext`、`SyncContext` などの `context.Context` 付きメソッドを使ってください。
:::

## 機能別の参照先

| 機能 | サーバー側ドキュメント |
|------|------------------------|
| 検索構文、`AND` / `OR` / `NOT` | [クエリ構文](/ja/docs/query-syntax) |
| BM25 `_score` | [クエリガイド - 関連度ソート](/ja/docs/queries#%E9%96%A2%E9%80%A3%E5%BA%A6%E3%82%BD%E3%83%BC%E3%83%88-bm25) |
| HIGHLIGHT | [クエリガイド - ハイライト](/ja/docs/queries#ハイライト) |
| FUZZY | [クエリガイド - あいまい検索](/ja/docs/queries#あいまい検索) |
| FACET | [クエリガイド - FACET 集計](/ja/docs/queries#facet-集計) |
| `SYNC` | [SYNC コマンド](/ja/docs/sync-command) |
| ランタイム変数 | [運用ガイド](/ja/docs/operations) |

## リポジトリ

- [node-mygramdb-client](https://github.com/libraz/node-mygramdb-client)
- [python-mygramdb-client](https://github.com/libraz/python-mygramdb-client)
- [go-mygram-client](https://github.com/libraz/go-mygram-client)
