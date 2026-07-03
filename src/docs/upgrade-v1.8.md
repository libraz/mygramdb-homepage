# v1.8 Upgrade Notes

MygramDB v1.8.0 is a correctness and reliability release. It has no breaking API changes, but one default changed: if `ngram_size` is omitted, the default is now `2` instead of `1`.

Most upgrades are straightforward. The items worth checking are configuration assumptions, HTTP clients that used to embed control clauses in `q`, and operational automation that starts `SYNC` while another maintenance task is running.

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

HTTP `q` is now treated as literal search text and request options are taken from JSON fields such as `limit`, `offset`, `sort`, `filters`, `highlight`, and `fuzzy`. During table synchronization, HTTP search/count/facet/get requests return `503` instead of racing the in-flight rebuild.

This means clients should send intent as structured JSON rather than as a command string:

```json
{
  "q": "quantum physics",
  "limit": 20,
  "sort": { "field": "created_at", "order": "desc" },
  "filters": [{ "field": "status", "op": "=", "value": 1 }]
}
```

Boolean queries also gained fixes for short terms under bigram indexing, quoted phrases containing `AND`/`OR`/`NOT`, the `<>` not-equal filter operator, and raw boolean query parsing in client libraries.

Date/time parsing now accepts date-only strings such as `2024-01-15` and truncates fractional epoch seconds to whole seconds.

`SYNC` is now rejected while `OPTIMIZE` or `DUMP SAVE`/`LOAD` is in progress; retry after the operation completes.

CLI `DOC` output now decodes escaped values such as `\n`, `\t`, `\\`, `\"`, and `\xHH` instead of passing them through verbatim.

## Upgrade Checklist

1. Review table configs that omit `ngram_size`.
2. Set `ngram_size: 1` explicitly only if you require the old unigram behavior.
3. Check that no configured filter uses `ENUM` or `SET`.
4. If `auto_initial_snapshot: true` is enabled, make sure `start_from: "snapshot"` is set.
5. Keep HTTP search options in JSON fields rather than embedding control clauses in `q`.
6. Expect temporary `503` responses from table read endpoints during `SYNC`; retry after readiness returns healthy.
7. Run your usual search and replication smoke tests after upgrade.

Full release notes are available in the [v1.8.0 release document](https://github.com/libraz/mygram-db/blob/main/docs/releases/v1.8.0.md).
