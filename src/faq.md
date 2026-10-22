---
title: FAQ - MygramDB
description: Frequently asked questions about MygramDB. Architecture, benchmarks, N-gram indexing, Roaring bitmaps, MySQL replication, and comparisons with Elasticsearch.
---

<script setup>
import { VERIFY_ALL_PER_MILLION_GB, PLANNING_10M_ALL_GB } from './data/memory'
</script>

# Frequently Asked Questions

::: info Unfamiliar with a term?
GTID, binlog, N-gram, BM25, and Roaring Bitmap are all defined in the [Glossary](/docs/glossary). Keep it open alongside this page on a first read.
:::

## MySQL FULLTEXT Problems

### Why is my MySQL FULLTEXT search so slow?

MySQL FULLTEXT latency depends on the query, data, sorting, buffer-pool state, and concurrency. The [architecture comparison](/why) explains the search paths; the published benchmark used a 99.9989% buffer-pool hit ratio, so per-query disk reads do not explain its measured difference.

**Solution**: MygramDB keeps its search index in memory. See [Benchmarks](/benchmarks) for the current cache-off measurements.

::: tip What you do have to change
Writes to MySQL stay exactly as they are. What changes is where search requests go: they must be pointed at MygramDB's TCP or HTTP API.
:::

### My MySQL FULLTEXT queries keep timing out under load. How do I fix it?

Add MygramDB as a search replica. The [reproducible benchmark](/benchmarks) compares its cache-off throughput with MySQL FULLTEXT on the same dataset.

### Can I speed up MySQL FULLTEXT without changing my application?

MygramDB leaves MySQL writes in place, but it uses its own TCP and HTTP search APIs. Change the application's search path to call MygramDB; existing MySQL FULLTEXT SQL queries do not become faster automatically. See [Quick Start](/) for setup.

## Alternatives

### Should I use Elasticsearch instead of MygramDB?

See [Comparison](/comparison) for a detailed breakdown. In short: choose MygramDB if your data fits in RAM and you want simple MySQL/MariaDB integration. Choose Elasticsearch if you need distributed search across multiple nodes, petabyte-scale data, or advanced analytics and aggregation features.

### How does MygramDB compare to Meilisearch or Typesense?

Meilisearch and Typesense are separate search products with their own feature sets and data-ingestion options. MygramDB reads MySQL or MariaDB binlogs to maintain its index. Choose based on your search requirements, data flow, and the current deployment and license terms of each product.

### How does MygramDB compare to RediSearch?

MygramDB reads MySQL or MariaDB binlogs to maintain its search index. For a comparison with another product, check its current documentation for supported data-ingestion paths, features, deployment requirements, and license terms.

## Features and Limitations

### How much memory does MygramDB need?

The [published v1.10.0 benchmark](/benchmarks) measured **~{{ VERIFY_ALL_PER_MILLION_GB }}GB of resident memory per million documents** with `verify_text: all`, including the index, stored text, and process overhead. A linear estimate for 10M similar documents is ~{{ PLANNING_10M_ALL_GB }}GB before headroom. Current builds retain normalized text even with `verify_text: off` because highlighting can be requested at query time. That setting controls post-filtering, so do not use an index-only estimate for it. Measure memory with your own content and leave headroom.

::: warning What happens when memory runs out
MygramDB is an in-memory engine. If the dataset outgrows available RAM, the OS or container platform can kill the process with an OOM. In production, budget index RAM plus headroom, separately from the disk space used for dumps.
:::

### Does MygramDB handle multibyte / non-ASCII text?

Yes. MygramDB is fully Unicode-aware: text goes through ICU-based NFKC normalization and is then tokenized by a language-agnostic N-gram tokenizer. 3-byte UTF-8 (most ideographic scripts, e.g. Chinese, Japanese, Korean) and 4-byte UTF-8 (emoji, supplementary planes) are handled out of the box with no language-specific plugins, dictionaries, or morphological analyzers to configure.

### Does MygramDB support fuzzy search or typo tolerance?

