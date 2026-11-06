---
title: MygramDB Configuration Reference - config.yaml Options
description: "MygramDB config.yaml reference: MySQL connection, tables and filters, n-grams, synonyms, replication, memory, API server, rate limits, cache, and logging."
head:
  - - meta
    - name: keywords
      content: MygramDB configuration, config.yaml, ngram_size, verify_text, required_filters, BM25 settings, query cache, network allow_cidrs, runtime variables
---

# Configuration

MygramDB accepts YAML or JSON configuration files. Files are validated against the built-in JSON Schema at startup, so unknown keys, wrong types, missing required fields, and invalid enum values fail fast.

::: info How to read this page
To get running you only need the MySQL connection, `tables`, `replication.server_id`, and `network.allow_cidrs`. Everything else is worth reading once you want to tune search quality, memory use, or operations.
:::

## Minimal Example

```yaml
mysql:
  host: "127.0.0.1"
  user: "repl_user"
  password: "your_password"
  database: "mydb"

tables:
  - name: "articles"
    text_source:
      column: "content"

replication:
  server_id: 83917

network:
  allow_cidrs:
    - "127.0.0.1/32"
```

`mysql.user`, `mysql.database`, and at least one table are required after environment overrides are applied. The `mysql` block may be omitted when the values come from `MYGRAM_MYSQL_USER` and `MYGRAM_MYSQL_DATABASE`.

Replication is enabled by default. In that case `replication.server_id` is required: a non-zero value from `1` to `4294967295` that is unique among MySQL replicas and MygramDB instances.

::: tip What to do after the minimal config
Writing the config file does not load any data. After starting the server, synchronize each table you want with `SYNC articles` and confirm completion with `SYNC STATUS`.
:::

::: info What is server_id?
**server_id** is the identifier used for a MySQL replication connection. It must not collide with any other MySQL replica or MygramDB instance attached to the same MySQL. With a duplicate, the upstream cannot tell the two apart.
:::

## MySQL / MariaDB Connection

MygramDB works with MySQL 8.4/9.7/26.x and MariaDB 10.11+/11.x/12.x. The same `mysql` section is used for both; MygramDB uses a capability probe to select the correct GTID format.

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
  connect_timeout_ms: 3000
  read_timeout_ms: 3600000
  write_timeout_ms: 3600000
  session_timeout_sec: 3600
  datetime_timezone: "+09:00"
  ssl_enable: true
  ssl_ca: "/etc/mygramdb/mysql-ca.pem"
  ssl_cert: "/etc/mygramdb/mysql-client-cert.pem"
  ssl_key: "/etc/mygramdb/mysql-client-key.pem"
  ssl_verify_server_cert: true
  ignored_ddl_prefixes: []
