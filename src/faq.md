---
title: FAQ - MygramDB
description: Frequently asked questions about MygramDB. Architecture, benchmarks, N-gram indexing, Roaring bitmaps, MySQL replication, and comparisons with Elasticsearch.
---

# Frequently Asked Questions

## MySQL FULLTEXT Problems

### Why is my MySQL FULLTEXT search so slow?

Disk I/O, uncompressed posting lists, cache dependency, and concurrency collapse. See [Why MySQL FULLTEXT is Slow](/why) for a detailed breakdown.

**Solution**: MygramDB keeps everything in memory, delivering consistent sub-millisecond latency. See [Benchmarks](/benchmarks) for numbers.

### My MySQL FULLTEXT queries keep timing out under load. How do I fix it?

Add MygramDB as a search replica. In benchmarks on 1.1M Wikipedia articles, MygramDB delivers 2,634-11,766 QPS under concurrent load, while MySQL FULLTEXT drops to 2-8 QPS.

### Is there a way to speed up MySQL FULLTEXT without changing my application?

Yes. MygramDB syncs with MySQL via binlog replication. Your application continues writing to MySQL normally — just route search queries to MygramDB. See [Quick Start](/) for setup.

## Alternatives

### Should I use Elasticsearch instead of MygramDB?

See [Comparison](/comparison) for a detailed breakdown. In short: choose MygramDB if your data fits in RAM and you want simple MySQL integration. Choose Elasticsearch if you need distributed search, fuzzy matching, or petabyte-scale data.

### How does MygramDB compare to Meilisearch or Typesense?

Meilisearch and Typesense are general-purpose search engines with typo tolerance, faceting, and built-in UIs. MygramDB solves a different problem: it acts as an in-memory search replica that syncs directly from MySQL via binlog. If your data already lives in MySQL and you need fast full-text search without an ETL pipeline, MygramDB is simpler to deploy and operate. If you need a standalone search platform with its own data ingestion, Meilisearch or Typesense may be a better fit.

### How does MygramDB compare to RediSearch?

Both are in-memory full-text search engines, but the architecture is fundamentally different.

| | MygramDB | RediSearch |
|---|---|---|
| **Data sync** | Automatic via MySQL binlog | Push-based (FT.ADD) — you build the ETL |
| **Dependency** | MySQL | Redis (Redis Stack) |
| **Deployment** | Single binary | Redis module |
| **Features** | Exact N-gram search | Fuzzy, highlighting, aggregations, geo |
| **License** | MIT | RSALv2 / SSPL (commercial restrictions) |

The key difference is data flow. RediSearch requires you to push documents into Redis, meaning you need an ETL pipeline between MySQL and Redis. MygramDB eliminates that — it reads the MySQL binlog directly and keeps itself in sync. If your data is in MySQL and you want search without building a sync pipeline, MygramDB is simpler. If you already run Redis and need richer query features, RediSearch may be worth the integration cost.

## Features and Limitations

### How much memory does MygramDB need?

Depends on `verify_text` mode. With `verify_text: off` (default): **~813MB per million documents** (index only). With `verify_text: all` (text verification enabled): **~2.3GB per million documents** (includes stored normalized text for post-filtering). For 10M documents, plan for ~8GB (`off`) or ~23GB (`all`).

### Does MygramDB support Japanese/Chinese/Korean text?

Yes. MygramDB uses ICU-based Unicode normalization with N-gram tokenization. CJK text works out of the box without additional plugins.

### Does MygramDB support fuzzy search or typo tolerance?

No. MygramDB uses exact N-gram matching. Fuzzy search requires edit distance computation at query time, which adds latency. For the use case MygramDB targets — fast exact search over structured MySQL data — typo tolerance is typically handled at the application layer (e.g., suggesting corrections before querying).

### Does MygramDB support search result highlighting?

No. MygramDB returns document IDs (and optionally stored columns), not highlighted snippets. Position tracking in posting lists would add storage overhead and indexing cost. Highlighting is best done at the application layer by retrieving the full document from MySQL and marking matches there.

### Can MygramDB scale horizontally?

Not built-in. MygramDB is single-node by design. For datasets exceeding single-node RAM:

- Deploy multiple MygramDB instances behind a load balancer
- Each instance replicates from the same MySQL primary (full replica)
- For true sharding, partition tables by ID range and route queries at the application layer

For most use cases (up to ~50M documents on a 64-128GB server), a single node is sufficient.

### Can I search across multiple tables?

No. Each query targets a single table: `SEARCH articles hello world`. MygramDB supports configuring multiple tables, but each has its own independent index and document store. Cross-table search would need to be handled at the application layer with separate queries.

### Does MygramDB support PostgreSQL?

No. MygramDB relies on MySQL's binary log replication protocol, which is MySQL-specific. PostgreSQL uses a different mechanism (logical replication with WAL). There are no current plans for PostgreSQL support.

### Does MygramDB work with MariaDB?

