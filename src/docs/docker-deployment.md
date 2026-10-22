---
title: MygramDB Docker Deployment - Compose Setup and Production
description: Deploy MygramDB with Docker and Docker Compose. Environment variables, custom config mounting, production tuning, resource limits, backup/restore, scaling, and security best practices.
head:
  - - meta
    - name: keywords
      content: MygramDB Docker, docker-compose, container deployment, environment variables, production deployment, GHCR image, load balancing
---

# Docker Deployment Guide

::: warning Review before exposing to production
The quick-start settings are for evaluation. Before production, revisit the MySQL password, `REPLICATION_SERVER_ID`, the source CIDRs, the Docker memory limit, and the persistent volume for dumps.
:::

This guide explains how to deploy MygramDB using Docker and Docker Compose.

## Quick Start

### 1. Prerequisites

- Docker 20.10+
- Docker Compose 2.0+

### 2. Setup Environment Variables

```bash
# Copy the example environment file
cp .env.example .env

# Edit .env and configure your settings
nano .env
```

::: warning
Change the following default values in `.env`:

- `MYSQL_ROOT_PASSWORD` - MySQL root password; the `.env.example` placeholder is rejected at startup
- `MYSQL_PASSWORD` - MySQL replication user password; Compose requires it, and the entrypoint requires it when generating a configuration
- `API_ADMIN_TOKEN` - high-entropy secret for administrative commands; Compose rejects an unset value and the entrypoint rejects the sample placeholder
- `REPLICATION_SERVER_ID` - Unique server ID for this MygramDB instance
:::

### 3. Start Services (Development)

```bash
# Build and start all services
docker compose up -d

# View logs
docker compose logs -f

# Check status
docker compose ps
```

The bundled Compose file starts its MySQL source with `--binlog-row-metadata=FULL`. If MygramDB connects to another MySQL or MariaDB source, configure that setting on the source server; it is not a MygramDB environment variable.

### 4. Stop Services

```bash
# Stop all services
docker compose down

# Stop and remove volumes (WARNING: This deletes all data)
docker compose down -v
```

## Configuration

### Environment Variables

