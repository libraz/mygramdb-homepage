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

`mysql.user`、`mysql.database`、1つ以上のテーブルは、環境変数の上書きを適用した後に必須です。`MYGRAM_MYSQL_USER` と `MYGRAM_MYSQL_DATABASE` で必須値を指定する場合は、`mysql` ブロックを省略できます。レプリケーションはデフォルトで有効です。有効な場合、`replication.server_id` には `1` から `4294967295` までの0以外の値を指定し、MySQLレプリカやMygramDBインスタンス間で重複させないでください。

::: tip 最小設定の次に行うこと
設定ファイルを書いただけでは既存データは読み込まれません。起動後に `SYNC articles` のように対象テーブルを同期し、`SYNC STATUS` で完了を確認してください。
:::

::: info 用語補足
**server_id** はMySQLレプリケーションで使う識別番号です。同じMySQLにつながるMySQLレプリカやMygramDBで重複しない値にしてください。重複すると、MySQL側が別のレプリカと区別できなくなります。
:::

## MySQL / MariaDB 接続

MygramDB は MySQL 8.4/9.x と MariaDB 10.11+/11.x/12.x に対応します。同じ `mysql` セクションを使い、機能プローブでサーバー種別を判定して適切なGTID形式を選びます。

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
  ignored_ddl_prefixes: []
```

`datetime_timezone` は MySQL の `DATETIME` と `DATE` の値、および日時型の `required_filters` のリテラルを解釈する基準です。`TIME` は秒数で表す期間なので、このオフセットを使いません。`TIMESTAMP` は常にUTCとして扱われます。

`connect_timeout_ms`、`read_timeout_ms`、`write_timeout_ms` の単位はミリ秒、`session_timeout_sec` は秒です。TLSはデフォルトで無効です。この例ではTLSを有効にしています。CAとクライアント証明書のパスは、サーバー上にあるファイルへ置き換えてください。TLSを有効にしてサーバー証明書を検証する場合、`mysql.ssl_ca` に署名元CA証明書のパスが必要です。`mysql.ssl_cert` と `mysql.ssl_key` はソース側でクライアント証明書認証が必要な場合だけ使います。不要なら例からこの2行を削除してください。TLSを使わない場合は `ssl_enable: false` にして証明書パスを削除してください。検証付きTLSでは `ssl_verify_server_cert: true` を維持してください。

::: tip DATETIMEとTIMESTAMPの違い
MySQLの `DATETIME` はタイムゾーン情報を持たない日時です。MygramDBは `datetime_timezone` を使って「このDATETIMEはどのタイムゾーンの時刻か」を解釈します。`TIMESTAMP` はMySQL側でUTC基準に変換されるため、この設定の影響を受けません。
:::

`mysql.host`、`mysql.port`、`mysql.user`、`mysql.password`、`mysql.database` は、それぞれ `MYGRAM_MYSQL_HOST`、`MYGRAM_MYSQL_PORT`、`MYGRAM_MYSQL_USER`、`MYGRAM_MYSQL_PASSWORD`、`MYGRAM_MYSQL_DATABASE` で上書きできます。`mysql` ブロックがなくても環境変数は適用されます。`MYGRAM_MYSQL_PORT` は `1` から `65535` までの整数でなければならず、無効な値の場合は起動に失敗します。

`mysql.ignored_ddl_prefixes` はデフォルトが空の起動時専用リストです。分類されていない単独の DDL `QUERY_EVENT` を安全にスキップできると確認した場合だけ、レビュー済みの単一ステートメントのプレフィックスを追加します。各エントリは空でなく、セミコロンを含まず、`ALTER`、`ANALYZE`、`CHECK`、`CREATE`、`DROP`、`OPTIMIZE`、`RENAME`、`REPAIR`、`TRUNCATE` のいずれかで始めます（大文字小文字は区別しません）。DML のプレフィックスは拒否されます。設定済みテーブルまたはデータベースの安全性は上書きされないため、設定済みデータベースに対する `DROP DATABASE` または `DROP SCHEMA` は `DROP` を指定していてもレプリケーションを停止します。変更は再起動後に反映されます。

`mysql.binlog_format` と `mysql.binlog_row_image` はソースサーバーの値を検証する項目で、MySQLやMariaDBの設定を変更しません。ソースでは `binlog_row_metadata=FULL` も設定してください。これはサーバー側の設定で、MygramDBの設定キーではありません。必要なソース・テーブル要件と拒否理由は[MySQLレプリケーション](/ja/docs/replication#%E3%82%BD%E3%83%BC%E3%82%B9%E3%81%A8%E3%83%86%E3%83%BC%E3%83%95%E3%82%99%E3%83%AB%E3%81%AE%E6%A4%9C%E8%A8%BC)を参照してください。

### 必須のMySQL設定

```ini
binlog_format = ROW
binlog_row_image = FULL
binlog_row_metadata = FULL
binlog_checksum = CRC32
```

これらはMySQLまたはMariaDBのソース側に設定します。MygramDBは起動時と再接続時に値を検証します。YAMLの `mysql` セクションからソースサーバーの設定は変更できません。ソースは圧縮されていないbinlogイベントを書き込む必要があります。MySQLでは `binlog_transaction_compression=OFF`、MariaDBでは `log_bin_compress=OFF` にします。MySQLの `binlog_row_value_options` に `PARTIAL_JSON` を含めないでください。

MySQLではGTIDを有効にします。

```ini
gtid_mode = ON
enforce_gtid_consistency = ON
```

MariaDBではネイティブの `domain-server-sequence` 形式のGTIDを使用します。`server_id` を設定し、ROW形式のbinlogを有効にして、`binlog_storage_engine` は未設定にします。ソース自体がレプリカの場合、MySQLでは `log_replica_updates`、MariaDBでは `log_slave_updates` も有効にし、複製した変更をbinlogへ書き込みます。

### 必須権限

```sql
GRANT SELECT, REPLICATION SLAVE, REPLICATION CLIENT ON *.* TO 'repl_user'@'%';
FLUSH PRIVILEGES;
```

::: warning 権限を絞る場合
本番では `SELECT ON *.*` ではなく、検索対象DBだけに絞る運用もできます。ただし、初期 `SYNC` では対象テーブルの読み取りが必要で、binlog追従には `REPLICATION SLAVE` と `REPLICATION CLIENT` が必要です。
:::

## テーブル設定

各テーブルは `<database>.<table>` のテーブル識別子を持ちます。`tables[*].database` を省略した場合、`mysql.database` が使われます。

レプリケーションを始める前に、MygramDBはソース要件、主キーの一意性、外部キーの更新・削除動作、カラム定義を検証します。拒否条件とエラーコードは[MySQLレプリケーション](/ja/docs/replication#%E3%82%BD%E3%83%BC%E3%82%B9%E3%81%A8%E3%83%86%E3%83%BC%E3%83%95%E3%82%99%E3%83%AB%E3%81%AE%E6%A4%9C%E8%A8%BC)を参照してください。

```yaml
mysql:
  database: "app_db"

