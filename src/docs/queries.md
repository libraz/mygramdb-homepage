---
title: MygramDB Query Guide - Search, Filter, Sort, and Aggregate
description: Practical guide to querying MygramDB. Basic and boolean search, phrase search, filters, sorting, highlighting, fuzzy search, FACET aggregation, synonyms, and pagination.
head:
  - - meta
    - name: keywords
      content: MygramDB query guide, search examples, boolean search, FILTER, SORT, HIGHLIGHT, FUZZY, FACET aggregation, synonym expansion, pagination
---

# Query Guide

Learn how to search effectively with MygramDB.

::: info What is CIDR?
**CIDR** is a notation for a range of IP addresses. If you cannot connect, first check that the client IP falls inside `network.allow_cidrs`.
:::

::: warning Allow your source IP
Before executing queries, ensure your IP is registered in `allow_cidrs` in the configuration. Without CIDR registration, all connections are denied. See [Network Security](/docs/configuration#network-security).
:::

## Connecting with mygram-cli

```bash
mygram-cli -h localhost -p 11016
```

Once connected, you can execute queries interactively.

## Basic Search

```mygram
127.0.0.1:11016> SEARCH articles hello world
OK RESULTS 3 101 205 387
```

In a single-database configuration, `articles` resolves to that database's table. In a multi-database configuration, qualify the table as `<database>.<table>`:

```mygram
127.0.0.1:11016> SEARCH app_db.articles hello world
```

## Boolean Operators

::: tip Reading the operators
`AND` means "contains both", `OR` means "contains any", and `NOT` means "exclude anything containing this". For anything complex, parentheses make the intent unambiguous.
:::

### AND - All terms must match

```mygram
127.0.0.1:11016> SEARCH articles golang AND tutorial
```

### OR - Any term matches

```mygram
127.0.0.1:11016> SEARCH articles golang OR python OR rust
```

### NOT - Exclude terms

```mygram
127.0.0.1:11016> SEARCH articles tutorial NOT beginner
127.0.0.1:11016> SEARCH articles tutorial AND NOT beginner
127.0.0.1:11016> SEARCH articles required AND 'not'
```

`AND NOT` is equivalent to `NOT` here. It is accepted for clients that represent each additional condition with an `AND` prefix.

A quoted keyword is a literal term. The last query requires the word `not`; the quotes keep it from being parsed as the `NOT` operator.

### Combined

```mygram
127.0.0.1:11016> SEARCH articles (golang OR python) AND tutorial NOT beginner
```

## Phrase Search

Use quotes for exact phrases:

```mygram
127.0.0.1:11016> SEARCH articles "machine learning"
127.0.0.1:11016> SEARCH articles 'web framework'
```

Combine with operators:

```mygram
127.0.0.1:11016> SEARCH articles "web framework" AND (golang OR python)
```

## Filtering

Filter by column values:

```mygram
127.0.0.1:11016> SEARCH articles tech FILTER status = 1
127.0.0.1:11016> SEARCH articles tech FILTER views > 1000
127.0.0.1:11016> SEARCH articles tech FILTER created_at >= 1704067200
```

::: warning Filter columns must be configured
`FILTER` works on columns declared under `tables[*].filters` or `tables[*].required_filters` in the config file. A column that exists in MySQL but is not declared cannot be used as a search-time filter. The same column may be declared in both lists: `required_filters` controls whether a row enters the index, and query-time `FILTER` narrows the indexed rows for each request.
:::

Query-time temporal filters use numeric values. `date`, `datetime`, and `timestamp` columns use Unix epoch seconds, while `time` uses signed duration seconds, including negative values and values beyond 24 hours. For example, `1704067200` represents 2024-01-01 00:00:00 UTC. The `required_filters` configuration uses its own temporal syntax, including ISO 8601 values; do not copy those strings into a query `FILTER`.

Multiple filters (AND logic):

```mygram
127.0.0.1:11016> SEARCH articles tech FILTER status = 1 FILTER category_id = 5
```

### Filter Operators

| Operator | Alias | Description |
|----------|-------|-------------|
| `=` | `EQ` | Equal |
| `!=` / `<>` | `NE` | Not equal |
| `>` | `GT` | Greater than |
| `>=` | `GTE` | Greater or equal |
| `<` | `LT` | Less than |
| `<=` | `LTE` | Less or equal |

## Sorting

Sort by primary key:

```mygram
127.0.0.1:11016> SEARCH articles golang SORT ASC
127.0.0.1:11016> SEARCH articles golang SORT DESC
```

Sort by column:

```mygram
127.0.0.1:11016> SEARCH articles golang SORT created_at DESC
127.0.0.1:11016> SEARCH articles golang SORT BY created_at DESC
127.0.0.1:11016> SEARCH articles golang SORT _score ASC
```

`BY` is optional; both column forms are valid. `SORT ASC` and `SORT DESC` remain shorthand for primary-key ordering.

Numeric filter columns keep their declared type when sorted. A `bigint_unsigned` column orders values above 2^63 by their unsigned numeric value.

### Relevance Sort (BM25)

Sort by BM25 relevance score using the reserved `_score` column:

```mygram
127.0.0.1:11016> SEARCH articles "machine learning" SORT _score DESC LIMIT 10
```

BM25 computes IDF and TF at query time, with `bm25.k1` (default `1.2`) and `bm25.b` (default `0.75`) as tuning parameters. `SORT _score` requires `bm25.enable: true`; the server retains normalized text for scoring independently of the `memory.verify_text` post-filtering policy.

## Highlighting

Return text snippets with matched terms wrapped in tags:

```mygram
127.0.0.1:11016> SEARCH articles "machine learning" HIGHLIGHT LIMIT 10
127.0.0.1:11016> SEARCH articles "golang" HIGHLIGHT TAG <strong> </strong> LIMIT 10
127.0.0.1:11016> SEARCH articles "database" HIGHLIGHT SNIPPET_LEN 200 MAX_FRAGMENTS 5 LIMIT 10
```

| Option | Default | Range | Description |
|--------|---------|-------|-------------|
| `TAG <open> <close>` | `<em>` / `</em>` | — | Open/close tags |
| `SNIPPET_LEN <n>` | 100 | 1–10,000 | Max code points per fragment |
| `MAX_FRAGMENTS <n>` | 3 | 1–100 | Max fragments joined with ellipsis |

HIGHLIGHT uses normalized text retained by the server, including when `memory.verify_text` is `"off"`.

## Fuzzy Search

Match terms within a Levenshtein edit distance:

```mygram
127.0.0.1:11016> SEARCH articles "machne" FUZZY LIMIT 10
127.0.0.1:11016> SEARCH articles "databse" FUZZY 2 LIMIT 10
```

Distance `1` (default) matches terms within 1 edit (insert/delete/substitute); `2` matches within 2 edits. Candidate filtering by length keeps distance calculations bounded. `FUZZY` includes every document returned by the same query without `FUZZY`, including terms shorter than the configured n-gram size and mixed CJK/ASCII terms, and may add edit-distance matches.

## FACET Aggregation

Aggregate distinct filter-column values with document counts:

```mygram
127.0.0.1:11016> FACET articles status
127.0.0.1:11016> FACET articles category "search text" FILTER status = 1 LIMIT 10
```

TCP response (sorted by count, descending):

```mygram
OK FACET <returned_value_count> <total_distinct_values>
<value1>\t<count1>
<value2>\t<count2>

```

The value and count are separated by a tab, and an empty line terminates the response. The second header count includes values omitted by `LIMIT` or `OFFSET`. Equal-count values keep a stable order, so pages do not reshuffle ties between requests.

FACET supports the same AND/NOT/FILTER/LIMIT clauses as `SEARCH` when scoping aggregation to a query.

FACET is also exposed over HTTP at `POST /tables/{identity}/facet`. The HTTP body uses `column`, optional `q`, optional `filters`, and optional `limit`.

## Synonym Expansion

When a synonym dictionary is configured (`tables[*].synonyms.enable: true`, see [Configuration](/docs/configuration#per-table-synonyms)), search terms are transparently expanded to OR-groups of their synonyms at query time. No query-side syntax change is needed — a query for `car` will also match `automobile` and `vehicle` when they are grouped in the TSV dictionary.

Synonyms are configured per table under `tables[*].synonyms`. Fuzzy search takes a separate execution path and is not combined with synonym expansion for the same query.

## Pagination

```mygram
127.0.0.1:11016> SEARCH articles golang LIMIT 10
127.0.0.1:11016> SEARCH articles golang LIMIT 10 OFFSET 20
```

The `total_count` in an `OK RESULTS` response is the number of matches before pagination; the returned IDs are the current page. The server derives the total and page from one index read, so they describe the same result set.

Boolean-query cache keys preserve parsed token, quote, and parenthesis structure. Queries whose full-width whitespace, parentheses, or quoting produce different expressions use separate cache entries; equivalent Unicode whitespace that parses identically may share an entry.

## Count Query

Get count without IDs:

```mygram
127.0.0.1:11016> COUNT articles golang AND tutorial
OK COUNT 42
```

## Complete Examples

### Find recent Go tutorials

```mygram
127.0.0.1:11016> SEARCH articles golang AND tutorial FILTER status = 1 SORT created_at DESC LIMIT 20
```

### Find popular posts about databases

```mygram
127.0.0.1:11016> SEARCH posts (mysql OR postgresql) AND performance FILTER views > 1000 SORT _score DESC LIMIT 10
```

### Top relevance with highlighted snippets

```mygram
127.0.0.1:11016> SEARCH articles "machine learning" SORT _score DESC HIGHLIGHT LIMIT 10
```

### Count active users in category

```mygram
127.0.0.1:11016> COUNT users tech FILTER status = 1 FILTER category_id = 5
```

## HTTP API

`SEARCH`, `COUNT`, `FACET`, and document GET are also exposed over HTTP using the `/tables/{identity}/...` route shape. HTTP `q` is literal by default; add `"mode": "boolean"` only when `q` is an intentional boolean expression.

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

With two or more configured databases, use `/tables/app_db.articles/...`. Admin commands such as `SET`, `SHOW VARIABLES`, `SYNC`, and `DUMP` remain TCP/CLI-only.

## Operator Precedence

Without parentheses, operators are evaluated in this order:

1. **NOT** (highest)
2. **AND**
3. **OR** (lowest)

Example: `a OR b AND c` is parsed as `a OR (b AND c)`

::: tip Pin the intent with parentheses
Use parentheses to make your intent clear and avoid unexpected results.
:::

## Performance Tips

1. **Use LIMIT** - Enables faster partial sorting
2. **Add specific filters** - Reduces result set early
3. **Use AND over OR** - AND queries are typically faster
4. **Index filter columns** - Configure frequently filtered columns in config

## Next Steps

- [Configuration](/docs/configuration) - Configure filter columns
- [Getting Started](/docs/getting-started) - Quick start guide

## Detailed Documentation

- [Full Query Syntax Reference](/docs/query-syntax)
- [HTTP API](/docs/http-api)
- [Protocol Reference](/docs/protocol)
