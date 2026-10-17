---
title: MygramDB Quick Start - Install, Configure, and Search in 5 Minutes
description: Get MygramDB running in five minutes. Prerequisites, package install, a minimal config.yaml, starting the service, and running your first SYNC and SEARCH.
head:
  - - meta
    - name: keywords
      content: MygramDB quick start, getting started, install MygramDB, minimal config, first search, SYNC command, MySQL full-text search setup
---

# Getting Started

Get MygramDB up and running in 5 minutes.

## Prerequisites

- MySQL 8.4/9.x with GTID enabled, or MariaDB 10.11+/11.x/12.x
- RHEL/AlmaLinux/Rocky Linux 9, Ubuntu 22.04/24.04, or Docker

MygramDB deploys next to your existing database as a sidecar: your application keeps writing to MySQL/MariaDB unchanged, MygramDB follows the binlog to build its own search index, and only search queries go to MygramDB.

::: info What is a GTID?
A **GTID** is a unique identifier attached to each change in MySQL. MygramDB uses it to know exactly how far it has read, so it picks up from the right place after a restart.
:::

::: warning MySQL needs preparation too
MygramDB reads the MySQL/MariaDB binlog, so the upstream server needs GTID enabled, ROW-format binlog, `binlog_row_image=FULL`, `binlog_row_metadata=FULL`, a replication user, and `SELECT` on the target tables. See [MySQL Replication](/docs/replication) for the full setup.
:::

<DocDiagram name="deployment-topology" alt="The application keeps writing to MySQL or MariaDB as before, MygramDB follows the GTID binlog stream to maintain an in-memory search index, and the application sends only search queries to MygramDB over TCP 11016 or HTTP 8080." />

## Quick Install

### RPM (RHEL/AlmaLinux/Rocky Linux 9)

Download from [GitHub Releases](https://github.com/libraz/mygram-db/releases/latest) and install:

```bash
sudo rpm -i mygramdb-*.el9.x86_64.rpm
```

### Docker

```bash
docker pull ghcr.io/libraz/mygram-db:1.11.0
```

## Minimal Configuration

Create `/etc/mygramdb/config.yaml`:

```yaml
mysql:
  host: "localhost"
  port: 3306
  user: "mygramdb"
  password: "your_password"
  database: "myapp"

tables:
  - name: "articles"
    text_source:
      column: "content"
    primary_key: "id"

replication:
  server_id: 83917

api:
  tcp:
    port: 11016
  http:
    enable: true
    port: 8080
  admin_token: "replace-with-a-high-entropy-secret"

# Allow connections from localhost
network:
  allow_cidrs:
    - "127.0.0.1/32"
```

::: warning
The `allow_cidrs` setting is required. Without it, all connections are denied. Add your client IPs to this list.
:::

::: info What is CIDR?
**CIDR** is a notation for a range of IP addresses. `127.0.0.1/32` means localhost only; `10.0.0.0/8` means the whole private network starting with `10.`.
:::

::: tip Keep the admin token outside the file when practical
For a production configuration, provide the secret as `MYGRAM_API_ADMIN_TOKEN` instead of committing it to the YAML file. It is required when TCP listens on a non-loopback address without a Unix socket, or when enabled HTTP listens on a non-loopback address.
:::

## Start the Service

```bash
sudo systemctl enable --now mygramdb
```

## Test Your Setup

Load the existing MySQL rows before searching:

```bash
# Connect via CLI
mygram-cli -h localhost -p 11016
```

Once connected, start `SYNC` and wait for it to complete:

```mygram
127.0.0.1:11016> AUTH replace-with-a-high-entropy-secret
OK AUTHENTICATED

127.0.0.1:11016> SYNC articles
OK SYNC STARTED table=articles

127.0.0.1:11016> SYNC STATUS
...
```

Then run a search query:

```mygram
127.0.0.1:11016> SEARCH articles hello world
OK RESULTS 3 101 205 387
```

::: tip If you get zero results
Check synchronization with `SYNC STATUS`, confirm MySQL actually has rows containing the search term, and verify `text_source.column` in the config. In a multi-database configuration, qualify the table as `SEARCH app_db.articles hello world`.
:::

## Next Steps

- [Installation Guide](/docs/installation) - Installation options
- [Configuration](/docs/configuration) - Configuration reference
- [Query Guide](/docs/queries) - Search syntax and examples

## Detailed Documentation

- [Full Configuration Reference](/docs/configuration)
- [MySQL Replication](/docs/replication)
- [Operations Guide](/docs/operations)
- [Upgrade to v1.11](/docs/upgrade-v1.11)
