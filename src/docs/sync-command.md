---
title: MygramDB SYNC Command - Manual Snapshot Synchronization
description: Use the SYNC command to manually control snapshot synchronization from MySQL to MygramDB. SYNC and SYNC STATUS usage, status fields, command conflicts, scenarios, and graceful shutdown.
head:
  - - meta
    - name: keywords
      content: MygramDB SYNC command, manual snapshot, SYNC STATUS, auto_initial_snapshot, multi-table sync, snapshot synchronization, MySQL load
---

# SYNC Command Usage

## Overview

::: info What is snapshot synchronization?
**Snapshot synchronization** reads the target MySQL/MariaDB table with `SELECT` and builds the MygramDB search index from its contents at that moment. When it finishes, binlog replication normally resumes from the drained pre-SYNC GTID; the `2017` recovery path uses the snapshot marker to pass the undecodable interval. MySQL captures a conservative GTID lower bound before the snapshot opens; MariaDB converts the snapshot's own binlog file and position to a GTID.
:::

The `SYNC` command allows manual control over snapshot synchronization from MySQL to MygramDB. This prevents unexpected load on the MySQL master server during startup.

The production examples use `api.admin_token`. If it is empty, `AUTH` is not required; configure a token for non-loopback deployments.

## Configuration

### Default Behavior (Safe by Default)

MygramDB **does not automatically build snapshots on startup by default**:

```yaml
replication:
  enable: true
  auto_initial_snapshot: false  # Default: false (safe by default)
  server_id: 12345
  start_from: "snapshot"
```

### Automatic Snapshot on Startup

To restore the previous automatic snapshot behavior:

```yaml
replication:
  enable: true
  auto_initial_snapshot: true
  server_id: 12345
  start_from: "snapshot"
```

When `auto_initial_snapshot` is enabled, use `start_from: "snapshot"` for both single-table and multi-table deployments.

## Commands

### SYNC - Trigger Snapshot Synchronization

::: warning Check before running
`SYNC` reads the whole target table from MySQL, so large tables put real read load on the server. In production, confirm the time window, the replication user's privileges, `network.allow_cidrs`, and available memory before starting one.
:::

Manually trigger snapshot synchronization for a specific table.

**Syntax:**
```mygram
SYNC <table_name>
```

`<table_name>` can be a bare table name in single-database configurations. In multi-database configurations, use `<database>.<table>`.

**Example:**
```text
$ mygram-cli
127.0.0.1:11016> AUTH <token>
OK AUTHENTICATED
127.0.0.1:11016> SYNC app_db.articles
OK SYNC STARTED table=app_db.articles
```

Use `SYNC articles` in a single-database configuration.

**Response (Success):**
```mygram
OK SYNC STARTED table=articles
```

**Response (Error):**
```mygram
ERROR 4011 SYNC already in progress for 'articles'
ERROR 4012 Memory critically low. Cannot start SYNC.
ERROR 4010 Table 'products' not found
```

**Behavior:**
- Runs asynchronously in the background
- Returns immediately after starting
- Builds snapshot from MySQL SELECT query
- Captures a conservative pre-snapshot GTID on MySQL, or the snapshot's exact binlog position converted to a GTID on MariaDB
- Drains replication and normally restarts it from the drained pre-SYNC GTID, so commits for other tables are not skipped; the `2017` recovery path uses the snapshot marker to pass the undecodable interval

### SYNC STOP - Cancel Synchronization

```mygram
SYNC STOP [<table_name>]
```

Cancellation is asynchronous. Continue checking `SYNC STATUS` after it reports `CANCELLING` until the operation reaches `CANCELLED` or another terminal state.

The initial load observes the cancellation request while connecting, reading,
and building the snapshot, so `SYNC STOP` cancels a running load promptly. A
shutdown signal requests the same cancellation; if the loader is waiting for
an in-flight MySQL operation, completion remains bounded by the configured
`read_timeout_ms`.