```

`datetime_timezone` controls how MySQL `DATETIME` and `DATE` values, and temporal `required_filters` literals, are interpreted. `TIME` values are durations in seconds and do not use this offset. `TIMESTAMP` values are always handled as UTC.

`connect_timeout_ms`, `read_timeout_ms`, and `write_timeout_ms` are in milliseconds; `session_timeout_sec` is in seconds.

TLS is disabled by default. The example above enables it, so replace its certificate paths with files on your server. For a source without TLS, set `ssl_enable: false` and remove the certificate paths.

| Key | Role |
|-----|------|
| `ssl_enable` | Turns TLS on (default `false`) |
| `ssl_verify_server_cert` | Verifies the server certificate; keep `true` for verified TLS |
| `ssl_ca` | Required when verification is on; the CA certificate that signed the server certificate |
| `ssl_cert`, `ssl_key` | Needed only if the source requires client-certificate authentication; otherwise remove them |

Environment variables override these `mysql` keys, and they also work when the `mysql` block is absent:

| Key | Environment variable |
|-----|----------------------|
| `mysql.host` | `MYGRAM_MYSQL_HOST` |
| `mysql.port` | `MYGRAM_MYSQL_PORT` |
| `mysql.user` | `MYGRAM_MYSQL_USER` |
| `mysql.password` | `MYGRAM_MYSQL_PASSWORD` |
| `mysql.database` | `MYGRAM_MYSQL_DATABASE` |

`MYGRAM_MYSQL_PORT` must be an integer from `1` through `65535`; an invalid value stops startup.

`mysql.ignored_ddl_prefixes` is an empty, startup-only list by default. Add a prefix only when you have reviewed an otherwise unclassified standalone DDL `QUERY_EVENT` and know it is safe to skip. Each entry must:

- be non-empty and contain no semicolon;
- begin (case-insensitively) with one of `ALTER`, `ANALYZE`, `CHECK`, `CREATE`, `DROP`, `OPTIMIZE`, `RENAME`, `REPAIR`, or `TRUNCATE`. DML prefixes are rejected.

The list does not override the safety checks for configured tables and databases. `DROP DATABASE` or `DROP SCHEMA` for a configured database still stops replication, even when `DROP` is listed. Changes take effect after a restart.

`mysql.binlog_format` and `mysql.binlog_row_image` assert the source server's values; they do not change MySQL or MariaDB settings. Set `binlog_row_metadata=FULL` on the source as well. It is a server setting, not a MygramDB configuration key. See [MySQL Replication](/docs/replication) for the required source and table checks.

::: tip DATETIME vs TIMESTAMP
MySQL `DATETIME` carries no timezone. MygramDB uses `datetime_timezone` to decide which timezone those values are in. `TIMESTAMP` is already normalized to UTC by MySQL, so this setting does not affect it.
:::

### Required MySQL Settings

```ini
binlog_format = ROW
binlog_row_image = FULL
binlog_row_metadata = FULL
binlog_checksum = CRC32
```

These settings belong on the MySQL or MariaDB source. MygramDB validates them at startup and on reconnect; its YAML `mysql` block does not configure the source server.

The source must also write uncompressed binlog events: set `binlog_transaction_compression=OFF` on MySQL or `log_bin_compress=OFF` on MariaDB. On MySQL, `binlog_row_value_options` must not include `PARTIAL_JSON`.

For MySQL, enable GTID:

```ini
gtid_mode = ON
enforce_gtid_consistency = ON
```

For MariaDB, GTID uses MariaDB's native `domain-server-sequence` format. Set `server_id`, enable row-based binlogging, and leave `binlog_storage_engine` unset.

If the source is itself a replica, enable `log_replica_updates` on MySQL or `log_slave_updates` on MariaDB so replicated changes are written to its binlog.

### Required Privileges

```sql
GRANT SELECT, REPLICATION SLAVE, REPLICATION CLIENT ON *.* TO 'repl_user'@'%';
FLUSH PRIVILEGES;
```

::: warning Narrowing the grant
In production you can scope `SELECT` to just the searchable databases instead of `*.*`. The initial `SYNC` still needs read access to the target tables, and binlog follow-up still needs `REPLICATION SLAVE` and `REPLICATION CLIENT`.
:::

## Table Configuration

Each table gets an effective identity of `<database>.<table>`. If `tables[*].database` is omitted, it defaults to `mysql.database`.

MygramDB checks source requirements, primary-key uniqueness, foreign-key actions, and column definitions before replication. See [MySQL Replication](/docs/replication#source-and-table-validation) for the refusal conditions and error codes.

```yaml
mysql:
  database: "app_db"

tables:
  - name: "articles"              # Effective identity: app_db.articles
    primary_key: "id"
    text_source:
      column: "content"
    ngram_size: 2
    kanji_ngram_size: 1
    cross_boundary_ngrams: true

  - database: "archive_db"
    name: "articles"              # Effective identity: archive_db.articles
    primary_key: "id"
    text_source:
      concat: ["title", "body"]
      delimiter: " "
