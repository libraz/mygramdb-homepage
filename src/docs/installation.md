# Installation

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
- `/etc/mygramdb/config.yaml` - Sample configuration
- systemd service file

Start the service:

```bash
sudo systemctl enable --now mygramdb
```

## Docker

```bash
docker pull ghcr.io/libraz/mygram-db:latest

docker run -d \
  -p 11016:11016 \
  -p 8080:8080 \
  -v /path/to/config.yaml:/etc/mygramdb/config.yaml \
  ghcr.io/libraz/mygram-db:latest
```

Available tags:
- `ghcr.io/libraz/mygram-db:1.5.3`
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

Start the service:

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
sudo chown -R mygramdb:mygramdb /var/lib/mygramdb
```

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

```bash
mygramdb --help
mygram-cli --help
```

## Security Note

> [!CAUTION]
> MygramDB **refuses to run as root** for security. Always run it as a dedicated non-privileged user.

## Next Steps

- [Configuration](/docs/configuration) - Configure your instance
- [Query Guide](/docs/queries) - Learn the search syntax

## Detailed Documentation

- [Full Installation Guide](https://github.com/libraz/mygram-db/blob/main/docs/en/installation.md)
- [Docker Deployment](https://github.com/libraz/mygram-db/blob/main/docs/en/docker-deployment.md)
- [Operations Guide](https://github.com/libraz/mygram-db/blob/main/docs/en/operations.md)
