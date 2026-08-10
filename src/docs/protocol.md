---
title: MygramDB Protocol Reference - TCP Text Commands
description: Complete MygramDB TCP protocol reference. SEARCH, COUNT, GET, INFO, CONFIG, DUMP, FACET, REPLICATION, SYNC, OPTIMIZE, and DEBUG commands with syntax, responses, and examples.
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

`SEARCH`, `COUNT`, `GET`, and `FACET` do not require authentication. When an administrative token is configured, `AUTH` is required for configuration commands, `SET` / `SHOW VARIABLES`, `DUMP`, `REPLICATION`, `SYNC`, `OPTIMIZE`, `DEBUG`, and `CACHE` commands. A request made before authentication returns `ERROR 7 Administrative command requires AUTH`.

Table references accept the database-qualified form `` `database.table` ``. For example, a table named
`articles` in database `app_db` is addressed as `app_db.articles`. In a single-database deployment (only
one distinct database is configured), a bare table name also works — for example `SEARCH articles hello`
resolves to that one database. Qualification is required only when the configuration spans two or more
databases; a bare name is then rejected as ambiguous.

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
`total_count` is the total number of matches; the primary keys that follow are the current page. If you need the document body or highlighted snippets, `GET` them after the search or use the HTTP API response shape instead.
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
OK DOC 12345 status=1 category=tech created_at=2024-01-15T10:30:00
```

Not found:
```mygram
ERROR 8 Document not found
```

---

## INFO Command

Get comprehensive server information and statistics (Redis-style format).

### Syntax

```mygram
INFO
```

### Response

Returns server information in Redis-style key-value format with multiple sections:

```mygram
OK INFO

# Server
version: 1.0.0
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

- **HEALTHY**: >20% system memory available
- **WARNING**: 10-20% system memory available
- **CRITICAL**: <10% system memory available (OPTIMIZE will be rejected)
- **UNKNOWN**: Unable to determine status

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

Show all top-level configuration sections:
```mygram
CONFIG HELP
```

Response:
```mygram
+OK
Available configuration sections:
  mysql        - MySQL connection settings
  tables       - Table configuration (supports multiple tables)
  build        - Index build configuration
  replication  - Replication configuration
  memory       - Memory management
  dump         - Dump persistence (automatic backup)
  api          - API server configuration
  network      - Network security (optional)
  logging      - Logging configuration
  cache        - Query cache configuration

Use "CONFIG HELP <section>" for detailed information.
```

Show help for a specific section:
```mygram
CONFIG HELP mysql
```

Response:
```mygram
+OK
mysql - MySQL connection settings

Properties:
  host (string, default: "127.0.0.1")
    MySQL server hostname or IP

  port (integer, default: 3306, range: 1-65535)
    MySQL server port

  user (string, REQUIRED)
    MySQL username for replication

  password (string)
    MySQL user password

  database (string, REQUIRED)
    Database name

  use_gtid (boolean, default: true)
    Enable GTID-based replication

  ...
```

Show help for a specific property:
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
- `filepath` (required): Path to configuration file (YAML or JSON)

Relative paths are resolved from the directory containing the active configuration file. Use an absolute path in automation when the service working directory differs.

**Examples:**

Verify valid config:
```mygram
CONFIG VERIFY /etc/mygramdb/config.yaml
```

Response (success):
```mygram
+OK
Configuration is valid
  Tables: 2 (articles, products)
  MySQL: repl_user@127.0.0.1:3306
```

Verify invalid config:
```mygram
CONFIG VERIFY /tmp/invalid.yaml
```

Response (error):
```mygram
-ERR Configuration validation failed:
  - mysql.port: value 99999 exceeds maximum 65535
  - tables[0].name: missing required field
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
Use DUMP STATUS to monitor progress
```

**Example:**
```mygram
DUMP SAVE /backup/mygramdb.dmp
```