```

In a single-database configuration, bare references such as `SEARCH articles hello` work. When the configuration spans two or more databases, all TCP, CLI, C/C++, and HTTP references must use `<database>.<table>`.

::: info What is a table identity?
A **table identity** is the name MygramDB uses to refer to one searchable table. With a single database, `articles` is enough; with several, the database has to be included, as in `app_db.articles`.
:::

`text_source` must specify either:

| Field | Meaning |
|-------|---------|
| `column` | Index one text column |
| `concat` | Concatenate two or more columns before indexing |
| `delimiter` | Separator used with `concat` (default: space) |

::: warning Configured column validation

MygramDB checks these rules before replication starts, so the initial loader and the binlog reader represent the same values.

- Names must be non-empty SQL identifiers without NUL bytes. They are not limited to ASCII: spaces, `$`, Unicode, and embedded backticks are supported and safely quoted.
- Table identity is the `(database, table)` pair, and duplicate pairs are rejected.
- Configured primary-key, text-source, and filter columns cannot use `FLOAT`, `JSON`, `GEOMETRY` or its subtypes, `VECTOR`, `ZEROFILL`, `BINARY`, `VARBINARY`, any `BLOB` type, or a type this build cannot decode from a row image.
- Character columns must use an `utf8mb4`, `utf8`/`utf8mb3`, or `ascii` collation.
:::

## Identifier and Ingestion Limits

Protocol references use a bare table name only when one database is configured. In a multi-database setup, use `<database>.<table>`. Raw TCP accepts a whitespace-containing reference quoted as one protocol token. The native C/C++ SDK's typed methods reject whitespace in names before constructing a command; raw command methods retain the TCP grammar. For HTTP routes, percent-encode the table identity in the URL.

The ingestion limits below apply per value or document. Size limits are in bytes unless the row says otherwise:

| Item | Limit |
|------|-------|
| Stored primary-key value | 1 MiB |
| Filters per document | 1,000 |
| Filter name | 1 KiB |
| String filter value | 64 KiB |
| Original text and normalized text | 16 MiB each |

The initial `SYNC` rejects a candidate snapshot that exceeds these limits. During binlog ingestion, an oversized value is an error and MygramDB does not advance the applied GTID past that event.

## Filters

`required_filters` decide which rows are indexed. Rows that do not match these conditions are omitted from the index; during replication, rows moving out of the condition are removed and rows moving in are added.

::: warning required_filters vs filters
`required_filters` decide whether a row enters the index at all. `filters` register columns you can narrow by at query time. To keep soft-deleted rows out of search entirely, use `required_filters`; to let a search screen filter by status, use `filters`.
:::

<DocDiagram name="filter-indexing" alt="required_filters decide whether MySQL rows enter the index, while search-time filters narrow already indexed rows at query time." />

```yaml
tables:
  - name: "articles"
    text_source:
      column: "content"
    required_filters:
      - name: "enabled"
        type: "int"
        op: "="
        value: 1
      - name: "deleted_at"
        type: "datetime"
        op: "IS NULL"
```

`filters` are search-time filter columns. They do not affect which rows are indexed.

```yaml
tables:
  - name: "articles"
    text_source:
      column: "content"
    filters:
      - name: "status"
        type: "int"
      - name: "category"
        type: "string"
      - name: "created_at"
        type: "datetime"
```

Supported filter types are:

- signed and unsigned integers of every size, including `mediumint` and `mediumint_unsigned`
- `double`, `boolean`, `string`, `varchar`, `text`
- `datetime`, `date`, `timestamp`, `time`

`float`, `enum`, and `set` are not accepted filter types. A `FLOAT` column is also refused as a primary key or text source, because the initial-load result and the binlog row image do not preserve the same value.

A `boolean` filter maps to a signed MySQL `TINYINT(1)`. Boolean values, in query-time `FILTER` and in `required_filters` alike, are `true`/`false` or `1`/`0` in any letter case. A `boolean` required filter supports `=`, `!=`, `IS NULL`, and `IS NOT NULL`.

Date and time filters take different value formats in `required_filters` and in a search-time `FILTER`:

| Filter type | `required_filters` value | Search-time `FILTER` value |
|-------------|--------------------------|----------------------------|
| `datetime`, `date`, `timestamp` | Epoch seconds, or an ISO date/time in the offset set by `mysql.datetime_timezone`. Fractional seconds are accepted; a trailing `Z`, numeric offset, or other suffix is rejected | Epoch seconds |
| `time` | Signed duration seconds, or a MySQL `TIME` clock such as `HH:MM:SS` with optional fractional seconds, from `-838:59:59` through `838:59:59` | Signed duration seconds |

::: warning Reserved filter keys
`bitmap_index`, `dict_compress`, and `bucket` are accepted by the schema and preserved across dumps, but they do not change behavior yet. Setting them has no effect on indexing or query performance.
:::

## N-gram And Posting Lists

```yaml
tables:
  - name: "articles"
    ngram_size: 2
    kanji_ngram_size: 1
    cross_boundary_ngrams: true
    posting:
      block_size: 128
      freq_bits: 0
      use_roaring: "auto"
