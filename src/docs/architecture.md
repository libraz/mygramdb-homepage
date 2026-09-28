---
title: MygramDB Architecture - System Design and Data Flow
description: MygramDB architecture overview. System components, data flow from MySQL binlog to search results, thread model, snapshot persistence, and memory layout.
head:
  - - meta
    - name: keywords
      content: MygramDB architecture, search engine design, binlog replication, in-memory index, thread model, snapshot persistence
---

# Architecture

MygramDB runs as a sidecar process alongside MySQL (8.4/9.x) or MariaDB (10.11+/11.x/12.x). It reads the upstream server's binary log to build and maintain an in-memory full-text index, then serves search queries over TCP and HTTP. The server flavor is detected with a capability probe, so the same binary and config work with either.

<DocDiagram name="system-flow" alt="MySQL remains the source of truth while MygramDB reads snapshots and binlog events, maintains an in-memory index, and serves search traffic over TCP or HTTP." />

The important boundary is ownership: MySQL/MariaDB remains the durable source of truth for writes and normal SQL. MygramDB keeps a derived search index that can be rebuilt from a snapshot plus binlog replay.

::: info What is a sidecar?
A **sidecar** is a process added next to an existing system to take on one specific job, without replacing it. Here MySQL keeps handling writes and ordinary SQL, while MygramDB handles full-text search.
:::

## System Overview

::: info Index vs DocStore
The **index** is the structure that finds candidate documents fast. The **DocStore** holds what is needed to return and narrow those candidates — primary keys and filter values. They are separate on purpose: one is optimized for lookup, the other for retrieval.
:::

<DocDiagram name="component-flow" alt="Internal component chain: MySQL feeds BinlogReader, which updates the in-memory Index and DocStore, SearchHandler answers TCP and HTTP clients, and a snapshot file is dumped periodically and loaded on startup." />

**Components:**

- **BinlogReader** -- Connects to MySQL as a replica. Receives row-level events (INSERT, UPDATE, DELETE) via GTID-based binlog streaming.
- **Index** -- In-memory n-gram index. Maps n-gram strings to posting lists (sorted document ID sets).
- **DocumentStore** -- Maps internal DocIDs to MySQL primary keys and stores filter column values and normalized text. Filter-column names are interned once per store; each document keeps a small vector sorted by column ID rather than owning the same column names repeatedly.
- **SearchHandler** -- Parses queries, executes the search pipeline, manages the query cache, and reads candidate text in bounded chunks for text-heavy stages.
- **Snapshot** -- Periodic dump of index state and GTID position to disk for fast restart.

## Data Flow

MygramDB operates in three phases:

### Phase 1: Initial Snapshot

When `SYNC` is run, or when `replication.auto_initial_snapshot: true` is configured, MygramDB performs a consistent snapshot of the source table. The default is `auto_initial_snapshot: false`, so production operators explicitly choose when the initial MySQL read happens:

<DocDiagram name="initial-snapshot-sequence" alt="MygramDB records a safe lower-bound GTID before opening a consistent-snapshot transaction, streams the table rows into the index, commits, and resumes binlog reading from a safe position." />

The pre-snapshot GTID prevents a gap. Commits between that capture and the transaction start may be replayed; row application is idempotent.

### Phase 2: Live Replication

After the initial snapshot, MygramDB switches to binlog streaming:

<DocDiagram name="live-replication-sequence" alt="MySQL pushes row events into a bounded event queue; a worker dequeues each event, updates the index and document store, and invalidates the affected cache entries." />

The BinlogReader thread reads events into a bounded queue. A worker thread dequeues events and applies them to the index and document store. This decoupling allows the binlog reader to keep up with MySQL even during bursts.

On connection loss, MygramDB retries the configured endpoint and resumes from the last applied or processed GTID position. Events after that position may be replayed and applied idempotently.

### Phase 3: Query Processing

