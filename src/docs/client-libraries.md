---
title: Node.js / Python / Go Client Libraries
description: Official MygramDB client libraries for Node.js, Python, Go, and the bundled C/C++ SDK. Install, search, raw boolean search, FACET, HIGHLIGHT, SYNC, and multi-database table identities.
head:
  - - meta
    - name: keywords
      content: MygramDB Node.js, MygramDB Python, MygramDB Go, mygramdb-client, go-mygram-client, client libraries, search_raw, SearchRaw, SYNC
---

# Node.js / Python / Go Client Libraries

MygramDB provides official TCP client libraries for application code. Use them when you want typed search, count, document lookup, FACET, runtime variables, and on-demand sync without building the TCP protocol yourself.

::: info Scope
This page covers the application clients for Node.js, Python, and Go, plus where the bundled C/C++ SDK fits. The C/C++ API, CMake package, and pkg-config usage are documented on [libmygramclient](/docs/client-library).
:::

## Support Matrix

| Language | Package | Requirement | Notes |
|----------|---------|-------------|-------|
| Node.js | `mygramdb-client` | Node.js 22+ | TypeScript types, pure JavaScript implementation, optional native binding |
| Python | `mygramdb-client` | Python 3.11+ | asyncio, zero external dependencies, dataclass types |
| Go | `github.com/libraz/go-mygram-client` | Go 1.26+ | standard library only, `context.Context` variants, safe for concurrent use |
| C / C++ | bundled `libmygramclient` | C11 / C++17 | Installed SDK with C and C++ APIs, `MygramDB::client_static` / `MygramDB::client_shared`, and `mygramclient.pc` |

::: warning Load data before querying
The clients are thin wrappers around MygramDB server commands. If existing rows have not been loaded yet, run `SYNC <table>` first. See [SYNC Command](/docs/sync-command).
:::

::: warning Rebuild C/C++ programs
The shared library uses soname 2 (`VERSION 2.0.0`); public search-expression structures changed layout. Rebuild and relink native programs against the current headers. See [libmygramclient](/docs/client-library) for the C/C++ API.
:::

## Shared Concepts

::: info What is raw boolean search?
**Raw boolean search** passes a full search expression — with `AND`, `OR`, `NOT`, and parentheses — straight to the server's query parser. Use it for conditions such as `python OR (ruby AND rails)` that the simple `search()` builder cannot express.
:::

- Use `articles` on a single-database server, or `app_db.articles` when the instance indexes tables from multiple databases.
- `search()` / `Search()` is best for simple terms and AND/NOT-style searches.
- For `OR` and parentheses, convert the expression and pass it to `searchRaw()` / `SearchRaw()` / `search_raw()`.
- The web-syntax converter recognizes whole-word `or` as `OR`, quotes literal words such as `order` and terms with apostrophes, and turns a minus inside a group into `NOT`. It emits phrases and OR/groups once; pass its output directly to the raw search method.
- Search responses expose the total number of matches before `limit`/`offset` as well as the current page of results. FACET results are paginated too: each value's `count` is the number of matching documents for that value, while `totalCount` / `total_count` / `TotalCount` is the number of distinct values before pagination. Equal-count values keep a stable order across pages.
- BM25 scoring, highlighting, fuzzy search, and facets depend on the server-side table configuration.
- Runtime variables and `SYNC` are TCP commands exposed by the client libraries.

::: warning Administrative commands require authentication
`CONFIG`, `SET` / `SHOW VARIABLES`, `DUMP`, `REPLICATION`, `SYNC`, `OPTIMIZE`, `DEBUG`, and `CACHE` require authentication only when the server has a non-empty `api.admin_token`. Configure `adminToken` (Node.js), `admin_token` (Python), or `AdminToken` (Go) to have the client send `AUTH` on each new connection, including automatic reconnects. A raw `AUTH` sent with `sendCommand()` or `send_command()` applies only to that connection; use the SDK's configuration option when reconnects must retain admin access. `search`, `count`, `get`, `facet`, and `INFO` remain available without authentication. When `api.admin_token` is set, `INFO` omits its replication section until the connection completes `AUTH`.
:::

## Node.js / TypeScript

### Install

```bash
npm install mygramdb-client
```

```bash
yarn add mygramdb-client
pnpm add mygramdb-client
bun add mygramdb-client
```

### Basic Search

```ts
import { createMygramClient } from 'mygramdb-client'

const client = createMygramClient({ host: 'localhost', port: 11016 })
await client.connect()

const results = await client.search('articles', 'hello', {
  limit: 100,
  sortColumn: 'created_at',
  sortDesc: true
})

console.log(`${results.totalCount} results`)

const count = await client.count('articles', 'technology')
const doc = await client.get('articles', '12345')

client.disconnect()
```

### Table Identities and Raw Boolean Search

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

### Runtime Variables and SYNC

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

Set `MYGRAM_API_ADMIN_TOKEN` when the server has `api.admin_token` configured. The client authenticates during `connect()` and on subsequent reconnects.

## Python

### Install

```bash
pip install mygramdb-client
```

### Basic Search

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
        print(f'{results.total_count} results')

        count = await client.count('articles', 'technology')
        doc = await client.get('articles', '12345')

asyncio.run(main())
```

### Table Identities and Raw Boolean Search

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

asyncio.run(main())
```

### HIGHLIGHT / FACET / SYNC

```python
import asyncio
import os
from mygramdb_client import ClientConfig, FacetOptions, MygramClient, SearchOptions

async def main():
    config = ClientConfig(
        host='localhost',
        port=11016,
        admin_token=os.environ.get('MYGRAM_API_ADMIN_TOKEN', ''),
    )
    async with MygramClient(config) as client:
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

Set `MYGRAM_API_ADMIN_TOKEN` when the server has `api.admin_token` configured. `ClientConfig` makes the client authenticate when it connects and after a transparent reconnect.

## Go

### Install

```bash
go get github.com/libraz/go-mygram-client
```

### Basic Search

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

### Table Identities and Raw Boolean Search

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

### BM25 / HIGHLIGHT / FUZZY / FACET

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

### Runtime Variables and SYNC

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

Set `MYGRAM_API_ADMIN_TOKEN` when the server has `api.admin_token` configured. `ClientConfig.AdminToken` is sent on every connection, including reconnects.

::: tip Go concurrency
The Go client is designed for concurrent use. Use the `context.Context` variants such as `SearchContext`, `SearchRawContext`, and `SyncContext` when you need request-scoped cancellation or deadlines.
:::

## Server-Side References

| Feature | Documentation |
|---------|---------------|
| Query syntax, `AND` / `OR` / `NOT` | [Query Syntax](/docs/query-syntax) |
| BM25 `_score` | [Query Guide - Relevance Sort](/docs/queries#relevance-sort-bm25) |
| HIGHLIGHT | [Query Guide - Highlighting](/docs/queries#highlighting) |
| FUZZY | [Query Guide - Fuzzy Search](/docs/queries#fuzzy-search) |
| FACET | [Query Guide - FACET](/docs/queries#facet-aggregation) |
| `SYNC` | [SYNC Command](/docs/sync-command) |
| Runtime variables | [Operations](/docs/operations) |

## Repositories

- [node-mygramdb-client](https://github.com/libraz/node-mygramdb-client)
- [python-mygramdb-client](https://github.com/libraz/python-mygramdb-client)
- [go-mygram-client](https://github.com/libraz/go-mygram-client)
