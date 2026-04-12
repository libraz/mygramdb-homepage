---
title: MygramDB Architecture - System Design and Data Flow
description: MygramDB architecture overview. System components, data flow from MySQL binlog to search results, thread model, snapshot persistence, and memory layout.
head:
  - - meta
    - name: keywords
      content: MygramDB architecture, search engine design, binlog replication, in-memory index, thread model, snapshot persistence
---

# Architecture

MygramDB runs as a sidecar process alongside MySQL. It reads the MySQL binary log to build and maintain an in-memory full-text index, then serves search queries over TCP and HTTP.

## System Overview

```mermaid
flowchart LR
    MySQL[(MySQL)] -->|binlog stream| BR["BinlogReader"]
    BR -->|row events| IDX["Index + DocStore"]
    IDX -->|search results| SH["SearchHandler"]
    SH -->|response| TCP["TCP Client\nport 11016"]
    SH -->|response| HTTP["HTTP Client\nport 8080"]
    IDX -->|periodic dump| SNAP["Snapshot File"]
    SNAP -->|load on startup| IDX
```

**Components:**

- **BinlogReader** -- Connects to MySQL as a replica. Receives row-level events (INSERT, UPDATE, DELETE) via GTID-based binlog streaming.
- **Index** -- In-memory n-gram index. Maps n-gram strings to posting lists (sorted document ID sets).
- **DocumentStore** -- Maps internal DocIDs to MySQL primary keys and stores filter column values. Optionally stores document text for `verify_text`.
- **SearchHandler** -- Parses queries, executes the search pipeline, manages the query cache.
- **Snapshot** -- Periodic dump of index state and GTID position to disk for fast restart.

## Data Flow

MygramDB operates in three phases:

### Phase 1: Initial Snapshot

On first startup (no existing dump file), MygramDB performs a consistent snapshot of the source table:

```mermaid
sequenceDiagram
    participant M as MySQL
    participant B as MygramDB
    B->>M: START TRANSACTION WITH CONSISTENT SNAPSHOT
    B->>M: SELECT @@global.gtid_executed
    Note over B: Capture GTID position
    B->>M: SELECT id, text_col, filter_cols FROM table
    Note over B: Stream rows, build index
    B->>M: COMMIT
    Note over B: Start binlog from captured GTID
```

This guarantees no data is missed or duplicated between the snapshot and subsequent binlog events.

### Phase 2: Live Replication

After the initial snapshot, MygramDB switches to binlog streaming:

```mermaid
sequenceDiagram
    participant M as MySQL
    participant Q as Event Queue
    participant W as Worker
    M->>Q: Row events (INSERT/UPDATE/DELETE)
    Note over Q: Bounded queue (default 10,000)
    Q->>W: Dequeue event
    W->>W: Update Index + DocStore
    W->>W: Invalidate affected cache entries
```

The BinlogReader thread reads events into a bounded queue. A worker thread dequeues events and applies them to the index and document store. This decoupling allows the binlog reader to keep up with MySQL even during bursts.

On connection loss, MygramDB reconnects with exponential backoff (500ms to 10s) and resumes from the last processed GTID position. No data is lost or replayed.

### Phase 3: Query Processing

