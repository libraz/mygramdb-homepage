---
title: MygramDB Configuration Reference - config.yaml Options
description: Complete MygramDB configuration reference. MySQL connection, table and filter definitions, n-grams, synonyms, replication, memory, API server, rate limiting, BM25, query cache, dumps, network ACLs, and logging.
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

`mysql.user`, `mysql.database`, and at least one table are required. When `replication.enable` is true (the default), `replication.server_id` is also required and must be unique among MySQL replicas and MygramDB instances.

::: tip What to do after the minimal config
Writing the config file does not load any data. After starting the server, synchronize each table you want with `SYNC articles` and confirm completion with `SYNC STATUS`.
:::

::: info What is server_id?
**server_id** is the identifier used for a MySQL replication connection. It must not collide with any other MySQL replica or MygramDB instance attached to the same MySQL — a duplicate makes the upstream unable to tell the two apart.
:::

## MySQL / MariaDB Connection

MygramDB works with MySQL 8.4/9.x and MariaDB 10.6+/11.x. The same `mysql` section is used for both; MygramDB uses a capability probe to select the correct GTID format.

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
```

`datetime_timezone` controls how MySQL `DATETIME`, `DATE`, and `TIME` values are interpreted. `TIMESTAMP` values are always handled as UTC.

Set `ssl_enable` and the CA/certificate/key paths when MySQL requires TLS. Leave the certificate paths empty only when the server does not require them; keep `ssl_verify_server_cert: true` for verified TLS.

Environment variables can override selected MySQL fields: `MYGRAM_MYSQL_USER`, `MYGRAM_MYSQL_PASSWORD`, `MYGRAM_MYSQL_HOST`, and `MYGRAM_MYSQL_DATABASE`.

::: tip DATETIME vs TIMESTAMP
MySQL `DATETIME` carries no timezone. MygramDB uses `datetime_timezone` to decide which timezone those values are in. `TIMESTAMP` is already normalized to UTC by MySQL, so this setting does not affect it.
:::

### Required MySQL Settings

```ini
binlog_format = ROW
binlog_row_image = FULL
```

For MySQL, enable GTID:

```ini
gtid_mode = ON
enforce_gtid_consistency = ON
```

For MariaDB, GTID uses MariaDB's native `domain-server-sequence` format. Ensure `server_id` is set and row-based binlogging is enabled.

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

Table names, database names, primary keys, filter names, and text-source names must be valid SQL identifiers. Configured primary-key, text-source, and filter columns cannot use `BINARY`, `VARBINARY`, or `BLOB`. Character columns must use an `utf8mb4`, `utf8`/`utf8mb3`, or `ascii` collation. MygramDB checks these rules before replication starts so the initial loader and binlog reader can represent the same values.
:::

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
filters:
  - name: "status"
    type: "int"
  - name: "category"
    type: "string"
  - name: "created_at"
    type: "datetime"
```

Supported filter types include signed and unsigned integer sizes (including `mediumint` and `mediumint_unsigned`), `float`, `double`, `boolean`, `string`, `varchar`, `text`, `datetime`, `date`, `timestamp`, and `time`. A `boolean` filter maps to a signed MySQL `TINYINT(1)` and accepts `true`/`false` or `1`/`0`; required boolean filters support `=`, `!=`, `IS NULL`, and `IS NOT NULL`. `ENUM` and `SET` columns cannot be configured as filters because binlog row events do not carry the labels needed to keep initial load and replication semantics identical.

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

`ngram_size` applies to ASCII/alphanumeric text. In v1.8.0 and later, the omitted default is `2`; set `ngram_size: 1` explicitly only if you need the old unigram behavior. `kanji_ngram_size` applies to CJK characters; `0` means use `ngram_size`. `cross_boundary_ngrams` controls whether mixed-script boundary n-grams such as `字A` are generated.

::: info What is an N-gram?
An **N-gram** is a short slice of a string. Because it splits by character rather than by word, it works without a dictionary even in languages that do not separate words with spaces.
:::

::: warning Reserved posting keys
The whole `posting` block — `block_size`, `freq_bits`, and `use_roaring` — is validated and preserved across dumps but not yet enforced. Delta-to-Roaring conversion is driven by `memory.roaring_threshold` and by `OPTIMIZE`, not by `use_roaring`.
:::

BM25 scoring and highlighting use stored normalized text when `memory.verify_text` is enabled; they do not depend on `freq_bits`.

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

