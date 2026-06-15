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

::: info 用語補足
**スナップショット同期**は、MySQLの対象テーブルをSELECTで読み取り、その時点の内容からMygramDBの検索インデックスを作る処理です。完了後は、取得したGTIDからbinlogレプリケーションを開始して差分を追いかけます。
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

### 以前と同じ動作（起動時の自動スナップショット）

以前の自動スナップショット動作に戻す場合：

```yaml
replication:
  enable: true
  auto_initial_snapshot: true   # 起動時の自動スナップショットを有効化
  server_id: 12345
  start_from: "snapshot"
```

## コマンド

### SYNC - スナップショット同期を開始

特定のテーブルに対してスナップショット同期を手動で開始します。

::: warning 実行前の確認
`SYNC` はMySQLの対象テーブルを読み取るため、行数が多いテーブルではMySQL側に読み取り負荷がかかります。本番環境では実行時間帯、レプリケーションユーザーの権限、`network.allow_cidrs`、利用可能メモリを確認してから実行してください。
:::

**構文:**
```
SYNC <table_name>
```

`<table_name>` は単一DB構成では修飾なしのテーブル名を指定できます。複数DB構成では `<database>.<table>` を使ってください。

**例:**
```bash
# CLI を使用
mygram-cli SYNC articles

# 複数DB構成
mygram-cli SYNC app_db.articles

# telnet/nc を使用
echo "SYNC articles" | nc localhost 11016
```

**レスポンス（成功）:**
```
OK SYNC STARTED table=articles job_id=1
```

**レスポンス（エラー）:**
```
ERROR SYNC already in progress for table 'articles'
ERROR Memory critically low. Cannot start SYNC. Check system memory.
ERROR Table 'products' not found in configuration
```

**動作:**
- バックグラウンドで非同期に実行
- 開始後すぐにレスポンスを返す
- MySQL の SELECT クエリからスナップショットをビルド
- スナップショット時点の GTID を取得
- 完了時に取得した GTID から binlog レプリケーションを自動的に開始

### SYNC STATUS - 同期の進捗を確認

SYNC 操作の進捗とステータスを確認します。

::: tip 進捗の見方
`progress` はMySQLから読み終えた行数の目安です。`COMPLETED` になり、`replication=STARTED` が返れば、スナップショット作成後のbinlog追従まで開始できています。
:::

**構文:**
```
SYNC STATUS
```

**例:**
```bash
# CLI を使用
mygram-cli SYNC STATUS

# telnet/nc を使用
echo "SYNC STATUS" | nc localhost 11016
```

**レスポンス例:**

**進行中:**
```
table=articles status=IN_PROGRESS progress=10000/25000 rows (40.0%) rate=5000 rows/s
```

**完了:**
```
table=articles status=COMPLETED rows=25000 time=5.2s gtid=uuid:123 replication=STARTED
```

**失敗:**
```
table=articles status=FAILED rows=5000 error="MySQL connection lost"
```

**アイドル（同期未実施）:**
```
status=IDLE message="No sync operation performed"
```

### ステータスフィールド

| フィールド | 説明 | 例 |
|-------|-------------|---------|
| `table` | 同期対象のテーブル名 | `articles` |
| `status` | 現在のステータス | `IN_PROGRESS`, `COMPLETED`, `FAILED`, `IDLE`, `CANCELLED` |
| `progress` | 処理済み/総行数 | `10000/25000 rows (40.0%)` |
| `rate` | 処理レート | `5000 rows/s` |
| `rows` | 処理した総行数 | `25000` |
| `time` | 総処理時間 | `5.2s` |
| `gtid` | 取得したスナップショット GTID | `uuid:123` |
| `replication` | レプリケーションステータス | `STARTED`, `ALREADY_RUNNING`, `DISABLED`, `FAILED` |
| `error` | エラーメッセージ（失敗時） | `MySQL connection lost` |

### レプリケーションステータス値

- **STARTED**: スナップショット GTID から binlog レプリケーションを開始（成功）
- **ALREADY_RUNNING**: レプリケーションは既に実行中（GTID は更新されない）
- **DISABLED**: 設定でレプリケーションが無効
- **FAILED**: スナップショットは成功したがレプリケーションの開始に失敗（ログを確認）

## コマンドの競合

