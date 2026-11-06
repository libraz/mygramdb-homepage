---
title: MygramDB プロトコルリファレンス - TCP テキストコマンド
description: MygramDB の TCP プロトコル完全リファレンス。SEARCH、COUNT、GET、INFO、CONFIG、DUMP、FACET、REPLICATION、SYNC、OPTIMIZE、DEBUG コマンドの構文、レスポンス、例。
head:
  - - meta
    - name: keywords
      content: MygramDB プロトコル, TCP テキストプロトコル, SEARCH コマンド, COUNT, DUMP, REPLICATION, SYNC, OPTIMIZE, FACET, mygram-cli, コマンドリファレンス
---

# プロトコルリファレンス

MygramDB は、memcached に似たシンプルなテキストプロトコルを TCP 上で使います。

::: info SQL ではありません
このページの `SEARCH`、`COUNT`、`DUMP`、`REPLICATION` は MygramDB 独自の TCP コマンドです。SQL 風のキーワードを含みますが、MySQL に送る SQL ではありません。アプリケーションから JSON で呼びたい場合は [HTTP API](/ja/docs/http-api) を使ってください。
:::

## 接続

TCP で MygramDB に接続します。

```bash
telnet localhost 11016
```

CLI クライアントを使うこともできます。

```bash
./build/bin/mygram-cli -h localhost -p 11016
```

`api.admin_token` が設定されている場合は、管理コマンドを送る前に TCP 接続ごとに一度認証します。空の場合は `AUTH` は不要ですが、ループバック以外から到達できる本番デプロイではトークンを設定してください。

```mygram
AUTH <token>
OK AUTHENTICATED
```

認証状態はその接続だけに保持されます。無効なトークンは `ERROR 7 Authentication failed` を返し、それまでの認証状態も解除します。トークンはログに残りません。

## コマンドフォーマット

::: tip TCP と HTTP の使い分け
TCP プロトコルは `mygram-cli` や管理コマンドに向いています。Web アプリケーションやブラウザ連携では、JSON を返し CORS にも対応できる HTTP API の方が実装しやすいことが多いです。
:::

コマンドはテキストベースで、1行に 1 コマンドです。レスポンスは改行で終了します。

接続のドレインタスクを登録するときにスレッドプールのキューが満杯だと、サーバーはその接続で通常のレスポンスを返さなくなり、すでにキューに入っているレスポンスだけを送ります。その後、最後に `ERROR 6030 SERVER_BUSY Server is too busy, please try again later` を送って接続を閉じます。保留フレーム数や共有バッファの上限に達した場合も、切断前にベストエフォートで `ERROR 6030` を返すことがあります。

`SEARCH`、`COUNT`、`GET`、`FACET` は認証不要です。管理トークンを設定している場合、設定コマンド、`SET` / `SHOW VARIABLES`、`DUMP`、`REPLICATION`、`SYNC`、`OPTIMIZE`、`DEBUG`、`CACHE` には `AUTH` が必要です。認証前の管理コマンドは `ERROR 7 Administrative command requires AUTH` を返します。

テーブルは `database.table` の形式で指定できます。たとえば `app_db` データベースの `articles` テーブルは `app_db.articles` です。設定にデータベースが 1つしかない場合は、修飾なしのテーブル名も使えます。`SEARCH articles hello` は、その唯一のデータベースのテーブルとして解決されます。設定が 2つ以上のデータベースにまたがる場合は修飾が必須で、修飾なしの名前は曖昧なため拒否されます。

---

## SEARCH コマンド

指定されたテキストを含むドキュメントを検索します。

### 構文

```mygram
SEARCH <db.table> <text> [OPTIONS]
```

### 基本例

シンプルな検索:
```mygram
SEARCH app_db.articles hello
```

フィルタとページネーション付き:
```mygram
SEARCH app_db.articles tech FILTER status = 1 LIMIT 10
```

### レスポンス

```mygram
OK RESULTS <total_count> <id1> <id2> <id3> ...
```

::: info レスポンスの読み方
`total_count` はページネーション前のマッチ総数で、その後ろに現在のページの主キーが続きます。`GET` が返すのは主キーと設定済みのフィルタ値で、元のドキュメント本文やスニペットは含みません。スニペットが必要な場合は、`SEARCH` に `HIGHLIGHT` を指定するか、HTTP 検索 API で `highlight` を指定してください。
:::

**詳細なクエリ構文、Boolean 演算子、フィルタ、ソート、高度な機能については、[クエリ構文ガイド](/ja/docs/query-syntax)を参照してください。**

---

## COUNT コマンド

検索条件に一致するドキュメント数をカウントします（ID は返しません）。

### 構文

```mygram
COUNT <db.table> <text> [OPTIONS]
```

### 例

```mygram
COUNT app_db.articles tech AND AI FILTER status = 1
```

### レスポンス

```mygram
OK COUNT <number>
```

**完全なクエリ構文については、[クエリ構文ガイド](/ja/docs/query-syntax)を参照してください。**

---

## GET コマンド

主キーでドキュメントを取得します。

### 構文

```mygram
GET <db.table> <primary_key>
```

### 例

```mygram
GET app_db.articles 12345
```

### レスポンス

```mygram
OK DOC <primary_key> <filter1=value1> <filter2=value2> ...
```

例:
```mygram
OK DOC 12345 status=1 category=tech created_at=1705314600
```

見つからない場合:
```mygram
ERROR 4004 Document not found
```

---

## INFO コマンド

サーバー情報と統計をまとめて取得します（Redis 形式）。

### 構文

```mygram
INFO
```

### レスポンス

