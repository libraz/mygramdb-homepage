---
title: How MygramDB Works - N-gram Indexing and Search Pipeline
description: Technical overview of MygramDB internals. N-gram tokenization, posting list compression with Roaring bitmaps, search pipeline, verify_text post-filter, and n-gram-level cache invalidation.
head:
  - - meta
    - name: keywords
      content: n-gram indexing, posting list compression, Roaring bitmap, full-text search pipeline, cache invalidation, verify_text, MygramDB internals
---

# How It Works

::: info Reading this the first time
This page describes internals. On a first pass, three steps are enough: split text into n-grams, find candidate documents from those n-grams, and — if configured — verify candidates against the original text.
:::

MygramDB is an in-memory full-text search engine built around n-gram indexing. This page covers the core mechanisms: how text is indexed, how searches execute, and how the cache stays consistent.

## N-gram Indexing

MygramDB tokenizes text into overlapping character sequences called n-grams. By default, it uses **bi-grams (2 characters)** for both ASCII text and CJK ideographs. Set `kanji_ngram_size` to use a different size for CJK ideographs.

::: info What is tokenization?
**Tokenization** splits text into smaller units that can be indexed and searched. MygramDB uses no dictionary — it treats the character sequences themselves as n-grams, which is why it works the same across languages.
:::

For example, the word `search` produces these bi-grams:

```
"search" → ["se", "ea", "ar", "rc", "ch"]
```

A multibyte string like `東京都` produces bi-grams with the default settings:

```
"東京都" → ["東京", "京都"]
```

Each n-gram maps to a **posting list** -- a sorted list of document IDs containing that n-gram. When a document is inserted, its text is tokenized and the document ID is added to each n-gram's posting list.

<DocDiagram name="ngram-index" alt="The term “search” is split into the bi-grams se, ea, ar, rc and ch, each mapping to a sorted posting list of DocIDs; documents 1 and 42 appear in every list and survive the intersection." />

Document IDs are `uint32_t`, supporting up to 4 billion documents per table.

## Posting List Compression

Not all n-grams appear with the same frequency. MygramDB uses two storage strategies and automatically switches between them based on density:

| Strategy | When Used | Representation |
|----------|-----------|----------------|
| **Delta encoding** | Sparse terms (density < 18%) | Sorted IDs stored as fixed-width deltas |
| **Roaring bitmap** | Dense terms (density >= 18%) | Compressed bitmap via CRoaring library |

**Density** is defined as: `(number of documents containing the n-gram) / (total documents in table)`.

The 18% threshold includes **0.5x hysteresis** to avoid thrashing. A posting list that switched to Roaring at 18% density will only switch back to delta encoding when density drops below 9%.

::: info What is hysteresis?
**Hysteresis** means the threshold for switching back differs from the threshold for switching over, so a value hovering near the boundary does not flip state repeatedly. Here, converting at 18% but reverting only below 9% keeps the encoding stable as documents are added and removed.
:::

Delta encoding is compact for rare terms: it stores `[100, 105, 200]` as `[100, 5, 95]`. Roaring bitmaps are more efficient for common terms and enable SIMD-accelerated set operations (intersection, union) during search.

## Search Pipeline

A search query flows through a series of stages:

<DocDiagram name="search-pipeline" alt="Ten pipeline stages: client query, parse, generate n-grams, intersect posting lists, NOT filter, column filters, verify_text post-filter, sort, OFFSET and LIMIT, return DocIDs." />

**Step by step:**

1. **Parse query** -- Extract search terms, NOT terms, filter conditions, sort order, and pagination from the query.

2. **Generate n-grams** -- Each search term is normalized (Unicode NFKC via ICU) and tokenized into n-grams. Terms are sorted by estimated result size (smallest posting list first) to minimize intermediate result sets.

3. **Intersect posting lists** -- For each term, all of its n-gram posting lists are intersected (AND semantics). Then the per-term results are intersected across terms. Starting with the smallest set makes each subsequent intersection cheaper.

4. **NOT filter** -- Documents matching NOT terms are removed from the candidate set.

5. **Column filters** -- Filter conditions (e.g., `category = 'science'`) are evaluated. When the candidate set is small, filters are applied per-document. When the filter is highly selective, a bitmap fast path intersects the filter bitmap directly.

