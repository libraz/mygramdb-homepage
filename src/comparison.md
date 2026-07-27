---
title: MygramDB vs Elasticsearch vs MySQL FULLTEXT
description: Compare MygramDB, Elasticsearch, and MySQL FULLTEXT. See latency, deployment complexity, data sync, and when to use each solution.
head:
  - - meta
    - name: keywords
      content: MySQL FULLTEXT alternative, Elasticsearch alternative, MySQL vs Elasticsearch, full-text search comparison
---

# MygramDB vs Elasticsearch vs MySQL FULLTEXT

Choosing the right full-text search solution depends on your requirements. Here's a detailed comparison.

::: info The assumption behind this comparison
MygramDB targets one specific case: the system of record is already in MySQL or MariaDB, and only search needs to be faster. If you want a search engine at the center of your data platform, or you need distributed analytics, Elasticsearch and similar tools are the better fit.
:::

## Quick Comparison

| Feature | MygramDB | Elasticsearch | MySQL FULLTEXT |
|---------|----------|---------------|----------------|
| **Latency** | See benchmark | 50-500ms | See benchmark |
| **Deployment** | Single binary | Cluster | Built-in |
| **Data sync** | MySQL / MariaDB binlog | ETL required | Native |
| **Scalability** | Single node | Distributed | Single node |
| **Memory** | See benchmark | ~2-4GB/1M docs | Buffer pool |
| **Concurrency** | See benchmark | High | See benchmark |
| **Multibyte / Unicode** | N-gram (ICU NFKC) | Language plugins | N-gram parser |
| **Analytics** | Basic | Advanced | None |
| **Learning curve** | Low | High | Low |

## Detailed Comparison

### MygramDB

**Best for:** MySQL-based applications needing fast search without infrastructure complexity.

**Pros:**
- Cache-off benchmark results published with the test configuration
- Zero configuration data sync via binlog (MySQL 8.4/9.x and MariaDB 10.6+/11.x)
- Single binary deployment
- No cluster management
- Language-agnostic N-gram tokenization with first-class multibyte UTF-8 support
- BM25 relevance scoring, highlighting, fuzzy search, faceted aggregation, and synonym expansion (v1.6.0+)

**Cons:**
- Single node only (no distributed search)
- Data must fit in RAM

::: tip What "no ETL" actually means
Your application never pushes search documents anywhere. It does not mean zero setup: MySQL still needs GTID, ROW-format binlog, a replication user, and an initial `SYNC` per table.
:::

### Elasticsearch

**Best for:** Large-scale search with advanced analytics requirements.

**Pros:**
- Horizontal scalability
- Advanced features (fuzzy search, highlighting, aggregations)
- Rich ecosystem and tooling
- Handles petabytes of data

**Cons:**
- Complex cluster management
- ETL pipeline required
- Higher operational cost
- Steeper learning curve
- JVM tuning required

### MySQL FULLTEXT

**Best for:** Simple search on small datasets (<100K rows).

**Pros:**
- No additional infrastructure
- Native MySQL integration
- Zero data sync overhead

**Cons:**
- Query-dependent latency and throughput; see the cache-off benchmark
- Cache-dependent performance
- Limited scalability

## Performance Comparison

See [Benchmarks](/benchmarks) for the current cache-off results and full test configuration.

## Migration Path

### From MySQL FULLTEXT to MygramDB

1. Keep MySQL as primary database
2. Deploy MygramDB alongside
3. Point search queries to MygramDB
4. Write operations remain on MySQL

::: warning HTTP routes changed in v1.7.0
The HTTP API uses `/tables/{identity}/search` from v1.7.0 onward; the older `/{table}/search` form was removed. Check [Upgrade to v1.7](/docs/migration-v1.7) before migrating.
:::

```bash
# 1. Start MygramDB (in production, supply a config file or the environment variables your deployment needs)
docker run -d -p 11016:11016 -p 8080:8080 \
  -e MYSQL_HOST=your-mysql \
  ghcr.io/libraz/mygram-db:latest

# 2. After the initial sync, search via MygramDB
curl -X POST http://localhost:8080/tables/articles/search \
  -H "Content-Type: application/json" \
  -d '{"q": "search term"}'
```

### From Elasticsearch to MygramDB

Consider migrating if:
- You don't need distributed search
- Data fits in single-node RAM
- Operational complexity is a concern
- You want simpler MySQL integration

See [GitHub](https://github.com/libraz/mygram-db) for more details.
