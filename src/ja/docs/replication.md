---
title: MygramDB MySQL レプリケーション - GTID binlog ストリーミング設定
description: MygramDB の MySQL レプリケーション設定。GTID モード、ROW binlog 形式、レプリケーションユーザー権限、開始モード、対応する DML/DDL 操作、トラブルシューティング。
head:
  - - meta
    - name: keywords
      content: MygramDB レプリケーション, MySQL GTID, binlog ストリーミング, ROW binlog 形式, レプリケーションユーザー, スナップショット 開始モード, MySQL レプリカ
---

# MySQL レプリケーションガイド

MygramDB は、GTID ベースの binlog イベントを MySQL から読み取り、行の変更を検索インデックスへ反映します。

::: info 用語補足
**レプリケーション**は、MySQL 側の変更を別プロセスへ継続的に伝える仕組みです。MygramDB は MySQL の全文検索を置き換えるために、MySQL の binlog を読み続けて検索インデックスを更新します。
:::

## 前提条件

### MySQL サーバー要件

::: info ROW 形式の binlog とは
**ROW 形式**の binlog は「どの行がどう変わったか」を記録する形式です。MygramDB は変更後の行データを使ってインデックスを更新するため、STATEMENT 形式では足りず、ROW 形式が必要です。
:::

ソースサーバーは次の要件を満たす必要があります。

| 項目 | 必要な値 | 理由 |
| --- | --- | --- |
| データベース | MySQL 8.4/9.7/26.x、または MariaDB 10.11 以降（11.x と 12.x を含む） | 対応バージョン。MariaDB は 10.11、11.4、11.8、12.3 でテストしている |
| バイナリログ | `log_bin=ON` | 無効だと読み取る binlog がない |
| GTID | MySQL は `gtid_mode=ON`。MariaDB はネイティブ GTID（設定不要） | MygramDB は GTID で読み取り位置を管理する |
| binlog 形式 | `binlog_format=ROW` | row イベントに変更後のデータが含まれる |
| 行イメージ | `binlog_row_image=FULL` | `UPDATE` と `DELETE` のイベントに、MygramDB が使うカラムをすべて含める |
| 行メタデータ | `binlog_row_metadata=FULL` | 各 `TABLE_MAP` イベントにカラム名が含まれる |
| チェックサム | `binlog_checksum=CRC32` | 適用前にすべてのイベントの整合性を検査する |
| 権限 | 後述の権限を付与したレプリケーションユーザー | 「レプリケーションユーザーを作成」を参照 |

### GTID モードを有効化

GTID モードが有効かを確認します。

```sql
SHOW VARIABLES LIKE 'gtid_mode';
```

GTID モードが OFF の場合は有効にします。

```sql
-- GTID モードを有効化
SET GLOBAL enforce_gtid_consistency = ON;
SET GLOBAL gtid_mode = OFF_PERMISSIVE;
SET GLOBAL gtid_mode = ON_PERMISSIVE;
SET GLOBAL gtid_mode = ON;
```

MariaDB では MySQL の `gtid_mode` / `enforce_gtid_consistency` 変数は使用しません。一意な `server_id` を設定し、バイナリログと `binlog_format=ROW` を有効にしてください。

::: warning 永続設定にも反映する
`SET GLOBAL` は稼働中の MySQL には反映されますが、再起動後に元へ戻る場合があります。本番環境では、`my.cnf` など MySQL の設定管理にも `gtid_mode=ON` と `enforce_gtid_consistency=ON` を書いてください。
:::

::: tip MariaDB の場合
MariaDB は MySQL と似ていますが、GTID の表現形式が異なります。MygramDB はサーバー種別を自動判定するため、設定ファイルでは同じ `mysql` セクションを使えます。
:::

### バイナリログを設定

ROW 形式でバイナリログが有効になっているか確認します。

```sql
-- バイナリログ形式を確認
SHOW VARIABLES LIKE 'binlog_format';
SHOW VARIABLES LIKE 'binlog_row_image';
SHOW VARIABLES LIKE 'binlog_row_metadata';

-- ROW 形式に設定（my.cnf に追加して再起動）
SET GLOBAL binlog_format = ROW;
SET GLOBAL binlog_row_image = FULL;
```