Yes. Add `FUZZY` (or `FUZZY 2`) to match terms within a Levenshtein edit distance of 1 or 2. Fuzzy search also includes every result from the same non-fuzzy query, including short terms and mixed CJK/ASCII terms. See [Query Guide — Fuzzy Search](/docs/queries#fuzzy-search).

### Does MygramDB support search result highlighting?

Yes. Add the `HIGHLIGHT` clause to receive snippet fragments with configurable tags (`TAG`), fragment length (`SNIPPET_LEN`), and fragment count (`MAX_FRAGMENTS`). The server retains normalized text for highlighting even with `memory.verify_text: "off"`. See [Query Guide — Highlighting](/docs/queries#highlighting).

### Does MygramDB support relevance ranking?

Yes. Use `SORT _score DESC` to rank results by BM25 relevance. IDF and TF are computed at query time; `k1` and `b` are tunable via `bm25.k1` (default `1.2`) and `bm25.b` (default `0.75`). Set `bm25.enable: true`; normalized text is retained for scoring independently of `memory.verify_text`.

### Can MygramDB scale horizontally?

MygramDB does not shard an index across nodes. Multiple full replicas can serve search traffic behind a load balancer, but each holds the whole index and needs its own replication configuration, including a distinct `REPLICATION_SERVER_ID`. Route traffic only to ready instances. If the data does not fit in one node's RAM, partition the source data across separately indexed tables or instances and route or combine queries in the application.

Capacity depends on document size and filters. The published benchmark used about 3.1 GB per million documents with `verify_text: all`; measure your own data and leave room for indexing and maintenance before choosing a node size.

### Can I search across multiple tables?

No. Each query targets a single table: `SEARCH articles hello world`. MygramDB supports configuring multiple tables, but each has its own independent index and document store. Cross-table search would need to be handled at the application layer with separate queries.

### Can one MygramDB instance index multiple MySQL databases?

Yes (v1.7.0+). Each table has an effective identity of `<database>.<table>`. If all configured tables belong to one database, bare names like `articles` continue to work. If the configuration spans two or more databases, table references must be qualified, for example `SEARCH app_db.articles mysql` or `POST /tables/app_db.articles/search`.

### Does MygramDB support PostgreSQL?

No. MygramDB relies on MySQL's binary log replication protocol, which is MySQL-specific. PostgreSQL uses a different mechanism (logical replication with WAL). There are no current plans for PostgreSQL support.

### Does MygramDB work with MariaDB?

Yes. MygramDB supports MariaDB 10.11+/11.x/12.x using MariaDB-native GTIDs (`domain-server-sequence`). A capability probe detects the server flavor, so the same `mysql` config section works for both MySQL 8.4/9.x and MariaDB. The E2E matrix covers MariaDB 10.11, 11.8, and 12.3.

## Indexing and Search

### Why N-gram instead of morphological analysis?

N-gram tokenization is language-agnostic. Morphological analyzers (MeCab, kuromoji, jieba) require dictionaries, language detection, and version management. N-gram works uniformly across Latin, multibyte ideographic scripts, and mixed-script content without any per-language configuration.

MygramDB uses bigrams (size 2) by default for ASCII/alphanumeric text and CJK ideographs. Set `kanji_ngram_size` when CJK ideographs need a different size. Both sizes are configurable per table, and the omitted `ngram_size` default is `2`.

### How are Roaring bitmaps used?

Posting lists use delta encoding or Roaring bitmaps. `OPTIMIZE` chooses a representation based on density, and inserts can trigger a conversion based on list size:

- **Sparse postings** (typically below 18% density after `OPTIMIZE`): Delta-encoded arrays. DocIDs are stored as fixed-width deltas from the previous value.
- **Dense postings** (typically at least 18% after `OPTIMIZE`, or over 4,096 entries after inserts): Roaring bitmaps via CRoaring. Roaring automatically selects a container type (array, bitmap, or run-length) per 65,536-ID chunk.

The density threshold is configurable (`roaring_threshold`, 18% by default), with a 0.5x hysteresis factor for `OPTIMIZE`. Inserts convert a delta list to Roaring when it grows beyond 4,096 entries, regardless of density. A Roaring list converts back only when it has at most 4,096 entries and its density is below half the threshold (9% by default).

### What does "SIMD-accelerated" mean in practice?

MygramDB links against [CRoaring](https://github.com/RoaringBitmap/CRoaring), which uses SIMD instructions internally for bitmap operations (AND, OR, cardinality). On x86-64, CRoaring uses AVX2 when available; on ARM, it uses NEON. MygramDB does not contain custom SIMD code — the acceleration comes from the bitmap library.

### How are posting lists encoded?

`OPTIMIZE` chooses delta-encoded lists for sparse terms and Roaring bitmaps for dense terms. Inserts also convert lists that exceed 4,096 entries to Roaring. Memory usage depends on the document-ID distribution:

1. **Delta encoding**: Monotonically increasing DocIDs become deltas. For example, `[1000, 1002, 1005]` becomes `[1000, 2, 3]`; the current representation stores each delta as a `uint32_t`.
2. **Roaring bitmap compression**: Dense postings use Roaring's container optimization — run-length encoding for consecutive ranges, bitmap containers for scattered dense regions.

There is no fixed compression ratio across datasets. Measure index memory with your own content and see the [published memory breakdown](/docs/architecture#memory-layout).

## Replication and Data Sync

### Is the MySQL binlog parser self-implemented?

Yes. MygramDB includes a custom C++ binlog parser that uses the MySQL C API (`mysql_binlog_open()`) directly. It parses ROW-format events (WRITE_ROWS, UPDATE_ROWS, DELETE_ROWS) and DDL events (TRUNCATE, ALTER TABLE). The parser is separate from [mysql-event-stream](https://github.com/libraz/mysql-event-stream), which was extracted later as a standalone CDC library with Node.js and Python bindings.

### How fast is replication? INSERT to searchable?

Lag depends on source transactions, network conditions, event queueing, and index updates. Monitor `mygramdb_replication_last_applied_unixtime` and `mygramdb_replication_seconds_since_last_applied` at [`/metrics`](/docs/http-api#get-metrics), alongside MySQL write activity. When `api.admin_token` is configured, Prometheus must send a valid Bearer token to receive these metrics. An idle source can have an old last-applied time without being behind.

### What happens during MySQL failover?

MygramDB detects connection loss and retries the configured endpoint. On reconnection:

1. The current GTID position is preserved
2. The source server UUID is checked; a different source is rejected
3. If the source is unchanged, binlog replication resumes from the saved GTID

`mysql.host` and `mysql.port` cannot be changed with `SET`. To move to another endpoint, edit the configuration and restart after confirming the intended source. Monitor readiness and replication lag while the reader reconnects.

### How does MygramDB handle ALTER TABLE?

MygramDB validates relevant DDL events from the binlog, including `CREATE INDEX` and `DROP INDEX`. `TRUNCATE TABLE` clears the affected index. Dropping or renaming a configured table, renaming another table onto its name, or making an incompatible change to a configured primary-key, text-source, or filter column stops replication before its GTID advances. If the configured primary-key column no longer has a single-column `PRIMARY KEY` or `UNIQUE` index, validation fails and replication stops. On a configured `DROP TABLE`, the existing index is retained while replication is stopped; it is no longer current. Fix the schema or configuration, then run `SYNC` to rebuild the table.

### How are deletes handled in the index?

Immediate removal. When a DELETE event arrives via binlog, the document's N-grams are removed from posting lists and the document is removed from the document store. No tombstones, no lazy deletion. Cache entries referencing the deleted document are invalidated.

## Crash Recovery and Persistence

### What happens on crash? Is there a WAL?

No WAL. MygramDB uses snapshot-based persistence:

1. Periodic or manual `DUMP SAVE` writes the index state with its GTID position. Scheduled dumps have timestamped filenames.
2. If `dump.load_on_startup: true`, startup tries `dump.dir/default_filename`, not the newest timestamped dump. On success, replication resumes from the dump's GTID. Set `replication.start_from: snapshot` for this mode.

If that startup dump is missing or invalid, MygramDB falls back to a MySQL initial snapshot. MySQL remains the source of truth; keep its own backup and binlogs separately. See [Snapshot and Dump Recovery](/docs/snapshot) for restore checks.

If the dump restores but MygramDB cannot catch up to the current MySQL position, it keeps serving the restored index with replication stopped and reports `not_ready`. Check the replication error and source GTID/binlog availability, then follow [Snapshot and Dump Recovery](/docs/snapshot) to recover or rebuild the index.

Dump configuration:
- `dump.interval_sec`: Auto-save interval (0 = disabled, recommended: 7200 for production)
- `dump.retain`: Number of dumps to keep (default: 3)

### What happens when memory reaches the hard limit?

MygramDB monitors memory usage via health check endpoints but does not enforce the hard limit by rejecting queries or stopping replication. If the index grows beyond available RAM, the OS-level OOM killer can terminate the process. Size the server for the full dataset plus headroom. The measured reference is ~{{ VERIFY_ALL_PER_MILLION_GB }}GB per million documents with `verify_text: all`; monitor `/health/detail` or Prometheus metrics for memory usage trends.

## Protocol and Security

### What's the query protocol?

A custom text-based protocol over TCP (default port 11016), similar to Memcached. A separate REST/JSON HTTP API is also available on its own port (default 8080, disabled by default).

TCP example:
```mygram
SEARCH articles golang SORT created_at DESC LIMIT 10\r\n
```

HTTP example:
```bash
curl -X POST http://localhost:8080/tables/articles/search \
  -H "Content-Type: application/json" \
  -d '{"q": "golang", "sort": {"column": "created_at", "order": "DESC"}, "limit": 10}'
```

In multi-database deployments, qualify the route as `/tables/app_db.articles/search`. It is not SQL. The protocol is intentionally minimal — search, count, facet, get by ID, and admin commands.

### Is there TLS or authentication?

MygramDB has no native TLS; terminate TLS at a reverse proxy or load balancer when needed. The MySQL replication connection supports SSL/TLS for secure binlog transfer.

Administrative TCP commands require `AUTH <token>` on each connection when `api.admin_token` is set. HTTP `GET /config`, `GET /replication/status`, and `POST /optimize` require `Authorization: Bearer <token>` on each request. Search endpoints are controlled by the listener bind address and `NETWORK_ALLOW_CIDRS`; keep the service on a private network or behind a reverse proxy or firewall.

## Deployment and Monitoring

### Can MygramDB run on Kubernetes?

MygramDB exposes health checks and metrics that can be used by a Kubernetes deployment. You still need to configure storage for dumps, memory limits, probes, and network access to MySQL for your cluster:

- `GET /health/live` — Liveness probe (200 if process is running)
- `GET /health/ready` — Readiness probe (503 during dump load, table sync, replication unavailability, or a failed startup catch-up after dump restore; 200 when ready)
- `GET /health/detail` — Detailed status with uptime, index stats, and memory; replication details require a bearer token when `api.admin_token` is set

Prometheus metrics are available at `GET /metrics`. The Docker image runs as a non-root user (UID 1000).

### What metrics are available?

Prometheus-format metrics at `GET /metrics`, including:

- Command counts (`mygramdb_command_total`); derive rates from the counters
- Index document and term counts by table
- Cache hit rate, memory, and eviction counts
- Process RSS and accounted index memory
- Replication state, events processed, and time since the last applied event
- Connected clients and denied-request counts

### "Single binary" but it requires MySQL — is that really simple?

MygramDB is a separate search service beside an existing MySQL database. Configure GTID/binlog, a replication user, searchable tables, and network access. MySQL remains the source of writes; the application must send search requests to MygramDB's TCP or HTTP API. A separate search ETL job is unnecessary.

## Benchmarks

### What hardware were the benchmarks run on?

Benchmarks were run on 1.1M Wikipedia articles (1M English + 100K Japanese) with MySQL 8.4.11 in Docker. MygramDB ran with `verify_text: all` (normalized-substring verification enabled) and query cache disabled. The Apple M5 Max host (18 cores, 128 GiB) allocated 32 GiB to Docker Desktop (31.29 GiB visible to the containers). Each query was measured over 200 iterations after 5 warmup runs. The tested queries returned the same counts as MySQL FULLTEXT; this does not establish equivalent semantics for all queries. On other hardware and memory limits, absolute latency will differ.

### Were MySQL settings tuned for the benchmark?

Yes. MySQL ran with `innodb_buffer_pool_size` at 8.0 GiB, large enough to hold the FULLTEXT working set — during the run the buffer pool hit ratio was 99.9989% with 7,809 disk reads. The numbers on the [benchmark page](/benchmarks) compare against a warm, adequately sized FULLTEXT index.

### Was MySQL tested cold or warm?

Warm. The buffer pool hit ratio during the run was 99.9989%, so MySQL FULLTEXT was reading almost entirely from memory. MygramDB's own query cache was disabled for the same run, so its numbers reflect search-engine work rather than cache hits. Both configurations are recorded on the [benchmark page](/benchmarks).

### Why not benchmark against Elasticsearch with real numbers?

Elasticsearch performance varies dramatically based on cluster size, JVM heap, shard count, and replica configuration. A single-node comparison would be misleading; a cluster comparison would be non-reproducible. The [comparison page](/comparison) provides qualitative guidance instead.

## Project

### Why C++ and not Rust?

MygramDB uses C++ for direct control over the in-memory layout of posting lists, bitmap operations, and delta-encoded IDs, and to integrate with the MySQL C API and CRoaring. The code uses RAII and `unique_ptr` for resource ownership, and `Expected<T, Error>` for error handling. This describes MygramDB's implementation choices; the right language for another project depends on its constraints and libraries.

### How mature is the project?

Development started in November 2025. MygramDB is used in production on a high-traffic service (details under NDA).

### How do I migrate from MySQL FULLTEXT to MygramDB?

Keep MySQL as your primary database, deploy MygramDB alongside, and route search queries to its API. Build the initial index with `SYNC` or `replication.auto_initial_snapshot`; later changes are applied from the binlog. See [Quick Start](/) or [Comparison — Migration Path](/comparison#migration-path).

---

Have more questions? Check [GitHub](https://github.com/libraz/mygram-db) or open an issue.