6. **verify_text** -- Optional post-filter that checks candidates against the original document text to eliminate false positives (see below).

7. **Sort and paginate** -- Results are sorted by the requested column and sliced to the requested OFFSET/LIMIT.

The pipeline avoids repeating work where the same term appears in several boolean branches. One deduplicated term-information lookup is shared by boolean evaluation, NOT filtering, synonym expansion, and verification. A full document-ID scan is only needed when the expression contains NOT.

Text-heavy stages also have a fixed memory boundary. Candidate text is copied from the DocumentStore in bounded chunks, then the store lock is released before BM25 scoring, term-frequency counting, and text post-filters run. A large candidate set therefore does not require copying a large fraction of the corpus or holding the store lock throughout scoring.

## verify_text Post-Filter

N-gram indexing is inherently approximate. A query for `"quantum"` generates bi-grams `["qu", "ua", "an", "nt", "tu", "um"]`. Any document containing all six bi-grams is a candidate -- but some candidates are false positives:

::: info What is a false positive?
A **false positive** is a document that survived the n-gram intersection but does not actually contain the search term. N-gram search deliberately collects a slightly wider candidate set for speed, then narrows it with `verify_text` when exactness matters.
:::

<DocDiagram name="verify-text" alt="verify_text checks candidate documents from n-gram intersection against stored normalized text and removes false positives before results are returned." />

| Document text | Contains all bi-grams? | Actually contains "quantum"? |
|---------------|----------------------|----------------------------|
| "quantum mechanics" | Yes | Yes |
| "quantify antum" | Yes (`qu`, `ua`, `an`, `nt`, `tu` from "quantify"; `an`, `nt`, `tu`, `um` from "antum") | No |

Without verification, the query `"quantum"` returns approximately 58,000 candidates on 1.1M Wikipedia articles. With `verify_text: all`, it returns exactly 1,961 -- matching MySQL FULLTEXT results precisely.

**How it works:** When `verify_text` is enabled, MygramDB stores the original document text in memory. After the posting list intersection produces candidates, each candidate's stored text is checked for an actual substring match. False positives are discarded.

The tradeoff is memory: storing text for 1.1M documents adds approximately 1.8 GB of RAM. Three modes are available:

- `off` (default) -- No text storage, no verification. Fastest, lowest memory.
- `ascii` -- Verifies only ASCII-only queries against stored text. Moderate memory.
- `all` -- All candidates are verified. Exact results.

::: tip Choosing a verify_text mode
Use `verify_text: all` when exact matching, highlighting, or BM25 `_score` matters. Choose `off` when minimizing memory use matters more than eliminating n-gram false positives.
:::

## Cache and Invalidation

MygramDB caches search results at the query level. Its invalidation metadata records the dependencies of each entry, so a row change can remove affected entries without flushing a whole table.

::: tip What is cache invalidation?
**Invalidation** is discarding cached results when the underlying data changes, so a stale answer is never served. MygramDB looks at which n-grams a changed row touches and drops only the cached queries that involve them.
:::

When a document is inserted, updated, or deleted via binlog replication:

1. The changed document's text is tokenized into n-grams.
2. Entries whose n-gram sets overlap with the change are invalidated. Entries with filters are also found directly when a filter column changes, and text-sensitive entries, such as NOT queries, are found directly when text changes.
3. Unrelated queries remain cached.

<DocDiagram name="cache-invalidation" alt="A changed row is tokenized into the n-grams qu, ua and an; the reverse index maps them to the cached “quantum” query, which is evicted, while the “algorithm” and “database” entries are kept." />

- 🔴 `quantum` — overlapping n-grams, invalidated
- 🟢 `algorithm`, `database` — unaffected, cache retained

In practice, this means a single row update only invalidates queries that could be affected by the change. On a table with millions of cached queries, an update might invalidate a handful rather than flushing the entire cache.

The invalidation manager keeps reverse indexes for n-grams, filtered entries, and text-sensitive entries. Each trigger visits only the entries it can affect rather than scanning the entire cache. Cache maintenance follows the same rule: each tick examines a bounded, resumable slice of the LRU list, so expiry and recency work do not take one long exclusive sweep across every entry.

---

For benchmark results, see [Benchmarks](/benchmarks). For architectural details, see [Architecture](/docs/architecture).
