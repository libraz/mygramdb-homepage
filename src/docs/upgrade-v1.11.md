---
title: Upgrade to MygramDB v1.11
description: "Prepare for v1.11: full binlog row metadata, source and table validation, native client rebuilds, monitoring credentials, and recovery."
---

# Upgrade to v1.11

Before replacing a running node, enable full row metadata on the source, check the source and table requirements, rebuild native clients, and update monitoring credentials. If you are upgrading from before v1.10.2, also complete the [earlier upgrade checklist](/docs/upgrade-v1.10).

## Current patch checklist

Before rollout, review these operational changes:

1. `0.0.0.0/0` and `::/0` each admit IPv4 and IPv6 peers. Narrow `network.allow_cidrs` if an IPv4-only allow list was intended; see [Network Security](/docs/configuration).
2. Startup refuses a regular file at `api.unix_socket.path` and leaves it in place. Move the file or choose another path; see [API server settings](/docs/configuration).
3. A custom JSON schema supplied with `--schema` also constrains runtime `SET`; review the active rules in [Operations](/docs/operations).
4. `DUMP SAVE` returns `6029` until every configured table completes its initial load. Wait for readiness before saving; see [Snapshot and dump recovery](/docs/snapshot) for authenticated CLI automation.
5. Confirm each configured `primary_key` has an independent single-column `PRIMARY KEY` or `UNIQUE NOT NULL` constraint. Unsupported definitions are refused before the initial snapshot; see [Replication requirements](/docs/replication).

## Enable full binlog row metadata

MygramDB reads column names, signedness, and `ENUM`/`SET` labels from each binlog `TABLE_MAP` event. This keeps row decoding consistent with the schema that existed when the event was written. The source must run `binlog_row_metadata=FULL`, in addition to the existing `ROW` format and `FULL` row images.

On MySQL, apply and persist the setting:

```sql
SET PERSIST binlog_row_metadata = FULL;
```

On MariaDB, apply it to the running server and add it to the server configuration for future restarts:

```sql
SET GLOBAL binlog_row_metadata = FULL;
```

```ini
[mysqld]
binlog_row_metadata = FULL
```

Startup and reconnect checks reject another value with `2008`. Changing the setting does not rewrite older binlogs. Replaying a monitored table's `TABLE_MAP` without the required metadata stops replication with `2017`. If older events remain in the replay window, including a position restored from a dump, run `SYNC <table>` for every replicated table after changing the setting. Monitor each load with `SYNC STATUS` and wait for completion before starting the next.

## Check the source and tables

The [replication requirements](/docs/replication) describe the complete source setup. Check these conditions before rollout:

| Condition | Required action |
| --- | --- |
| The source is itself a replica | Enable `log_replica_updates` on MySQL or `log_slave_updates` on MariaDB. The MySQL account needs `REPLICATION CLIENT` for `SHOW REPLICA STATUS`. |
| MariaDB uses `binlog_storage_engine` | Use a source without engine-integrated binlogging; this mode lacks the required per-event checksum. |
| A monitored table is the child of a foreign key with `CASCADE`, `SET NULL`, or `SET DEFAULT` on update or delete | Use a schema that emits every child-row change in the binlog. MySQL 9.x with `innodb_native_foreign_keys=OFF` is exempt. |
| The configured key has no independent single-column unique constraint, or its only single-column unique constraint allows `NULL` | Use a single-column `PRIMARY KEY` or a single-column `UNIQUE NOT NULL` key. |
| Any MariaDB column uses old-format `TIME(n)`, `DATETIME(n)`, or `TIMESTAMP(n)` with `n > 0` | Rebuild the column with `ALTER TABLE ... MODIFY`; `SHOW COLUMNS` identifies this format with `/* mariadb-5.3 */`. |
| A configured column uses `year(2)` | Change it to a supported column type. |
| The source uses `lower_case_table_names=0` | Match the stored database and table names byte-exactly in the configuration. With other values, row events and DDL match ASCII case-insensitively. |

Source requirements are checked before the initial snapshot and on reconnect. Table requirements are checked at startup and after DDL. Partition and tablespace changes that replace table contents, and `CREATE OR REPLACE TABLE`, stop replication with `2017`; resolve the change and rebuild with `SYNC`. A `1236` source error requires `SYNC` only when its message identifies purged required GTIDs. Other `1236` errors stop with `2008` and preserve the source's diagnostic.

## Validate configuration and row sizes

Validate the production configuration before stopping a healthy node:

```bash
mygramdb -t /etc/mygramdb/config.yaml
```

This validates the file; it does not replace the live source and table checks at startup. Review these bounds:

- Enabled replication requires a non-zero `replication.server_id`, even when the file omits the `replication` block.
- `replication.start_from: gtid=...` must contain a valid MySQL GTID set or MariaDB `domain-server-seq` list. `UUID:N` means all transactions through N; MySQL transaction numbers must be below 2^63−1.
- IPv4-mapped IPv6 entries in `network.allow_cidrs` require a prefix of at least 96.
- `memory.hard_limit_mb` and `memory.soft_target_mb` must not exceed `2147483647`, even though these settings remain reserved.
- Runtime `SET` follows the configuration schema. Invalid values return `1004`, and a multi-assignment request applies all assignments or none.

Snapshot loading, `SYNC`, and replication enforce the same document limits as dumps: primary key 1 MiB, at most 1,000 filters, filter name 1 KiB, string filter value 64 KiB, and normalized and original text 16 MiB each. An oversized row fails loading or `SYNC`; during replication it reports an error without advancing the GTID. Correct the source data or configuration before recovery.

## Rebuild C and C++ clients

The native shared library is `libmygramclient.so.2`, with library version `2.0.0`. Rebuild C and C++ programs against the installed headers and library together:

- `SearchExpression` adds `required_is_group` and `excluded_is_group`, and removes `optional_terms`.
- `MygramParsedExpression_C` removes `optional_terms` and `optional_count`.

See the [native client reference](/docs/client-library). These are native struct layout changes; the library version is separate from the server release number.

## Authenticate replication monitoring

With `api.admin_token` set, TCP `INFO` omits its `# Replication` section until the connection completes `AUTH`. HTTP `/metrics` omits all `mygramdb_replication_` metrics unless the request supplies `Authorization: Bearer <token>`. Both commands remain available without authentication for their other statistics.

Update monitoring before rollout so missing protected values do not look like a replication outage. The [HTTP API guide](/docs/http-api) covers Prometheus credentials.

HTTP clients should also handle the current responses: an unqualified table name under a multi-database configuration returns `404`/`4007`; a MySQL-enabled build without a replication reader returns `200` with `{"enabled":false,"status":"not_configured"}` for `GET /replication/status`; and `GET /config` without loaded configuration returns `503`/`6026`. Invalid over-limit search parameters use `3000`, matching TCP.

## Verify the rollout

After restart, confirm readiness, run representative searches, and check authenticated replication status while the source receives writes. The dump format is unchanged and v1.10.2 dumps load without conversion, but their resume position can still point to events without full row metadata. After any required `SYNC`, create and verify a fresh dump with the [snapshot commands](/docs/snapshot).

`used_memory_index` includes per-term object and map overhead. `OPTIMIZE` and `DUMP SAVE` can therefore require more free memory than previously reported. `mygram-cli DUMP SAVE` takes the last non-empty token as the path; quote paths containing spaces and remove unsupported `-` flags.

See the [v1.11.1 release notes](https://github.com/libraz/mygram-db/blob/main/docs/releases/v1.11.1.md) for the full change list.
