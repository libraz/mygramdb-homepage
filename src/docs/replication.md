---
title: MygramDB MySQL Replication - GTID Binlog Streaming Setup
description: Configure real-time MySQL replication for MygramDB. GTID mode, ROW binlog format, replication user privileges, start modes, supported DML/DDL operations, and troubleshooting.
head:
  - - meta
    - name: keywords
      content: MygramDB replication, MySQL GTID, binlog streaming, ROW binlog format, replication user, snapshot start mode, MySQL replica
---

# MySQL Replication Guide

MygramDB supports real-time replication from MySQL using GTID-based binlog streaming with guaranteed data consistency.

::: info What is replication?
**Replication** continuously propagates changes from MySQL to another process. To replace MySQL full-text search, MygramDB keeps reading the MySQL binlog and updating its search index.
:::

## Prerequisites

### MySQL Server Requirements

::: info Why ROW-format binlog
**ROW format** records which rows changed and how. MygramDB updates its index from the post-change row data, so STATEMENT format is not sufficient.
:::

MygramDB requires:
- **Supported database matrix**: MySQL 8.4 and 9.7, or MariaDB 10.11, 11.8, and 12.3
- **GTID Mode**: Must be enabled for MySQL; MariaDB uses its native GTID format
- **Binary Log Format**: ROW format required
- **Row metadata**: `binlog_row_metadata=FULL` is required so each `TABLE_MAP` event includes column names
- **Privileges**: Replication user needs specific privileges

### Enable GTID Mode

Check if GTID mode is enabled:

```sql
SHOW VARIABLES LIKE 'gtid_mode';
```

If GTID mode is OFF, enable it:

```sql
-- Enable GTID mode
SET GLOBAL enforce_gtid_consistency = ON;
SET GLOBAL gtid_mode = OFF_PERMISSIVE;
SET GLOBAL gtid_mode = ON_PERMISSIVE;
SET GLOBAL gtid_mode = ON;
```

MariaDB does not use MySQL's `gtid_mode` and `enforce_gtid_consistency` variables. Set a unique `server_id`, enable binary logging, and use `binlog_format=ROW`.

::: warning Persist the setting too
`SET GLOBAL` applies to the running MySQL but can revert after a restart. In production, also put `gtid_mode=ON` and `enforce_gtid_consistency=ON` into `my.cnf` or whatever manages your MySQL configuration.
:::

::: tip On MariaDB
MariaDB is similar to MySQL but expresses GTIDs differently. MygramDB detects the server flavor automatically, so the same `mysql` config section works for both.
:::

### Configure Binary Log

Ensure binary logging is enabled with ROW format:

```sql
-- Check binary log format
SHOW VARIABLES LIKE 'binlog_format';
SHOW VARIABLES LIKE 'binlog_row_metadata';

-- Set to ROW format (add to my.cnf and restart)
SET GLOBAL binlog_format = ROW;
```

`binlog_row_metadata` is dynamic. On MySQL, run `SET PERSIST binlog_row_metadata = FULL`; on MariaDB, run `SET GLOBAL binlog_row_metadata = FULL` and add `binlog_row_metadata = FULL` to the server's `[mysqld]` configuration so it survives restart. Add the same setting to `[mysqld]` in the server configuration file alongside `binlog_format` and `binlog_row_image`.

::: code-group

```sql [MySQL]
SET PERSIST binlog_row_metadata = FULL;
```

```sql [MariaDB]
SET GLOBAL binlog_row_metadata = FULL;
```

:::

Events already written without full metadata stay that way. If those events are still in the replay window, run `SYNC` for every replicated table after changing the source setting. A monitored table event missing metadata stops replication with `2017` and names the required setting; malformed optional metadata also stops with `2017`.

Keep event-level binlog compression disabled. MygramDB does not decode MySQL
`TRANSACTION_PAYLOAD_EVENT` output from `binlog_transaction_compression` or
MariaDB compressed query/row events from `log_bin_compress`. This is separate
from MariaDB `COMPRESSED` `VARCHAR`/`TEXT` row columns, which MygramDB inflates
and decodes as part of an ordinary row event.

### Source and table validation

MygramDB validates the source before building a snapshot and repeats the checks on every reconnect. It also validates each configured table at startup and after DDL that affects it. A failure stops replication with the listed code.

