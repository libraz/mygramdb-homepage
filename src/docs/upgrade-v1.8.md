---
title: Upgrade to MygramDB v1.8
description: "Prepare a MygramDB deployment for the v1.8 line: the ngram_size default change, HTTP boolean search, SYNC conflict handling, and dump compatibility."
---

# Upgrade to v1.8

MygramDB v1.8.1 is a correctness and reliability release in the v1.8 line. It has no breaking API changes, but one default changed in v1.8.0: if `ngram_size` is omitted, the default is now `2` instead of `1`.

Most upgrades are straightforward. Check configuration assumptions, HTTP clients that need boolean expressions, and operational automation that starts `SYNC` while another maintenance task is running.

## What Changed

### Default ngram_size

The global default `ngram_size` is now `2` for ASCII/alphanumeric text. This matches the recommended bigram configuration used throughout the docs.

If you intentionally relied on the previous unigram default, set it explicitly:

```yaml
tables:
  - name: "articles"
    ngram_size: 1
    text_source:
      column: "content"
```

For typical English or mixed-language content, prefer:

```yaml
tables:
  - name: "articles"
    ngram_size: 2
    kanji_ngram_size: 1
```

### Config validation

`ENUM` and `SET` are now rejected as configured filter types, because binlog row events do not carry the labels needed to keep initial load and replication semantics identical. `auto_initial_snapshot: true` also requires `start_from: "snapshot"` in single-table deployments as well as multi-table deployments.

### Replication correctness fixes

v1.8.0 fixes several replication edge cases, including filter-only `UPDATE` events that could remove still-qualifying rows from search results, primary-key-changing `UPDATE` events that could leave stale indexed rows, and fail-fast handling for unsafe binlog states.

### Query and HTTP behavior

HTTP `q` is literal search text by default. Request options use JSON fields such as `limit`, `offset`, `sort`, `filters`, `highlight`, and `fuzzy`. Set `"mode": "boolean"` when `q` is an intentional boolean expression. During table synchronization, HTTP search/count/facet/get requests return `503` instead of racing the in-flight rebuild.

This means clients should send intent as structured JSON rather than as a command string:

```json
{
  "q": "quantum physics",
  "mode": "literal",
  "limit": 20,
  "sort": { "column": "created_at", "order": "DESC" },
  "filters": { "status": 1 }
}
```

Boolean queries gained fixes for short terms under bigram indexing, quoted phrases containing `AND`/`OR`/`NOT`, the `<>` not-equal filter operator, and raw boolean query parsing in client libraries.

### v1.8.1 reliability changes

v1.8.1 adds boolean filter columns, bounded V2 dump restore settings, and a size/versioned C client configuration with Unix-socket and asynchronous `DUMP SAVE` timeout settings. It also makes the HTTP allow list fail closed: only `/health/live` and `/health/ready` bypass the CIDR check.

Date/time parsing now accepts date-only strings such as `2024-01-15` and truncates fractional epoch seconds to whole seconds.

`SYNC` is now rejected while `OPTIMIZE` or `DUMP SAVE`/`LOAD` is in progress; retry after the operation completes.

CLI `DOC` output now decodes escaped values such as `\n`, `\t`, `\\`, `\"`, and `\xHH` instead of passing them through verbatim.

An incompatible `DROP`, `RENAME`, or semantic change to a configured primary-key, text-source, or filter column stops replication before its GTID advances. Fix the schema or configuration, then run `SYNC` to rebuild the affected table.

## Upgrade Checklist

1. Review table configs that omit `ngram_size`.
2. Set `ngram_size: 1` explicitly only if you require the old unigram behavior.
3. Check that no configured filter uses `ENUM` or `SET`.
4. If `auto_initial_snapshot: true` is enabled, make sure `start_from: "snapshot"` is set.
5. Keep HTTP search options in JSON fields. Add `"mode": "boolean"` only for intentional boolean expressions.
6. Expect temporary `503` responses from table read endpoints during `SYNC`; retry after readiness returns healthy.
7. After changing configured columns, confirm replication remains healthy; if it stopped for an incompatible DDL change, fix it and run `SYNC`.
8. Run your usual search and replication smoke tests after upgrade.

Full release notes are available in the [v1.8.1 release document](https://github.com/libraz/mygram-db/blob/main/docs/releases/v1.8.1.md).
