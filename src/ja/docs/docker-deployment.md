---
title: MygramDB Dockerデプロイ - Compose構成と本番運用
description: DockerとDocker ComposeでMygramDBをデプロイ。環境変数、カスタム設定のマウント、本番チューニング、リソース制限、バックアップ/リストア、スケーリング、セキュリティの推奨事項。
head:
  - - meta
    - name: keywords
      content: MygramDB Docker, docker-compose, コンテナ デプロイ, 環境変数, 本番デプロイ, GHCR イメージ, ロードバランシング
---

# Docker デプロイメントガイド

このガイドでは、Docker と Docker Compose を使用して MygramDB をデプロイする方法を説明します。

::: warning 本番公開前の確認
クイックスタートの設定は動作確認用です。本番環境ではMySQLパスワード、`REPLICATION_SERVER_ID`、接続元CIDR、Dockerのメモリ制限、ダンプ保存先の永続ボリュームを必ず見直してください。
:::

## クイックスタート

### 1. 前提条件

- Docker 20.10+
- Docker Compose 2.0+

### 2. 環境変数の設定

```bash
# サンプル環境ファイルをコピー
cp .env.example .env

# .env を編集して設定を変更
nano .env
```

::: warning デフォルト値を変更
`.env` 内の以下のデフォルト値を変更してください：

- `MYSQL_ROOT_PASSWORD` - MySQL root パスワード。`.env.example` のプレースホルダーを残すと起動を拒否します
- `MYSQL_PASSWORD` - MySQL レプリケーションユーザーのパスワード。Composeでは必須で、設定を生成する場合はコンテナのentrypointでも必須です
- `API_ADMIN_TOKEN` - 管理操作用の十分に長いランダムなシークレット。Composeは未設定値を、entrypointはサンプルのプレースホルダーを拒否します
- `REPLICATION_SERVER_ID` - この MygramDB インスタンスの一意なサーバーID
:::

### 3. サービスの起動（開発環境）

```bash
# すべてのサービスをビルドして起動
docker compose up -d

# ログを表示
docker compose logs -f

# ステータスを確認
docker compose ps
```

同梱の Compose ファイルは、MySQLソースを `--binlog-row-metadata=FULL` 付きで起動します。別の MySQL / MariaDB ソースへ接続する場合は、ソースサーバー側でこの設定を行ってください。MygramDBの環境変数ではありません。

### 4. サービスの停止

```bash
# すべてのサービスを停止
docker compose down

# ボリュームも削除して停止（警告：すべてのデータが削除されます）
docker compose down -v
```

## 設定

### 環境変数