| Requirement | Refusal |
| --- | --- |
| MySQL `gtid_mode=ON` | `2006` |
| `binlog_format=ROW`, `binlog_row_image=FULL`, and `binlog_row_metadata=FULL` | `2008` |
| `binlog_checksum=CRC32`, no binlog transaction/event compression, and no MySQL `PARTIAL_JSON` row values | `2008` |
| A source that is itself a replica has `log_replica_updates=ON` on MySQL or `log_slave_updates=ON` on MariaDB | `2008` |
| MariaDB has `binlog_storage_engine` unset | `2008` |
| MySQL `gtid_executed` contains no tagged GTID (`UUID:tag:txn`) | `2005` |

When checking a MySQL source for replica status, MygramDB runs `SHOW REPLICA STATUS`; the replication account therefore needs `REPLICATION CLIENT`. MariaDB's check uses `gtid_slave_pos` and does not need that extra query privilege.

Each monitored table's `primary_key` must have an independent single-column `PRIMARY KEY` or `UNIQUE NOT NULL` constraint. A nullable single-column unique key is refused with `2012`; if uniqueness comes only from a composite `PRIMARY KEY` or `UNIQUE` key, the column is refused with `2011`. A column that also appears in a composite key is accepted when it has its own qualifying single-column constraint. A table that is the child of a foreign key with `ON UPDATE` or `ON DELETE CASCADE`, `SET NULL`, or `SET DEFAULT` is refused with `2012`, because InnoDB does not write row events for those child changes. MySQL 9.x with `innodb_native_foreign_keys=OFF` is exempt because the server writes an event for every child row.

On MariaDB, any column in the table, including an unconfigured column, using old-format `TIME(n)`, `DATETIME(n)`, or `TIMESTAMP(n)` with `n > 0` is refused with `2012`; TABLE_MAP does not carry its width. The same types with `n = 0` are accepted. A configured `year(2)` column is also refused with `2012`. Changes to a configured column's type, nullability, collation, generated kind, or generated expression are treated as schema changes.

Name matching follows the source's `lower_case_table_names`. With `0`, database and table names in both row events and DDL must match configured names byte-for-byte. With any other value, both paths match ASCII case-insensitively.

Snapshot loading, `SYNC`, and binlog ingestion enforce the same document limits in bytes: primary keys 1 MiB, 1,000 filters per document, filter names 1 KiB, string filter values 64 KiB, and normalized and original text 16 MiB each. An over-limit row fails the initial load or `SYNC`; during replication the error is reported without advancing the GTID position.

### Create Replication User

::: info Why binlog_row_image=FULL is required
To update text columns, primary keys, and filter columns correctly on `UPDATE` and `DELETE`, MygramDB needs enough of the row in the binlog. `MINIMAL` can omit columns it depends on.
:::

Create a user with replication privileges:

```sql
-- Create replication user
CREATE USER 'repl_user'@'%' IDENTIFIED BY 'your_password';

-- Grant replication privileges (for binlog reading and GTID information)
GRANT REPLICATION SLAVE, REPLICATION CLIENT ON *.* TO 'repl_user'@'%';

-- Grant SELECT privilege for snapshot creation (REQUIRED)
-- Note: SELECT privilege on target tables is necessary for snapshot building
GRANT SELECT ON database_name.table_name TO 'repl_user'@'%';

-- Apply changes
FLUSH PRIVILEGES;
```

**Important Notes:**

1. **REPLICATION CLIENT privilege is required**: Necessary for retrieving GTID information
2. **SELECT privilege is required**: Necessary for reading table data during initial snapshot creation
3. **No restart required**: `GRANT` statements are applied online and take effect immediately
4. **Principle of least privilege**: When synchronizing multiple tables, grant SELECT privilege for each table individually

### Security Considerations

- MySQL credentials are transmitted in plain text unless your MySQL server requires TLS. Place MygramDB close to MySQL on a trusted network, or terminate TLS/SSH tunnels in front of it when replicating across untrusted links.
- Snapshots created via `DUMP SAVE` include MySQL source metadata such as host, port, and database; user and password are not recorded. Store dump files on protected storage with restrictive permissions (e.g., `chmod 600`) because they contain indexed content and source endpoint details.

## Manual Snapshot Synchronization

MygramDB supports **manual snapshot synchronization** to prevent unexpected load on the MySQL primary during startup.

### Configuration

By default, MygramDB **no longer automatically builds snapshots on startup**:

