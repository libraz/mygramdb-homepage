# Query Guide

Learn how to search effectively with MygramDB.

## Basic Search

```
SEARCH articles hello world
```

Response:
```
OK RESULTS 3 101 205 387
```

## Boolean Operators

### AND - All terms must match

```
SEARCH articles golang AND tutorial
```

### OR - Any term matches

```
SEARCH articles golang OR python OR rust
```

### NOT - Exclude terms

```
SEARCH articles tutorial NOT beginner
```

### Combined

```
SEARCH articles (golang OR python) AND tutorial NOT beginner
```

## Phrase Search

Use quotes for exact phrases:

```
SEARCH articles "machine learning"
SEARCH articles 'web framework'
```

Combine with operators:

```
SEARCH articles "web framework" AND (golang OR python)
```

## Filtering

Filter by column values:

```
SEARCH articles tech FILTER status = 1
SEARCH articles tech FILTER views > 1000
SEARCH articles tech FILTER created_at >= 2024-01-01
```

Multiple filters (AND logic):

```
SEARCH articles tech FILTER status = 1 FILTER category_id = 5
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
SEARCH articles golang SORT ASC
SEARCH articles golang SORT DESC
```

Sort by column:

```
SEARCH articles golang SORT created_at DESC
SEARCH articles golang SORT score ASC
```

## Pagination

```
SEARCH articles golang LIMIT 10
SEARCH articles golang LIMIT 10 OFFSET 20
```

## Count Query

Get count without IDs:

```
COUNT articles golang AND tutorial
```

Response:
```
OK COUNT 42
```

## Complete Examples

### Find recent Go tutorials

```
SEARCH articles golang AND tutorial FILTER status = 1 SORT created_at DESC LIMIT 20
```

### Find popular posts about databases

```
SEARCH posts (mysql OR postgresql) AND performance FILTER views > 1000 SORT score DESC LIMIT 10
```

### Count active users in category

```
COUNT users tech FILTER status = 1 FILTER category_id = 5
```

## HTTP API

All queries are also available via HTTP:

```bash
curl "http://localhost:8080/search?table=articles&q=golang+tutorial&limit=10"
```

```bash
curl "http://localhost:8080/count?table=articles&q=golang"
```

## Operator Precedence

Without parentheses, operators are evaluated in this order:

1. **NOT** (highest)
2. **AND**
3. **OR** (lowest)

Example: `a OR b AND c` is parsed as `a OR (b AND c)`

**Best practice:** Use parentheses to make intent clear.

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
