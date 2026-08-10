---
title: MygramDB 設定リファレンス - config.yaml の全項目
description: MygramDBの設定リファレンス。MySQL接続、テーブルとフィルタの定義、N-gram、シノニム、レプリケーション、メモリ、APIサーバー、レート制限、BM25、クエリキャッシュ、ダンプ、ネットワークACL、ログを説明します。
head:
  - - meta
    - name: keywords
      content: MygramDB 設定, config.yaml, ngram_size, verify_text, required_filters, BM25 設定, クエリキャッシュ, network allow_cidrs, ランタイム変数
---

# 設定

MygramDB は YAML または JSON の設定ファイルを読み込みます。起動時に組み込み JSON Schema で検証されるため、未知のキー、型違い、必須項目不足、無効な enum 値は起動前に検出されます。

::: info このページの読み方
最初は「MySQL接続」「tables」「replication.server_id」「network.allow_cidrs」だけ理解すれば動かせます。その他の項目は、検索精度、メモリ使用量、運用方法を調整したくなった段階で読めば十分です。
:::

## 最小設定例

```yaml
mysql:
  host: "127.0.0.1"
  user: "repl_user"
  password: "your_password"
  database: "mydb"

tables:
  - name: "articles"
    text_source:
      column: "content"

replication:
  server_id: 83917

network:
  allow_cidrs:
    - "127.0.0.1/32"
```

`mysql.user`、`mysql.database`、1つ以上のテーブルは必須です。`replication.enable` が true（デフォルト）の場合、`replication.server_id` も必須で、MySQLレプリカおよびMygramDBインスタンス間で一意である必要があります。

::: tip 最小設定の次に行うこと
設定ファイルを書いただけでは既存データは読み込まれません。起動後に `SYNC articles` のように対象テーブルを同期し、`SYNC STATUS` で完了を確認してください。
:::

::: info 用語補足
**server_id** はMySQLレプリケーションで使う識別番号です。同じMySQLにつながるMySQLレプリカやMygramDBで重複しない値にしてください。重複すると、MySQL側が別のレプリカと区別できなくなります。
:::

## MySQL / MariaDB 接続

MygramDB は MySQL 8.4/9.x と MariaDB 10.6+/11.x に対応します。同じ `mysql` セクションを使い、機能プローブでサーバー種別を判定して適切なGTID形式を選びます。

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
  connect_timeout_ms: 3000
  read_timeout_ms: 3600000
  write_timeout_ms: 3600000
  session_timeout_sec: 3600
  datetime_timezone: "+09:00"
  ssl_enable: true
  ssl_ca: "/etc/mygramdb/mysql-ca.pem"
  ssl_cert: "/etc/mygramdb/mysql-client-cert.pem"
  ssl_key: "/etc/mygramdb/mysql-client-key.pem"
  ssl_verify_server_cert: true
```

`datetime_timezone` は MySQL の `DATETIME`、`DATE`、`TIME` の解釈に使われます。`TIMESTAMP` は常にUTCとして扱われます。

MySQLでTLSが必要な場合は、`ssl_enable` とCA・証明書・鍵のパスを設定します。サーバーが必要としない場合だけ証明書パスを空にし、検証するTLSでは `ssl_verify_server_cert: true` を維持してください。

::: tip DATETIMEとTIMESTAMPの違い
MySQLの `DATETIME` はタイムゾーン情報を持たない日時です。MygramDBは `datetime_timezone` を使って「このDATETIMEはどのタイムゾーンの時刻か」を解釈します。`TIMESTAMP` はMySQL側でUTC基準に変換されるため、この設定の影響を受けません。
:::

一部のMySQL項目は環境変数で上書きできます: `MYGRAM_MYSQL_USER`、`MYGRAM_MYSQL_PASSWORD`、`MYGRAM_MYSQL_HOST`、`MYGRAM_MYSQL_DATABASE`。

### 必須のMySQL設定

```ini
binlog_format = ROW
binlog_row_image = FULL
```

MySQLではGTIDを有効にします。

```ini
gtid_mode = ON
enforce_gtid_consistency = ON
```

MariaDBではネイティブの `domain-server-sequence` 形式のGTIDを使用します。`server_id` を設定し、ROW形式のbinlogを有効にしてください。

### 必須権限

```sql
GRANT SELECT, REPLICATION SLAVE, REPLICATION CLIENT ON *.* TO 'repl_user'@'%';
FLUSH PRIVILEGES;
```

::: warning 権限を絞る場合
本番では `SELECT ON *.*` ではなく、検索対象DBだけに絞る運用もできます。ただし、初期 `SYNC` では対象テーブルの読み取りが必要で、binlog追従には `REPLICATION SLAVE` と `REPLICATION CLIENT` が必要です。
:::

## テーブル設定

各テーブルは `<database>.<table>` の有効識別子を持ちます。`tables[*].database` を省略した場合、`mysql.database` が使われます。

```yaml
mysql:
  database: "app_db"