`.env` は単一テーブルのクイックスタート用イメージを設定します。対応する環境変数の全一覧は最新の [`.env.example`](https://github.com/libraz/mygram-db/blob/main/.env.example) を参照してください。複数テーブルや詳細設定には設定ファイルをマウントします。

::: info 環境変数と設定ファイル
環境変数は単一テーブルの基本構成をすばやく起動するための入口です。複数テーブル、複数DB、フィルタ、シノニム、詳細なHTTP設定が必要な場合は、後述のカスタム設定ファイルをマウントしてください。
:::

::: tip 本番では設定ファイルがおすすめ
本番環境では、環境変数だけで全設定を表現するより、`config.yaml` を明示的に管理する方が変更履歴を追いやすくなります。環境変数はパスワードやホスト名など、環境ごとに変わる値の上書きに使うと整理しやすいです。
:::

#### MySQL 設定

```bash
MYSQL_HOST=mysql                    # MySQL ホスト
MYSQL_PORT=3306                     # MySQL ポート
MYSQL_USER=repl_user                # MySQL ユーザー
MYSQL_PASSWORD=your_password        # 必須の MySQL パスワード
MYSQL_DATABASE=mydb                 # データベース名
MYSQL_USE_GTID=true                 # GTID ベースのレプリケーションを使用
```

#### テーブル設定

```bash
TABLE_NAME=articles                 # インデックス対象のテーブル
TABLE_PRIMARY_KEY=id                # プライマリキーカラム
TABLE_TEXT_COLUMN=content           # インデックス対象のテキストカラム
TABLE_NGRAM_SIZE=2                  # かな、ASCII など漢字以外の N-gram サイズ
TABLE_KANJI_NGRAM_SIZE=1            # CJK の漢字用の N-gram サイズ
```

#### レプリケーション設定

```bash
REPLICATION_ENABLE=true             # レプリケーションを有効化
REPLICATION_SERVER_ID=12345         # 1〜4294967295の0以外の値
REPLICATION_START_FROM=snapshot     # snapshot、latest、MySQL GTIDセット、MariaDB GTIDリスト
REPLICATION_AUTO_INITIAL_SNAPSHOT=true # 初期スナップショットを自動作成
```

::: info 用語補足
**server_id** はMySQLレプリケーション接続を識別する番号です。同じMySQLへ接続するMygramDBやMySQLレプリカ間で重複しない値を設定してください。
:::

#### メモリ管理

```bash
MEMORY_HARD_LIMIT_MB=8192           # 予約済み。プロセスメモリは制限しない
MEMORY_SOFT_TARGET_MB=4096          # 予約済み。強制されない
MEMORY_NORMALIZE_NFKC=true          # NFKC正規化
MEMORY_NORMALIZE_WIDTH=narrow       # 幅の正規化
MEMORY_VERIFY_TEXT=off              # off、ascii、all
```

#### ダンプ、ランキング、キャッシュ

```bash
DUMP_DIR=/var/lib/mygramdb/dumps
DUMP_INTERVAL_SEC=600
DUMP_RETAIN=3
BM25_ENABLE=false
BM25_K1=1.2
BM25_B=0.75
CACHE_ENABLED=true
CACHE_MAX_MEMORY_MB=32
CACHE_MIN_QUERY_COST_MS=10.0
CACHE_TTL_SECONDS=3600
```

削除済みの `SNAPSHOT_*` ではなく `DUMP_*` を使ってください。

#### MySQL TLS

```bash
MYSQL_DATETIME_TIMEZONE=+00:00
MYSQL_SSL_ENABLE=false
MYSQL_SSL_CA=
MYSQL_SSL_CERT=
MYSQL_SSL_KEY=
MYSQL_SSL_VERIFY_SERVER_CERT=true
```

::: warning Dockerのメモリ制限
MygramDBのメモリ設定だけでは、プロセスの使用量を強制的に止めません。コンテナで運用する場合は、Composeの `mem_limit` や実行基盤側のメモリ制限も設定してください。
:::

#### APIサーバー

::: info ホスト側のbindとコンテナ側のbindは別です
ComposeはTCPとHTTPのポートをホストの `127.0.0.1` に公開します。一方、コンテナは自身のネットワークインターフェースで待ち受ける必要があるため、`API_CONTAINER_BIND` と `API_HTTP_CONTAINER_BIND`（どちらもデフォルトは `0.0.0.0`）を使います。リバースプロキシやファイアウォールを設計に含めない限り、ホスト側のループバック公開を全インターフェース公開へ変更しないでください。
:::

```bash
API_BIND=127.0.0.1                  # 直接起動するサーバーのbindアドレス
API_PORT=11016                      # APIポート
API_HTTP_ENABLE=true
API_HTTP_BIND=127.0.0.1
API_HTTP_PORT=8080
API_ADMIN_TOKEN=CHANGE_ME_GENERATE_RANDOM_SECRET
# Compose専用のコンテナ内リスナー。ホスト側ポートは127.0.0.1に限定されます
API_CONTAINER_BIND=0.0.0.0
API_HTTP_CONTAINER_BIND=0.0.0.0
API_RATE_LIMIT_ENABLE=false
API_RATE_LIMIT_CAPACITY=100
API_RATE_LIMIT_REFILL_RATE=10
API_RATE_LIMIT_MAX_CLIENTS=10000
```

`API_ADMIN_TOKEN` はコンテナ内リスナーが非ループバックであるため、Compose では必須です。`openssl rand -hex 32` で生成してください。TCP の管理コマンドには接続後に `AUTH <token>` が必要です。HTTP の `GET /config`、`GET /replication/status`、`POST /optimize` には `Authorization: Bearer <token>` を渡します。

#### ネットワーク設定

```bash
# Docker bridgeでは、公開ポートへの接続元がゲートウェイアドレスに見えます。
# 172.16.0.0/12はDockerの標準bridgeプールを含みます。可能なら狭めてください。
NETWORK_ALLOW_CIDRS=127.0.0.1/32,172.16.0.0/12
```

::: warning
Composeでは `NETWORK_ALLOW_CIDRS` が必須です。非ループバックのAPI bindと `0.0.0.0/0` または `::/0` を組み合わせると、MygramDBは起動時に設定を拒否します。独自のコンテナネットワークでは、アクセスが必要なアプリケーションと運用ネットワークのCIDRだけを指定してください。
:::

#### ロギング

```bash
LOG_LEVEL=info                      # ログレベル: debug, info, warn, error
LOG_FORMAT=json                     # ログ形式: json または text
```

### カスタム設定ファイル

より高度な設定（フィルタ、複数テーブルなど）が必要な場合は、カスタム設定ファイルをマウントできます：

```yaml
# docker-compose.override.yml
version: '3.8'

services:
  mygramdb:
    volumes:
      - ./my-config.yaml:/etc/mygramdb/config.yaml:ro
    environment:
      SKIP_CONFIG_GEN: "true"
      MYGRAM_MYSQL_HOST: ${MYSQL_HOST:-mysql}
      MYGRAM_MYSQL_PORT: ${MYSQL_PORT:-3306}
      MYGRAM_MYSQL_USER: ${MYSQL_USER:-repl_user}
      MYGRAM_MYSQL_PASSWORD: ${MYSQL_PASSWORD:?MYSQL_PASSWORD must be set}
      MYGRAM_MYSQL_DATABASE: ${MYSQL_DATABASE:-mydb}
      MYGRAM_API_ADMIN_TOKEN: ${API_ADMIN_TOKEN:?API_ADMIN_TOKEN must be set}
    command: ["mygramdb", "-c", "/etc/mygramdb/config.yaml"]
```

`SKIP_CONFIG_GEN=true` の場合、entrypoint は Compose の `MYSQL_*` と `API_ADMIN_TOKEN` をマウント済みファイルへ書き込みません。上記の `MYGRAM_*` はサーバーが直接読む上書き設定です。公開ポートから到達できるよう、`my-config.yaml` に `api.tcp.bind: "0.0.0.0"`、HTTP を有効にする場合は `api.http.bind: "0.0.0.0"` を設定します。`network.allow_cidrs` には Docker ブリッジと接続を許可するクライアントの CIDR を含めてください。Compose の `API_CONTAINER_BIND`、`API_HTTP_CONTAINER_BIND`、`NETWORK_ALLOW_CIDRS` は、この構成ではファイル内の設定を変更しません。それ以外の設定も `my-config.yaml` に記載してください。MySQL サービスは引き続き `.env` の `MYSQL_ROOT_PASSWORD` を使うため、こちらも独自の値を設定します。

単独コンテナで実行する場合は、最小設定をコピーしてから編集します。`mysql.host` は**コンテナから到達できる**アドレスに変更してください（`127.0.0.1` はコンテナ自身を指します）。MySQL の認証情報を入力し、`api.tcp.bind: "0.0.0.0"` を設定して、Docker ブリッジのゲートウェイを含む CIDR を `network.allow_cidrs` に追加します。非ループバックのリスナーには管理トークンも必要です。ホスト側の公開ポートは、外部からの接続が必要な場合を除きループバックに限定します。

```bash
cp examples/config-minimal.yaml my-config.yaml
# my-config.yaml の mysql.host/認証情報、api.tcp.bind、network.allow_cidrs を編集
export MYGRAM_API_ADMIN_TOKEN="$(openssl rand -hex 32)"

# 編集済みの設定で起動
docker run -d --name mygramdb-standalone \
  -p 127.0.0.1:11016:11016 \
  -v "$PWD/my-config.yaml:/etc/mygramdb/config.yaml:ro" \
  -e SKIP_CONFIG_GEN=true \
  -e MYGRAM_API_ADMIN_TOKEN \
  ghcr.io/libraz/mygram-db:1.11.0 \
  mygramdb -c /etc/mygramdb/config.yaml
```

## 本番環境へのデプロイ

### Docker イメージのビルド

適切なバージョンタグを付けてDockerイメージをビルドする方法：

```bash
# git タグから現在のバージョンを取得
VERSION=$(git describe --tags --abbrev=0 | sed 's/^v//')

# バージョン引数を指定してビルド
docker build --build-arg MYGRAMDB_VERSION=$VERSION -t mygramdb:$VERSION .

# または、リリース済みバージョンを手動で指定
docker build --build-arg MYGRAMDB_VERSION=1.11.0 -t mygramdb:1.11.0 .

# latest タグを付与
docker tag mygramdb:$VERSION mygramdb:latest
```

**注意:** `MYGRAMDB_VERSION` ビルド引数が指定されない場合、ビルドはバージョン0.0.0を使用するか、ビルドコンテキストに `.git` ディレクトリが存在する場合は git タグから読み取りを試みます。

### ビルド済みイメージの使用

リポジトリにあるのは `docker-compose.yml` で、本番専用の Compose ファイルはありません。ローカルビルドの代わりに公開イメージを使う場合は、このファイルが参照するタグを付けます。

```bash
docker pull ghcr.io/libraz/mygram-db:1.11.0
docker tag ghcr.io/libraz/mygram-db:1.11.0 mygramdb:1.11.0
```

### 環境設定

1. 本番用 `.env` ファイルを作成：
```bash
cp .env.example .env.prod
nano .env.prod
```

2. 本番用の値を設定：
```bash
# 本番 MySQL 設定
MYSQL_HOST=production-mysql-host
MYSQL_PORT=3306
MYSQL_USER=repl_user
MYSQL_ROOT_PASSWORD=非公開のrootパスワードに置き換える
MYSQL_PASSWORD=強力で安全なパスワード

# `openssl rand -hex 32` で生成した値を貼り付けます
API_ADMIN_TOKEN=CHANGE_ME_GENERATE_RANDOM_SECRET
NETWORK_ALLOW_CIDRS=127.0.0.1/32,172.16.0.0/12

# 本番メモリ設定
MEMORY_HARD_LIMIT_MB=16384
MEMORY_SOFT_TARGET_MB=8192

# 本番 API 設定。Composeはこれらのポートをlocalhostだけに公開します
API_PORT=11016
API_HTTP_PORT=8080

# 本番ロギング
LOG_LEVEL=info
LOG_FORMAT=json
```

3. 本番設定で起動します。1 行目は上でタグを付けた公開イメージを使い、2 行目はこのチェックアウトからビルドします。
```bash
MYGRAMDB_VERSION=1.11.0 docker compose --env-file .env.prod up -d --no-build
# またはローカルでビルド
MYGRAMDB_VERSION=1.11.0 docker compose --env-file .env.prod up -d --build
```

### リソース制限

リポジトリの Compose ファイルには CPU・メモリ制限がありません。本番運用ではローカルの `docker-compose.override.yml` に追加してください。例:

```yaml
services:
  mygramdb:
    mem_limit: 16g
```

実測した RSS を基に余裕を確保してください。`OPTIMIZE` はインデックスをほぼもう一式作るだけの空きメモリが必要になる場合があります。以下は Compose に設定済みの制限値ではなく、計測を始める際の参考値です。

**MySQL:**

- CPU: 2-4 コア
- メモリ: 2-4 GB

**MygramDB:**

- CPU: 4-8 コア
- メモリ: 10-20 GB

ワークロードとホストの容量に合わせて調整してください。

::: info メモリ見積もり
MygramDBはインメモリ検索エンジンです。`verify_text: all` の場合は100万ドキュメントあたり約3.1GBを目安にし、OS・キャッシュ・ダンプ処理の余裕分も確保してください。
:::

## データベースの初期化

MySQL コンテナは `support/docker/mysql/init/` 内のスクリプトを自動実行します：

- `01-create-tables.sql` - サンプルテーブルを作成

独自の初期化スクリプトを追加する場合：

```bash
# SQL スクリプトを作成
cat > support/docker/mysql/init/02-my-tables.sql <<EOF
CREATE TABLE my_table (
    id BIGINT PRIMARY KEY,
    content TEXT
);
EOF

# 既存の MySQL ボリュームには明示的に適用する（初期化スクリプトの自動実行は初回のみ）
docker compose exec -T mysql sh -c 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysql -u root "$MYSQL_DATABASE"' < support/docker/mysql/init/02-my-tables.sql
```

## モニタリング

### ログの表示

```bash
# すべてのサービス
docker compose logs -f

# 特定のサービス
docker compose logs -f mygramdb

# 最新100行
docker compose logs --tail=100 mygramdb
```

### ヘルスチェック

イメージのヘルスチェックは `API_HTTP_PORT` の `/health/live` を確認します。`API_HTTP_ENABLE=false` の場合は HTTP の確認を省略します。Compose のヘルスチェックも同じ設定に従います。

```bash
# サービスの健全性を確認
docker compose ps

# 手動ヘルスチェック
docker compose exec mygramdb curl -fsS http://127.0.0.1:8080/health/live
```

### メトリクス

MygramDB はHTTP APIポート（デフォルトは8080）でメトリクスを公開します。エンドポイントは公開のままですが、`API_ADMIN_TOKEN` が設定されている場合、Bearerトークンのないリクエストには `mygramdb_replication_` で始まるメトリクスを含めません。

```bash
curl -H "Authorization: Bearer $API_ADMIN_TOKEN" http://localhost:8080/metrics
```

## バックアップとリストア

### バックアップ

```bash
# MySQL データのバックアップ
docker compose exec -T mysql sh -c 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysqldump -u root "$MYSQL_DATABASE"' > backup.sql

# MygramDB スナップショットのバックアップ
docker compose cp mygramdb:/var/lib/mygramdb/dumps ./backup-dumps/
```

### リストア

```bash
# MySQL データのリストア
docker compose exec -T mysql sh -c 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysql -u root "$MYSQL_DATABASE"' < backup.sql

# MygramDBダンプをコピーして明示的に読み込む
docker compose cp ./backup-dumps/mygramdb.dmp mygramdb:/var/lib/mygramdb/dumps/mygramdb.dmp
docker compose exec -T mygramdb sh -c 'printf "AUTH %s\nDUMP VERIFY /var/lib/mygramdb/dumps/mygramdb.dmp\n" "$API_ADMIN_TOKEN" | mygram-cli'
docker compose exec -T mygramdb sh -c 'printf "AUTH %s\nDUMP LOAD /var/lib/mygramdb/dumps/mygramdb.dmp\n" "$API_ADMIN_TOKEN" | mygram-cli'
```

## トラブルシューティング

### 接続の問題

```bash
# アプリケーションと MySQL を含む readiness を確認（HTTP が有効な場合）
docker compose exec mygramdb curl -fsS http://127.0.0.1:8080/health/ready

# mysql クライアントが入っている MySQL コンテナから SQL を確認
docker compose exec mysql sh -c 'MYSQL_PWD="$MYSQL_PASSWORD" mysql -h 127.0.0.1 -u "$MYSQL_USER" "$MYSQL_DATABASE" -e "SELECT 1"'
```

### 設定の問題

```bash
# バージョンを確認
docker run --rm mygramdb:1.11.0 --version

# ヘルプを表示
docker run --rm mygramdb:1.11.0 --help

# 実行中のコンテナの設定を検証
docker compose exec mygramdb mygramdb -t /etc/mygramdb/config.yaml

# 生成された設定を表示
docker compose exec mygramdb cat /etc/mygramdb/config.yaml
```

設定ファイルがなくても、イメージは `version` と `help` を実行できます。上のフラグ形式でも同じ結果が得られます。

### パフォーマンスの問題

1. リソース使用状況を確認：
```bash
docker stats
```

2. 実測 RSS を基に Compose の `mem_limit` を決め、保守処理の余裕を確保します。[リソース制限](#リソース制限)を参照してください。`MEMORY_HARD_LIMIT_MB` と `MEMORY_SOFT_TARGET_MB` は予約済み設定であり、プロセスの上限を強制しません。

3. ビルド並列度を調整：
```bash
BUILD_PARALLELISM=4
```

## スケーリング

### 複数の MygramDB インスタンス

読み取り容量や可用性を高めるには、ホストごとに同じ MySQL ソースを読むフルレプリカを配置し、それぞれ異なる `REPLICATION_SERVER_ID` を設定します。ready なインスタンスだけにトラフィックを送ってください。各レプリカはインデックス全体を持つため、1ノードあたりのメモリは減りません。

同じホストで同梱 Compose スタックを複数起動する場合は、MySQL、TCP、HTTP の公開ポートをスタックごとに変え、`REPLICATION_SERVER_ID` と認証情報も適切に設定してください。`-p` のプロジェクト名はコンテナ名とボリューム名を分けるだけで、公開ポートは変えません。アプリには `API_PORT` と `API_HTTP_PORT` を設定し、MySQL のホスト側ポートマッピングはコンテナ内ポート 3306 を保ったまま別途編集します。異なるテーブルを分担させる場合は、アプリ側でクエリの送信先を選びます。

### ロードバランシング

同じデータを持つフルレプリカなら、HTTP リバースプロキシから各ノードの HTTP API ポート（既定 8080）へ振り分けられます。

```nginx
upstream mygramdb_backend {
    server node1.internal:8080;
    server node2.internal:8080;
    server node3.internal:8080;
}

server {
    listen 80;
    location / {
        proxy_pass http://mygramdb_backend;
    }
}
```

11016番は MygramDB の TCP プロトコルです。HTTP プロキシの upstream には使えません。このポートには nginx の `stream` ブロックまたは TCP ロードバランサーを使い、どちらの経路も `/health/ready` を基に送信先を選んでください。

## セキュリティの推奨事項

1. **強力なパスワードを使う** - `.env` 内のすべてのデフォルトパスワードを変更
2. **ネットワークの分離** - Docker ネットワークを使用してサービスを分離
3. **ホスト側の公開を制限** - MySQL のホスト側ポートを `127.0.0.1` に公開し、コンテナ側リスナーは Compose ブリッジ経由で MygramDB から接続できるようにする
4. **TLS を有効化** - MySQL 接続に TLS を使用
5. **定期的な更新** - Docker イメージを最新に保つ
6. **定期的なバックアップ** - MySQL と MygramDB スナップショットの自動バックアップ

## 参考資料

- [設定ガイド](/ja/docs/configuration)
- [MySQL レプリケーション設定](/ja/docs/replication)
- [パフォーマンスチューニング](/ja/docs/performance)