Redis 形式のキーと値を、複数のセクションに分けて返します。この例には、`api.admin_token` を設定した場合に `AUTH` 後だけ表示されるレプリケーションセクションも含まれています。認証前は `# Replication` セクション全体が省かれます。

```mygram
OK INFO

# Server
version: 1.12.0
uptime_seconds: 3600
data_initialized: true
readiness: ready

# Stats
total_commands_processed: 10000
total_connections_received: 150
total_requests: 10000

# Commandstats
cmd_search: 8500
cmd_count: 1000
cmd_get: 500

# Memory
used_memory_bytes: 524288000
used_memory_human: 500.00 MB
used_memory_peak_bytes: 629145600
used_memory_peak_human: 600.00 MB
used_memory_index: 400.00 MB
used_memory_documents: 100.00 MB
memory_fragmentation_ratio: 1.20
total_system_memory: 16.00 GB
available_system_memory: 8.50 GB
system_memory_usage_ratio: 0.47
process_rss: 520.00 MB
process_rss_peak: 600.00 MB
memory_health: HEALTHY

# Index
total_documents: 1000000
total_terms: 1500000
total_postings: 5000000
avg_postings_per_term: 3.33
delta_encoded_lists: 1200000
roaring_bitmap_lists: 300000
optimization_status: idle

# Tables
tables: products, users, articles

# Clients
connected_clients: 5

# Replication
replication_inserts_applied: 50000
replication_updates_applied: 10000
replication_deletes_applied: 5000
```

### メモリヘルスステータス

| ステータス | システムメモリの空き | 備考 |
|-----------|--------------------|------|
| `HEALTHY` | 20% を超える | |
| `WARNING` | 10-20% | |
| `CRITICAL` | 10% 未満 | `OPTIMIZE` は拒否されます |
| `UNKNOWN` | 判定できない | |

---

## CONFIG コマンド

CONFIG コマンド群は、設定のヘルプ表示、現在値の確認、設定ファイルの検証を行います。

::: info CONFIG は確認用
`CONFIG SHOW` と `CONFIG VERIFY` は、設定の確認と検証だけを行います。稼働中のサーバーで値を変更するには `SET` / `SHOW VARIABLES` を使います。変更できるのは、変更可能なランタイム変数に限られます。
:::

### CONFIG HELP [path]

設定オプションのヘルプを表示します。

**構文:**
```mygram
CONFIG HELP [path]
```

**パラメータ:**
- `path` (オプション): ドット区切りの設定パス（例: `mysql.port`）

**例:**

トップレベルの設定セクションを一覧表示します。
```mygram
CONFIG HELP
```

レスポンス（セクションは名前順に並びます。ここでは `mysql` の説明を省略しています）:
```mygram
+OK
Available configuration sections:
  api          - API server configuration
  bm25         - BM25 relevance scoring configuration
  build        - Index build configuration
  cache        - Query cache configuration
  dump         - Dump persistence configuration
  index        - Legacy global index configuration (deprecated; prefer per-table ngram_size)
  logging      - Logging configuration
  memory       - Memory management configuration
  mysql        - MySQL connection settings. Values can be overridden via environment variables: ...
  network      - Network security configuration
  replication  - Replication configuration
  server       - Legacy server configuration (deprecated, use api.tcp instead)
  tables       - Table configuration (supports multiple tables)

Use "CONFIG HELP <section>" for detailed information.
```

セクションのヘルプを表示します。
```mygram
CONFIG HELP mysql
```

レスポンス:
```mygram
+OK
mysql

Type: object
Description: MySQL connection settings. Values can be overridden via environment variables: MYGRAM_MYSQL_USER, MYGRAM_MYSQL_PASSWORD, MYGRAM_MYSQL_HOST, MYGRAM_MYSQL_PORT, MYGRAM_MYSQL_DATABASE (env vars take precedence over config file values)
```

セクションに対しては型と説明だけが表示されます。デフォルト値と範囲を知りたい場合は、プロパティのパスを指定します。
```mygram
CONFIG HELP mysql.port
```

レスポンス:
```mygram
+OK
mysql.port

Type: integer
Default: 3306
Range: 1 - 65535
Description: MySQL server port
```

出力は設定スキーマから生成されるため、常に英語です。存在しないパスを指定すると `ERROR 8 Configuration path not found: <path>` が返ります。

---

### CONFIG SHOW [path]

現在の設定値を表示します。機密フィールド（パスワード、シークレット）は `***` でマスクされます。

**構文:**
```mygram
CONFIG SHOW [path]
```

**パラメータ:**
- `path` (オプション): 特定セクションのみを表示するドット区切りの設定パス

**例:**

現在の設定全体を表示:
```mygram
CONFIG SHOW
```

レスポンス:
```mygram
+OK
mysql:
  host: "127.0.0.1"
  port: 3306
  user: "repl_user"
  password: "***"
  database: "mydb"
  use_gtid: true
  ...

tables:
  - name: "articles"
    primary_key: "id"
    ...

replication:
  enable: true
  server_id: 12345
  ...
```

特定セクションを表示:
```mygram
CONFIG SHOW mysql
```

特定プロパティを表示:
```mygram
CONFIG SHOW mysql.port
```

レスポンス:
```mygram
+OK
3306
```

---

### CONFIG VERIFY `<filepath>`

設定ファイルをロードせずに検証します。

**構文:**
```mygram
CONFIG VERIFY <filepath>
```

**パラメータ:**
- `filepath` (必須): `.yaml` または `.yml` の設定ファイルのパス。使用中の設定ファイルがあるディレクトリからの相対パスで指定します