```yaml
replication:
  enable: true
  auto_initial_snapshot: false  # Default: false (safe by default)
  server_id: 12345
  start_from: "snapshot"
```

### Manual SYNC Command

Use the `SYNC` command to manually trigger snapshot synchronization:

The production examples below assume `api.admin_token` is configured. If it is empty, `AUTH` is not required; non-loopback deployments should configure a token.

```text
$ mygram-cli
127.0.0.1:11016> AUTH <token>
OK AUTHENTICATED
127.0.0.1:11016> SYNC app_db.articles
OK SYNC STARTED table=app_db.articles
127.0.0.1:11016> SYNC STATUS
```

Use `SYNC articles` instead in a single-database configuration.

**See [SYNC Command Guide](/docs/sync-command) for detailed usage.**

### Automatic startup snapshot

To restore automatic snapshot building on startup:

```yaml
replication:
  auto_initial_snapshot: true
  start_from: "snapshot"
```

When automatic startup snapshots are enabled, use `start_from: "snapshot"` for both single-table and multi-table deployments.

**Benefits of manual sync:**
- Prevents unexpected MySQL load during server startup
- Allows operators to control when synchronization occurs
- Enables scheduled sync during off-peak hours
- Provides progress monitoring and cancellation

### Multi-table and Multi-database Snapshot Consistency

Every table has an effective identity of `<database>.<table>`. If all configured tables are in one database, bare names such as `articles` remain accepted. When the configuration spans two or more databases, use qualified names in `SYNC`, `SEARCH`, and all client APIs.

When replication is enabled and more than one table is configured, all configured tables are read in one `START TRANSACTION WITH CONSISTENT SNAPSHOT`. MySQL captures a shared conservative GTID lower bound before that transaction; a short interval of changes may be replayed idempotently. MariaDB records the exact binlog position of the snapshot and converts it to a GTID with `BINLOG_GTID_POS`.

## Replication Start Options

Configure `replication.start_from` in your config file:

### snapshot (Recommended)

On MySQL, starts from the conservative GTID lower bound captured before the initial snapshot transaction. On MariaDB, starts from the exact binlog position captured by the snapshot and converted to a GTID:

```yaml
replication:
  start_from: "snapshot"
```

The diagram below illustrates the MySQL handoff across the transaction boundary: MygramDB captures a conservative GTID position before opening the consistent snapshot transaction, reads tables inside that frozen view while new writes keep accumulating in the binlog, and then streams from that lower bound after the snapshot completes. A commit in the interval between capture and transaction start may be replayed. MariaDB instead resumes from the snapshot's own binlog position.

<DocDiagram name="gtid-snapshot-handoff" alt="A MySQL timeline showing that MygramDB captures a conservative GTID lower bound before opening the consistent snapshot transaction, reads table data inside that frozen view while new writes accumulate in the binlog, and then starts streaming from the lower bound so commits are not missed even if one is replayed." />

**How it works:**
- Uses `START TRANSACTION WITH CONSISTENT SNAPSHOT` for data consistency
- MySQL captures a conservative GTID lower bound before opening the snapshot transaction; MariaDB records the snapshot's exact binlog position
- MySQL avoids missing commits by allowing commits in the short pre-transaction interval to be applied again idempotently

**When to use:**
- Initial setup (recommended for most cases)
- When you need a consistent point-in-time view
- When starting from scratch

### latest

Starts from current GTID position (ignores historical data):

```yaml
replication:
  start_from: "latest"
```

**How it works:**
- MySQL uses `SHOW BINARY LOG STATUS`; MariaDB uses `SELECT @@GLOBAL.gtid_binlog_pos`
- Only captures changes after MygramDB starts

**When to use:**
- When you only need real-time changes
- When historical data is not important

### `gtid=<position>`

Starts from a validated GTID set or list. MySQL accepts `UUID:txn[-txn]` intervals, comma-separated by source UUID; transaction numbers must be below `2^63−1`. MariaDB accepts comma-separated `domain-server-seq` entries under its own grammar.

```yaml
replication:
  start_from: "gtid=3E11FA47-71CA-11E1-9E33-C80AA9429562:100"
```

**When to use:**
- Manual recovery from specific point
- Testing or debugging

A MySQL position written as `UUID:txn` means through `txn`; MygramDB widens it to `UUID:1-txn` so reconnects do not request earlier transactions. A value accepted by neither server's GTID grammar is rejected before it reaches `SET GTID_NEXT`.

