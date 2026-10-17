---
title: MygramDB HTTP API - RESTful JSON検索エンドポイント
description: MygramDBのRESTful JSON APIリファレンス。検索、ドキュメントGET、/info、Prometheus /metrics、ヘルスプローブ、レプリケーションステータス、CORS、curl/JS/Pythonのクライアント例。
head:
  - - meta
    - name: keywords
      content: MygramDB HTTP API, REST JSON 検索, /metrics Prometheus, ヘルスチェック, レディネスプローブ, CORS, 検索エンドポイント, MySQL 全文検索 API
---

# HTTP API ガイド

MygramDB は、WebアプリケーションやHTTPクライアントとの統合を容易にするRESTful JSON APIを提供します。

::: info TCP APIとの違い
HTTP APIは検索・カウント・ファセット・ドキュメント取得をJSONで扱うための入口です。`SYNC`、`DUMP`、`SET` などの運用コマンドはTCP/CLI側で実行します。
:::

## 設定

`config.yaml` でHTTPサーバーを有効化します：

```yaml
api:
  tcp:
    bind: "127.0.0.1"
    port: 11016
  admin_token: "replace-with-a-secret"
  http:
    enable: true          # HTTPサーバーを有効化
    bind: "127.0.0.1"     # バインドアドレス（デフォルト: ローカルホストのみ）
    port: 8080            # HTTPポート（デフォルト: 8080）
    max_connections: 10000 # HTTP ワーカー待ちのソケットも含む
    max_body_bytes: 16777216 # リクエスト本文上限（既定は16 MiB）
    trusted_proxies: []   # X-Forwarded-For を信頼する数値形式のプロキシ IP
    enable_cors: false    # ブラウザ公開時のみ有効化
    cors_allow_origin: "" # CORS有効時は許可するOriginを指定
```

::: warning 公開時のセキュリティ
デフォルトでは TCP/HTTP サーバーはループバックにのみバインドします。公開する必要がある場合は `api.tcp.bind` / `api.http.bind` を明示的に設定し、`network.allow_cidrs` で許可 IP を厳密に指定し、MygramDB の前段に TLS/認証付きリバースプロキシ等を配置してください。CORS はデフォルトで無効であり、信頼できるOriginに限定して使用します。
:::

`api.http.max_connections` は、HTTP ワーカーを待つソケットも含めて受け入れる接続数を制限します。`api.http.max_body_bytes` を超える POST 本文は、ルーティング前に `413 Payload Too Large` で拒否されます。既定値は 16 MiB です。`api.http.trusted_proxies` には数値形式のプロキシ IP アドレスを列挙します。エントリは照合前に正規化されるため、デュアルスタックのリスナーでは IPv4 エントリが `a.b.c.d` と IPv4-mapped IPv6 形式の `::ffff:a.b.c.d` の両方に一致します。MygramDB は直接の TCP 接続元がこの一覧に一致した場合だけ `X-Forwarded-For` を信頼し、それ以外のクライアントが直接付けたヘッダーは無視します。得られたクライアント識別子は TCP と同じ方法で正規化されるため、ACL、レート制限、ログで同じ識別子が使われます。レート制限のバケットはプロトコル間で共有されます。

::: info 用語補足
**CORS** はブラウザが別ドメインのAPIを呼ぶための仕組みです。サーバー間通信では通常不要です。ブラウザから直接MygramDBを呼ぶ場合だけ、信頼できるOriginに限定して有効化してください。
:::

## API エンドポイント

ハンドラーが生成するレスポンスは、`/metrics` を除き `Content-Type: application/json` の JSON を返します。`/metrics` は Prometheus テキストを返します。CORS プリフライトの `OPTIONS` リクエストは本文なしの `204 No Content` を返します。テーブルルートは単一の
識別子セグメント `/tables/{identity}` を使用します。`{identity}` は DB 修飾名 `` `database.table` ``
です（たとえば `app_db` データベースの `articles` テーブルは `/tables/app_db.articles` と指定します）。
単一データベース構成（設定されている個別のデータベースが1つだけ）の場合は、修飾なしの `table` 名も
そのデータベースに解決されます。たとえば `/tables/articles` です。2つ以上のデータベースにまたがる構成の
場合にのみ修飾が必要となり、修飾なしの名前は曖昧として `404 Not Found` と `error_code: 4007` で拒否されます。

v1.7.0 で旧ルートの `/{table}/search`、`/{table}/count`、`/{table}/{primary_key}` は削除されました。テーブル操作はすべて `/tables/{identity}/...` を使ってください。

