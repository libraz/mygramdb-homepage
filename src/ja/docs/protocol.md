---
title: MygramDB プロトコルリファレンス - TCPテキストコマンド
description: MygramDBのTCPプロトコル完全リファレンス。SEARCH、COUNT、GET、INFO、CONFIG、DUMP、FACET、REPLICATION、SYNC、OPTIMIZE、DEBUGコマンドの構文、レスポンス、例。
head:
  - - meta
    - name: keywords
      content: MygramDB プロトコル, TCP テキストプロトコル, SEARCH コマンド, COUNT, DUMP, REPLICATION, SYNC, OPTIMIZE, FACET, mygram-cli, コマンドリファレンス
---

# プロトコルリファレンス

MygramDBは、TCP経由でシンプルなテキストベースのプロトコルを使用します（memcachedと同様）。

::: info SQLではありません
このページの `SEARCH`、`COUNT`、`DUMP`、`REPLICATION` はMygramDB独自のTCPコマンドです。SQL風のキーワードを含みますが、MySQLに送るSQLではありません。アプリケーションからJSONで呼びたい場合は[HTTP API](/ja/docs/http-api)を使ってください。
:::

## 接続

TCP経由でMygramDBに接続：

```bash
telnet localhost 11016
```

またはCLIクライアントを使用：

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

コマンドはテキストベースで、1行に1コマンドです。レスポンスは改行で終了します。

`SEARCH`、`COUNT`、`GET`、`FACET` は認証不要です。管理トークンを設定している場合、設定コマンド、`SET` / `SHOW VARIABLES`、`DUMP`、`REPLICATION`、`SYNC`、`OPTIMIZE`、`DEBUG`、`CACHE` には `AUTH` が必要です。認証前の管理コマンドは `ERROR 7 Administrative command requires AUTH` を返します。

テーブル参照は DB 修飾形式 `` `database.table` `` を受け付けます。たとえば `app_db` データベースの
`articles` テーブルは `app_db.articles` と指定します。単一データベース構成（設定されている個別の
データベースが1つだけ）の場合は、修飾なしのテーブル名も動作します。たとえば `SEARCH articles hello`
はその唯一のデータベースに解決されます。2つ以上のデータベースにまたがる構成の場合にのみ修飾が必要となり、
修飾なしの名前は曖昧として拒否されます。

::: tip TCPとHTTPの使い分け
TCPプロトコルは `mygram-cli` や管理コマンドに向いています。Webアプリケーションやブラウザ連携では、CORSやJSONレスポンスを扱えるHTTP APIの方が実装しやすいことが多いです。
:::

---

## SEARCH コマンド

指定されたテキストを含むドキュメントを検索します。

### 構文

```mygram
SEARCH <db.table> <text> [OPTIONS]
```

### 基本例

シンプルな検索：
```mygram
SEARCH app_db.articles hello
```

フィルタとページネーション付き：
```mygram
SEARCH app_db.articles tech FILTER status = 1 LIMIT 10
```

### レスポンス

```mygram
OK RESULTS <total_count> <id1> <id2> <id3> ...
```

::: info レスポンスの読み方
`total_count` は条件に一致した総件数で、その後ろに現在のページで返されたプライマリキーが続きます。本文やハイライトが必要な場合は、検索後に `GET` するかHTTP APIのレスポンス形式を検討してください。
:::

**詳細なクエリ構文、ブール演算子、フィルタ、ソート、高度な機能については、[クエリ構文ガイド](/ja/docs/query-syntax)を参照してください。**

---

## COUNT コマンド

検索条件に一致するドキュメント数をカウントします（IDは返しません）。

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

プライマリキーでドキュメントを取得します。

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

例：
```mygram
OK DOC 12345 status=1 category=tech created_at=2024-01-15T10:30:00
```

見つからない場合：
```mygram
ERROR 8 Document not found
```

---

## INFO コマンド

包括的なサーバー情報と統計を取得します（Redis形式）。

### 構文

```mygram
INFO
```

### レスポンス

Redis形式のキー・バリュー形式で複数のセクションを返します：