## Supported Operations

### DML Operations

MygramDB automatically handles:

- **INSERT** (WRITE_ROWS events)
  - Adds new documents to index and store
- **UPDATE** (UPDATE_ROWS events)
  - Updates document content and filters
  - Re-indexes text if changed
- **DELETE** (DELETE_ROWS events)
  - Removes document from index and store

### DDL Operations

::: warning Consider a resync after a schema change
If you change a column referenced by `text_source`, `primary_key`, `filters`, or `required_filters`, fix the schema or the configuration and then rebuild with `SYNC`. A restart alone does not resume replication.
:::

MygramDB handles these DDL operations:

#### TRUNCATE TABLE

Automatically clears index and document store for the target table:

```sql
TRUNCATE TABLE articles;
```

MygramDB will:
- Clear all documents from the table
- Clear all posting lists
- Reset document ID counter

#### DROP TABLE

```sql
DROP TABLE articles;
```

MygramDB detects a configured table anywhere in a multi-table `DROP TABLE` list. It stops replication before advancing the GTID and leaves the current index and document store in place; the configured table is not cleared automatically. Restore a compatible schema or update the configuration, then run `SYNC` to rebuild the table.

#### ALTER TABLE

Changes unrelated to configured columns can continue after a warning. An incompatible change to a configured primary key, text source, or filter column stops replication before advancing the GTID:

```sql
ALTER TABLE articles ADD COLUMN new_col VARCHAR(100);
ALTER TABLE articles MODIFY COLUMN content TEXT;
```

**Recovery:** Fix the schema or configuration, then run `SYNC` to rebuild the table. Do not assume that a restart alone resumes replication after an incompatible DDL change.

#### RENAME TABLE and `ALTER TABLE ... RENAME TO`

MygramDB recognizes renames in both directions, including `ALTER TABLE ... RENAME TO`, `ALTER TABLE ... AS`, and a rename onto a configured table name:

```sql
ALTER TABLE articles_archive RENAME TO articles;
ALTER TABLE articles RENAME TO articles_archive;
RENAME TABLE articles_archive TO articles;
```

The reader matches both the old and new qualified names before advancing the
GTID. A rename that changes a configured table identity stops replication;
update the configuration and run `SYNC` after the schema is in its intended
state.

Partition `DROP`, `TRUNCATE`, `EXCHANGE`, or `CONVERT`, tablespace `DISCARD` or
`IMPORT`, and `CREATE OR REPLACE TABLE` stop replication with `2017` when they
remove, replace, or move rows of a configured table without row events. Run
`SYNC` after addressing the change. `DROP DATABASE` of a configured database
stops with `2012`, regardless of identifier case. Ordinary `TRUNCATE TABLE`
continues to clear the table's index and document store as described above.

## Supported Column Types

MygramDB can replicate these MySQL column types:

### Integer Types
- TINYINT, SMALLINT, INT, MEDIUMINT, BIGINT (signed/unsigned)

### String Types
- VARCHAR, CHAR, TEXT, ENUM, SET

Configured primary-key, text-source, and filter columns cannot use `BINARY`, `VARBINARY`, or `BLOB`. Character columns used by the configuration must have an `utf8mb4`, `utf8`/`utf8mb3`, or `ascii` collation.

### Date/Time Types
- DATE, TIME, DATETIME, TIMESTAMP (with fractional seconds)

### Numeric Types
- DECIMAL, DOUBLE

### Special Types
- BIT

`FLOAT` is decoded from the binlog but is refused for configured primary-key,
text-source, filter, and required-filter columns because the result-set and
row-image paths do not preserve the same value. `JSON`, `GEOMETRY` and its
subtypes, `VECTOR`, `BINARY`, `VARBINARY`, `BLOB`, `ZEROFILL`, and unknown
column types are also refused for configured columns. MariaDB `COMPRESSED`
`VARCHAR`/`TEXT` row columns are inflated before indexing, including the
uncompressed, raw-deflate, and zlib payload forms, and are supported when
their declared text type and collation pass the same checks.

### Required-filter time values

