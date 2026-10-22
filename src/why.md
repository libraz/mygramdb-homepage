---
title: Why MySQL FULLTEXT is Slow - MygramDB
description: Compare MySQL FULLTEXT with MygramDB's in-memory search path using measured cache-off benchmarks and documented execution paths.
head:
  - - meta
    - name: keywords
      content: MySQL FULLTEXT slow, why MySQL search is slow, MySQL FULLTEXT performance, MySQL search optimization
---

# Why MySQL FULLTEXT is Slow

MySQL FULLTEXT performance depends on the query, data, memory, and concurrency. The published benchmark compares it with MygramDB on the same dataset.

## The Problem

MySQL serves FULLTEXT queries through its SQL execution path and InnoDB buffer pool. MygramDB maintains a separate search index in memory. The measured MySQL buffer-pool hit ratio was 99.9989%, so the benchmark does not show a disk read for every query.

<DocDiagram name="query-path-comparison" alt="MySQL searches a FULLTEXT index through its buffer pool and SQL execution path; MygramDB searches adaptive posting lists in memory and optionally verifies candidate text." />

### Work per query

MySQL FULLTEXT uses an inverted index within InnoDB. Query cost depends on the matching postings, rows fetched, sorting, and whether index pages are already in the buffer pool. MygramDB intersects in-memory posting lists and applies optional text verification before returning results. The benchmark reports the observed latency for each tested query rather than assuming one fixed cost for either engine.

::: info What is a posting list?
A **posting list** is the list of document IDs that contain a given term. Full-text search finds candidates by combining these lists with AND/OR. See the [Glossary](/docs/glossary#posting-list) for more.
:::

### Cache Conditions

The [published benchmark](/benchmarks) ran with a warm MySQL buffer pool and disabled MygramDB's query cache. Cache hits can change latency in either system. Use those conditions when comparing your own measurements.

### Concurrent load

The cache-off results for 1, 2, 4, 8 and 16 connections are maintained on the [benchmark page](/benchmarks), together with the test configuration. Throughput and latency under load depend on the host and workload.

## The Solution: MygramDB

MygramDB provides a separate execution path for search:

### In-Memory Index

The search index and stored document data are held in memory. The server does not fetch MySQL FULLTEXT index pages during a search.

### Compressed Posting Lists

`OPTIMIZE` chooses delta encoding or Roaring bitmaps based on posting-list density. Inserts also convert delta lists that grow beyond 4,096 entries. Memory use depends on the indexed data; see the [memory sizing reference](/docs/performance#_1-memory-sizing).

### SIMD-Accelerated Operations

Roaring bitmap operations can use SIMD instructions where the build and CPU support them.

### Search Index in Memory

The index stays in memory, so a search does not read MySQL's FULLTEXT index. MygramDB's query cache can also change latency when enabled. See [Benchmarks](/benchmarks) for measurements with that cache disabled.

### Real-time MySQL / MariaDB Sync

GTID-based binlog replication applies changes from MySQL 8.4/9.x or MariaDB 10.11+/11.x/12.x. A separate search ETL job is unnecessary, but setup still requires MySQL replication configuration, an initial snapshot or `SYNC`, and routing search requests to MygramDB. Lag depends on the source, network, and MygramDB's processing rate.

::: info What is ETL?
**ETL** stands for extract, transform, load — the pipeline that copies data from one system into another. MygramDB reads the MySQL binlog directly, so there is no separate sync job to build and operate.
:::

## When to Use

Consider MygramDB when:
- The indexed data fits in available RAM with room for process and indexing overhead.
- Search reads are a meaningful part of the MySQL workload, and the application can send them to MygramDB's API.
- The measured latency or throughput for your queries on MySQL does not meet your target.

Ready to try it? See [Quick Start](/) or [GitHub](https://github.com/libraz/mygram-db) for full documentation.
