---
title: Upgrade to MygramDB v1.9
description: "Prepare a MygramDB deployment for v1.9.0: schema validation, dump compatibility, command changes, and Docker environment updates."
---

# Upgrade to v1.9

MygramDB v1.9.0 adds typed C/C++ search options, more faithful replication value decoding, and stricter validation. Most deployments upgrade without configuration changes, but review the checks below before replacing a running node.

## Before You Upgrade

### Check configured columns and collations

MygramDB now validates every configured primary-key, text-source, and filter column before replication starts. The following column types cannot be configured:

- `BINARY`
- `VARBINARY`
- `BLOB`

Character columns must use an `utf8mb4`, `utf8`/`utf8mb3`, or `ascii` collation. For example, a configured `latin1_swedish_ci` column now causes startup to fail instead of accepting data that cannot be represented consistently by the initial loader and binlog reader.

Inspect the columns referenced by your configuration, convert unsupported columns, or remove them from the table definition before upgrading.

### Check configuration identifiers

Table names, database names, primary keys, filter names, and text-source names are now checked as SQL identifiers while MygramDB reads the configuration. This blocks invalid names before they reach generated SQL.

Test the exact file that the service will load:

```bash
mygramdb -t /etc/mygramdb/config.yaml
```

### Replace bare `SAVE` and `LOAD`

The legacy commands are rejected in v1.9. Replace them in scripts and runbooks:

```mygram
# Before
SAVE mygramdb.dmp
LOAD mygramdb.dmp

# v1.9
DUMP SAVE mygramdb.dmp
DUMP LOAD mygramdb.dmp
```

`DUMP SAVE` remains asynchronous. Check `DUMP STATUS` before treating a backup as complete.

## Dumps and Restoration

v1.9 continues to write dump format v2, and both v1 and v2 dump files load in v1.9. Its embedded document-store payload is v3 and keeps pre-normalization text for accurate highlighting. Keep a compatible backup if you need to roll back to an older build.

`DUMP LOAD` now refuses a payload that would clear a non-empty replication position. Validate the dump and planned target before the maintenance window:

```mygram
DUMP VERIFY mygramdb.dmp
DUMP INFO mygramdb.dmp
```

## Docker Deployments

Regenerate `.env` from the current [environment template](https://github.com/libraz/mygram-db/blob/main/.env.example). The old `SNAPSHOT_DIR`, `SNAPSHOT_INTERVAL_SEC`, and `SNAPSHOT_RETAIN` variables are no longer part of the Docker surface. Use `DUMP_DIR`, `DUMP_INTERVAL_SEC`, and `DUMP_RETAIN` instead.

The current template also exposes BM25, cache, rate-limit, and TLS settings. A bind-mounted configuration file is preserved by the entrypoint rather than overwritten.

## Behavior Changes to Check

- `CONFIG VERIFY relative.yaml` resolves relative to the active configuration file, not the service working directory. Use absolute paths in automation when that distinction matters.
- `SHOW VARIABLES LIKE` accepts exactly one pattern. Existing calls such as `SHOW VARIABLES LIKE 'cache%'` continue to work.
- HTTP search and facet requests use literal `q` text by default. Send deliberate expressions with `"mode": "boolean"`.
- Boolean search terms now keep punctuation such as `c++`, `e-mail`, and version strings together. Test any parser-dependent query normalization in your application.

## New Configuration Surface

v1.9 makes TCP idle reaping and pending-frame limits configurable. The defaults are suitable for most deployments; set them only when connection behavior needs tuning:

```yaml
api:
  tcp:
    idle_timeout_sec: 300       # 0 disables idle reaping
    reaper_interval_sec: 5
    max_pending_frames: 1024
    max_pending_frame_bytes: 4194304
```

`mediumint` and `mediumint_unsigned` are also available filter types. See the [configuration reference](/docs/configuration) for the complete schema.

## Rollout Checklist

1. Validate the production configuration with `mygramdb -t`.
2. Check configured column types and collations.
3. Replace bare `SAVE` and `LOAD` calls with `DUMP SAVE` and `DUMP LOAD`.
4. Verify a current dump and retain a rollback-compatible copy.
5. Regenerate Docker environment files if you deploy with Compose.
6. Run a search and replication smoke test after the new node becomes ready.

For the complete change list, read the [v1.9.0 release notes](https://github.com/libraz/mygram-db/blob/main/docs/releases/v1.9.0.md).
