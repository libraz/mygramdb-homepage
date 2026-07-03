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

MygramDB は MySQL 8.4/9.x と MariaDB 10.6+/11.x に対応します。同じ `mysql` セクションを使い、`SELECT VERSION()` からサーバー種別を判定して適切なGTID形式を選びます。

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
```

`datetime_timezone` は MySQL の `DATETIME`、`DATE`、`TIME` の解釈に使われます。`TIMESTAMP` は常にUTCとして扱われます。

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

## フィルタ

`required_filters` はインデックス対象行を決めます。条件に一致しない行はインデックス化されません。レプリケーション中、条件から外れた行は削除され、条件に入った行は追加されます。

<img src="/diagrams/filter-indexing.svg" alt="required_filters はMySQLの行をインデックスに入れるかを決め、検索時の filters はインデックス済みの行をクエリ時に絞り込むことを示す図" class="doc-diagram" />

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
    bitmap_index: true
  - name: "category"
    type: "string"
    dict_compress: true
  - name: "created_at"
    type: "datetime"
    bucket: "day"
```

フィルタ型は符号あり/なし整数、`float`、`double`、`string`、`varchar`、`text`、`datetime`、`date`、`timestamp`、`time` に対応します。日時系には `minute`、`hour`、`day` の `bucket` を指定できます。`ENUM` と `SET` はフィルタ型として設定できません。binlog行イベントだけではラベルを復元できず、初期ロードとレプリケーションで意味がずれる可能性があるためです。

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

`freq_bits` は `0`、`4`、`8` を指定できます。BM25スコアリングやハイライトは、`memory.verify_text` が有効な場合に保存される正規化テキストを使用します。`freq_bits` は必須ではありません。

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
    thread_pool_queue_size: 1000
    max_write_queue_bytes: 16777216
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
    enable_cors: false
    cors_allow_origin: ""
    max_body_bytes: 16777216
    read_timeout_sec: 5
    write_timeout_sec: 5
  default_limit: 100
  max_query_length: 128
```

TCPとHTTPはデフォルトでループバックにバインドします。`api.default_limit` と `api.max_query_length` は `SET` で実行時変更できます。ネットワークバインド、HTTPボディサイズ上限、多くの接続設定は再起動が必要です。

::: info TCPとHTTPの役割
TCP APIは検索に加えて `SYNC`、`DUMP`、`SET` などの管理コマンドも扱います。HTTP APIは検索、カウント、ファセット、ドキュメント取得、ヘルスチェック、メトリクスが中心で、管理コマンドは公開しません。
:::

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

## 永続化

```yaml
dump:
  dir: "/var/lib/mygramdb/dumps"
  default_filename: "mygramdb.dmp"
  interval_sec: 7200
  retain: 3
```

`interval_sec: 0` は自動ダンプを無効化します。手動の `DUMP SAVE` はパスを指定しない場合 `default_filename` を使います。v1.7.0以降、ダンプメタデータに各テーブルのDB名が保存されるため、複数DBの識別子を正しく復元できます。

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

`allow_cidrs` が空または未設定の場合、接続は拒否されます。アクセスが必要なアプリケーションサーバーや運用ネットワークだけを追加してください。MygramDBにはネイティブのTLS/API認証はありません。HTTPを公開する場合はファイアウォール、プライベートネットワーク、リバースプロキシの背後に置いてください。

::: danger 公開ネットワークへ直接出さない
MygramDBの検索APIには組み込みのユーザー認証がありません。`0.0.0.0/0` を許可した状態でインターネットに直接公開しないでください。
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
SHOW VARIABLES;
SHOW VARIABLES LIKE 'cache%';
SET logging.level = 'debug';
SET cache.enabled = false;
SET api.default_limit = 200;
```

実行時に変更できるのは `SHOW VARIABLES` で mutable として表示される項目だけです。MySQL接続先、テーブル、`memory.verify_text`、ダンプディレクトリ、ネットワークACL、リスナーのbind設定は再起動が必要です。
