---
title: MygramDB SYNCコマンド - 手動スナップショット同期
description: SYNCコマンドでMySQLからMygramDBへのスナップショット同期を手動制御。SYNCとSYNC STATUSの使い方、ステータスフィールド、コマンドの競合、シナリオ、グレースフルシャットダウン。
head:
  - - meta
    - name: keywords
      content: MygramDB SYNC コマンド, 手動スナップショット, SYNC STATUS, auto_initial_snapshot, マルチテーブル同期, スナップショット同期, MySQL 負荷
---

# SYNCコマンドの使い方

## 概要

`SYNC` コマンドは、MySQL から MygramDB へのスナップショット同期を手動で開始するためのコマンドです。起動時の自動同期を無効にしておくと、MySQLプライマリへ読み取り負荷をかけるタイミングを運用側で決められます。

本番向けの例では `api.admin_token` を使用します。空なら `AUTH` は不要ですが、非ループバックのデプロイではトークンを設定してください。

::: info 用語補足
**スナップショット同期**は、MySQLの対象テーブルをSELECTで読み取り、その時点の内容からMygramDBの検索インデックスを作る処理です。完了後は通常、SYNC前にドレインしたGTIDからbinlogレプリケーションを再開します。`2017` の復旧では、保守的なスナップショット下限マーカーから再開してデコードできない区間を越えます。
:::

## 設定

### デフォルトの動作（安全なデフォルト）

MygramDB は**デフォルトでは起動時に自動的にスナップショットをビルドしません**：

```yaml
replication:
  enable: true
  auto_initial_snapshot: false  # デフォルト: false
  server_id: 12345
  start_from: "snapshot"
```

### 起動時の自動スナップショット

以前の自動スナップショット動作に戻す場合：

```yaml
replication:
  enable: true
  auto_initial_snapshot: true
  server_id: 12345
  start_from: "snapshot"
```

`auto_initial_snapshot` を有効にする場合は、単一テーブル構成でも複数テーブル構成でも `start_from: "snapshot"` を使ってください。

## コマンド

### SYNC - スナップショット同期を開始

特定のテーブルに対してスナップショット同期を手動で開始します。

::: warning 実行前の確認
`SYNC` はMySQLの対象テーブルを読み取るため、行数が多いテーブルではMySQL側に読み取り負荷がかかります。本番環境では実行時間帯、レプリケーションユーザーの権限、`network.allow_cidrs`、利用可能メモリを確認してから実行してください。
:::

**構文:**
```mygram
SYNC <table_name>
```

`<table_name>` は単一DB構成では修飾なしのテーブル名を指定できます。複数DB構成では `<database>.<table>` を使ってください。

**例:**
```text
$ mygram-cli
127.0.0.1:11016> AUTH <token>
OK AUTHENTICATED
127.0.0.1:11016> SYNC app_db.articles
OK SYNC STARTED table=app_db.articles
```

単一DB構成では `SYNC articles` を使います。

**レスポンス（成功）:**
```mygram
OK SYNC STARTED table=articles
```

**レスポンス（エラー）:**
```mygram
ERROR 4011 SYNC already in progress for 'articles'
ERROR 4012 Memory critically low. Cannot start SYNC.
ERROR 4010 Table 'products' not found
```

**動作:**
- バックグラウンドで非同期に実行
- 開始後すぐにレスポンスを返す
- MySQL の SELECT クエリからスナップショットをビルド
- 初期スナップショットトランザクションの開始前に保守的な GTID 下限を取得
- 完了時は通常、他テーブルのコミットを飛ばさないよう SYNC 前にドレインした GTID から再開し、`2017` の復旧ではスナップショットマーカーから再開してデコードできない区間を越えます

### SYNC STOP - 同期をキャンセル

```mygram
SYNC STOP [<table_name>]
```

キャンセルは非同期です。`SYNC STATUS` が `CANCELLING` になった後も、`CANCELLED` または別の終了状態になるまで確認してください。

初期ロードは接続、読み取り、スナップショット構築の各段階でキャンセル要求を確認するため、実行中のロードを速やかにキャンセルできます。シャットダウンシグナルでも同じキャンセルが要求されます。MySQL の処理中に待機している場合、完了までの時間は設定した `read_timeout_ms` の範囲に制限されます。

### SYNC STATUS - 同期の進捗を確認

SYNC 操作の進捗とステータスを確認します。