サーバーは、絶対パス、`..` を含むパス、シンボリックリンク、ほかの拡張子のファイルを拒否します。そのため `CONFIG VERIFY` で検証できるのは、使用中の設定ファイルと同じ場所に置いた候補ファイルだけです。

**例:**

有効なファイルを検証します。
```mygram
CONFIG VERIFY candidate.yaml
```

レスポンス（成功）。サマリーには MySQL のホストとポートだけが表示され、ユーザー名とパスワードは出力されません:
```mygram
+OK
Configuration is valid
  Tables: 2 (articles, products)
  MySQL: 127.0.0.1:3306
```

無効なファイルを検証します。
```mygram
CONFIG VERIFY invalid.yaml
```

レスポンス（エラー）。ほかのエラーと同じく 1行の `ERROR <code>` 応答で、検証メッセージ中の改行は空白に置き換えられます:
```mygram
ERROR 1002 Configuration validation failed:   <validation message>
```

---

## DUMP コマンド

DUMP コマンド群は、整合性検証つきでスナップショット（ダンプファイル）を管理します。

::: warning DUMP LOAD は現在のデータを置き換える
`DUMP SAVE` は保存、`DUMP VERIFY` は検証、`DUMP INFO` は情報表示だけを行います。`DUMP LOAD` だけは、現在のインデックスとドキュメントストアをダンプの内容で置き換えます。実行前に対象ファイルと GTID を確認してください。
:::

### DUMP SAVE

スナップショット全体を 1つのバイナリファイル（`.dmp`）に保存します。コマンドは**非同期**で実行され、すぐにレスポンスを返します。

**構文:**
```mygram
DUMP SAVE [<filepath>]
```

**レスポンス:**
```mygram
OK DUMP_STARTED <filepath>
```

**例:**
```mygram
DUMP SAVE mygramdb.dmp
```

保存先のファイル名は `dump.dir` の下に解決され、このディレクトリの外のパスは拒否されます。進捗と完了は `DUMP STATUS` で確認できます。

`mygram-cli` は、最後の空でないトークンをファイルパスとして扱い、サーバーと同じエスケープ規則で解釈します。空白を含むパスは引用符で囲んでください。`-` で始まるトークンはそのままサーバーへ送られ、未知の `DUMP SAVE` フラグとして拒否されます。`--with-stats` も文法に含まれず、同じく未知のフラグとして拒否されます。

設定済みの全テーブルが初回ロードを完了するまで、`DUMP SAVE` は `ERROR 6029` を返します。MySQL 対応ビルドで binlog リーダーを使う場合は、GTID 位置が確定するまで同じエラーを返します。先に `SYNC` を実行して GTID 位置を確立してください。

### DUMP LOAD

バイナリファイルからスナップショットを読み込みます。

::: warning 現在の検索状態を置き換える
`DUMP LOAD` は現在のインデックスとドキュメントストアを置き換えます。実行前に `DUMP VERIFY` と `DUMP INFO` で、ファイル破損、GTID、テーブル識別子を確認してください。
:::

**構文:**
```mygram
DUMP LOAD <filepath>
```

**例:**
```mygram
DUMP LOAD mygramdb.dmp
```

### DUMP VERIFY

データを読み込まずにスナップショットファイルの整合性を検証します。

**構文:**
```mygram
DUMP VERIFY <filepath>
```

**例:**
```mygram
DUMP VERIFY mygramdb.dmp
```

### DUMP INFO

スナップショットファイルのメタデータ（バージョン、GTID、テーブル数、サイズ、フラグ）を表示します。

**構文:**
```mygram
DUMP INFO <filepath>
```

**例:**
```mygram
DUMP INFO mygramdb.dmp
```

### DUMP STATUS

非同期ダンプ操作（DUMP SAVE）の進捗を監視します。

**構文:**
```mygram
DUMP STATUS
```

**レスポンス:**
```mygram
OK DUMP_STATUS
save_in_progress: <true|false>
load_in_progress: <true|false>
replication_paused_for_dump: <true|false>
status: <IDLE|SAVING|LOADING|COMPLETED|FAILED>
filepath: <path>
tables_processed: <count>
tables_total: <count>
current_table: <table_name>
elapsed_seconds: <seconds>
result_filepath: <path>        (COMPLETED時)
error: <message>               (FAILED時)
END
```

**ステータス値:**

| 値 | 意味 |
|----|------|
| `IDLE` | 実行中のダンプ操作なし |
| `SAVING` | `DUMP SAVE` を実行中 |
| `LOADING` | `DUMP LOAD` を実行中 |
| `COMPLETED` | 直近のダンプ操作が正常に完了 |
| `FAILED` | 直近のダンプ操作が失敗 |

**例（保存中）:**
```mygram
OK DUMP_STATUS
save_in_progress: true
load_in_progress: false
replication_paused_for_dump: true
status: SAVING
filepath: /backup/mygramdb.dmp
tables_processed: 2
tables_total: 5
current_table: users
elapsed_seconds: 3.45
END
```

**スナップショットの管理、整合性保護、推奨運用、トラブルシューティングの詳細は、[スナップショットガイド](/ja/docs/snapshot)を参照してください。**

---

## FACET コマンド

フィルタカラムの値ごとに、ドキュメント数を集計します。

### 構文

```mygram
FACET <table> <column> [search_text] [AND <term>] [NOT <term>] [FILTER <col> <op> <value>] [LIMIT <n>] [OFFSET <n>]
```

### 例

status カラムの全値:
```mygram
FACET articles status
```

検索結果に限定した値:
```mygram
FACET articles category "機械学習" FILTER status = 1 LIMIT 10
```

