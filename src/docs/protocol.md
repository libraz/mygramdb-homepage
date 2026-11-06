---
title: MygramDB Protocol Reference - TCP Text Commands
description: "MygramDB TCP protocol reference: SEARCH, COUNT, GET, INFO, CONFIG, DUMP, FACET, REPLICATION, SYNC, OPTIMIZE, and DEBUG syntax, responses, and examples."
head:
  - - meta
    - name: keywords
      content: MygramDB protocol, TCP text protocol, SEARCH command, COUNT, DUMP, REPLICATION, OPTIMIZE, FACET, mygram-cli, command reference
---

# Protocol Reference

MygramDB uses a simple text-based protocol over TCP (similar to memcached).

::: info This is not SQL
`SEARCH`, `COUNT`, `DUMP`, and `REPLICATION` on this page are MygramDB's own TCP commands. They borrow SQL-like keywords, but they are not SQL sent to MySQL. To call MygramDB from an application over JSON, use the [HTTP API](/docs/http-api).
:::

## Connection

Connect to MygramDB via TCP:

```bash
telnet localhost 11016
```

Or use the CLI client:

```bash
./build/bin/mygram-cli -h localhost -p 11016
```

When `api.admin_token` is configured, authenticate once on each TCP connection before issuing an administrative command. If it is empty, `AUTH` is not required; production deployments reachable beyond loopback should configure a token.

```mygram
AUTH <token>
OK AUTHENTICATED
```

The authenticated state belongs to that connection. An invalid token returns `ERROR 7 Authentication failed` and clears any earlier authenticated state. Tokens are not logged.

## Command Format

::: tip Choosing TCP or HTTP
The TCP protocol suits `mygram-cli` and administrative commands. For web applications and browser integration, the HTTP API is usually easier because it speaks JSON and can handle CORS.
:::

Commands are text-based, one command per line. Responses are terminated with newline.

If the thread-pool queue is full when the server schedules a connection's drain task, it stops accepting normal responses on that connection and sends the responses already queued. It then sends the final `ERROR 6030 SERVER_BUSY Server is too busy, please try again later` and closes the connection. Reaching a pending-frame or shared-buffer limit can also produce a best-effort `ERROR 6030` before the connection closes.

`SEARCH`, `COUNT`, `GET`, and `FACET` do not require authentication. When an administrative token is configured, `AUTH` is required for configuration commands, `SET` / `SHOW VARIABLES`, `DUMP`, `REPLICATION`, `SYNC`, `OPTIMIZE`, `DEBUG`, and `CACHE` commands. A request made before authentication returns `ERROR 7 Administrative command requires AUTH`.

Table references use the database-qualified form `database.table`. For example, the table `articles` in database `app_db` is addressed as `app_db.articles`. If the configuration contains only one database, a bare table name also works: `SEARCH articles hello` resolves to that database. When the configuration spans two or more databases, qualification is required and a bare name is rejected as ambiguous.

---

## SEARCH Command

Search for documents containing specified text.

### Syntax

```mygram
SEARCH <db.table> <text> [OPTIONS]
```

### Basic Examples

Simple search:
```mygram
SEARCH app_db.articles hello
```

With filters and pagination:
```mygram
SEARCH app_db.articles tech FILTER status = 1 LIMIT 10
```

### Response

```mygram
OK RESULTS <total_count> <id1> <id2> <id3> ...
```

**For detailed query syntax, boolean operators, filters, sorting, and advanced features, see [Query Syntax Guide](/docs/query-syntax).**

::: info Reading the response
`total_count` is the number of matches before pagination; the primary keys that follow are the current page. `GET` returns the primary key and configured filter values, not the original document text or a snippet. To retrieve snippets, request `HIGHLIGHT` as part of `SEARCH` or use `highlight` with the HTTP search API.
:::

---

## COUNT Command

Count documents matching search criteria (without returning IDs).

### Syntax

```mygram
COUNT <db.table> <text> [OPTIONS]
```

### Example

```mygram
COUNT app_db.articles tech AND AI FILTER status = 1
```

### Response

```mygram
OK COUNT <number>
```

**For full query syntax, see [Query Syntax Guide](/docs/query-syntax).**

---

## GET Command

Retrieve a document by primary key.

### Syntax

```mygram
GET <db.table> <primary_key>
```

### Example

```mygram
GET app_db.articles 12345
```

### Response

```mygram
OK DOC <primary_key> <filter1=value1> <filter2=value2> ...
```

Example:
```mygram
OK DOC 12345 status=1 category=tech created_at=1705314600
```

Not found:
```mygram
ERROR 4004 Document not found
```

---

## INFO Command

Get comprehensive server information and statistics (Redis-style format).

### Syntax

```mygram
INFO
```

### Response