パスはルーティング前にパーセントデコードされます。ドキュメント GET ルートは手動でディスパッチするため、デコード後のパスが 256 バイトを超えても（URI の上限までは）ハンドラーに到達します。主キーの `%2F` は `/` として利用できます。

::: tip identity の考え方
`identity` は「検索対象テーブルを一意に表す名前」です。単一DBでは `articles`、複数DBでは `app_db.articles` のように指定します。
:::

### POST /tables/{identity}/search

フィルタとページネーションを使用した全文検索。

**リクエスト:**

```http
POST /tables/app_db.threads/search HTTP/1.1
Content-Type: application/json

{
  "q": "breaking news AND tech",
  "mode": "boolean",
  "filters": {
    "status": 1,
    "category": "tech"
  },
  "limit": 50,
  "offset": 0
}
```

**リクエストボディパラメータ:**

| フィールド | 型 | 必須 | 説明 |
|-----------|-----|------|------|
| `q` | string | はい | 検索テキスト。`mode` が `"boolean"` でない限りリテラルとして扱う |
| `mode` | string | いいえ | `"literal"`（既定）または `"boolean"` |
| `filters` | object | いいえ | スカラー値、または `{ "op": "...", "value": ... }` 形式のフィルタ条件 |
| `limit` | integer | いいえ | 返す最大結果数（デフォルト: 100、最大: 1000） |
| `offset` | integer | いいえ | スキップする結果数（デフォルト: 0） |
| `sort` | object | いいえ | ソート設定（例: `{"column": "_score", "order": "DESC"}`） |
| `highlight` | object | いいえ | ハイライト設定（下記参照） |
| `fuzzy` | integer | いいえ | あいまい検索の編集距離（`1` または `2`） |

`sort.column` を省略すると主キーでソートします。カラム名を指定する場合は、`order: "ASC"` または `"DESC"` と組み合わせます。たとえば `{ "sort": { "column": "created_at", "order": "DESC" } }` のように指定します。

`limit` は 1～1000 の範囲で指定します。1000 を超える値と 64 件を超えるフィルタ条件は `400 Bad Request` と `error_code: 3000` になります。整数以外の `limit` と 1 未満の値は `error_code: 3008` で拒否されます。

### リテラル検索とBoolean検索

HTTPでは、既定で `q` をリテラルな検索テキストとして扱います。たとえば `AND` や `LIMIT` は演算子や制御句ではなく、通常の検索語です。Boolean式を送るときだけ、`"mode": "boolean"` を明示してください。

```json
{
  "q": "tech AND (AI OR machine learning) NOT old",
  "mode": "boolean",
  "limit": 50
}
```

**Booleanクエリ構文（`mode: "boolean"`）:**

- **シンプル検索**: `"keyword"`
- **引用符付きフレーズ**: `"\"breaking news\""` （語句の並びを保ったフレーズを検索）
- **AND演算子**: `"tech AND AI AND machine learning"`
- **OR演算子**: `"(mysql OR postgresql) AND performance"`
- **NOT演算子**: `"news NOT sports"`
- **AND NOT形式**: `"news AND NOT sports"`（同じ除外条件）
- **組み合わせ**: `"tech AND AI NOT old"`

`limit`、`offset`、`sort`、`filters`、`highlight`、`fuzzy` はJSONフィールドで指定してください。`q` にこれらの制御句は書けません。リテラルモードでは `LIMIT` や `SORT` のような文字列も検索テキストの一部として扱われます。

各フィルタはスカラー値（既定では等価比較）または演算子オブジェクトで指定できます。オブジェクト形式では `value` が必須で、`op` は省略すると `EQ` になります。指定する場合、`op` は文字列でなければなりません。

```json
{
  "filters": {
    "price": { "op": "GTE", "value": 100 },
    "status": { "op": "EQ", "value": "active" }
  }
}
```

利用できる演算子は `EQ`、`NE`、`GT`、`GTE`、`LT`、`LTE` です（記号形式も利用できます）。`op` が文字列でない場合は `400 Bad Request` と `error_code: 3006`（`kQueryInvalidFilter`）になります。符号なし JSON 整数は 64 ビット値のまま扱われるため、`INT64_MAX` を超える符号なし `BIGINT` もラップアラウンドせず比較されます。

Boolean モードでは TCP API と同じ Unicode 空白のトークナイザーを使います。たとえば全角スペース（U+3000）は ASCII のスペースと同じく語の区切りになります。