`binlog_row_metadata` は動的に変更できるため、再起動は不要です。MySQL では `SET PERSIST`、MariaDB では `SET GLOBAL` を使います。あわせて、サーバー設定ファイルの `[mysqld]` に、`binlog_format`、`binlog_row_image` と並べて `binlog_row_metadata = FULL` を書いてください。MariaDB では、これが再起動後も設定を維持する手段になります。

::: code-group

```sql [MySQL]
SET PERSIST binlog_row_metadata = FULL;
```

```sql [MariaDB]
SET GLOBAL binlog_row_metadata = FULL;
```

:::

すでに書き込まれたイベントのメタデータは変わりません。変更前のイベントが再生範囲に残る場合は、ソース設定を変えた後、レプリケーション対象の全テーブルで `SYNC` を実行してください。監視対象テーブルのイベントにメタデータがない場合は、必要な設定を示すエラーを出して `2017` で停止します。オプションメタデータが不正な場合も `2017` で停止します。

イベント単位の binlog 圧縮は無効にしてください。MygramDB は、`binlog_transaction_compression` による MySQL の `TRANSACTION_PAYLOAD_EVENT` や、`log_bin_compress` による MariaDB の圧縮 query/row イベントをデコードしません。通常の row イベント内にある MariaDB の `COMPRESSED` `VARCHAR`/`TEXT` カラムは別で、こちらは MygramDB が展開してデコードします。

### ソースとテーブルの検証

MygramDB は、スナップショットを作成する前にソースを検証し、再接続のたびに同じ確認を繰り返します。設定済みテーブルも、起動時と、そのテーブルに影響する DDL の後に検証します。条件を満たさない場合は、表のコードでレプリケーションを停止します。

| 要件 | 拒否コード |
| --- | --- |
| `log_bin=ON` | `2008` |
| MySQL の `gtid_mode=ON` | `2006` |
| `binlog_format=ROW`、`binlog_row_image=FULL`、`binlog_row_metadata=FULL` | `2008` |
| `binlog_checksum=CRC32`、binlog のトランザクション/イベント圧縮なし、MySQL の `PARTIAL_JSON` 行値なし | `2008` |
| ソース自体がレプリカの場合、MySQL では `log_replica_updates=ON`、MariaDB では `log_slave_updates=ON` | `2008` |
| MariaDB で `binlog_storage_engine` が未設定 | `2008` |

MySQL では、ソースがレプリカかどうかを調べるために `SHOW REPLICA STATUS` を実行します。このため、レプリケーションユーザーには `REPLICATION CLIENT` が必要です。MariaDB は `gtid_slave_pos` を使うので、この追加権限は要りません。

各監視対象テーブルの `primary_key` には、そのカラム単独の `PRIMARY KEY` または `UNIQUE NOT NULL` 制約が必要です。

- NULL を許す単独カラムの UNIQUE キーは `2012` で拒否されます。
- 一意性が複合 `PRIMARY KEY` / `UNIQUE` 制約だけで保証されている場合は、`2011` で拒否されます。複合キーにも含まれるカラムでも、条件を満たす単独カラム制約があれば使えます。
- 子テーブルに、`ON UPDATE` または `ON DELETE` で `CASCADE`、`SET NULL`、`SET DEFAULT` を指定した外部キーがある場合は、`2012` で拒否されます。InnoDB はこうした子行の変更を row イベントに記録しないためです。MySQL 9.0 以降で `innodb_native_foreign_keys=OFF` の場合は、サーバー層が各子行のイベントを書き込むので対象外です。

MariaDB では、旧形式の `TIME(n)`、`DATETIME(n)`、`TIMESTAMP(n)`（`n > 0`）を使うカラムは、設定していないカラムでも `2012` で拒否されます。TABLE_MAP にその幅が記録されないためです。同じ型でも `n = 0` なら使えます。設定カラムの `year(2)` も `2012` で拒否されます。設定カラムの型、NULL 可否、照合順序、生成方法、生成式が変わった場合は、スキーマ変更として扱います。

名前の照合方法は、ソースの `lower_case_table_names` に従います。値が `0` の場合、row イベントと DDL のデータベース名・テーブル名は、設定した名前とバイト単位で一致する必要があります。それ以外の値では、どちらの経路でも ASCII の大文字小文字を区別しません。

