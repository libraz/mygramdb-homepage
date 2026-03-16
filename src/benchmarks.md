---
title: Benchmarks - MygramDB vs MySQL FULLTEXT
description: MygramDB achieves tens to hundreds of times speedup over MySQL FULLTEXT. See real benchmark results on 1.7M rows with concurrent query performance.
head:
  - - meta
    - name: keywords
      content: MySQL FULLTEXT benchmark, MySQL search performance, full-text search benchmark, MygramDB performance
---

# Benchmarks

Tested on 1.7M rows of production data with MySQL 8.4.

## Query Performance (ORDER BY id LIMIT 100)

| Query Type | Match Rate | MySQL | MygramDB | Speedup |
|------------|------------|-------|----------|---------|
| Ultra high-freq | 75% (1.28M rows) | 2,980ms | 92ms | **32x** |
| High-freq | 47% (807K rows) | 1,876ms | 76ms | **25x** |
| Medium-freq | 22% (375K rows) | 908ms | 49ms | **19x** |

## COUNT Performance

| Query Type | MySQL | MygramDB | Speedup |
|------------|-------|----------|---------|
| Ultra high-freq | 2,891ms | 6.7ms | **431x** |
| Low-freq | 124ms | 0.3ms | **413x** |

## Concurrent Performance

| Load | MySQL | MygramDB |
|------|-------|----------|
| 10 concurrent | **90% failed**, QPS 0.4 | 100% success, QPS 288 |
| 100 concurrent | Cannot execute | 100% success, **QPS 372** |

## Why MySQL FULLTEXT is Slow

- **Disk I/O**: Scans B-tree pages from disk
- **No compression**: Large posting lists
- **Cache dependency**: 2-3x variance between cold/warm
- **Concurrency bottleneck**: I/O contention under load

## Why MygramDB is Fast

- **In-memory**: Zero disk I/O
- **Compressed**: Delta encoding + Roaring bitmaps
- **SIMD-accelerated**: Fast bitmap operations
- **No warmup**: Always ready

## vs Elasticsearch

| | MygramDB | Elasticsearch |
|---|----------|---------------|
| Deployment | Single binary | Cluster setup |
| Data sync | Direct MySQL binlog | ETL required |
| Latency | Sub-80ms | Higher |
| Complexity | Low | High |
| Distributed | No | Yes |

See [GitHub](https://github.com/libraz/mygram-db) for details.
