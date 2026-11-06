---
layout: home
title: MygramDB - MySQL レプリケーション対応インメモリ全文検索
titleTemplate: false
description: MySQL FULLTEXT が遅い？MygramDB は MySQL レプリケーションで同期するインメモリ全文検索エンジン。110万件の再現可能なベンチマークを公開しています。
head:
  - - meta
    - name: keywords
      content: MySQL FULLTEXT 遅い, MySQL 全文検索 遅い, MySQL 検索 タイムアウト, MySQL 検索 高速化, インメモリ検索エンジン

hero:
  name: "MygramDB"
  text: "MySQL のための高速全文検索"
  tagline: MySQL / MariaDB の binlog に追従するインメモリ検索エンジン。書き込みは MySQL のまま、検索だけを MygramDB に移せます。
  actions:
    - theme: brand
      text: GitHub で見る
      link: https://github.com/libraz/mygram-db
    - theme: alt
      text: ベンチマーク
      link: /ja/benchmarks

features:
  - icon:
      src: /icons/zap.svg
    title: MySQL FULLTEXT が遅い？
    details: MySQL の横に置くインメモリ検索エンジン。重い FULLTEXT 検索だけを MygramDB へ切り出します。
  - icon:
      src: /icons/refresh-cw.svg
    title: MySQL / MariaDB の binlog に追従
    details: MySQL 8.4/9.7/26.x と MariaDB 10.11+/11.x/12.x に対応した GTID ベースの binlog レプリケーション。書き込みは MySQL のまま、検索だけを分離します。
  - icon:
      src: /icons/globe.svg
    title: 日本語対応
    details: ICU ベースの Unicode 正規化と N-gram 分割に対応。日本語・CJK テキストも辞書なしで検索できます。
  - icon:
      src: /icons/radio.svg
    title: デュアルプロトコル
    details: memcached 風の TCP プロトコルと REST/JSON HTTP API。CLI、HTTP クライアント、各言語のクライアントライブラリから接続できます。
  - icon:
      src: /icons/list-ordered.svg
    title: BM25 スコア・ハイライト
    details: BM25 スコアで関連度順に並べ、ハイライト付きのスニペットを返します。同義語辞書によるクエリ展開にも対応します。
  - icon:
      src: /icons/funnel.svg
    title: あいまい検索・ファセット集計
    details: Levenshtein 編集距離によるあいまい検索と、フィルタカラムの値ごとの件数を返すファセット集計に対応します。
---

## 構成

MygramDB は MySQL/MariaDB の横にサイドカーとして置きます。アプリケーションの書き込み先は DB のまま変わりません。MygramDB が binlog を追従してインメモリの検索インデックスを持ち、検索の読み取りだけを MygramDB に向けます。

<DocDiagram name="deployment-topology" alt="アプリケーションは従来どおり MySQL/MariaDB へ書き込みます。MygramDB は GTID の binlog ストリームを追従してインメモリ検索インデックスを維持します。アプリケーションは検索クエリだけを、TCP 11016 または HTTP 8080 で MygramDB に送ります。" />

## クイックスタート

### MySQL を準備する {.qs-step}

GTID モードを有効にし、レプリケーションユーザーを作成します。MygramDB は binlog（MySQL の変更履歴ログ）を読み、GTID で「どこまで読んだか」を管理します。用語は[用語集](/ja/docs/glossary)を参照してください。

```sql
SET GLOBAL enforce_gtid_consistency = ON;
SET GLOBAL gtid_mode = OFF_PERMISSIVE;
SET GLOBAL gtid_mode = ON_PERMISSIVE;
SET GLOBAL gtid_mode = ON;
SET GLOBAL binlog_format = ROW;
SET GLOBAL binlog_row_image = FULL;
SET GLOBAL binlog_row_metadata = FULL;
CREATE USER 'repl_user'@'%' IDENTIFIED BY 'your_password';
-- SELECT: 全文検索対象テーブルの初期スナップショット取得用
GRANT REPLICATION SLAVE, REPLICATION CLIENT ON *.* TO 'repl_user'@'%';
GRANT SELECT ON mydb.* TO 'repl_user'@'%';
```

