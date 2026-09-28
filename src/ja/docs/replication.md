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
- **対応データベース**: MySQL 8.4/9.7、または MariaDB 10.11/11.8/12.3
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

イベント単位の binlog 圧縮は無効にしてください。MygramDB は `binlog_transaction_compression` による MySQL の `TRANSACTION_PAYLOAD_EVENT` や、`log_bin_compress` による MariaDB の圧縮 query/row イベントをデコードしません。これは通常の row イベント内にある MariaDB の `COMPRESSED` `VARCHAR`/`TEXT` カラムとは別であり、こちらは MygramDB が展開してデコードします。

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
- `DUMP SAVE` で生成されるスナップショットには MySQL の host、port、database などのソースメタデータが含まれます。ユーザーとパスワードは記録されません。索引化した内容と接続先情報が含まれるため、暗号化ストレージや `chmod 600` のような厳しい権限で保管してください。

## 手動スナップショット同期

MygramDB は**手動スナップショット同期**をサポートし、起動時に MySQL プライマリへ予期しない負荷がかかるのを防ぎます。`replication.auto_initial_snapshot` のデフォルトは `false` です。

```yaml
replication:
  enable: true
  auto_initial_snapshot: false
  server_id: 12345
  start_from: "snapshot"
```

起動時の自動スナップショットを有効にする場合は、単一テーブル構成でも複数テーブル構成でも `start_from: "snapshot"` を使ってください。

以下の本番向け例は `api.admin_token` を設定している前提です。空なら `AUTH` は不要ですが、非ループバックのデプロイではトークンを設定してください。

```text
$ mygram-cli
127.0.0.1:11016> AUTH <token>
OK AUTHENTICATED
127.0.0.1:11016> SYNC app_db.articles
OK SYNC STARTED table=app_db.articles
127.0.0.1:11016> SYNC STATUS
```

単一DB構成では代わりに `SYNC articles` を使います。

各テーブルには `<database>.<table>` という有効識別子があります。すべてのテーブルが 1 つの DB にある場合は、`articles` のような修飾なしの名前も使えます。設定が 2 つ以上の DB にまたがる場合、`SYNC`、`SEARCH`、各種クライアント API では修飾名を使ってください。

レプリケーションが有効で複数テーブルが設定されている場合、初期スナップショットは1つの `START TRANSACTION WITH CONSISTENT SNAPSHOT` を開始する前に共有の保守的な GTID 下限を取得します。これにより、binlog ストリーミング再開時に短い区間の変更を冪等に再適用する可能性を許容しながら、関連テーブルを同じ MySQL 時点に揃えます。

## レプリケーション開始オプション

設定ファイルの `replication.start_from` で設定:

### snapshot（推奨）

初期スナップショットトランザクションの開始前に取得した保守的な GTID 下限から開始します：

```yaml
replication:
  start_from: "snapshot"
```

下の図は、トランザクション境界をまたぐ下限値の引き継ぎを示しています。MygramDB はコンシステントスナップショットトランザクションを開始する前に保守的な GTID 位置を取得し、その凍結ビュー内でテーブルを読み取ります。新規書き込みは binlog に蓄積され続け、スナップショット完了後はその下限値からストリーミングを開始します。取得からトランザクション開始までの変更は再適用されることがありますが、行適用は冪等であり、変更の欠落を防ぎます。

<DocDiagram name="gtid-snapshot-handoff" alt="MygramDBがコンシステントスナップショットトランザクションを開始する前に保守的なGTID下限を取得し、その凍結ビュー内でテーブルを読み取る間に新規書き込みがbinlogに蓄積され、下限値からストリーミングを開始して変更の欠落を防ぐ一方で一部の再適用を許容することを示すタイムライン図" />

**動作:**
- データ一貫性のため `START TRANSACTION WITH CONSISTENT SNAPSHOT` を使用
- スナップショットトランザクションの開始前に保守的な GTID 下限を取得
- スナップショット取得から binlog ストリーミングまでの変更の欠落を防ぎ、短い区間の変更は冪等に再適用されることがある

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
- MySQLでは `SHOW BINARY LOG STATUS`、MariaDBでは `SELECT @@GLOBAL.gtid_binlog_pos` を使って最新のGTIDを取得
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

MygramDB は一部の DDL イベントを検知します。設定済みの主キー、テキストソース、フィルタカラムの意味を変える互換性のない変更では、GTID を進める前にレプリケーションを停止します。

::: warning スキーマ変更後は再同期を検討
`text_source`、`primary_key`、`filters`、`required_filters` に関係するカラムを変更した場合は、スキーマまたは設定を修正してから `SYNC` で再構築してください。再起動だけでは再開しません。
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

```sql
DROP TABLE articles;
```

複数テーブルを含む `DROP TABLE` リストのどこに設定済みテーブルがあっても検知します。MygramDB は GTID を進める前にレプリケーションを停止し、現在のインデックスとドキュメントストアをそのまま残します。設定済みテーブルを自動的にクリアすることはありません。互換性のあるスキーマを戻すか設定を更新してから、`SYNC` でテーブルを再構築してください。