tables:
  - name: "articles"              # 有効識別子: app_db.articles
    primary_key: "id"
    text_source:
      column: "content"
    ngram_size: 2
    kanji_ngram_size: 1
    cross_boundary_ngrams: true

  - database: "archive_db"
    name: "articles"              # 有効識別子: archive_db.articles
    primary_key: "id"
    text_source:
      concat: ["title", "body"]
      delimiter: " "
```

単一DB構成では `SEARCH articles hello` のような修飾なしのテーブル参照も使えます。設定が2つ以上のDBにまたがる場合、TCP、CLI、C/C++、HTTP のすべてで `<database>.<table>` の指定が必要です。

::: info 用語補足
**テーブル識別子**は、MygramDBがどのテーブルを検索対象にするかを表す名前です。単一DBなら `articles` だけで足りますが、複数DBでは `app_db.articles` のようにDB名も含める必要があります。
:::

`text_source` は次のどちらかを指定します。

| 項目 | 意味 |
|------|------|
| `column` | 1つのテキストカラムをインデックス化 |
| `concat` | 2つ以上のカラムを連結してインデックス化 |
| `delimiter` | `concat` で使う区切り文字（デフォルトは空白） |

::: warning 設定済みカラムの検証

テーブル名、データベース名、主キー、フィルタ名、テキストソース名は有効な SQL 識別子でなければなりません。設定済みの主キー、テキストソース、フィルタカラムには `BINARY`、`VARBINARY`、`BLOB` を使えません。文字列カラムには `utf8mb4`、`utf8`/`utf8mb3`、`ascii` のいずれかの照合順序が必要です。初期ロードと binlog 読み取りで同じ値を扱えるよう、MygramDB はレプリケーション開始前にこれらを検証します。
:::

## フィルタ

`required_filters` はインデックス対象行を決めます。条件に一致しない行はインデックス化されません。レプリケーション中、条件から外れた行は削除され、条件に入った行は追加されます。

<DocDiagram name="filter-indexing" alt="required_filters はMySQLの行をインデックスに入れるかを決め、検索時の filters はインデックス済みの行をクエリ時に絞り込むことを示す図" />

::: warning `required_filters` と `filters` の違い
`required_filters` は「そもそもインデックスに入れるか」を決めます。`filters` は「検索時に絞り込める列」を登録します。たとえば論理削除済みレコードを最初から検索対象外にしたい場合は `required_filters`、検索画面でステータス別に絞りたい場合は `filters` を使います。
:::

```yaml
tables:
  - name: "articles"
    text_source:
      column: "content"
    required_filters:
      - name: "enabled"
        type: "int"
        op: "="
        value: 1
      - name: "deleted_at"
        type: "datetime"
        op: "IS NULL"
```

`filters` は検索時の絞り込み用カラムです。どの行をインデックス化するかには影響しません。

```yaml
filters:
  - name: "status"
    type: "int"
  - name: "category"
    type: "string"
  - name: "created_at"
    type: "datetime"
