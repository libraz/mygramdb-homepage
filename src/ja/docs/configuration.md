# 設定

MygramDBはYAMLまたはJSON形式の設定ファイルを使用します。

## 設定例

```yaml
# MySQL接続
mysql:
  host: "127.0.0.1"
  port: 3306
  user: "repl_user"
  password: "your_password"
  database: "mydb"
  datetime_timezone: "+09:00"  # 日本標準時

# インデックス対象テーブル
tables:
  - name: "articles"
    text_source:
      column: "content"
    filters:
      - name: "status"
        type: "int"
      - name: "category_id"
        type: "int"
    ngram_size: 2

  - name: "products"
    text_source:
      column: "description"
    ngram_size: 2

# APIサーバー
api:
  tcp:
    port: 11016
    max_connections: 10000
  http:
    enable: true
    port: 8080

# メモリ管理
memory:
  hard_limit_mb: 8192
  soft_target_mb: 4096

# 永続化
dump:
  dir: "/var/lib/mygramdb/dumps"
  interval_sec: 3600
  retain: 3

# ログ
logging:
  level: "info"
  format: "text"
```

## MySQL接続

```yaml
mysql:
  host: "127.0.0.1"
  port: 3306
  user: "repl_user"
  password: "your_password"
  database: "mydb"
```

### 必要なMySQL権限

```sql
GRANT SELECT, REPLICATION SLAVE, REPLICATION CLIENT ON *.* TO 'repl_user'@'%';
FLUSH PRIVILEGES;
```

### MySQL要件

> [!IMPORTANT]
> これらの設定はMygramDBの動作に必須です。設定がない場合、レプリケーションが失敗します。

```ini
# my.cnf
gtid_mode = ON
enforce_gtid_consistency = ON
binlog_format = ROW
binlog_row_image = FULL
```

## テーブル設定

インデックス対象の各テーブル：

```yaml
tables:
  - name: "articles"           # テーブル名
    text_source:
      column: "content"        # 検索対象カラム
    primary_key: "id"          # プライマリキー（デフォルト: "id"）
    ngram_size: 2              # CJK向けN-gramサイズ（デフォルト: 2）
    filters:                   # フィルタ用カラム
      - name: "status"
        type: "int"
      - name: "user_id"
        type: "int"
      - name: "created_at"
        type: "datetime"
```

### フィルタ型

| 型 | 説明 |
|------|-------------|
| `int` | 32ビット整数 |
| `bigint` | 64ビット整数 |
| `string` | テキスト値 |
| `datetime` | 日時値 |
| `date` | 日付値 |

## APIサーバー

```yaml
api:
  tcp:
    bind: "127.0.0.1"         # TCPバインドアドレス
    port: 11016               # TCPプロトコルポート
    max_connections: 10000    # 最大同時接続数
  http:
    enable: true              # HTTP APIを有効化
    bind: "127.0.0.1"         # HTTPバインドアドレス
    port: 8080                # HTTP APIポート
```

## メモリ管理

```yaml
memory:
  hard_limit_mb: 8192         # ハードメモリ上限（MB）
  soft_target_mb: 4096        # ソフトメモリ目標（MB）
```

## 永続化（スナップショット）

```yaml
dump:
  dir: "/var/lib/mygramdb/dumps"
  interval_sec: 3600          # 自動保存間隔（0 = 無効）
  retain: 3                   # 保持するスナップショット数
```

## クエリキャッシュ

```yaml
cache:
  enabled: true
  max_memory_mb: 32           # 最大キャッシュメモリ（MB）
  ttl_seconds: 3600           # キャッシュTTL（秒）
```

## ログ

```yaml
logging:
  level: "info"             # debug, info, warn, error
  format: "text"            # text または json
  file: "/var/log/mygramdb/mygramdb.log"
```

## ネットワークセキュリティ

> [!WARNING]
> `allow_cidrs`が空または未設定の場合、すべての接続が拒否されます。アクセスを許可するには、少なくとも1つのCIDRを追加する必要があります。

```yaml
network:
  allow_cidrs:
    - "127.0.0.1/32"
    - "192.168.1.0/24"
    - "10.0.0.0/8"
```

## Unixドメインソケット

ローカル接続でより低レイテンシを実現するには、Unixドメインソケットを設定します：

```yaml
api:
  unix_socket:
    path: "/var/run/mygramdb/mygramdb.sock"
```

CLIから接続：

```bash
mygram-cli -s /var/run/mygramdb/mygramdb.sock SEARCH articles "hello"
```

## ランタイム変数

MySQL互換のSET/SHOW VARIABLESコマンドで、再起動なしに設定を変更できます：

```sql
-- すべての変数を表示
SHOW VARIABLES;

-- 特定の変数を表示
SHOW VARIABLES LIKE 'cache%';

-- 設定をランタイムで変更
SET logging.level = 'debug';
SET cache.enabled = false;
SET api.default_limit = 200;
```

> [!NOTE]
> 以下の設定は変更不可で、再起動が必要です：
> - `mysql.database`
> - `tables`（追加/削除）
> - `api.tcp.port`, `api.http.port`

## 次のステップ

- [クエリガイド](/ja/docs/queries) - 検索構文を学ぶ
- [クイックスタート](/ja/docs/getting-started) - 入門ガイド

## 詳細ドキュメント

- [設定リファレンス（詳細）](https://github.com/libraz/mygram-db/blob/main/docs/ja/configuration.md)
- [MySQLレプリケーション](https://github.com/libraz/mygram-db/blob/main/docs/ja/replication.md)
- [スナップショット](https://github.com/libraz/mygram-db/blob/main/docs/ja/snapshot.md)