The same required-filter predicate is used by the initial `SELECT` and by
binlog row events. Text values compare as stored bytes, `TIMESTAMP` values
compare as UTC epochs, and `TIME` values use clock seconds. `DATETIME`,
`TIMESTAMP`, and `TIME` filter values may include fractional seconds, and both
paths apply the same precision and timezone rules; `DATE` keeps date-only
semantics. Use a plain date/time literal with the configured
`mysql.datetime_timezone`; trailing `Z` or numeric offsets in a filter value
are rejected.

### TABLE_MAP metadata

MygramDB consumes each column's `TABLE_MAP` metadata before it decides whether
the table is configured. An unknown or unsizeable type therefore stops the
reader with `2017` even for an unconfigured table in the streamed binlog; the
same event remains at the last applied GTID, so reconnecting alone meets it
again. Missing or malformed optional metadata stops a monitored table with
`2017`. Optional metadata for an unconfigured table, or for rows covered by
its `SYNC` snapshot, is not parsed; base `TABLE_MAP` column-type metadata is
still decoded for every streamed table so row widths can be determined. The
source must have `binlog_row_metadata=FULL` when it writes monitored table
events. The metadata decoder consumes each type's byte order and payload
length, including `DECIMAL`, `CHAR`, `ENUM`, `SET`, `JSON`, and `GEOMETRY`, for
the supported MySQL 8.4/9.7 and MariaDB 10.11/11.8/12.3 streams.
Configured-column acceptance still follows the restrictions above.

An unrecognized event type is skipped only when its header sets the ignorable
flag (`LOG_EVENT_IGNORABLE_F`). Without that flag, replication stops with
`2017`.

## Replication Features

### GTID Consistency

- Snapshot and binlog replication are coordinated via a consistent snapshot transaction
- MySQL uses a conservative GTID lower bound, so commits in the short pre-transaction interval may be replayed idempotently; MariaDB records the snapshot's exact binlog position

### GTID Position and Recovery

- `start_from: snapshot` uses the MySQL lower bound or MariaDB snapshot position; `latest` and an explicit `gtid=...` use the configured starting position
- `DUMP SAVE` records its GTID in the dump; `DUMP LOAD` or startup restore sets that GTID as the reader's next position. A manual `DUMP LOAD` leaves a reader that was already stopped in the stopped state.
- An initial `SYNC` captures a MySQL lower bound or the exact MariaDB snapshot position; its normal handoff restarts the shared reader from the drained pre-SYNC GTID, while the `2017` recovery path uses the snapshot marker to pass the undecodable interval

### Automatic Validation

- Checks GTID mode on startup
- Clear error messages if not configured

### Automatic Reconnection

- Handles connection loss gracefully
- Uses the built-in retry schedule; `reconnect_backoff_min_ms` and `reconnect_backoff_max_ms` are reserved and are not applied
- Continues from the reader's last processed GTID while the process remains running

### Multi-threaded Processing

- Thread pool architecture for efficient request handling
- Configurable queue size for performance tuning

## Monitoring Replication

### Check Replication Status

Use one authenticated CLI connection:

```text
$ ./build/bin/mygram-cli
127.0.0.1:11016> AUTH <token>
OK AUTHENTICATED
127.0.0.1:11016> REPLICATION STATUS
```

Response:
```
OK REPLICATION
status: running
current_gtid: 3E11FA47-71CA-11E1-9E33-C80AA9429562:1-100
processed_events: 12345
queue_size: 0
crc_errors: 0
schema_incompatible: false
last_error_code: 0
last_error:
last_applied_unixtime: 1790553600
seconds_since_last_applied: 0
END
```

### Stop Replication

Stop binlog replication (index becomes read-only):

```text
$ ./build/bin/mygram-cli
127.0.0.1:11016> AUTH <token>
OK AUTHENTICATED
127.0.0.1:11016> REPLICATION STOP
```

### Start Replication

Resume binlog replication:

```text
$ ./build/bin/mygram-cli
127.0.0.1:11016> AUTH <token>
OK AUTHENTICATED
127.0.0.1:11016> REPLICATION START
```

## Troubleshooting

### "GTID mode is not enabled on MySQL server"

**Solution**: Enable GTID mode on MySQL server:

```sql
SET GLOBAL enforce_gtid_consistency = ON;
SET GLOBAL gtid_mode = OFF_PERMISSIVE;
SET GLOBAL gtid_mode = ON_PERMISSIVE;
SET GLOBAL gtid_mode = ON;
```

Then restart MygramDB.

### "Binary log format is not ROW"

