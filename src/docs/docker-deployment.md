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

- `MYSQL_ROOT_PASSWORD` - MySQL root password
- `MYSQL_PASSWORD` - MySQL replication user password; Compose requires it, and the entrypoint requires it when generating a configuration
- `API_ADMIN_TOKEN` - high-entropy secret for administrative commands; Compose rejects an unset value and the entrypoint rejects the sample placeholder
- `REPLICATION_SERVER_ID` - Unique server ID for this MygramDB instance
:::

### 3. Start Services (Development)

```bash
# Build and start all services
docker-compose up -d

# View logs
docker-compose logs -f

# Check status
docker-compose ps
```

### 4. Stop Services

```bash
# Stop all services
docker-compose down

# Stop and remove volumes (WARNING: This deletes all data)
docker-compose down -v
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
MYSQL_PORT=3306                     # MySQL port
MYSQL_USER=repl_user                # MySQL user
MYSQL_PASSWORD=your_password        # Required MySQL password
MYSQL_DATABASE=mydb                 # Database name
MYSQL_USE_GTID=true                 # Use GTID-based replication
```

#### Table Configuration

```bash
TABLE_NAME=articles                 # Table to index
TABLE_PRIMARY_KEY=id                # Primary key column
TABLE_TEXT_COLUMN=content           # Text column to index
TABLE_NGRAM_SIZE=2                  # N-gram size for ASCII
TABLE_KANJI_NGRAM_SIZE=1            # N-gram size for CJK
```

#### Replication Configuration

::: info What is server_id?
**server_id** identifies a MySQL replication connection. Give each MygramDB instance and MySQL replica attached to the same MySQL a value that does not collide.
:::

```bash
REPLICATION_ENABLE=true             # Enable replication
REPLICATION_SERVER_ID=12345         # Unique server ID (IMPORTANT)
REPLICATION_START_FROM=snapshot     # Start from: snapshot, latest, or gtid=<UUID:txn>
REPLICATION_AUTO_INITIAL_SNAPSHOT=true # Build the initial snapshot automatically
```

#### Memory Management

```bash
MEMORY_HARD_LIMIT_MB=8192           # Hard memory limit
MEMORY_SOFT_TARGET_MB=4096          # Soft memory target
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

`API_ADMIN_TOKEN` is required by Compose because the container listener is non-loopback. Generate it with `openssl rand -hex 32`. Administrative TCP commands require `AUTH <token>` on the connection; `POST /optimize` requires `Authorization: Bearer <token>`.

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
    command: ["mygramdb", "-c", "/etc/mygramdb/config.yaml"]
```

Or run directly with Docker:

```bash
# Create your config file
cp examples/config-minimal.yaml my-config.yaml
# Edit my-config.yaml as needed

# Run with custom config
docker run -d --name mygramdb \
  -p 11016:11016 \
  -v $(pwd)/my-config.yaml:/etc/mygramdb/config.yaml:ro \
  -e SKIP_CONFIG_GEN=true \
  mygramdb:latest \
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

# Or specify version manually
docker build --build-arg MYGRAMDB_VERSION=1.2.5 -t mygramdb:1.2.5 .

# Tag as latest
docker tag mygramdb:$VERSION mygramdb:latest
```

**Note:** If `MYGRAMDB_VERSION` build argument is not provided, the build will use version 0.0.0 or attempt to read from git tags if the `.git` directory is present in the build context.

### Using Pre-built Images

```bash
# Pull the latest image from GitHub Container Registry
docker pull ghcr.io/libraz/mygram-db:latest

# Use production docker-compose file
docker-compose -f docker-compose.prod.yml up -d
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

3. Start with production configuration:
```bash
docker-compose -f docker-compose.prod.yml --env-file .env.prod up -d
```

### Resource Limits

Production compose file includes resource limits:

**MySQL:**

- CPU: 2-4 cores
- Memory: 2-4 GB

**MygramDB:**

- CPU: 4-8 cores
- Memory: 10-20 GB

Adjust these in `docker-compose.prod.yml` based on your workload.

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

# Restart MySQL container
docker-compose restart mysql
```