```

`ngram_size` applies to kana, ASCII/alphanumeric text, and other scripts outside CJK ideographs. The omitted default is `2`; set `ngram_size: 1` explicitly only if you need unigram behavior. `kanji_ngram_size` applies only to CJK ideographs; `0` means use `ngram_size`. `cross_boundary_ngrams` controls whether mixed-script boundary n-grams such as `字A` are generated.

::: info What is an N-gram?
An **N-gram** is a short slice of a string. Because it splits by character rather than by word, it works without a dictionary even in languages that do not separate words with spaces.
:::

::: warning Reserved posting keys
The whole `posting` block — `block_size`, `freq_bits`, and `use_roaring` — is validated and preserved across dumps but not yet enforced. Delta-to-Roaring conversion is driven by `memory.roaring_threshold` and by `OPTIMIZE`, not by `use_roaring`.
:::

BM25 scoring and highlighting use stored normalized text. `memory.verify_text` controls n-gram candidate verification; it does not disable text storage and does not affect `freq_bits`.

## Per-table Synonyms

Synonym expansion is configured per table, not globally.

::: tip Why synonyms are per table
The same word can mean different things in different tables — synonyms useful for a product catalogue may be wrong for an article archive. MygramDB therefore configures them under `tables[*].synonyms` rather than globally.
:::

```yaml
tables:
  - name: "articles"
    text_source:
      column: "content"
    synonyms:
      enable: true
      file: "/etc/mygramdb/articles-synonyms.tsv"
```

TSV format, one group per line:

```tsv
car	automobile	vehicle
fast	quick	rapid	speedy
# comments are ignored
```

Search for any term in a group expands to the rest of the group. Terms are normalized with the same text normalization settings as the index.

## Replication

```yaml
replication:
  enable: true
  auto_initial_snapshot: false
  server_id: 83917
  start_from: "snapshot"
  queue_size: 10000
```

`auto_initial_snapshot` defaults to `false`; start the first load explicitly with `SYNC <table>` for each table you want to load. This avoids accidentally loading large tables on startup. Set it to `true` only when startup-time loading is intentional. `auto_initial_snapshot: true` requires `start_from: "snapshot"` for both single-table and multi-table deployments. `dump.load_on_startup: true` has the same requirement so replication resumes from the GTID stored in the restored dump instead of skipping changes.

`start_from` accepts:

| Value | Behavior |
|-------|----------|
| `snapshot` | Resume from the GTID captured by the snapshot/dump |
| `latest` | Start from the source's current GTID, ignoring older changes |
| `gtid=<position>` | Start from a MySQL GTID set (`UUID[:tag]:txn[-txn]`, comma-separated) or MariaDB GTID list (`domain-server-seq`, comma-separated) |

MySQL GTID transaction numbers must be below `2^63−1`; MariaDB uses its separate `domain-server-seq` grammar. A single MySQL `UUID:txn` or `UUID:tag:txn` position means through that transaction. A malformed `gtid=...` value, including one holding only separators such as `gtid=,`, is rejected during config validation.

If replay can include TABLE_MAP events written before the source enabled `binlog_row_metadata=FULL`, run `SYNC` for every replicated table after changing the source setting.

## Memory

```yaml
memory:
  hard_limit_mb: 8192
  soft_target_mb: 4096
  roaring_threshold: 0.18
  normalize:
    nfkc: true
    width: "narrow"
    lower: false
  verify_text: "off"