`OFFSET` は、カウント順に並べたファセットバケットを先頭からスキップします。デフォルトは `0` です。

### レスポンス

```mygram
OK FACET <returned_value_count> <total_distinct_values>
<value1>	<count1>
<value2>	<count2>
...

```

値の行はタブ区切りで、カウントの降順に並びます。レスポンスは空行で終わります（ワイヤ上では `\r\n\r\n`）。接続のデバッグモードが有効な場合は、値の行と空行の間に `# query_time_ms`、`# matched_documents`、`# distinct_values` の行が入ります。

`OK FACET` ヘッダーの `returned_value_count` はこのレスポンスに含まれる行数、`total_distinct_values` は `LIMIT` と `OFFSET` を適用する前の、異なる値の総数です。

---

## REPLICATION STATUS

現在のレプリケーションステータスを取得します。

### 構文

```mygram
REPLICATION STATUS
```

### レスポンス

複数行のキーと値の形式で返します。

```mygram
OK REPLICATION
status: <running|stopped|failed|not_configured>
current_gtid: <current_gtid>
processed_events: <count>
queue_size: <size>
crc_errors: <count>
schema_incompatible: <true|false>
last_error_code: <code>
last_error: <message>
last_applied_unixtime: <unix_timestamp>
seconds_since_last_applied: <seconds>
END
```

| フィールド | 説明 |
|-----------|------|
| `status` | レプリケーションの状態（値は下表） |
| `current_gtid` | 最後に処理した GTID 位置 |
| `processed_events` | 処理した binlog イベントの総数 |
| `queue_size` | キューで待機中のイベント数。binlog リーダーが設定されていれば、`stopped` や `failed` を含むすべての状態で返されます |
| `crc_errors` | 検出した binlog イベントの CRC エラー総数 |
| `schema_incompatible` | 監視対象のスキーマが互換性を失ってレプリケーションが停止した場合に `true` |
| `last_error_code` | 直近のレプリケーションエラーの数値コード。エラーがなければ `0` |
| `last_error` | 直近のレプリケーションエラーのメッセージ。エラーがなければ空 |
| `last_applied_unixtime` | 最後に正常適用した位置の Unix 時刻。不明な場合は `0` |
| `seconds_since_last_applied` | 最後に正常適用した位置からの経過秒数。不明な場合は `-1` |

`status` は次のいずれかです。binlog リーダーが設定されていない場合は `not_configured`、設定されている場合は残りの 3つのいずれかを返します。

| 値 | 意味 |
|----|------|
| `running` | MySQL からレプリケーション中 |
| `stopped` | レプリケーションを手動で停止中 |
| `failed` | エラーによりレプリケーションが停止 |
| `not_configured` | MySQL レプリケーションが未設定 |

例（実行中）:
```mygram
OK REPLICATION
status: running
current_gtid: 3E11FA47-71CA-11E1-9E33-C80AA9429562:1-100
processed_events: 5000
queue_size: 0
crc_errors: 0
schema_incompatible: false
last_error_code: 0
last_error:
last_applied_unixtime: 1710000000
seconds_since_last_applied: 2
END
```

例（停止中）:
```mygram
OK REPLICATION
status: stopped
current_gtid: 3E11FA47-71CA-11E1-9E33-C80AA9429562:1-100
processed_events: 5000
queue_size: 0
crc_errors: 0
schema_incompatible: false
last_error_code: 0
last_error:
last_applied_unixtime: 1710000000
seconds_since_last_applied: 120
END
```

---

## REPLICATION STOP

binlog レプリケーションを停止します（インデックスは読み取り専用になります）。

::: warning 停止中は MySQL の変更を追従しない
`REPLICATION STOP` 中も検索はできますが、MySQL 側の新しい変更は反映されません。メンテナンス後は `REPLICATION START` で再開し、`REPLICATION STATUS` で確認してください。
:::

### 構文

```mygram
REPLICATION STOP
```

### レスポンス

```mygram
OK REPLICATION_STOPPED
```

---

## REPLICATION START

binlog レプリケーションを再開します。

### 構文

```mygram
REPLICATION START
```

### レスポンス

```mygram
OK REPLICATION_STARTED
```

---

## SYNC コマンド

指定したテーブルを MySQL から読み直して再構築する、スナップショット同期を手動で開始します。

### 構文

```mygram
SYNC <table_name>
```

### パラメータ

- **table_name**: 同期するテーブル名（設定ファイルに登録済みである必要があります）

### レスポンス（成功）

```mygram
OK SYNC STARTED table=<table_name>
```

### レスポンス（エラー）

```mygram
ERROR 4011 SYNC already in progress for '<name>'
ERROR 4012 Memory critically low. Cannot start SYNC.
ERROR 4010 Table '<name>' not found
```

### 動作

- バックグラウンドで非同期に実行されます
- 開始後すぐにレスポンスを返します
- MySQL の SELECT でスナップショットを構築します
- MySQL では保守的な GTID 下限をスナップショット取得（`START TRANSACTION WITH CONSISTENT SNAPSHOT`）の前に記録し、MariaDB ではスナップショット自体の正確な binlog 位置を GTID に変換して記録します
- MySQL では、GTID の記録からスナップショットトランザクションの開始までにコミットされた変更が、レプリケーションで再適用されることがあります。これは意図した at-least-once 処理で、冪等に適用されます
- 完了時は、レプリケーションをドレインしたうえで、通常は SYNC 前にドレインした GTID から再開します。そのため他テーブルのコミットは飛ばされません。`2017` からの復旧時だけは、スナップショットマーカー（MySQL の下限 GTID、または MariaDB の正確なスナップショット位置を変換した GTID）から再開します