```mygram
OK INFO

# Server
version: 1.0.0
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

- **HEALTHY**: システムメモリの20%以上が利用可能
- **WARNING**: システムメモリの10-20%が利用可能
- **CRITICAL**: システムメモリの10%未満が利用可能（OPTIMIZEは拒否されます）
- **UNKNOWN**: ステータスを判定できない

---

## CONFIG コマンド

CONFIGコマンドファミリーは、実行時の設定ヘルプ、検査、検証を提供します。

::: info CONFIGは確認用
`CONFIG SHOW` や `CONFIG VERIFY` は設定の確認・検証用です。運用中に値を変更する場合は、変更可能なランタイム変数に限って `SET` / `SHOW VARIABLES` を使います。
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

すべてのトップレベル設定セクションを表示:
```mygram
CONFIG HELP
```

レスポンス:
```mygram
+OK
Available configuration sections:
  mysql        - MySQL接続設定
  tables       - テーブル設定（複数テーブル対応）
  build        - インデックスビルド設定
  replication  - レプリケーション設定
  memory       - メモリ管理
  dump         - ダンプ永続化（自動バックアップ）
  api          - APIサーバー設定
  network      - ネットワークセキュリティ（オプション）
  logging      - ログ設定
  cache        - クエリキャッシュ設定

詳細情報は "CONFIG HELP <section>" を使用してください。
```

特定セクションのヘルプを表示:
```mygram
CONFIG HELP mysql
```

レスポンス:
```mygram
+OK
mysql - MySQL接続設定

Properties:
  host (string, default: "127.0.0.1")
    MySQLサーバーのホスト名またはIP

  port (integer, default: 3306, range: 1-65535)
    MySQLサーバーのポート

  user (string, 必須)
    レプリケーション用のMySQLユーザー名

  password (string)
    MySQLユーザーのパスワード

  database (string, 必須)
    データベース名

  use_gtid (boolean, default: true)
    GTIDベースのレプリケーションを有効化

  ...
```

特定プロパティのヘルプを表示:
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
Description: MySQLサーバーのポート
```

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
- `filepath` (必須): 設定ファイルのパス（YAMLまたはJSON）

相対パスは、使用中の設定ファイルがあるディレクトリから解決します。サービスの作業ディレクトリと異なる可能性がある自動化では絶対パスを使ってください。

**例:**

有効な設定を検証:
```mygram
CONFIG VERIFY /etc/mygramdb/config.yaml
```

レスポンス（成功）:
```mygram
+OK
Configuration is valid
  Tables: 2 (articles, products)
  MySQL: repl_user@127.0.0.1:3306
```

無効な設定を検証:
```mygram
CONFIG VERIFY /tmp/invalid.yaml
```

レスポンス（エラー）:
```mygram
-ERR Configuration validation failed:
  - mysql.port: value 99999 exceeds maximum 65535
  - tables[0].name: missing required field
```

---

## DUMP コマンド

DUMPコマンドファミリーは、整合性検証を備えた統一的なスナップショット管理を提供します。

::: warning DUMP LOADは現在のデータを置き換える
`DUMP SAVE` は保存、`DUMP VERIFY` は検証、`DUMP INFO` は情報表示です。一方で `DUMP LOAD` は現在のインデックスとドキュメントストアをダンプ内容で置き換えます。実行前に対象ファイルとGTIDを確認してください。
:::

### DUMP SAVE

完全なスナップショットを単一のバイナリファイル（`.dmp`）に保存します。このコマンドは**非同期**で実行され、即座にレスポンスを返します。

**構文:**
```mygram
DUMP SAVE [<filepath>]
```

**レスポンス:**
```mygram
OK DUMP_STARTED <filepath>
Use DUMP STATUS to monitor progress
```

**例:**
```mygram
DUMP SAVE /backup/mygramdb.dmp
```

`DUMP STATUS` で進捗を監視し、完了を確認できます。`--with-stats` は文法から削除されており、指定すると未知の `DUMP SAVE` フラグとして拒否されます。

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
DUMP LOAD /backup/mygramdb.dmp
```

### DUMP VERIFY

データを読み込まずにスナップショットファイルの整合性を検証します。

**構文:**
```mygram
DUMP VERIFY <filepath>
```

**例:**
```mygram
DUMP VERIFY /backup/mygramdb.dmp
```

### DUMP INFO

スナップショットファイルのメタデータ（バージョン、GTID、テーブル数、サイズ、フラグ）を表示します。

**構文:**
```mygram
DUMP INFO <filepath>
```

**例:**
```mygram
DUMP INFO /backup/mygramdb.dmp
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
- `IDLE`: ダンプ操作なし
- `SAVING`: DUMP SAVE 実行中
- `LOADING`: DUMP LOAD 実行中
- `COMPLETED`: 最後のダンプ操作が正常に完了
- `FAILED`: 最後のダンプ操作が失敗

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