### SYNC STATUS - Check Synchronization Progress

::: tip Reading the progress output
`progress` is an approximate count of rows read from MySQL. Once the status is `COMPLETED` and `replication=STARTED` is reported, binlog follow-up after the snapshot has also started.
:::

Check the progress and status of SYNC operations.

**Syntax:**
```mygram
SYNC STATUS
```

**Example:**
```text
$ mygram-cli
127.0.0.1:11016> AUTH <token>
OK AUTHENTICATED
127.0.0.1:11016> SYNC STATUS
```

**Response Examples:**

**In Progress:**
```mygram
table=articles status=IN_PROGRESS progress=10000/25000 rows (40.0%) rate=5000 rows/s
```

**Completed:**
```mygram
table=articles status=COMPLETED rows=25000 time=5.2s gtid=uuid:123 replication=STARTED
```

**Failed:**
```mygram
table=articles status=FAILED rows=5000 error="MySQL connection lost"
```

**Idle (No sync performed):**
```mygram
status=IDLE message="No sync operation performed"
```

### Status Fields

| Field | Description | Example |
|-------|-------------|---------|
| `table` | Table name being synced | `articles` |
| `status` | Current status | `JOINING_PREVIOUS`, `STARTING`, `IN_PROGRESS`, `COMPLETED`, `FAILED`, `CANCELLING`, `CANCELLED`, `IDLE` |
| `progress` | Current/total rows processed | `10000/25000 rows (40.0%)` |
| `rate` | Processing rate | `5000 rows/s` |
| `rows` | Total rows processed | `25000` |
| `time` | Total processing time | `5.2s` |
| `gtid` | MySQL: conservative pre-snapshot GTID; MariaDB: snapshot binlog position converted to a GTID | `uuid:123` |
| `replication` | Replication status | `STARTED`, `DISABLED`, `FAILED` |
| `error` | Error message (if failed) | `MySQL connection lost` |

`JOINING_PREVIOUS`, `STARTING`, and `CANCELLING` are transient states. `JOINING_PREVIOUS` appears while a previous worker for the table is joined, `STARTING` while the new worker begins, and `CANCELLING` after `SYNC STOP` has requested cancellation. Poll `SYNC STATUS` until a terminal state is reported.

### Replication Status Values

- **STARTED**: Binlog replication restarted after the snapshot (success)
- **DISABLED**: Replication is disabled in configuration
- **FAILED**: Snapshot succeeded but replication failed to start (check logs)

The diagram below traces a SYNC through its full lifecycle: the initial memory-health check, the snapshot build during which table reads are rejected, the automatic replication handoff, and the terminal states, alongside the operations it mutually excludes.

<DocDiagram name="sync-lifecycle" alt="A SYNC passes a memory-health check, builds a snapshot from a MySQL SELECT while table reads are rejected, then restarts replication with outcomes started, disabled, or failed. It ends in completed, failed, or cancelled while OPTIMIZE and DUMP operations are mutually excluded." />

## Command Conflicts

### Operations Blocked During SYNC

| Command | Behavior | Reason |
|---------|----------|--------|
| `DUMP SAVE` / `DUMP LOAD` | **Blocked** | Long-running maintenance operations are mutually exclusive |
| `OPTIMIZE` | **Blocked** | Long-running maintenance operations are mutually exclusive |
| Automatic snapshot | **Blocked** | Long-running maintenance operations are mutually exclusive |
| `REPLICATION START` | **Blocked** | SYNC automatically starts replication when complete |
| `SYNC` (same table) | **Blocked** | SYNC already in progress for this table |

### Operations That Block Starting SYNC

`SYNC`, `DUMP SAVE`, `DUMP LOAD`, `OPTIMIZE`, and automatic snapshots share one operation slot. A new `SYNC` request is rejected while any of those operations is in progress; retry after it completes.

### Operations Allowed During SYNC

