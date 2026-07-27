---
title: Benchmarks - MygramDB vs MySQL FULLTEXT
description: Reproducible MygramDB and MySQL FULLTEXT benchmarks on Wikipedia articles.
head:
  - - meta
    - name: keywords
      content: MySQL FULLTEXT benchmark, MySQL search performance, full-text search benchmark, MygramDB performance
---

# Benchmarks

The tables and charts below are rendered from the measured benchmark snapshot. The run uses the same dataset and query cache setting for every result shown here.

::: info Reproducible
Run the benchmark in a clone of the [repository](https://github.com/libraz/mygram-db):

```bash
# Requires Docker Compose and Rye.
make bench-up

# Wait for "Seed Data Load Complete" and MygramDB's "server_ready" log entry.
make bench-logs

make bench-run
make bench-down
```

`bench-down` removes the benchmark containers and volumes. The benchmark Compose configuration disables MygramDB's query cache.
:::

<BenchmarkResults />

::: tip `verify_text` modes

- `off` (default): Lower memory use, but n-gram false positives are possible.
- `all`: Stores document text for post-filter verification and returns the same counts as MySQL FULLTEXT in this run.
:::

See [Why MySQL FULLTEXT is Slow](/why) for architectural details, and [Comparison](/comparison) for product trade-offs.
