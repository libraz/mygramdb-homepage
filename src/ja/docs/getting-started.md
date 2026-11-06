---
title: MygramDB クイックスタート - インストールから初回検索まで
description: MygramDB のパッケージをインストールし、MySQL レプリケーションと検索対象テーブルを設定して、サービス起動後に初回 SYNC と SEARCH を実行します。
head:
  - - meta
    - name: keywords
      content: MygramDB クイックスタート, はじめに, インストール, 最小構成, 初回検索, SYNC コマンド, MySQL 全文検索 導入
---

# クイックスタート

パッケージをインストールし、MySQL の既存行を読み込んで検索します。Docker を使う場合は、コンテナに必要な設定を含む [Docker デプロイガイド](/ja/docs/docker-deployment)を参照してください。

## 前提条件

- GTID が有効な MySQL 8.4/9.7/26.x、または MariaDB 10.11+/11.x/12.x
- RHEL/AlmaLinux/Rocky Linux 9/10、または Ubuntu 22.04/24.04
- `SELECT`、`REPLICATION SLAVE`、`REPLICATION CLIENT` 権限を持つ MySQL レプリケーションアカウント

MygramDB はソースの binlog を追従し、インメモリの検索インデックスを維持します。ソースには、ROW 形式の binlog、完全な行イメージと行メタデータ、CRC32 チェックサム、および [MySQL レプリケーション](/ja/docs/replication)に記載した要件を設定してください。

::: info GTID とは
**GTID** は MySQL または MariaDB のレプリケーションストリーム上でトランザクションを識別します。MygramDB は適用済みの GTID を記録し、再起動後に正しい位置から処理を再開します。
:::

## パッケージをインストール

[GitHub Releases](https://github.com/libraz/mygram-db/releases/latest) から、OS とアーキテクチャに合ったパッケージをダウンロードします。

RHEL、AlmaLinux、Rocky Linux 9/10 では RPM をインストールします。

```bash
sudo rpm -i mygramdb-*.el9.x86_64.rpm
```

EL10 では `.el10` パッケージを使います。Ubuntu 22.04/24.04 では、アーキテクチャに合ったパッケージをインストールします。

```bash
sudo apt install ./mygramdb_*_amd64.deb
```

パッケージは設定例をインストールしますが、実際に使う設定ファイルは作成しません。設定例をコピーして、MySQL の認証情報、データベース、テーブルを編集してください。

```bash
sudo cp /etc/mygramdb/config.yaml.example /etc/mygramdb/config.yaml
sudoedit /etc/mygramdb/config.yaml
```

次の例を参考に接続先とテーブルを設定します。

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

`replication.server_id` は、同じソースに接続する MySQL レプリカや MygramDB インスタンスの間で重複させないでください。`network.allow_cidrs` は必須です。空の場合はすべての接続が拒否されます。接続を許可するクライアントのアドレスだけを追加してください。

## サービスを開始

設定を編集したら、MygramDB を起動します。

```bash
sudo systemctl enable --now mygramdb
sudo systemctl status mygramdb
```

パッケージは専用の非 root サービスユーザーを作成します。MygramDB は root 権限での実行を拒否します。

## データを読み込んで検索

ローカルの TCP API に接続し、初期スナップショットを開始します。

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

`SYNC` は初期スナップショットを実行し、テーブルの既存行を MySQL から読み込んでインデックスを作ります。完了後は、binlog レプリケーションがインデックスを最新に保ちます。`SYNC STATUS` を繰り返し実行し、テーブルが `status=COMPLETED` になったら検索します。

```mygram
127.0.0.1:11016> SEARCH articles hello world
OK RESULTS 3 101 205 387
```

検索結果がない場合は、同期が完了したこと、ソーステーブルに検索語を含む行があること、`text_source.column` が正しいことを確認してください。複数 DB 構成では `SEARCH app_db.articles hello world` のようにテーブルを修飾します。

## 次のステップ

- [インストール](/ja/docs/installation) - パッケージ、Docker、ソースからの導入
- [設定](/ja/docs/configuration) - 設定項目のリファレンス
- [MySQL レプリケーション](/ja/docs/replication) - ソース要件と権限
- [クエリガイド](/ja/docs/queries) - 検索構文と例
