# Query Guide

Learn how to search effectively with MygramDB.

> [!WARNING]
> Before executing queries, ensure your IP is registered in `allow_cidrs` in the configuration. Without CIDR registration, all connections are denied. See [Network Security](/docs/configuration#network-security).

## Connecting with mygram-cli

```bash
mygram-cli -h localhost -p 11016
```

Once connected, you can execute queries interactively.

## Basic Search

```
mygram> SEARCH articles hello world
OK RESULTS 3 101 205 387
```

## Boolean Operators

### AND - All terms must match

```
mygram> SEARCH articles golang AND tutorial
```

### OR - Any term matches

```
mygram> SEARCH articles golang OR python OR rust
```

### NOT - Exclude terms

```
mygram> SEARCH articles tutorial NOT beginner
```

### Combined

```
mygram> SEARCH articles (golang OR python) AND tutorial NOT beginner
```

## Phrase Search

Use quotes for exact phrases:

```
mygram> SEARCH articles "machine learning"
mygram> SEARCH articles 'web framework'
```

Combine with operators:

```
mygram> SEARCH articles "web framework" AND (golang OR python)
```

## Filtering

Filter by column values:

```
mygram> SEARCH articles tech FILTER status = 1
mygram> SEARCH articles tech FILTER views > 1000
mygram> SEARCH articles tech FILTER created_at >= 2024-01-01
```

Multiple filters (AND logic):

```
mygram> SEARCH articles tech FILTER status = 1 FILTER category_id = 5
```

### Filter Operators

| Operator | Alias | Description |
|----------|-------|-------------|
| `=` | `EQ` | Equal |
| `!=` | `NE` | Not equal |
| `>` | `GT` | Greater than |
| `>=` | `GTE` | Greater or equal |
| `<` | `LT` | Less than |
| `<=` | `LTE` | Less or equal |

## Sorting

Sort by primary key:

```
mygram> SEARCH articles golang SORT ASC
mygram> SEARCH articles golang SORT DESC
```

Sort by column:

```
mygram> SEARCH articles golang SORT created_at DESC
mygram> SEARCH articles golang SORT score ASC
```

### Relevance Sort (BM25)

Sort by BM25 relevance score using the reserved `_score` column (v1.6.0+):

```
mygram> SEARCH articles "machine learning" SORT _score DESC LIMIT 10
```

BM25 uses `k1=1.2`, `b=0.75` and computes IDF and TF at query time. `SORT _score` requires `verify_text` to be set to `"ascii"` or `"all"` so that term frequency can be counted from stored normalized text.

## Highlighting

Return text snippets with matched terms wrapped in tags (v1.6.0+):

```
mygram> SEARCH articles "machine learning" HIGHLIGHT LIMIT 10
mygram> SEARCH articles "golang" HIGHLIGHT TAG <strong> </strong> LIMIT 10
mygram> SEARCH articles "database" HIGHLIGHT SNIPPET_LEN 200 MAX_FRAGMENTS 5 LIMIT 10
```

| Option | Default | Range | Description |
|--------|---------|-------|-------------|
| `TAG <open> <close>` | `<em>` / `</em>` | — | Open/close tags |
| `SNIPPET_LEN <n>` | 100 | 1–10,000 | Max code points per fragment |
| `MAX_FRAGMENTS <n>` | 3 | 1–100 | Max fragments joined with ellipsis |

HIGHLIGHT requires `verify_text` to be `"ascii"` or `"all"`.

## Fuzzy Search

Match terms within a Levenshtein edit distance (v1.6.0+):

```
mygram> SEARCH articles "machne" FUZZY LIMIT 10
mygram> SEARCH articles "databse" FUZZY 2 LIMIT 10
```

Distance `1` (default) matches terms within 1 edit (insert/delete/substitute); `2` matches within 2 edits. Candidates are pre-filtered by length to keep this cheap.

## FACET Aggregation

Aggregate distinct filter-column values with document counts (v1.6.0+):

```
mygram> FACET articles status
mygram> FACET articles category "search text" FILTER status = 1 LIMIT 10
```

HTTP:

```bash
curl -X POST http://localhost:8080/articles/facet \
  -H "Content-Type: application/json" \
  -d '{"column": "category", "q": "optional text", "filters": {"status": 1}, "limit": 10}'
```

Results are sorted by count (DESC). Optionally scoped to documents matching a search query with full clause support (AND/NOT/FILTER).

## Synonym Expansion

When a synonym dictionary is configured (`synonyms.enable: true`, see [Configuration](/docs/configuration#synonym-dictionary)), search terms are transparently expanded to OR-groups of their synonyms at query time. No query-side syntax change is needed — a query for `car` will also match `automobile` and `vehicle` when they are grouped in the TSV dictionary.

## Pagination

```
mygram> SEARCH articles golang LIMIT 10
mygram> SEARCH articles golang LIMIT 10 OFFSET 20
```

## Count Query

Get count without IDs:

```
mygram> COUNT articles golang AND tutorial
OK COUNT 42
```

## Complete Examples

### Find recent Go tutorials

```
mygram> SEARCH articles golang AND tutorial FILTER status = 1 SORT created_at DESC LIMIT 20
```

### Find popular posts about databases

```
mygram> SEARCH posts (mysql OR postgresql) AND performance FILTER views > 1000 SORT score DESC LIMIT 10
```

### Top relevance with highlighted snippets

```
mygram> SEARCH articles "machine learning" SORT _score DESC HIGHLIGHT LIMIT 10
```

### Count active users in category

```
mygram> COUNT users tech FILTER status = 1 FILTER category_id = 5
```

## HTTP API

All queries are also available via HTTP (POST with JSON body):

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

## Operator Precedence

Without parentheses, operators are evaluated in this order:

1. **NOT** (highest)
2. **AND**
3. **OR** (lowest)

Example: `a OR b AND c` is parsed as `a OR (b AND c)`

> [!TIP]
> Use parentheses to make your intent clear and avoid unexpected results.

## Performance Tips

1. **Use LIMIT** - Enables faster partial sorting
2. **Add specific filters** - Reduces result set early
3. **Use AND over OR** - AND queries are typically faster
4. **Index filter columns** - Configure frequently filtered columns in config

## Next Steps

- [Configuration](/docs/configuration) - Configure filter columns
- [Getting Started](/docs/getting-started) - Quick start guide

## Detailed Documentation

- [Full Query Syntax Reference](https://github.com/libraz/mygram-db/blob/main/docs/en/query_syntax.md)
- [HTTP API](https://github.com/libraz/mygram-db/blob/main/docs/en/http-api.md)
- [Protocol Reference](https://github.com/libraz/mygram-db/blob/main/docs/en/protocol.md)