**Solution**: Set binary log format to ROW:

```sql
SET GLOBAL binlog_format = ROW;
```

Or add to `my.cnf` and restart MySQL:

```ini
[mysqld]
binlog_format = ROW
```

### "Replication lag is high"

**Possible causes:**
- High write volume on MySQL
- Insufficient MygramDB resources
- Network latency

**Solutions:**
- Increase `replication.queue_size` in config
- Add more MygramDB replicas or reduce upstream write pressure. `build.parallelism`
  is reserved / not yet enforced by the current snapshot loader.

Use `replication_seconds_since_last_applied` together with MySQL write activity and the reader state. The timestamp advances with the applied GTID, so a large value means no event has been applied recently; it does not by itself prove a lagging reader when the source is idle. `/health/ready` returns `503` when replication is unavailable, while `INFO` exposes the same overall readiness and `data_initialized` state.

### "Lost connection to MySQL server during query"

MygramDB will automatically reconnect using the built-in retry schedule.
The backoff fields below are accepted for forward compatibility but are not
enforced today:

```yaml
replication:
  reconnect_backoff_min_ms: 500
  reconnect_backoff_max_ms: 10000
```

### "Schema mismatch after ALTER TABLE"

**Solution**: Rebuild snapshot after schema changes:

1. Stop MygramDB
2. Update config file to match new schema
3. Restart MygramDB
4. Run `SYNC` to rebuild the affected table

### Recovering from an undecodable binlog event

If replication stops with error code `2017`, the stream encountered an event this build cannot decode, such as missing or malformed TABLE_MAP metadata for a monitored table, a TABLE_MAP column type this build cannot size, an XA prepare event, a MySQL `TRANSACTION_PAYLOAD_EVENT`, a `PARTIAL_UPDATE_ROWS_EVENT`, or a MariaDB event compressed by `log_bin_compress`. Event-level MariaDB compression remains unsupported. Changing the server setting that produced an already-written event does not remove it, so starting again from the old GTID stops at the same place.

This is different from a MariaDB `COMPRESSED` `VARCHAR`/`TEXT` column inside an
ordinary row event. MygramDB inflates that column before indexing; an invalid,
unknown, or corrupt column payload is a row-decoding failure reported as error
`2008` and follows normal reconnect handling. It is not the `2017` recovery
case.

Run `SYNC` for the table that is most important first, wait for it to complete with `replication=STARTED`, then run `SYNC` for every other replicated table. That first SYNC restarts the shared reader from the new snapshot marker and skips the undecodable interval. A table that you do not rebuild keeps its prior state for writes from that skipped interval.

For every other replication failure, SYNC uses the drained position rather than skipping an interval. See [SYNC command](/docs/sync-command#error-2017-undecodable-binlog-event) for the command sequence.

MySQL reports fatal binlog dump failures as error `1236`. Only a message saying that the required GTIDs were purged is treated as an unavailable position and directs recovery to `SYNC`. A replica that is ahead of the source, an oversized packet, or a corrupt/truncated binlog stops with `2008` and the server's message. On MariaDB, `REPLICATION START` refuses a purged position before starting.

## Best Practices

1. **Always use GTID mode** for consistent replication
2. **Use `snapshot` start mode** for initial setup
3. **Monitor replication lag** regularly
4. **Rebuild snapshot** after significant schema changes
5. **Test configuration** before deploying to production
6. **Use `DUMP SAVE` or `SYNC`** to establish a recoverable GTID and data set
7. **Use multiple replicas** for high availability

## Configuration Example

Complete replication configuration:

```yaml
mysql:
  host: "127.0.0.1"
  port: 3306
  user: "repl_user"
  password: "your_password"
  database: "mydb"
  use_gtid: true
  binlog_format: "ROW"
  binlog_row_image: "FULL"

replication:
  enable: true
  server_id: 83917                # Unique value from 1 to 4294967295
  start_from: "snapshot"          # snapshot|latest|gtid=<position>
  queue_size: 10000
  reconnect_backoff_min_ms: 500   # Reserved / not yet enforced
  reconnect_backoff_max_ms: 10000 # Reserved / not yet enforced
```

## See Also

- [SYNC Command Guide](/docs/sync-command) - Manual snapshot synchronization
- [Configuration Guide](/docs/configuration) - Full configuration reference
- [Protocol Reference](/docs/protocol) - REPLICATION commands