Returns server information in Redis-style key-value format with multiple sections. This sample shows the replication section available after `AUTH` when `api.admin_token` is configured; before authentication, the entire `# Replication` section is omitted.

```mygram
OK INFO

# Server
version: 1.12.0
uptime_seconds: 3600
data_initialized: true
readiness: ready

# Stats
total_commands_processed: 10000
total_connections_received: 150
total_requests: 10000

# Commandstats
cmd_search: 8500
cmd_count: 1000
cmd_get: 500

# Memory
used_memory_bytes: 524288000
used_memory_human: 500.00 MB
used_memory_peak_bytes: 629145600
used_memory_peak_human: 600.00 MB
used_memory_index: 400.00 MB
used_memory_documents: 100.00 MB
memory_fragmentation_ratio: 1.20
total_system_memory: 16.00 GB
available_system_memory: 8.50 GB
system_memory_usage_ratio: 0.47
process_rss: 520.00 MB
process_rss_peak: 600.00 MB
memory_health: HEALTHY

# Index
total_documents: 1000000
total_terms: 1500000
total_postings: 5000000
avg_postings_per_term: 3.33
delta_encoded_lists: 1200000
roaring_bitmap_lists: 300000
optimization_status: idle

# Tables
tables: products, users, articles

# Clients
connected_clients: 5

# Replication
replication_inserts_applied: 50000
replication_updates_applied: 10000
replication_deletes_applied: 5000
```

### Memory Health Status

| Status | Available system memory | Note |
|--------|-------------------------|------|
| `HEALTHY` | More than 20% | |
| `WARNING` | 10-20% | |
| `CRITICAL` | Less than 10% | `OPTIMIZE` is rejected |
| `UNKNOWN` | Cannot be determined | |

---

## CONFIG Commands

The CONFIG command family provides runtime configuration help, inspection, and verification.

::: info CONFIG is for inspection
`CONFIG SHOW` and `CONFIG VERIFY` inspect and validate configuration. To change a value on a running server, use `SET` / `SHOW VARIABLES`, which are limited to the mutable runtime variables.
:::

### CONFIG HELP [path]

Display help for configuration options.

**Syntax:**
```mygram
CONFIG HELP [path]
```

**Parameters:**
- `path` (optional): Dot-separated configuration path (e.g., `mysql.port`)

**Examples:**

List the top-level configuration sections:
```mygram
CONFIG HELP
```

Response (sections are sorted by name; the `mysql` description is shortened here):
```mygram
+OK
Available configuration sections:
  api          - API server configuration
  bm25         - BM25 relevance scoring configuration
  build        - Index build configuration
  cache        - Query cache configuration
  dump         - Dump persistence configuration
  index        - Legacy global index configuration (deprecated; prefer per-table ngram_size)
  logging      - Logging configuration
  memory       - Memory management configuration
  mysql        - MySQL connection settings. Values can be overridden via environment variables: ...
  network      - Network security configuration
  replication  - Replication configuration
  server       - Legacy server configuration (deprecated, use api.tcp instead)
  tables       - Table configuration (supports multiple tables)

Use "CONFIG HELP <section>" for detailed information.
```

Show help for a section:
```mygram
CONFIG HELP mysql
```

Response:
```mygram
+OK
mysql

Type: object
Description: MySQL connection settings. Values can be overridden via environment variables: MYGRAM_MYSQL_USER, MYGRAM_MYSQL_PASSWORD, MYGRAM_MYSQL_HOST, MYGRAM_MYSQL_PORT, MYGRAM_MYSQL_DATABASE (env vars take precedence over config file values)
```

A section prints only its type and description. Ask for a property path to see its default and allowed range:
```mygram
CONFIG HELP mysql.port
```

Response:
```mygram
+OK
mysql.port

Type: integer
Default: 3306
Range: 1 - 65535
Description: MySQL server port
```

The output text comes from the configuration schema and is always in English. An unknown path returns `ERROR 8 Configuration path not found: <path>`.

---

### CONFIG SHOW [path]

Display current configuration values. Sensitive fields (passwords, secrets) are masked with `***`.

**Syntax:**
```mygram
CONFIG SHOW [path]
```

**Parameters:**
- `path` (optional): Dot-separated configuration path to show only specific section

**Examples:**

Show entire current configuration:
```mygram
CONFIG SHOW
```

Response:
```mygram
+OK
mysql:
  host: "127.0.0.1"
  port: 3306
  user: "repl_user"
  password: "***"
  database: "mydb"
  use_gtid: true
  ...

tables:
  - name: "articles"
    primary_key: "id"
    ...

replication:
  enable: true
  server_id: 12345
  ...
```

Show specific section:
```mygram
CONFIG SHOW mysql
```

Show specific property:
```mygram
CONFIG SHOW mysql.port
```

Response:
```mygram
+OK
3306
```

---

### CONFIG VERIFY `<filepath>`

