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

- `off` (default): Skips text verification, so n-gram false positives can remain. Normalized text is retained in every mode.
- `all`: Checks candidates against normalized text for substring matches. The tested queries returned the same counts as MySQL FULLTEXT in this run; this does not guarantee equivalent semantics for every query.
:::

See [Why MySQL FULLTEXT is Slow](/why) for architectural details, and [Comparison](/comparison) for product trade-offs.