**レスポンス (200 OK):**

```json
{
  "count": 2,
  "limit": 50,
  "offset": 0,
  "results": [
    {
      "primary_key": "article_101",
      "filters": {
        "status": 1,
        "category": "tech"
      }
    },
    {
      "primary_key": "article_205",
      "filters": {
        "status": 1,
        "category": "tech"
      }
    }
  ]
}
```

**エラーレスポンス (400 Bad Request):**

```json
{
  "error": "Missing required field: q",
  "error_code": 3000
}
```

**エラーレスポンス (500 Internal Server Error):**

```json
{
  "error": "Internal server error",
  "error_code": 5
}
```

**ハイライト設定:**

| フィールド | 型 | デフォルト | 説明 |
|-----------|-----|-----------|------|
| `open_tag` | string | `<em>` | ハイライトする語句の開始タグ |
| `close_tag` | string | `</em>` | ハイライトする語句の終了タグ |
| `snippet_length` | integer | 100 | スニペットあたりの最大コードポイント数（1-10,000） |
| `max_fragments` | integer | 3 | スニペットフラグメントの最大数（1-100） |

**ハイライト付き検索の例:**

```http
POST /tables/app_db.articles/search HTTP/1.1
Content-Type: application/json

{
  "q": "機械学習",
  "highlight": {
    "open_tag": "<strong>",
    "close_tag": "</strong>",
    "snippet_length": 150,
    "max_fragments": 5
  },
  "sort": {"column": "_score", "order": "DESC"},
  "limit": 10
}
```

### POST /tables/{identity}/count

全文クエリと任意のフィルタに一致するドキュメント数をカウントします。COUNT は合計件数のみを返します。
ページネーション、ハイライト、あいまい検索、`_score` ソートは検索専用の機能であり、このエンドポイントでは拒否されます。

**リクエスト:**

```http
POST /tables/app_db.threads/count HTTP/1.1
Content-Type: application/json

{
  "q": "breaking news AND tech",
  "mode": "boolean",
  "filters": {
    "status": 1
  }
}
```

**レスポンス (200 OK):**

```json
{
  "count": 42
}
```

### POST /tables/{identity}/facet

カラムのファセットバケットを返します。クエリとフィルタでスコープを限定することもできます。

**リクエストボディパラメータ:**

| フィールド | 型 | 必須 | 説明 |
|-----------|----|------|------|
| `column` | string | はい | 集計対象のフィルタカラム |
| `q` | string | いいえ | ファセット対象を絞る検索クエリ |
| `mode` | string | いいえ | `q` の `"literal"`（既定）または `"boolean"` |
| `filters` | object | いいえ | 追加のフィルタ条件 |
| `limit` | integer | いいえ | 返すファセットバケット数の上限（1-1000） |
| `offset` | integer | いいえ | スキップするファセットバケット数（既定: 0） |

`sort`、`highlight`、`fuzzy` は FACET ではサポートされず、指定するとエラーになります。FACET のカラム名の構文が不正な場合は `400 Bad Request` と `error_code: 3000` を返します。名前の形式が正しくても、設定済みのフィルタカラムがなければ `400` と `error_code: 4000` を返します。

**リクエスト:**

```http
POST /tables/app_db.articles/facet HTTP/1.1
Content-Type: application/json

{
  "column": "category",
  "q": "database OR mysql",
  "mode": "boolean",
  "filters": {
    "status": 1
  },
  "limit": 10
}
```

**レスポンス (200 OK):**

```json
{
  "column": "category",
  "count": 2,
  "facets": [
    {"value": "tech", "count": 15},
    {"value": "ops", "count": 7}
  ]
}
```

### HTTP API の公開範囲

HTTP API は検索、カウント、ドキュメント取得、ヘルス、メトリクス、レプリケーションステータス、機密値を伏せた設定の参照、`POST /optimize` を公開します。`SET`、`SHOW VARIABLES`、`SYNC`、`DUMP` は TCP/CLI コマンドであり、HTTP ルートはありません。

### POST /optimize

1つのテーブル、または設定済みの全テーブルのポスティングリストを最適化します。JSON オブジェクトに任意の修飾済み `table` 名を指定します。空のオブジェクトは全テーブルを対象にします。

```http
POST /optimize HTTP/1.1
Content-Type: application/json
Authorization: Bearer <token>

{"table":"app_db.articles"}
```