tables:
  - name: "articles"              # テーブル識別子: app_db.articles
    primary_key: "id"
    text_source:
      column: "content"
    ngram_size: 2
    kanji_ngram_size: 1
    cross_boundary_ngrams: true

  - database: "archive_db"
    name: "articles"              # テーブル識別子: archive_db.articles
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

テーブル名、データベース名、主キー、フィルタ名、テキストソース名は空でなく、NULバイトを含まない SQL 識別子でなければなりません。ASCIIに限らず、空白、`$`、Unicode、バッククォートを含む名前も安全にクォートして扱えます。テーブル識別子は `(database, table)` の組であり、同じ組は重複として拒否されます。設定済みの主キー、テキストソース、フィルタカラムには `FLOAT`、`JSON`、`GEOMETRY` とそのサブタイプ、`VECTOR`、`ZEROFILL`、`BINARY`、`VARBINARY`、`BLOB` 系の型、またはこのビルドが行イメージからデコードできない型を使えません。文字列カラムには `utf8mb4`、`utf8`/`utf8mb3`、`ascii` のいずれかの照合順序が必要です。初期ロードと binlog 読み取りで同じ値を扱えるよう、MygramDB はレプリケーション開始前にこれらを検証します。
:::

## 識別子と取り込み上限

プロトコルでテーブルを指定するとき、単一DB構成ではテーブル名だけを使えます。複数DB構成では `<database>.<table>` を指定してください。raw TCP では、空白を含む識別子全体を引用して1つのトークンとして指定します。ネイティブ C/C++ SDK の型付きメソッドは、コマンドを組み立てる前に名前の空白を拒否します。raw コマンドの送信メソッドでは TCP の文法を使えます。HTTP では、URL 内のテーブル識別子をパーセントエンコードしてください。

次の上限は値またはドキュメント単位です。特記がなければサイズの単位はバイトです。

