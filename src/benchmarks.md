---
title: Benchmarks - MygramDB vs MySQL FULLTEXT
description: MygramDB vs MySQL FULLTEXT benchmarks on 1.1M Wikipedia articles. Reproducible with make bench-up.
head:
  - - meta
    - name: keywords
      content: MySQL FULLTEXT benchmark, MySQL search performance, full-text search benchmark, MygramDB performance
---

# Benchmarks

Tested on **1.1M Wikipedia articles** (1M English + 100K Japanese, avg. 666 chars per article) with MySQL 8.4 FULLTEXT (ngram parser). MygramDB v1.5.0 with `verify_text: all` and query cache disabled. All numbers are p50 over 10 iterations.

::: info Reproducible
Run these benchmarks yourself: `make bench-up && make bench-run` in the [repository](https://github.com/libraz/mygram-db).
:::

::: info Note on hardware
Measured on Apple M4 Max with 128GB unified memory. Unified memory has higher bandwidth than typical server DDR4/DDR5. On server hardware, absolute latencies will be higher for both engines, but the relative performance difference remains consistent.
:::

## Search Latency (SORT id LIMIT 100)

<BenchChart
  title="Search Latency (p50, log scale)"
  :data="[
    { label: 'Multi-word', mysql: 2566, mygramdb: 0.09 },
    { label: 'Medium-freq', mysql: 1874, mygramdb: 0.28 },
    { label: 'Low-freq', mysql: 507, mygramdb: 0.42 },
    { label: 'Rare term', mysql: 936, mygramdb: 0.08 },
  ]"
/>

| Query Type | Matches | MySQL | MygramDB | Speedup |
|------------|---------|-------|----------|---------|
| Multi-word ("quantum physics") | 104 | 2,566ms | 0.09ms | 27,600x |
| Medium-freq ("quantum") | 1,961 | 1,874ms | 0.28ms | 6,700x |
| Low-freq ("algorithm") | 2,498 | 507ms | 0.42ms | 1,200x |
| Rare ("fibonacci") | 84 | 936ms | 0.08ms | 11,600x |

## CJK Search Latency (SORT id LIMIT 100)

<BenchChart
  title="CJK Search Latency (p50, log scale)"
  :data="[
    { label: '日本 (high)', mysql: 1204, mygramdb: 1.1 },
    { label: '東京 (mid)', mysql: 300, mygramdb: 3.9 },
    { label: '科学 (low)', mysql: 4.2, mygramdb: 2.2 },
  ]"
/>

| Query | Matches | MySQL | MygramDB | Speedup |
|-------|---------|-------|----------|---------|
| 日本 | 32,282 | 1,204ms | 1.1ms | 1,100x |
| 東京 | 6,989 | 300ms | 3.9ms | 77x |
| 科学 | 1,551 | 4.2ms | 2.2ms | 1.9x |

## COUNT Performance

<BenchChart
  title="COUNT Latency (p50, log scale)"
  :data="[
    { label: 'Medium-freq', mysql: 1797, mygramdb: 0.08 },
    { label: 'Low-freq', mysql: 416, mygramdb: 0.08 },
  ]"
/>

| Query Type | Count | MySQL | MygramDB | Speedup |
|------------|-------|-------|----------|---------|
| Medium-freq ("quantum") | 1,961 | 1,797ms | 0.08ms | 21,600x |
| Low-freq ("algorithm") | 2,498 | 416ms | 0.08ms | 5,500x |

## Result Consistency (v1.5.0)

With `verify_text: all`, MygramDB produces **exact match** results with MySQL FULLTEXT:

| Query | MySQL | MygramDB | Match |
|-------|-------|----------|-------|
| quantum | 1,961 | 1,961 | exact |
| algorithm | 2,498 | 2,498 | exact |
| 日本 | 32,282 | 32,282 | exact |
| 科学 | 1,551 | 1,551 | exact |

Without `verify_text`, n-gram indexes may return false positives (e.g., "quantum" returns 58K instead of 1,961). This is inherent to n-gram tokenization and expected behavior.

## Concurrent Throughput

<BenchChart
  title="Throughput — Queries per Second (higher is better)"
  :data="[
    { label: '1 connection', mysql: 2, mygramdb: 2634 },
    { label: '4 connections', mysql: 8, mygramdb: 11766 },
  ]"
  unit=" QPS"
/>

Query: "algorithm", 10 seconds per level.

| Connections | MySQL QPS | MygramDB QPS | MySQL p50 | MygramDB p50 |
|-------------|-----------|-------------|-----------|-------------|
| 1 | 2 | 2,634 | 470ms | 0.35ms |
| 4 | 8 | 11,766 | 495ms | 0.32ms |

## Memory Usage

| Documents | Index | Documents + Text | Total RSS | Per 1M docs |
|-----------|-------|-----------------|-----------|-------------|
| 1,100,000 | 813MB | 1.54GB | 2.53GB | ~2.3GB |

::: tip verify_text modes
- `off` (default): Lower memory, but may include n-gram false positives
- `all`: Stores document text for post-filter verification. Exact results at the cost of ~1.5GB additional memory for 1.1M docs.
:::

## Why These Numbers?

See [Why MySQL FULLTEXT is Slow](/why) for architectural details, and [Comparison](/comparison) for how MygramDB compares to Elasticsearch.
