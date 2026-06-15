# Configuration

MygramDB accepts YAML or JSON configuration files. Files are validated against the built-in JSON Schema at startup, so unknown keys, wrong types, missing required fields, and invalid enum values fail fast.

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

## MySQL / MariaDB Connection

MygramDB works with MySQL 8.4/9.x and MariaDB 10.6+/11.x. The same `mysql` section is used for both; the server flavor is detected from `SELECT VERSION()` and MygramDB chooses the correct GTID format.

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
```

`datetime_timezone` controls how MySQL `DATETIME`, `DATE`, and `TIME` values are interpreted. `TIMESTAMP` values are always handled as UTC.

Environment variables can override selected MySQL fields: `MYGRAM_MYSQL_USER`, `MYGRAM_MYSQL_PASSWORD`, `MYGRAM_MYSQL_HOST`, and `MYGRAM_MYSQL_DATABASE`.

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

`text_source` must specify either:

| Field | Meaning |
|-------|---------|
| `column` | Index one text column |
| `concat` | Concatenate two or more columns before indexing |
| `delimiter` | Separator used with `concat` (default: space) |

## Filters

`required_filters` decide which rows are indexed. Rows that do not match these conditions are omitted from the index; during replication, rows moving out of the condition are removed and rows moving in are added.

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
    bitmap_index: true
  - name: "category"
    type: "string"
    dict_compress: true
  - name: "created_at"
    type: "datetime"
    bucket: "day"
```

Supported filter types include signed and unsigned integer sizes, `float`, `double`, `string`, `varchar`, `text`, `datetime`, `date`, `timestamp`, and `time`. `bucket` is available for datetime-like values with `minute`, `hour`, or `day`.

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

`ngram_size` applies to ASCII/alphanumeric text. `kanji_ngram_size` applies to CJK characters; `0` means use `ngram_size`. `cross_boundary_ngrams` controls whether mixed-script boundary n-grams such as `字A` are generated.

`freq_bits` can be `0`, `4`, or `8`. BM25 scoring and highlighting use stored normalized text when `memory.verify_text` is enabled; they do not require `freq_bits`.

## Per-table Synonyms

Synonym expansion is configured per table, not globally.

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

`auto_initial_snapshot` defaults to `false`; start the first load explicitly with `SYNC <table>` for each table you want to load. This avoids accidentally loading large tables on startup. Set it to `true` only when startup-time loading is intentional.

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
    thread_pool_queue_size: 1000
    max_write_queue_bytes: 16777216
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
    enable_cors: false
    cors_allow_origin: ""
    max_body_bytes: 16777216
    read_timeout_sec: 5
    write_timeout_sec: 5
  default_limit: 100
  max_query_length: 128
```

TCP and HTTP bind to loopback by default. `api.default_limit` and `api.max_query_length` can be changed at runtime with `SET`; network binds, HTTP body limit, and most connection settings require restart.

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

## Persistence

```yaml
dump:
  dir: "/var/lib/mygramdb/dumps"
  default_filename: "mygramdb.dmp"
  interval_sec: 7200
  retain: 3
```

`interval_sec: 0` disables automatic dumps. Manual `DUMP SAVE` uses `default_filename` unless a path is provided. In v1.7.0, dump metadata preserves each table's database so multi-database identities round-trip correctly.

## Network Security

```yaml
network:
  allow_cidrs:
    - "127.0.0.1/32"
    - "10.0.0.0/8"
```

If `allow_cidrs` is empty or omitted, connections are denied. Add only the application server and operator networks that need access. MygramDB does not provide native TLS or API authentication; put it behind a firewall, private network, or reverse proxy when exposing HTTP.

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
SHOW VARIABLES;
SHOW VARIABLES LIKE 'cache%';
SET logging.level = 'debug';
SET cache.enabled = false;
SET api.default_limit = 200;
```

Only variables marked mutable by `SHOW VARIABLES` can be changed at runtime. MySQL connection identity, tables, `memory.verify_text`, dump directory, network ACLs, and listener binds require restart.