初期スナップショットの読み込み、`SYNC`、binlog の取り込みには、同じドキュメント上限をバイト単位で適用します。主キーは 1 MiB、フィルタは 1 ドキュメントあたり最大 1,000 個、フィルタ名は 1 KiB、文字列フィルタ値は 64 KiB、正規化テキストと元テキストはそれぞれ 16 MiB です。上限を超える行は、初期読み込みまたは `SYNC` で失敗します。レプリケーション中に超過した場合は、エラーを報告し、GTID 位置を進めません。

### レプリケーションユーザーを作成

::: info binlog_row_image=FULL が必要な理由
`UPDATE` や `DELETE` で MygramDB がテキストカラム、主キー、フィルタカラムを正しく更新するには、行の十分な情報が binlog に含まれている必要があります。`MINIMAL` では必要なカラムが欠けることがあります。
:::

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

| 権限 | 用途 |
| --- | --- |
| `REPLICATION SLAVE` | binlog の読み取り |
| `REPLICATION CLIENT` | GTID 情報の取得（必須） |
| `SELECT` | 初期スナップショットと `SYNC` でのテーブルデータの読み取り（必須） |

`GRANT` 文はオンラインで即座に反映されるため、再起動は不要です。複数のテーブルを同期する場合は、最小権限の原則に従い、対象の DB またはテーブルにだけ `SELECT` を付与してください。

### セキュリティ上の注意

- `mysql.ssl_enable` のデフォルトは `false` で、MySQL サーバーが TLS に対応していても TLS を使いません。暗号化接続を必須にするには `true` を設定してください。TLS を使わない場合、MySQL 接続とレプリケーション通信は暗号化されません。
- `mysql.ssl_verify_server_cert: true` にすると、CA チェーンとサーバーのホスト名も検証します。この設定には `mysql.ssl_ca` が必要です。検証を無効にした場合、通信は TLS で暗号化されますが、サーバーの身元は検証されません。
- `DUMP SAVE` で書き出したダンプファイルには、MySQL の host、port、database などのソースメタデータが含まれます。ユーザーとパスワードは記録されません。ダンプファイルにはインデックス化した内容も含まれるため、`chmod 600` のような厳しい権限をかけた保護済みのストレージに保管してください。

## 手動スナップショット同期

MygramDB は**手動スナップショット同期**に対応しており、起動時に MySQL ソースへかかる読み取り負荷を運用側で制御できます。

起動時の初期インデックスは、次の 3つのいずれかから作られます。`dump.load_on_startup` で復元するダンプファイル、`auto_initial_snapshot` による自動の初期スナップショット、後から実行する `SYNC` です。検証に失敗したダンプは、`auto_initial_snapshot` が false でも MySQL からの初期スナップショットにフォールバックします。

<DocDiagram name="startup-initial-index" alt="起動時、MygramDB はまず dump.load_on_startup を確認します。有効ならダンプファイルを復元してソースと照合し、保存済みの GTID から binlog を再生します。無効なダンプは MySQL からの初期スナップショットにフォールバックし、追いつけない復元は not_ready のまま復元データで応答を続けます。dump.load_on_startup が無効なら、auto_initial_snapshot によって自動の初期スナップショットか、SYNC を実行するまで空のまま起動するかが決まります。スナップショットの経路はどちらも、スナップショットの GTID から binlog に追従し、ready になると検索を提供します。" />

### 設定

デフォルトでは、MygramDB は起動時にスナップショットを作成しません（`replication.auto_initial_snapshot` は `false`）。

```yaml
replication:
  enable: true
  auto_initial_snapshot: false
  server_id: 12345
  start_from: "snapshot"
```

### 手動 SYNC コマンド

`SYNC` を実行すると、テーブルを手動で読み込めます。例は `api.admin_token` を設定している前提です。空なら `AUTH` は不要ですが、非ループバックのデプロイではトークンを設定してください。

```text
$ mygram-cli
127.0.0.1:11016> AUTH <token>
OK AUTHENTICATED
127.0.0.1:11016> SYNC app_db.articles
OK SYNC STARTED table=app_db.articles
127.0.0.1:11016> SYNC STATUS
```

単一 DB 構成では、代わりに `SYNC articles` を使います。

詳細は [SYNC コマンドガイド](/ja/docs/sync-command)を参照してください。