同期中は、対象テーブルへの `SEARCH`、`COUNT`、`GET`、`FACET` が `Table '<name>' is synchronizing, please try again later` で拒否されます。進捗と失敗理由は `SYNC STATUS` で確認してください。

### SYNC のキャンセル

```mygram
SYNC STOP [<table_name>]
```

指定したテーブルの同期を停止します。テーブル名を省略すると、実行中のすべての同期にキャンセルを要求します。キャンセルは非同期なので、`SYNC STATUS` が `CANCELLED` などの終端状態になるまで確認してください。

### 競合

| コマンド | SYNC 中の扱い | 理由 |
|---------|--------------|------|
| `DUMP LOAD` | 拒否 | データ破損を防ぐ |
| `REPLICATION START` | 拒否 | SYNC がレプリケーションを自動で開始する |
| `SYNC` | 別の長時間メンテナンス処理の実行中は拒否 | |

### 例

```text
$ mygram-cli
127.0.0.1:11016> AUTH <token>
OK AUTHENTICATED
127.0.0.1:11016> SYNC articles
OK SYNC STARTED table=articles
```

---

## SYNC STATUS

SYNC の進捗と状態を確認します。

### 構文

```mygram
SYNC STATUS
```

### 応答例

`SYNC STATUS` のレスポンスは複数行です。サーバーは状態行を `OK SYNC_STATUS` と `END` で囲んで返し、`mygram-cli` は表示するときにこの 2行を取り除きます。以下はサーバーが返すレスポンスそのままの例です。

**実行中:**
```mygram
OK SYNC_STATUS
table=articles status=IN_PROGRESS progress=10000/25000 rows (40.0%) rate=5000 rows/s
END
```

**前のワーカーの終了待ち:**
```mygram
OK SYNC_STATUS
table=articles status=JOINING_PREVIOUS
END
```

**開始処理中:**
```mygram
OK SYNC_STATUS
table=articles status=STARTING
END
```

**キャンセル要求中:**
```mygram
OK SYNC_STATUS
table=articles status=CANCELLING
END
```

**完了:**
```mygram
OK SYNC_STATUS
table=articles status=COMPLETED rows=25000 time=5.2s gtid=uuid:123 replication=STARTED
END
```

**失敗:**
```mygram
OK SYNC_STATUS
table=articles status=FAILED rows=5000 error="MySQL connection lost"
END
```

**アイドル:**
```mygram
OK SYNC_STATUS
status=IDLE message="No sync operation performed"
END
```

### ステータスフィールド

| フィールド | 説明 |
|-----------|------|
| `table` | 同期対象テーブル名 |
| `status` | `JOINING_PREVIOUS`、`STARTING`、`IN_PROGRESS`、`COMPLETED`、`FAILED`、`CANCELLING`、`CANCELLED`、`IDLE` |
| `progress` | 処理済み行数 / 総行数 |
| `rate` | 処理速度（行/秒） |
| `rows` | 処理した行の総数 |
| `time` | 処理時間の合計 |
| `gtid` | スナップショットマーカー。MySQL では保守的な下限 GTID、MariaDB ではスナップショットの正確な binlog 位置を変換した GTID です。通常の再開には SYNC 前にドレインした GTID を使い、デコード不能イベント（`2017`）の回復時はこのマーカーから再開することがあります |
| `replication` | レプリケーション状態（`STARTED`、`DISABLED`、`FAILED`） |
| `error` | 失敗時のエラーメッセージ |

`JOINING_PREVIOUS` は、対象テーブルの前のワーカーが終了するのを待っている間だけ現れる一時状態です。新しいワーカーを確保すると `STARTING` に変わります。`CANCELLING` は、`SYNC STOP` でキャンセルが要求されたことを示します。これらの一時状態には進捗の詳細が付きません。

### CLI の例

CLI は、`OK SYNC_STATUS` と `END` の 2行を取り除いてから状態を表示します。

```text
$ mygram-cli
127.0.0.1:11016> AUTH <token>
OK AUTHENTICATED
127.0.0.1:11016> SYNC STATUS
table=articles status=IN_PROGRESS progress=10000/25000 rows (40.0%) rate=5000 rows/s
```

### 関連項目

- [SYNC コマンドガイド](/ja/docs/sync-command) - 詳しい使い方
- [レプリケーションガイド](/ja/docs/replication) - 手動でのスナップショット同期の設定

---

## OPTIMIZE コマンド

ポスティングリストを最適化します（密度に応じて、デルタエンコーディングを Roaring Bitmap に変換します）。

::: tip 実行タイミング
`OPTIMIZE` は検索を止めずに実行できますが、一時的に追加メモリを使います。大きなデータセットでは、低トラフィック時間帯に実行し、事前に `/info` や `INFO` でメモリヘルスを確認してください。
:::

### 構文

```mygram
OPTIMIZE [<db.table>]
```

テーブル名を省略すると設定済みの全テーブルを最適化します。1つのテーブルだけを対象にする場合はその名前を指定してください。複数のデータベースにまたがる構成では `database.table` 形式を使います。

### 動作

- **実行前チェック**: メモリヘルスと空きメモリを検証します
- ターム名のスナップショットを取得し、すべてのポスティングリストを新しい最適化済み領域に再構築します
- タームをバッチに分けて処理します。バッチごとの管理用メモリを抑え、定期的にアトミックな切り替えができますが、再構築全体で最も大きいメモリ使用量は減りません
- 置き換え用のリストを構築している間も、検索と書き込みは継続します
- バッチごとにアトミックに切り替わるため、binlog レプリケーションは止まりません

