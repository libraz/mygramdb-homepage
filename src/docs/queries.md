---
title: MygramDB Query Guide - Search, Filter, Sort, and Aggregate
description: "Query MygramDB in practice: boolean and phrase search, filters, sorting, highlighting, fuzzy search, FACET aggregation, synonyms, and pagination."
head:
  - - meta
    - name: keywords
      content: MygramDB query guide, search examples, boolean search, FILTER, SORT, HIGHLIGHT, FUZZY, FACET aggregation, synonym expansion, pagination
---

# Query Guide

Practical examples of the MygramDB query commands. The full grammar, limits, and error messages are in the [Query Syntax Reference](/docs/query-syntax).

::: warning Allow your source IP
Before running queries, make sure the client IP falls inside `network.allow_cidrs` in the configuration. **CIDR** is a notation for an IP address range, such as `192.168.1.0/24`. Without a matching entry, every connection is denied. See [Network Security](/docs/configuration#network-security).
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

A leading `NOT` is also accepted, but it produces a wide candidate set. Combine it with search terms or filters (see [NOT Search](/docs/query-syntax#not-search)).

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

Temporal values in a query are numbers. `date`, `datetime`, and `timestamp` columns take Unix epoch seconds (`1704067200` is 2024-01-01 00:00:00 UTC). `time` columns take signed seconds, including negative values and values beyond 24 hours. Do not copy `required_filters` values such as ISO 8601 strings into a query `FILTER`.

Multiple filters (AND logic):

```mygram
127.0.0.1:11016> SEARCH articles tech FILTER status = 1 FILTER category_id = 5
```

### Filter Operators

`FILTER` supports `=`, `!=` / `<>`, `>`, `>=`, `<`, and `<=`, each with a word alias (`EQ`, `NE`, `GT`, `GTE`, `LT`, `LTE`). See [Supported Operators](/docs/query-syntax#supported-operators) for the table.

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

`BY` is optional. `SORT ASC` and `SORT DESC` without a column are shorthand for primary-key ordering.

### Relevance Sort (BM25)

Sort by BM25 relevance score using the reserved `_score` column:

```mygram
127.0.0.1:11016> SEARCH articles "machine learning" SORT _score DESC LIMIT 10
```

BM25 computes term frequency (TF) and inverse document frequency (IDF) at query time. Tune it with `bm25.k1` (default `1.2`) and `bm25.b` (default `0.75`). `SORT _score` requires `bm25.enable: true`. See [BM25 Relevance Scoring](/docs/query-syntax#bm25-relevance-scoring-sort-score).

## Highlighting

Return text snippets with matched terms wrapped in tags:

```mygram
127.0.0.1:11016> SEARCH articles "machine learning" HIGHLIGHT LIMIT 10
127.0.0.1:11016> SEARCH articles "golang" HIGHLIGHT TAG <strong> </strong> LIMIT 10
127.0.0.1:11016> SEARCH articles "database" HIGHLIGHT SNIPPET_LEN 200 MAX_FRAGMENTS 5 LIMIT 10
```

The tags default to `<em>` and `</em>`. `SNIPPET_LEN` (default 100) is the maximum number of code points per fragment, and `MAX_FRAGMENTS` (default 3) is the maximum number of fragments joined with an ellipsis. See [Highlighting](/docs/query-syntax#highlighting-highlight) for ranges. The snippets are built from normalized text that the server retains, even when `memory.verify_text` is `"off"`.

## Fuzzy Search

Match terms within a Levenshtein edit distance:

```mygram
127.0.0.1:11016> SEARCH articles "machne" FUZZY LIMIT 10
127.0.0.1:11016> SEARCH articles "databse" FUZZY 2 LIMIT 10
```

Distance `1` (default) matches terms within one edit (insertion, deletion, or substitution); `2` allows two edits. `FUZZY` also returns every document that the same query returns without it, and may add edit-distance matches. See [Fuzzy Search](/docs/query-syntax#fuzzy-search-fuzzy).

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

The first header count is the number of values returned on this page. The second is the total number of distinct values for the query, including values omitted by `LIMIT` or `OFFSET`. Each value and its document count are separated by a tab, and an empty line terminates the response. Equal-count values keep a stable order, so pages do not reshuffle ties between requests.

To scope the aggregation to a query, use the same AND/NOT/FILTER/LIMIT clauses as `SEARCH`.

FACET is also exposed over HTTP at `POST /tables/{identity}/facet`. The HTTP body uses `column`, optional `q`, optional `filters`, and optional `limit`.

## Synonym Expansion

When a synonym dictionary is configured (`tables[*].synonyms.enable: true`, see [Configuration](/docs/configuration#per-table-synonyms)), search terms are transparently expanded to OR-groups of their synonyms at query time. Queries need no new syntax. A query for `car` also matches `automobile` and `vehicle` when the TSV dictionary groups them together.

Synonyms are configured per table under `tables[*].synonyms`. Fuzzy search takes a separate execution path and is not combined with synonym expansion for the same query.

## Pagination

```mygram
127.0.0.1:11016> SEARCH articles golang LIMIT 10
127.0.0.1:11016> SEARCH articles golang LIMIT 10 OFFSET 20
```

The `total_count` in an `OK RESULTS` response is the number of matches before pagination, and the IDs that follow are the current page. See [Response Format](/docs/query-syntax#response-format). The `LIMIT` range and the cost of deep pages are covered under [Pagination](/docs/query-syntax#pagination-limit-offset).

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

Without parentheses, `NOT` binds tightest, then `AND`, then `OR`. For example, `a OR b AND c` is parsed as `a OR (b AND c)`. Use parentheses to state your intent. More cases are in [Operator Precedence](/docs/query-syntax#operator-precedence).

## Performance Tips

1. **Use LIMIT** - Enables faster partial sorting
2. **Add specific filters** - Reduces result set early
3. **Use AND over OR** - AND queries are typically faster
4. **Index filter columns** - Configure frequently filtered columns in config

See [Performance Tips](/docs/query-syntax#performance-tips) in the reference for details.

## Next Steps

- [Configuration](/docs/configuration) - Configure filter columns
- [Getting Started](/docs/getting-started) - Quick start guide

## Detailed Documentation

- [Full Query Syntax Reference](/docs/query-syntax)
- [HTTP API](/docs/http-api)
- [Protocol Reference](/docs/protocol)