Use `DUMP STATUS` to monitor progress and check completion. `--with-stats` is not part of the grammar and is rejected as an unknown `DUMP SAVE` flag.

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
DUMP LOAD /backup/mygramdb.dmp
```

### DUMP VERIFY

Verify snapshot file integrity without loading data.

**Syntax:**
```mygram
DUMP VERIFY <filepath>
```

**Example:**
```mygram
DUMP VERIFY /backup/mygramdb.dmp
```

### DUMP INFO

Display snapshot file metadata (version, GTID, tables, size, flags).

**Syntax:**
```mygram
DUMP INFO <filepath>
```

**Example:**
```mygram
DUMP INFO /backup/mygramdb.dmp
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
- `IDLE`: No dump operation in progress
- `SAVING`: DUMP SAVE in progress
- `LOADING`: DUMP LOAD in progress
- `COMPLETED`: Last dump operation completed successfully
- `FAILED`: Last dump operation failed

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
OK FACET <num_values>
<value1>	<count1>
<value2>	<count2>
...
```

Results are sorted by count in descending order.

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
status: <running|stopped|not_configured>
current_gtid: <current_gtid>
processed_events: <count>
queue_size: <size>
END
```

- **status**: Current replication state
  - `running`: Actively replicating from MySQL
  - `stopped`: Replication manually stopped
  - `not_configured`: MySQL replication not configured
- **current_gtid**: Last processed GTID position
- **processed_events**: Total binlog events processed
- **queue_size**: Pending events in queue (only shown when running)

Example (running):
```mygram
OK REPLICATION
status: running
current_gtid: 3E11FA47-71CA-11E1-9E33-C80AA9429562:1-100
processed_events: 5000
queue_size: 0
END
```

Example (stopped):
```mygram
OK REPLICATION
status: stopped
current_gtid: 3E11FA47-71CA-11E1-9E33-C80AA9429562:1-100
processed_events: 5000
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
ERROR 4011 SYNC already in progress for table '<table_name>'
ERROR 4012 Memory critically low. Cannot start SYNC. Check system memory.
ERROR 4010 Table '<table_name>' not found in configuration
```

### Behavior

- Runs asynchronously in the background
- Returns immediately after starting
- Builds snapshot from MySQL using SELECT query
- Captures GTID at snapshot time
- Drains replication and restarts it from the saved GTID when complete, so commits for other tables are not skipped

### Cancel a SYNC

```mygram
SYNC STOP [<table_name>]
```

Cancellation is asynchronous. Use `SYNC STATUS` until the operation reports `CANCELLED` or another terminal state.

### Conflicts

- **DUMP LOAD**: Blocked during SYNC (prevents data corruption)
- **REPLICATION START**: Blocked during SYNC (SYNC auto-starts replication)
- **SYNC**: Blocked while another long-running maintenance operation is in progress

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

**Idle:**
```mygram
status=IDLE message="No sync operation performed"
```

### Status Fields

| Field | Description |
|-------|-------------|
| `table` | Table name being synced |
| `status` | `IN_PROGRESS`, `COMPLETED`, `FAILED`, `IDLE`, `CANCELLED` |
| `progress` | Current/total rows processed |
| `rate` | Processing rate (rows/s) |
| `rows` | Total rows processed |
| `time` | Total processing time |
| `gtid` | Saved GTID used for replication restart |
| `replication` | Replication status: `STARTED`, `DISABLED`, `FAILED` |
| `error` | Error message (if failed) |

### Example

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

Omit the table on a single-table deployment; qualify it when more than one table is configured.

### How it works

- **Pre-execution checks**: Memory health and availability verification
- Copies and optimizes posting lists in batches
- Query processing continues (using the old batch until each swap)
- Each batch is swapped in atomically, so replication keeps running throughout

### Memory Safety

**Pre-execution Memory Checks:**
- Rejects execution if system memory health is **CRITICAL** (<10% available)
- Estimates required memory based on index size and batch size
- Requires: `available_memory >= estimated_memory + 10% safety margin`
- Typical memory overhead: ~5-15% of index size during optimization

**Memory Usage Pattern:**
- **Index portion only** temporarily doubles (document store unchanged)
- Overall memory usage increases by approximately 1.05-1.15x
- Memory is freed gradually through batch processing

### Global Exclusion

- **Only one OPTIMIZE operation** can run at a time across all tables
- New OPTIMIZE commands are rejected while optimization is in progress
- Check `optimization_status` via `INFO` command

