---
title: FAQ - MygramDB
description: Frequently asked questions about MygramDB. Why MySQL FULLTEXT is slow, how to fix search timeout, and alternatives to Elasticsearch.
---

# Frequently Asked Questions

## MySQL FULLTEXT Problems

### Why is my MySQL FULLTEXT search so slow?

MySQL FULLTEXT becomes slow because:

1. **Disk I/O**: Indexes stored on disk require reading B-tree pages for every query
2. **Uncompressed posting lists**: Common terms matching millions of rows load megabytes of data
3. **Cache dependency**: Performance varies 2-3x between cold and warm cache
4. **Concurrency issues**: Under 10 concurrent connections, 90% of queries fail

**Solution**: MygramDB keeps everything in memory, delivering consistent sub-80ms latency.

### My MySQL FULLTEXT queries keep timing out under load. How do I fix it?

MySQL FULLTEXT doesn't handle concurrent queries well. At just 10 concurrent connections:
- 90% of queries fail
- QPS drops to 0.4
- Average response time exceeds 4 seconds

**Solution**: Add MygramDB as a search replica. It handles 100 concurrent queries with 100% success rate and QPS 372.

### Is there a way to speed up MySQL FULLTEXT without changing my application?

Yes. MygramDB syncs with MySQL via binlog replication. Your application continues writing to MySQL normally. Only route search queries to MygramDB.

```bash
docker run -d -p 11016:11016 \
  -e MYSQL_HOST=your-mysql \
  ghcr.io/libraz/mygram-db:latest
```

## MygramDB vs Alternatives

### Should I use Elasticsearch instead of MygramDB?

**Choose MygramDB if:**
- Data fits in single-node RAM
- You want simple deployment (single binary)
- Direct MySQL sync without ETL
- Sub-80ms consistent latency

**Choose Elasticsearch if:**
- You need distributed search across nodes
- Advanced features (fuzzy matching, highlighting, aggregations)
- Petabyte-scale data

### How much memory does MygramDB need?

Approximately 1-2GB per million documents. For 10M documents, plan for 10-20GB RAM.

### Does MygramDB support Japanese/Chinese/Korean text?

Yes. MygramDB uses ICU-based Unicode normalization with N-gram tokenization. CJK text works out of the box without additional plugins.

## Getting Started

### How do I migrate from MySQL FULLTEXT to MygramDB?

1. Keep MySQL as your primary database
2. Deploy MygramDB alongside (Docker or binary)
3. Configure MygramDB to replicate from MySQL
4. Route search queries to MygramDB
5. Continue writing to MySQL as usual

No data migration needed. MygramDB syncs automatically via binlog.

### How does MygramDB stay in sync with MySQL?

MygramDB uses GTID-based binlog replication, the same mechanism MySQL replicas use. When you INSERT, UPDATE, or DELETE in MySQL, MygramDB receives the change within milliseconds.

---

Have more questions? Check [GitHub](https://github.com/libraz/mygram-db) or open an issue.