`Content-Type` は `application/json` でなければなりません。`api.admin_token` が空でない場合、このエンドポイントには正確な `Authorization: Bearer <token>` ヘッダーが必要です。満たさない場合は `WWW-Authenticate: Bearer` と `error_code: 7` を含む `401` を返します。トークンは定数時間で比較します。このトークンをアクセス許可の条件にする HTTP ルートは `GET /config`、`GET /replication/status`、`POST /optimize` の3つだけです。`GET /health/ready`、`GET /health/detail`、`GET /metrics` は同じ認証情報を参照して保護されたレプリケーション情報を表示しますが、ルート自体は公開されています。

成功時は `{ "status": "ok", "result": "OPTIMIZED ..." }` を含む `200` を返します。本文で受け付けるフィールドは `table` だけです。未知のフィールドまたは文字列以外のテーブル名は `400` のリクエストエラーになります。

### GET /tables/{identity}/{primary_key}

プライマリキーで単一のドキュメントを取得します。

**リクエスト:**

```http
GET /tables/app_db.threads/thread_12345 HTTP/1.1
```

**レスポンス (200 OK):**

```json
{
  "primary_key": "thread_12345",
  "filters": {
    "status": 1,
    "user_id": 42
  }
}
```

**エラーレスポンス (404 Not Found):**

```json
{
  "error": "Document not found",
  "error_code": 4004
}
```

### GET /info

サーバー情報と詳細統計（Redis風の監視情報）。

::: info /info の用途
`/info` は人が読んだり、簡単な監視スクリプトからJSONとして扱ったりする用途に向いています。Prometheus/Grafanaで継続監視する場合は `/metrics` を使ってください。
:::

**リクエスト:**

```http
GET /info HTTP/1.1
```

**レスポンス (200 OK):**

```json
{
  "server": "MygramDB",
  "version": "1.11.0",
  "uptime_seconds": 3600,
  "total_requests": 15000,
  "total_commands_processed": 15000,
  "memory": {
    "used_memory_bytes": 524288000,
    "used_memory_human": "500.00 MB",
    "peak_memory_bytes": 629145600,
    "peak_memory_human": "600.00 MB",
    "used_memory_index": "400.00 MB",
    "used_memory_documents": "100.00 MB",
    "total_system_memory": 17179869184,
    "total_system_memory_human": "16.00 GB",
    "available_system_memory": 9126805504,
    "available_system_memory_human": "8.50 GB",
    "system_memory_usage_ratio": 0.47,
    "process_rss": 545259520,
    "process_rss_human": "520.00 MB",
    "process_rss_peak": 629145600,
    "process_rss_peak_human": "600.00 MB",
    "memory_health": "HEALTHY"
  },
  "index": {
    "total_documents": 1000000,
    "total_terms": 1500000,
    "total_postings": 5000000,
    "avg_postings_per_term": 3.33,
    "delta_encoded_lists": 1200000,
    "roaring_bitmap_lists": 300000
  },
  "tables": {
    "products": {
      "documents": 500000,
      "terms": 800000,
      "postings": 2500000,
      "ngram_size": 2,
      "memory_bytes": 262144000,
      "memory_human": "250.00 MB"
    },
    "users": {
      "documents": 500000,
      "terms": 700000,
      "postings": 2500000,
      "ngram_size": 1,
      "memory_bytes": 262144000,
      "memory_human": "250.00 MB"
    }
  }
}
```

**レスポンスフィールド:**

