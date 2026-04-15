# Configuration

MygramDB uses YAML or JSON configuration files.

## Complete Example

```yaml
# MySQL Connection
mysql:
  host: "127.0.0.1"
  port: 3306
  user: "repl_user"
  password: "your_password"
  database: "mydb"
  datetime_timezone: "+09:00"  # JST timezone

# Tables to Index
tables:
  - name: "articles"
    text_source:
      column: "content"
    filters:
      - name: "status"
        type: "int"
      - name: "category_id"
        type: "int"
    ngram_size: 2

  - name: "products"
    text_source:
      column: "description"
    ngram_size: 2

# API Server
api:
  tcp:
    port: 11016
    max_connections: 10000
  http:
    enable: true
    port: 8080

# Memory Management
memory:
  hard_limit_mb: 8192
  soft_target_mb: 4096
  verify_text: "off"              # "off", "ascii", "all"

# Synonym Dictionary (v1.6.0+)
synonyms:
  enable: false
  file: "/etc/mygramdb/synonyms.tsv"

# Persistence
dump:
  dir: "/var/lib/mygramdb/dumps"
  interval_sec: 3600
  retain: 3

# Logging
logging:
  level: "info"
  format: "text"
```

## MySQL / MariaDB Connection

MygramDB works with both **MySQL 8.4/9.x** and **MariaDB 10.6+/11.x**. The same `mysql` config section is used for both — the server flavor is auto-detected from `SELECT VERSION()` and the correct GTID format (UUID-based for MySQL, `domain-server-sequence` for MariaDB) is applied transparently.

```yaml
mysql:
  host: "127.0.0.1"
  port: 3306
  user: "repl_user"
  password: "your_password"
  database: "mydb"
```

### Required Privileges

```sql
GRANT SELECT, REPLICATION SLAVE, REPLICATION CLIENT ON *.* TO 'repl_user'@'%';
FLUSH PRIVILEGES;
```

### Server Requirements

> [!IMPORTANT]
> These settings are required for MygramDB to work. Without them, replication will fail.

```ini
# my.cnf (MySQL 8.4/9.x or MariaDB 10.6+/11.x)
gtid_mode = ON                    # MySQL
enforce_gtid_consistency = ON     # MySQL
binlog_format = ROW
binlog_row_image = FULL
```

For MariaDB, GTID is enabled by default (`gtid_domain_id` + `server_id`); `gtid_mode`/`enforce_gtid_consistency` do not apply. Ensure `binlog_format = ROW` and `binlog_row_image = FULL`.

## Table Configuration

Each table you want to index:

```yaml
tables:
  - name: "articles"           # Table name
    text_source:
      column: "content"        # Column to search
    primary_key: "id"          # Primary key column (default: "id")
    ngram_size: 2              # N-gram size for multibyte text (default: 2)
    filters:                   # Columns for filtering
      - name: "status"
        type: "int"
      - name: "user_id"
        type: "int"
      - name: "created_at"
        type: "datetime"
```

### Filter Types

| Type | Description |
|------|-------------|
| `int` | 32-bit integer |
| `bigint` | 64-bit integer |
| `string` | Text values |
| `datetime` | Date/time values |
| `date` | Date values |

## API Server

```yaml
api:
  tcp:
    bind: "127.0.0.1"         # TCP bind address
    port: 11016               # TCP protocol port
    max_connections: 10000    # Max concurrent connections
  http:
    enable: true              # Enable HTTP API
    bind: "127.0.0.1"         # HTTP bind address
    port: 8080                # HTTP API port
```

## Memory Management

```yaml
memory:
  hard_limit_mb: 8192         # Hard memory limit (MB)
  soft_target_mb: 4096        # Soft memory target (MB)
  verify_text: "off"          # N-gram post-filter verification
```

**`verify_text`** — Eliminates n-gram false positives by verifying results against stored text:

| Value | Behavior | Memory |
|-------|----------|--------|
| `off` | No verification (default) | ~740MB / million docs |
| `ascii` | Verify ASCII-only queries | Moderate |
| `all` | Verify all queries | ~2.3GB / million docs |

See [Configuration Guide](https://github.com/libraz/mygram-db/blob/main/docs/en/configuration.md#n-gram-verification-verify_text) for details.

## Persistence (Snapshots)

```yaml
dump:
  dir: "/var/lib/mygramdb/dumps"
  interval_sec: 3600          # Auto-save interval (0 = disabled)
  retain: 3                   # Number of snapshots to keep
```

## Query Cache

```yaml
cache:
  enabled: true
  max_memory_mb: 32           # Maximum cache memory (MB)
  ttl_seconds: 3600           # Cache TTL in seconds
```

## Synonym Dictionary

Expand search terms into OR-groups of synonyms at query time (v1.6.0+):

```yaml
synonyms:
  enable: true
  file: "/etc/mygramdb/synonyms.tsv"
```

Synonym file format (TSV, one group per line, tab-separated):

```tsv
car	automobile	vehicle
fast	quick	rapid	speedy
# lines starting with '#' are comments
```

- Bidirectional: searching for any term in a group matches all terms in that group
- Up to 20 synonyms per group
- All terms are normalized using the same rules as the index (NFKC, width conversion)

## Logging

```yaml
logging:
  level: "info"             # debug, info, warn, error
  format: "text"            # text or json
  file: "/var/log/mygramdb/mygramdb.log"
```

## Network Security

> [!WARNING]
> If `allow_cidrs` is empty or not configured, all connections are denied. You must add at least one CIDR to allow access.

```yaml
network:
  allow_cidrs:
    - "127.0.0.1/32"
    - "192.168.1.0/24"
    - "10.0.0.0/8"
```

## Unix Domain Socket

For local connections with lower latency, configure a Unix domain socket:

```yaml
api:
  unix_socket:
    path: "/var/run/mygramdb/mygramdb.sock"
```

Connect via CLI:

```bash
mygram-cli -s /var/run/mygramdb/mygramdb.sock SEARCH articles "hello"
```

## Runtime Variables

Most settings can be updated at runtime without restart using MySQL-style SET/SHOW VARIABLES commands:

```sql
-- Show all variables
SHOW VARIABLES;

-- Show specific variables
SHOW VARIABLES LIKE 'cache%';

-- Change settings at runtime
SET logging.level = 'debug';
SET cache.enabled = false;
SET api.default_limit = 200;
```

> [!NOTE]
> The following settings are immutable and require a full restart:
> - `mysql.database`
> - `tables` (add/remove)
> - `api.tcp.port`, `api.http.port`

## Next Steps

- [Query Guide](/docs/queries) - Learn the search syntax
- [Getting Started](/docs/getting-started) - Quick start guide

## Detailed Documentation

- [Full Configuration Reference](https://github.com/libraz/mygram-db/blob/main/docs/en/configuration.md)
- [MySQL Replication](https://github.com/libraz/mygram-db/blob/main/docs/en/replication.md)
- [Snapshot & Persistence](https://github.com/libraz/mygram-db/blob/main/docs/en/snapshot.md)
