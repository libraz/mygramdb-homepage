---
title: MygramDB 設定リファレンス - config.yaml の全項目
description: MygramDB の設定リファレンス。MySQL 接続、テーブルとフィルタの定義、N-gram、同義語、レプリケーション、メモリ、API サーバー、レート制限、BM25、クエリキャッシュ、ダンプ、ネットワーク ACL、ログを説明します。
head:
  - - meta
    - name: keywords
      content: MygramDB 設定, config.yaml, ngram_size, verify_text, required_filters, BM25 設定, クエリキャッシュ, network allow_cidrs, ランタイム変数
---

# 設定

MygramDB は YAML または JSON の設定ファイルを読み込みます。起動時に組み込み JSON Schema で検証されるため、未知のキー、型違い、必須項目不足、無効な enum 値は起動前に検出されます。

::: info このページの読み方
最初は「MySQL 接続」「tables」「replication.server_id」「network.allow_cidrs」だけ理解すれば動かせます。その他の項目は、検索精度、メモリ使用量、運用方法を調整したくなった段階で読めば十分です。
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

`mysql.user`、`mysql.database`、1 つ以上のテーブルは、環境変数による上書きを適用した後に必須です。`MYGRAM_MYSQL_USER` と `MYGRAM_MYSQL_DATABASE` で値を指定する場合は、`mysql` ブロックを省略できます。

レプリケーションはデフォルトで有効で、その場合は `replication.server_id` が必須です。`1` から `4294967295` までの 0 以外の値を指定し、MySQL レプリカや他の MygramDB インスタンスと重複させないでください。

::: tip 最小設定の次に行うこと
設定ファイルを書いただけでは既存データは読み込まれません。起動後に `SYNC articles` のように対象テーブルを同期し、`SYNC STATUS` で完了を確認してください。
:::

::: info 用語補足
**server_id** は、MySQL レプリケーションの接続を識別する番号です。同じ MySQL に接続する他の MySQL レプリカや MygramDB と重複させないでください。重複すると、MySQL 側が両者を区別できなくなります。
:::

## MySQL / MariaDB 接続

MygramDB は MySQL 8.4/9.7/26.x と MariaDB 10.11+/11.x/12.x に対応します。どちらも同じ `mysql` セクションを使います。MygramDB は機能プローブでサーバーの種類を判定し、適切な GTID 形式を選びます。

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

`datetime_timezone` は、MySQL の `DATETIME` と `DATE` の値、および日時型の `required_filters` のリテラルを解釈するときの基準です。`TIME` は秒数で表す期間なので、このオフセットを使いません。`TIMESTAMP` は常に UTC として扱います。

`connect_timeout_ms`、`read_timeout_ms`、`write_timeout_ms` の単位はミリ秒、`session_timeout_sec` の単位は秒です。

TLS はデフォルトで無効です。上の例では有効にしているため、証明書のパスはサーバー上にあるファイルへ置き換えてください。TLS を使わないソースに接続する場合は、`ssl_enable: false` にして証明書のパスを削除します。

| キー | 役割 |
|-----|------|
| `ssl_enable` | TLS を有効にする（デフォルトは `false`） |
| `ssl_verify_server_cert` | サーバー証明書を検証する。検証付き TLS では `true` のままにする |
| `ssl_ca` | 検証を有効にする場合は必須。サーバー証明書に署名した CA 証明書のパス |
| `ssl_cert`、`ssl_key` | ソースがクライアント証明書認証を求める場合だけ必要。不要なら削除する |

次の `mysql` キーは環境変数で上書きできます。`mysql` ブロックがなくても環境変数は適用されます。

| キー | 環境変数 |
|-----|----------|
| `mysql.host` | `MYGRAM_MYSQL_HOST` |
| `mysql.port` | `MYGRAM_MYSQL_PORT` |
| `mysql.user` | `MYGRAM_MYSQL_USER` |
| `mysql.password` | `MYGRAM_MYSQL_PASSWORD` |
| `mysql.database` | `MYGRAM_MYSQL_DATABASE` |

`MYGRAM_MYSQL_PORT` は `1` から `65535` までの整数でなければならず、無効な値の場合は起動に失敗します。