### メモリ安全性

**実行前メモリチェック:**
- システムのメモリヘルスが **CRITICAL**（空き 10% 未満）の場合は実行を拒否します
- 常駐中のインデックス、再構築用の完全なコピー、10% の一時オーバーヘッド、ターム名のスナップショット、バッチの管理用メモリから、ピーク使用量を推定します
- インデックスのメモリ量の概ね `2.1x` の空きが必要です。実際の推定値は、異なるタームの数とバッチの管理用メモリによっても増えます

**メモリ使用パターン:**
- 既存のインデックスを常駐させたまま、最適化済みの置き換えを丸ごと構築するため、ピーク使用量はインデックス 2個分に近づきます
- バッチサイズを変えてもピークメモリはほとんど減りません。バッチサイズが決めるのは、バッチごとの管理用メモリと、置き換えを切り替えるタイミングです

### 同時実行の制御

- 全テーブルを通じて、同時に実行できる `OPTIMIZE` は **1つだけ**です
- 最適化中に実行した `OPTIMIZE` は拒否されます
- `optimization_status` は `INFO` で確認できます

### パフォーマンス

実行時間はポスティングリストの数と大きさ、ホストの空きメモリに左右されます。再構築中も検索とレプリケーションは継続しますが、バッチの公開時には並行更新が短時間競合することがあります。定期実行を計画する前に、実データで所要時間を測定してください。

### レスポンス

**成功時:**
```mygram
OK OPTIMIZED tables=<n> terms=<n> delta=<n> roaring=<n> memory=<human>
```

例:
```mygram
OK OPTIMIZED tables=1 terms=1500000 delta=1200000 roaring=300000 memory=450.00 MB
```

**エラー:**

すでに最適化中の場合:
```mygram
ERROR 6030 Another OPTIMIZE operation is already in progress
```

メモリが危機的に低い場合:
```mygram
ERROR 6030 Memory critically low. Cannot start optimization: available=1.50 GB total=8.00 GB
```

メモリ不足の場合:
```mygram
ERROR 6030 Insufficient memory for optimization: Insufficient memory: estimated=2.50 GB available=1.80 GB
```

---

## DEBUG コマンド

現在の接続のデバッグモードを有効/無効にして、詳細なクエリ実行メトリクスを表示します。

::: info 接続ごとの設定
`DEBUG ON` は現在の TCP 接続にだけ効きます。別の `mygram-cli` セッションやアプリケーション接続には影響しません。
:::

### 構文

```mygram
DEBUG ON
DEBUG OFF
```

### 動作

- **接続ごとの状態**: デバッグモードの有効/無効は、現在の接続だけに作用します
- **クエリの所要時間**: 実行時間の内訳（インデックス検索、フィルタ処理）を表示します
- **検索の詳細**: 生成した n-gram、ポスティングリストのサイズ、候補数を表示します
- **最適化戦略**: 適用した最適化戦略を表示します
- **性能への影響**: オーバーヘッドは小さく、メトリクスを収集するのは有効なときだけです

### レスポンス

```mygram
OK DEBUG_ON
```

または

```mygram
OK DEBUG_OFF
```

### デバッグ出力フォーマット

デバッグモードが有効だと、`SEARCH` はレスポンスの後ろにデバッグ情報を追加します。角括弧の行は、該当する場合だけ出力されます。

```mygram
OK RESULTS <count> <id1> <id2> ...

# DEBUG
query_time: <ms>ms
index_time: <ms>ms
[filter_time: <ms>ms]
terms: <n>
ngrams: <n>
candidates: <n>
after_intersection: <n>
after_not: <n>
after_filters: <n>
final: <n>
[optimization: <strategy>]
[sort: <column> <direction>]
limit: <value> [(default)]
[offset: <value> [(default)]]
cache: hit | miss | disabled
[cache_age_ms: <ms>]
[cache_saved_ms: <ms>]
[cache_reason: not_found | invalidated]
[cache_cost_ms: <ms>]
[cache_key: <canonical-key>]
```

`COUNT` が返すのは短いブロックで、時間の行、`terms`、`ngrams`、キャッシュの行だけです。候補数の行、`final`、`optimization`、`sort`、`limit`、`offset` は `SEARCH` だけに出力されます。

```mygram
OK COUNT <n>

# DEBUG
query_time: <ms>ms
index_time: <ms>ms
terms: <n>
ngrams: <n>
cache: hit | miss | disabled
...
```

### デバッグメトリクスの説明

| フィールド | 説明 |
|-----------|------|
| `query_time` | クエリ全体の実行時間（`ms` 付き） |
| `index_time` | インデックス検索にかかった時間（`ms` 付き） |
| `filter_time` | フィルタの適用にかかった時間。0 より大きいときだけ出力 |
| `terms` | 検索語の数 |
| `ngrams` | 検索語から生成した N-gram の総数 |
| `candidates` | インデックスから得た初期候補ドキュメント数 |
| `after_intersection` | AND 検索語で絞り込んだ後の件数 |
| `after_not` | NOT 検索語で除外した後の件数 |
| `after_filters` | FILTER 条件を適用した後の件数 |
| `final` | 一致したドキュメントの総数（LIMIT/OFFSET の適用前） |
| `optimization` | 使われた戦略（例: `merge_join`、`early_exit`）。使われた場合だけ出力 |
| `sort` | 適用したソート（カラムと方向）。ソートした場合だけ出力 |
| `limit` | 返す結果の最大数。明示的に指定していない場合は `(default)` と表示 |
| `offset` | ページネーションのオフセット。0 より大きいときだけ出力 |
| `cache` | `hit`、`miss`、`disabled` のいずれか |
| `cache_age_ms`、`cache_saved_ms` | ヒット時のみ。キャッシュエントリの経過時間と、省けた実行時間 |
| `cache_reason`、`cache_cost_ms` | ミス時のみ。`not_found` または `invalidated` と、今回の実行コスト |
| `cache_key` | 正規化されたクエリキー（存在する場合） |