**詳細なスナップショット管理、整合性保護、推奨運用、トラブルシューティングについては、[スナップショットガイド](/ja/docs/snapshot)を参照してください。**

---

## FACET コマンド

フィルターカラムのユニーク値とドキュメント数を集計します。

### 構文

```mygram
FACET <table> <column> [search_text] [AND <term>] [NOT <term>] [FILTER <col> <op> <value>] [LIMIT <n>] [OFFSET <n>]
```

### 例

statusカラムの全値：
```mygram
FACET articles status
```

検索結果に限定した値：
```mygram
FACET articles category "機械学習" FILTER status = 1 LIMIT 10
```

`OFFSET` はカウント順に並べたファセットバケットをスキップします。既定値は `0` です。

### レスポンス

```mygram
OK FACET <num_values>
<value1>	<count1>
<value2>	<count2>
...
```

結果はカウントの降順でソートされます。

---

## REPLICATION STATUS

現在のレプリケーションステータスを取得します。

### 構文

```mygram
REPLICATION STATUS
```

### レスポンス

複数行のキーバリュー形式：

```mygram
OK REPLICATION
status: <running|stopped|not_configured>
current_gtid: <current_gtid>
processed_events: <count>
queue_size: <size>
END
```

- **status**: 現在のレプリケーション状態
  - `running`: MySQLからアクティブにレプリケーション中
  - `stopped`: レプリケーションが手動で停止中
  - `not_configured`: MySQLレプリケーションが設定されていない
- **current_gtid**: 最後に処理されたGTID位置
- **processed_events**: 処理されたbinlogイベントの総数
- **queue_size**: キュー内の保留中イベント数（実行中のみ表示）

例（実行中）：
```mygram
OK REPLICATION
status: running
current_gtid: 3E11FA47-71CA-11E1-9E33-C80AA9429562:1-100
processed_events: 5000
queue_size: 0
END
```

例（停止中）：
```mygram
OK REPLICATION
status: stopped
current_gtid: 3E11FA47-71CA-11E1-9E33-C80AA9429562:1-100
processed_events: 5000
END
```

---

## REPLICATION STOP

binlogレプリケーションを停止します（インデックスは読み取り専用になります）。

::: warning 停止中はMySQLの変更を追従しない
`REPLICATION STOP` 中も検索はできますが、MySQL側の新しい変更は反映されません。メンテナンス後は `REPLICATION START` と `REPLICATION STATUS` で再開を確認してください。
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

binlogレプリケーションを再開します。

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

設定済みテーブルをMySQLから読み直して再構築します。

### 構文

```mygram
SYNC <table_name>
```

### レスポンス

```mygram
OK SYNC STARTED table=<table_name>
```

SYNCは非同期で実行されます。同期中は対象テーブルへの `SEARCH`、`COUNT`、`GET`、`FACET` が拒否されます。完了後は、他テーブルのコミットを飛ばさないよう保存済みGTIDからレプリケーションを再開します。進捗と失敗理由は `SYNC STATUS` で確認してください。詳しくは[SYNCコマンドガイド](/ja/docs/sync-command)を参照してください。

---

## OPTIMIZE コマンド

インデックスポスティングリストを最適化します（密度に基づいてデルタエンコーディングをRoaring Bitmapに変換）。

::: tip 実行タイミング
`OPTIMIZE` は検索を止めずに実行できますが、一時的に追加メモリを使います。大きなデータセットでは、低トラフィック時間帯に実行し、事前に `/info` や `INFO` でメモリヘルスを確認してください。
:::

### 構文

```mygram
OPTIMIZE [<db.table>]
```

単一テーブル構成ではテーブル名を省略できます。2つ以上のテーブルを設定している場合は修飾名で指定してください。

### 動作

- **実行前チェック**: メモリヘルスと可用性の検証
- ポスティングリストをバッチでコピーして最適化
- クエリ処理は継続（切り替わるまでは旧バッチを使用）
- バッチごとにアトミックに切り替わるため、binlogレプリケーションは止まりません

### メモリ安全性

**実行前メモリチェック：**
- システムメモリヘルスが **CRITICAL**（利用可能メモリ<10%）の場合は実行を拒否
- インデックスサイズとバッチサイズに基づいて必要メモリを推定
- 要件：`利用可能メモリ >= 推定メモリ + 10%の安全マージン`
- 典型的なメモリオーバーヘッド：最適化中にインデックスサイズの約5〜15%