::: warning 設定を永続化する
`SET GLOBAL` の値は再起動で戻る場合があります。本番では `log_bin` を有効のまま（MySQL のデフォルト）にし、`gtid_mode=ON`、`binlog_format=ROW`、`binlog_row_image=FULL`、`binlog_row_metadata=FULL` を `my.cnf` などの永続設定にも書いてください。既存環境を更新する場合は、先に[アップグレード手順](/ja/docs/upgrade-v1.12)を確認してください。
:::

### MygramDB を起動する {.qs-step}

```bash
export API_ADMIN_TOKEN="$(openssl rand -hex 32)"
docker run -d --name mygramdb \
  -p 127.0.0.1:11016:11016 -p 127.0.0.1:8080:8080 \
  -e API_BIND=0.0.0.0 -e API_HTTP_BIND=0.0.0.0 \
  -e API_ADMIN_TOKEN \
  -e MYSQL_HOST=your-mysql-host \
  -e MYSQL_USER=repl_user \
  -e MYSQL_PASSWORD=your_password \
  -e MYSQL_DATABASE=mydb \
  -e TABLE_NAME=articles \
  -e TABLE_PRIMARY_KEY=id \
  -e TABLE_TEXT_COLUMN=content \
  -e TABLE_NGRAM_SIZE=2 \
  -e REPLICATION_SERVER_ID=12345 \
  -e NETWORK_ALLOW_CIDRS=127.0.0.1/32,::1/128,172.16.0.0/12 \
  ghcr.io/libraz/mygram-db:1.12.0
```

::: warning 接続許可リスト
`NETWORK_ALLOW_CIDRS` には、MygramDB から見えるクライアントのサブネットを指定します。`172.16.0.0/12` はローカルの Docker ブリッジ向けの例です。コンテナ内のクライアントとヘルスチェックのため、ループバックの許可は残してください。コンテナ内の非ループバックリスナーと `0.0.0.0/0` の組み合わせは拒否されます。詳しくは [Docker デプロイ](/ja/docs/docker-deployment)を参照してください。
:::

### データを読み込んで検索する {.qs-step}

MygramDB は起動しただけでは既存の行を読み込みません。最初に `SYNC` で MySQL からインデックスを作り、`SYNC STATUS` で完了を確認してから検索します。

```bash
docker exec -it mygramdb mygram-cli
```

```mygram
AUTH <API_ADMIN_TOKEN>
SYNC articles
SYNC STATUS
SEARCH articles hello world
```

## クライアントライブラリ

Node.js・Go・Python の公式クライアントがあります。接続オプション、フィルタ、エラー処理は[公式クライアント](/ja/docs/client-libraries)のページにまとめています。

<div class="client-grid">
  <div class="client-card">
    <span class="client-card__lang">Node.js</span>
    <code class="client-card__install">npm install mygramdb-client</code>
    <a class="client-card__repo" href="https://github.com/libraz/node-mygramdb-client" target="_blank" rel="noopener">node-mygramdb-client<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 17 17 7M9 7h8v8"/></svg></a>
  </div>
  <div class="client-card">
    <span class="client-card__lang">Go</span>
    <code class="client-card__install">go get github.com/libraz/go-mygram-client</code>
    <a class="client-card__repo" href="https://github.com/libraz/go-mygram-client" target="_blank" rel="noopener">go-mygram-client<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 17 17 7M9 7h8v8"/></svg></a>
  </div>
  <div class="client-card">
    <span class="client-card__lang">Python</span>
    <code class="client-card__install">pip install mygramdb-client</code>
    <a class="client-card__repo" href="https://github.com/libraz/python-mygramdb-client" target="_blank" rel="noopener">python-mygramdb-client<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 17 17 7M9 7h8v8"/></svg></a>
  </div>
</div>

::: code-group

```javascript [Node.js]
import { createMygramClient } from 'mygramdb-client'

const client = createMygramClient({ host: 'localhost', port: 11016 })
await client.connect()

const results = await client.search('app_db.articles', 'hello world', {
  limit: 10
})
```

```go [Go]
import mygram "github.com/libraz/go-mygram-client"

client := mygram.NewClient("localhost:11016")
defer client.Close()
client.Connect()

resp, _ := client.Search("app_db.articles", "hello world", mygram.SearchOptions{
    Limit: 10,
})
```

```python [Python]
from mygramdb_client import MygramClient, ClientConfig, SearchOptions

async with MygramClient(ClientConfig(host='localhost', port=11016)) as client:
    results = await client.search(
        'app_db.articles',
        'hello world',
        SearchOptions(limit=10),
    )
```

