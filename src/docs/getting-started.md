# Getting Started

Get MygramDB up and running in 5 minutes.

## Prerequisites

- MySQL 8.4/9.x with GTID enabled, or MariaDB 10.6+/11.x
- RHEL/AlmaLinux/Rocky Linux 9, Ubuntu 22.04/24.04, or Docker

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

```
mygram> SEARCH articles hello world
OK RESULTS 3 101 205 387
```

## Next Steps

- [Installation Guide](/docs/installation) - Installation options
- [Configuration](/docs/configuration) - Configuration reference
- [Query Guide](/docs/queries) - Search syntax and examples

## Detailed Documentation

- [Full Configuration Reference](https://github.com/libraz/mygram-db/blob/main/docs/en/configuration.md)
- [MySQL Replication](https://github.com/libraz/mygram-db/blob/main/docs/en/replication.md)
- [Operations Guide](https://github.com/libraz/mygram-db/blob/main/docs/en/operations.md)