**メモリ使用パターン：**
- **インデックス部分のみ**が一時的に2倍になる（ドキュメントストアは変更なし）
- 全体的なメモリ使用量は約1.05〜1.15倍に増加
- メモリはバッチ処理で段階的に解放

### 同時実行の制御

- **全テーブルを通じて同時に1つのOPTIMIZE操作**のみ実行可能
- 最適化中は新しいOPTIMIZEコマンドは拒否されます
- `optimization_status`は`INFO`コマンドで確認できます

### パフォーマンス

- 小規模インデックス（<10K terms）：<1秒
- 中規模インデックス（10K-100K terms）：1-10秒
- 大規模インデックス（>100K terms）：10秒以上
- 並行検索：最小限の影響（短いロック時間）
- 並行更新：安全だが短時間の競合が発生する可能性あり

### レスポンス

**成功時：**
```mygram
OK OPTIMIZED terms=<total> delta=<count> roaring=<count> memory=<size>
```

例：
```mygram
OK OPTIMIZED terms=1500000 delta=1200000 roaring=300000 memory=450.00 MB
```

**エラー：**

すでに最適化中の場合：
```mygram
ERROR 6030 Another OPTIMIZE operation is already in progress
```

メモリが危機的に低い場合：
```mygram
ERROR 6030 Memory critically low. Cannot start optimization: available=1.50 GB total=8.00 GB
```

メモリ不足の場合：
```mygram
ERROR 6030 Insufficient memory for optimization: estimated=2.50 GB available=1.80 GB
```

---

## DEBUG コマンド

現在の接続のデバッグモードを有効/無効にして、詳細なクエリ実行メトリクスを表示します。

::: info 接続ごとの設定
`DEBUG ON` は現在のTCP接続にだけ効きます。別の `mygram-cli` セッションやアプリケーション接続には影響しません。
:::

### 構文

```mygram
DEBUG ON
DEBUG OFF
```

### 動作

- **接続ごとの状態**: デバッグモードは現在の接続のみで有効/無効
- **クエリタイミング**: 実行時間の内訳を表示（インデックス検索、フィルタリング）
- **検索詳細**: 生成されたn-gram、ポスティングリストサイズ、候補数を表示
- **最適化の可視性**: 適用された最適化戦略を報告
- **パフォーマンス影響**: 最小限のオーバーヘッド、有効時のみメトリクスを収集

### レスポンス

```mygram
OK DEBUG_ON
```

または

```mygram
OK DEBUG_OFF
```

### デバッグ出力フォーマット

デバッグモードが有効な場合、SEARCHとCOUNTコマンドは追加のデバッグ情報を返します：

```mygram
OK RESULTS <count> <id1> <id2> ...

# DEBUG
query_time: <ms>
index_time: <ms>
filter_time: <ms>
terms: <n>
ngrams: <n>
candidates: <n>
after_intersection: <n>
after_not: <n>
after_filters: <n>
final: <n>
optimization: <strategy>
order_by: <column> <direction>
limit: <value> [(default)]
offset: <value> [(default)]
```

### デバッグメトリクスの説明

- **query_time**: 総クエリ実行時間（ミリ秒）
- **index_time**: インデックス検索に費やした時間
- **filter_time**: フィルタ適用に費やした時間（フィルタがある場合）
- **terms**: 検索用語の数
- **ngrams**: 検索用語から生成された総n-gram数
- **candidates**: インデックスからの初期候補ドキュメント
- **after_intersection**: AND用語の交差後の結果
- **after_not**: NOT用語のフィルタリング後の結果（NOTを使用した場合）
- **after_filters**: FILTER条件適用後の結果（フィルタを使用した場合）
- **final**: 一致したドキュメントの総数（LIMIT/OFFSET適用前）
- **optimization**: 使用された戦略（例: `merge_join`、`early_exit`、`none`）
- **order_by**: 適用されたソート（カラムと方向）
- **limit**: 返される最大結果数（明示的に指定されていない場合は「(default)」と表示）
- **offset**: ページネーションの結果オフセット（明示的に指定されていない場合は「(default)」と表示）

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

`CACHE ENABLE` / `CACHE DISABLE` は稼働中の状態だけを変更します。設定として残す場合は `SET cache.enabled = ...` を使うか、`config.yaml` を編集してください。

---

## SET / SHOW VARIABLES

MySQL互換のランタイム変数コマンドです。変更できるのは mutable と表示された変数だけです。運用手順は[運用ガイド](/ja/docs/operations)を参照してください。

### 構文