::: tip 進捗の見方
`progress` はMySQLから読み終えた行数の目安です。`COMPLETED` になり、`replication=STARTED` が返れば、スナップショット作成後のbinlog追従まで開始できています。
:::

**構文:**
```mygram
SYNC STATUS
```

**例:**
```text
$ mygram-cli
127.0.0.1:11016> AUTH <token>
OK AUTHENTICATED
127.0.0.1:11016> SYNC STATUS
```

**レスポンス例:**

**進行中:**
```mygram
table=articles status=IN_PROGRESS progress=10000/25000 rows (40.0%) rate=5000 rows/s
```

**完了:**
```mygram
table=articles status=COMPLETED rows=25000 time=5.2s gtid=uuid:123 replication=STARTED
```

**失敗:**
```mygram
table=articles status=FAILED rows=5000 error="MySQL connection lost"
```

**アイドル（同期未実施）:**
```mygram
status=IDLE message="No sync operation performed"
```

### ステータスフィールド

| フィールド | 説明 | 例 |
|-------|-------------|---------|
| `table` | 同期対象のテーブル名 | `articles` |
| `status` | 現在のステータス | `JOINING_PREVIOUS`, `STARTING`, `IN_PROGRESS`, `COMPLETED`, `FAILED`, `CANCELLING`, `CANCELLED`, `IDLE` |
| `progress` | 処理済み/総行数 | `10000/25000 rows (40.0%)` |
| `rate` | 処理レート | `5000 rows/s` |
| `rows` | 処理した総行数 | `25000` |
| `time` | 総処理時間 | `5.2s` |
| `gtid` | スナップショットトランザクション開始前に取得した保守的な GTID 下限 | `uuid:123` |
| `replication` | レプリケーションステータス | `STARTED`, `DISABLED`, `FAILED` |
| `error` | エラーメッセージ（失敗時） | `MySQL connection lost` |

`JOINING_PREVIOUS`、`STARTING`、`CANCELLING` は一時的な状態です。`JOINING_PREVIOUS` はそのテーブルの前のワーカーを join している間、`STARTING` は新しいワーカーの開始中、`CANCELLING` は `SYNC STOP` がキャンセルを要求した後に表示されます。`SYNC STATUS` をポーリングし、終了状態になるまで待ってください。

### レプリケーションステータス値

- **STARTED**: スナップショット後に binlog レプリケーションを再開（成功）
- **DISABLED**: 設定でレプリケーションが無効
- **FAILED**: スナップショットは成功したがレプリケーションの開始に失敗（ログを確認）

次の図は、SYNCのライフサイクル全体を示します。メモリ健全性チェックに始まり、スナップショット構築中はテーブル読み取りが拒否されること、完了後のレプリケーション自動再開、そして終了状態と、SYNCと相互排他になる操作の関係です。

<DocDiagram name="sync-lifecycle" alt="SYNC はメモリ健全性チェックを経て MySQL の SELECT からスナップショットを構築し、その間テーブル読み取りは拒否されます。その後レプリケーションを再開し、開始・無効・失敗のいずれかで完了、失敗、キャンセルに至ります。実行中は OPTIMIZE や DUMP と相互排他です。" />

## コマンドの競合

### SYNC 中に拒否される操作

| コマンド | 動作 | 理由 |
|---------|----------|--------|
| `DUMP SAVE` / `DUMP LOAD` | **拒否** | 長時間のメンテナンス操作は相互排他 |
| `OPTIMIZE` | **拒否** | 長時間のメンテナンス操作は相互排他 |
| 自動スナップショット | **拒否** | 長時間のメンテナンス操作は相互排他 |
| `REPLICATION START` | **拒否** | SYNC 完了時にレプリケーションを自動開始するため |
| `SYNC`（同じテーブル） | **拒否** | このテーブルの SYNC は既に進行中 |

### SYNC開始を拒否する実行中操作

`SYNC`、`DUMP SAVE`、`DUMP LOAD`、`OPTIMIZE`、自動スナップショットは 1 つの操作枠を共有します。これらのいずれかが実行中は新しい `SYNC` が拒否されるため、完了後に再実行してください。

### SYNC 中に許可される操作

