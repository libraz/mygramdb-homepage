---
title: MygramDB Performance Guide - Benchmarks and Tuning
description: MygramDB performance benchmarks vs MySQL FULLTEXT, optimization tips, memory sizing, and tuning.
head:
  - - meta
    - name: keywords
      content: MygramDB performance, MySQL FULLTEXT benchmark, search latency, COUNT performance, concurrent throughput, OPTIMIZE, memory sizing, roaring bitmap
---

<script setup>
import { VERIFY_ALL_PER_MILLION_GB } from '../data/memory'
</script>

# Performance Guide

This guide provides detailed performance benchmarks, optimization tips, and best practices for MygramDB.

## Benchmark Results

The benchmark tables, charts, environment, and measured memory use are rendered from the same result snapshot as the [benchmark page](/benchmarks). The snapshot uses `verify_text: all` with the MygramDB query cache disabled.

<BenchmarkResults />

## Performance Analysis

The published MySQL run had a 99.9989% InnoDB buffer-pool hit ratio, so its measured latency cannot be explained as a physical disk read on every query. MygramDB keeps its search index in memory and uses Delta-encoded or Roaring posting lists according to density. The measured difference depends on the query, data, sorting, memory, and concurrency; see the benchmark conditions above before applying these results to another deployment.

## Performance Characteristics

### Current Execution Paths

Several details keep large queries and busy caches from turning into a broad scan or a long lock hold:

- Candidate filtering walks a posting list and the sorted candidate list once, so its work is proportional to the candidates and postings it visits.
- Candidate text is materialized in bounded chunks. The DocumentStore lock is released before BM25 scoring, term-frequency counting, and text post-filters.
- A deduplicated term-information lookup is reused across boolean evaluation, NOT filtering, synonym expansion, and verification. Expressions without NOT skip the full document-ID scan.
- Filter column names are interned once per store, and per-document values use compact vectors keyed by the interned IDs.
- Cache invalidation has separate reverse indexes for n-gram, filter, and text-sensitive dependencies. LRU maintenance resumes from a bounded slice on each tick instead of sweeping the full cache under one exclusive lock.
- Per-table statistics are aggregated into a bounded snapshot for `INFO`, `/metrics`, and Prometheus, rather than locking every table while formatting each scrape.

## Optimization Tips

### 1. Choose Appropriate ngram_size

```yaml
tables:
  - name: "articles"
    ngram_size: 2          # ASCII/alphanumeric, kana, and other non-ideographs: bigram
    kanji_ngram_size: 1    # CJK ideographs: unigram (recommended)
```

**Recommendations:**
- **Bigram (2)** for ASCII/English: Good balance of precision and index size
- **Unigram (1)** for CJK: Each character is meaningful
- **Trigram (3)**: More precise but larger index and slower queries

### 2. Enable verify_text

```yaml
memory:
  verify_text: "all"     # Eliminate n-gram false positives
```

With `verify_text=all`, MygramDB verifies every candidate against stored normalized text. The benchmark snapshot records matching counts with MySQL FULLTEXT; see the rendered results above for the measured latency.

### 3. Memory Configuration

```yaml
memory:
  hard_limit_mb: 16384      # Reserved / not yet enforced
  soft_target_mb: 8192      # Reserved / not yet enforced
  roaring_threshold: 0.18   # Delta→Roaring conversion threshold
```

**Recommendations:**
- Treat `hard_limit_mb` and `soft_target_mb` as reserved compatibility
  fields; they do not enforce process memory limits today

::: warning Enforce memory limits at the OS level
`hard_limit_mb` is not a hard process memory cap today. When running under Docker, systemd, or Kubernetes, set the container or service memory limit as well, and monitor it.
:::
- Leave `roaring_threshold` at default (0.18) unless memory is tight

### 4. Use Filters for Selective Queries

```yaml
tables:
  - name: "articles"
    filters:
      - name: "status"
        type: "int"
      - name: "category_id"
        type: "int"
```

Filter early to reduce result set:
```mygram
SEARCH articles tech FILTER status=1 FILTER category_id=5 LIMIT 100
```

### 5. Optimize Query Patterns

`SEARCH table term SORT id LIMIT 100` sorts by an `id` primary key when that is the configured key. `SEARCH table term1 AND term2` intersects candidates from both terms. `COUNT table term` returns a count without a page of IDs, but still runs the search pipeline, including text verification when enabled. A large `LIMIT` returns more IDs and can increase response work. Measure these patterns with your own data rather than assuming a fixed speed ranking.

### 6. Use OPTIMIZE Command

Run periodically to optimize posting list storage:

```mygram
OPTIMIZE
```

This can convert dense Delta-encoded posting lists to Roaring bitmaps. The memory change depends on the data. Allow roughly 2.1 times the index size as free memory before running `OPTIMIZE`; the command rejects a run when its admission estimate exceeds available memory.

## Production Deployment Recommendations

### 1. Memory Sizing

**Sizing reference:** The [published v1.10.0 benchmark](/benchmarks) used ~{{ VERIFY_ALL_PER_MILLION_GB }}GB of resident memory per million documents with `verify_text: all`. Current builds also retain normalized text with `verify_text: off` for highlighting, so that setting is not an index-only memory mode. Measure RSS with your dataset and add headroom.