```

`hard_limit_mb` and `soft_target_mb` are reserved and do not enforce a process memory limit. They still have configuration bounds: `hard_limit_mb` accepts `256` through `2147483647`, and `soft_target_mb` accepts `128` through `2147483647`. `arena_chunk_mb` and `minute_epoch` are also reserved. Size the host so the full index and stored normalized text fit in RAM.

The `memory.normalize` keys control text normalization:

| Key | Values | Default |
|-----|--------|---------|
| `nfkc` | `true` / `false`: Unicode NFKC normalization | `true` |
| `width` | `keep`, `narrow`, `wide`: character-width handling | `narrow` |
| `lower` | `true` / `false`: lowercasing | `false` |

These settings affect indexed text and queries alike. A dump must use the same normalization settings as the running configuration.

::: warning About the memory limit
`hard_limit_mb` does not currently stop the process at the OS level. In production, estimate from the row count, stored text, `verify_text` mode, and cache size, then provision enough RAM.
:::

`verify_text` controls n-gram candidate verification:

| Value | Behavior |
|-------|----------|
| `off` | Fastest, no candidate verification; n-gram false positives are possible |
| `ascii` | Verify ASCII-only queries |
| `all` | Verify all queries; recommended when exact result semantics matter |

Normal startup retains normalized text regardless of `verify_text`, so `HIGHLIGHT` can use it with `verify_text: "off"` as well. BM25 `_score` sorting also uses stored text to count term frequency.

## API Server

```yaml
api:
  tcp:
    bind: "127.0.0.1"
    port: 11016
    max_connections: 10000
    worker_threads: 0
    recv_timeout_sec: 60
    idle_timeout_sec: 300
    reaper_interval_sec: 5
    thread_pool_queue_size: 1000
    max_write_queue_bytes: 16777216
    max_total_buffered_bytes: 268435456
    max_pending_frames: 1024
    max_pending_frame_bytes: 4194304
    keepalive:
      enabled: true
      idle_sec: 60
      interval_sec: 20
      probe_count: 3
  unix_socket:
    path: ""
  http:
    enable: false
    bind: "127.0.0.1"
    port: 8080
    max_connections: 10000
    trusted_proxies: []
    enable_cors: false
    cors_allow_origin: ""
    max_body_bytes: 16777216
    read_timeout_sec: 5
    write_timeout_sec: 5
  default_limit: 100
  max_query_length: 128
  admin_token: "replace-with-a-high-entropy-secret"
```

TCP and HTTP bind to loopback by default. Notes on individual settings:

| Setting | Behavior |
|---------|----------|
| `tcp.worker_threads` | `0` selects the automatic worker count |
| `tcp.idle_timeout_sec` | `0` disables TCP idle reaping |
| `tcp.max_pending_frames` | Caps completed requests waiting for a worker |
| `tcp.max_pending_frame_bytes` | Per-connection byte budget for pending frames; defaults to 4 MiB |
| `max_query_length` | Counts Unicode characters; defaults to 128, and `0` removes the limit |
| `default_limit` | Default result count; defaults to 100 |
| `http.max_connections` | Caps admitted HTTP connections, including sockets waiting for workers |
| `http.cors_allow_origin` | With CORS enabled, the single origin value to return; it is not a list |
| `http.trusted_proxies` | Numeric IP addresses of reverse proxies whose `X-Forwarded-For` value may set the client identity for ACLs and rate limiting; leave empty unless requests arrive through those proxies |

Reads pause at 75% of either pending-frame limit and resume after the queue drains.

`api.default_limit` and `api.max_query_length` can be changed at runtime with `SET`. Network binds, the HTTP body limit, and most connection settings require a restart.

To use a Unix socket, set `api.unix_socket.path` and connect with `mygram-cli -s /path/to/mygramdb.sock`. On startup, MygramDB removes an existing socket only when a connection probe confirms it is stale. It refuses to replace a regular file, an active socket, or a path whose status is uncertain, with error 6015.

::: info What TCP and HTTP each handle
The TCP API serves search plus administrative commands such as `SYNC`, `DUMP`, and `SET`. The HTTP API covers search, count, facet, document lookup, health, metrics, and `POST /optimize`.
:::

### Administrative authentication

`api.admin_token` is a shared secret for administrative commands. Set it in the configuration file or through `MYGRAM_API_ADMIN_TOKEN`; use a high-entropy value and keep it out of source control. The environment override also applies when the `api` block is absent. The token is mandatory when TCP binds to a non-loopback address without a Unix socket, or when HTTP is enabled on a non-loopback address. A Unix socket only exempts the TCP listener; it does not exempt HTTP.

Authenticate a TCP connection before administrative commands:

```mygram
AUTH replace-with-a-high-entropy-secret
SYNC articles
```

`POST /optimize` requires the same token as an HTTP Bearer credential:

```bash
curl -X POST http://127.0.0.1:8080/optimize \
  -H "Authorization: Bearer $MYGRAM_API_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{}'