Verify a configuration file without loading it.

**Syntax:**
```mygram
CONFIG VERIFY <filepath>
```

**Parameters:**
- `filepath` (required): Path to a `.yaml` or `.yml` configuration file, relative to the directory containing the active configuration file

The server rejects absolute paths, paths containing `..`, symbolic links, and files with any other extension, so `CONFIG VERIFY` can only read candidate files placed next to the active configuration.

**Examples:**

Verify a valid file:
```mygram
CONFIG VERIFY candidate.yaml
```

Response (success). The summary shows only the MySQL host and port; the user name and password are never printed:
```mygram
+OK
Configuration is valid
  Tables: 2 (articles, products)
  MySQL: 127.0.0.1:3306
```

Verify an invalid file:
```mygram
CONFIG VERIFY invalid.yaml
```

Response (error). Like every error, it is a single `ERROR <code>` line; line breaks inside the validation message are replaced with spaces:
```mygram
ERROR 1002 Configuration validation failed:   <validation message>
```

---

## DUMP Commands

The DUMP command family provides unified snapshot management with integrity verification.

::: warning DUMP LOAD replaces current data
`DUMP SAVE` writes, `DUMP VERIFY` checks, and `DUMP INFO` reports. `DUMP LOAD` is different: it replaces the current index and document store with the dump's contents. Confirm the target file and its GTID before running it.
:::

### DUMP SAVE

Save complete snapshot to single binary file (`.dmp`). This command runs **asynchronously** and returns immediately.

**Syntax:**
```mygram
DUMP SAVE [<filepath>]
```

**Response:**
```mygram
OK DUMP_STARTED <filepath>
```

**Example:**
```mygram
DUMP SAVE mygramdb.dmp
```

The filename resolves under `dump.dir`; a path outside that directory is refused. Use `DUMP STATUS` to monitor progress and check completion.

`mygram-cli` reads the filepath as the last non-empty token, decoded with the server escape rules, so quote a path that contains spaces. A token starting with `-` is sent to the server, which rejects it as an unknown `DUMP SAVE` flag. `--with-stats` is not part of the grammar and is rejected the same way.

`DUMP SAVE` returns `ERROR 6029` until every configured table has completed its initial load. In a MySQL-enabled build with a binlog reader, it also returns `ERROR 6029` until a GTID position is available; run `SYNC` first to establish that position.

### DUMP LOAD

Load snapshot from binary file.

::: warning This replaces the live search state
`DUMP LOAD` replaces the current index and document store. Run `DUMP VERIFY` and `DUMP INFO` first to check for corruption and to confirm the GTID and table identities.
:::

**Syntax:**
```mygram
DUMP LOAD <filepath>
```

**Example:**
```mygram
DUMP LOAD mygramdb.dmp
```

### DUMP VERIFY

Verify snapshot file integrity without loading data.

**Syntax:**
```mygram
DUMP VERIFY <filepath>
```

**Example:**
```mygram
DUMP VERIFY mygramdb.dmp
```

### DUMP INFO

Display snapshot file metadata (version, GTID, tables, size, flags).

**Syntax:**
```mygram
DUMP INFO <filepath>
```

**Example:**
```mygram
DUMP INFO mygramdb.dmp
```

### DUMP STATUS

Monitor the progress of async dump operations (DUMP SAVE).

**Syntax:**
```mygram
DUMP STATUS
```

**Response:**
```mygram
OK DUMP_STATUS
save_in_progress: <true|false>
load_in_progress: <true|false>
replication_paused_for_dump: <true|false>
status: <IDLE|SAVING|LOADING|COMPLETED|FAILED>
filepath: <path>
tables_processed: <count>
tables_total: <count>
current_table: <table_name>
elapsed_seconds: <seconds>
result_filepath: <path>        (when COMPLETED)
error: <message>               (when FAILED)
END
```

**Status values:**

| Value | Meaning |
|-------|---------|
| `IDLE` | No dump operation in progress |
| `SAVING` | `DUMP SAVE` in progress |
| `LOADING` | `DUMP LOAD` in progress |
| `COMPLETED` | The last dump operation completed successfully |
| `FAILED` | The last dump operation failed |

**Example (during save):**
```mygram
OK DUMP_STATUS
save_in_progress: true
load_in_progress: false
replication_paused_for_dump: true
status: SAVING
filepath: /backup/mygramdb.dmp
tables_processed: 2
tables_total: 5
current_table: users
elapsed_seconds: 3.45
END
```

**For detailed snapshot management, integrity protection, best practices, and troubleshooting, see [Snapshot Guide](/docs/snapshot).**

---

## FACET Command

Aggregate distinct values of a filter column with document counts.

### Syntax

```mygram
FACET <table> <column> [search_text] [AND <term>] [NOT <term>] [FILTER <col> <op> <value>] [LIMIT <n>] [OFFSET <n>]
```

