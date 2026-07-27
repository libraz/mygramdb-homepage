---
title: MygramDB Performance Guide - Benchmarks and Tuning
description: MygramDB performance benchmarks vs MySQL FULLTEXT, optimization tips, memory sizing, and tuning.
head:
  - - meta
    - name: keywords
      content: MygramDB performance, MySQL FULLTEXT benchmark, search latency, COUNT performance, concurrent throughput, OPTIMIZE, memory sizing, roaring bitmap
---

# Performance Guide

This guide provides detailed performance benchmarks, optimization tips, and best practices for MygramDB.

## Benchmark Results

The benchmark tables, charts, environment, and measured memory use are rendered from the same result snapshot as the [benchmark page](/benchmarks). The snapshot uses `verify_text: all` with the MygramDB query cache disabled.

<BenchmarkResults />

## Performance Analysis

### Why MySQL is Slow

1. **Disk-based B-tree**: FULLTEXT index requires disk I/O for each query
2. **No compression**: Posting lists are not compressed, requiring more disk reads
3. **ORDER BY overhead**: Sorting requires additional processing and I/O
4. **High-frequency terms**: Short, common terms result in large posting list scans
5. **Concurrency bottleneck**: Under concurrent load, disk I/O serialization causes request queuing

### Why MygramDB is Fast

1. **In-memory index**: Zero disk I/O, all data in RAM
2. **Compressed posting lists**: Hybrid Delta encoding + Roaring bitmaps
3. **Optimized intersections**: SIMD-accelerated bitmap operations
4. **Sorting**: `SORT` validates the primary key and configured filter columns before ordering results
5. **verify_text**: Post-filter eliminates false positives without sacrificing speed
6. **No cache warmup**: Always ready, consistent performance

## Performance Characteristics

### Query Time Complexity

| Operation | MySQL FULLTEXT | MygramDB |
|-----------|----------------|----------|
| Single term search | O(n log n) with disk I/O | O(n) in memory |
| AND intersection | O(n * m) with disk I/O | O(n + m) with SIMD |
| Sort by id | Comparison sort | Comparison sort (partial or full, depending on result count) |
| COUNT | Full scan | Bitmap cardinality |

### Scalability

**MygramDB scales linearly with:**
- Number of search terms (efficient bitmap intersection)
- Result set size (compressed bitmaps)
- Concurrent queries (thread pool architecture)

**MygramDB does NOT scale with:**
- Dataset size beyond available RAM (in-memory only)

## Optimization Tips

### 1. Choose Appropriate ngram_size

```yaml
tables:
  - name: "articles"
    ngram_size: 2          # ASCII/alphanumeric: bigram (recommended)
    kanji_ngram_size: 1    # CJK characters: unigram (recommended)
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

With `verify_text=all`, MygramDB verifies every candidate against the original text. The benchmark snapshot records matching counts with MySQL FULLTEXT; see the rendered results above for the measured latency.

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

**Fast queries:**
- `SEARCH table term SORT id LIMIT 100` - Sorts by the primary key
- `COUNT table term` - Bitmap cardinality operation
- `SEARCH table term1 AND term2` - Efficient bitmap intersection

**Slower queries:**
- `SEARCH table term LIMIT 100` without `SORT` - Still fast, but may scan more
- Very high LIMIT values (>1000) - More IDs to return

### 6. Use OPTIMIZE Command

Run periodically to optimize posting list storage:

```mygram
OPTIMIZE
```

This converts Delta-encoded lists to Roaring bitmaps based on density, reducing memory usage by 10-30%.

## Production Deployment Recommendations

### 1. Memory Sizing

**Rule of thumb:** Plan for 1-2GB RAM per million documents

**Example sizing:**
- 1M documents: 2GB RAM minimum, 4GB recommended
- 10M documents: 16GB RAM minimum, 32GB recommended
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
- `doc_count`: Number of indexed documents
- `index_size`: Memory used by index
- `total_requests`: Total queries processed
- `connections`: Current active connections
- `uptime`: Server uptime in seconds

### 4. Backup Strategy

Use `DUMP SAVE` command to create snapshots:

```mygram
DUMP SAVE /path/to/snapshot.dmp
```

Schedule regular snapshots:
```bash
# Daily snapshot
0 2 * * * echo "DUMP SAVE /backup/mygramdb-$(date +\%Y\%m\%d).dmp" | mygram-cli
```

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
   Look at `index_size` and process RSS; `hard_limit_mb` is reserved and does
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
   Converts dense posting lists to Roaring bitmaps (10-30% reduction).

2. **Adjust roaring_threshold:**
   ```yaml
   memory:
     roaring_threshold: 0.15  # Lower = more aggressive compression
   ```

3. **Consider sharding:** Split data across multiple MygramDB instances.

## Comparison with Alternatives

### vs MySQL FULLTEXT

**MygramDB advantages:**

- Cache-off measurements are maintained in the benchmark snapshot above
- Exact result consistency with `verify_text` (zero false positives)
- Consistent performance regardless of cache state
- The published concurrent measurements cover 1 and 4 connections

**MySQL advantages:**

- No separate infrastructure
- Works with existing MySQL data
- Lower memory requirements

### vs Elasticsearch

**MygramDB advantages:**
- Simpler deployment (single binary)
- Lower operational complexity
- Direct MySQL replication (no ETL)
- Lower latency for simple queries

**Elasticsearch advantages:**
- Distributed search across nodes
- Advanced analytics and aggregations
- Full-text features (highlighting, fuzzy search)
- Not limited by single-node RAM

## Benchmarking Your Own Data

The benchmark suite is reproducible. To run the same benchmark on your hardware:

```bash
# Run the included benchmark (requires Docker)
make bench-up    # Start MySQL with Wikipedia dataset
make bench-run   # Execute benchmark suite
```

To benchmark with your own data:

```bash
# 1. Start MygramDB with your MySQL
./mygramdb -c config.yaml

# 2. Wait for initial indexing
# Check logs for "Indexed N rows"

# 3. Enable debug mode
echo "DEBUG ON" | mygram-cli

# 4. Run test queries
echo "SEARCH table common_term LIMIT 100" | mygram-cli
echo "COUNT table common_term" | mygram-cli

# 5. Compare with MySQL
mysql -e "SELECT COUNT(*) FROM table WHERE MATCH(column) AGAINST('common_term')"
mysql -e "SELECT id FROM table WHERE MATCH(column) AGAINST('common_term') ORDER BY id LIMIT 100"
```

## Conclusion

The measured difference depends on the query, data, hardware, and cache configuration. The cache-off snapshot above is the canonical source for its latency, memory, and concurrent-throughput values.

With `verify_text: all`, MygramDB removes n-gram false positives and returned matching counts with MySQL FULLTEXT in this run. CJK queries with few matches can narrow the gap because MySQL may finish quickly.

For read-heavy workloads with millions of documents, evaluate the included benchmark on your own data with `make bench-up && make bench-run`.