#### ALTER TABLE

設定済みカラムと無関係な変更は警告後も継続できます。設定済みの主キー、テキストソース、フィルタカラムに互換性のない変更を加えると、GTID を進める前にレプリケーションを停止します。

```sql
ALTER TABLE articles ADD COLUMN new_col VARCHAR(100);
ALTER TABLE articles MODIFY COLUMN content TEXT;
```

**復旧:** スキーマまたは設定を修正してから、`SYNC` でテーブルを再構築してください。互換性のない DDL の後は、再起動だけでレプリケーションが再開すると考えないでください。

#### RENAME TABLE と `ALTER TABLE ... RENAME TO`

MygramDB は、`ALTER TABLE ... RENAME TO`、`ALTER TABLE ... AS`、設定済みテーブル名への `ALTER TABLE` による名前変更を含め、両方向の名前変更を認識します。

```sql
ALTER TABLE articles_archive RENAME TO articles;
ALTER TABLE articles RENAME TO articles_archive;
RENAME TABLE articles_archive TO articles;
```

リーダーは GTID を進める前に変更前と変更後の修飾名を照合します。設定済みテーブルの識別子が変わる名前変更ではレプリケーションを停止するため、スキーマを意図した状態にして設定を更新してから `SYNC` を実行してください。

## サポートされているカラム型

MygramDB はこれらの MySQL カラム型をレプリケートできます：

### 整数型
- TINYINT、SMALLINT、INT、MEDIUMINT、BIGINT（signed/unsigned）

### 文字列型
- VARCHAR、CHAR、TEXT、ENUM、SET

設定済みの主キー、テキストソース、フィルタカラムには `BINARY`、`VARBINARY`、`BLOB` を使えません。設定で使用する文字列カラムには、`utf8mb4`、`utf8`/`utf8mb3`、`ascii` のいずれかの照合順序が必要です。

### 日時型
- DATE、TIME、DATETIME、TIMESTAMP（小数秒対応）

### 数値型
- DECIMAL、DOUBLE

### 特殊型
- BIT

`FLOAT` は binlog からデコードできますが、結果セットと row image で同じ値を保持できないため、設定済みの主キー、テキストソース、フィルタ、required filter カラムには使用できません。`JSON`、`GEOMETRY` とそのサブタイプ、`VECTOR`、`BINARY`、`VARBINARY`、`BLOB`、`ZEROFILL`、未知のカラム型も設定済みカラムでは拒否されます。MariaDB の `COMPRESSED` `VARCHAR`/`TEXT` row カラムはインデックス化の前に展開され、非圧縮、raw deflate、zlib のペイロード形式を処理します。宣言されたテキスト型と照合順序が同じ検査を通れば使用できます。

### required filter の日時値

初期 `SELECT` と binlog row イベントでは同じ required filter 述語を使います。テキスト値は保存されたバイト列として比較し、`TIMESTAMP` は UTC エポック、`TIME` は時刻の秒数として比較します。`DATETIME`、`TIMESTAMP`、`TIME` のフィルタ値には小数秒を含められ、両方の経路で同じ精度とタイムゾーン規則が適用されます。`DATE` は日付だけの意味を保ちます。設定した `mysql.datetime_timezone` に対応する通常の日時リテラルを使い、フィルタ値の末尾に `Z` や数値オフセットを付けないでください。

### TABLE_MAP メタデータ

MygramDB はテーブルが設定対象かを判断する前に、各カラムの `TABLE_MAP` メタデータを消費します。そのため、未知またはサイズを決められない型は、未設定テーブルのイベントでもリーダーを停止させます。リーダーは最後に適用した GTID から再接続し、イベントをスキップ可能とは扱いません。メタデータデコーダーは `DECIMAL`、`CHAR`、`ENUM`、`SET`、`JSON`、`GEOMETRY` を含む各型のバイト順とペイロード長を、対応する MySQL 8.4/9.7 と MariaDB 10.11/11.8/12.3 のストリームで処理します。設定済みカラムの可否は上記の制限に従います。

## レプリケーション機能

### GTID 一貫性

- スナップショットと binlog レプリケーションは一貫性のあるスナップショットトランザクションにより調整
- 保守的な GTID 下限で変更の欠落を防ぎ、トランザクション開始前の短い区間の変更は冪等に再適用されることがある

### GTID ポジションと復旧

- `start_from: snapshot` は初期スナップショットトランザクションの開始前に取得した保守的な GTID 下限を使い、`latest` と明示的な `gtid=...` は設定した開始位置を使う
- `DUMP SAVE` は GTID をダンプに記録し、`DUMP LOAD` または起動時復元はその GTID をリーダーの次の位置として設定します。手動の `DUMP LOAD` 前からリーダーが停止していた場合は、読み込み後も停止したままです。
- 初期 `SYNC` はトランザクション開始前に保守的なスナップショット GTID 下限を取得します。通常の引き継ぎでは SYNC 前にドレインした GTID から共有リーダーを再開し、`2017` の復旧ではそのスナップショットマーカーから再開してデコードできない区間を越えます