```mygram
SET <variable> = <value> [, <variable2> = <value2> ...]
SHOW VARIABLES [LIKE '<pattern>']
```

`SET api.default_limit=50` のように、空白を入れない形式も使えます。カンマで区切った複数代入にも混在させられます。

`SHOW VARIABLES LIKE` に指定できるパターンはちょうど1つです。

### レスポンス

```mygram
+OK Variable 'logging.level' set to 'debug'
+OK 2 variables set
```

`SHOW VARIABLES` は `Mutable` 列を持つMySQL形式のテーブルを返します。

```mygram
+---------------------+-----------+---------+
| Variable_name       | Value     | Mutable |
+---------------------+-----------+---------+
| api.default_limit   | 100       | YES     |
| cache.enabled       | true      | YES     |
| memory.verify_text  | off       | NO      |
+---------------------+-----------+---------+
```

---

## エラーレスポンス

新しいサーバーは、数値コードの後にメッセージを続ける形式でエラーを返します。

```mygram
ERROR <numeric-code> <message>
```

例：
```mygram
ERROR 7 Administrative command requires AUTH
ERROR 4007 Table not found: products
ERROR 3006 Invalid filter
```

古いサーバーとも通信するクライアントは、従来の `ERROR <message>` 形式も受け付けてください。ペイロード先頭のトークンが 0 以外の10進の符号なし16ビット整数だけで構成される場合だけコードとして解釈し、それ以外ではペイロード全体を従来形式のメッセージとして扱います。

---

## CLIクライアント機能

CLIクライアント（`mygram-cli`）は対話型シェルを提供：

- **タブ補完**: TABキーでコマンド名を自動補完（GNU Readline必須）
- **コマンド履歴**: ↑/↓矢印キーで履歴をナビゲート（GNU Readline必須）
- **行編集**: Ctrl+A、Ctrl+Eなどでフル行編集（GNU Readline必須）
- **エラーハンドリング**: グレースフルなエラーメッセージ（クラッシュしない）

### 対話モード

```bash
./build/bin/mygram-cli
> SEARCH articles hello
OK RESULTS 5 1 2 3 4 5
> quit
```

### 単一コマンドモード

コマンドは位置引数として渡します。`-c` のようなフラグはありません。空白やシェルのメタ文字を含む場合は全体を引用符で囲んでください。

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
| `-s SOCKET_PATH` | Unixドメインソケットのパス。`-h`/`-p` より優先されます |
| `--retry N` | 接続を拒否された場合にN回リトライ（デフォルト: `0`） |
| `--wait-ready` | サーバーが準備完了になるまでリトライを続ける |
| `--version` | クライアントのバージョンを表示して終了 |
| `--help` | 使い方を表示して終了 |

### helpコマンド

対話モードで`help`と入力すると、利用可能なコマンドが表示されます：

```
> help
Available commands:
  SEARCH <db.table> <text> [(AND|OR|NOT) <term>...] [FILTER <col=val>...]
         [SORT [BY] <col>|ASC|DESC] [LIMIT <n>] [OFFSET <n>]
  COUNT <db.table> <text> [(AND|OR|NOT) <term>...] [FILTER <col=val>...]
  GET <db.table> <primary_key>
  INFO              - Show server statistics
  CONFIG            - Show current configuration
  SET <variable>[ = ]<value> [, ...]       - Change runtime variables
  SHOW VARIABLES [LIKE <pattern>]         - Show runtime variables
  FACET <db.table> <column> [text] [FILTER <col=val>...] [LIMIT <n>]
                    - Compute facet counts
  REPLICATION STATUS|STOP|START
  DEBUG ON|OFF      - Toggle per-connection debug output
  OPTIMIZE [db.table]  - Compact posting lists for one or all tables
  CACHE STATS|CLEAR|ENABLE|DISABLE
  DUMP SAVE|LOAD|VERIFY|INFO|STATUS
  SYNC <db.table>|STOP [db.table]|STATUS
```

::: info
コマンドの末尾にセミコロンは付けません。パーサは空白でのみトークンを分割するため、`SHOW VARIABLES;` は未知のサブコマンドとして拒否されます。
:::

---

## 参照

- [クエリ構文ガイド](/ja/docs/query-syntax) - 詳細なSEARCH/COUNTクエリ構文
- [スナップショットガイド](/ja/docs/snapshot) - スナップショット管理と推奨運用
- [設定ガイド](/ja/docs/configuration) - サーバー設定
- [レプリケーション設定](/ja/docs/replication) - MySQLレプリケーション設定