### Examples

All values of status column:
```mygram
FACET articles status
```

Values scoped to search results:
```mygram
FACET articles category "machine learning" FILTER status = 1 LIMIT 10
```

`OFFSET` skips facet buckets after they are ordered by count. It defaults to `0`.

### Response

```mygram
OK FACET <returned_value_count> <total_distinct_values>
<value1>	<count1>
<value2>	<count2>
...

```

The value rows are tab-separated and sorted by count in descending order. The response ends with an empty line (`\r\n\r\n` on the wire). When connection debug mode is enabled, `# query_time_ms`, `# matched_documents`, and `# distinct_values` lines appear after the value rows and before the empty line.

In the `OK FACET` header, `returned_value_count` is the number of rows in this response page and `total_distinct_values` is the number of distinct values before `LIMIT` and `OFFSET`.

---

## REPLICATION STATUS

Get current replication status.

### Syntax

```mygram
REPLICATION STATUS
```

### Response

Multi-line key-value format:

```mygram
OK REPLICATION
status: <running|stopped|failed|not_configured>
current_gtid: <current_gtid>
processed_events: <count>
queue_size: <size>
crc_errors: <count>
schema_incompatible: <true|false>
last_error_code: <code>
last_error: <message>
last_applied_unixtime: <unix_timestamp>
seconds_since_last_applied: <seconds>
END
```

| Field | Description |
|-------|-------------|
| `status` | Replication state (values below) |
| `current_gtid` | Last processed GTID position |
| `processed_events` | Total binlog events processed |
| `queue_size` | Pending events in the queue; returned in every state of a configured reader, including `stopped` and `failed` |
| `crc_errors` | Total binlog event CRC errors detected |
| `schema_incompatible` | `true` when replication stopped because a monitored schema is incompatible |
| `last_error_code` | Numeric code of the last replication error, or `0` when there is none |
| `last_error` | Message of the last replication error, or empty when there is none |
| `last_applied_unixtime` | Unix timestamp of the last successfully applied position, or `0` when unknown |
| `seconds_since_last_applied` | Seconds since the last successfully applied position, or `-1` when unknown |

`status` is one of the following. `not_configured` is returned when no binlog reader is configured; the other three apply when one is.

| Value | Meaning |
|-------|---------|
| `running` | Actively replicating from MySQL |
| `stopped` | Replication was stopped manually |
| `failed` | Replication stopped because of an error |
| `not_configured` | MySQL replication is not configured |

Example (running):
```mygram
OK REPLICATION
status: running
current_gtid: 3E11FA47-71CA-11E1-9E33-C80AA9429562:1-100
processed_events: 5000
queue_size: 0
crc_errors: 0
schema_incompatible: false
last_error_code: 0
last_error:
last_applied_unixtime: 1710000000
seconds_since_last_applied: 2
END
```

Example (stopped):
```mygram
OK REPLICATION
status: stopped
current_gtid: 3E11FA47-71CA-11E1-9E33-C80AA9429562:1-100
processed_events: 5000
queue_size: 0
crc_errors: 0
schema_incompatible: false
last_error_code: 0
last_error:
last_applied_unixtime: 1710000000
seconds_since_last_applied: 120
END
```

---

## REPLICATION STOP

Stop binlog replication (index becomes read-only).

::: warning No MySQL changes are applied while stopped
Search keeps working during `REPLICATION STOP`, but new MySQL changes are not reflected. After maintenance, run `REPLICATION START` and confirm with `REPLICATION STATUS`.
:::

### Syntax

```mygram
REPLICATION STOP
```

### Response

```mygram
OK REPLICATION_STOPPED
```

---

## REPLICATION START

Resume binlog replication.

### Syntax

```mygram
REPLICATION START
```

### Response

```mygram
OK REPLICATION_STARTED
```

---

## SYNC

Manually trigger snapshot synchronization from MySQL to MygramDB for a specific table.

### Syntax

```mygram
SYNC <table_name>
```

### Parameters

- **table_name**: Name of the table to synchronize (must be configured in config file)

### Response (Success)

```mygram
OK SYNC STARTED table=<table_name>
```

### Response (Error)

```mygram
ERROR 4011 SYNC already in progress for '<name>'
ERROR 4012 Memory critically low. Cannot start SYNC.
ERROR 4010 Table '<name>' not found
```

### Behavior