## Monitoring

### View Logs

```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f mygramdb

# Last 100 lines
docker-compose logs --tail=100 mygramdb
```

### Health Checks

```bash
# Check service health
docker-compose ps

# Manual health check
docker exec mygramdb pgrep -x mygramdb
```

### Metrics

MygramDB exposes metrics on the HTTP API port (8080 by default). Access via:

```bash
curl http://localhost:8080/metrics
```

## Backup and Restore

### Backup

```bash
# Backup MySQL data
docker exec mygramdb_mysql mysqldump -u root -p${MYSQL_ROOT_PASSWORD} mydb > backup.sql

# Backup MygramDB snapshot
docker cp mygramdb:/var/lib/mygramdb/dumps ./backup-dumps/
```

### Restore

```bash
# Restore MySQL data
docker exec -i mygramdb_mysql mysql -u root -p${MYSQL_ROOT_PASSWORD} mydb < backup.sql

# Restore and explicitly load a MygramDB dump
docker cp ./backup-dumps/mygramdb.dmp mygramdb:/var/lib/mygramdb/dumps/mygramdb.dmp
docker exec -i mygramdb sh -c 'printf "AUTH %s\nDUMP VERIFY /var/lib/mygramdb/dumps/mygramdb.dmp\n" "$API_ADMIN_TOKEN" | mygram-cli'
docker exec -i mygramdb sh -c 'printf "AUTH %s\nDUMP LOAD /var/lib/mygramdb/dumps/mygramdb.dmp\n" "$API_ADMIN_TOKEN" | mygram-cli'
```

## Troubleshooting

### Connection Issues

```bash
# Check network connectivity
docker-compose exec mygramdb ping mysql

# Check MySQL connection
docker-compose exec mygramdb mysql -h mysql -u repl_user -p${MYSQL_PASSWORD} -e "SELECT 1"
```

### Configuration Issues

```bash
# Check version
docker run --rm mygramdb:latest --version

# Show help
docker run --rm mygramdb:latest --help

# Test configuration
docker-compose exec mygramdb /usr/local/bin/entrypoint.sh test-config

# Or test with environment variables (uses defaults for unspecified values)
docker run --rm -e MYSQL_HOST=testdb -e TABLE_NAME=test mygramdb:latest test-config

# View generated configuration
docker-compose exec mygramdb cat /etc/mygramdb/config.yaml
```

### Performance Issues

1. Check resource usage:
```bash
docker stats
```

2. Adjust memory limits in `.env`:
```bash
MEMORY_HARD_LIMIT_MB=16384
MEMORY_SOFT_TARGET_MB=8192
```

3. Adjust build parallelism:
```bash
BUILD_PARALLELISM=4
```

## Scaling

### Multiple MygramDB Instances

To run multiple MygramDB instances (e.g., for different tables):

```bash
# Create separate compose files for each instance
cp docker-compose.yml docker-compose.instance1.yml
cp docker-compose.yml docker-compose.instance2.yml

# Use different project names and ports
docker-compose -f docker-compose.instance1.yml -p mygramdb1 up -d
docker-compose -f docker-compose.instance2.yml -p mygramdb2 up -d
```

### Load Balancing

Use nginx or HAProxy to load balance across multiple MygramDB instances:

```nginx
upstream mygramdb_backend {
    server localhost:11016;
    server localhost:11017;
    server localhost:11018;
}

server {
    listen 80;
    location / {
        proxy_pass http://mygramdb_backend;
    }
}
```

## Security Best Practices

1. **Use strong passwords** - Change all default passwords in `.env`
2. **Network isolation** - Use Docker networks to isolate services
3. **Bind to localhost** - In production, bind MySQL to `127.0.0.1` only
4. **Enable TLS** - Use TLS for MySQL connections
5. **Regular updates** - Keep Docker images up to date
6. **Backup regularly** - Automate backups of MySQL and MygramDB snapshots

## References

- [Configuration Guide](/docs/configuration)
- [MySQL Replication Setup](/docs/replication)
- [Performance Tuning](/docs/performance)
