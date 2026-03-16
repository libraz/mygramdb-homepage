---
title: Why MySQL FULLTEXT is Slow - MygramDB
description: MySQL FULLTEXT search is slow due to disk I/O, uncompressed posting lists, and cache dependency. Learn how MygramDB solves these problems with in-memory indexing.
head:
  - - meta
    - name: keywords
      content: MySQL FULLTEXT slow, why MySQL search is slow, MySQL FULLTEXT performance, MySQL search optimization
---

# Why MySQL FULLTEXT is Slow

MySQL FULLTEXT search becomes painfully slow as your data grows. Here's why, and how MygramDB solves it.

## The Problem

### Disk I/O Bottleneck

MySQL FULLTEXT stores indexes on disk using B-tree pages. Every search query requires:
1. Reading B-tree pages from disk
2. Loading posting lists into memory
3. Sorting results (often with external sort)

Even with SSDs, this I/O overhead adds 100-3000ms per query.

### Uncompressed Posting Lists

MySQL stores posting lists without compression. For common terms matching millions of rows, this means:
- Reading megabytes of data per query
- Memory pressure on buffer pool
- Cache thrashing under concurrent load

### Cache Dependency

Performance varies 2-3x between cold and warm cache:

| State | Query Time |
|-------|------------|
| Cold cache | 2,980ms |
| Warm cache | 908ms |

In production, cache is often cold after restarts, deployments, or buffer pool contention.

### Concurrency Collapse

Under heavy concurrent load, MySQL FULLTEXT fails catastrophically:

| Concurrent Queries | Success Rate | Avg Response |
|-------------------|--------------|--------------|
| 1 | 100% | 908ms |
| 10 | **10%** | 4,641ms |
| 100 | 0% | timeout |

90% of queries fail at just 10 concurrent connections.

## The Solution: MygramDB

MygramDB solves these problems with a fundamentally different architecture:

### In-Memory Index

All data lives in RAM. Zero disk I/O during queries.

### Compressed Posting Lists

Delta encoding + Roaring bitmaps reduce memory usage by 60-80% while enabling faster intersections.

### SIMD-Accelerated Operations

Bitmap intersections use CPU SIMD instructions for maximum throughput.

### Consistent Performance

No cache warmup needed. Same sub-80ms response time, always.

| Concurrent Queries | Success Rate | Avg Response |
|-------------------|--------------|--------------|
| 1 | 100% | 32ms |
| 10 | 100% | 35ms |
| 100 | 100% | 190ms |

### Real-time MySQL Sync

GTID-based binlog replication keeps MygramDB in sync with MySQL. No ETL pipelines, no data staleness.

## When to Use

MygramDB is ideal for:
- **High-traffic web services** — E-commerce, news sites, Q&A platforms with many concurrent users
- **Real-time search requirements** — When users expect instant results
- **FULLTEXT queries >100ms** — Slow searches hurting user experience
- **Search fails under load** — Timeouts during traffic spikes

## Get Started

```bash
docker run -d --name mygramdb \
  -p 11016:11016 \
  -e MYSQL_HOST=your-mysql-host \
  -e MYSQL_USER=repl_user \
  -e MYSQL_PASSWORD=your_password \
  -e MYSQL_DATABASE=mydb \
  -e TABLE_NAME=articles \
  -e NETWORK_ALLOW_CIDRS=0.0.0.0/0 \
  ghcr.io/libraz/mygram-db:latest
```

::: warning
`NETWORK_ALLOW_CIDRS=0.0.0.0/0` allows connections from any IP. For production, restrict to specific ranges (e.g., `10.0.0.0/8,172.16.0.0/12`).
:::

See [GitHub](https://github.com/libraz/mygram-db) for full documentation.