### 起動時の自動スナップショット

起動時に初期スナップショットを自動作成するには、次のように設定します。

```yaml
replication:
  auto_initial_snapshot: true
  start_from: "snapshot"
```

起動時に自動作成する場合は、単一テーブルでも複数テーブルでも `start_from: "snapshot"` を使います。

手動で同期すれば、起動時に予期しない MySQL 負荷がかかりません。読み取りを行う時間帯（たとえば負荷の低い時間帯）を選べ、進捗の確認や処理のキャンセルもできます。

### 複数テーブル・複数 DB でのスナップショットの一貫性

各テーブルには `<database>.<table>` というテーブル識別子があります。すべてのテーブルが 1 つの DB にある場合は、`articles` のような修飾なしの名前も使えます。設定が 2 つ以上の DB にまたがる場合、`SYNC`、`SEARCH`、各種クライアント API では修飾名を使ってください。

レプリケーションが有効で複数テーブルが設定されている場合、すべてのテーブルを 1 つの `START TRANSACTION WITH CONSISTENT SNAPSHOT` で読み込みます。MySQL では、そのトランザクションの前に共有の保守的な GTID 下限を取得するため、短い区間の変更が冪等に再適用されることがあります。MariaDB では、スナップショット自体の binlog 位置を記録し、`BINLOG_GTID_POS` で GTID に変換します。

## レプリケーション開始オプション

`replication.start_from` で開始位置を指定します。

### snapshot（推奨）

MySQL では、初期スナップショットトランザクションの開始前に取得した保守的な GTID 下限から開始します。MariaDB では、スナップショットが記録した正確な binlog 位置を GTID に変換して開始します。

```yaml
replication:
  start_from: "snapshot"
```

下の図は MySQL でのトランザクション境界をまたぐ引き継ぎを示しています。MygramDB は一貫性スナップショットの開始前に保守的な GTID 位置を取得し、凍結ビューでテーブルを読み込みます。その間も新規書き込みは binlog に蓄積され、スナップショット完了後に下限値からストリーミングを開始します。取得からトランザクション開始までの変更は再適用されることがあります。MariaDB ではスナップショット自体の binlog 位置から再開します。

<DocDiagram name="gtid-snapshot-handoff" alt="MySQLで、MygramDBが一貫性スナップショットを開始する前に保守的なGTID下限を取得し、凍結ビュー内での読み込み中にbinlogへ蓄積した変更をその下限から再生するタイムライン図" />

**動作:**
- データの一貫性のため `START TRANSACTION WITH CONSISTENT SNAPSHOT` を使用
- MySQL ではスナップショットトランザクションの開始前に保守的な GTID 下限を取得し、MariaDB ではスナップショット自体の binlog 位置を記録

**使うタイミング:**
- 初期セットアップ（ほとんどの場合に推奨）
- 一貫性のあるポイントインタイムビューが必要な場合
- ゼロから開始する場合

### latest

現在の GTID 位置から開始します。履歴データは無視します。

```yaml
replication:
  start_from: "latest"
```

**動作:**
- 最新の GTID の取得には、MySQL では `SHOW BINARY LOG STATUS`、MariaDB では `SELECT @@GLOBAL.gtid_binlog_pos` を使用
- MygramDB 起動後の変更のみを取得

**使うタイミング:**
- リアルタイム変更のみが必要な場合
- 履歴データが重要でない場合

### `gtid=<position>` {#start-from-gtid}

検証済みの GTID セットまたはリストから開始します。MySQL は `UUID[:tag]:txn[-txn]` の区間を、UUID ごとにカンマ区切りで受け付けます。トランザクション番号は `2^63−1` 未満でなければなりません。MariaDB は独自の形式で、`domain-server-seq` をカンマ区切りで受け付けます。

::: info タグ付き GTID とは
MySQL 8.4 以降では、トランザクションのまとまりにタグを付けられます。表記は `UUID:tag:txn` です（例: `3E11FA47-71CA-11E1-9E33-C80AA9429562:batch:1-50`）。同じソースでも、タグ付きとタグなしの GTID は別々に数えられます。MygramDB はタグ付きのトランザクションも複製し、ほかの GTID と同じようにレプリケーション位置へ記録します。
:::