:::

## 関連プロジェクト

<div class="repo-grid">

<div class="repo-card">
  <a class="repo-card__hit" href="https://github.com/libraz/libmybinlog" target="_blank" rel="noopener" aria-label="libmybinlog on GitHub"></a>
  <div class="repo-card__top">
    <svg class="repo-card__icon" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2A10 10 0 0 0 2 12c0 4.42 2.87 8.17 6.84 9.5c.5.08.66-.23.66-.5v-1.69c-2.77.6-3.36-1.34-3.36-1.34c-.46-1.16-1.11-1.47-1.11-1.47c-.91-.62.07-.6.07-.6c1 .07 1.53 1.03 1.53 1.03c.87 1.52 2.34 1.07 2.91.83c.09-.65.35-1.09.63-1.34c-2.22-.25-4.55-1.11-4.55-4.92c0-1.11.38-2 1.03-2.71c-.1-.25-.45-1.29.1-2.64c0 0 .84-.27 2.75 1.02c.79-.22 1.65-.33 2.5-.33s1.71.11 2.5.33c1.91-1.29 2.75-1.02 2.75-1.02c.55 1.35.2 2.39.1 2.64c.65.71 1.03 1.6 1.03 2.71c0 3.82-2.34 4.66-4.57 4.91c.36.31.69.92.69 1.85V21c0 .27.16.59.67.5C19.14 20.16 22 16.42 22 12A10 10 0 0 0 12 2Z"/></svg>
    <span class="repo-card__name">libmybinlog</span>
    <span class="repo-card__cta">GitHub<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 17 17 7M9 7h8v8"/></svg></span>
  </div>
  <p class="repo-card__desc">MygramDB が binlog のデコードに使っている C++17 ライブラリです。MySQL と MariaDB の binlog のバイト列を型付きのイベントと行の値に変換し、チェックサム、GTID、圧縮イベントも扱います。ネットワーク処理は含みません。</p>
  <div class="repo-card__tags">
    <span class="repo-card__tag">binlog</span>
    <span class="repo-card__tag">C++17</span>
    <span class="repo-card__tag">MySQL</span>
    <span class="repo-card__tag">MariaDB</span>
  </div>
</div>

<div class="repo-card">
  <a class="repo-card__hit" href="https://github.com/libraz/mysql-event-stream" target="_blank" rel="noopener" aria-label="mysql-event-stream on GitHub"></a>
  <div class="repo-card__top">
    <svg class="repo-card__icon" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2A10 10 0 0 0 2 12c0 4.42 2.87 8.17 6.84 9.5c.5.08.66-.23.66-.5v-1.69c-2.77.6-3.36-1.34-3.36-1.34c-.46-1.16-1.11-1.47-1.11-1.47c-.91-.62.07-.6.07-.6c1 .07 1.53 1.03 1.53 1.03c.87 1.52 2.34 1.07 2.91.83c.09-.65.35-1.09.63-1.34c-2.22-.25-4.55-1.11-4.55-4.92c0-1.11.38-2 1.03-2.71c-.1-.25-.45-1.29.1-2.64c0 0 .84-.27 2.75 1.02c.79-.22 1.65-.33 2.5-.33s1.71.11 2.5.33c1.91-1.29 2.75-1.02 2.75-1.02c.55 1.35.2 2.39.1 2.64c.65.71 1.03 1.6 1.03 2.71c0 3.82-2.34 4.66-4.57 4.91c.36.31.69.92.69 1.85V21c0 .27.16.59.67.5C19.14 20.16 22 16.42 22 12A10 10 0 0 0 12 2Z"/></svg>
    <span class="repo-card__name">mysql-event-stream</span>
    <span class="repo-card__cta">GitHub<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 17 17 7M9 7h8v8"/></svg></span>
  </div>
  <p class="repo-card__desc">MygramDB から切り出した軽量な MySQL / MariaDB CDC エンジンです。デコードした binlog イベントを、Node.js (N-API) と Python (ctypes) のバインディング経由でアプリケーションに流します。MySQL 8.4 以降と MariaDB 10.11 以降に対応します。</p>
  <div class="repo-card__tags">
    <span class="repo-card__tag">CDC</span>
    <span class="repo-card__tag">binlog</span>
    <span class="repo-card__tag">Node.js</span>
    <span class="repo-card__tag">Python</span>
  </div>
</div>

</div>
