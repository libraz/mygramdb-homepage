---
title: MygramDB インストール - RPM / DEB / Docker / ソースビルド
description: MygramDB を RPM または DEB パッケージ、Docker、ソースビルドで導入する手順。systemd サービスの設定、インストール確認、セキュリティ上の注意も説明します。
head:
  - - meta
    - name: keywords
      content: MygramDB インストール, RPM パッケージ, DEB パッケージ, Docker イメージ, ソースビルド, systemd サービス, インストール確認
---

# インストール

::: info どの方法を選ぶべきか
RHEL/AlmaLinux/Rocky Linux では RPM、Ubuntu では DEB、動作確認やコンテナ基盤では Docker を使うのが基本です。ソースビルドは開発や独自ビルドが必要な場合に選んでください。
:::

## RPM パッケージ（推奨）

RHEL、AlmaLinux、Rocky Linux 9/10 では、[GitHub Releases](https://github.com/libraz/mygram-db/releases/latest) からパッケージをダウンロードします。

```bash
# EL9 (RHEL/AlmaLinux/Rocky Linux 9)
sudo rpm -i mygramdb-*.el9.x86_64.rpm

# EL10 (RHEL/AlmaLinux/Rocky Linux 10)
sudo rpm -i mygramdb-*.el10.x86_64.rpm
```

インストールされるファイルは次のとおりです。

- `/usr/bin/mygramdb` - サーバーバイナリ
- `/usr/bin/mygram-cli` - CLI クライアント
- `/etc/mygramdb/config.yaml.example` - 設定テンプレート
- systemd サービスファイル

サービスを開始する前に設定ファイルを作成・編集します。

```bash
sudo cp /etc/mygramdb/config.yaml.example /etc/mygramdb/config.yaml
sudoedit /etc/mygramdb/config.yaml
sudo systemctl enable --now mygramdb
```

## Docker

::: warning 設定ファイルを用意してから起動
Docker で本番運用する場合は、MySQL 接続情報、レプリケーション設定、対象テーブル、`network.allow_cidrs`、`api.admin_token` を含む設定ファイルを用意してマウントしてください。

マウントする設定では、公開ポートからコンテナへ到達できるよう `api.tcp.bind: 0.0.0.0` を設定し、HTTP を有効にする場合は `api.http.bind: 0.0.0.0` も設定します。下のホスト側ポートはループバックに限定したまま、CIDR 許可リストも厳格にしてください。外部に公開する場合は、管理トークンを設定したうえでリバースプロキシ経由にします。

イメージを起動しただけでは、既存データは読み込まれません。読み込みには `SYNC <table>` を実行します。
:::

```bash
docker pull ghcr.io/libraz/mygram-db:1.12.0

docker run -d \
  -p 127.0.0.1:11016:11016 \
  -p 127.0.0.1:8080:8080 \
  -v /path/to/config.yaml:/etc/mygramdb/config.yaml:ro \
  ghcr.io/libraz/mygram-db:1.12.0
```

利用可能なタグは次のとおりです。

- `ghcr.io/libraz/mygram-db:1.12.0`
- `ghcr.io/libraz/mygram-db:latest`

`linux/amd64` と `linux/arm64` の両方に対応しています。

## DEB パッケージ

Ubuntu 22.04（Jammy）と 24.04（Noble）では、次のコマンドでインストールします。

```bash
# x86_64
sudo dpkg -i mygramdb_*_amd64.deb

# ARM64
sudo dpkg -i mygramdb_*_arm64.deb
```

パッケージは `/etc/mygramdb/config.yaml.example` をインストールし、サービスユーザー、データディレクトリ、ダンプディレクトリ、ログディレクトリを作成します。サービスを開始する前に、設定をコピーして編集してください。

```bash
sudo cp /etc/mygramdb/config.yaml.example /etc/mygramdb/config.yaml
sudoedit /etc/mygramdb/config.yaml
```

その後、サービスを開始します。

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

ビルドには CMake 3.18 以降が必要です。binlog デコーダの libmybinlog を含め、バージョン固定された依存ライブラリを GitHub から取得します。オフラインでビルドするときは、`MYBINLOG_SOURCE_DIR` にローカルの libmybinlog のチェックアウトを指定してください。

```bash
make MYBINLOG_SOURCE_DIR=/path/to/libmybinlog
```

### システムへのインストール

```bash
sudo make install
```

## サービスとして実行

ソースからビルドした場合の手順です（RPM にはサービスが含まれています）。

### ユーザー作成

```bash
sudo useradd -r -s /bin/false mygramdb
```

### ディレクトリ設定

```bash
sudo mkdir -p /etc/mygramdb /var/lib/mygramdb/dumps
sudo mkdir -p /var/log/mygramdb
sudo install -m 0640 -o root -g mygramdb examples/config.yaml /etc/mygramdb/config.yaml
sudo chown -R mygramdb:mygramdb /var/lib/mygramdb /var/log/mygramdb
```

サービスを起動する前に `/etc/mygramdb/config.yaml` の接続先、検索対象テーブル、ネットワーク許可リストを編集します。systemd ユニットは、デフォルトでログを journal に出力します。`logging.file` を設定する場合は `/var/log/mygramdb` を使えます。

### systemd サービスのインストール

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

::: info インストール後に必要な作業
パッケージや Docker イメージを入れただけでは、検索対象のデータは読み込まれません。MySQL ソースの要件、対象テーブル、ネットワークの許可範囲を設定したあと、`SYNC <table>` を一度実行して既存の行からインデックスを作成してください。ソース側の設定は [MySQL レプリケーション](/ja/docs/replication)を参照してください。
:::

```bash
mygramdb --help
mygram-cli --help
```

## セキュリティ

::: danger root では実行しない
MygramDB はセキュリティのため **root 権限での実行を拒否**します。常に専用の非特権ユーザーで実行してください。
:::

## 次のステップ

- [設定](/ja/docs/configuration) - インスタンスを設定
- [クエリガイド](/ja/docs/queries) - 検索構文を学ぶ

## 詳細ドキュメント

- [Docker デプロイ](/ja/docs/docker-deployment)
- [運用ガイド](/ja/docs/operations)
- [v1.12 へのアップグレード](/ja/docs/upgrade-v1.12)