```yaml
replication:
  start_from: "gtid=3E11FA47-71CA-11E1-9E33-C80AA9429562:100"
```

**使うタイミング:**
- 特定のポイントからの手動リカバリ
- テストやデバッグ

MySQL で `UUID:txn` や `UUID:tag:txn` と書いた位置は、そのトランザクションまでを意味します。MygramDB は、再接続時にそれ以前のトランザクションを要求しないよう、`UUID:1-txn` や `UUID:tag:1-txn` に広げます。どちらの GTID 形式にも合わない値は、`gtid=,` のように区切り文字しかない値も含めて、設定検証で拒否されます。

## サポートされている操作

### DML 操作

MygramDB は次の操作を自動的に処理します。

- **INSERT**（WRITE_ROWS イベント）
  - 新しいドキュメントをインデックスとドキュメントストアに追加
- **UPDATE**（UPDATE_ROWS イベント）
  - ドキュメントの内容とフィルタを更新
  - テキストが変わった場合は再インデックス化
- **DELETE**（DELETE_ROWS イベント）
  - インデックスとドキュメントストアからドキュメントを削除

### DDL 操作

::: warning スキーマ変更後は再同期を検討
`text_source`、`primary_key`、`filters`、`required_filters` に関係するカラムを変更した場合は、スキーマまたは設定を修正してから `SYNC` で再構築してください。再起動だけではレプリケーションは再開しません。
:::

MygramDB は次の DDL を処理します。

#### TRUNCATE TABLE

対象テーブルのインデックスとドキュメントストアを自動的にクリアします。

```sql
TRUNCATE TABLE articles;
```

MygramDB は次の処理を行います。
- テーブルのすべてのドキュメントをクリア
- すべてのポスティングリストをクリア
- ドキュメント ID カウンターをリセット

#### DROP TABLE

```sql
DROP TABLE articles;
```

複数テーブルを指定した `DROP TABLE` では、設定済みテーブルがリストのどこにあっても検知します。MygramDB は GTID を進める前にレプリケーションを停止し、現在のインデックスとドキュメントストアをそのまま残します。設定済みテーブルを自動でクリアすることはありません。互換性のあるスキーマを戻すか設定を更新してから、`SYNC` でテーブルを再構築してください。

#### ALTER TABLE

設定済みカラムと無関係な変更は、警告を出したうえで継続できます。設定済みの主キー、テキストソース、フィルタカラムに互換性のない変更を加えた場合は、GTID を進める前にレプリケーションを停止します。

```sql
ALTER TABLE articles ADD COLUMN new_col VARCHAR(100);
ALTER TABLE articles MODIFY COLUMN content TEXT;
```

**復旧:** スキーマまたは設定を修正してから、`SYNC` でテーブルを再構築してください。互換性のない DDL の後は、再起動だけではレプリケーションは再開しません。

#### CREATE INDEX と DROP INDEX

`CREATE INDEX` と `DROP INDEX` の後も、`ALTER TABLE` と同様に監視対象テーブルのスキーマを再検証します。設定済みの `primary_key` に必要な単独カラムの UNIQUE インデックスを削除すると、スキーマが非互換になり、GTID を進める前にレプリケーションが停止します。条件を満たす `PRIMARY KEY` または `UNIQUE NOT NULL` 制約を戻してから、`SYNC` でテーブルを再構築してください。

#### RENAME TABLE と `ALTER TABLE ... RENAME TO`

MygramDB は、`ALTER TABLE ... RENAME TO`、`ALTER TABLE ... AS`、設定済みテーブル名への名前変更を含め、どちらの方向の名前変更も認識します。

```sql
ALTER TABLE articles_archive RENAME TO articles;
ALTER TABLE articles RENAME TO articles_archive;
RENAME TABLE articles_archive TO articles;
```

リーダーは、GTID を進める前に変更前と変更後の修飾名を照合します。設定済みテーブルの識別子が変わる名前変更ではレプリケーションが停止します。スキーマを意図した状態にし、設定を更新してから `SYNC` を実行してください。

次の DDL は、設定済みテーブルの行を row イベントなしで削除・置換・移動するため、`2017` で停止します。パーティションの `DROP`、`TRUNCATE`、`EXCHANGE`、`CONVERT`、テーブルスペースの `DISCARD`、`IMPORT`、`CREATE OR REPLACE TABLE` です。変更に対処してから `SYNC` を実行してください。設定済みデータベースに対する `DROP DATABASE` は、識別子の大文字小文字にかかわらず `2012` で停止します。通常の `TRUNCATE TABLE` は、前述のとおりインデックスとドキュメントストアをクリアします。