No. MariaDB uses domain-based GTIDs, which are incompatible with MySQL's UUID-based GTIDs. MygramDB's binlog parser is built for MySQL's GTID format. MariaDB support would require a separate GTID implementation.

## Indexing and Search

### Why N-gram instead of morphological analysis?

N-gram tokenization is language-agnostic. Morphological analyzers (MeCab, kuromoji, jieba) require dictionaries, language detection, and version management. N-gram works uniformly across English, Japanese, Chinese, Korean, and mixed-language content.

MygramDB uses a hybrid approach: bigrams (size 2) for ASCII/alphanumeric text and unigrams (size 1) for CJK characters. Both sizes are configurable per table via `ngram_size` and `kanji_ngram_size`.

### How are Roaring bitmaps used?

Posting lists use a hybrid storage strategy based on density:

- **Sparse postings** (below 18% of total documents): Delta-encoded arrays. DocIDs are stored as deltas from the previous value, reducing 4-byte integers to 1-2 bytes each.
- **Dense postings** (18% or above): Roaring bitmaps via CRoaring. Roaring automatically selects the best container type (array, bitmap, or run-length) per 65,536-ID chunk.

The threshold is configurable (`roaring_threshold`). A hysteresis factor (0.5x) prevents oscillation between formats.

### What does "SIMD-accelerated" mean in practice?