### SYNC 中に拒否される操作

| コマンド | 動作 | 理由 |
|---------|----------|--------|
| `DUMP LOAD` | **拒否** | SYNC 中はダンプを読み込めない（データ破損を防止） |
| `REPLICATION START` | **拒否** | SYNC 完了時にレプリケーションを自動開始するため |
| `SYNC`（同じテーブル） | **拒否** | このテーブルの SYNC は既に進行中 |

### SYNC 中に許可される操作

| コマンド | 動作 | 備考 |
|---------|----------|-------|
| `SEARCH` | 許可 | 部分的な結果を返す（これまでにロードされたデータ） |
| `COUNT` | 許可 | 現在のカウントを返す（同期の進行に伴い増加） |
| `GET` | 許可 | ロード済みなら返す、未ロードならエラー |
| `INFO` | 許可 | 同期の進捗を含む現在のサーバー状態を表示 |
| `DUMP SAVE` | **警告** | 許可されるが警告をログ記録（同期途中の状態を保存する可能性） |
| `SYNC`（別のテーブル） | 許可 | マルチテーブル対応、独立した操作 |
| `REPLICATION STOP` | 許可 | 独立した操作 |

::: info SYNC中の検索結果
SYNC中の `SEARCH` や `COUNT` は、すでに読み込み済みのデータを対象にします。全件を反映した結果が必要な処理では、`SYNC STATUS` が `COMPLETED` になるまで待ってからクエリしてください。
:::

## 使用シナリオ

### シナリオ 1: 新規サーバーの起動

```bash
# 1. MygramDB を起動（auto_initial_snapshot=false）
./mygramdb --config config.yaml

# 2. サーバーはスナップショットをビルドせずに起動（MySQL 負荷なし）
# ログ: "Skipping automatic snapshot build for table: articles (auto_initial_snapshot=false)"

# 3. 準備ができたら手動で SYNC を開始
mygram-cli SYNC articles

# 4. 進捗を監視
mygram-cli SYNC STATUS
# 出力: table=articles status=IN_PROGRESS progress=5000/10000 rows (50.0%) rate=2000 rows/s

# 5. 完了を待つ
mygram-cli SYNC STATUS
# 出力: table=articles status=COMPLETED rows=10000 time=5.0s gtid=uuid:456 replication=STARTED
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

```bash
# 各テーブルを独立して同期
mygram-cli SYNC articles
mygram-cli SYNC products
mygram-cli SYNC users

# 複数DBのテーブル識別子
mygram-cli SYNC app_db.articles

# すべての同期ステータスを確認
mygram-cli SYNC STATUS
# 出力:
# table=articles status=COMPLETED rows=10000 time=5.0s gtid=uuid:123 replication=STARTED
# table=products status=IN_PROGRESS progress=5000/20000 rows (25.0%) rate=3000 rows/s
# table=users status=COMPLETED rows=5000 time=2.5s gtid=uuid:123 replication=ALREADY_RUNNING
```

### シナリオ 3: 計画的メンテナンス

```bash
# オフピーク時間帯（例: 午前2時）に SYNC をスケジュール
# cron に追加:
0 2 * * * echo "SYNC articles" | nc localhost 11016
```

## グレースフルシャットダウン

SYNC 中に MygramDB がシャットダウンシグナル（SIGTERM/SIGINT）を受信した場合：

1. **実行中の SYNC 操作はキャンセルされる**
   - `SnapshotBuilder::Cancel()` が呼び出される
   - ステータスが `CANCELLED` に変わる

2. **サーバーはクリーンアップを待つ**
   - 最大待機時間: 30秒
   - バックグラウンドスレッドが正常に終了
   - 初期スナップショット中に SYNC が MySQL の読み取り待ちになっている場合、
     シャットダウンの応答時間は設定された MySQL の `read_timeout_ms`（専用の
     binlog/スナップショット接続では秒に換算）によって制限されます。
     長時間の読み取り中に SIGTERM/SIGINT への速い応答が必要な場合は、この値を
     下げてください。

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

**エラー:** `Memory critically low. Cannot start SYNC. Check system memory.`

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

## 関連項目

- [レプリケーションガイド](/ja/docs/replication)
- [設定リファレンス](/ja/docs/configuration)
- [パフォーマンスチューニング](/ja/docs/performance)