## サポートされているカラム型

MygramDB は次の MySQL カラム型をレプリケートできます。

| 分類 | 型 |
| --- | --- |
| 整数 | TINYINT、SMALLINT、INT、MEDIUMINT、BIGINT（signed/unsigned） |
| 文字列 | VARCHAR、CHAR、TEXT、ENUM、SET |
| 日時 | DATE、TIME、DATETIME、TIMESTAMP（小数秒対応） |
| 数値 | DECIMAL、DOUBLE |
| 特殊 | BIT |

設定済みの主キー、テキストソース、フィルタカラムには `BINARY`、`VARBINARY`、`BLOB` を使えません。設定で使用する文字列カラムには、`utf8mb4`、`utf8`/`utf8mb3`、`ascii` のいずれかの照合順序が必要です。

`FLOAT` は binlog からデコードできますが、結果セットと行イメージで同じ値を保持できないため、設定済みの主キー、テキストソース、フィルタ、`required_filters` のカラムには使えません。`JSON`、`GEOMETRY` とそのサブタイプ、`VECTOR`、`BINARY`、`VARBINARY`、`BLOB`、`ZEROFILL`、未知のカラム型も、設定済みカラムでは拒否されます。

MariaDB の `COMPRESSED` `VARCHAR`/`TEXT` row カラムは、インデックス化の前に展開されます。非圧縮、raw deflate、zlib のペイロード形式に対応しており、宣言されたテキスト型と照合順序が同じ検査を通れば使えます。

### required filter の日時値

初期 `SELECT` と binlog の row イベントは、同じ `required_filters` の述語を使います。比較は値の種類ごとに次のとおりです。テキストは保存されたバイト列、`TIMESTAMP` は UTC エポック、`TIME` は時刻の秒数で比べます。`DATE` は日付だけの意味を保ちます。`DATETIME`、`TIMESTAMP`、`TIME` のフィルタ値には小数秒を含められ、両方の経路に同じ精度とタイムゾーンの規則が適用されます。

日時は、設定した `mysql.datetime_timezone` に対応する通常の日時リテラルで書いてください。フィルタ値の末尾に `Z` や数値オフセットを付けると拒否されます。

### TABLE_MAP メタデータ

MygramDB は、テーブルが設定対象かを判断する前に、各カラムの `TABLE_MAP` 型メタデータを読み取ります。行幅を判定するため、binlog に流れるすべてのテーブルが対象です。未知の型やサイズを決められない型があると、未設定テーブルであっても `2017` でリーダーが停止します。最後に適用した GTID の位置は進まないため、再接続しても同じイベントに到達します。

オプションメタデータの扱いは異なります。監視対象テーブルでオプションメタデータが欠落または不正な場合は `2017` で停止するため、ソースは監視対象のイベントを書き込む時点で `binlog_row_metadata=FULL` を有効にしておく必要があります。未設定テーブルや、`SYNC` スナップショットが対象行をカバーしている場合は、オプションメタデータを解析しません。

メタデータのデコーダーは、`DECIMAL`、`CHAR`、`ENUM`、`SET`、`JSON`、`GEOMETRY` を含む各型のバイト順とペイロード長を、対応するすべての MySQL と MariaDB のシリーズで処理します。設定済みカラムの可否は、前述の制限に従います。

未知のイベント型は、イベントヘッダーにスキップ可能を示す `LOG_EVENT_IGNORABLE_F` フラグがある場合だけ読み飛ばします。フラグがなければ `2017` で停止します。

## レプリケーション機能

### GTID 一貫性

- スナップショットと binlog レプリケーションは、一貫性のあるスナップショットトランザクションで調整します
- MySQL では保守的な GTID 下限を使うため、トランザクション開始前の短い区間の変更が冪等に再適用されることがあります。MariaDB ではスナップショット自体の正確な binlog 位置を記録します

### GTID 位置と復旧 {#gtid-position}