| Command | Behavior | Notes |
|---------|----------|-------|
| `SEARCH` | **Rejected** | The target table is synchronizing |
| `COUNT` | **Rejected** | The target table is synchronizing |
| `GET` | **Rejected** | The target table is synchronizing |
| `INFO` | Allowed | Shows current server state including sync progress |
| `DUMP SAVE` / `DUMP LOAD` / `OPTIMIZE` | **Blocked** | Retry after SYNC completes |
| `SYNC` (different table) | **Blocked** | Only one long-running operation can run at a time |
| `REPLICATION STOP` | Usually rejected | SYNC has stopped the reader internally, so the command normally returns `ERROR 6029 Replication is not running`. A stop issued just before that pause may succeed, but SYNC starts the reader again on completion. |

TCP/CLI and HTTP table reads (`search`, `count`, `facet`, and document `GET`) are rejected while the target table is synchronizing. HTTP returns `503`.

## Usage Scenarios

### Scenario 1: New Server Startup

```bash
./mygramdb --config config.yaml
```

The server starts without building a snapshot (log: `Skipping automatic snapshot build for table: articles (auto_initial_snapshot=false)`). When ready, use one authenticated CLI connection to start and monitor the sync:

```text
$ mygram-cli
127.0.0.1:11016> AUTH <token>
OK AUTHENTICATED
127.0.0.1:11016> SYNC articles
OK SYNC STARTED table=articles
127.0.0.1:11016> SYNC STATUS
table=articles status=IN_PROGRESS progress=5000/10000 rows (50.0%) rate=2000 rows/s
127.0.0.1:11016> SYNC STATUS
table=articles status=COMPLETED rows=10000 time=5.0s gtid=uuid:456 replication=STARTED
```

### Scenario 2: Multi-Table Sync

```yaml
# config.yaml
tables:
  - name: "articles"
    # ...
  - name: "products"
    # ...
  - name: "users"
    # ...

replication:
  enable: true
  auto_initial_snapshot: false
```

Synchronize one table, wait for `SYNC STATUS` to report `COMPLETED`, then start the next in the same authenticated CLI connection.

```text
$ mygram-cli
127.0.0.1:11016> AUTH <token>
OK AUTHENTICATED
127.0.0.1:11016> SYNC articles
127.0.0.1:11016> SYNC STATUS
127.0.0.1:11016> SYNC products
127.0.0.1:11016> SYNC STATUS
127.0.0.1:11016> SYNC users
127.0.0.1:11016> SYNC STATUS
table=users status=COMPLETED rows=5000 time=2.5s gtid=uuid:123 replication=STARTED
```

Use `SYNC app_db.articles` for a multi-database table identity.

### Scenario 3: Scheduled Maintenance

```bash
# Schedule SYNC during off-peak hours (e.g., 2 AM)
# Add to cron:
0 2 * * * printf 'AUTH \%s\nSYNC articles\n' "$MYGRAM_API_ADMIN_TOKEN" | mygram-cli
```

## Graceful Shutdown

When MygramDB receives a shutdown signal (SIGTERM/SIGINT) during SYNC:

1. **Active SYNC operations are cancelled**
   - `SnapshotBuilder::Cancel()` is called
   - Status changes to `CANCELLED`
   - The initial MySQL load observes the request while connecting, reading, and building the snapshot

2. **Server waits for cleanup**
   - Maximum wait time: 30 seconds
   - Background threads terminate gracefully
   - If SYNC is blocked inside a MySQL read during the initial snapshot, the
     shutdown response is bounded by the configured MySQL `read_timeout_ms`
     (converted to seconds for the dedicated binlog/snapshot connection).
     Lower this value if operators require faster SIGTERM/SIGINT response
     during long-running reads.
   - SIGTERM received during the initial MySQL connection retry loop exits cleanly

3. **Server shuts down**
   - MySQL connections closed
   - Resources released

**Example Log:**
```
INFO: Stopping TCP server...
INFO: Cancelling SYNC for table: articles
INFO: SYNC cancelled for table articles due to shutdown
WARN: Timeout waiting for SYNC operations to complete
INFO: TCP server stopped
```