| 項目 | 上限 |
|------|------|
| 保存する主キー値 | 1 MiB |
| 1ドキュメントあたりのフィルタ数 | 1,000 |
| フィルタ名 | 1 KiB |
| 文字列型フィルタ値 | 64 KiB |
| 元テキストと正規化テキスト | 各16 MiB |

初回 `SYNC` では上限を超える候補スナップショットを拒否します。binlog取り込み中に値が上限を超えるとエラーになり、そのイベントを越えて適用GTIDを進めません。

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
tables:
  - name: "articles"
    text_source:
      column: "content"
    filters:
      - name: "status"
        type: "int"
      - name: "category"
        type: "string"
      - name: "created_at"
        type: "datetime"
```

フィルタ型は `mediumint` と `mediumint_unsigned` を含む符号あり/なし整数、`double`、`boolean`、`string`、`varchar`、`text`、`datetime`、`date`、`timestamp`、`time` に対応します。`float`、`enum`、`set` はフィルタ型として設定できません。`FLOAT` カラムを主キーまたはテキストソースに指定した場合も、初期ロードの結果と binlog 行イメージで値を同じように保持できないため拒否されます。`boolean` はMySQLの符号付き `TINYINT(1)` に対応します。検索時の `FILTER` 値は小文字の `true`/`false` または `1`/`0` を指定してください。`required_filters` の boolean 値は大文字小文字を区別せず、`=`、`!=`、`IS NULL`、`IS NOT NULL` を使えます。

型が `datetime`、`date`、`timestamp` の `required_filters` では、エポック秒または `mysql.datetime_timezone` で指定したオフセットの ISO 日時を使います。小数秒は使えますが、末尾の `Z`、数値オフセット、その他の接尾辞は拒否されます。`time` は符号付きの経過秒数または `HH:MM:SS` などの MySQL `TIME` 形式で指定でき、小数秒にも対応します。値は `-838:59:59` から `838:59:59` の範囲に収めてください。検索時の `FILTER` では `datetime`、`date`、`timestamp` にエポック秒、`time` に符号付きの経過秒数を使います。

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

`ngram_size` は、かな、ASCII/英数字など CJK の漢字以外の文字種に適用されます。省略時のデフォルトは `2` です。ユニグラムの挙動が必要な場合だけ `ngram_size: 1` を明示してください。`kanji_ngram_size` は CJK の漢字だけに適用され、`0` の場合は `ngram_size` を使います。`cross_boundary_ngrams` は `字A` のような文字種境界をまたぐ N-gram を生成するかを制御します。

::: info 用語補足
**N-gram** は文字列を小さな断片に分けたものです。日本語のように単語の区切りが空白で分からない言語でも、文字単位・2文字単位で分けることで辞書なしに検索できます。
:::

::: warning 予約済みの posting キー
`posting` ブロック全体（`block_size`、`freq_bits`、`use_roaring`）は検証されダンプにも保存されますが、まだ挙動には反映されません。デルタ符号化からRoaring Bitmapへの変換は `use_roaring` ではなく `memory.roaring_threshold` と `OPTIMIZE` が制御します。
:::

BM25スコアリングやハイライトは保存された正規化テキストを使用します。`memory.verify_text` は N-gram候補を検証するかどうかを制御するだけで、テキスト保存を無効にせず、`freq_bits` にも影響しません。

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

`auto_initial_snapshot` のデフォルトは `false` です。初回ロードは、読み込みたい各テーブルに対して `SYNC <table>` を明示的に実行します。起動時に大きなテーブルを意図せず読み込むことを避けるためです。起動時ロードが必要な場合のみ `true` にしてください。`auto_initial_snapshot: true` は、単一テーブル構成でも複数テーブル構成でも `start_from: "snapshot"` を必要とします。`dump.load_on_startup: true` も同じ条件を必要とします。復元したダンプのGTIDからレプリケーションを再開し、変更を飛ばさないためです。

`start_from` は次を指定できます。

| 値 | 挙動 |
|----|------|
| `snapshot` | スナップショット/ダンプが取得したGTIDから再開 |
| `latest` | ソースの現在のGTIDから開始し、過去変更は無視 |
| `gtid=<position>` | MySQL GTIDセット（`UUID:txn[-txn]`、カンマ区切り）またはMariaDB GTIDリスト（`domain-server-seq`、カンマ区切り）から開始 |

MySQL GTIDのトランザクション番号は `2^63−1` 未満でなければなりません。MariaDBは別形式の `domain-server-seq` を使います。単一のMySQL `UUID:txn` は、そのトランザクションまでを意味します。`gtid=...` がどちらの形式にも合わない場合は設定検証で拒否します。ソースが `binlog_row_metadata=FULL` を有効にする前の TABLE_MAP イベントを再生する可能性がある場合は、ソース設定を変えた後、レプリケーション対象の全テーブルで `SYNC` を実行してください。

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

`hard_limit_mb` と `soft_target_mb` は予約項目で、プロセスのメモリ使用量を制限しません。ただし設定値には範囲があります。`hard_limit_mb` は `256` から `2147483647`、`soft_target_mb` は `128` から `2147483647` までです。`arena_chunk_mb` と `minute_epoch` も予約項目です。インデックス全体と保存する正規化テキストがRAMに収まるようにホストを用意してください。

`memory.normalize.nfkc` はUnicode NFKC正規化、`width` は文字幅の扱い（`keep`、`narrow`、`wide`）、`lower` は小文字化の有無を指定します。デフォルトはそれぞれ `true`、`narrow`、`false` です。設定はインデックス対象テキストと検索語の両方に適用されます。ダンプの復元時は、実行中の設定と同じ正規化設定が必要です。

::: warning メモリ上限について
`hard_limit_mb` は現在、OSレベルのメモリ使用を強制的に止める仕組みではありません。実運用では、データ件数・保存テキスト・`verify_text`・キャッシュ量を見積もり、十分なRAMを確保してください。
:::

`verify_text` は N-gram候補を検証するかどうかを制御します。

| 値 | 挙動 |
|----|------|
| `off` | 最速。候補検証なし。N-gram由来の偽陽性があり得る |
| `ascii` | ASCIIのみのクエリを検証 |
| `all` | すべてのクエリを検証。正確性が必要な場合に推奨 |

通常の起動では `verify_text` の値にかかわらず正規化テキストを保存するため、`verify_text: "off"` でも `HIGHLIGHT` を使えます。BM25 `_score` ソートも語頻度計算に保存テキストを使います。

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

TCPとHTTPはデフォルトでループバックにバインドします。`worker_threads: 0` はワーカー数の自動設定です。`idle_timeout_sec: 0` でTCPアイドル接続の回収を無効にします。保留フレーム上限はワーカー待ちの完了済みリクエストを制限します。`max_pending_frame_bytes` のデフォルトは4 MiBで、接続ごとの独立したバイト上限です。`max_query_length` はUnicode文字数を数えます。どちらかの保留フレーム上限の75%で読み取りを止め、キューが減ると再開します。`api.default_limit` のデフォルトは100件です。`max_query_length` のデフォルトは128文字で、`0` なら上限なしです。`api.http.max_connections` はワーカー待ちのソケットを含め、受け付けるHTTP接続数を制限します。HTTPでCORSを有効にする場合、`cors_allow_origin` に応答で返すOrigin値を指定します。リストではありません。`api.http.trusted_proxies` には、ACLとレート制限で `X-Forwarded-For` をクライアントIPとして扱ってよい数値形式のリバースプロキシIPを指定します。プロキシを経由しない場合は空のままにしてください。`api.default_limit` と `api.max_query_length` は `SET` で実行時変更できます。ネットワークバインド、HTTPボディサイズ上限、多くの接続設定は再起動が必要です。

Unix socketを使う場合は `api.unix_socket.path` を設定し、`mygram-cli -s /path/to/mygramdb.sock` で接続します。起動時に既存のsocketを削除するのは、接続確認で古いsocketと判断できた場合だけです。通常ファイル、使用中のsocket、状態を確認できないパスは置き換えず、エラー6015で起動を拒否します。

::: info TCPとHTTPの役割
TCP APIは検索に加えて `SYNC`、`DUMP`、`SET` などの管理コマンドも扱います。HTTP APIは検索、カウント、ファセット、ドキュメント取得、ヘルスチェック、メトリクス、`POST /optimize`を扱います。
:::

### 管理操作の認証

`api.admin_token` は管理コマンド用の共有シークレットです。設定ファイルまたは `MYGRAM_API_ADMIN_TOKEN` で設定し、十分に長いランダム値を使ってリポジトリには保存しないでください。`api` ブロックがなくても環境変数は適用されます。TCPをUnix socketなしで非ループバックアドレスにバインドする場合、またはHTTPを有効にして非ループバックアドレスにバインドする場合はトークンが必須です。Unix socketで除外されるのはTCPリスナーだけで、HTTPには適用されません。設定しないとMygramDBは起動を拒否します。

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

TCPとHTTPは同じレートリミッタとクライアント単位のトークンバケットを共有します。そのため、同じクライアントがプロトコルを分散しても制限を2倍にはできません。以前のプロトコル別バースト量を維持する場合は、`capacity` と `refill_rate` を増やしてください。

`capacity` はリクエスト数で表す最大バースト量、`refill_rate` はクライアントごとに1秒あたり補充するトークン数です。デフォルトはそれぞれ `100` と `10` です。`enable`、`capacity`、`refill_rate` は `SET` で実行時に変更できます。`max_clients` は起動時専用で、追跡するクライアントのバケット数を制限します。接続を許可するクライアント数の上限ではありません。

## 関連度スコアリング（BM25）

```yaml
bm25:
  enable: false
  k1: 1.2
  b: 0.75
