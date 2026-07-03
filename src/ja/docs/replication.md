---
title: MygramDB MySQLレプリケーション - GTID binlogストリーミング設定
description: MygramDBのMySQLレプリケーション設定。GTIDモード、ROW binlog形式、レプリケーションユーザー権限、開始モード、対応するDML/DDL操作、トラブルシューティング。
head:
  - - meta
    - name: keywords
      content: MygramDB レプリケーション, MySQL GTID, binlog ストリーミング, ROW binlog 形式, レプリケーションユーザー, スナップショット 開始モード, MySQL レプリカ
---

# MySQL レプリケーションガイド

MygramDB は、GTIDベースのbinlogストリーミングでMySQLから変更を受け取り、検索インデックスを継続的に更新します。

::: info 用語補足
**レプリケーション**は、MySQL側の変更を別プロセスへ継続的に伝える仕組みです。MygramDBはMySQLの全文検索を置き換えるために、MySQLのbinlogを読み続けて検索インデックスを更新します。
:::

## 前提条件

### MySQL サーバー要件

MygramDB には以下が必要です:
- **MySQL バージョン**: 8.4+ / 9.x、または MariaDB 10.6+/11.x
- **GTID モード**: MySQLでは有効化必須。MariaDBはネイティブGTID形式を使用
- **バイナリログ形式**: ROW 形式が必要
- **行イメージ**: `binlog_row_image=FULL` が必要
- **権限**: レプリケーションユーザーに特定の権限が必要

::: info 用語補足
**ROW形式のbinlog** は「どの行がどう変わったか」を記録する形式です。MygramDBは変更後の行データを使ってインデックスを更新するため、STATEMENT形式ではなくROW形式が必要です。
:::

### GTID モードを有効化

GTID モードが有効かを確認：

```sql
SHOW VARIABLES LIKE 'gtid_mode';
```

GTID モードが OFF の場合は有効化：

```sql
-- GTID モードを有効化
SET GLOBAL enforce_gtid_consistency = ON;
SET GLOBAL gtid_mode = OFF_PERMISSIVE;
SET GLOBAL gtid_mode = ON_PERMISSIVE;
SET GLOBAL gtid_mode = ON;
```

::: warning 永続設定にも反映
`SET GLOBAL` は稼働中のMySQLには反映されますが、再起動後に戻る場合があります。本番環境では `my.cnf` や管理しているMySQL設定にも `gtid_mode=ON` と `enforce_gtid_consistency=ON` を反映してください。
:::

MariaDBではMySQLの `gtid_mode` / `enforce_gtid_consistency` 変数は使用しません。一意な `server_id` を設定し、バイナリログと `binlog_format=ROW` を有効にしてください。

::: tip MariaDBの場合
MariaDBはMySQLと似ていますが、GTIDの表現形式が異なります。MygramDBはサーバー種別を自動判定するため、設定ファイルでは同じ `mysql` セクションを使えます。
:::

### バイナリログを設定

ROW 形式でバイナリログが有効化されているか確認：

```sql
-- バイナリログ形式を確認
SHOW VARIABLES LIKE 'binlog_format';
SHOW VARIABLES LIKE 'binlog_row_image';

-- ROW 形式に設定（my.cnf に追加して再起動）
SET GLOBAL binlog_format = ROW;
SET GLOBAL binlog_row_image = FULL;
```

::: info binlog_row_image=FULL が必要な理由
UPDATEやDELETEで、MygramDBがテキスト列・主キー・フィルタ列を正しく更新するには、行の十分な情報がbinlogに含まれている必要があります。`MINIMAL` では必要な列が欠けることがあります。
:::

### レプリケーションユーザーを作成

レプリケーション権限を持つユーザーを作成します。

