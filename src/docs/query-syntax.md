---
title: MygramDB Query Syntax Reference - Boolean Search Grammar
description: Complete MygramDB query syntax reference. Boolean AND/OR/NOT, parentheses, quoted phrases, FILTER conditions, SORT, LIMIT/OFFSET, BM25 _score, HIGHLIGHT, FUZZY, and error handling.
head:
  - - meta
    - name: keywords
      content: MygramDB query syntax, boolean search, AND OR NOT, FILTER, SORT, BM25 scoring, HIGHLIGHT, FUZZY search, n-gram tokenization
---

# Query Syntax Guide

MygramDB supports a rich boolean query syntax for complex text search operations.

::: info This is not SQL
MygramDB queries are a small search command language, not SQL. A query such as `SEARCH articles mysql FILTER status = 1 LIMIT 10` carries only search terms and search options.
:::

## Table of Contents

- [Basic Syntax](#basic-syntax)
- [Boolean Operators](#boolean-operators)
- [Complex Boolean Queries](#complex-boolean-queries)
- [Operator Precedence](#operator-precedence)
- [Quoted Phrases](#quoted-phrases)
- [Filter Conditions](#filter-conditions)
- [Sorting (SORT clause)](#sorting-sort-clause)
- [Pagination (LIMIT/OFFSET)](#pagination-limit-offset)
- [BM25 Relevance Scoring (SORT _score)](#bm25-relevance-scoring-sort-_score)
- [Highlighting (HIGHLIGHT)](#highlighting-highlight)
- [Fuzzy Search (FUZZY)](#fuzzy-search-fuzzy)
- [Error Handling](#error-handling)
- [Performance Tips](#performance-tips)

---

## Basic Syntax

### Command Format

```mygram
SEARCH <table> <query_expression> [FILTER ...] [SORT ...] [LIMIT ...] [OFFSET ...]
COUNT <table> <query_expression> [FILTER ...]
```

::: info
`<table>` accepts the database-qualified form `` `database.table` `` (e.g. `app_db.articles`). In a
single-database deployment (only one distinct database is configured), a bare table name such as
`articles` also works. Qualification is required only when the configuration spans two or more
databases; a bare name is then rejected as ambiguous.
:::

### Simple Term Search

```mygram
SEARCH <table> <term>
```

Example:
```mygram
SEARCH threads golang
```

Terms may include punctuation unless it is a query delimiter. For example, `c++`, `e-mail`, and `v1.9.0` are each parsed as one term.

### Response Format

**SEARCH Response:**
```mygram
OK RESULTS <total_count> <id1> <id2> <id3> ...
```

Example:
```mygram
OK RESULTS 3 101 205 387
```

**COUNT Response:**
```mygram
OK COUNT <number>
```

Example:
```mygram
OK COUNT 42
```

---

## Boolean Operators

### AND Search

Search for documents containing **all** specified terms.

::: tip How this differs from a bare space
A plain `golang tutorial` is effectively treated as "contains both" as well. For anything more complex, writing `AND` explicitly is safer for readability.
:::

```mygram
SEARCH <table> term1 AND term2 AND term3
```

Example:
```mygram
SEARCH threads golang AND tutorial
```

### OR Search

Search for documents containing **any** of the specified terms.

```mygram
SEARCH <table> term1 OR term2 OR term3
```

Example:
```mygram
SEARCH threads golang OR python OR rust
```

### NOT Search

Exclude documents containing specific terms.

::: warning Using NOT well
`NOT` removes documents from the result set. A query that leads with `NOT` tends to produce a very wide candidate set, so on large indexes pair it with positive terms wherever possible.
:::

```mygram
SEARCH <table> term1 NOT term2
```

Example:
```mygram
SEARCH threads tutorial NOT beginner
```

**Important:** NOT excludes documents from the result set. Use it carefully with large indexes.

---

## Complex Boolean Queries

### Parentheses for Precedence

Use parentheses to group expressions and control operator precedence:

```mygram
SEARCH <table> (term1 OR term2) AND term3
```

Example:
```mygram
SEARCH threads (golang OR python) AND tutorial
```

This finds documents containing "tutorial" AND either "golang" OR "python".

### Nested Expressions

You can nest multiple levels of parentheses:

```mygram
SEARCH <table> ((term1 OR term2) AND term3) OR term4
```

Example:
```mygram
SEARCH threads ((golang OR python) AND web) OR rust
```

This finds:
- Documents with "web" AND ("golang" OR "python")
- **OR** documents with "rust"

### Complex Query Examples

#### Find Go or Python tutorials, excluding beginner content

```mygram
SEARCH threads (golang OR python) AND tutorial NOT beginner
```

#### Find database content about MySQL or PostgreSQL, excluding SQLite

```mygram
SEARCH posts database AND (mysql OR postgresql) NOT sqlite
```

#### Find machine learning content in Python or R, excluding TensorFlow

```mygram
SEARCH articles "machine learning" AND (python OR R) NOT tensorflow
```

---

## Operator Precedence

When no parentheses are used, operators have the following precedence (highest to lowest):

1. **NOT** (highest)
2. **AND** (medium)
3. **OR** (lowest)

### Precedence Examples

**Query:** `a OR b AND c`
**Parsed as:** `a OR (b AND c)`

**Query:** `NOT a AND b`
**Parsed as:** `(NOT a) AND b`

**Query:** `a AND b OR c AND d`
**Parsed as:** `(a AND b) OR (c AND d)`

**Best Practice:** Use parentheses to make intent explicit, even when not strictly necessary.

::: tip Pin the intent with parentheses
Even where they are not strictly required, parentheses prevent misreading in complex conditions.
:::

---

## Quoted Phrases

Use double quotes `"` or single quotes `'` for exact phrase matching:

```mygram
SEARCH <table> "exact phrase"
SEARCH <table> 'machine learning'
```

### Escape Sequences

Supported escape sequences inside quoted strings:

- `\n` - Newline
- `\t` - Tab
- `\r` - Carriage return
- `\\` - Backslash
- `\"` - Double quote
- `\'` - Single quote

Example:
```mygram
SEARCH articles "hello \"world\""
```

### Mixing Quotes with Operators

Quoted phrases can be combined with boolean operators:

```mygram
SEARCH threads "web framework" AND (golang OR python)
SEARCH posts "machine learning" NOT "deep learning"
```

---

## Filter Conditions

Filter results by column values using the `FILTER` clause.

### Syntax

```mygram
SEARCH <table> <query> FILTER <column> <operator> <value> [FILTER <col> <op> <val> ...]
```

Multiple filters can be specified (all must match - AND logic).

### Supported Operators

- `=` or `EQ` - Equal
- `!=`, `<>`, or `NE` - Not equal
- `>` or `GT` - Greater than
- `>=` or `GTE` - Greater than or equal
- `<` or `LT` - Less than
- `<=` or `LTE` - Less than or equal

### Examples

**Single filter:**
```mygram
SEARCH articles tech FILTER status = 1
```

**Multiple filters:**
```mygram
SEARCH articles tech FILTER status = 1 FILTER category = ai
```

**Comparison operators:**
```mygram
SEARCH articles tech FILTER views > 1000
SEARCH articles tech FILTER created_at >= 2024-01-01
SEARCH articles tech FILTER priority != 0
SEARCH articles tech FILTER status <> archived
```

**With boolean queries:**
```mygram
SEARCH threads (golang OR python) AND tutorial FILTER status = published
```

### Filter Column Types

MygramDB supports filtering on indexed filter columns:

- **Integer**: `status=1`, `priority=5`
- **String**: `category=tech`, `author=john`
- **Date/Time**: `created_at=2024-01-15T10:30:00`, `published_on=2024-01-15`

**Note:** Only columns configured as filters in `config.yaml` can be used in FILTER clauses.

::: warning FILTER requires configuration
A column not registered under `filters` in `config.yaml` cannot be used with `FILTER`. This is a separate setting from `required_filters`, which decides whether a row is indexed at all.
:::

### Filter Performance

- **Bitmap indexes**: Very fast for low-cardinality columns (e.g., status, category)
- **Dictionary compression**: Efficient for string columns
- **Filtering order**: Filters are applied after text search intersection

---

## Sorting (SORT clause)

Sort search results using the `SORT` clause.

### Syntax

```mygram
SEARCH <table> <query> SORT <column> [ASC|DESC]
```

**Note:** The `ORDER BY` syntax is not supported. Use `SORT` instead.

::: info Not SQL's ORDER BY
MygramDB has no `ORDER BY` syntax. Use `SORT` to order search results.
:::

### Default Behavior

If `SORT` is not specified, results are sorted by **primary key in descending order** (newest first).

```mygram
SEARCH threads golang
-- Equivalent to: SEARCH threads golang SORT id DESC
```

### Sorting by Primary Key

**Full syntax:**
```mygram
SEARCH threads golang SORT id ASC
SEARCH threads golang SORT id DESC
```

**Shorthand syntax (recommended):**
```mygram
SEARCH threads golang SORT ASC   -- Primary key ascending
SEARCH threads golang SORT DESC  -- Primary key descending
```

### Sorting by Filter Column

Sort by any indexed filter column:

```mygram
SEARCH threads golang SORT created_at DESC LIMIT 10
SEARCH posts database SORT _score ASC LIMIT 20
```

### Combining with Boolean Queries

```mygram
SEARCH threads (golang OR python) AND tutorial SORT created_at DESC LIMIT 10
SEARCH posts ((mysql OR postgresql) AND database) NOT sqlite SORT _score ASC
```

### Performance Considerations

**Sorting Algorithm:**
- **With a small LIMIT**: Uses `partial_sort` when `LIMIT + OFFSET` is less than half of the result set, for O(N × log(K)) work where K = LIMIT + OFFSET.
- **Otherwise**: Uses a full sort, O(N × log(N)).
- **Memory**: Sorting can allocate temporary sort-key storage for eligible result sets; do not assume it is in-place.

**For large result sets (e.g., 1M documents with 800K matches):**
- Keep `LIMIT + OFFSET` well below the result count to use the partial-sort path.
- Measure the chosen sort column on production-like data; primary-key sorting still compares the matching results.
- Results are sorted **before** applying OFFSET/LIMIT (ensures correct pagination)

**Example Performance:**
- 800K results with LIMIT 100 use the partial-sort path.
- Large result sets can require temporary sort-key storage.

### Column Validation

- **Primary key**: Always valid
- **Filter columns**: Must be configured
- **Non-existent columns**: Rejected with an error

---

## Pagination (LIMIT/OFFSET)

Control the number of results returned using `LIMIT` and `OFFSET`.

### LIMIT - Maximum Results

```mygram
SEARCH <table> <query> LIMIT <n>
```

Example:
```mygram
SEARCH articles tech LIMIT 10
```

**Default:** 100 (configurable via `api.default_limit` in config.yaml)
**Range:** 1-1000. `api.default_limit` itself must be between 5 and 1000, but an explicit `LIMIT` clause accepts any value from 1 up to 1000.

MySQL-style `LIMIT <offset>,<count>` is also accepted; combining it with a separate `OFFSET` clause is an error.

### OFFSET - Skip Results

```mygram
SEARCH <table> <query> OFFSET <n>
```

Example:
```mygram
SEARCH articles tech LIMIT 10 OFFSET 20
```

This returns results 21-30 (skips first 20).

### Pagination Examples

**Page 1 (first 10 results):**
```mygram
SEARCH articles tech LIMIT 10 OFFSET 0
```

**Page 2 (results 11-20):**
```mygram
SEARCH articles tech LIMIT 10 OFFSET 10
```

**Page 3 (results 21-30):**
```mygram
SEARCH articles tech LIMIT 10 OFFSET 20
```

### Maximum Query Length

MygramDB rejects queries whose combined expression length (search text + AND/NOT terms + FILTER values) exceeds the configured limit.

- **Default:** 128 characters
- **Config:** `api.max_query_length` (`0` disables the guard)
- **Error:** `ERROR Query expression length (...) exceeds maximum allowed length...`

Keep boolean expressions compact or raise the limit in `config.yaml` if applications require longer filters.

### Complete Example with All Options

```mygram
SEARCH threads (golang OR python) AND tutorial
  FILTER status = published
  SORT created_at DESC
  LIMIT 10
  OFFSET 20
```

This query:
1. Finds documents with "tutorial" AND ("golang" OR "python")
2. Filters to only published documents
3. Sorts by creation date (newest first)
4. Returns results 21-30 (page 3 with 10 results per page)

### Pagination Performance

- **LIMIT optimization**: Uses partial sort only when `LIMIT + OFFSET` is less than half of the result set
- **OFFSET cost**: O(N) where N = OFFSET (results are still generated, just not returned)
- **Best practice**: Use LIMIT with SORT for consistent pagination
- **Deep pagination**: Large OFFSET values (e.g., 10000+) can be slow

---

## BM25 Relevance Scoring (SORT _score)

Sort results by relevance using the BM25 ranking function.

::: info What is BM25?
**BM25** is a standard ranking function that scores relevance from how often a term appears, how rare the term is, and how long the document is. Use it when you want the most relevant documents on top rather than plain ID order.
:::

### Syntax

```mygram
SEARCH <table> <query> SORT _score [ASC|DESC]
```

### How It Works

BM25 computes a relevance score for each document based on:
- **TF (Term Frequency)**: How often the search term appears in the document
- **IDF (Inverse Document Frequency)**: How rare the term is across all documents
- **Document length normalization**: Shorter documents with matching terms score higher

**Parameters** (configurable in the `bm25` section of `config.yaml`):
- `bm25.k1` — Term frequency saturation (default `1.2`)
- `bm25.b` — Document length normalization (default `0.75`; 0 = none, 1 = full)

### Examples

```mygram
SEARCH articles "machine learning" SORT _score DESC LIMIT 10
SEARCH articles golang AND tutorial SORT _score LIMIT 20
```

### Requirements

`SORT _score` needs two settings. Both are off by default, so a fresh configuration rejects the query.

| Setting | Why | Error when missing |
|---------|-----|--------------------|
| `bm25.enable: true` | Turns on relevance scoring | `SORT _score requires BM25 to be enabled in configuration` |
| `memory.verify_text: "ascii"` or `"all"` | Term frequency is counted from stored normalized text | `SORT _score requires normalized text storage.` |

```yaml
bm25:
  enable: true
  k1: 1.2
  b: 0.75

memory:
  verify_text: "all"  # or "ascii"
```

### Combining with Filters

```mygram
SEARCH articles "database" SORT _score DESC FILTER category = tech LIMIT 10
```

---

## Highlighting (HIGHLIGHT)

Return text snippets with search terms highlighted using configurable tags.

::: tip verify_text is required
Highlighting cuts snippets out of stored normalized text. With `verify_text: "off"` the text is not retained, so highlighting is unavailable.
:::

### Syntax

```mygram
SEARCH <table> <query> HIGHLIGHT [TAG <open> <close>] [SNIPPET_LEN <n>] [MAX_FRAGMENTS <n>]
```

### Options

| Option | Default | Range | Description |
|--------|---------|-------|-------------|
| TAG | `<em>` / `</em>` | — | Open and close tags wrapping matched terms |
| SNIPPET_LEN | 100 | 1–10,000 | Max code points per snippet fragment |
| MAX_FRAGMENTS | 3 | 1–100 | Max fragments joined by ellipsis (...) |

### Examples

Default highlighting:
```mygram
SEARCH articles "machine learning" HIGHLIGHT LIMIT 10
```

Custom tags:
```mygram
SEARCH articles "golang" HIGHLIGHT TAG <strong> </strong> LIMIT 10
```

Longer snippets with more fragments:
```mygram
SEARCH articles "database" HIGHLIGHT SNIPPET_LEN 200 MAX_FRAGMENTS 5 LIMIT 10
```

### Requirements

Highlighting requires `verify_text` to be set to `"ascii"` or `"all"` in configuration.

### Combining with Other Clauses

```mygram
SEARCH articles "tech" HIGHLIGHT TAG <b> </b> SORT _score DESC FILTER status = 1 LIMIT 10
```

---

## Fuzzy Search (FUZZY)

Match terms within a specified Levenshtein edit distance (insertions, deletions, substitutions).

::: info What is Levenshtein edit distance?
**Levenshtein edit distance** is the number of insertions, deletions, and substitutions needed to turn one string into another. `FUZZY 1` tolerates about one typo; `FUZZY 2` allows a somewhat wider candidate set.
:::

### Syntax

```mygram
SEARCH <table> <query> FUZZY [distance]
```

### Parameters

- **distance** (optional): `1` (default) or `2`
  - `1`: Match terms within 1 edit operation
  - `2`: Match terms within 2 edit operations

### Examples

```mygram
SEARCH articles "machne" FUZZY LIMIT 10
SEARCH articles "databse" FUZZY 2 LIMIT 10
```

### Performance

Fuzzy search pre-filters candidates by length difference to avoid unnecessary distance computations. Use `FUZZY 1` (default) for best performance.

`FUZZY` accepts only `1` or `2`. Other distance values return an explicit query error.

---

## Error Handling

### Invalid Queries

The following will return errors:

**Empty parentheses:**
```mygram
SEARCH threads ()
ERROR Invalid query: empty expression in parentheses
```

**Unclosed parentheses:**
```mygram
SEARCH threads (golang AND python
ERROR Invalid query: unclosed parentheses
```

**Extra closing parentheses:**
```mygram
SEARCH threads golang AND python)
ERROR Invalid query: unexpected closing parenthesis
```

**Operator without operands:**
```mygram
SEARCH threads AND
ERROR Invalid query: operator without operands
```

**Trailing operator:**
```mygram
SEARCH threads golang AND
ERROR Invalid query: trailing operator
```

**Unclosed quotes:**
```mygram
SEARCH threads "golang tutorial
ERROR Invalid query: unclosed quote
```

### Invalid Filters

**Non-existent table:**
```mygram
SEARCH nonexistent tech
ERROR Table not found: nonexistent
```

**Invalid filter column:**
```mygram
SEARCH articles tech FILTER invalid_column=1
ERROR Filter column not found: invalid_column
```

### Invalid Sorting

**Non-existent column:**
```mygram
SEARCH articles tech SORT nonexistent DESC
ERROR Sort column 'nonexistent' not found. Column does not exist as filter column or primary key. Check column name spelling.
```

Non-existent columns are rejected with an error.

---

## Performance Tips

Each `SEARCH` runs through a fixed pipeline: the query is parsed to an AST, n-gram lookup produces candidate documents, then AND/NOT/FILTER narrow that candidate set in sequence before SORT and LIMIT/OFFSET produce the final page. The tips below each target one stage of this pipeline, and the DEBUG command reports timing per stage using these same names.

<DocDiagram name="query-pipeline" alt="A query is parsed to an AST, n-gram lookup produces candidates, AND intersection, NOT exclusion, and FILTER application shrink the candidate set in that order, then SORT uses partial sort only when LIMIT plus OFFSET is less than half of the result set. OFFSET and LIMIT are applied last before results are returned." />

### 1. Place Restrictive Terms First

```mygram
-- Good: Specific term first
SEARCH articles "machine learning" AND tutorial

-- Less optimal: Generic term first
SEARCH articles tutorial AND "machine learning"
```

### 2. Use Parentheses for Clarity

```mygram
-- Explicit and readable
SEARCH threads (golang OR python) AND (web OR api)

-- Harder to understand
SEARCH threads golang OR python AND web OR api
```

### 3. Avoid Leading NOT Operators

```mygram
-- Good: Positive term first
SEARCH articles tech NOT old

-- Less optimal: Leading NOT
SEARCH articles NOT old
```

Leading NOT requires scanning all documents before exclusion.

### 4. Combine Filters and Text Search

```mygram
-- Good: Filter narrows results early
SEARCH articles tech FILTER category = ai FILTER status = 1

-- Works but less efficient
SEARCH articles tech AND ai AND published
```

Filters on indexed columns are faster than text search on those terms.

### 5. Always Use LIMIT for Large Result Sets

```mygram
-- Good: can use partial sort when the limit is small relative to the result set
SEARCH articles tech SORT created_at DESC LIMIT 10

-- Slower: Full sort of all results
SEARCH articles tech SORT created_at DESC
```

### 6. Minimize Deep Pagination

```mygram
-- Efficient
SEARCH articles tech LIMIT 10 OFFSET 0

-- Less efficient (large OFFSET)
SEARCH articles tech LIMIT 10 OFFSET 10000
```

Consider alternative pagination strategies for deep results (e.g., cursor-based).

---

## COUNT Command

All boolean query syntax works with `COUNT` as well:

```mygram
COUNT <table> <query_expression> [FILTER ...]
```

Examples:
```mygram
COUNT threads (golang OR python) AND tutorial
COUNT articles tech FILTER status = 1 FILTER category = ai
COUNT posts database AND (mysql OR postgresql) NOT sqlite
```

**Note:** COUNT does not support SORT, LIMIT, or OFFSET (not needed for counting).

---

## Implementation Details

### Grammar (BNF)

Queries are parsed into an Abstract Syntax Tree (AST) with proper operator precedence:

```bnf
query     → or_expr
or_expr   → and_expr (OR and_expr)*
and_expr  → not_expr (AND not_expr)*
not_expr  → NOT not_expr | primary
primary   → TERM | '(' or_expr ')'
```

### Performance Characteristics

- **AND operations**: Efficient intersection using sorted posting lists
- **OR operations**: Efficient union using set operations
- **NOT operations**: Complement against all documents (potentially expensive)
- **Parentheses**: No performance overhead; only affects parsing

### N-gram Tokenization

MygramDB uses n-gram tokenization for indexing and search:

- **Default n-gram size**: 2 (bigrams) - configurable per table
- **CJK text**: Separate n-gram size for kanji/kana (configurable)
- **Unicode normalization**: NFKC normalization, width conversion, optional lowercasing

Terms shorter than the configured n-gram size need stored normalized text. Set `memory.verify_text: "ascii"` or `"all"`; otherwise the server rejects that query instead of returning an incomplete result.

---

## Snapshot Synchronization Commands

### SYNC Command

Manually trigger snapshot synchronization from MySQL to MygramDB.

**Syntax:**
```mygram
SYNC <table_name>
```

**Example:**
```mygram
SYNC articles
```

**Response:**
```mygram
OK SYNC STARTED table=articles
```

**See [SYNC Command Guide](/docs/sync-command) for detailed usage.**

### SYNC STATUS Command

Check the progress and status of SYNC operations.

**Syntax:**
```mygram
SYNC STATUS
```

**Response Examples:**
```mygram
table=articles status=IN_PROGRESS progress=10000/25000 rows (40.0%) rate=5000 rows/s
table=articles status=COMPLETED rows=25000 time=5.2s gtid=uuid:123 replication=STARTED
status=IDLE message="No sync operation performed"
```

**See [SYNC Command Guide](/docs/sync-command) for detailed field descriptions.**

---

## See Also

- [Query Guide](/docs/queries) - Practical search examples
- [SYNC Command Guide](/docs/sync-command) - Manual snapshot synchronization
- [Protocol Reference](/docs/protocol) - All commands and protocol details
- [Configuration Guide](/docs/configuration) - Configure filters, n-gram sizes, and limits
- [Performance Tuning](/docs/performance) - Advanced optimization techniques
