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
| **Latency** | [Measured](/benchmarks) | Not measured here | [Measured](/benchmarks) |
| **Deployment** | Separate search service | Single node or cluster | Built into MySQL |
| **Data sync** | MySQL / MariaDB binlog | Application or connector indexing | Native data |
| **Scaling** | Full replicas; application-managed partitions | Distributed indexes | Database-level replication or partitioning |
| **Memory** | [Measured](/benchmarks) | Depends on index and workload | Buffer pool and workload |
| **Multibyte / Unicode** | N-gram (ICU NFKC) | Configurable analyzers | Configurable parser |
| **Aggregation** | FACET | Aggregations | SQL queries |

## Detailed Comparison

### MygramDB

**Best for:** MySQL-based applications needing fast search without infrastructure complexity.

**Pros:**
- Cache-off benchmark results published with the test configuration
- Binlog-based data sync (MySQL 8.4/9.x and MariaDB 10.11+/11.x/12.x)
- Single binary deployment
- No cluster management
- Language-agnostic N-gram tokenization with first-class multibyte UTF-8 support
- BM25 relevance scoring, highlighting, fuzzy search, faceted aggregation, and synonym expansion

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

**Cons:**
- Complex cluster management
- Requires a separate data-indexing path when MySQL is the source of truth

### MySQL FULLTEXT

**Best for:** Search requirements already met by MySQL without a separate service.

**Pros:**
- No additional infrastructure
- Native MySQL integration
- Zero data sync overhead

**Cons:**
- Query-dependent latency and throughput; see the cache-off benchmark
- Performance depends on queries, buffer-pool state, and available resources

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

Follow the [Docker deployment guide](/docs/docker-deployment) to configure the MySQL source, credentials, bind addresses, and network allow list. Build the initial index with `SYNC` or enable `replication.auto_initial_snapshot`, then send search requests to MygramDB's TCP or HTTP API.

### From Elasticsearch to MygramDB

Consider migrating if:
- You don't need distributed search
- Data fits in single-node RAM
- Operational complexity is a concern
- You want simpler MySQL integration

See [GitHub](https://github.com/libraz/mygram-db) for more details.