---

## CACHE コマンド

クエリキャッシュの状態確認と制御を行います。`cache` の設定項目そのものは[設定ガイド](/ja/docs/configuration#クエリキャッシュ)を参照してください。

### 構文

```mygram
CACHE STATS
CACHE CLEAR [<db.table>]
CACHE ENABLE
CACHE DISABLE
```

`CACHE CLEAR` はテーブル名を省略すると全エントリを、テーブル名を指定するとそのテーブルのエントリだけを破棄します。

### レスポンス

```mygram
OK CACHE_CLEARED
OK CACHE_CLEARED table=app_db.articles
OK CACHE_ENABLED
OK CACHE_DISABLED
```

`CACHE STATS` は `END` で終わる複数行のレポートを返します。

```mygram
OK CACHE_STATS

# Cache
enabled: true
total_queries: 15000
cache_hits: 12000
cache_misses: 3000
hit_rate: 0.8000
current_entries: 420
current_memory_bytes: 8388608
evictions: 12
ttl_expirations: 5
avg_cache_hit_time_ms: 0.041
avg_cache_miss_time_ms: 18.220
total_time_saved_ms: 218640.000
END
```

`CACHE STATS` は、キャッシュが無効でも現在のカウンターを返します。`CACHE CLEAR` のように有効なキャッシュを必要とする操作は、キャッシュが未設定だと `ERROR 8001`（`kCacheDisabled`）を返します。`CACHE ENABLE` は、無効化ワーカーを起動できない場合に `ERROR 8001 Cache cannot be enabled: the invalidation worker could not be started.` を返します。

`CACHE ENABLE` / `CACHE DISABLE` は稼働中の状態だけを変更します。`SET cache.enabled = ...` もプロセスのメモリだけを変更し、設定ファイルを書き換えません。再起動後も設定を残す場合は `config.yaml` を編集してください。

---

## SET / SHOW VARIABLES

MySQL 互換のランタイム変数コマンドです。変更できるのは mutable と表示された変数だけです。運用手順は[運用ガイド](/ja/docs/operations)を参照してください。

### 構文

```mygram
SET <variable> = <value> [, <variable2> = <value2> ...]
SHOW VARIABLES [LIKE '<pattern>']
```

`SET api.default_limit=50` のように、空白を入れない形式も使えます。カンマで区切った複数代入にも混在させられます。

`SHOW VARIABLES LIKE` に指定できるパターンは 1つだけで、大文字と小文字を区別せず照合します。

### レスポンス

```mygram
+OK Variable 'logging.level' set to 'debug'
+OK 2 variables set
```

`SHOW VARIABLES` は `Mutable` 列を持つ MySQL 形式のテーブルを返します。

```mygram
+---------------------+-----------+---------+
| Variable_name       | Value     | Mutable |
+---------------------+-----------+---------+
| api.default_limit   | 100       | YES     |
| cache.enabled       | true      | YES     |
| memory.verify_text  | off       | NO      |
+---------------------+-----------+---------+
```

`SET` は、起動時と同じ設定スキーマで各値を検証します。複数の代入は、すべて成功した場合だけ適用されます。無効な値があると、どの代入が失敗したかが `ERROR 1004` で示されます。`server_id` と `cache.max_memory_mb` の上限も起動時と同じです。

`SET cache.enabled = true` は、キャッシュを起動できない場合に `ERROR 8001 Failed to set variable 'cache.enabled': Cache cannot be enabled` で失敗します。`cache.min_query_cost_ms` には有限で 0 以上の値を指定します。`nan`、`inf`、`-inf` などは `ERROR 1004` で拒否されます。

`SHOW VARIABLES` で機密フィールドを返す場合、値は `***` にマスクされます。`mysql.password`、`mysql.ssl_key` のほか、名前に `password`、`secret`、`ssl_key`、`api_key`、`auth_key`、`private_key`、`access_key`、`token` を含むフィールドが対象です。空の値は空のままです。

---

## エラーレスポンス

新しいサーバーは、数値コードの後にメッセージを続ける形式でエラーを返します。

```mygram
ERROR <numeric-code> <message>
```

例:
```mygram
ERROR 7 Administrative command requires AUTH
ERROR 4007 Table not found: products
ERROR 3006 Invalid filter
```

古いサーバーとも通信するクライアントは、従来の `ERROR <message>` 形式も受け付けてください。ペイロードの先頭トークンが、0 以外の 10 進の符号なし 16 ビット整数として完全に読める場合だけ、それをコードとして扱います。それ以外は、ペイロード全体を従来形式のメッセージとして扱います。

---

## CLI クライアント機能

CLI クライアント（`mygram-cli`）は対話型シェルを備えています。

- **タブ補完**: TAB キーでコマンド名を補完します（GNU Readline が必要）
- **コマンド履歴**: ↑/↓ キーで履歴をたどれます（GNU Readline が必要）
- **行編集**: Ctrl+A、Ctrl+E などで行を編集できます（GNU Readline が必要）
- **エラー処理**: エラー時はメッセージを表示し、クラッシュしません
- **コマンド入力**: 入力したコマンドをそのまま送信します。SDK の引用規則で検索語やフィルタ値を自動的に引用することはありません。コマンドライン引数では、タブを空白に置き換え、それ以外の `0x20` 未満の制御文字を取り除きます。
- **完全な読み取り**: ハイライト結果、`DEBUG` 出力、`SHOW VARIABLES` を含む複数行レスポンスを、受信バッファが小さくても最後まで読み取ります。
- **IPv6**: IPv6 リテラル、または IPv6 に解決されるホスト名で接続できます。
- **検索結果**: 主キーごとに 1行を表示し、空白を含む引用済み主キーもデコードします。
- **DUMP SAVE のパス**: サーバーと同じエスケープ規則で最後の空でないトークンをパスとして扱います。空白を含むパスは引用符で囲んでください。`-` で始まるトークンはサーバーに渡し、未知のフラグとして拒否します。
- **ダンプのエラー**: `DUMP SAVE` が失敗すると、サーバーの数値エラーコードを表示します。`--wait-ready` を指定すると、サーバーがロード中または準備未完了の間はコマンドを再試行します。`INFO` が `readiness: not_ready` を返している間は、成功とは見なしません。

### 対話モード

```bash
./build/bin/mygram-cli
> SEARCH articles hello
OK RESULTS 5 1 2 3 4 5
> quit
```

### 単一コマンドモード

コマンドは位置引数として渡します。`-c` のようなフラグはありません。コマンドが空白やシェルのメタ文字を含む場合は、全体を引用符で囲んでください。

```bash
./build/bin/mygram-cli SEARCH articles "hello world"
```

`api.admin_token` を設定している場合、管理コマンドは認証済みの対話接続で実行します。

```text
$ ./build/bin/mygram-cli
127.0.0.1:11016> AUTH <token>
OK AUTHENTICATED
127.0.0.1:11016> SET logging.level = 'debug'
```

### コマンドラインオプション

| オプション | 説明 |
|-----------|------|
| `-h HOST` | サーバーのホスト名（デフォルト: `127.0.0.1`） |
| `-p PORT` | サーバーのポート（デフォルト: `11016`） |
| `-s SOCKET_PATH` | Unix ドメインソケットのパス。`-h`/`-p` より優先されます |
| `--timeout MS` | コマンドのタイムアウト（ミリ秒）。デフォルトは `30000`、`DUMP` や `OPTIMIZE` などの長い操作では `300000` |
| `--connect-timeout MS` | 接続のタイムアウト（ミリ秒）。デフォルトは `30000` |
| `--retry N` | 接続を拒否された場合に N 回リトライ（デフォルト: `0`） |
| `--retry-interval SEC` | リトライの間隔（秒）。デフォルトは `3`。`--wait-ready` のデフォルトは 100回 × 3 秒 |
| `--wait-ready` | 決められた回数の範囲で、サーバーの準備が完了するまで再試行（デフォルトは 100回、`--retry N` で上書き）。準備が完了しなければ非ゼロで終了 |
| `--version` | クライアントのバージョンを表示して終了 |
| `--help` | 使い方を表示して終了 |

### help コマンド

対話モードで `help` と入力すると、利用できるコマンドが表示されます。

```
> help
Commands are sent to the server verbatim; quote search text yourself where needed.

Available commands:
  SEARCH <db.table> <text> [(AND|OR|NOT) <term>...] [FILTER <col=val>...]
         [SORT [BY] <col>|ASC|DESC] [LIMIT <n>] [OFFSET <n>]
         [HIGHLIGHT [TAG <open> <close>] [SNIPPET_LEN <n>] [MAX_FRAGMENTS <n>]]
         [FUZZY [1|2]]
  COUNT <db.table> <text> [(AND|OR|NOT) <term>...] [FILTER <col=val>...]
  GET <db.table> <primary_key>
  INFO              - Show server statistics
  CONFIG            - Show current configuration
  SET <variable> = <value> [, ...]         - Change runtime variables
  SHOW VARIABLES [LIKE <pattern>]         - Show runtime variables
  FACET <db.table> <column> [text] [FILTER <col=val>...] [LIMIT <n>]
                    - Compute facet counts
  REPLICATION STATUS|STOP|START
  DEBUG ON|OFF      - Toggle per-connection debug output
  OPTIMIZE [db.table]  - Compact posting lists for one or all tables
  CACHE STATS|CLEAR|ENABLE|DISABLE
  DUMP SAVE|LOAD|VERIFY|INFO|STATUS
  SYNC <db.table>|STOP [db.table]|STATUS
  AUTH <token>      - Unlock administrative commands on this connection

Query syntax examples:
  SEARCH app.threads golang                          # Simple search
  SEARCH app.threads (golang OR python) AND tutorial # Boolean query
  SEARCH app.threads golang SORT DESC LIMIT 10       # With sorting
  SEARCH app.threads golang SORT BY created_at ASC   # Sort by column

Other commands:
  quit/exit - Exit the client
  help - Show this help
```

::: info
コマンドの末尾にセミコロンは付けません。パーサーは空白だけでトークンを分割するため、`SHOW VARIABLES;` は未知のサブコマンドとして拒否されます。
:::

---

## 参照

- [クエリ構文ガイド](/ja/docs/query-syntax) - 詳細な SEARCH/COUNT クエリ構文
- [スナップショットガイド](/ja/docs/snapshot) - スナップショット管理と推奨運用
- [設定ガイド](/ja/docs/configuration) - サーバー設定
- [レプリケーション設定](/ja/docs/replication) - MySQL レプリケーション設定
