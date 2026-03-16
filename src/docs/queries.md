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
