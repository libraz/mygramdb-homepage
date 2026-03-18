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

## Why These Numbers?

See [Why MySQL FULLTEXT is Slow](/why) for a detailed breakdown of the architectural differences, and [Comparison](/comparison) for how MygramDB stacks up against Elasticsearch.

For benchmark methodology and environment details, see [FAQ — Benchmarks](/faq#benchmarks).
