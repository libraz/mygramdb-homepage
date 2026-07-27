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
- **MySQL Version**: 8.4+ / 9.x, or MariaDB 10.6+/11.x
- **GTID Mode**: Must be enabled for MySQL; MariaDB uses its native GTID format
- **Binary Log Format**: ROW format required
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

-- Set to ROW format (add to my.cnf and restart)
SET GLOBAL binlog_format = ROW;
```

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
- Snapshots created via `DUMP SAVE` include the MySQL host/user/password. Store dump files on encrypted storage with restrictive permissions (e.g., `chmod 600`) and rotate them like any other secret.

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

```bash
# Trigger snapshot sync for a table
mygram-cli SYNC articles

# In a multi-database configuration
mygram-cli SYNC app_db.articles

# Check sync progress
mygram-cli SYNC STATUS
```

**See [SYNC Command Guide](/docs/sync-command) for detailed usage.**

### Legacy Behavior

To restore automatic snapshot building on startup:

```yaml
replication:
  auto_initial_snapshot: true   # Restore legacy behavior
  start_from: "snapshot"
```

In v1.8.0 and later, automatic startup snapshots require `start_from: "snapshot"` for both single-table and multi-table deployments.

**Benefits of manual sync:**
- Prevents unexpected MySQL load during server startup
- Allows operators to control when synchronization occurs
- Enables scheduled sync during off-peak hours
- Provides progress monitoring and cancellation

### Multi-table and Multi-database Snapshot Consistency

In v1.7.0 and later, every table has an effective identity of `<database>.<table>`. If all configured tables are in one database, bare names such as `articles` remain accepted. When the configuration spans two or more databases, use qualified names in `SYNC`, `SEARCH`, and all client APIs.

When replication is enabled and more than one table is configured, the initial snapshot uses one `START TRANSACTION WITH CONSISTENT SNAPSHOT` across the configured tables and captures a shared GTID. This keeps related tables aligned at the same MySQL point-in-time before binlog streaming resumes.

## Replication Start Options

Configure `replication.start_from` in your config file:

### snapshot (Recommended)

Starts from GTID captured during initial snapshot build:

```yaml
replication:
  start_from: "snapshot"
```

The diagram below traces that guarantee across the transaction boundary: the snapshot transaction opens and `gtid_executed` is captured in the same instant, table reads happen entirely inside that frozen view while new writes keep accumulating in the binlog, and streaming then resumes from precisely that captured GTID once the snapshot completes.

<DocDiagram name="gtid-snapshot-handoff" alt="A timeline showing that MygramDB captures gtid_executed the instant the consistent snapshot transaction opens, reads all table data inside that frozen view while new writes accumulate in the binlog, and then starts binlog streaming from exactly the captured GTID so no transaction is lost or applied twice." />

**How it works:**
- Uses `START TRANSACTION WITH CONSISTENT SNAPSHOT` for data consistency
- Captures `@@global.gtid_executed` at exact snapshot moment
- Guarantees no data loss between snapshot and binlog replication

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

### gtid=UUID:txn

Starts from specific GTID position:

```yaml
replication:
  start_from: "gtid=3E11FA47-71CA-11E1-9E33-C80AA9429562:100"
```

**When to use:**
- Manual recovery from specific point
- Testing or debugging

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

Clears all data and logs an error:

```sql
DROP TABLE articles;
```

If the dropped table provides a configured primary key, text source, or filter column, MygramDB stops replication before advancing the GTID. Restore a compatible schema or update the configuration, then run `SYNC` to rebuild the table.

#### ALTER TABLE

Changes unrelated to configured columns can continue after a warning. An incompatible change to a configured primary key, text source, or filter column stops replication before advancing the GTID:

```sql
ALTER TABLE articles ADD COLUMN new_col VARCHAR(100);
ALTER TABLE articles MODIFY COLUMN content TEXT;
```

**Recovery:** Fix the schema or configuration, then run `SYNC` to rebuild the table. Do not assume that a restart alone resumes replication after an incompatible DDL change.

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
- DECIMAL, FLOAT, DOUBLE

### Special Types
- JSON, BIT, NULL

## Replication Features

### GTID Consistency

- Snapshot and binlog replication are coordinated via consistent snapshot transaction
- No data loss between snapshot and replication

### GTID Position Tracking

- Atomic persistence with state file
- Automatic save on shutdown
- Resume on restart

### Automatic Validation

- Checks GTID mode on startup
- Clear error messages if not configured

### Automatic Reconnection

- Handles connection loss gracefully
- Exponential backoff retry (configurable)
- Continues from last GTID position

### Multi-threaded Processing

- Thread pool architecture for efficient request handling
- Configurable queue size for performance tuning

## Monitoring Replication

### Check Replication Status

Use the CLI or TCP protocol:

```bash
# Using CLI
./build/bin/mygram-cli REPLICATION STATUS

# Using telnet
echo "REPLICATION STATUS" | nc localhost 11016
```

Response:
```
OK REPLICATION
status: running
current_gtid: 3E11FA47-71CA-11E1-9E33-C80AA9429562:1-100
processed_events: 12345
queue_size: 0
END
```

### Stop Replication

Stop binlog replication (index becomes read-only):

```bash
./build/bin/mygram-cli REPLICATION STOP
```

### Start Replication

Resume binlog replication:

```bash
./build/bin/mygram-cli REPLICATION START
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
- Add more MygramDB replicas

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
3. Restart MygramDB (will rebuild snapshot)

## Best Practices

1. **Always use GTID mode** for consistent replication
2. **Use `snapshot` start mode** for initial setup
3. **Monitor replication lag** regularly
4. **Rebuild snapshot** after significant schema changes
5. **Test configuration** before deploying to production
6. **Keep state file** for crash recovery
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
  start_from: "snapshot"          # snapshot|latest|gtid=<UUID:txn>
  queue_size: 10000
  reconnect_backoff_min_ms: 500   # Reserved / not yet enforced
  reconnect_backoff_max_ms: 10000 # Reserved / not yet enforced
```

## See Also

- [SYNC Command Guide](/docs/sync-command) - Manual snapshot synchronization
- [Configuration Guide](/docs/configuration) - Full configuration reference
- [Protocol Reference](/docs/protocol) - REPLICATION commands