```

BM25はデフォルトで無効です。`enable` を `true` にするまで `SORT _score` は `SORT _score requires BM25 to be enabled in configuration` で失敗します。通常の起動では `memory.verify_text` の値にかかわらず、語句頻度の計算に必要な正規化テキストを保存します。

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
    max_queue_size: 100000
```

`max_memory_mb` はキャッシュ結果、コンテナ、インデックス、無効化メタデータ、遅延無効化キューを含む共有上限です。起動時に `1` 未満、`1048576` MBを超える値、キャッシュ有効時に物理メモリの50%を超える値を拒否します。物理メモリを取得できない場合は比率の検査を警告付きで省略します。`ttl_seconds` は `0` から `2147483647`、`eviction_batch_size` と `invalidation.batch_size` は `1` から `2147483647`、`invalidation.max_delay_ms` は `0` から `2147483647` の範囲です。`invalidation.max_queue_size` は `1` 以上にします。`ttl_seconds: 0` で有効期限を無効にします。実行時に変更する `min_query_cost_ms` は有限値でなければなりません。

キャッシュ対象は `min_query_cost_ms` より遅いクエリだけです。安価な検索でキャッシュを埋めて有用なエントリを追い出さないための仕組みです。`invalidation_strategy: "ngram"` は変更行と語が重なるエントリだけを無効化します。`"table"` は判定は軽い代わりに、そのテーブルの全エントリを破棄します。

