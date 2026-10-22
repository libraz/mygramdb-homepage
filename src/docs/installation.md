---
title: MygramDB Installation - RPM, DEB, Docker, and Source Build
description: Install MygramDB from an RPM or DEB package, run it with Docker, or build from source. Includes systemd service setup, install verification, and security notes.
head:
  - - meta
    - name: keywords
      content: MygramDB installation, RPM package, DEB package, Docker image, build from source, systemd service, install verification
---

# Installation

::: info Which method to choose
Use the RPM on RHEL/AlmaLinux/Rocky Linux, the DEB on Ubuntu, and Docker for evaluation or container platforms. Build from source when you are developing or need a custom build.
:::

## RPM Package (Recommended)

For RHEL, AlmaLinux, Rocky Linux 9/10, download from [GitHub Releases](https://github.com/libraz/mygram-db/releases/latest):

```bash
# EL9 (RHEL/AlmaLinux/Rocky Linux 9)
sudo rpm -i mygramdb-*.el9.x86_64.rpm

# EL10 (RHEL/AlmaLinux/Rocky Linux 10)
sudo rpm -i mygramdb-*.el10.x86_64.rpm
```

This installs:
- `/usr/bin/mygramdb` - Server binary
- `/usr/bin/mygram-cli` - CLI client
- `/etc/mygramdb/config.yaml.example` - Configuration template
- systemd service file

Create and edit the service configuration before starting it:

```bash
sudo cp /etc/mygramdb/config.yaml.example /etc/mygramdb/config.yaml
sudoedit /etc/mygramdb/config.yaml
sudo systemctl enable --now mygramdb
```

## Docker

::: warning Prepare a config file before starting
For production use under Docker, mount a config file containing the MySQL connection, replication settings, target tables, `network.allow_cidrs`, and `api.admin_token`. The mounted config must set `api.tcp.bind: 0.0.0.0` and, when HTTP is enabled, `api.http.bind: 0.0.0.0` so the published ports can reach the container. Keep the loopback host mappings below and a restrictive CIDR allowlist; expose the service through a reverse proxy only after setting an admin token. Simply starting the image does not complete the initial sync of existing data.
:::

```bash
docker pull ghcr.io/libraz/mygram-db:1.11.1

docker run -d \
  -p 127.0.0.1:11016:11016 \
  -p 127.0.0.1:8080:8080 \
  -v /path/to/config.yaml:/etc/mygramdb/config.yaml:ro \
  ghcr.io/libraz/mygram-db:1.11.1
```

Available tags:
- `ghcr.io/libraz/mygram-db:1.11.1`
- `ghcr.io/libraz/mygram-db:latest`

Supports both `linux/amd64` and `linux/arm64`.

## DEB Package

For Ubuntu 22.04 (Jammy) and 24.04 (Noble):

```bash
# x86_64
sudo dpkg -i mygramdb_*_amd64.deb

# ARM64
sudo dpkg -i mygramdb_*_arm64.deb
```

The package installs `/etc/mygramdb/config.yaml.example` and creates the service user, data directory, dump directory, and log directory. Copy and edit the configuration before starting the service:

```bash
sudo cp /etc/mygramdb/config.yaml.example /etc/mygramdb/config.yaml
sudoedit /etc/mygramdb/config.yaml
```

Then start the service:

```bash
sudo systemctl enable --now mygramdb
```

## Build from Source

### Prerequisites

**RHEL/AlmaLinux/Rocky Linux:**
```bash
sudo dnf install -y gcc-c++ cmake mysql-devel libicu-devel
```

**Ubuntu/Debian:**
```bash
sudo apt-get update
sudo apt-get install -y pkg-config libmysqlclient-dev libicu-dev cmake g++
```

**macOS:**
```bash
brew install cmake mysql-client@8.4 icu4c pkg-config
```

### Build

```bash
git clone https://github.com/libraz/mygram-db.git
cd mygram-db
make
```

### Install System-wide

```bash
sudo make install
```

## Running as a Service

If you built from source (RPM already includes the service):

### Create User

```bash
sudo useradd -r -s /bin/false mygramdb
```

### Setup Directories

```bash
sudo mkdir -p /etc/mygramdb /var/lib/mygramdb/dumps
sudo mkdir -p /var/log/mygramdb
sudo install -m 0640 -o root -g mygramdb examples/config.yaml /etc/mygramdb/config.yaml
sudo chown -R mygramdb:mygramdb /var/lib/mygramdb /var/log/mygramdb
```

Edit `/etc/mygramdb/config.yaml` with the source connection, searchable tables, and network allowlist before starting the service. The systemd unit writes logs to the journal by default; `/var/log/mygramdb` is available if `logging.file` is configured.

### Install systemd Service

```bash
sudo cp support/systemd/mygramdb.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now mygramdb
```

### Check Status

```bash
sudo systemctl status mygramdb
sudo journalctl -u mygramdb -f
```

## Verify Installation

::: info What is still needed after installing
Installing the package or pulling the image does not load any searchable data. Configure the MySQL source requirements, the target tables, and the allowed network range, then run `SYNC <table>` once to build the index from existing rows. See [MySQL Replication](/docs/replication) for source settings.
:::

```bash
mygramdb --help
mygram-cli --help
```

## Security Note

::: danger
MygramDB **refuses to run as root** for security. Always run it as a dedicated non-privileged user.
:::

## Next Steps

- [Configuration](/docs/configuration) - Configure your instance
- [Query Guide](/docs/queries) - Learn the search syntax

## Detailed Documentation

- [Docker Deployment](/docs/docker-deployment)
- [Operations Guide](/docs/operations)
- [Upgrade to v1.11](/docs/upgrade-v1.11)
