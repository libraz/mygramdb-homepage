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

The two architectures answer the same query through completely different data paths: one round-trips through disk-resident structures, the other stays entirely in RAM.

<DocDiagram name="query-path-comparison" alt="A MySQL FULLTEXT query passes through disk-resident B-tree pages, posting lists, and a sort, while MygramDB searches compressed posting lists in RAM with SIMD intersection." />

### Disk I/O Bottleneck

MySQL FULLTEXT stores indexes on disk using B-tree pages. Every search query requires:
1. Reading B-tree pages from disk
2. Loading posting lists into memory
3. Sorting results (often with external sort)

Even with SSDs, this I/O overhead can add milliseconds or seconds per query.

::: info What is a posting list?
A **posting list** is the list of document IDs that contain a given term. Full-text search finds candidates by combining these lists with AND/OR. See the [Glossary](/docs/glossary#posting-list) for more.
:::

### Uncompressed Posting Lists

MySQL stores posting lists without compression. For common terms matching millions of rows, this means:
- Reading megabytes of data per query
- Memory pressure on buffer pool
- Cache thrashing under concurrent load

### Cache Dependency

Performance varies significantly between cold and warm cache. The [published benchmark](/benchmarks) disables MygramDB's query cache so that search-engine work, rather than cache hits, is measured.

In production, cache is often cold after restarts, deployments, or buffer pool contention.

### Concurrency Collapse

Under concurrent load, MySQL FULLTEXT throughput can drop dramatically. The cache-off results for 1 and 4 connections are maintained on the [benchmark page](/benchmarks), together with the test configuration.

## The Solution: MygramDB

MygramDB solves these problems with a fundamentally different architecture:

### In-Memory Index

All data lives in RAM. Zero disk I/O during queries.

### Compressed Posting Lists

Delta encoding + Roaring bitmaps reduce memory usage by 60-80% while enabling faster intersections.

### SIMD-Accelerated Operations

Bitmap intersections use CPU SIMD instructions for maximum throughput.

### Consistent Performance

The index stays in memory, so a search does not need to read MySQL's FULLTEXT index. See [Benchmarks](/benchmarks) for cache-off measurements.

### Real-time MySQL / MariaDB Sync

GTID-based binlog replication keeps MygramDB in sync with MySQL 8.4/9.x or MariaDB 10.6+/11.x. No ETL pipelines, no data staleness.

::: info What is ETL?
**ETL** stands for extract, transform, load — the pipeline that copies data from one system into another. MygramDB reads the MySQL binlog directly, so there is no separate sync job to build and operate.
:::

## When to Use

MygramDB is ideal for:
- **High-traffic web services** — E-commerce, news sites, Q&A platforms with many concurrent users
- **Real-time search requirements** — When users expect instant results
- **FULLTEXT queries >100ms** — Slow searches hurting user experience
- **Search fails under load** — Timeouts during traffic spikes

Ready to try it? See [Quick Start](/) or [GitHub](https://github.com/libraz/mygram-db) for full documentation.