```

## Rate Limiting

```yaml
api:
  rate_limiting:
    enable: true
    capacity: 100
    refill_rate: 10
    max_clients: 10000
```

TCP and HTTP share one rate limiter and one per-client token bucket, so a client cannot double its quota by spreading requests across protocols. Deployments that relied on the former per-protocol burst should raise `capacity` and `refill_rate` to preserve that aggregate rate.

`capacity` is the maximum burst in requests; `refill_rate` adds tokens per client per second. Both default to `100` and `10` respectively. `enable`, `capacity`, and `refill_rate` can be changed at runtime with `SET`; `max_clients` is startup-only and limits tracked client buckets, not admitted clients.

## Relevance Scoring (BM25)

```yaml
bm25:
  enable: false
  k1: 1.2
  b: 0.75
```

BM25 is off by default. `SORT _score` fails with `SORT _score requires BM25 to be enabled in configuration` until `enable` is `true`; normal startup stores the normalized text it needs regardless of `memory.verify_text`.

`k1` controls term-frequency saturation (higher values let repeated terms keep raising the score). `b` controls document-length normalization between `0.0` (off) and `1.0` (full).

## Query Cache

```yaml
cache:
  enabled: true
  max_memory_mb: 32
  min_query_cost_ms: 10.0
  ttl_seconds: 3600
  invalidation_strategy: "ngram"
  compression_enabled: true
  eviction_batch_size: 10
  invalidation:
    batch_size: 1000
    max_delay_ms: 100
    max_queue_size: 100000
```

`max_memory_mb` is a shared budget for cached results, cache containers, indexes, invalidation metadata, and the deferred invalidation queue. Startup rejects values outside these ranges:

| Setting | Accepted range |
|---------|----------------|
| `max_memory_mb` | `1` through `1048576`; when the cache is enabled, also at most 50% of detected physical memory |
| `ttl_seconds` | `0` through `2147483647`; `0` disables expiry |
| `eviction_batch_size` | `1` through `2147483647` |
| `invalidation.batch_size` | `1` through `2147483647` |
| `invalidation.max_delay_ms` | `0` through `2147483647` |
| `invalidation.max_queue_size` | `1` or more |

If physical memory cannot be detected, the 50% check is skipped with a warning. `min_query_cost_ms` must be finite when changed at runtime.

Only queries slower than `min_query_cost_ms` are cached, so cheap lookups do not evict useful entries. `invalidation_strategy: "ngram"` invalidates just the entries whose terms overlap a changed row; `"table"` drops every entry for the table, which is cheaper to compute but far more destructive.

`cache.enabled`, `cache.min_query_cost_ms`, and `cache.ttl_seconds` can be changed at runtime with `SET`. `max_memory_mb` and the other startup-only cache limits require a restart. See [Operations Guide](/docs/operations) for the `CACHE STATS` / `CACHE CLEAR` commands.

## Index Build

```yaml
build:
  mode: "select_snapshot"
  batch_size: 5000