```

フィルタ型は `mediumint` と `mediumint_unsigned` を含む符号あり/なし整数、`float`、`double`、`boolean`、`string`、`varchar`、`text`、`datetime`、`date`、`timestamp`、`time` に対応します。`boolean` はMySQLの符号付き `TINYINT(1)` に対応し、`true`/`false` または `1`/`0` を使えます。required filterとしてのbooleanは `=`、`!=`、`IS NULL`、`IS NOT NULL` を使えます。`ENUM` と `SET` はフィルタ型として設定できません。binlog行イベントだけではラベルを復元できず、初期ロードとレプリケーションで意味がずれる可能性があるためです。

::: warning 予約済みのフィルタキー
`bitmap_index`、`dict_compress`、`bucket` はスキーマ上受け付けられ、ダンプにも保存されますが、まだ挙動には影響しません。指定してもインデックス構築やクエリ性能は変わりません。
:::

## N-gram とポスティングリスト

```yaml
tables:
  - name: "articles"
    ngram_size: 2
    kanji_ngram_size: 1
    cross_boundary_ngrams: true
    posting:
      block_size: 128
      freq_bits: 0
      use_roaring: "auto"
```

`ngram_size` はASCII/英数字に適用されます。v1.8.0以降、省略時のデフォルトは `2` です。旧来のユニグラム挙動が必要な場合だけ `ngram_size: 1` を明示してください。`kanji_ngram_size` はCJK文字に適用され、`0` の場合は `ngram_size` を使います。`cross_boundary_ngrams` は `字A` のような文字種境界をまたぐN-gramを生成するかを制御します。

::: info 用語補足
**N-gram** は文字列を小さな断片に分けたものです。日本語のように単語の区切りが空白で分からない言語でも、文字単位・2文字単位で分けることで辞書なしに検索できます。
:::

::: warning 予約済みの posting キー
`posting` ブロック全体（`block_size`、`freq_bits`、`use_roaring`）は検証されダンプにも保存されますが、まだ挙動には反映されません。デルタ符号化からRoaring Bitmapへの変換は `use_roaring` ではなく `memory.roaring_threshold` と `OPTIMIZE` が制御します。
:::

BM25スコアリングやハイライトは、`memory.verify_text` が有効な場合に保存される正規化テキストを使用します。`freq_bits` には依存しません。

## テーブル単位のシノニム

シノニム展開はグローバルではなく、テーブルごとに設定します。

::: tip シノニム設定の単位
同じ単語でも、テーブルによって意味が違うことがあります。たとえば商品検索と記事検索では同義語の扱いが変わるため、MygramDBでは `tables[*].synonyms` としてテーブルごとに設定します。
:::

```yaml
tables:
  - name: "articles"
    text_source:
      column: "content"
    synonyms:
      enable: true
      file: "/etc/mygramdb/articles-synonyms.tsv"
```

TSV形式で、1行が1グループです。

```tsv
car	automobile	vehicle
fast	quick	rapid	speedy
# コメント行は無視されます
```

グループ内のどの語で検索しても、同じグループ内の語へ展開されます。語句はインデックスと同じ正規化設定で処理されます。

## レプリケーション

```yaml
replication:
  enable: true
  auto_initial_snapshot: false
  server_id: 83917
  start_from: "snapshot"
  queue_size: 10000
```

`auto_initial_snapshot` のデフォルトは `false` です。初回ロードは、読み込みたい各テーブルに対して `SYNC <table>` を明示的に実行します。起動時に大きなテーブルを意図せず読み込むことを避けるためです。起動時ロードが必要な場合のみ `true` にしてください。v1.8.0以降、`auto_initial_snapshot: true` を使う場合は、単一テーブル構成でも複数テーブル構成でも `start_from: "snapshot"` が必要です。

`start_from` は次を指定できます。

| 値 | 挙動 |
|----|------|
| `snapshot` | スナップショット/ダンプが取得したGTIDから再開 |
| `latest` | 現在のMySQL GTIDから開始し、過去変更は無視 |
| `gtid=<UUID:txn>` | 指定したMySQL GTIDから開始 |

## メモリ

```yaml
memory:
  hard_limit_mb: 8192
  soft_target_mb: 4096
  roaring_threshold: 0.18
  normalize:
    nfkc: true
    width: "narrow"
    lower: false
  verify_text: "off"