- Runs asynchronously in the background
- Returns immediately after starting
- Builds snapshot from MySQL using SELECT query
- Captures a conservative pre-snapshot GTID on MySQL, or the snapshot's exact binlog position converted to a GTID on MariaDB
- On MySQL, commits between the GTID capture and the snapshot transaction may be replayed during replication; this at-least-once replay is intentional and idempotent
- Drains replication and normally restarts it from the GTID drained before SYNC, so commits for other tables are not skipped; the `2017` recovery path restarts from the snapshot marker (the MySQL lower bound or MariaDB's exact snapshot position converted to a GTID)

While a table is synchronizing, `SEARCH`, `COUNT`, `GET`, and `FACET` on that table are rejected with `Table '<name>' is synchronizing, please try again later`. Use `SYNC STATUS` for progress and failure reasons.

### Cancel a SYNC

```mygram
SYNC STOP [<table_name>]
```

Stops the sync for the named table. Without a table name, cancellation is requested for every running sync. Cancellation is asynchronous. Use `SYNC STATUS` until the operation reports `CANCELLED` or another terminal state.

### Conflicts

| Command | During SYNC | Reason |
|---------|-------------|--------|
| `DUMP LOAD` | Rejected | Prevents data corruption |
| `REPLICATION START` | Rejected | SYNC starts replication automatically |
| `SYNC` | Rejected while another long-running maintenance operation is in progress | |

### Example

```text
$ mygram-cli
127.0.0.1:11016> AUTH <token>
OK AUTHENTICATED
127.0.0.1:11016> SYNC articles
OK SYNC STARTED table=articles
```

---

## SYNC STATUS

Check the progress and status of SYNC operations.

### Syntax

```mygram
SYNC STATUS
```

### Response Examples

`SYNC STATUS` is a multi-line wire response. The server wraps the status lines with `OK SYNC_STATUS` and `END`. `mygram-cli` removes these envelope lines before printing the status body; the examples below show the wire response.

**In Progress:**
```mygram
OK SYNC_STATUS
table=articles status=IN_PROGRESS progress=10000/25000 rows (40.0%) rate=5000 rows/s
END
```

**Joining the previous worker:**
```mygram
OK SYNC_STATUS
table=articles status=JOINING_PREVIOUS
END
```

**Starting:**
```mygram
OK SYNC_STATUS
table=articles status=STARTING
END
```

**Cancelling:**
```mygram
OK SYNC_STATUS
table=articles status=CANCELLING
END
```

**Completed:**
```mygram
OK SYNC_STATUS
table=articles status=COMPLETED rows=25000 time=5.2s gtid=uuid:123 replication=STARTED
END
```

**Failed:**
```mygram
OK SYNC_STATUS
table=articles status=FAILED rows=5000 error="MySQL connection lost"
END
```

**Idle:**
```mygram
OK SYNC_STATUS
status=IDLE message="No sync operation performed"
END
```

### Status Fields

| Field | Description |
|-------|-------------|
| `table` | Table name being synced |
| `status` | `JOINING_PREVIOUS`, `STARTING`, `IN_PROGRESS`, `COMPLETED`, `FAILED`, `CANCELLING`, `CANCELLED`, or `IDLE` |
| `progress` | Current/total rows processed |
| `rate` | Processing rate (rows/s) |
| `rows` | Total rows processed |
| `time` | Total processing time |
| `gtid` | Snapshot marker: MySQL's conservative lower-bound GTID or MariaDB's exact snapshot binlog position converted to a GTID; normal restart uses the drained pre-SYNC GTID, while undecodable-event (`2017`) recovery may restart from this marker |
| `replication` | Replication status: `STARTED`, `DISABLED`, `FAILED` |
| `error` | Error message (if failed) |

`JOINING_PREVIOUS` is a transient state while the previous worker for the table is joined; it changes to `STARTING` once the new worker is claimed. `CANCELLING` means that `SYNC STOP` requested cancellation. The transient states do not carry progress details.

### CLI Example

The CLI strips the `OK SYNC_STATUS` and `END` envelope before displaying the status body.

```text
$ mygram-cli
127.0.0.1:11016> AUTH <token>
OK AUTHENTICATED
127.0.0.1:11016> SYNC STATUS
table=articles status=IN_PROGRESS progress=10000/25000 rows (40.0%) rate=5000 rows/s
```

### See Also

- [SYNC Command Guide](/docs/sync-command) - Detailed usage guide
- [Replication Guide](/docs/replication) - Manual snapshot synchronization setup

---

## OPTIMIZE Command

Optimize index posting lists (convert Delta Encoding to Roaring Bitmap based on density).

::: tip When to run it
`OPTIMIZE` runs without stopping search, but it temporarily uses extra memory. On large datasets, run it during low-traffic hours and check memory health with `/info` or `INFO` beforehand.
:::

### Syntax

```mygram
OPTIMIZE [<db.table>]
```

Omit the table to optimize all configured tables. Name one table to optimize only that table; use `database.table` when the configuration spans multiple databases.

### How it works

- **Pre-execution checks**: Memory health and availability verification
- Takes a snapshot of term names and rebuilds every posting list into a fresh optimized allocation
- Processes terms in batches; batches limit per-batch bookkeeping and allow periodic atomic publication, but do not remove the full rebuild's dominant memory cost
- Query processing and writes continue while the replacement lists are built
- Each batch is swapped in atomically, so replication keeps running throughout

### Memory Safety

**Pre-execution memory checks:**
- Rejects execution if system memory health is **CRITICAL** (<10% available)
- Estimates peak memory from the resident index, a full rebuild copy, 10% temporary overhead, a term-name snapshot, and batch bookkeeping
- Requires roughly `2.1x` the index memory to be free; the exact estimate also grows with the number of distinct terms and the batch bookkeeping

**Memory usage pattern:**
- The existing index stays resident while the full optimized replacement is built, so peak usage approaches two index copies
- Batch size does not materially reduce peak memory; it limits per-batch bookkeeping and controls when replacements are published

### Global Exclusion

- **Only one OPTIMIZE operation** can run at a time across all tables
- New OPTIMIZE commands are rejected while optimization is in progress
- Check `optimization_status` via `INFO` command

### Performance

Runtime depends on the number and size of posting lists and the host's available memory. Searches and replication continue during the rebuild, though concurrent updates may briefly contend when batches are published. Measure a run with your own data before scheduling regular optimization.

### Response

**Success:**
```mygram
OK OPTIMIZED tables=<n> terms=<n> delta=<n> roaring=<n> memory=<human>
```

Example:
```mygram
OK OPTIMIZED tables=1 terms=1500000 delta=1200000 roaring=300000 memory=450.00 MB
```

**Errors:**

Already optimizing:
```mygram
ERROR 6030 Another OPTIMIZE operation is already in progress
```

Memory critically low:
```mygram
ERROR 6030 Memory critically low. Cannot start optimization: available=1.50 GB total=8.00 GB
```

Insufficient memory:
```mygram
ERROR 6030 Insufficient memory for optimization: Insufficient memory: estimated=2.50 GB available=1.80 GB
```

---

## DEBUG Command

Enable or disable debug mode for the current connection to see detailed query execution metrics.

::: info Per-connection setting
`DEBUG ON` affects only the current TCP connection. Other `mygram-cli` sessions and application connections are unchanged.
:::

### Syntax

```mygram
DEBUG ON
DEBUG OFF
```

### How it works

- **Per-Connection State**: Debug mode is enabled/disabled for the current connection only
- **Query Timing**: Shows execution time breakdown (index search, filtering)
- **Search Details**: Displays n-grams generated, posting list sizes, and candidate counts
- **Optimization Visibility**: Reports which optimization strategies were applied
- **Performance Impact**: Minimal overhead, only collects metrics when enabled

### Response

```mygram
OK DEBUG_ON
```

or

```mygram
OK DEBUG_OFF
```

### Debug Output Format

When debug mode is enabled, `SEARCH` appends a debug block to its response. Lines in brackets appear only when they apply:

```mygram
OK RESULTS <count> <id1> <id2> ...

# DEBUG
query_time: <ms>ms
index_time: <ms>ms
[filter_time: <ms>ms]
terms: <n>
ngrams: <n>
candidates: <n>
after_intersection: <n>
after_not: <n>
after_filters: <n>
final: <n>
[optimization: <strategy>]
[sort: <column> <direction>]
limit: <value> [(default)]
[offset: <value> [(default)]]
cache: hit | miss | disabled
[cache_age_ms: <ms>]
[cache_saved_ms: <ms>]
[cache_reason: not_found | invalidated]
[cache_cost_ms: <ms>]
[cache_key: <canonical-key>]
```

`COUNT` returns a shorter block: the timing lines, `terms`, `ngrams`, and the cache lines. The candidate counts, `final`, `optimization`, `sort`, `limit`, and `offset` are `SEARCH`-only.

```mygram
OK COUNT <n>

# DEBUG
query_time: <ms>ms
index_time: <ms>ms
terms: <n>
ngrams: <n>
cache: hit | miss | disabled
...
```

### Debug Metrics Explained

| Field | Description |
|-------|-------------|
| `query_time` | Total query execution time, with an `ms` suffix |
| `index_time` | Time spent searching the index, with an `ms` suffix |
| `filter_time` | Time spent applying filters; printed only when greater than zero |
| `terms` | Number of search terms |
| `ngrams` | Total n-grams generated from the search terms |
| `candidates` | Initial candidate documents from the index |
| `after_intersection` | Results after AND term intersection |
| `after_not` | Results after NOT term filtering |
| `after_filters` | Results after FILTER conditions |
| `final` | Total matching documents (before LIMIT/OFFSET) |
| `optimization` | Strategy used (for example `merge_join` or `early_exit`); printed only when one was used |
| `sort` | Applied sorting (column and direction); printed only when a sort was applied |
| `limit` | Maximum results returned; shows `(default)` if not specified explicitly |
| `offset` | Result offset for pagination; printed only when greater than zero |
| `cache` | `hit`, `miss`, or `disabled` |
| `cache_age_ms`, `cache_saved_ms` | On a hit: age of the cached entry and the execution time it saved |
| `cache_reason`, `cache_cost_ms` | On a miss: `not_found` or `invalidated`, and the measured cost of this execution |
| `cache_key` | Canonical query key, when one exists |

---

## CACHE Commands

Inspect and control the query cache. See [Configuration Guide](/docs/configuration#query-cache) for the `cache` settings themselves.

### Syntax

```mygram
CACHE STATS
CACHE CLEAR [<db.table>]
CACHE ENABLE
CACHE DISABLE
```

`CACHE CLEAR` without a table drops every entry; with a table it drops only that table's entries.

### Responses

```mygram
OK CACHE_CLEARED
OK CACHE_CLEARED table=app_db.articles
OK CACHE_ENABLED
OK CACHE_DISABLED
```

`CACHE STATS` returns a multi-line report terminated by `END`:

```mygram
OK CACHE_STATS

# Cache
enabled: true
total_queries: 15000
cache_hits: 12000
cache_misses: 3000
hit_rate: 0.8000
current_entries: 420
current_memory_bytes: 8388608
evictions: 12
ttl_expirations: 5
avg_cache_hit_time_ms: 0.041
avg_cache_miss_time_ms: 18.220
total_time_saved_ms: 218640.000
END
```

`CACHE STATS` can report the current counters while the cache is disabled. `CACHE CLEAR` requires an enabled cache; an unconfigured cache or an operation that requires the cache returns `ERROR 8001` (`kCacheDisabled`). `CACHE ENABLE` returns `ERROR 8001 Cache cannot be enabled: the invalidation worker could not be started.` when its invalidation worker cannot start.

`CACHE ENABLE` / `CACHE DISABLE` change the running state only. `SET cache.enabled = ...` also changes process memory only and does not rewrite the configuration file. Edit `config.yaml` to persist the setting across a restart.

---

## SET and SHOW VARIABLES

MySQL-style runtime variable commands. Only variables reported as mutable can be changed; see [Operations Guide](/docs/operations) for the full workflow.

### Syntax

```mygram
SET <variable> = <value> [, <variable2> = <value2> ...]
SHOW VARIABLES [LIKE '<pattern>']
```

The compact form is also valid: `SET api.default_limit=50`. It can be mixed with comma-separated assignments.

`SHOW VARIABLES LIKE` accepts exactly one pattern and matches it case-insensitively.

### Responses

```mygram
+OK Variable 'logging.level' set to 'debug'
+OK 2 variables set
```

`SHOW VARIABLES` renders a MySQL-style table with a `Mutable` column:

```mygram
+---------------------+-----------+---------+
| Variable_name       | Value     | Mutable |
+---------------------+-----------+---------+
| api.default_limit   | 100       | YES     |
| cache.enabled       | true      | YES     |
| memory.verify_text  | off       | NO      |
+---------------------+-----------+---------+
```

`SET` validates each value with the configuration schema used at startup. A multi-assignment command applies all changes or none; an invalid assignment is named in the `ERROR 1004` response. The same `server_id` and `cache.max_memory_mb` limits apply at runtime. `SET cache.enabled = true` can fail with `ERROR 8001 Failed to set variable 'cache.enabled': Cache cannot be enabled`. `cache.min_query_cost_ms` must be a finite, non-negative number; values such as `nan`, `inf`, and `-inf` are rejected with `ERROR 1004`.

When `SHOW VARIABLES` returns a sensitive field, its value is masked as `***`. This includes `mysql.password`, `mysql.ssl_key`, and fields whose names contain `password`, `secret`, `ssl_key`, `api_key`, `auth_key`, `private_key`, `access_key`, or `token`. Empty values remain empty.

---

## Error Response

New servers format errors as a numeric code followed by a message:

```mygram
ERROR <numeric-code> <message>
```

Examples:
```mygram
ERROR 7 Administrative command requires AUTH
ERROR 4007 Table not found: products
ERROR 3006 Invalid filter
```

Clients that need to work with older servers should also accept the legacy `ERROR <message>` form. A response is coded only when the first payload token is a complete, non-zero decimal `uint16` value; otherwise the whole payload is the legacy message.

---

## CLI Client Features

The CLI client (`mygram-cli`) provides an interactive shell with:

- **Tab Completion**: Press TAB to autocomplete command names (requires GNU Readline)
- **Command History**: Use ↑/↓ arrow keys to navigate history (requires GNU Readline)
- **Line Editing**: Full line editing with Ctrl+A, Ctrl+E, etc. (requires GNU Readline)
- **Error Handling**: Graceful error messages (does not crash)
- **Command input**: Commands are sent as entered; the CLI does not quote search or filter values using the SDK wire rules. In command-line arguments, a tab becomes a space and other control bytes below `0x20` are dropped.
- **Complete Reads**: Multi-line responses, including highlighted results, `DEBUG` output, and `SHOW VARIABLES`, are read completely even when the receive buffer is small.
- **IPv6**: Connect using an IPv6 literal or a hostname that resolves to IPv6.
- **Search Output**: Prints one row per primary key and decodes quoted keys containing spaces or other whitespace.
- **DUMP SAVE paths**: Reads the filepath as the last non-empty token using the server escape rules; quote paths that contain spaces. A dash-leading token is forwarded to the server and rejected as an unknown flag.
- **Dump Errors**: Prints the numeric server error code when `DUMP SAVE` fails. With `--wait-ready`, it retries the command while the server is loading or not ready; `INFO` reporting `readiness: not_ready` is not treated as success.

### Interactive Mode

```bash
./build/bin/mygram-cli
> SEARCH articles hello
OK RESULTS 5 1 2 3 4 5
> quit
```

### Single Command Mode

The command is passed as positional arguments — there is no `-c` flag. Quote the whole command when it contains spaces or shell metacharacters:

```bash
./build/bin/mygram-cli SEARCH articles "hello world"
```

Administrative commands need an authenticated interactive connection when `api.admin_token` is configured:

```text
$ ./build/bin/mygram-cli
127.0.0.1:11016> AUTH <token>
OK AUTHENTICATED
127.0.0.1:11016> SET logging.level = 'debug'
```

### Command-line Options

| Option | Description |
|--------|-------------|
| `-h HOST` | Server hostname (default: `127.0.0.1`) |
| `-p PORT` | Server port (default: `11016`) |
| `-s SOCKET_PATH` | Unix domain socket path; overrides `-h`/`-p` |
| `--timeout MS` | Command timeout in milliseconds (default: `30000`; long operations such as `DUMP` and `OPTIMIZE`: `300000`) |
| `--connect-timeout MS` | Connection timeout in milliseconds (default: `30000`) |
| `--retry N` | Retry the connection N times if refused (default: `0`) |
| `--retry-interval SEC` | Seconds between retries (default: `3`); with `--wait-ready` the default budget is 100 retries × 3 seconds |
| `--wait-ready` | Retry within the configured budget until the server is ready (100 retries by default; `--retry N` overrides it); exit non-zero if it is still not ready |
| `--version` | Print the client version and exit |
| `--help` | Print usage and exit |

### Help Command

In interactive mode, type `help` to see available commands:

```
> help
Commands are sent to the server verbatim; quote search text yourself where needed.

Available commands:
  SEARCH <db.table> <text> [(AND|OR|NOT) <term>...] [FILTER <col=val>...]
         [SORT [BY] <col>|ASC|DESC] [LIMIT <n>] [OFFSET <n>]
         [HIGHLIGHT [TAG <open> <close>] [SNIPPET_LEN <n>] [MAX_FRAGMENTS <n>]]
         [FUZZY [1|2]]
  COUNT <db.table> <text> [(AND|OR|NOT) <term>...] [FILTER <col=val>...]
  GET <db.table> <primary_key>
  INFO              - Show server statistics
  CONFIG            - Show current configuration
  SET <variable> = <value> [, ...]         - Change runtime variables
  SHOW VARIABLES [LIKE <pattern>]         - Show runtime variables
  FACET <db.table> <column> [text] [FILTER <col=val>...] [LIMIT <n>]
                    - Compute facet counts
  REPLICATION STATUS|STOP|START
  DEBUG ON|OFF      - Toggle per-connection debug output
  OPTIMIZE [db.table]  - Compact posting lists for one or all tables
  CACHE STATS|CLEAR|ENABLE|DISABLE
  DUMP SAVE|LOAD|VERIFY|INFO|STATUS
  SYNC <db.table>|STOP [db.table]|STATUS
  AUTH <token>      - Unlock administrative commands on this connection

Query syntax examples:
  SEARCH app.threads golang                          # Simple search
  SEARCH app.threads (golang OR python) AND tutorial # Boolean query
  SEARCH app.threads golang SORT DESC LIMIT 10       # With sorting
  SEARCH app.threads golang SORT BY created_at ASC   # Sort by column

Other commands:
  quit/exit - Exit the client
  help - Show this help
```

::: info
Commands are **not** terminated with a semicolon. The parser splits on whitespace only, so `SHOW VARIABLES;` is rejected as an unknown subcommand.
:::

---

## See Also

- [Query Syntax Guide](/docs/query-syntax) - Detailed SEARCH/COUNT query syntax
- [Snapshot Guide](/docs/snapshot) - Snapshot management and best practices
- [Configuration Guide](/docs/configuration) - Server configuration
- [Replication Setup](/docs/replication) - MySQL replication configuration