| コマンド | 動作 | 備考 |
|---------|----------|-------|
| `SEARCH` | **拒否** | 対象テーブルは同期中 |
| `COUNT` | **拒否** | 対象テーブルは同期中 |
| `GET` | **拒否** | 対象テーブルは同期中 |
| `INFO` | 許可 | 同期の進捗を含む現在のサーバー状態を表示 |
| `DUMP SAVE` / `DUMP LOAD` / `OPTIMIZE` | **拒否** | SYNCの完了後に再実行 |
| `SYNC`（別のテーブル） | **拒否** | 長時間の操作は同時に1つだけ実行できる |
| `REPLICATION STOP` | 通常は拒否 | SYNC が内部でリーダーを停止しているため、通常は `ERROR 6029 Replication is not running` を返します。その停止より先にコマンドが成功しても、SYNC の完了時にリーダーは再開します。 |

TCP/CLIとHTTPのテーブル読み取り（search、count、facet、ドキュメントGET）は、対象テーブルの同期中に拒否されます。HTTPは `503` を返します。

## 使用シナリオ

### シナリオ 1: 新規サーバーの起動

```bash
./mygramdb --config config.yaml
```

サーバーはスナップショットをビルドせずに起動します（ログ: `Skipping automatic snapshot build for table: articles (auto_initial_snapshot=false)`）。準備できたら、認証済みの CLI 接続を1つ使って同期を開始し、進捗を確認します。

```text
$ mygram-cli
127.0.0.1:11016> AUTH <token>
OK AUTHENTICATED
127.0.0.1:11016> SYNC articles
OK SYNC STARTED table=articles
127.0.0.1:11016> SYNC STATUS
table=articles status=IN_PROGRESS progress=5000/10000 rows (50.0%) rate=2000 rows/s
127.0.0.1:11016> SYNC STATUS
table=articles status=COMPLETED rows=10000 time=5.0s gtid=uuid:456 replication=STARTED
```

### シナリオ 2: マルチテーブル同期

```yaml
# config.yaml
tables:
  - name: "articles"
    # ...
  - name: "products"
    # ...
  - name: "users"
    # ...

replication:
  enable: true
  auto_initial_snapshot: false
```

1つのテーブルを同期し、`SYNC STATUS` が `COMPLETED` を返すまで待ってから、同じ認証済み CLI 接続で次のテーブルを開始します。

```text
$ mygram-cli
127.0.0.1:11016> AUTH <token>
OK AUTHENTICATED
127.0.0.1:11016> SYNC articles
127.0.0.1:11016> SYNC STATUS
127.0.0.1:11016> SYNC products
127.0.0.1:11016> SYNC STATUS
127.0.0.1:11016> SYNC users
127.0.0.1:11016> SYNC STATUS
table=users status=COMPLETED rows=5000 time=2.5s gtid=uuid:123 replication=STARTED
```

複数DBのテーブル識別子には `SYNC app_db.articles` を使います。

### シナリオ 3: 計画的メンテナンス

```bash
# オフピーク時間帯（例: 午前2時）に SYNC をスケジュール
# cron に追加:
0 2 * * * printf 'AUTH \%s\nSYNC articles\n' "$MYGRAM_API_ADMIN_TOKEN" | mygram-cli
```

## グレースフルシャットダウン

SYNC 中に MygramDB がシャットダウンシグナル（SIGTERM/SIGINT）を受信した場合：

1. **実行中の SYNC 操作はキャンセルされる**
   - `SnapshotBuilder::Cancel()` が呼び出される
   - ステータスが `CANCELLED` に変わる
   - 初期 MySQL ロードは接続、読み取り、スナップショット構築中に要求を確認する

2. **サーバーはクリーンアップを待つ**
   - 最大待機時間: 30秒
   - バックグラウンドスレッドが正常に終了
   - 初期スナップショット中に SYNC が MySQL の読み取り待ちになっている場合、
     シャットダウンの応答時間は設定された MySQL の `read_timeout_ms`（専用の
     binlog/スナップショット接続では秒に換算）によって制限されます。
     長時間の読み取り中に SIGTERM/SIGINT への速い応答が必要な場合は、この値を
     下げてください。
   - 初期 MySQL 接続の再試行中に SIGTERM を受信した場合は、正常に終了します

3. **サーバーがシャットダウン**
   - MySQL 接続を閉じる
   - リソースを解放

**ログ例:**
```
INFO: Stopping TCP server...
INFO: Cancelling SYNC for table: articles
INFO: SYNC cancelled for table articles due to shutdown
WARN: Timeout waiting for SYNC operations to complete
INFO: TCP server stopped
```

## 推奨事項

