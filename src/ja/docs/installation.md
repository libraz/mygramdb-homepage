---
title: MygramDB インストール - RPM / DEB / Docker / ソースビルド
description: MygramDBをRPMまたはDEBパッケージ、Docker、ソースビルドで導入する手順。systemdサービスの設定、インストール確認、セキュリティ上の注意も説明します。
head:
  - - meta
    - name: keywords
      content: MygramDB インストール, RPM パッケージ, DEB パッケージ, Docker イメージ, ソースビルド, systemd サービス, インストール確認
---

# インストール

::: info どの方法を選ぶべきか
RHEL/AlmaLinux/Rocky LinuxではRPM、UbuntuではDEB、動作確認やコンテナ基盤ではDockerを使うのが基本です。ソースビルドは開発や独自ビルドが必要な場合に選んでください。
:::

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
- `/etc/mygramdb/config.yaml.example` - 設定テンプレート
- systemdサービスファイル

サービスを開始する前に設定ファイルを作成・編集します。

```bash
sudo cp /etc/mygramdb/config.yaml.example /etc/mygramdb/config.yaml
sudoedit /etc/mygramdb/config.yaml
sudo systemctl enable --now mygramdb
```

## Docker

```bash
docker pull ghcr.io/libraz/mygram-db:latest

docker run -d \
  -p 127.0.0.1:11016:11016 \
  -p 127.0.0.1:8080:8080 \
  -v /path/to/config.yaml:/etc/mygramdb/config.yaml:ro \
  ghcr.io/libraz/mygram-db:latest
```

利用可能なタグ：
- `ghcr.io/libraz/mygram-db:1.10.0`
- `ghcr.io/libraz/mygram-db:latest`

`linux/amd64`と`linux/arm64`の両方をサポート。

::: warning 設定ファイルを用意してから起動
Dockerで本番運用する場合は、MySQL接続情報、レプリケーション設定、対象テーブル、`network.allow_cidrs`、`api.admin_token` を含む設定ファイルを用意してマウントしてください。公開ポートからコンテナへ到達できるよう、マウントする設定では `api.tcp.bind: 0.0.0.0`、HTTPを有効にする場合は `api.http.bind: 0.0.0.0` を設定します。上のホスト側ポートはループバックに限定したまま、CIDR許可リストも厳格にしてください。外部公開が必要な場合は、管理トークンを設定したうえでリバースプロキシ経由にしてください。単にイメージを起動しただけでは、既存データの初期同期は完了しません。
:::

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

::: info インストール後に必要な作業
パッケージやDockerイメージを入れただけでは、検索対象のデータは読み込まれません。MySQL接続、対象テーブル、ネットワーク許可範囲を設定したあと、初回は `SYNC <table>` を実行して既存データからインデックスを作成してください。
:::

## セキュリティ

::: danger rootでは実行しない
MygramDBはセキュリティのため**root権限での実行を拒否**します。常に専用の非特権ユーザーで実行してください。
:::

## 次のステップ

- [設定](/ja/docs/configuration) - インスタンスを設定
- [クエリガイド](/ja/docs/queries) - 検索構文を学ぶ

## 詳細ドキュメント

- [Dockerデプロイ](/ja/docs/docker-deployment)
- [運用ガイド](/ja/docs/operations)
- [v1.10 へのアップグレード](/ja/docs/upgrade-v1.10)
