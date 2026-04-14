# インストール

## RPMパッケージ（推奨）

RHEL、AlmaLinux、Rocky Linux 9/10向け。[GitHub Releases](https://github.com/libraz/mygram-db/releases/latest)からダウンロード：

```bash
# EL9 (RHEL/AlmaLinux/Rocky Linux 9)
sudo rpm -i mygramdb-*.el9.x86_64.rpm

# EL10 (RHEL/AlmaLinux/Rocky Linux 10)
sudo rpm -i mygramdb-*.el10.x86_64.rpm
```

インストールされるファイル：
- `/usr/bin/mygramdb` - サーバーバイナリ
- `/usr/bin/mygram-cli` - CLIクライアント
- `/etc/mygramdb/config.yaml` - サンプル設定
- systemdサービスファイル

サービスを開始：

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

利用可能なタグ：
- `ghcr.io/libraz/mygram-db:1.5.4`
- `ghcr.io/libraz/mygram-db:latest`

`linux/amd64`と`linux/arm64`の両方をサポート。

## DEBパッケージ

Ubuntu 22.04 (Jammy) および 24.04 (Noble) 向け：

```bash
# x86_64
sudo dpkg -i mygramdb_*_amd64.deb

# ARM64
sudo dpkg -i mygramdb_*_arm64.deb
```

サービスを開始：

```bash
sudo systemctl enable --now mygramdb
```

## ソースからビルド

### 必要なパッケージ

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

### ビルド

```bash
git clone https://github.com/libraz/mygram-db.git
cd mygram-db
make
```

### システムへのインストール

```bash
sudo make install
```

## サービスとして実行

ソースからビルドした場合（RPMにはサービスが含まれています）：

### ユーザー作成

```bash
sudo useradd -r -s /bin/false mygramdb
```

### ディレクトリ設定

```bash
sudo mkdir -p /etc/mygramdb /var/lib/mygramdb/dumps
sudo chown -R mygramdb:mygramdb /var/lib/mygramdb
```

### systemdサービスのインストール

```bash
sudo cp support/systemd/mygramdb.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now mygramdb
```

### ステータス確認

```bash
sudo systemctl status mygramdb
sudo journalctl -u mygramdb -f
```

## インストール確認

```bash
mygramdb --help
mygram-cli --help
```

## セキュリティ

> [!CAUTION]
> MygramDBはセキュリティのため**root権限での実行を拒否**します。常に専用の非特権ユーザーで実行してください。

## 次のステップ

- [設定](/ja/docs/configuration) - インスタンスを設定
- [クエリガイド](/ja/docs/queries) - 検索構文を学ぶ

## 詳細ドキュメント

- [インストールガイド（詳細）](https://github.com/libraz/mygram-db/blob/main/docs/ja/installation.md)
- [Dockerデプロイ](https://github.com/libraz/mygram-db/blob/main/docs/ja/docker-deployment.md)
- [運用ガイド](https://github.com/libraz/mygram-db/blob/main/docs/ja/operations.md)