```

`hard_limit_mb`、`soft_target_mb`、`arena_chunk_mb`、`minute_epoch` は予約項目で、現時点では強制されません。インデックス全体と必要に応じたテキストストアがRAMに収まるようにホストを用意してください。

::: warning メモリ上限について
`hard_limit_mb` は現在、OSレベルのメモリ使用を強制的に止める仕組みではありません。実運用では、データ件数・`verify_text`・キャッシュ量を見積もり、十分なRAMを確保してください。
:::

`verify_text` は正規化テキストを保存し、N-gram候補を検証します。

| 値 | 挙動 |
|----|------|
| `off` | 最速。候補検証なし。N-gram由来の偽陽性があり得る |
| `ascii` | ASCIIのみのクエリを検証 |
| `all` | すべてのクエリを検証。正確性が必要な場合に推奨 |

ハイライトには保存テキストが必要なため、`HIGHLIGHT` を使う場合は `verify_text: "ascii"` または `"all"` を指定してください。BM25 `_score` ソートも語頻度計算に保存テキストを使います。

## APIサーバー

```yaml
api:
  tcp:
    bind: "127.0.0.1"
    port: 11016
    max_connections: 10000
    worker_threads: 0
    recv_timeout_sec: 60
    idle_timeout_sec: 300
    reaper_interval_sec: 5
    thread_pool_queue_size: 1000
    max_write_queue_bytes: 16777216
    max_total_buffered_bytes: 268435456
    max_pending_frames: 1024
    max_pending_frame_bytes: 4194304
    keepalive:
      enabled: true
      idle_sec: 60
      interval_sec: 20
      probe_count: 3
  unix_socket:
    path: ""
  http:
    enable: false
    bind: "127.0.0.1"
    port: 8080
    max_connections: 10000
    trusted_proxies: []
    enable_cors: false
    cors_allow_origin: ""
    max_body_bytes: 16777216
    read_timeout_sec: 5
    write_timeout_sec: 5
  default_limit: 100
  max_query_length: 128
  admin_token: "replace-with-a-high-entropy-secret"
```

TCPとHTTPはデフォルトでループバックにバインドします。`idle_timeout_sec: 0` でTCPアイドル接続の回収を無効にします。保留フレームの上限は、ワーカー待ちの完了済みリクエストを制限します。どちらかの上限の75%で読み取りを止め、キューが減ると再開します。`api.http.max_connections` はワーカー待ちのソケットを含め、受け付けるHTTP接続数を制限します。`api.http.trusted_proxies` には、ACLとレート制限で `X-Forwarded-For` をクライアントIPとして扱ってよい数値形式のリバースプロキシIPを指定します。プロキシを経由しない場合は空のままにしてください。`api.default_limit` と `api.max_query_length` は `SET` で実行時変更できます。ネットワークバインド、HTTPボディサイズ上限、多くの接続設定は再起動が必要です。

::: info TCPとHTTPの役割
TCP APIは検索に加えて `SYNC`、`DUMP`、`SET` などの管理コマンドも扱います。HTTP APIは検索、カウント、ファセット、ドキュメント取得、ヘルスチェック、メトリクス、`POST /optimize`を扱います。
:::

### 管理操作の認証

`api.admin_token` は管理コマンド用の共有シークレットです。設定ファイルまたは `MYGRAM_API_ADMIN_TOKEN` で設定し、十分に長いランダム値を使ってリポジトリには保存しないでください。TCPを非ループバックアドレスにバインドし、Unix socketを設定しない場合は必須です。設定しないとMygramDBは起動を拒否します。

管理コマンドの前にTCP接続を認証します。

```mygram
AUTH replace-with-a-high-entropy-secret
SYNC articles
```

`POST /optimize` には同じトークンをHTTP Bearer認証で渡します。

```bash
curl -X POST http://127.0.0.1:8080/optimize \
  -H "Authorization: Bearer $MYGRAM_API_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{}'
```

## レート制限

```yaml
api:
  rate_limiting:
    enable: true
    capacity: 100
    refill_rate: 10
    max_clients: 10000
```

TCPとHTTPは同じレートリミッタを共有します。そのため、同じクライアントがプロトコルを分散しても制限を2倍にはできません。

## 関連度スコアリング（BM25）

```yaml
bm25:
  enable: false
  k1: 1.2
  b: 0.75