## Best Practices

1. **Use `auto_initial_snapshot: false` in production**
   - Prevents unexpected MySQL master load on startup
   - Allows operators to control when sync occurs

2. **Monitor SYNC progress**
   - Use `SYNC STATUS` to track progress
   - Check server logs for detailed information

3. **Avoid concurrent DUMP LOAD**
   - Wait for SYNC to complete before loading dumps
   - Check `SYNC STATUS` first

4. **Schedule SYNC during off-peak hours**
   - Use cron or other schedulers
   - Reduce impact on MySQL master

5. **Monitor memory before SYNC**
   - Check available system memory
   - SYNC checks memory health automatically

## Troubleshooting

### SYNC Fails to Start

**Error:** `ERROR 4012 Memory critically low. Cannot start SYNC.`

**Solution:**
- Check available system memory
- Reduce process RSS or provision more memory; `memory.hard_limit_mb` is
  reserved and does not enforce a process memory limit today
- Reduce batch size in build configuration

### SYNC Fails During Execution

**Error:** `status=FAILED error="MySQL connection lost"`

**Solution:**
- Check MySQL server connectivity
- Verify MySQL credentials
- Check MySQL server logs
- Ensure replication user has sufficient privileges

### Replication Fails to Start

**Status:** `replication=FAILED`

**Solution:**
- Check server logs for detailed error message
- Verify MySQL GTID is enabled: `SHOW VARIABLES LIKE 'gtid_mode';`
- Verify binlog format is ROW: `SHOW VARIABLES LIKE 'binlog_format';`
- Check replication user privileges: `SHOW GRANTS FOR 'repl_user'@'%';`

### Error `2017`: undecodable binlog event

XA prepare events, MariaDB event-level compressed query/row events, MySQL `TRANSACTION_PAYLOAD_EVENT` events (transaction compression), and `PARTIAL_UPDATE_ROWS_EVENT` events (partial JSON row updates) can remain in the binlog after the server setting that produced them has changed. Repeating a normal restart from the old position replays the same event and stops replication again.

When replication stops with error code `2017`, run `SYNC` for the table that matters first. MygramDB rebuilds that table and restarts the shared stream from its snapshot marker, past the undecodable interval. Then run `SYNC` for every other replicated table, one at a time. The first recovery moves the shared stream forward; a table not rebuilt retains whatever writes in the skipped interval would have changed.

A monitored table's `TABLE_MAP` without full row metadata, with malformed optional metadata, or with an unsizeable column type stops with `2017`. Ensure the source runs `binlog_row_metadata=FULL` before rebuilding; changing that setting does not repair older binlog events.

MariaDB event-level compression from `log_bin_compress` remains unsupported and
is one of the `2017` recovery cases. A `COMPRESSED` `VARCHAR`/`TEXT` column in
an ordinary MariaDB row event is different: MygramDB inflates it before
indexing. An unknown or corrupt compressed-column payload is reported as row
decode error `2008` and follows normal reconnect handling; use the `2017`
sequence only for an undecodable event.

When `api.admin_token` is configured, keep the entire recovery sequence in one authenticated CLI connection: authentication is per connection and does not carry across separate `mygram-cli` processes. Wait for `SYNC STATUS` to report `COMPLETED` and `replication=STARTED` before issuing the next table's `SYNC`.

```text
$ mygram-cli
127.0.0.1:11016> AUTH <token>
OK AUTHENTICATED
127.0.0.1:11016> SYNC app_db.articles
127.0.0.1:11016> SYNC STATUS
127.0.0.1:11016> SYNC app_db.products
127.0.0.1:11016> SYNC STATUS
```

For other stop reasons, SYNC restarts from the drained position so unrelated tables do not lose commits.

## See Also

- [Replication Guide](/docs/replication)
- [Configuration Reference](/docs/configuration)
- [Performance Tuning](/docs/performance)
