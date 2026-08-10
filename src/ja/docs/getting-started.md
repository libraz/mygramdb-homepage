---
title: MygramDB クイックスタート - 5分で導入して検索する
description: MygramDBを5分で動かす手順。前提条件、パッケージのインストール、最小構成のconfig.yaml、サービス起動、最初のSYNCとSEARCHまでを説明します。
head:
  - - meta
    - name: keywords
      content: MygramDB クイックスタート, はじめに, インストール, 最小構成, 初回検索, SYNC コマンド, MySQL 全文検索 導入
---

# クイックスタート

最小構成でMygramDBを起動し、MySQL上の既存データを読み込んで検索できるところまで確認します。

## 前提条件

- GTIDが有効なMySQL 8.4/9.x、またはMariaDB 10.6+/11.x
- RHEL/AlmaLinux/Rocky Linux 9、Ubuntu 22.04/24.04、またはDocker

MygramDBは既存のデータベースの隣に配置するサイドカーです。アプリケーションは従来どおりMySQL/MariaDBへ書き込み、MygramDBはbinlogを追従して独自の検索インデックスを構築し、検索クエリのみがMygramDBへ送られます。

<DocDiagram name="deployment-topology" alt="アプリケーションは従来どおりMySQL/MariaDBへ書き込み、MygramDBがGTID binlogストリームを追従してインメモリ検索インデックスを維持し、検索クエリのみをTCP 11016またはHTTP 8080でMygramDBに送る構成図" />

::: info 用語補足
**GTID** はMySQLの変更履歴に付く一意な番号です。MygramDBはGTIDを使って、再起動後も「どこまでMySQLの変更を読んだか」を正確に引き継ぎます。
:::

::: warning MySQL側の準備も必要です
MygramDBはMySQL / MariaDBのbinlogを読むため、MySQL側でGTID、ROW形式binlog、`binlog_row_image=FULL`、レプリケーションユーザー、対象テーブルへの `SELECT` 権限を用意してください。詳しい設定は[MySQLレプリケーション](/ja/docs/replication)を参照してください。
:::

## インストール

### RPM（RHEL/AlmaLinux/Rocky Linux 9）

[GitHub Releases](https://github.com/libraz/mygram-db/releases/latest)からダウンロードしてインストール：

```bash
sudo rpm -i mygramdb-*.el9.x86_64.rpm
```

### Docker

```bash
docker pull ghcr.io/libraz/mygram-db:latest
```

## 最小構成

`/etc/mygramdb/config.yaml`を作成：

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

# localhostからの接続を許可
network:
  allow_cidrs:
    - "127.0.0.1/32"
```

::: warning allow_cidrs は必須
`allow_cidrs`の設定は必須です。設定がない場合、すべての接続が拒否されます。接続元のIPアドレスをリストに追加してください。
:::

::: info 用語補足
**CIDR** はIPアドレスの範囲指定です。`127.0.0.1/32` はローカルホストのみ、`10.0.0.0/8` は `10.` で始まるプライベートネットワーク全体を意味します。
:::

::: tip 管理トークンはファイル外で渡す
本番設定では、YAMLファイルに書き込む代わりに `MYGRAM_API_ADMIN_TOKEN` でシークレットを渡してください。TCPを非ループバックアドレスで待ち受け、Unix socketを使わない場合は必須です。
:::

## サービスを開始

```bash
sudo systemctl enable --now mygramdb
```

## 動作確認

```bash
# CLIで接続
mygram-cli -h localhost -p 11016
```

接続後、まず初回同期を実行します。`SYNC` はMySQLの既存行を読み込み、検索インデックスを作成します。

```mygram
127.0.0.1:11016> AUTH replace-with-a-high-entropy-secret
OK AUTHENTICATED

127.0.0.1:11016> SYNC articles
OK SYNC STARTED articles

127.0.0.1:11016> SYNC STATUS
OK SYNC STATUS
...
```

同期が完了したら検索クエリを実行します。

```mygram
127.0.0.1:11016> SEARCH articles hello world
OK RESULTS 3 101 205 387
```

::: tip 結果が0件になる場合
`SYNC STATUS` で同期状態を確認し、MySQL側に検索語を含む行があるか、設定の `text_source.column` が正しいかを確認してください。複数DB構成では `SEARCH app_db.articles hello world` のように `<database>.<table>` 形式で指定します。
:::

## 次のステップ

- [インストール](/ja/docs/installation) - インストール方法
- [設定](/ja/docs/configuration) - 設定リファレンス
- [クエリガイド](/ja/docs/queries) - 検索構文とサンプル

## 詳細ドキュメント

- [設定リファレンス（詳細）](/ja/docs/configuration)
- [MySQLレプリケーション](/ja/docs/replication)
- [運用ガイド](/ja/docs/operations)
- [v1.10 へのアップグレード](/ja/docs/upgrade-v1.10)