`auto_initial_snapshot` defaults to `false`; start the first load explicitly with `SYNC <table>` for each table you want to load. This avoids accidentally loading large tables on startup. Set it to `true` only when startup-time loading is intentional. In v1.8.0 and later, `auto_initial_snapshot: true` requires `start_from: "snapshot"` for both single-table and multi-table deployments.

`start_from` accepts:

| Value | Behavior |
|-------|----------|
| `snapshot` | Resume from the GTID captured by the snapshot/dump |
| `latest` | Start from current MySQL GTID, ignoring older changes |
| `gtid=<UUID:txn>` | Start from a specific MySQL GTID |

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

`hard_limit_mb`, `soft_target_mb`, `arena_chunk_mb`, and `minute_epoch` are reserved/not yet enforced. Size the host so the full index and optional text store fit in RAM.

::: warning About the memory limit
`hard_limit_mb` does not currently stop the process at the OS level. In production, estimate from the row count, `verify_text` mode, and cache size, then provision enough RAM.
:::

`verify_text` stores normalized text and verifies n-gram candidates:

| Value | Behavior |
|-------|----------|
| `off` | Fastest, no candidate verification; n-gram false positives are possible |
| `ascii` | Verify ASCII-only queries |
| `all` | Verify all queries; recommended when exact result semantics matter |

Highlighting requires stored text, so use `verify_text: "ascii"` or `"all"` when using `HIGHLIGHT`. BM25 `_score` sorting also uses stored text to count term frequency.

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

TCP and HTTP bind to loopback by default. `idle_timeout_sec: 0` disables TCP idle reaping. The pending-frame limits cap completed requests waiting for a worker; reads pause at 75% of either limit and resume after the queue drains. `api.http.max_connections` caps admitted HTTP connections, including sockets waiting for workers. `api.http.trusted_proxies` is a list of numeric reverse-proxy IP addresses whose `X-Forwarded-For` value may determine the client identity for ACLs and rate limiting; leave it empty unless requests arrive through those proxies. `api.default_limit` and `api.max_query_length` can be changed at runtime with `SET`; network binds, HTTP body limit, and most connection settings require restart.

::: info What TCP and HTTP each handle
The TCP API serves search plus administrative commands such as `SYNC`, `DUMP`, and `SET`. The HTTP API covers search, count, facet, document lookup, health, metrics, and `POST /optimize`.
:::

### Administrative authentication

`api.admin_token` is a shared secret for administrative commands. Set it in the configuration file or through `MYGRAM_API_ADMIN_TOKEN`; use a high-entropy value and keep it out of source control. When TCP binds to a non-loopback address and no Unix socket is configured, the token is mandatory or MygramDB refuses to start.

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

TCP and HTTP share one rate limiter, so a client cannot double its quota by spreading requests across protocols.

## Relevance Scoring (BM25)

```yaml
bm25:
  enable: false
  k1: 1.2
  b: 0.75
```

BM25 is off by default. `SORT _score` fails with `SORT _score requires BM25 to be enabled in configuration` until `enable` is `true`, and it additionally needs `memory.verify_text` set to `"ascii"` or `"all"` so term frequency can be counted from stored text.

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
```

Only queries slower than `min_query_cost_ms` are cached, so cheap lookups do not evict useful entries. `invalidation_strategy: "ngram"` invalidates just the entries whose terms overlap a changed row; `"table"` drops every entry for the table, which is cheaper to compute but far more destructive. `ttl_seconds: 0` disables expiry.

`cache.enabled`, `cache.min_query_cost_ms`, and `cache.ttl_seconds` can be changed at runtime with `SET`. See [Operations Guide](/docs/operations) for the `CACHE STATS` / `CACHE CLEAR` commands.

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
  interval_sec: 7200
  retain: 3
  restore_memory_budget_mb: 4096
  restore_max_section_mb: 2048
```

`interval_sec: 0` disables automatic dumps. Manual `DUMP SAVE` uses `default_filename` unless a path is provided. `restore_memory_budget_mb` bounds aggregate staged data during a V2 restore; `restore_max_section_mb` bounds one encoded V2 section. In v1.7.0 and later, dump metadata preserves each table's database so multi-database identities round-trip correctly.

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

Only variables marked mutable by `SHOW VARIABLES` can be changed at runtime. MySQL connection identity, tables, `memory.verify_text`, dump directory, network ACLs, and listener binds require restart.