| フィールド | 説明 |
|-----------|------|
| `server` | サーバー名（MygramDB） |
| `version` | サーバーバージョン |
| `uptime_seconds` | サーバー稼働時間（秒） |
| `total_requests` | 処理されたリクエストの総数 |
| `total_commands_processed` | 処理されたコマンドの総数 |
| **メモリ（アプリケーション）** | |
| `memory.used_memory_bytes` | 現在のメモリ使用量（バイト）（インデックス + ドキュメント） |
| `memory.used_memory_human` | 人間が読みやすい形式の現在のメモリ使用量 |
| `memory.peak_memory_bytes` | ピーク時のメモリ使用量（バイト） |
| `memory.peak_memory_human` | 人間が読みやすい形式のピークメモリ使用量 |
| `memory.used_memory_index` | インデックスが使用しているメモリ |
| `memory.used_memory_documents` | ドキュメントストアが使用しているメモリ |
| **メモリ（システム）** | |
| `memory.total_system_memory` | 物理RAM総容量（バイト） |
| `memory.total_system_memory_human` | 人間が読みやすい形式のシステムメモリ総容量 |
| `memory.available_system_memory` | 利用可能な物理RAM（バイト） |
| `memory.available_system_memory_human` | 人間が読みやすい形式の利用可能メモリ |
| `memory.system_memory_usage_ratio` | システム全体のメモリ使用率（0.0-1.0） |
| **メモリ（プロセス）** | |
| `memory.process_rss` | プロセスRSS（使用中の物理メモリ）（バイト） |
| `memory.process_rss_human` | 人間が読みやすい形式のプロセスRSS |
| `memory.process_rss_peak` | プロセス開始以降のRSSピーク値（バイト） |
| `memory.process_rss_peak_human` | 人間が読みやすい形式のRSSピーク値 |
| **メモリ（ヘルス）** | |
| `memory.memory_health` | メモリヘルスステータス（HEALTHY/WARNING/CRITICAL/UNKNOWN） |
| **インデックス（集計）** | |
| `index.total_documents` | 全テーブルのドキュメント総数 |
| `index.total_terms` | ユニーク語句の総数 |
| `index.total_postings` | ポスティングの総数 |
| `index.avg_postings_per_term` | 語句あたりの平均ポスティング数 |
| `index.delta_encoded_lists` | Delta圧縮を使用しているポスティングリスト数 |
| `index.roaring_bitmap_lists` | Roaring Bitmapを使用しているポスティングリスト数 |
| **テーブル（テーブルごと）** | |
| `tables.<name>.documents` | テーブル内のドキュメント数 |
| `tables.<name>.terms` | テーブル内の語句数 |
| `tables.<name>.postings` | テーブル内のポスティング数 |
| `tables.<name>.ngram_size` | テーブルのN-gramサイズ |
| `tables.<name>.memory_bytes` | テーブルのメモリ使用量（バイト） |
| `tables.<name>.memory_human` | 人間が読みやすい形式のテーブルメモリ使用量 |

**メモリヘルスステータス:**
- `HEALTHY`: システムメモリの20%以上が利用可能
- `WARNING`: システムメモリの10-20%が利用可能
- `CRITICAL`: システムメモリの10%未満が利用可能（OPTIMIZEは拒否されます）
- `UNKNOWN`: ステータスを判定できない

このエンドポイントはJSON形式をサポートする監視ツールとの統合に適しています。

### GET /metrics

監視とアラーティングのためのPrometheus Exposition Format形式のメトリクスエンドポイント。

::: info 用語補足
**Prometheus Exposition Format** は、Prometheusがメトリクスを収集するためのテキスト形式です。値だけでなく、Counter/Gaugeなどの型やラベルを持てるため、Grafanaなどで時系列として扱いやすくなります。
:::

**リクエスト:**

```http
GET /metrics HTTP/1.1
```

**レスポンス (200 OK):**

```prometheus
# HELP mygramdb_server_info MygramDB server information
# TYPE mygramdb_server_info gauge
mygramdb_server_info{version="1.11.0"} 1

# HELP mygramdb_server_uptime_seconds Server uptime in seconds
# TYPE mygramdb_server_uptime_seconds counter
mygramdb_server_uptime_seconds 3600

# HELP mygramdb_memory_used_bytes Current memory usage in bytes
# TYPE mygramdb_memory_used_bytes gauge
mygramdb_memory_used_bytes{type="index"} 419430400
mygramdb_memory_used_bytes{type="documents"} 104857600
mygramdb_memory_used_bytes{type="total"} 524288000

# HELP mygramdb_memory_health_status Memory health status (0=UNKNOWN, 1=HEALTHY, 2=WARNING, 3=CRITICAL)
# TYPE mygramdb_memory_health_status gauge
mygramdb_memory_health_status 1

# HELP mygramdb_index_documents_total Total number of documents in the index
# TYPE mygramdb_index_documents_total gauge
mygramdb_index_documents_total{table="products"} 500000
mygramdb_index_documents_total{table="users"} 500000

# HELP mygramdb_command_total Total number of commands executed by type
# TYPE mygramdb_command_total counter
mygramdb_command_total{command="search"} 10000
mygramdb_command_total{command="count"} 2000
mygramdb_command_total{command="get"} 3000
```

**Content-Type**: `text/plain; version=0.0.4; charset=utf-8`

**メトリクスカテゴリ:**