Search queries arrive via TCP (port 11016, default) or HTTP (port 8080, disabled by default) and are processed through the [search pipeline](/docs/how-it-works#search-pipeline).

## Thread Model

MygramDB uses an **event-driven Reactor I/O model** for TCP connections. The reactor uses epoll (Linux) or kqueue (macOS) to multiplex thousands of connections onto a single event-loop thread, dispatching work to a bounded worker pool.

::: info What is a Reactor I/O model?
A **Reactor I/O model** watches many connections from a small number of threads and hands work to a worker only when there is something to process. Because it does not create a thread per connection, idle connections cost almost nothing.
:::

<DocDiagram name="thread-model" alt="The main thread initializes and orchestrates, a reactor thread multiplexes connections, a BinlogReader thread feeds the event queue, and a worker pool takes read locks for queries and a write lock for event apply on the shared Index and DocStore." />

**Concurrency model:**

- The **Reactor** thread handles all TCP I/O (accept, read, write) via epoll/kqueue. No thread-per-connection overhead — thousands of idle connections consume no threads.
- Parsed requests are dispatched to the **Worker Thread Pool** for query execution.
- The Index and DocumentStore synchronize their own state. Searches take short shared accesses to obtain the data they need; binlog application coordinates its updates before publishing the new state.
- Candidate text is materialized in bounded chunks. The DocumentStore lock is released before BM25 scoring, term-frequency counting, and text post-filters, so those expensive stages do not keep the store locked.
- Cache invalidation uses reverse indexes for n-gram, filter, and text-sensitive dependencies. Its periodic LRU maintenance resumes from a bounded slice instead of sweeping every cache entry under one exclusive lock.
- Per-connection **backpressure** (`api.tcp.max_write_queue_bytes`, default 16 MiB) force-closes slow clients whose write queue exceeds the cap, preventing memory exhaustion.

::: info What is backpressure?
**Backpressure** stops the server's pending-send buffer from growing without bound when a client reads slowly. Closing connections that pass the cap keeps one slow client from consuming the whole process's memory.
:::
- Atomic counters are used for statistics (query count, cache hits) to avoid lock contention on the hot path.

All threads are joined on shutdown. No threads are detached.

## Persistence

MygramDB uses **snapshot-based persistence**, not a write-ahead log (WAL).

::: info What is a WAL?
A **write-ahead log** records every change sequentially as it happens. MygramDB treats MySQL as the source of truth, so instead of its own WAL it recovers from a periodic dump plus catch-up from the MySQL binlog.
:::

<DocDiagram name="persistence-cycle" alt="The in-memory index and current GTID position are dumped periodically to a snapshot file on disk, and recovery loads that dump then replays the binlog from the saved GTID." />

**How it works:**

1. A background scheduler periodically serializes the full index, document store, and current GTID position to disk.
2. With `dump.load_on_startup: true`, MygramDB tries `dump.dir/default_filename` at startup. A successful restore resumes binlog replication from the saved GTID; this mode requires `replication.start_from: snapshot`.
3. Events between that GTID and the current MySQL position are replayed automatically. If the dump fails validation, startup falls back to a MySQL initial snapshot.

Snapshot writes use **atomic file operations** (write to temp file, then rename) to prevent corruption if the process is interrupted during a dump.

When startup does not attempt a dump restore, enable `replication.auto_initial_snapshot` to build the initial index automatically, or run `SYNC <table>` (or `SYNC <database>.<table>` in multi-database configurations). A failed startup dump restore falls back to a MySQL initial snapshot even if `auto_initial_snapshot` is false.

::: warning Not a substitute for MySQL backups
MygramDB snapshots exist to restore the search index quickly. Backups and point-in-time recovery for the source data remain MySQL's responsibility.
:::

## Memory Layout

<DocDiagram name="memory-layout" alt="Per table, the index holds an n-gram map and posting lists, and the document store holds primary keys, filter columns, and normalized text; a shared cache holds query results and an n-gram reverse index." />

**Sizing reference.** The figures below come from the published v1.10.0 benchmark run: 1.1M Wikipedia articles (1M English, 100K Japanese, avg. 666 chars) with `verify_text: all`, in a 32 GiB container. See [Benchmarks](/benchmarks) for the full run.

| Component | Memory |
|-----------|--------|
| Index (n-gram map + posting lists) | ~152 MB |
| DocumentStore + Text Store | ~1.78 GB |
| **Total RSS** | **~3.41 GB** |

Current server startup retains normalized text even with `verify_text: off`, because highlighting is a query-level feature. `verify_text` controls post-filtering, not text storage. The [FAQ](/faq#how-much-memory-does-mygramdb-need) explains how to use this benchmark for capacity planning. Filter values keep interned column IDs in small sorted vectors, avoiding one owned column-name string and hash map per document and configured filter column.

Stored text and document data dominate the benchmark above. Posting-list memory depends on the compression strategy -- delta encoding for sparse n-grams, Roaring bitmaps for dense ones. Monitoring does not lock every table for every scrape: per-table values are aggregated into a bounded snapshot served by `INFO`, `/metrics`, and Prometheus. See [How It Works](/docs/how-it-works#posting-list-compression) for details on the adaptive compression.

---

For search pipeline details, see [How It Works](/docs/how-it-works). For performance numbers, see [Benchmarks](/benchmarks).