`cache.enabled`、`cache.min_query_cost_ms`、`cache.ttl_seconds` は `SET` で実行時に変更できます。`max_memory_mb` とその他の起動時専用キャッシュ上限を変える場合は再起動が必要です。`CACHE STATS` / `CACHE CLEAR` コマンドは[運用ガイド](/ja/docs/operations)を参照してください。

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
  load_on_startup: false
  interval_sec: 7200
  retain: 3
  restore_memory_budget_mb: 4096
  restore_max_section_mb: 2048
```

`interval_sec` の単位は秒です。デフォルトの `0` は自動ダンプを無効にします。設定例では7200秒（2時間）ごとに有効化しています。`retain` は自動ダンプのローテーション数を指定します。手動の `DUMP SAVE` はパスを指定しない場合 `default_filename` を使い、`DUMP SAVE .` は拒否されます。`restore_memory_budget_mb` はV2復元時に段階的に保持するデータ全体の上限、`restore_max_section_mb` はV2ダンプの1セクションの上限です。`dump.load_on_startup: true` はMySQLのスナップショットより前に既定のダンプを試し、ソース識別子とGTIDを検証します。読み込みに失敗した場合はMySQLへ切り替えます。この設定には `replication.start_from: "snapshot"` が必要です。`DUMP SAVE` は復元上限を超えるドキュメントを拒否するため、読み込めないダンプを保存しません。設定済みの全テーブルで初期ロードが完了するまで、`DUMP SAVE` はエラー6029を返します。MySQL 対応ビルドで binlog reader がある場合は GTID 位置も必要で、取得できていない場合は同じエラーを返します。

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

IPv4に対応しない範囲を表すため、プレフィックスが `/96` より短いIPv4-mapped IPv6 CIDRは拒否されます。`/96` から `/128` までは対応するIPv4範囲に変換されます。

`0.0.0.0/0` と `::/0` は、どちらもすべてのIPv4およびIPv6アドレスからの接続を許可します。非ループバックTCPまたは有効なHTTPリスナーと組み合わせると起動時に拒否されます。

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

実行時に変更できるのは `SHOW VARIABLES` で mutable として表示される項目だけです。`--schema` を指定して起動した場合、`SET` にもそのスキーマの制約が適用されます。制約に反する値はエラー1004、未知の変数は1008、起動時専用の変数は1009を返します。MySQL接続先、テーブル、`memory.verify_text`、ダンプディレクトリ、ネットワークACL、リスナーのbind設定は再起動が必要です。