| カテゴリ | 説明 |
|----------|------|
| **サーバーメトリクス** | サーバーバージョン、稼働時間、処理されたコマンド数 |
| **コマンド統計** | コマンドタイプ別の実行回数（search、count、get、infoなど） |
| **メモリメトリクス** | アプリケーションメモリ（index/documents）、システムメモリ、プロセスRSS、ヘルスステータス |
| **インデックスメトリクス** | ドキュメント数、term数、posting数、最適化ステータス（`table`ラベル付きテーブル別） |
| **クライアントメトリクス** | 現在の接続数、累計接続数 |
| **レプリケーションメトリクス** | レプリケーションステータス、処理イベント数、操作別カウンタ（MySQLビルドのみ） |

**メトリクスタイプ:**

- **Counter**: 単調増加する値（例: `mygramdb_command_total`）
- **Gauge**: 増減する値（例: `mygramdb_memory_used_bytes`）

**Prometheusスクレイプ設定:**

```yaml
scrape_configs:
  - job_name: 'mygramdb'
    scrape_interval: 15s
    authorization:
      type: Bearer
      credentials_file: /run/secrets/mygramdb_admin_token
    static_configs:
      - targets: ['localhost:8080']
        labels:
          environment: 'production'
```

`api.admin_token` を設定している場合、Prometheus が `mygramdb_replication_*` メトリクスを取得するにはトークンが必要です。`credentials_file` のファイルにはトークンだけを保存し、アクセスを制限してください。認証情報が受理されない場合も `/metrics` は公開されたままですが、HELP / TYPE 行を含むレプリケーションメトリクス全体を省略します。

**主要機能:**

- **標準Prometheus形式**: すべてのPrometheusベースの監視スタックと互換性あり
- **多次元メトリクス**: ラベルによるグルーピング（例: `table`、`command`、`status`）
- **メモリヘルストラッキング**: アラーティング用の数値ステータス値（1=HEALTHY、2=WARNING、3=CRITICAL）
- **テーブル別メトリクス**: テーブル名ごとに分類されたインデックス統計
- **後方互換性**: 既存の`/info`エンドポイントは変更なし

**/infoとの比較:**

| 機能 | `/info` | `/metrics` |
|------|---------|------------|
| フォーマット | JSON | Prometheusテキスト |
| 用途 | 一般的な監視、デバッグ | Prometheus/Grafana統合 |
| メトリクスタイプ | 汎用的な値 | 型付きメトリクス（Counter/Gauge） |
| 多次元対応 | 限定的 | 完全なラベルサポート |
| 互換性 | 任意のHTTPクライアント | Prometheusエコシステム |

両方のエンドポイントにはサーバー状態、メモリヘルス、インデックス統計が含まれますが、項目と詳細度は異なります。レプリケーション系列は `/metrics` でのみ取得でき、`api.admin_token` を設定している場合は有効な Bearer トークンが必要です。Prometheus 連携には `/metrics` を、一般的な監視や人間が読みやすい出力には `/info` を使ってください。

### GET /health

ロードバランサーと監視用のヘルスチェックエンドポイント。

**リクエスト:**

```http
GET /health HTTP/1.1
```

**レスポンス (200 OK):**

```json
{
  "status": "ok",
  "timestamp": 1699000000
}
```

### GET /health/live

ライブネスプローブです。HTTPサーバープロセスが稼働していれば、ロード中またはレプリケーションが degraded の場合でも `200 OK` を返します。

### GET /health/ready

トラフィック制御用のレディネスプローブです。初期データの読み込みが完了し、サーバーがロード中ではなく、`SYNC` が実行中ではなく、設定済みレプリケーションを利用できる場合だけ `200 OK` を返します。JSON 本文には `data_initialized`、`loading`、`status`（`"ready"` または `"not_ready"`）が含まれます。条件を満たさない場合は `503 Service Unavailable` を返します。テーブル読み取りルート（search、count、facet、ドキュメントGET）も、対象テーブルの同期中は `503` を返します。

`/health`、`/health/live`、`/health/ready` はレート制限の対象外であるため、プローブに `429` を返しません。詳細なスナップショットを構築する `/health/detail` は引き続きレート制限の対象です。

::: tip live と ready の使い分け
Kubernetesでは `/health/live` をLiveness Probe、`/health/ready` をReadiness Probeに使ってください。`live` は「プロセスを再起動すべきか」、`ready` は「検索トラフィックを流してよいか」を見るためのものです。
:::

### GET /health/detail