- `start_from: snapshot` は、MySQL では保守的な GTID 下限、MariaDB ではスナップショット位置を使います。`latest` と明示的な `gtid=...` は、設定した開始位置を使います
- `DUMP SAVE` は GTID をダンプに記録し、`DUMP LOAD` または起動時復元はその GTID をリーダーの次の位置として設定します。手動の `DUMP LOAD` 前からリーダーが停止していた場合は、読み込み後も停止したままです。
- 初期 `SYNC` は、MySQL では保守的な下限、MariaDB ではスナップショット自体の binlog 位置を使います。通常の引き継ぎでは、`SYNC` 前にドレインした GTID から共有リーダーを再開します。`2017` の復旧ではスナップショットマーカーから再開し、デコードできない区間を越えます

### 自動検証

- 起動時に GTID モードを確認します
- 設定されていない場合は、原因が分かるエラーメッセージを表示します

### 自動再接続

- 接続断と一時的な処理エラーが起きると、最後に適用した GTID から再試行します。失敗時は位置を進めません
- MySQL のデッドロック（`1213`）、クエリ中断（`1317`）、メタデータ取得中の接続断は再試行可能なエラーとして扱います
- 同じ GTID で処理に 3回連続して失敗すると停止します。一時的なメタデータ取得エラーは `SCHEMA_INCOMPATIBLE` にしません
- 組み込みの再試行スケジュールを使います。`reconnect_backoff_min_ms` と `reconnect_backoff_max_ms` は予約済みで適用されません

### マルチスレッド処理

- リクエストの処理にスレッドプールを使います
- パフォーマンスの調整用に、キューサイズを設定できます

## レプリケーションの監視

### レプリケーション状態を確認

認証済みの CLI 接続を 1 つ使います。

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

binlog レプリケーションを停止します。インデックスは読み取り専用になります。

```text
$ ./build/bin/mygram-cli
127.0.0.1:11016> AUTH <token>
OK AUTHENTICATED
127.0.0.1:11016> REPLICATION STOP
```

### レプリケーションを開始

binlog レプリケーションを再開します。

```text
$ ./build/bin/mygram-cli
127.0.0.1:11016> AUTH <token>
OK AUTHENTICATED
127.0.0.1:11016> REPLICATION START
```

## トラブルシューティング

### "GTID mode is not enabled on MySQL server"

**解決策**: MySQL サーバーで GTID モードを有効にします。

```sql
SET GLOBAL enforce_gtid_consistency = ON;
SET GLOBAL gtid_mode = OFF_PERMISSIVE;
SET GLOBAL gtid_mode = ON_PERMISSIVE;
SET GLOBAL gtid_mode = ON;
```

その後、MygramDB を再起動します。

### "Binary log format is not ROW"

**解決策**: binlog 形式を ROW に設定します。

```sql
SET GLOBAL binlog_format = ROW;
```

または `my.cnf` に追加して MySQL を再起動します。

```ini
[mysqld]
binlog_format = ROW
```

### "Replication lag is high"

**考えられる原因:**
- MySQL の書き込み量が多い
- MygramDB のリソースが足りない
- ネットワークのレイテンシが大きい

**解決策:**
- 設定の `replication.queue_size` を増やす
- MygramDB レプリカを追加するか、上流の書き込み負荷を下げる。`build.parallelism` は予約済みで、現在は適用されません

`replication_seconds_since_last_applied` は、MySQL の書き込み状況とリーダーの状態を合わせて確認してください。この値は適用済み GTID が進んだときに更新されるため、大きい値は「最近イベントを適用していない」ことを示します。ソースがアイドル状態のときは、この値だけでリーダーが遅れているとは断定できません。レプリケーションを利用できないとき、`/health/ready` は `503` を返します。`INFO` でも、同じ全体の readiness と `data_initialized` を確認できます。

### "Lost connection to MySQL server during query"

接続断や再試行可能なソースクエリエラーが起きると、最後に適用した GTID からイベントを再処理します。デッドロック（`1213`）、クエリ中断（`1317`）、スキーマメタデータ取得中の接続断も対象です。一時的なメタデータ取得エラーは、スキーマ非互換として扱いません。同じ GTID で処理に 3 回連続して失敗するとレプリケーションが停止します。その場合は、報告されたエラーの原因を取り除いてから復旧してください。次のバックオフ項目は、将来の互換性のために受け付けますが、現在は適用されません。