```sql
-- レプリケーションユーザーを作成
CREATE USER 'repl_user'@'%' IDENTIFIED BY 'your_password';

-- レプリケーション権限を付与（binlog読み取りとGTID情報取得用）
GRANT REPLICATION SLAVE, REPLICATION CLIENT ON *.* TO 'repl_user'@'%';

-- スナップショット作成用のSELECT権限を付与（必須）
-- 注意: 対象テーブルに対するSELECT権限が必要です
GRANT SELECT ON database_name.table_name TO 'repl_user'@'%';

-- 変更を適用
FLUSH PRIVILEGES;
```

**注意事項:**

1. **REPLICATION CLIENT権限は必須**: GTID情報を取得するために必要です
2. **SELECT権限は必須**: 初期スナップショット作成時にテーブルデータを読み取るために必要です
3. **権限の追加は再起動不要**: `GRANT`文はオンラインで即座に反映されます
4. **最小権限の原則**: 複数のテーブルを同期する場合は、対象DBまたは対象テーブルにだけSELECT権限を付与してください

### セキュリティ上の注意

- MySQL が TLS を必須にしていない場合、MygramDB から送信される資格情報は平文のままになります。信頼できるネットワーク内に配置するか、TLS/SSH トンネルなどで暗号化された経路を確保してください。
- `DUMP SAVE` で生成されるスナップショットには MySQL のホスト・ユーザー・パスワードが含まれます。暗号化ストレージや `chmod 600` のような厳しい権限で保管し、秘密情報として運用してください。

## 手動スナップショット同期

MygramDB は**手動スナップショット同期**をサポートし、起動時に MySQL プライマリへ予期しない負荷がかかるのを防ぎます。`replication.auto_initial_snapshot` のデフォルトは `false` です。

```yaml
replication:
  enable: true
  auto_initial_snapshot: false
  server_id: 12345
  start_from: "snapshot"
```

v1.8.0以降、起動時の自動スナップショットを有効にする場合は、単一テーブル構成でも複数テーブル構成でも `start_from: "snapshot"` が必要です。

```bash
# テーブルのスナップショット同期を開始
mygram-cli SYNC articles

# 複数DB構成の場合
mygram-cli SYNC app_db.articles

# 同期進捗を確認
mygram-cli SYNC STATUS
```

v1.7.0以降、各テーブルは `<database>.<table>` の有効識別子を持ちます。すべてのテーブルが1つのDBにある場合は `articles` のような修飾なしの名前も使えます。設定が2つ以上のDBにまたがる場合、`SYNC`、`SEARCH`、各種クライアントAPIでは修飾名を使ってください。

レプリケーションが有効で複数テーブルが設定されている場合、初期スナップショットは設定テーブルに対して1つの `START TRANSACTION WITH CONSISTENT SNAPSHOT` を使い、共有GTIDを取得します。これにより、binlogストリーミング再開前に関連テーブルを同じMySQL時点に揃えます。

## レプリケーション開始オプション

設定ファイルの `replication.start_from` で設定:

### snapshot（推奨）

初期スナップショットビルド時に取得された GTID から開始：

```yaml
replication:
  start_from: "snapshot"
```

下の図は、この保証がトランザクション境界をまたいでどう成り立つかを示しています。スナップショットトランザクションが開始すると同時に `gtid_executed` が取得され、その凍結されたビューの中だけでテーブルを読み取る間も新規書き込みはbinlogに蓄積され続け、スナップショット完了後はまさに取得したそのGTIDからbinlogストリーミングが再開されます。

<img src="/diagrams/gtid-snapshot-handoff.svg" alt="MygramDBがコンシステントスナップショットのトランザクション開始時点でgtid_executedを取得し、その凍結ビュー内でテーブルを読み取る間に新規書き込みはbinlogに蓄積され、取得したGTIDのちょうど次からbinlogストリーミングを開始することでトランザクションの欠落も二重適用も起きないことを示すタイムライン図" class="doc-diagram" />

**動作:**
- データ一貫性のため `START TRANSACTION WITH CONSISTENT SNAPSHOT` を使用
- スナップショット時点の `@@global.gtid_executed` を正確に取得
- スナップショット取得時点とbinlog再開位置の境界を揃える