```

`batch_size` is the number of rows fetched per round during the initial load started by `SYNC`. `mode` currently accepts only `select_snapshot`.

::: warning Reserved build keys
`parallelism` and `throttle_ms` are validated but not yet enforced; the initial load is single-threaded and unthrottled.
:::

## Persistence

```yaml
dump:
  dir: "/var/lib/mygramdb/dumps"
  default_filename: "mygramdb.dmp"
  load_on_startup: false
  interval_sec: 7200
  retain: 3
  restore_memory_budget_mb: 4096
  restore_max_section_mb: 2048
```

| Key | Behavior |
|-----|----------|
| `interval_sec` | Seconds between automatic dumps. The default `0` disables them; the example uses 7200 (two hours) |
| `retain` | Controls automatic dump rotation |
| `default_filename` | File used by `DUMP SAVE` when no path is given; `DUMP SAVE .` is refused |
| `restore_memory_budget_mb` | Bounds the total staged data during a V2 restore |
| `restore_max_section_mb` | Bounds one encoded V2 section |
| `load_on_startup` | Tries the default dump before a MySQL snapshot, validates the source identity and GTID, and falls back to MySQL if the dump cannot be loaded. Requires `replication.start_from: "snapshot"` |

`DUMP SAVE` rejects documents that exceed the restore limits instead of writing a dump that cannot be loaded. Every configured table must have completed its initial load before `DUMP SAVE`, otherwise it returns error 6029. In a MySQL-enabled build with a binlog reader, a GTID position is also required, and a missing position returns 6029.

::: warning Put the dump directory on persistent storage
Under Docker or Kubernetes, point `dump.dir` at a persistent volume. Writing dumps to the container's ephemeral filesystem loses them when the container is recreated.
:::

## Network Security

```yaml
network:
  allow_cidrs:
    - "127.0.0.1/32"
    - "10.0.0.0/8"
```

If `allow_cidrs` is empty or omitted, connections are denied. Add only the application server and operator networks that need access. MygramDB has no native TLS, so terminate TLS at a reverse proxy or load balancer when needed. Administrative commands use `api.admin_token`; ordinary search endpoints remain protected by the bind address and CIDR allowlist.

IPv4-mapped IPv6 CIDRs with prefixes shorter than `/96` are rejected because they do not map to a valid IPv4 range. Prefixes from `/96` through `/128` are folded into the corresponding IPv4 range.

Either `0.0.0.0/0` or `::/0` allows connections from every IPv4 and IPv6 address. Either is rejected when paired with a non-loopback TCP or enabled HTTP listener.

::: danger Never expose it directly to a public network
Do not publish MygramDB directly to the internet. A configuration with `0.0.0.0/0` or `::/0` in `allow_cidrs` and a non-loopback TCP or enabled HTTP bind is rejected at startup. Use a restrictive CIDR list, or keep the listener on loopback behind a reverse proxy.
:::

## Logging

```yaml
logging:
  level: "info"
  format: "json"
  file: ""
```

`file: ""` logs to stdout, which is the recommended mode for Docker and systemd.

## Runtime Variables

Use MySQL-style commands over the TCP protocol:

```sql
SHOW VARIABLES
SHOW VARIABLES LIKE 'cache%'
SET logging.level = 'debug'
SET cache.enabled = false
SET api.default_limit = 200
```

Only variables marked mutable by `SHOW VARIABLES` can be changed at runtime. If MygramDB was started with `--schema`, that schema's constraints also apply to `SET`. A failed `SET` returns one of these errors:

| Error | Cause |
|-------|-------|
| 1004 | The value violates the `--schema` constraints |
| 1008 | Unknown variable |
| 1009 | Startup-only variable |

The MySQL connection identity, tables, `memory.verify_text`, the dump directory, network ACLs, and listener binds require a restart.