Search queries arrive via TCP (port 11016, default) or HTTP (port 8080, disabled by default) and are processed through the [search pipeline](/docs/how-it-works#search-pipeline).

## Thread Model

Since v1.5.3, MygramDB uses an **event-driven Reactor I/O model** for TCP connections. The reactor uses epoll (Linux) or kqueue (macOS) to multiplex thousands of connections onto a single event-loop thread, dispatching work to a bounded worker pool.

```mermaid
flowchart TD
    subgraph "Main Thread"
        INIT["Initialization\nConfig, Snapshot Load"]
        ORCH["Server Orchestrator\nLifecycle Management"]
    end
    subgraph "Reactor Thread"
        EV["epoll/kqueue event loop\nConnection multiplexing"]
    end
    subgraph "BinlogReader Thread"
        BL["MySQL binlog stream\n→ Event Queue"]
    end
    subgraph "Worker Thread Pool"
        W1["Worker: Event processing\n(Index + DocStore writes)"]
        W2["Worker: Query execution\n(concurrent reads)"]
        W3["Worker: Query execution\n(concurrent reads)"]
    end
    subgraph "Background Threads"
        SS["Snapshot Scheduler\n(periodic dump)"]
    end
    INIT --> ORCH
    EV -->|"dispatch"| W2
    EV -->|"dispatch"| W3
    BL -->|"event queue"| W1
    W2 -->|"shared_mutex\n(read lock)"| IDX["Index\n+ DocStore"]
    W3 -->|"shared_mutex\n(read lock)"| IDX
    W1 -->|"shared_mutex\n(write lock)"| IDX
```

**Concurrency model:**

- The **Reactor** thread handles all TCP I/O (accept, read, write) via epoll/kqueue. No thread-per-connection overhead — thousands of idle connections consume no threads.
- Parsed requests are dispatched to the **Worker Thread Pool** for query execution.
- The Index and DocumentStore are protected by `std::shared_mutex`, allowing multiple concurrent readers with a single writer.
- Search queries acquire a read lock. Binlog event processing acquires a write lock.
- This is optimal for the read-heavy workload: searches never block each other, and writes only block briefly during index updates.
- Per-connection **backpressure** (`api.tcp.max_write_queue_bytes`, default 16 MiB) force-closes slow clients whose write queue exceeds the cap, preventing memory exhaustion.
- Atomic counters are used for statistics (query count, cache hits) to avoid lock contention on the hot path.

All threads are joined on shutdown. No threads are detached.

## Persistence

MygramDB uses **snapshot-based persistence**, not a write-ahead log (WAL).

```mermaid
flowchart LR
    subgraph "Runtime"
        IDX["Index + DocStore\n(in memory)"]
        GTID["Current GTID position"]
    end
    subgraph "Disk"
        DUMP["Snapshot file\n(index + GTID)"]
    end
    IDX -->|"periodic dump"| DUMP
    DUMP -->|"load on startup"| IDX
    GTID -->|"saved with snapshot"| DUMP
```

**How it works:**

1. A background scheduler periodically serializes the full index, document store, and current GTID position to disk.
2. On restart, MygramDB loads the snapshot and resumes binlog replication from the saved GTID.
3. Events between the snapshot and current MySQL position are replayed automatically.

Since v1.5.0, snapshot writes use **atomic file operations** (write to temp file, then rename) to prevent corruption if the process is interrupted during a dump.

If no snapshot exists, MygramDB performs a full initial snapshot from MySQL (Phase 1 above).

## Memory Layout

```mermaid
flowchart TD
    subgraph "Per-Table Memory"
        subgraph "Index"
            NG["N-gram Map\nstring → PostingList"]
            PL["PostingList\nDelta-encoded or Roaring bitmap"]
        end
        subgraph "DocumentStore"
            DM["DocID → Primary Key map"]
            FM["Filter columns\n(category, status, etc.)"]
        end
        subgraph "Text Store (optional)"
            TS["DocID → Original text\n(for verify_text)"]
        end
    end
    subgraph "Cache"
        QC["Query Cache\nquery hash → result set"]
        RI["Reverse Index\nn-gram → cache entry set"]
    end
```

**Sizing reference** (1.1M Wikipedia articles, avg. 666 chars):

| Component | Memory |
|-----------|--------|
| Index (n-gram map + posting lists) | ~813 MB |
| DocumentStore + Text Store | ~1.54 GB |
| **Total RSS** | **~2.53 GB** |

The text store is allocated only when `verify_text` is enabled. Without it, memory usage is approximately 813 MB for the same dataset.

Posting lists are the largest component. Their memory efficiency depends on the compression strategy -- delta encoding for sparse n-grams, Roaring bitmaps for dense ones. See [How It Works](/docs/how-it-works#posting-list-compression) for details on the adaptive compression.

---

For search pipeline details, see [How It Works](/docs/how-it-works). For performance numbers, see [Benchmarks](/benchmarks).