```yaml
replication:
  reconnect_backoff_min_ms: 500
  reconnect_backoff_max_ms: 10000
```

### "Schema mismatch after ALTER TABLE"

**解決策**: スキーマ変更後にスナップショットを再構築します。

1. MygramDB を停止
2. 新しいスキーマに合わせて設定ファイルを更新
3. MygramDB を再起動
4. `SYNC` を実行して、対象テーブルを再構築

### デコードできない binlog イベントから復旧する

レプリケーションがエラーコード `2017` で停止した場合、ストリームにこのビルドではデコードできないイベントがあります。主な原因は次のとおりです。

- 監視対象テーブルの TABLE_MAP メタデータが欠落または不正
- サイズを計算できない TABLE_MAP のカラム型
- 不正な GTID イベント（トランザクション番号が 0 など）
- XA prepare イベント
- MySQL の `TRANSACTION_PAYLOAD_EVENT` または `PARTIAL_UPDATE_ROWS_EVENT`
- `log_bin_compress` で圧縮された MariaDB のイベント（イベント単位の MariaDB 圧縮は未対応）

イベントを生成したサーバー設定を変えても、すでに書き込まれたイベントは binlog から消えません。古い GTID から再開すると、同じ位置で再び停止します。

これは、通常の row イベント内にある MariaDB の `COMPRESSED` `VARCHAR`/`TEXT` カラムとは別の問題です。MygramDB はこのカラムをインデックス化する前に展開します。ペイロードが不正、未知、または破損している場合は、row のデコード失敗としてエラー `2008` になり、通常の再接続処理に進みます。`2017` の復旧手順の対象ではありません。

まず、最も重要なテーブルに `SYNC` を実行し、`replication=STARTED` が表示されて完了するまで待ちます。その後、ほかのレプリケーション対象テーブルすべてにも `SYNC` を実行してください。最初の `SYNC` は、新しいスナップショットマーカーから共有リーダーを再開し、デコードできない区間を飛ばします。再構築しなかったテーブルには、その区間の書き込みが反映されません。

`2017` 以外のレプリケーション失敗では、`SYNC` は区間を飛ばさず、ドレイン済みの位置から再開します。コマンドの手順は [SYNC コマンド](/ja/docs/sync-command#%E3%82%A8%E3%83%A9%E3%83%BC-2017-%E3%83%86%E3%82%99%E3%82%B3%E3%83%BC%E3%83%88%E3%82%99%E3%81%A6%E3%82%99%E3%81%8D%E3%81%AA%E3%81%84-binlog-%E3%82%A4%E3%83%98%E3%82%99%E3%83%B3%E3%83%88) を参照してください。

MySQL は、致命的な binlog ダンプの失敗をエラー `1236` で報告します。必要な GTID がパージされたとソースのメッセージに書かれている場合だけ、利用できない位置として扱い、`SYNC` による復旧を案内します。ソースより先行しているレプリカ、過大なパケット、破損または切り詰められた binlog の場合は、ソースのメッセージを含む `2008` で停止します。MariaDB の `REPLICATION START` はパージ済みの位置を開始前に拒否します。

## 推奨事項

1. **GTID モードを使う**: スナップショットと binlog の位置を揃えるためです
2. **初期セットアップには `snapshot` 開始モードを使う**
3. **レプリケーション遅延を定期的に監視する**
4. **重要なスキーマ変更の後はスナップショットを再構築する**
5. **本番環境にデプロイする前に設定をテストする**
6. **復旧用に `DUMP SAVE` または `SYNC` を使う**: GTID とデータを復旧可能な状態にします
7. **高可用性のために複数のレプリカを使う**

## 設定例

レプリケーションの設定例です。

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
  start_from: "snapshot"          # snapshot|latest|gtid=<position>
  queue_size: 10000
  reconnect_backoff_min_ms: 500   # 予約済み / 現在は未強制
  reconnect_backoff_max_ms: 10000 # 予約済み / 現在は未強制
```

## 関連項目

- [SYNC コマンドガイド](/ja/docs/sync-command) - 手動スナップショット同期
- [設定ガイド](/ja/docs/configuration) - 設定リファレンス
- [プロトコルリファレンス](/ja/docs/protocol) - REPLICATION コマンド