**使うタイミング:**
- 初期セットアップ（ほとんどの場合に推奨）
- 一貫性のあるポイントインタイムビューが必要な場合
- ゼロから開始する場合

### latest

現在の GTID ポジションから開始（履歴データは無視）：

```yaml
replication:
  start_from: "latest"
```

**動作:**
- `SHOW BINARY LOG STATUS` を使用して最新の GTID を取得
- MygramDB 起動後の変更のみを取得

**使うタイミング:**
- リアルタイム変更のみが必要な場合
- 履歴データが重要でない場合

### gtid=UUID:txn

特定の GTID ポジションから開始：

```yaml
replication:
  start_from: "gtid=3E11FA47-71CA-11E1-9E33-C80AA9429562:100"
```

**使うタイミング:**
- 特定のポイントからの手動リカバリ
- テストやデバッグ

## サポートされている操作

### DML 操作

MygramDB は自動的に処理します：

- **INSERT**（WRITE_ROWS イベント）
  - 新しいドキュメントをインデックスとストアに追加
- **UPDATE**（UPDATE_ROWS イベント）
  - ドキュメント内容とフィルターを更新
  - テキストが変更された場合は再インデックス化
- **DELETE**（DELETE_ROWS イベント）
  - インデックスとストアからドキュメントを削除

### DDL 操作

MygramDB は一部の DDL イベントを検知します。ただし、検索対象カラムやフィルタカラムの意味が変わるスキーマ変更は、自動で安全に追従できない場合があります。

::: warning スキーマ変更後は再同期を検討
`text_source`、`primary_key`、`filters`、`required_filters` に関係するカラムを変更した場合は、設定を見直し、MygramDBを再起動して `SYNC` で再構築してください。
:::

#### TRUNCATE TABLE

対象テーブルのインデックスとドキュメントストアを自動的にクリアします。

```sql
TRUNCATE TABLE articles;
```

MygramDB の動作：
- テーブルからすべてのドキュメントをクリア
- すべての転置インデックスをクリア
- ドキュメント ID カウンターをリセット

#### DROP TABLE

対象テーブルのデータをクリアし、エラーをログに出力します。

```sql
DROP TABLE articles;
```

MygramDB の動作：
- すべてのデータをクリア
- エラーメッセージをログ出力
- **手動での再起動/再設定が必要**

#### ALTER TABLE

スキーマ不整合の可能性について警告をログ出力：

```sql
ALTER TABLE articles ADD COLUMN new_col VARCHAR(100);
ALTER TABLE articles MODIFY COLUMN content TEXT;
```

**注意事項:**
- 型変更（例: VARCHAR から TEXT）はレプリケーションの問題を引き起こす可能性があります
- `text_source` または `filters` に影響するカラムの追加/削除は MygramDB の再起動が必要
- **推奨**: スキーマ変更後は MygramDB のスナップショットを再構築してください

## サポートされているカラム型

MygramDB はこれらの MySQL カラム型をレプリケートできます：

### 整数型
- TINYINT、SMALLINT、INT、MEDIUMINT、BIGINT（signed/unsigned）

### 文字列型
- VARCHAR、CHAR、TEXT、BLOB、ENUM、SET

### 日時型
- DATE、TIME、DATETIME、TIMESTAMP（小数秒対応）

### 数値型
- DECIMAL、FLOAT、DOUBLE

### 特殊型
- JSON、BIT、NULL

## レプリケーション機能

### GTID 一貫性

- スナップショットと binlog レプリケーションは一貫性のあるスナップショットトランザクションにより調整
- スナップショット取得後は、取得したGTIDからbinlog読み取りを再開

### GTID ポジション追跡

- 状態ファイルによるアトミックな永続化
- シャットダウン時の自動保存
- 再起動時の再開

### 自動検証

- 起動時に GTID モードをチェック
- 設定されていない場合は明確なエラーメッセージを表示

### 自動再接続

- 接続断を適切に処理
- 指数バックオフリトライ（設定可能）
- 最後の GTID ポジションから継続

### マルチスレッド処理