MygramDB links against [CRoaring](https://github.com/RoaringBitmap/CRoaring), which uses SIMD instructions internally for bitmap operations (AND, OR, cardinality). On x86-64, CRoaring uses AVX2 when available; on ARM, it uses NEON. MygramDB does not contain custom SIMD code — the acceleration comes from the bitmap library.

### How does compression achieve 60-80% reduction?

The baseline is uncompressed uint32 arrays (4 bytes per DocID). Two mechanisms reduce this:

1. **Delta encoding**: Monotonically increasing DocIDs become small deltas. For example, `[1000, 1002, 1005]` becomes `[1000, 2, 3]`, which encodes in fewer bytes.
2. **Roaring bitmap compression**: Dense postings use Roaring's container optimization — run-length encoding for consecutive ranges, bitmap containers for scattered dense regions.

The 60-80% figure is typical for real-world posting lists with mixed sparse and dense terms.

## Replication and Data Sync

### Is the MySQL binlog parser self-implemented?

Yes. MygramDB includes a custom C++ binlog parser that uses the MySQL C API (`mysql_binlog_open()`) directly. It parses ROW-format events (WRITE_ROWS, UPDATE_ROWS, DELETE_ROWS) and DDL events (TRUNCATE, ALTER TABLE). The parser is separate from [mysql-event-stream](https://github.com/libraz/mysql-event-stream), which was extracted later as a standalone CDC library with Node.js and Python bindings.

### How fast is replication? INSERT to searchable?

Typically under 20ms end-to-end:

- MySQL binlog event generation: <1ms
- Network transit: <5ms (same network)
- Event queue processing + index update: 1-10ms

The bottleneck is network latency. On localhost, the lag is under 5ms.

### What happens during MySQL failover?

MygramDB detects connection loss and reconnects with exponential backoff (500ms to 10s). On reconnection:

1. The current GTID position is preserved
2. A new connection is established (can point to a different host via runtime configuration)
3. Binlog replication resumes from the saved GTID — no data loss

During reconnection, search queries are blocked briefly (typically 1-5 seconds). Write events queued before disconnection are not lost.

### How does MygramDB handle ALTER TABLE?

MygramDB catches DDL events via binlog. TRUNCATE TABLE clears the index immediately. ALTER TABLE and DROP TABLE are logged as warnings. If you change the schema of a search target column (rename, type change), a manual rebuild is required — stop MygramDB, drop the dump, and restart to trigger a fresh initial snapshot from MySQL.

### How are deletes handled in the index?

Immediate removal. When a DELETE event arrives via binlog, the document's N-grams are removed from posting lists and the document is removed from the document store. No tombstones, no lazy deletion. Cache entries referencing the deleted document are invalidated.

## Crash Recovery and Persistence

### What happens on crash? Is there a WAL?

No WAL. MygramDB uses snapshot-based persistence:

1. Periodic or manual dump saves the full index state with the current GTID position
2. On restart, the latest dump is loaded and binlog replication resumes from the saved GTID

This is simpler than WAL and acceptable because MygramDB is a read-only replica — the source of truth is MySQL. Worst case on crash without a recent dump: a full rebuild from MySQL (initial snapshot + binlog catchup).

Dump configuration:
- `dump.interval_sec`: Auto-save interval (0 = disabled, recommended: 7200 for production)
- `dump.retain`: Number of dumps to keep (default: 3)

### What happens when memory reaches the hard limit?

MygramDB monitors memory usage via health check endpoints but does not enforce the hard limit by rejecting queries or stopping replication. If the index grows beyond available RAM, the OS-level OOM killer will terminate the process. In practice, size your server to hold the full dataset plus headroom. The rule of thumb is ~2.3GB per million documents (with `verify_text: all`) — plan accordingly and monitor `/health/detail` or Prometheus metrics for memory usage trends.

## Protocol and Security

### What's the query protocol?

A custom text-based protocol over TCP (default port 11016), similar to Memcached. Also available as REST/JSON over HTTP (same port).

TCP example:
```
SEARCH articles golang SORT created_at DESC LIMIT 10\r\n
```

HTTP example:
```bash
curl "http://localhost:11016/api/v1/search?table=articles&q=golang&sort=created_at&order=desc&limit=10"
```

It is not SQL. The protocol is intentionally minimal — search, count, get by ID, and admin commands.

### Is there TLS or authentication?

No TLS or authentication on the search API. Access control is IP-based via `NETWORK_ALLOW_CIDRS` (CIDR allowlist). The MySQL replication connection supports SSL/TLS for secure binlog transfer.

MygramDB is designed to run inside a private network, behind a reverse proxy or firewall — the same model as Memcached or Redis without AUTH. If you need TLS termination, put it behind nginx or a load balancer.

## Deployment and Monitoring

### Can MygramDB run on Kubernetes?

The building blocks are there. Health check endpoints are built in:

- `GET /health/live` — Liveness probe (200 if process is running)
- `GET /health/ready` — Readiness probe (503 during initial sync, 200 when ready)
- `GET /health/detail` — Detailed status with uptime, index stats, memory

Prometheus metrics are available at `GET /metrics`. The Docker image runs as a non-root user (UID 1000). The author runs MygramDB on Docker, not Kubernetes, so K8s-specific operational advice is limited.

### What metrics are available?

Prometheus-format metrics at `GET /metrics`, including:

- Query performance (search/count/get latency, QPS)
- Index stats (term count, document count per table)
- Cache stats (hit rate, memory, evictions)
- Memory usage (RSS, heap)
- Replication status (binlog position, lag, events applied)
- Connection stats

### "Single binary" but it requires MySQL — is that really simple?

MygramDB is simple *to add*. It assumes MySQL already exists — which it does in most applications that need better search. You don't replace your database; you deploy MygramDB alongside it. One `docker run` command with environment variables pointing to your MySQL. No schema changes, no application rewrites, no ETL pipelines. The simplicity is in the integration, not in having zero dependencies.

## Benchmarks

### What hardware were the benchmarks run on?

Benchmarks were run on 1.1M Wikipedia articles (1M English + 100K Japanese) with MySQL 8.4 in Docker. MygramDB ran with `verify_text: all` (post-filter enabled for accurate match counts) and query cache disabled. Both ran on the same Apple M4 Max (128GB unified memory). Note: M4 Max's unified memory bandwidth is significantly higher than DDR4, which benefits in-memory MygramDB disproportionately. On a typical DDR4 server, expect MygramDB latencies to be somewhat higher.

### Were MySQL settings tuned for the benchmark?

No. MySQL ran with default `innodb_buffer_pool_size` and `innodb_ft_cache_size`. This reflects a common real-world scenario — many MySQL deployments run with defaults or minimal tuning. Even with aggressive tuning, MySQL FULLTEXT's fundamental bottleneck (disk-based posting list scans and single-threaded query execution) remains.

### Was MySQL tested cold or warm?

Both. MygramDB shows consistent latency regardless of cache state. See [Why MySQL FULLTEXT is Slow](/why) for cold vs warm cache analysis.

### Why not benchmark against Elasticsearch with real numbers?

Elasticsearch performance varies dramatically based on cluster size, JVM heap, shard count, and replica configuration. A single-node comparison would be misleading; a cluster comparison would be non-reproducible. The [comparison page](/comparison) provides qualitative guidance instead.

## Project

### Why C++ and not Rust?

Aware of the trade-off. The author believes Rust replacing C++ is a matter of time for production systems, and would likely choose Rust for a team project. MygramDB is a solo open-source project where the author wanted direct control over memory layout — posting list operations, bitmap intersections, and delta encoding benefit from knowing exactly where bytes land. The project uses RAII, `unique_ptr` for ownership, and `Expected<T, Error>` instead of exceptions to mitigate common C++ pitfalls. Not a recommendation for others to start new C++ projects.

### How mature is the project?

Development started in November 2025. The current version is 1.5.0 (March 2026). The project has been used in production on a high-traffic service (details under NDA). The release cadence is active, with focus on stability (thread safety fixes, replication edge cases) and operational features (Prometheus metrics, health checks, Kubernetes readiness).

### How do I migrate from MySQL FULLTEXT to MygramDB?

Keep MySQL as your primary database, deploy MygramDB alongside, and route search queries to it. No data migration needed — MygramDB syncs automatically via binlog. See [Quick Start](/) or [Comparison — Migration Path](/comparison#migration-path).

---

Have more questions? Check [GitHub](https://github.com/libraz/mygram-db) or open an issue.