詳細な監視スナップショットです。`"status": "healthy"` または `"status": "degraded"` を含む `200 OK` を返します。ロードバランサーのレディネス判定にはこのエンドポイントではなく `/health/ready` を使用してください。このルートは公開されていますが、`api.admin_token` が設定されている場合、`Authorization: Bearer <token>` が有効なリクエストに限り `current_gtid`、`processed_events`、`queue_size`、`crc_errors`、`schema_incompatible` を返します。`/health/ready` も、管理者認証が受理されない場合は `replication_crc_errors` と `replication_schema_incompatible` を省略します。`/health/ready` と `/health/detail` では、生の MySQL エラー文字列ではなくエラーコードの説明を返します。`SYNC` 中は、binlog コンポーネントが切断とは別に同期による一時停止を示します。`/health`、`/health/live`、`/health/ready` を含め、すべての HTTP ルートが CIDR 許可リストの対象です。

### GET /config

現在のサーバー設定サマリ（機密値は返却されません）。

**リクエスト:**

```http
GET /config HTTP/1.1
Authorization: Bearer <token>
```

`api.admin_token` が空でない場合、`/config` には正確な `Authorization: Bearer <token>` ヘッダーが必要です。トークンがない、または無効な場合は `401 Unauthorized`、`WWW-Authenticate: Bearer`、`error_code: 7` を返します。管理者トークンを設定していない場合、このルートは公開されます。設定オブジェクトが読み込まれていない場合は `503 Service Unavailable` と `error_code: 6026` を返します。同じ HTTP バインドアドレスとポートで別のインスタンスを起動すると、`Bind failed (6000)`（`kNetworkBindFailed`）で起動に失敗します。

**レスポンス (200 OK):**

```json
{
  "mysql": {
    "configured": true,
    "database_defined": true
  },
  "api": {
    "tcp": {
      "enabled": true
    },
    "http": {
      "enabled": true,
      "cors_enabled": false
    }
  },
  "network": {
    "allow_cidrs_configured": false
  },
  "replication": {
    "enable": true
  },
  "notes": "機密情報はHTTP経由では提供されません。安全な接続上で CONFIG SHOW を利用してください。"
}
```

### GET /replication/status

MySQLレプリケーションステータス（レプリケーション有効時のみ）。

**リクエスト:**

```http
GET /replication/status HTTP/1.1
Authorization: Bearer <token>
```

`api.admin_token` が空でない場合、`/replication/status` にも `/config` と同じ Bearer トークン要件と `401` 応答が適用されます。トークンを設定していない場合は公開されます。MySQL 対応ビルドで binlog reader がない場合は、`200 OK` と `{"enabled":false,"status":"not_configured"}` を返します。reader がある場合、`enabled` は実行中かどうかを示し、`status` は `"running"`、`"stopped"`、`"failed"` のいずれかです。完全なレスポンスにはレプリケーションのカウンターと時刻情報が含まれます。

**レスポンス (200 OK):**

```json
{
  "enabled": true,
  "status": "running",
  "current_gtid": "3E11FA47-71CA-11E1-9E33-C80AA9429562:1-5",
  "processed_events": 12345,
  "queue_size": 0,
  "crc_errors": 0,
  "schema_incompatible": false,
  "last_error_code": 0,
  "last_error": "",
  "last_applied_unixtime": 1756149998,
  "seconds_since_last_applied": 2
}
```

**MySQL 対応ビルドでレプリケーション未設定の場合 (200 OK):**

```json
{
  "enabled": false,
  "status": "not_configured"
}
```

**MySQL 非対応ビルドの場合 (503 Service Unavailable):**

```json
{
  "error": "Replication not configured",
  "error_code": 4
}
```

## CORS サポート

ブラウザから直接アクセスする場合は `api.http.enable_cors: true` を設定し、`api.http.cors_allow_origin` に信頼できる Origin を指定します。Origin が空の場合、MygramDB は CORS を有効にせず、ワイルドカード Origin も返しません。不要な場合は CORS を無効のままにしてください。

**CORS ヘッダー:**

```
Access-Control-Allow-Origin: https://app.example.com
Access-Control-Allow-Methods: GET, POST, OPTIONS
Access-Control-Allow-Headers: Content-Type, Authorization
```

## 使用例

以下の例では修飾なしの `threads` 識別子を使用しており、これは単一データベース構成で動作します。
2つ以上のデータベースがある場合は `app_db.threads` のように修飾してください（例: `/tables/app_db.threads/search`）。

### cURL

**検索:**

```bash
curl -X POST http://localhost:8080/tables/threads/search \
  -H "Content-Type: application/json" \
  -d '{
    "q": "機械学習 AND Python",
    "filters": {"status": 1},
    "limit": 10
  }'
```

**ファセット:**