### 自動検証

- 起動時に GTID モードをチェック
- 設定されていない場合は明確なエラーメッセージを表示

### 自動再接続

- 接続断を適切に処理
- 組み込みの再試行スケジュールを使います。`reconnect_backoff_min_ms` と `reconnect_backoff_max_ms` は予約済みで適用されません
- プロセスが動作している間は、リーダーが最後に処理した GTID から継続

### マルチスレッド処理

- 効率的なリクエスト処理のためのスレッドプールアーキテクチャ
- パフォーマンスチューニング用に調整可能なキューサイズ

## レプリケーションの監視

### レプリケーション状態を確認

認証済みの CLI 接続を1つ使用します：

```text
$ ./build/bin/mygram-cli
127.0.0.1:11016> AUTH <token>
OK AUTHENTICATED
127.0.0.1:11016> REPLICATION STATUS
```

レスポンス:
```
OK REPLICATION
status: running
current_gtid: 3E11FA47-71CA-11E1-9E33-C80AA9429562:1-100
processed_events: 12345
queue_size: 0
crc_errors: 0
schema_incompatible: false
last_error_code: 0
last_error:
last_applied_unixtime: 1790553600
seconds_since_last_applied: 0
END
```

### レプリケーションを停止

Binlog レプリケーションを停止（インデックスは読み取り専用になります）：

```text
$ ./build/bin/mygram-cli
127.0.0.1:11016> AUTH <token>
OK AUTHENTICATED
127.0.0.1:11016> REPLICATION STOP
```

### レプリケーションを開始

Binlog レプリケーションを再開：

```text
$ ./build/bin/mygram-cli
127.0.0.1:11016> AUTH <token>
OK AUTHENTICATED
127.0.0.1:11016> REPLICATION START
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

`replication_seconds_since_last_applied` は、MySQL の書き込み状況とリーダー状態を合わせて見てください。この時刻は適用済み GTID を進めたときに更新されるため、大きい値は最近イベントを適用していないことを示します。ただし、ソースがアイドル中でも値だけで遅延リーダーとは断定できません。レプリケーションを利用できないとき、`/health/ready` は `503` を返します。`INFO` でも同じ全体 readiness と `data_initialized` を確認できます。

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

### デコードできない binlog イベントから復旧する

レプリケーションがエラーコード `2017` で停止した場合、そのビルドではデコードできないイベントに到達しています。XA prepare イベント、MySQL の `TRANSACTION_PAYLOAD_EVENT`、`PARTIAL_UPDATE_ROWS_EVENT`、`log_bin_compress` で圧縮された MariaDB イベントが該当します。イベント単位の MariaDB 圧縮は引き続き未対応です。生成元のサーバー設定を変えても、すでに書かれたイベントは binlog から消えません。古い GTID から再開すると同じ位置で再び停止します。

これは通常の row イベント内にある MariaDB の `COMPRESSED` `VARCHAR`/`TEXT` カラムとは異なります。MygramDB はカラムをインデックス化する前に展開します。カラムのペイロードが不正、未知、破損している場合は row デコード失敗としてエラー `2008` になり、通常の再接続処理に進みます。`2017` の復旧手順には該当しません。

まず最も重要なテーブルに `SYNC` を実行し、`replication=STARTED` を伴って完了するまで待ちます。その後、他のすべてのレプリケーション対象テーブルにも `SYNC` を実行してください。最初の SYNC は新しいスナップショットマーカーから共有リーダーを再開し、デコードできない区間を飛ばします。再構築しないテーブルには、その区間にあった書き込みが反映されません。

他のレプリケーション失敗では、SYNC は区間を飛ばさず、ドレイン済み位置から再開します。コマンドの手順は [SYNC コマンド](/ja/docs/sync-command#エラー-2017-デコードできない-binlog-イベント) を参照してください。

## 推奨事項

1. **GTID モードを使用** して、スナップショットと binlog の位置を揃える
2. **初期セットアップには `snapshot` 開始モードを使用**
3. **レプリケーションラグを定期的に監視**
4. **重要なスキーマ変更後はスナップショットを再構築**
5. **本番環境にデプロイする前に設定をテスト**
6. **復旧用に `DUMP SAVE` または `SYNC` を使う**
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
  server_id: 83917                # 1 から 4294967295 の一意な値
  start_from: "snapshot"          # snapshot|latest|gtid=<UUID:txn>
  queue_size: 10000
  reconnect_backoff_min_ms: 500   # 予約済み / 現在は未強制
  reconnect_backoff_max_ms: 10000 # 予約済み / 現在は未強制
```

## 関連項目

- [SYNCコマンドガイド](/ja/docs/sync-command) - 手動スナップショット同期
- [設定ガイド](/ja/docs/configuration) - 設定リファレンス
- [プロトコルリファレンス](/ja/docs/protocol) - REPLICATION コマンド
