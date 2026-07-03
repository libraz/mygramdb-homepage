# Getting Started

Get MygramDB up and running in 5 minutes.

## Prerequisites

- MySQL 8.4/9.x with GTID enabled, or MariaDB 10.6+/11.x
- RHEL/AlmaLinux/Rocky Linux 9, Ubuntu 22.04/24.04, or Docker

MygramDB deploys next to your existing database as a sidecar: your application keeps writing to MySQL/MariaDB unchanged, MygramDB follows the binlog to build its own search index, and only search queries go to MygramDB.

<img src="/diagrams/deployment-topology.svg" alt="The application keeps writing to MySQL or MariaDB as before, MygramDB follows the GTID binlog stream to maintain an in-memory search index, and the application sends only search queries to MygramDB over TCP 11016 or HTTP 8080." class="doc-diagram" />

## Quick Install

### RPM (RHEL/AlmaLinux/Rocky Linux 9)

Download from [GitHub Releases](https://github.com/libraz/mygram-db/releases/latest) and install:

```bash
sudo rpm -i mygramdb-*.el9.x86_64.rpm
```

### Docker

```bash
docker pull ghcr.io/libraz/mygram-db:latest
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

# Allow connections from localhost
network:
  allow_cidrs:
    - "127.0.0.1/32"
```

> [!IMPORTANT]
> The `allow_cidrs` setting is required. Without it, all connections are denied. Add your client IPs to this list.

## Start the Service

```bash
sudo systemctl enable --now mygramdb
```

## Test Your Setup

```bash
# Connect via CLI
mygram-cli -h localhost -p 11016
```

Once connected, run a search query:

```mygram
mygram> SEARCH articles hello world
OK RESULTS 3 101 205 387
```

## Next Steps

- [Installation Guide](/docs/installation) - Installation options
- [Configuration](/docs/configuration) - Configuration reference
- [Query Guide](/docs/queries) - Search syntax and examples

## Detailed Documentation

- [Full Configuration Reference](/docs/configuration)
- [MySQL Replication](/docs/replication)
- [Operations Guide](/docs/operations)
- [v1.8 Upgrade Notes](/docs/upgrade-v1.8)
- [v1.7 Migration Guide](/docs/migration-v1.7)