```bash
curl -X POST http://localhost:8080/tables/threads/facet \
  -H "Content-Type: application/json" \
  -d '{
    "column": "category",
    "q": "機械学習",
    "filters": {"status": 1},
    "limit": 10
  }'
```

**ドキュメント取得:**

```bash
curl http://localhost:8080/tables/threads/thread_12345
```

**ヘルスチェック:**

```bash
curl http://localhost:8080/health
```

### JavaScript (fetch)

```javascript
// 検索
const response = await fetch('http://localhost:8080/tables/threads/search', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    q: '機械学習 AND Python',
    filters: { status: 1 },
    limit: 10
  })
});

const data = await response.json();
console.log(`${data.count} 件の結果が見つかりました`);
data.results.forEach(doc => {
  console.log(`ドキュメント ${doc.primary_key}`);
});
```

### Python (requests)

```python
import requests

# 検索
response = requests.post('http://localhost:8080/tables/threads/search', json={
    'q': '機械学習 AND Python',
    'filters': {'status': 1},
    'limit': 10
})

data = response.json()
print(f"{data['count']} 件の結果が見つかりました")
for doc in data['results']:
    print(f"ドキュメント {doc['primary_key']}")
```

## パフォーマンスの考慮事項

- **コネクションプーリング**: レイテンシを抑えるためにHTTP keep-aliveを使用
- **ページネーション**: 大きな結果セットには `limit` と `offset` を使用
- **キャッシング**: アプリケーション層で頻繁なクエリのキャッシングを検討
- **ネットワークセキュリティ**: `network.allow_cidrs` を使用して信頼できるIP範囲へのアクセスを制限

## エラーハンドリング

ハンドラーが生成するエラーレスポンスは次の形式に従います：

```json
{
  "error": "エラーメッセージの説明",
  "error_code": 3000
}
```

`error_code` は機械処理用の MygramDB エラーコードです。原因に応じてクライアントの動作を分ける場合は、人間向けの `error` 文字列ではなくこの値を使ってください。リクエスト本文が大きすぎる場合の `413 Payload Too Large` は HTTP サーバーがルーティング前に返すため、このレスポンスでは JSON 本文や `error_code` ではなくステータスコードに基づいて処理してください。

**HTTPステータスコード:**

| コード | 説明 |
|--------|------|
| 200 | 成功 |
| 400 | 不正なリクエスト（無効な入力） |
| 401 | 未認証（`/config`、`/replication/status`、`/optimize` などの管理ルートに必要な Bearer トークンがない、または無効） |
| 403 | 禁止（送信元IPが許可されていない） |
| 404 | 見つかりません（ドキュメントがない場合は `error_code: 4004`、複数DB構成で修飾なしの名前を指定した場合など、テーブル名を解決できない場合は `4007`） |
| 413 | Payload Too Large（リクエスト本文が `api.http.max_body_bytes` を超過） |
| 429 | リクエスト過多（レート制限を超過） |
| 500 | 内部サーバーエラー |
| 503 | サービス利用不可（`GET /config` の設定未読み込みは `error_code: 6026`）、機能無効、MySQL 非対応ビルドでのレプリケーション要求（`error_code: 4`）、またはテーブル同期中 |

## 監視

HTTP APIは監視と可観測性のための複数のエンドポイントを提供します：

- **ヘルスチェック**: `GET /health` - ロードバランサー用のシンプルなヘルスチェック
- **JSONメトリクス**: `GET /info` - 一般的な監視ツール用のJSON形式の詳細統計
- **Prometheusメトリクス**: `GET /metrics` - 時系列監視とアラーティング用のPrometheus互換メトリクス
- **レプリケーションステータス**: `GET /replication/status` - MySQLレプリケーションステータス

### 監視スタック統合

**Prometheus + Grafana:**

1. Prometheusで`/metrics`エンドポイントをスクレイプするよう設定
2. MygramDB用のGrafanaダッシュボードをインポート
3. メモリヘルス、クエリレイテンシ、レプリケーション遅延に基づくアラートを設定

**その他の監視ツール:**

- **Datadog/New Relic**: `/info`のJSONエンドポイントをパース
- **Zabbix**: `/health`と`/info`へのHTTPエージェントチェック
- **Nagios/Icinga**: `/health`エンドポイントを使用したチェックスクリプト

## 関連項目

- [クエリガイド](/ja/docs/queries) - 検索クエリ構文
- [プロトコルリファレンス](/ja/docs/protocol) - 全TCPコマンドリファレンス
- [設定ガイド](/ja/docs/configuration) - サーバー設定