- 効率的なリクエスト処理のためのスレッドプールアーキテクチャ
- パフォーマンスチューニング用に調整可能なキューサイズ

## レプリケーションの監視

### レプリケーション状態を確認

CLI または TCP プロトコルを使用：

```bash
# CLI を使用
./build/bin/mygram-cli REPLICATION STATUS

# telnet を使用
echo "REPLICATION STATUS" | nc localhost 11016
```

レスポンス:
```
OK REPLICATION status=running gtid=3E11FA47-71CA-11E1-9E33-C80AA9429562:1-100
```

### レプリケーションを停止

Binlog レプリケーションを停止（インデックスは読み取り専用になります）：

```bash
./build/bin/mygram-cli REPLICATION STOP
```

### レプリケーションを開始

Binlog レプリケーションを再開：

```bash
./build/bin/mygram-cli REPLICATION START
```

## トラブルシューティング

### "GTID mode is not enabled on MySQL server"

**解決策**: MySQL サーバーで GTID モードを有効化：

```sql
SET GLOBAL enforce_gtid_consistency = ON;
SET GLOBAL gtid_mode = OFF_PERMISSIVE;
SET GLOBAL gtid_mode = ON_PERMISSIVE;
SET GLOBAL gtid_mode = ON;
```

その後、MygramDB を再起動。

### "Binary log format is not ROW"

**解決策**: バイナリログ形式を ROW に設定：

```sql
SET GLOBAL binlog_format = ROW;
```

または `my.cnf` に追加して MySQL を再起動：

```ini
[mysqld]
binlog_format = ROW
```

### "Replication lag is high"

**考えられる原因:**
- MySQL での高い書き込み量
- MygramDB のリソース不足
- ネットワークレイテンシ

**解決策:**
- 設定の `replication.queue_size` を増やす
- MygramDBレプリカを追加するか、上流の書き込み負荷を下げる。`build.parallelism`は
  予約済み / 現在は未強制です。
- MygramDB レプリカを追加

### "Lost connection to MySQL server during query"

MygramDBは組み込みの再試行スケジュールで自動的に再接続します。以下の
バックオフ項目は将来互換のため受け付けられますが、現在は強制されません：

```yaml
replication:
  reconnect_backoff_min_ms: 500
  reconnect_backoff_max_ms: 10000
```

### "Schema mismatch after ALTER TABLE"

**解決策**: スキーマ変更後にスナップショットを再構築：

1. MygramDB を停止
2. 新しいスキーマに合わせて設定ファイルを更新
3. MygramDB を再起動
4. `SYNC <table>` を実行して、対象テーブルのスナップショットを再構築

## 推奨事項

1. **GTID モードを使用** して、再起動後もbinlogの読み取り位置を引き継げるようにする
2. **初期セットアップには `snapshot` 開始モードを使用**
3. **レプリケーションラグを定期的に監視**
4. **重要なスキーマ変更後はスナップショットを再構築**
5. **本番環境にデプロイする前に設定をテスト**
6. **クラッシュリカバリ用に状態ファイルを保持**
7. **高可用性のために複数のレプリカを使用**

## 設定例

レプリケーション設定例：

```yaml
mysql:
  host: "127.0.0.1"
  port: 3306
  user: "repl_user"
  password: "your_password"
  database: "mydb"
  use_gtid: true
  binlog_format: "ROW"
  binlog_row_image: "FULL"

replication:
  enable: true
  server_id: 0                    # 0 = 自動生成
  start_from: "snapshot"          # snapshot|latest|gtid=<UUID:txn>
  queue_size: 10000
  reconnect_backoff_min_ms: 500   # 予約済み / 現在は未強制
  reconnect_backoff_max_ms: 10000 # 予約済み / 現在は未強制
```

## 関連項目

- [SYNCコマンドガイド](/ja/docs/sync-command) - 手動スナップショット同期
- [設定ガイド](/ja/docs/configuration) - 設定リファレンス
- [プロトコルリファレンス](/ja/docs/protocol) - REPLICATION コマンド