### Performance

- Small indexes (<10K terms): <1 second
- Medium indexes (10K-100K terms): 1-10 seconds
- Large indexes (>100K terms): 10+ seconds
- Concurrent searches: minimal impact (short lock durations)
- Concurrent updates: safe but may see brief contention

### Response

**Success:**
```mygram
OK OPTIMIZED terms=<total> delta=<count> roaring=<count> memory=<size>
```

Example:
```mygram
OK OPTIMIZED terms=1500000 delta=1200000 roaring=300000 memory=450.00 MB
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
ERROR 6030 Insufficient memory for optimization: estimated=2.50 GB available=1.80 GB
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

When debug mode is enabled, SEARCH and COUNT commands return additional debug information:

```mygram
OK RESULTS <count> <id1> <id2> ...

# DEBUG
query_time: <ms>
index_time: <ms>
filter_time: <ms>
terms: <n>
ngrams: <n>
candidates: <n>
after_intersection: <n>
after_not: <n>
after_filters: <n>
final: <n>
optimization: <strategy>
order_by: <column> <direction>
limit: <value> [(default)]
offset: <value> [(default)]
```

### Debug Metrics Explained

- **query_time**: Total query execution time in milliseconds
- **index_time**: Time spent searching the index
- **filter_time**: Time spent applying filters (if any)
- **terms**: Number of search terms
- **ngrams**: Total n-grams generated from search terms
- **candidates**: Initial candidate documents from index
- **after_intersection**: Results after AND term intersection
- **after_not**: Results after NOT term filtering (if NOT used)
- **after_filters**: Results after FILTER conditions (if filters used)
- **final**: Total matching documents (before LIMIT/OFFSET)
- **optimization**: Strategy used (e.g., `merge_join`, `early_exit`, `none`)
- **order_by**: Applied sorting (column and direction)
- **limit**: Maximum results returned (shows "(default)" if not explicitly specified)
- **offset**: Result offset for pagination (shows "(default)" if not explicitly specified)

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

`CACHE ENABLE` / `CACHE DISABLE` change the running state only. To persist the setting, use `SET cache.enabled = ...` or edit `config.yaml`.

---

## SET and SHOW VARIABLES

MySQL-style runtime variable commands. Only variables reported as mutable can be changed; see [Operations Guide](/docs/operations) for the full workflow.

### Syntax

```mygram
SET <variable> = <value> [, <variable2> = <value2> ...]
SHOW VARIABLES [LIKE '<pattern>']
```

The compact form is also valid: `SET api.default_limit=50`. It can be mixed with comma-separated assignments.

`SHOW VARIABLES LIKE` accepts exactly one pattern.

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
| `--retry N` | Retry the connection N times if refused (default: `0`) |
| `--wait-ready` | Keep retrying until the server is ready |
| `--version` | Print the client version and exit |
| `--help` | Print usage and exit |

### Help Command

In interactive mode, type `help` to see available commands:

```
> help
Available commands:
  SEARCH <db.table> <text> [(AND|OR|NOT) <term>...] [FILTER <col=val>...]
         [SORT [BY] <col>|ASC|DESC] [LIMIT <n>] [OFFSET <n>]
  COUNT <db.table> <text> [(AND|OR|NOT) <term>...] [FILTER <col=val>...]
  GET <db.table> <primary_key>
  INFO              - Show server statistics
  CONFIG            - Show current configuration
  SET <variable>[ = ]<value> [, ...]       - Change runtime variables
  SHOW VARIABLES [LIKE <pattern>]         - Show runtime variables
  FACET <db.table> <column> [text] [FILTER <col=val>...] [LIMIT <n>]
                    - Compute facet counts
  REPLICATION STATUS|STOP|START
  DEBUG ON|OFF      - Toggle per-connection debug output
  OPTIMIZE [db.table]  - Compact posting lists for one or all tables
  CACHE STATS|CLEAR|ENABLE|DISABLE
  DUMP SAVE|LOAD|VERIFY|INFO|STATUS
  SYNC <db.table>|STOP [db.table]|STATUS
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