`mysql.ignored_ddl_prefixes` は、デフォルトが空の起動時専用リストです。分類されていない単独の DDL `QUERY_EVENT` を確認し、安全にスキップできると分かった場合だけ、そのプレフィックスを追加します。各エントリは次の条件を満たす必要があります。

- 空でなく、セミコロンを含まない。
- `ALTER`、`ANALYZE`、`CHECK`、`CREATE`、`DROP`、`OPTIMIZE`、`RENAME`、`REPAIR`、`TRUNCATE` のいずれかで始まる（大文字小文字は区別しません）。DML のプレフィックスは拒否されます。

このリストは、設定済みテーブルとデータベースの安全確認を上書きしません。設定済みデータベースに対する `DROP DATABASE` や `DROP SCHEMA` は、`DROP` を指定していてもレプリケーションを停止します。変更は再起動後に反映されます。

::: tip DATETIME と TIMESTAMP の違い
MySQL の `DATETIME` は、タイムゾーン情報を持たない日時です。MygramDB は `datetime_timezone` を使って、その値がどのタイムゾーンの時刻かを判断します。`TIMESTAMP` は MySQL が UTC に変換して保持するため、この設定の影響を受けません。
:::

`mysql.binlog_format` と `mysql.binlog_row_image` は、ソースサーバーの値が期待どおりかを検証する項目で、MySQL や MariaDB の設定は変更しません。ソースでは `binlog_row_metadata=FULL` も設定してください。これはサーバー側の設定で、MygramDB の設定キーではありません。ソースとテーブルの要件、および拒否される条件は [MySQL レプリケーション](/ja/docs/replication#%E3%82%BD%E3%83%BC%E3%82%B9%E3%81%A8%E3%83%86%E3%83%BC%E3%83%95%E3%82%99%E3%83%AB%E3%81%AE%E6%A4%9C%E8%A8%BC)を参照してください。

### 必須の MySQL 設定

```ini
binlog_format = ROW
binlog_row_image = FULL
binlog_row_metadata = FULL
binlog_checksum = CRC32
```

これらは MySQL または MariaDB のソース側に設定します。MygramDB は起動時と再接続時に値を検証します。YAML の `mysql` セクションからは、ソースサーバーの設定を変更できません。

ソースは、圧縮されていない binlog イベントを書き込む必要があります。MySQL では `binlog_transaction_compression=OFF`、MariaDB では `log_bin_compress=OFF` にします。MySQL の `binlog_row_value_options` に `PARTIAL_JSON` を含めないでください。

MySQL では GTID を有効にします。

```ini
gtid_mode = ON
enforce_gtid_consistency = ON
```

MariaDB では、ネイティブの `domain-server-sequence` 形式の GTID を使います。`server_id` を設定し、ROW 形式の binlog を有効にして、`binlog_storage_engine` は未設定のままにします。

ソース自体がレプリカの場合は、複製した変更を binlog に書き込むため、MySQL では `log_replica_updates`、MariaDB では `log_slave_updates` も有効にします。

### 必須権限

```sql
GRANT SELECT, REPLICATION SLAVE, REPLICATION CLIENT ON *.* TO 'repl_user'@'%';
FLUSH PRIVILEGES;
```

::: warning 権限を絞る場合
本番では、`SELECT` を `*.*` ではなく検索対象の DB だけに絞れます。ただし、初期 `SYNC` には対象テーブルの読み取り権限が必要で、binlog への追従には `REPLICATION SLAVE` と `REPLICATION CLIENT` が必要です。
:::

## テーブル設定

各テーブルは `<database>.<table>` のテーブル識別子を持ちます。`tables[*].database` を省略した場合、`mysql.database` が使われます。

MygramDB は、レプリケーションを始める前に、ソースの要件、主キーの一意性、外部キーの更新・削除動作、カラム定義を検証します。拒否される条件とエラーコードは [MySQL レプリケーション](/ja/docs/replication#%E3%82%BD%E3%83%BC%E3%82%B9%E3%81%A8%E3%83%86%E3%83%BC%E3%83%95%E3%82%99%E3%83%AB%E3%81%AE%E6%A4%9C%E8%A8%BC)を参照してください。

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

単一 DB 構成では `SEARCH articles hello` のような修飾なしのテーブル参照も使えます。設定が 2つ以上の DB にまたがる場合、TCP、CLI、C/C++、HTTP のすべてで `<database>.<table>` の指定が必要です。

::: info 用語補足
**テーブル識別子**は、MygramDB が検索対象のテーブルを指すときの名前です。単一 DB なら `articles` だけで足りますが、複数 DB では `app_db.articles` のように DB 名も含めます。
:::

`text_source` では、`column` か `concat` のどちらかを指定します。

| 項目 | 意味 |
|------|------|
| `column` | 1 つのテキストカラムをインデックス化 |
| `concat` | 2 つ以上のカラムを連結してインデックス化 |
| `delimiter` | `concat` で使う区切り文字（デフォルトは空白） |

::: warning 設定済みカラムの検証

初期ロードと binlog の読み取りで同じ値を扱えるよう、MygramDB はレプリケーションを始める前に次の規則を検証します。

- テーブル名、データベース名、主キー、フィルタ名、テキストソース名は、空でなく、NUL バイトを含まない SQL 識別子でなければなりません。ASCII に限らず、空白、`$`、Unicode、バッククォートを含む名前も、安全にクォートして扱えます。
- テーブル識別子は `(database, table)` の組です。同じ組は重複として拒否されます。
- 設定済みの主キー、テキストソース、フィルタカラムには、`FLOAT`、`JSON`、`GEOMETRY` とそのサブタイプ、`VECTOR`、`ZEROFILL`、`BINARY`、`VARBINARY`、`BLOB` 系の型、およびこのビルドが行イメージからデコードできない型を使えません。
- 文字列カラムには、`utf8mb4`、`utf8`/`utf8mb3`、`ascii` のいずれかの照合順序が必要です。
:::

## 識別子と取り込み上限

プロトコルでテーブルを指定するとき、単一 DB 構成ではテーブル名だけを使えます。複数 DB 構成では `<database>.<table>` を指定してください。

- raw TCP: 空白を含む識別子は、全体を引用して 1 つのトークンにします。
- ネイティブ C/C++ SDK: 型付きメソッドは、コマンドを組み立てる前に名前の空白を拒否します。raw コマンドの送信メソッドでは TCP の文法を使えます。
- HTTP: URL 内のテーブル識別子をパーセントエンコードします。

次の上限は値またはドキュメント単位です。特記がなければサイズの単位はバイトです。

| 項目 | 上限 |
|------|------|
| 保存する主キー値 | 1 MiB |
| 1 ドキュメントあたりのフィルタ数 | 1,000 |
| フィルタ名 | 1 KiB |
| 文字列型フィルタ値 | 64 KiB |
| 元テキストと正規化テキスト | 各 16 MiB |

初回の `SYNC` は、上限を超える候補スナップショットを拒否します。binlog の取り込み中に値が上限を超えるとエラーになり、そのイベントを越えて適用済み GTID を進めません。

## フィルタ

`required_filters` はインデックス対象行を決めます。条件に一致しない行はインデックス化されません。レプリケーション中、条件から外れた行は削除され、条件に入った行は追加されます。

::: warning `required_filters` と `filters` の違い
`required_filters` は、行をそもそもインデックスに入れるかを決めます。`filters` は、検索時に絞り込めるカラムを登録します。論理削除済みの行を最初から検索対象外にしたい場合は `required_filters`、検索画面でステータス別に絞り込みたい場合は `filters` を使います。
:::

<DocDiagram name="filter-indexing" alt="required_filters はMySQLの行をインデックスに入れるかを決め、検索時の filters はインデックス済みの行をクエリ時に絞り込むことを示す図" />

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

対応するフィルタ型は次のとおりです。

- `mediumint` と `mediumint_unsigned` を含む、すべてのサイズの符号あり/なし整数
- `double`、`boolean`、`string`、`varchar`、`text`
- `datetime`、`date`、`timestamp`、`time`

`float`、`enum`、`set` はフィルタ型として設定できません。`FLOAT` カラムは、初期ロードの結果と binlog の行イメージで同じ値を保持できないため、主キーやテキストソースに指定した場合も拒否されます。

`boolean` は MySQL の符号付き `TINYINT(1)` に対応します。検索時の `FILTER` でも `required_filters` でも、boolean の値は `true`/`false` または `1`/`0` で、大文字小文字は区別しません。`boolean` の `required_filters` では `=`、`!=`、`IS NULL`、`IS NOT NULL` を使えます。

日時のフィルタでは、`required_filters` と検索時の `FILTER` で値の形式が異なります。

| フィルタ型 | `required_filters` の値 | 検索時の `FILTER` の値 |
|-----------|-------------------------|------------------------|
| `datetime`、`date`、`timestamp` | エポック秒、または `mysql.datetime_timezone` のオフセットで書いた ISO 日時。小数秒は使えるが、末尾の `Z`、数値オフセット、その他の接尾辞は拒否される | エポック秒 |
| `time` | 符号付きの経過秒数、または `HH:MM:SS` などの MySQL `TIME` 形式（小数秒も可）。範囲は `-838:59:59` から `838:59:59` | 符号付きの経過秒数 |

::: warning 予約済みのフィルタキー
`bitmap_index`、`dict_compress`、`bucket` はスキーマ上受け付けられ、ダンプにも保存されますが、まだ動作には影響しません。指定しても、インデックスの構築やクエリの性能は変わりません。
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

`ngram_size` は、かな、ASCII/英数字など、CJK の漢字以外の文字種に適用されます。省略時のデフォルトは `2` です。ユニグラムの動作が必要な場合だけ、`ngram_size: 1` を明示してください。`kanji_ngram_size` は CJK の漢字だけに適用され、`0` の場合は `ngram_size` を使います。`cross_boundary_ngrams` は、`字A` のように文字種の境界をまたぐ N-gram を生成するかどうかを制御します。

::: info 用語補足
**N-gram** は、文字列を短い断片に分けたものです。単語ではなく文字単位で分けるため、日本語のように空白で単語を区切らない言語でも、辞書なしで検索できます。
:::

::: warning 予約済みの posting キー
`posting` ブロック全体（`block_size`、`freq_bits`、`use_roaring`）は検証され、ダンプにも保存されますが、まだ動作には反映されません。デルタ符号化から Roaring Bitmap への変換を制御するのは、`use_roaring` ではなく `memory.roaring_threshold` と `OPTIMIZE` です。
:::

BM25 スコアリングとハイライトは、保存された正規化テキストを使います。`memory.verify_text` が制御するのは N-gram 候補の検証だけです。テキストの保存を無効にすることはなく、`freq_bits` にも影響しません。

## テーブル単位の同義語

同義語展開はグローバルではなく、テーブルごとに設定します。

::: tip 同義語設定の単位
同じ単語でも、テーブルによって意味が違うことがあります。商品カタログで役立つ同義語が、記事アーカイブでは不適切な場合もあります。そのため MygramDB では、グローバルではなく `tables[*].synonyms` でテーブルごとに設定します。
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

TSV 形式で、1 行が 1 グループです。

```tsv
car	automobile	vehicle
fast	quick	rapid	speedy
# コメント行は無視されます
```

グループ内のどの語で検索しても、同じグループの他の語へ展開されます。語句は、インデックスと同じ正規化設定で処理されます。

## レプリケーション

```yaml
replication:
  enable: true
  auto_initial_snapshot: false
  server_id: 83917
  start_from: "snapshot"
  queue_size: 10000
```

`auto_initial_snapshot` のデフォルトは `false` です。初回ロードは、読み込みたいテーブルごとに `SYNC <table>` を明示的に実行します。起動時に大きなテーブルを意図せず読み込むことを避けるためです。起動時のロードが必要な場合だけ `true` にしてください。

`auto_initial_snapshot: true` には、単一テーブル構成でも複数テーブル構成でも `start_from: "snapshot"` が必要です。`dump.load_on_startup: true` にも同じ条件があります。復元したダンプに保存された GTID からレプリケーションを再開し、変更を取りこぼさないためです。

`start_from` には次の値を指定できます。

| 値 | 挙動 |
|----|------|
| `snapshot` | 初期スナップショットまたはダンプが記録した GTID から再開 |
| `latest` | ソースの現在の GTID から開始し、過去の変更は無視 |
| `gtid=<position>` | MySQL GTID セット（`UUID[:tag]:txn[-txn]`、カンマ区切り）または MariaDB GTID リスト（`domain-server-seq`、カンマ区切り）から開始 |

MySQL GTID のトランザクション番号は `2^63−1` 未満でなければなりません。MariaDB は別形式の `domain-server-seq` を使います。MySQL で `UUID:txn` や `UUID:tag:txn` と書いた位置は、そのトランザクションまでを意味します。`gtid=...` の値がどちらの形式にも合わない場合は、`gtid=,` のように区切り文字しかない値も含めて、設定検証で拒否されます。

ソースが `binlog_row_metadata=FULL` を有効にする前に書かれた TABLE_MAP イベントを再生する可能性がある場合は、ソース設定を変えた後、レプリケーション対象の全テーブルで `SYNC` を実行してください。

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

`hard_limit_mb` と `soft_target_mb` は予約項目で、プロセスのメモリ使用量を制限しません。ただし、設定できる値には範囲があります。`hard_limit_mb` は `256` から `2147483647`、`soft_target_mb` は `128` から `2147483647` までです。`arena_chunk_mb` と `minute_epoch` も予約項目です。インデックス全体と保存する正規化テキストが RAM に収まるようにホストを用意してください。

`memory.normalize` のキーでテキストの正規化を指定します。

| キー | 値 | デフォルト |
|-----|-----|-----------|
| `nfkc` | `true` / `false`。Unicode NFKC 正規化 | `true` |
| `width` | `keep`、`narrow`、`wide`。文字幅の扱い | `narrow` |
| `lower` | `true` / `false`。小文字化 | `false` |

これらの設定は、インデックス対象のテキストと検索語の両方に適用されます。ダンプを復元するときは、実行中の設定と同じ正規化設定が必要です。

::: warning メモリ上限について
`hard_limit_mb` は現在、OS レベルでメモリ使用を止める仕組みではありません。本番では、データ件数、保存するテキスト、`verify_text`、キャッシュ量から必要量を見積もり、十分な RAM を確保してください。
:::

`verify_text` は N-gram 候補を検証するかどうかを制御します。

| 値 | 挙動 |
|----|------|
| `off` | 最速。候補を検証しない。N-gram 由来の偽陽性があり得る |
| `ascii` | ASCII のみのクエリを検証 |
| `all` | すべてのクエリを検証。結果の正確さが必要な場合に推奨 |

通常の起動では、`verify_text` の値にかかわらず正規化テキストを保存します。そのため、`verify_text: "off"` でも `HIGHLIGHT` を使えます。BM25 の `_score` ソートも、語の出現頻度の計算に保存テキストを使います。

## API サーバー

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

TCP と HTTP は、デフォルトでループバックにバインドします。個別の設定は次のとおりです。

| 設定 | 動作 |
|------|------|
| `tcp.worker_threads` | `0` でワーカー数を自動設定する |
| `tcp.idle_timeout_sec` | `0` で TCP のアイドル接続の回収を無効にする |
| `tcp.max_pending_frames` | ワーカー待ちの完了済みリクエストの数を制限する |
| `tcp.max_pending_frame_bytes` | 接続ごとの保留フレームのバイト上限。デフォルトは 4 MiB |
| `max_query_length` | Unicode 文字数で数える。デフォルトは 128 で、`0` なら上限なし |
| `default_limit` | 結果件数のデフォルト。デフォルトは 100 |
| `http.max_connections` | ワーカー待ちのソケットを含め、受け付ける HTTP 接続数を制限する |
| `http.cors_allow_origin` | CORS を有効にする場合に応答で返す Origin 値を 1 つ指定する。リストではない |
| `http.trusted_proxies` | ACL とレート制限で、`X-Forwarded-For` をクライアントの識別に使ってよいリバースプロキシの数値 IP アドレス。プロキシを経由しない場合は空にする |

どちらかの保留フレーム上限の 75% に達すると読み取りを止め、キューが減ると再開します。

`api.default_limit` と `api.max_query_length` は、`SET` で実行時に変更できます。ネットワークのバインド、HTTP のボディサイズ上限、多くの接続設定は、再起動が必要です。

Unix socket を使う場合は、`api.unix_socket.path` を設定し、`mygram-cli -s /path/to/mygramdb.sock` で接続します。起動時に既存の socket を削除するのは、接続確認で古い socket と判断できた場合だけです。通常のファイル、使用中の socket、状態を確認できないパスは置き換えず、エラー 6015 で起動を拒否します。

::: info TCP と HTTP の役割
TCP API は検索に加えて `SYNC`、`DUMP`、`SET` などの管理コマンドも扱います。HTTP API は検索、カウント、ファセット、ドキュメント取得、ヘルスチェック、メトリクス、`POST /optimize` を扱います。
:::

### 管理操作の認証

`api.admin_token` は、管理コマンド用の共有シークレットです。設定ファイルまたは `MYGRAM_API_ADMIN_TOKEN` で設定します。十分に長いランダムな値を使い、ソース管理には含めないでください。`api` ブロックがなくても環境変数は適用されます。

次のどちらかの場合は、トークンが必須です。トークンがないと、MygramDB は起動を拒否します。

- TCP を Unix socket なしで、非ループバックアドレスにバインドする
- HTTP を有効にして、非ループバックアドレスにバインドする

Unix socket で必須でなくなるのは TCP リスナーだけで、HTTP には当てはまりません。

管理コマンドの前に TCP 接続を認証します。

```mygram
AUTH replace-with-a-high-entropy-secret
SYNC articles
```

`POST /optimize` には同じトークンを HTTP Bearer 認証で渡します。

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

TCP と HTTP は、同じレートリミッタとクライアント単位のトークンバケットを共有します。そのため、クライアントがリクエストを 2 つのプロトコルに分けても、割り当てを 2 倍にはできません。プロトコル別のバースト量を前提に運用していた場合は、合計のレートを保てるよう `capacity` と `refill_rate` を増やしてください。

`capacity` はリクエスト数で表す最大バースト量、`refill_rate` はクライアントごとに 1 秒あたり補充するトークン数です。デフォルトはそれぞれ `100` と `10` です。`enable`、`capacity`、`refill_rate` は `SET` で実行時に変更できます。`max_clients` は起動時専用で、追跡するクライアントのバケット数を制限します。接続を許可するクライアント数の上限ではありません。

## 関連度スコアリング（BM25）

```yaml
bm25:
  enable: false
  k1: 1.2
  b: 0.75
```

BM25 はデフォルトで無効です。`enable` を `true` にするまで、`SORT _score` は `SORT _score requires BM25 to be enabled in configuration` で失敗します。通常の起動では、`memory.verify_text` の値にかかわらず、語の出現頻度の計算に必要な正規化テキストを保存します。

`k1` は、語の出現頻度の飽和度を制御します。値を大きくすると、同じ語が繰り返されるほどスコアが伸び続けます。`b` はドキュメント長の正規化の度合いで、`0.0`（無効）から `1.0`（完全）の範囲で指定します。

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

`max_memory_mb` は、キャッシュ結果、コンテナ、インデックス、無効化メタデータ、遅延無効化キューを合わせた共有上限です。次の範囲外の値は、起動時に拒否されます。

| 設定 | 指定できる範囲 |
|------|----------------|
| `max_memory_mb` | `1` から `1048576`。キャッシュが有効な場合は、検出した物理メモリの 50% 以下 |
| `ttl_seconds` | `0` から `2147483647`。`0` で有効期限を無効にする |
| `eviction_batch_size` | `1` から `2147483647` |
| `invalidation.batch_size` | `1` から `2147483647` |
| `invalidation.max_delay_ms` | `0` から `2147483647` |
| `invalidation.max_queue_size` | `1` 以上 |

物理メモリを検出できない場合は、50% の検査を警告を出して省略します。実行時に `min_query_cost_ms` を変更するときは、有限の値を指定してください。

キャッシュ対象は、`min_query_cost_ms` より遅いクエリだけです。軽い検索で有用なエントリが追い出されないようにするためです。`invalidation_strategy: "ngram"` は、変更された行と語が重なるエントリだけを無効化します。`"table"` は判定の計算が軽い代わりに、そのテーブルのエントリをすべて破棄するため、影響がはるかに大きくなります。

`cache.enabled`、`cache.min_query_cost_ms`、`cache.ttl_seconds` は、`SET` で実行時に変更できます。`max_memory_mb` とその他の起動時専用のキャッシュ上限を変えるには、再起動が必要です。`CACHE STATS` / `CACHE CLEAR` コマンドは[運用ガイド](/ja/docs/operations)を参照してください。

## インデックス構築

```yaml
build:
  mode: "select_snapshot"
  batch_size: 5000
```

`batch_size` は、`SYNC` による初期ロードで 1 回に取得する行数です。`mode` は現在 `select_snapshot` のみ指定できます。

::: warning 予約済みの build キー
`parallelism` と `throttle_ms` は検証されますが、まだ動作には反映されません。初期ロードはシングルスレッドで、スロットリングもしません。
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

| キー | 動作 |
|-----|------|
| `interval_sec` | 自動ダンプの間隔（秒）。デフォルトの `0` は自動ダンプを無効にする。例では 7200 秒（2 時間） |
| `retain` | 自動ダンプのローテーションを制御する |
| `default_filename` | パスを指定しない `DUMP SAVE` が使うファイル名。`DUMP SAVE .` は拒否される |
| `restore_memory_budget_mb` | V2 の復元時に段階的に保持するデータ全体の上限 |
| `restore_max_section_mb` | V2 ダンプの 1 セクションの上限 |
| `load_on_startup` | MySQL のスナップショットより前にデフォルトのダンプを試し、ソース識別子と GTID を検証する。読み込めない場合は MySQL に切り替える。`replication.start_from: "snapshot"` が必要 |

`DUMP SAVE` は、復元上限を超えるドキュメントを拒否します。読み込めないダンプは保存されません。設定済みの全テーブルで初期ロードが完了するまで、`DUMP SAVE` はエラー 6029 を返します。MySQL 対応ビルドで binlog リーダーがある場合は GTID 位置も必要で、取得できていないときは同じ 6029 を返します。

::: warning ダンプ保存先は永続化する
Docker や Kubernetes で運用する場合は、`dump.dir` を永続ボリュームに置いてください。コンテナ内の一時的なファイルシステムに保存すると、コンテナを再作成したときにダンプが失われます。
:::

## ネットワークセキュリティ

```yaml
network:
  allow_cidrs:
    - "127.0.0.1/32"
    - "10.0.0.0/8"
```

`allow_cidrs` が空または未設定の場合、接続は拒否されます。アクセスが必要なアプリケーションサーバーと運用ネットワークだけを追加してください。MygramDB にはネイティブ TLS がないため、必要に応じてリバースプロキシやロードバランサーで TLS を終端してください。管理コマンドは `api.admin_token` で認証します。通常の検索エンドポイントは、バインドアドレスと CIDR 許可リストで保護されます。

プレフィックスが `/96` より短い IPv4-mapped IPv6 CIDR は、有効な IPv4 範囲に対応しないため拒否されます。`/96` から `/128` までは、対応する IPv4 範囲に変換されます。

`0.0.0.0/0` と `::/0` は、どちらもすべての IPv4 および IPv6 アドレスからの接続を許可します。非ループバックの TCP リスナー、または有効な HTTP リスナーと組み合わせると、どちらも起動時に拒否されます。

::: danger 公開ネットワークへ直接出さない
MygramDB をインターネットへ直接公開しないでください。`allow_cidrs` に `0.0.0.0/0` または `::/0` を指定し、非ループバックの TCP または有効な HTTP をバインドする設定は起動時に拒否されます。制限した CIDR リストを使うか、リスナーをループバックに置いてリバースプロキシの背後で公開してください。
:::

## ログ

```yaml
logging:
  level: "info"
  format: "json"
  file: ""
```

`file: ""` はログを標準出力へ出します。Docker や systemd では、この設定を推奨します。

## ランタイム変数

TCP プロトコルで、MySQL 風のコマンドを使います。

```sql
SHOW VARIABLES
SHOW VARIABLES LIKE 'cache%'
SET logging.level = 'debug'
SET cache.enabled = false
SET api.default_limit = 200
```

実行時に変更できるのは、`SHOW VARIABLES` で mutable と表示される項目だけです。`--schema` を指定して起動した場合は、`SET` にもそのスキーマの制約が適用されます。`SET` に失敗すると、次のエラーを返します。

| エラー | 原因 |
|--------|------|
| 1004 | 値が `--schema` の制約に違反している |
| 1008 | 未知の変数 |
| 1009 | 起動時専用の変数 |

MySQL の接続先、テーブル、`memory.verify_text`、ダンプディレクトリ、ネットワーク ACL、リスナーの bind 設定は、再起動が必要です。