1. **本番環境では `auto_initial_snapshot: false` を使用**
   - 起動時に MySQL プライマリへ予期しない読み取り負荷がかかるのを防ぐ
   - 同期のタイミングをオペレーターが制御できる

2. **SYNC の進捗を監視**
   - `SYNC STATUS` で進捗を追跡
   - 詳細情報はサーバーログを確認

3. **同時の DUMP LOAD を避ける**
   - ダンプを読み込む前に SYNC の完了を待つ
   - まず `SYNC STATUS` を確認

4. **オフピーク時間帯に SYNC をスケジュール**
   - cron などのスケジューラを使用
   - MySQL プライマリへの影響を低減

5. **SYNC 前にメモリを監視**
   - 利用可能なシステムメモリを確認
   - SYNC は自動的にメモリヘルスをチェック

## トラブルシューティング

### SYNC の開始に失敗する

**エラー:** `ERROR 4012 Memory critically low. Cannot start SYNC.`

**解決策:**
- 利用可能なシステムメモリを確認
- プロセス RSS を削減するか、より多くのメモリをプロビジョニングする。
  `memory.hard_limit_mb` は予約済みで、現時点ではプロセスメモリ上限を強制しません
- ビルド設定でバッチサイズを削減

### 実行中に SYNC が失敗する

**エラー:** `status=FAILED error="MySQL connection lost"`

**解決策:**
- MySQL サーバーへの接続を確認
- MySQL の認証情報を確認
- MySQL サーバーのログを確認
- レプリケーションユーザーに十分な権限があることを確認

### レプリケーションの開始に失敗する

**ステータス:** `replication=FAILED`

**解決策:**
- 詳細なエラーメッセージをサーバーログで確認
- MySQL の GTID が有効か確認: `SHOW VARIABLES LIKE 'gtid_mode';`
- binlog フォーマットが ROW か確認: `SHOW VARIABLES LIKE 'binlog_format';`
- レプリケーションユーザーの権限を確認: `SHOW GRANTS FOR 'repl_user'@'%';`

### エラー `2017`: デコードできない binlog イベント

XA prepare イベント、MariaDB のイベント単位の圧縮 query/row イベント、MySQL の `TRANSACTION_PAYLOAD_EVENT`（トランザクション圧縮）、`PARTIAL_UPDATE_ROWS_EVENT`（部分 JSON 行更新）は、生成元のサーバー設定を変えた後も binlog に残ります。古い位置から通常どおり再開すると同じイベントを再生するため、レプリケーションは再び停止します。

レプリケーションがエラーコード `2017` で停止した場合は、まず最も重要なテーブルに `SYNC` を実行します。MygramDB はそのテーブルを再構築し、スナップショットマーカーから共有ストリームを再開して、デコードできない区間を越えます。続いて、他のすべてのレプリケーション対象テーブルにも一つずつ `SYNC` を実行してください。最初の復旧で共有ストリームが前進するため、再構築しないテーブルには、飛ばした区間の書き込みが反映されません。

`log_bin_compress` による MariaDB のイベント単位の圧縮は引き続き未対応で、`2017` の復旧対象です。通常の MariaDB row イベント内にある `COMPRESSED` `VARCHAR`/`TEXT` カラムは別物であり、MygramDB はインデックス化の前に展開します。圧縮カラムのペイロードが未知または破損している場合は row デコードエラー `2008` になり、通常の再接続処理に進みます。イベントをデコードできない `2017` の手順だけを使ってください。

`api.admin_token` を設定している場合は、復旧手順全体を1つの認証済み CLI 接続で実行してください。認証状態は接続単位であり、別々の `mygram-cli` プロセスには引き継がれません。次のテーブルの `SYNC` を実行する前に、`SYNC STATUS` が `COMPLETED` と `replication=STARTED` を返すまで待ちます。

```text
$ mygram-cli
127.0.0.1:11016> AUTH <token>
OK AUTHENTICATED
127.0.0.1:11016> SYNC app_db.articles
127.0.0.1:11016> SYNC STATUS
127.0.0.1:11016> SYNC app_db.products
127.0.0.1:11016> SYNC STATUS
```

他の停止理由では、SYNC はドレイン済み位置から再開します。そのため、関係のないテーブルのコミットを飛ばしません。

## 関連項目

- [レプリケーションガイド](/ja/docs/replication)
- [設定リファレンス](/ja/docs/configuration)
- [パフォーマンスチューニング](/ja/docs/performance)