The `.env` file configures the single-table quick-start image. The current [`.env.example`](https://github.com/libraz/mygram-db/blob/main/.env.example) is the complete source of supported variables; use a mounted configuration file for multi-table and advanced settings.

::: info Environment variables vs config file
Environment variables are the fast path to a basic single-table deployment. For multiple tables, multiple databases, filters, synonyms, or detailed HTTP settings, mount a custom configuration file as described below.
:::

::: tip Prefer a config file in production
In production, managing an explicit `config.yaml` makes changes easier to review than expressing everything through environment variables. Use environment variables for the values that differ per environment, such as passwords and hostnames.
:::

#### MySQL Configuration

```bash
MYSQL_HOST=mysql                    # MySQL host
MYSQL_PORT=3306                     # MySQL port inside the Compose network
MYSQL_HOST_PORT=3306                # Host-published MySQL port
MYSQL_USER=repl_user                # MySQL user
MYSQL_PASSWORD=your_password        # Required MySQL password
MYSQL_DATABASE=mydb                 # Database name
MYSQL_USE_GTID=true                 # Use GTID-based replication
```

`MYSQL_PORT` is the port MygramDB uses to connect to MySQL from inside the Compose network. `MYSQL_HOST_PORT` controls only the host-side published port; it does not change the port used between Compose services.

#### Table Configuration

```bash
TABLE_NAME=articles                 # Table to index
TABLE_PRIMARY_KEY=id                # Primary key column
TABLE_TEXT_COLUMN=content           # Text column to index
TABLE_NGRAM_SIZE=2                  # N-gram size for kana, ASCII, and other non-ideograph scripts
TABLE_KANJI_NGRAM_SIZE=1            # N-gram size for CJK ideographs
```

#### Replication Configuration

::: info What is server_id?
**server_id** identifies a MySQL replication connection. Give each MygramDB instance and MySQL replica attached to the same MySQL a value that does not collide.
:::

```bash
REPLICATION_ENABLE=true             # Enable replication
REPLICATION_SERVER_ID=12345         # Unique non-zero ID from 1 to 4294967295
REPLICATION_START_FROM=snapshot     # snapshot, latest, MySQL GTID set, or MariaDB GTID list
REPLICATION_AUTO_INITIAL_SNAPSHOT=true # Build the initial snapshot automatically
```

#### Memory Management

```bash
MEMORY_HARD_LIMIT_MB=8192           # Reserved; does not cap process memory
MEMORY_SOFT_TARGET_MB=4096          # Reserved; not enforced
MEMORY_NORMALIZE_NFKC=true          # NFKC normalization
MEMORY_NORMALIZE_WIDTH=narrow       # Width normalization
MEMORY_VERIFY_TEXT=off              # off, ascii, or all
```

#### Dumps, Ranking, and Cache

```bash
DUMP_DIR=/var/lib/mygramdb/dumps
DUMP_INTERVAL_SEC=600
DUMP_RETAIN=3
BM25_ENABLE=false
BM25_K1=1.2
BM25_B=0.75
CACHE_ENABLED=true
CACHE_MAX_MEMORY_MB=32
CACHE_MIN_QUERY_COST_MS=10.0
CACHE_TTL_SECONDS=3600
```

Use `DUMP_*`, not the removed `SNAPSHOT_*` variables.

#### MySQL TLS

::: warning Set a Docker memory limit
MygramDB's own memory settings do not forcibly cap process usage. When running in containers, set `mem_limit` in Compose or the equivalent limit on your orchestration platform.
:::

```bash
MYSQL_DATETIME_TIMEZONE=+00:00
MYSQL_SSL_ENABLE=false
MYSQL_SSL_CA=
MYSQL_SSL_CERT=
MYSQL_SSL_KEY=
MYSQL_SSL_VERIFY_SERVER_CERT=true
```

#### API Server

::: info Host bind and container bind are separate
The Compose file publishes TCP and HTTP ports on `127.0.0.1` on the host. Inside the Docker network, it uses `API_CONTAINER_BIND` and `API_HTTP_CONTAINER_BIND` (both default to `0.0.0.0`) because a container must listen on its own interface. Do not replace the host-side loopback mappings with public mappings unless a reverse proxy or firewall is part of the design.
:::

```bash
API_BIND=127.0.0.1                  # Directly launched server bind address
API_PORT=11016                      # API port
API_HTTP_ENABLE=true
API_HTTP_BIND=127.0.0.1
API_HTTP_PORT=8080
API_ADMIN_TOKEN=CHANGE_ME_GENERATE_RANDOM_SECRET
# Compose-only container listeners; host ports stay bound to 127.0.0.1
API_CONTAINER_BIND=0.0.0.0
API_HTTP_CONTAINER_BIND=0.0.0.0
API_RATE_LIMIT_ENABLE=false
API_RATE_LIMIT_CAPACITY=100
API_RATE_LIMIT_REFILL_RATE=10
API_RATE_LIMIT_MAX_CLIENTS=10000
```

`API_ADMIN_TOKEN` is required by Compose because the container listeners are non-loopback. Generate it with `openssl rand -hex 32`. Administrative TCP commands require `AUTH <token>` on the connection. HTTP `GET /config`, `GET /replication/status`, and `POST /optimize` require `Authorization: Bearer <token>`.

#### Network Configuration

```bash
# The Docker bridge presents published-port clients as its gateway.
# 172.16.0.0/12 covers Docker's default bridge pool; narrow this when possible.
NETWORK_ALLOW_CIDRS=127.0.0.1/32,172.16.0.0/12
```

::: warning
`NETWORK_ALLOW_CIDRS` is mandatory in Compose. Do not use `0.0.0.0/0` or `::/0` with a non-loopback API bind: MygramDB rejects that configuration at startup. For a custom container network, set only the application and operator CIDRs that need access.
:::

#### Logging

```bash
LOG_LEVEL=info                      # Log level: debug, info, warn, error
LOG_FORMAT=json                     # Log format: json or text
```

### Custom Configuration File

If you need more advanced configuration (filters, multiple tables, etc.), you can mount a custom config file:

```yaml
# docker-compose.override.yml
version: '3.8'

services:
  mygramdb:
    volumes:
      - ./my-config.yaml:/etc/mygramdb/config.yaml:ro
    environment:
      SKIP_CONFIG_GEN: "true"
      MYGRAM_MYSQL_HOST: ${MYSQL_HOST:-mysql}
      MYGRAM_MYSQL_PORT: ${MYSQL_PORT:-3306}
      MYGRAM_MYSQL_USER: ${MYSQL_USER:-repl_user}
      MYGRAM_MYSQL_PASSWORD: ${MYSQL_PASSWORD:?MYSQL_PASSWORD must be set}
      MYGRAM_MYSQL_DATABASE: ${MYSQL_DATABASE:-mydb}
      MYGRAM_API_ADMIN_TOKEN: ${API_ADMIN_TOKEN:?API_ADMIN_TOKEN must be set}
    command: ["mygramdb", "-c", "/etc/mygramdb/config.yaml"]
```

With `SKIP_CONFIG_GEN=true`, the entrypoint does not copy Compose's `MYSQL_*` and `API_ADMIN_TOKEN` values into the mounted file. The `MYGRAM_*` mappings above apply the server's supported overrides directly. In `my-config.yaml`, set `api.tcp.bind: "0.0.0.0"` and, if HTTP is enabled, `api.http.bind: "0.0.0.0"` so the mapped ports can reach the server. Set `network.allow_cidrs` to include the Docker bridge and intended clients; Compose's `API_CONTAINER_BIND`, `API_HTTP_CONTAINER_BIND`, and `NETWORK_ALLOW_CIDRS` no longer change these file settings. Put other settings in `my-config.yaml`. Set a private `MYSQL_ROOT_PASSWORD` in `.env` as well, because the MySQL service still uses it.

For a standalone container, copy the minimal configuration and edit it before starting. Set `mysql.host` to an address reachable **from the container** (its `127.0.0.1` means the container itself), fill in the MySQL credentials, set `api.tcp.bind: "0.0.0.0"`, and add the Docker bridge gateway's CIDR to `network.allow_cidrs`. A non-loopback listener also requires an admin token. Keep the published host port on loopback unless remote access is intended.

```bash
cp examples/config-minimal.yaml my-config.yaml
# Edit mysql.host/credentials, api.tcp.bind, and network.allow_cidrs in my-config.yaml
export MYGRAM_API_ADMIN_TOKEN="$(openssl rand -hex 32)"

# Start with the edited config
docker run -d --name mygramdb-standalone \
  -p 127.0.0.1:11016:11016 \
  -v "$PWD/my-config.yaml:/etc/mygramdb/config.yaml:ro" \
  -e SKIP_CONFIG_GEN=true \
  -e MYGRAM_API_ADMIN_TOKEN \
  ghcr.io/libraz/mygram-db:1.11.1 \
  mygramdb -c /etc/mygramdb/config.yaml
```

## Production Deployment

### Building Docker Images

To build a Docker image with proper version tagging:

```bash
# Get the current version from git tag
VERSION=$(git describe --tags --abbrev=0 | sed 's/^v//')

# Build with version argument
docker build --build-arg MYGRAMDB_VERSION=$VERSION -t mygramdb:$VERSION .

# Or specify the released version manually
docker build --build-arg MYGRAMDB_VERSION=1.11.1 -t mygramdb:1.11.1 .

# Tag as latest
docker tag mygramdb:$VERSION mygramdb:latest
```

**Note:** If `MYGRAMDB_VERSION` build argument is not provided, the build will use version 0.0.0 or attempt to read from git tags if the `.git` directory is present in the build context.

### Using a Pre-built Image

The repository ships `docker-compose.yml`; it has no separate production Compose file. To use the published image instead of building locally, give it the tag expected by that file:

```bash
docker pull ghcr.io/libraz/mygram-db:1.11.1
docker tag ghcr.io/libraz/mygram-db:1.11.1 mygramdb:1.11.1
```

### Environment Setup

1. Create production `.env` file:
```bash
cp .env.example .env.prod
nano .env.prod
```

2. Set production values:
```bash
# Production MySQL configuration
MYSQL_HOST=production-mysql-host
MYSQL_PORT=3306
MYSQL_USER=repl_user
MYSQL_ROOT_PASSWORD=replace_with_a_private_root_password
MYSQL_PASSWORD=strong_secure_password_here

# Generate with `openssl rand -hex 32`, then paste the output here.
API_ADMIN_TOKEN=CHANGE_ME_GENERATE_RANDOM_SECRET
NETWORK_ALLOW_CIDRS=127.0.0.1/32,172.16.0.0/12

# Production memory settings
MEMORY_HARD_LIMIT_MB=16384
MEMORY_SOFT_TARGET_MB=8192

# Production API settings. Compose publishes these ports only on localhost.
API_PORT=11016
API_HTTP_PORT=8080

# Production logging
LOG_LEVEL=info
LOG_FORMAT=json
```

3. Start with production configuration. The first command uses the published image tagged above; the second builds the image from this checkout instead:
```bash
MYGRAMDB_VERSION=1.11.1 docker compose --env-file .env.prod up -d --no-build
# Or build locally:
MYGRAMDB_VERSION=1.11.1 docker compose --env-file .env.prod up -d --build
```

### Resource Limits

The shipped Compose file does not set CPU or memory limits. Add limits to a local `docker-compose.override.yml` before using it in production. For example:

```yaml
services:
  mygramdb:
    mem_limit: 16g
```

Size the limit from measured RSS and leave headroom for `OPTIMIZE`, which may need roughly another full copy of the index. The following are starting points to measure, not limits supplied by Compose:

**MySQL:**

- CPU: 2-4 cores
- Memory: 2-4 GB

**MygramDB:**

- CPU: 4-8 cores
- Memory: 10-20 GB

Adjust them for your workload and host capacity.

## Database Initialization

The MySQL container automatically executes scripts in `support/docker/mysql/init/`:

- `01-create-tables.sql` - Creates sample tables

To add your own initialization scripts:

```bash
# Create your SQL script
cat > support/docker/mysql/init/02-my-tables.sql <<EOF
CREATE TABLE my_table (
    id BIGINT PRIMARY KEY,
    content TEXT
);
EOF

# Apply to an existing MySQL volume; init scripts run automatically only on first initialization
docker compose exec -T mysql sh -c 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysql -u root "$MYSQL_DATABASE"' < support/docker/mysql/init/02-my-tables.sql
```

## Monitoring

### View Logs

```bash
# All services
docker compose logs -f

# Specific service
docker compose logs -f mygramdb

# Last 100 lines
docker compose logs --tail=100 mygramdb
```

### Health Checks

The image health check probes `/health/live` on `API_HTTP_PORT`. When `API_HTTP_ENABLE=false`, it skips the HTTP probe. The Compose health check follows the same settings.

```bash
# Check service health
docker compose ps

# Manual health check
docker compose exec mygramdb curl -fsS http://127.0.0.1:8080/health/live
```

### Metrics

MygramDB exposes metrics on the HTTP API port (8080 by default). The metrics endpoint stays public, but when `API_ADMIN_TOKEN` is set it omits `mygramdb_replication_` metrics unless the request includes the bearer token:

```bash
curl -H "Authorization: Bearer $API_ADMIN_TOKEN" http://localhost:8080/metrics
```

## Backup and Restore

### Backup

Wait until the initial `SYNC` has completed for every configured table. In a MySQL-enabled build with replication enabled, `DUMP SAVE` also requires a GTID position; otherwise it returns error 6029. The dump stores the index, source identity, and replication position. It is not a backup of MySQL data. Back up MySQL data and retain the required binlogs separately; these operations do not create an atomic recovery point. On recovery, use a source state compatible with the recorded identity and position, or run `SYNC` to rebuild the index. This example assumes the default `dump.dir`, `/var/lib/mygramdb/dumps`; adjust the copy path if your configuration uses another directory.

```bash
# Backup MySQL data
docker compose exec -T mysql sh -c 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysqldump -u root "$MYSQL_DATABASE"' > backup.sql

# Wait until the server is ready
docker compose exec -T mygramdb mygram-cli --wait-ready INFO

# Save and verify a named snapshot (the CLI waits for DUMP SAVE to finish)
docker compose exec -T mygramdb sh -c 'printf "AUTH %s\nDUMP SAVE manual-backup.dmp\nDUMP VERIFY manual-backup.dmp\n" "$API_ADMIN_TOKEN" | mygram-cli'

# Copy the exact file created above to the host
mkdir -p ./backup-dumps
docker compose cp mygramdb:/var/lib/mygramdb/dumps/manual-backup.dmp ./backup-dumps/manual-backup.dmp
```

### Restore

```bash
# Restore MySQL data
docker compose exec -T mysql sh -c 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysql -u root "$MYSQL_DATABASE"' < backup.sql

# Restore and explicitly load a MygramDB dump
docker compose cp ./backup-dumps/manual-backup.dmp mygramdb:/var/lib/mygramdb/dumps/manual-backup.dmp
docker compose exec -T mygramdb sh -c 'printf "AUTH %s\nDUMP VERIFY /var/lib/mygramdb/dumps/manual-backup.dmp\n" "$API_ADMIN_TOKEN" | mygram-cli'
docker compose exec -T mygramdb sh -c 'printf "AUTH %s\nDUMP LOAD /var/lib/mygramdb/dumps/manual-backup.dmp\n" "$API_ADMIN_TOKEN" | mygram-cli'
```

## Troubleshooting

### Connection Issues

```bash
# Check the application and its MySQL-backed readiness (when HTTP is enabled)
docker compose exec mygramdb curl -fsS http://127.0.0.1:8080/health/ready

# Check SQL from the MySQL container, which includes the mysql client
docker compose exec mysql sh -c 'MYSQL_PWD="$MYSQL_PASSWORD" mysql -h 127.0.0.1 -u "$MYSQL_USER" "$MYSQL_DATABASE" -e "SELECT 1"'
```

### Configuration Issues

```bash
# Check version
docker run --rm mygramdb:1.11.1 --version

# Show help
docker run --rm mygramdb:1.11.1 --help

# Test the running container's configuration
docker compose exec mygramdb mygramdb -t /etc/mygramdb/config.yaml

# View generated configuration
docker compose exec mygramdb cat /etc/mygramdb/config.yaml
```

The image also accepts `version` and `help` without a configuration file. The flag forms above work the same way.

### Performance Issues

1. Check resource usage:
```bash
docker stats
```

2. Size the Compose `mem_limit` from measured RSS and leave room for maintenance; see [Resource Limits](#resource-limits). `MEMORY_HARD_LIMIT_MB` and `MEMORY_SOFT_TARGET_MB` are reserved settings and do not cap the process.

## Scaling

### Multiple MygramDB Instances

For read capacity or availability, deploy full replicas on separate hosts, each with a unique `REPLICATION_SERVER_ID` and the same MySQL source. Send traffic only to ready instances. Each replica holds the full index, so this does not reduce per-node memory.

If several supplied Compose stacks run on one host, give each stack distinct host mappings for MySQL, TCP, and HTTP, plus a distinct `REPLICATION_SERVER_ID` and appropriate credentials. The `-p` project name only separates container and volume names; it does not change published ports. Set `API_PORT` and `API_HTTP_PORT` for the application. Set `MYSQL_HOST_PORT` to change the host-side MySQL mapping while leaving `MYSQL_PORT` at the MySQL container port, normally 3306. For different indexed tables, route queries to the appropriate instance in the application.

### Load Balancing

For identical full replicas, an HTTP reverse proxy can distribute requests to each node's HTTP API port (8080 by default):

```nginx
upstream mygramdb_backend {
    server node1.internal:8080;
    server node2.internal:8080;
    server node3.internal:8080;
}

server {
    listen 80;
    location / {
        proxy_pass http://mygramdb_backend;
    }
}
```

Port 11016 speaks MygramDB's TCP protocol; an HTTP proxy cannot use it as an upstream. Use an nginx `stream` block or a TCP load balancer for that port, and gate both surfaces on `/health/ready`.

## Security Best Practices

1. **Use strong passwords** - Change all default passwords in `.env`
2. **Network isolation** - Use Docker networks to isolate services
3. **Limit host exposure** - Publish MySQL's host port on `127.0.0.1`; keep the container listener reachable from MygramDB over the Compose bridge
4. **Enable TLS** - Use TLS for MySQL connections
5. **Regular updates** - Keep Docker images up to date
6. **Backup regularly** - Automate backups of MySQL and MygramDB snapshots

## References

- [Configuration Guide](/docs/configuration)
- [MySQL Replication Setup](/docs/replication)
- [Performance Tuning](/docs/performance)
