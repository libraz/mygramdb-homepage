---
title: MygramDB Quick Start - Install, Configure, and Search
description: Install a MygramDB package, configure MySQL replication and a searchable table, start the service, and run the first SYNC and SEARCH commands.
head:
  - - meta
    - name: keywords
      content: MygramDB quick start, getting started, install MygramDB, minimal config, first search, SYNC command, MySQL full-text search setup
---

# Getting Started

This guide installs the package, loads existing MySQL rows, and runs a search. For Docker, use the [Docker Deployment Guide](/docs/docker-deployment), which includes the required container settings.

## Prerequisites

- MySQL 8.4/9.x with GTID enabled, or MariaDB 10.11+/11.x/12.x
- RHEL/AlmaLinux/Rocky Linux 9 or 10, or Ubuntu 22.04/24.04
- A MySQL replication account with `SELECT`, `REPLICATION SLAVE`, and `REPLICATION CLIENT` privileges

MygramDB follows the source binlog and maintains an in-memory search index. Configure the source with row-based binlogging, full row images and row metadata, CRC32 binlog checksums, and the other requirements in [MySQL Replication](/docs/replication).

::: info What is a GTID?
A **GTID** identifies a transaction in the MySQL or MariaDB replication stream. MygramDB records the applied GTID so it can resume from the correct position after a restart.
:::

## Install a Package

Download the package for your operating system and architecture from [GitHub Releases](https://github.com/libraz/mygram-db/releases/latest).

For RHEL, AlmaLinux, or Rocky Linux 9/10:

```bash
sudo rpm -i mygramdb-*.el9.x86_64.rpm
```

Use the `.el10` package on EL10. For Ubuntu 22.04/24.04, install the matching architecture package:

```bash
sudo apt install ./mygramdb_*_amd64.deb
```

The package installs an example configuration but does not create the active configuration. Copy it and edit the MySQL credentials, database, and table settings:

```bash
sudo cp /etc/mygramdb/config.yaml.example /etc/mygramdb/config.yaml
sudoedit /etc/mygramdb/config.yaml
```

Use a configuration like this, replacing the example connection and table values:

```yaml
mysql:
  host: "127.0.0.1"
  port: 3306
  user: "repl_user"
  password: "your_password"
  database: "myapp"

tables:
  - name: "articles"
    text_source:
      column: "content"
    primary_key: "id"

replication:
  server_id: 83917

network:
  allow_cidrs:
    - "127.0.0.1/32"
```

`replication.server_id` must be unique among MySQL replicas and MygramDB instances connected to the same source. `network.allow_cidrs` is required; an empty list denies all connections. Add only the client addresses that need access.

## Start the Service

After editing the configuration, start MygramDB:

```bash
sudo systemctl enable --now mygramdb
sudo systemctl status mygramdb
```

Package installations create a dedicated non-root service user. MygramDB refuses to run as root.

## Load and Search Data

Connect to the local TCP API and start the initial load:

```bash
mygram-cli -h 127.0.0.1 -p 11016
```

```mygram
127.0.0.1:11016> SYNC articles
OK SYNC STARTED table=articles

127.0.0.1:11016> SYNC STATUS
OK SYNC_STATUS
table=articles status=IN_PROGRESS progress=<done>/<total> rows (<percent>%) rate=<rows_per_second> rows/s
END
```

Run `SYNC STATUS` until the table reports `status=COMPLETED`, then search it:

```mygram
127.0.0.1:11016> SEARCH articles hello world
OK RESULTS 3 101 205 387
```

If a search returns no results, confirm that synchronization completed, the source table contains the term, and `text_source.column` names the intended column. With multiple configured databases, qualify the table as `SEARCH app_db.articles hello world`.

## Next Steps

- [Installation Guide](/docs/installation) - Package, Docker, and source installation
- [Configuration](/docs/configuration) - All configuration options
- [MySQL Replication](/docs/replication) - Source server requirements and account grants
- [Query Guide](/docs/queries) - Search syntax and examples