```

BM25はデフォルトで無効です。`enable` を `true` にするまで `SORT _score` は `SORT _score requires BM25 to be enabled in configuration` で失敗します。さらに、保存済みテキストから語句頻度を数えるため `memory.verify_text` を `"ascii"` または `"all"` にする必要があります。

`k1` は語句頻度の飽和度を制御します（値を大きくすると、同じ語が繰り返されるほどスコアが伸び続けます）。`b` はドキュメント長の正規化度合いで、`0.0`（無効）から `1.0`（完全）の範囲で指定します。

## クエリキャッシュ

```yaml
cache:
  enabled: true
  max_memory_mb: 32
  min_query_cost_ms: 10.0
  ttl_seconds: 3600
  invalidation_strategy: "ngram"
  compression_enabled: true
  eviction_batch_size: 10
  invalidation:
    batch_size: 1000
    max_delay_ms: 100
```

キャッシュ対象は `min_query_cost_ms` より遅いクエリだけです。安価な検索でキャッシュを埋めて有用なエントリを追い出さないための仕組みです。`invalidation_strategy: "ngram"` は変更行と語が重なるエントリだけを無効化します。`"table"` は判定は軽い代わりに、そのテーブルの全エントリを破棄します。`ttl_seconds: 0` で有効期限は無効になります。

`cache.enabled`、`cache.min_query_cost_ms`、`cache.ttl_seconds` は `SET` で実行時に変更できます。`CACHE STATS` / `CACHE CLEAR` コマンドは[運用ガイド](/ja/docs/operations)を参照してください。

## インデックス構築

```yaml
build:
  mode: "select_snapshot"
  batch_size: 5000
```

`batch_size` は `SYNC` による初期ロードで1回に取得する行数です。`mode` は現在 `select_snapshot` のみ指定できます。

::: warning 予約済みの build キー
`parallelism` と `throttle_ms` は検証されますが、まだ挙動には反映されません。初期ロードはシングルスレッドで、スロットリングも行われません。
:::

## 永続化

```yaml
dump:
  dir: "/var/lib/mygramdb/dumps"
  default_filename: "mygramdb.dmp"
  interval_sec: 7200
  retain: 3
  restore_memory_budget_mb: 4096
  restore_max_section_mb: 2048
```

`interval_sec: 0` は自動ダンプを無効化します。手動の `DUMP SAVE` はパスを指定しない場合 `default_filename` を使います。`restore_memory_budget_mb` はV2復元時に段階的に保持するデータ全体の上限、`restore_max_section_mb` はV2ダンプの1セクションの上限です。v1.7.0以降、ダンプメタデータに各テーブルのDB名が保存されるため、複数DBの識別子を正しく復元できます。

::: warning ダンプ保存先は永続化する
DockerやKubernetesで運用する場合、`dump.dir` は永続ボリュームに置いてください。コンテナ内の一時的なファイルシステムに保存すると、再作成時にダンプが失われます。
:::

## ネットワークセキュリティ

```yaml
network:
  allow_cidrs:
    - "127.0.0.1/32"
    - "10.0.0.0/8"
```

`allow_cidrs` が空または未設定の場合、接続は拒否されます。アクセスが必要なアプリケーションサーバーや運用ネットワークだけを追加してください。MygramDBにはネイティブTLSはないため、必要に応じてリバースプロキシやロードバランサーでTLSを終端してください。管理コマンドは `api.admin_token` で認証します。通常の検索エンドポイントはバインドアドレスとCIDR許可リストで保護します。

::: danger 公開ネットワークへ直接出さない
MygramDBをインターネットへ直接公開しないでください。`allow_cidrs` に `0.0.0.0/0` または `::/0` を指定し、非ループバックのTCPまたは有効なHTTPをバインドする設定は起動時に拒否されます。制限したCIDRリストを使うか、リスナーをループバックに置いてリバースプロキシの背後で公開してください。
:::

## ログ

```yaml
logging:
  level: "info"
  format: "json"
  file: ""
```

`file: ""` は標準出力へログを出します。Dockerやsystemdではこの設定を推奨します。

## ランタイム変数

TCPプロトコルからMySQL風のコマンドを使います。

```sql
SHOW VARIABLES
SHOW VARIABLES LIKE 'cache%'
SET logging.level = 'debug'
SET cache.enabled = false
SET api.default_limit = 200
```

実行時に変更できるのは `SHOW VARIABLES` で mutable として表示される項目だけです。MySQL接続先、テーブル、`memory.verify_text`、ダンプディレクトリ、ネットワークACL、リスナーのbind設定は再起動が必要です。