**Example sizing (`verify_text: all`):**
- 1M documents: 4GB RAM minimum, 8GB recommended
- 10M documents: 32GB RAM minimum, 48GB recommended
- 100M documents: Consider sharding across multiple instances

### 2. High Availability Setup

Deploy multiple MygramDB instances behind a load balancer:

<DocDiagram name="ha-topology" alt="One MySQL primary replicates its binlog to three independent MygramDB nodes with distinct server_ids; a load balancer gated on /health/ready distributes application search traffic across them." />

### 3. Monitoring

Monitor these metrics via `INFO` command:

```mygram
INFO
```

Key metrics:
- `total_documents`: Number of indexed documents
- `used_memory_index`: Memory used by index (human-readable)
- `total_requests`: Total queries processed
- `connected_clients`: Current active connections
- `uptime_seconds`: Server uptime in seconds

### 4. Backup Strategy

Use `DUMP SAVE` command to create snapshots:

```mygram
DUMP SAVE snapshot.dmp
```

Schedule regular snapshots:
```bash
# Daily snapshot
0 2 * * * dump_date=$(date +\%Y\%m\%d); printf 'AUTH \%s\nDUMP SAVE mygramdb-\%s.dmp\n' "$MYGRAM_API_ADMIN_TOKEN" "$dump_date" | mygram-cli
```

These filenames resolve under `dump.dir`; paths outside it are refused. The cron example keeps `AUTH` and `DUMP SAVE` on one connection. `AUTH` is unnecessary only when `api.admin_token` is empty; configure a token for non-loopback deployments.

## Troubleshooting

### Query is Slower Than Expected

1. **Check if index is optimized:**
   ```mygram
   OPTIMIZE
   ```

2. **Verify memory usage:**
   ```mygram
   INFO
   ```
   Look at `used_memory_index` and process RSS; `hard_limit_mb` is reserved and does
   not enforce a process memory limit today.

3. **Enable debug mode:**
   ```mygram
   DEBUG ON
   SEARCH table term LIMIT 100
   ```
   Review `query_time`, `index_time`, and `optimization` fields.

### High Memory Usage

1. **Run OPTIMIZE:**
   ```mygram
   OPTIMIZE
   ```
   Can convert dense posting lists to Roaring bitmaps. Check available memory first: `OPTIMIZE` needs roughly 2.1 times the index size free during rebuilding.

2. **Adjust roaring_threshold:**
   ```yaml
   memory:
     roaring_threshold: 0.15  # Lower = more aggressive compression
   ```

3. **Consider application-managed sharding:** Partition source data, run separate MygramDB instances for the partitions, and route or combine queries in the application. MygramDB does not shard automatically.

## Comparison with Alternatives

### vs MySQL FULLTEXT

**MygramDB advantages:**

- Cache-off measurements are maintained in the benchmark snapshot above
- Exact result consistency with `verify_text` (zero false positives)
- Search-index access does not depend on the MySQL buffer pool; MygramDB's own query-cache hits can still change latency
- The published concurrent measurements cover 1, 2, 4, 8 and 16 connections

**MySQL advantages:**

- No separate infrastructure
- Works with existing MySQL data

### vs Elasticsearch

**MygramDB advantages:**
- Simpler deployment (single binary)
- Lower operational complexity
- Direct MySQL replication (no ETL)

**Elasticsearch advantages:**
- Distributed search across nodes
- Advanced analytics and aggregations
- A broader distributed search and analytics ecosystem
- Not limited by single-node RAM

## Benchmarking Your Own Data

The benchmark suite is reproducible. To run the same benchmark on your hardware:

```bash
# Run the included benchmark (requires Docker)
make bench-up    # Start MySQL with Wikipedia dataset
make bench-run   # Execute benchmark suite
```

To benchmark with your own data, start the server:

```bash
./mygramdb -c config.yaml
```

With automatic snapshots disabled, use the same authenticated CLI connection to start the sync, check its status, enable debugging, and run the test queries:

```text
$ mygram-cli
127.0.0.1:11016> AUTH <token>
OK AUTHENTICATED
127.0.0.1:11016> SYNC table
127.0.0.1:11016> SYNC STATUS
127.0.0.1:11016> DEBUG ON
127.0.0.1:11016> SEARCH table common_term LIMIT 100
127.0.0.1:11016> COUNT table common_term
```

Compare the results with MySQL:

```bash
mysql -e "SELECT COUNT(*) FROM table WHERE MATCH(column) AGAINST('common_term')"
mysql -e "SELECT id FROM table WHERE MATCH(column) AGAINST('common_term') ORDER BY id LIMIT 100"
```

## Conclusion

The measured difference depends on the query, data, hardware, and cache configuration. The cache-off snapshot above is the canonical source for its latency, memory, and concurrent-throughput values.

With `verify_text: all`, MygramDB removes n-gram false positives and returned matching counts with MySQL FULLTEXT in this run. CJK queries with few matches can narrow the gap because MySQL may finish quickly.

For read-heavy workloads with millions of documents, evaluate the included benchmark on your own data with `make bench-up && make bench-run`.
