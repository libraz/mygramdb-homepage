---
layout: home
title: MygramDB - MySQLレプリケーション対応インメモリ全文検索
titleTemplate: false
description: MySQL FULLTEXTが遅い？MygramDBはMySQLレプリケーションで同期するインメモリ全文検索エンジン。110万件の再現可能なベンチマークを公開しています。
head:
  - - meta
    - name: keywords
      content: MySQL FULLTEXT 遅い, MySQL 全文検索 遅い, MySQL 検索 タイムアウト, MySQL 検索 高速化, インメモリ検索エンジン

hero:
  name: "MygramDB"
  text: "インメモリ全文検索"
  tagline: MySQL / MariaDB binlogレプリケーションで同期するインメモリ検索エンジン
  actions:
    - theme: brand
      text: GitHubで見る
      link: https://github.com/libraz/mygram-db
    - theme: alt
      text: ベンチマーク
      link: /ja/benchmarks

features:
  - icon:
      src: /icons/zap.svg
    title: MySQL FULLTEXTが遅い？
    details: MySQLの横に追加するインメモリ検索エンジン。重いFULLTEXT検索だけをMygramDBへ切り出します。
  - icon:
      src: /icons/refresh-cw.svg
    title: MySQL / MariaDBのbinlogに追従
    details: MySQL 8.4/9.xとMariaDB 10.6+/11.xに対応したGTIDベースのbinlogレプリケーション。書き込みはMySQLのまま、検索処理を分離。
  - icon:
      src: /icons/globe.svg
    title: 日本語対応
    details: ICUベースのUnicode正規化とN-gram対応。日本語・CJKテキストも辞書なしで検索。
  - icon:
      src: /icons/radio.svg
    title: デュアルプロトコル
    details: memcached風のTCPプロトコルとREST/JSON HTTP API。CLI、HTTPクライアント、各言語のクライアントライブラリから接続。
  - icon:
      src: /icons/zap.svg
    title: BM25スコア・ハイライト
    details: BM25スコアで関連度順にソートし、ハイライト付きスニペットを返却。シノニム辞書でクエリ展開も可能。
  - icon:
      src: /icons/globe.svg
    title: ファジー検索・ファセット集計
    details: Levenshtein編集距離によるファジー検索と、フィルタカラム値の件数付きファセット集計に対応。
---

MygramDBはMySQL/MariaDBのサイドカーとして動作します。アプリケーションは従来どおりDBへ書き込み、MygramDBがbinlogを追従して独自のインメモリ検索インデックスを構築し、検索の読み取りだけがMygramDBへルーティングされます。

<DocDiagram name="deployment-topology" alt="アプリケーションは従来どおりMySQL/MariaDBへ書き込み、MygramDBがGTID binlogストリームを追従してインメモリ検索インデックスを維持し、検索クエリのみをTCP 11016またはHTTP 8080でMygramDBに送る構成図" />

## クイックスタート

MySQLでGTIDモードとレプリケーションユーザーを設定:

::: info 用語補足
**GTID** はMySQLの変更に付く一意な番号、**binlog** はMySQLの変更履歴ログです。MygramDBはbinlogを読み、GTIDで「どこまで読んだか」を管理します。詳しくは[用語集](/ja/docs/glossary)を参照してください。
:::

```sql
SET GLOBAL enforce_gtid_consistency = ON;
SET GLOBAL gtid_mode = OFF_PERMISSIVE;
SET GLOBAL gtid_mode = ON_PERMISSIVE;
SET GLOBAL gtid_mode = ON;
SET GLOBAL binlog_format = ROW;
SET GLOBAL binlog_row_image = FULL;
CREATE USER 'repl_user'@'%' IDENTIFIED BY 'your_password';
-- SELECT: 全文検索対象テーブルの初期スナップショット取得用
GRANT REPLICATION SLAVE, REPLICATION CLIENT, SELECT ON mydb.* TO 'repl_user'@'%';
```

::: warning MySQL設定は永続化してください
`SET GLOBAL` は稼働中のMySQLに反映されますが、再起動後に戻る場合があります。本番では `my.cnf` などの永続設定にも `gtid_mode=ON`、`binlog_format=ROW`、`binlog_row_image=FULL` を入れてください。
:::

```bash
docker run -d --name mygramdb \
  -p 11016:11016 -p 8080:8080 \
  -e MYSQL_HOST=your-mysql-host \
  -e MYSQL_USER=repl_user \
  -e MYSQL_PASSWORD=your_password \
  -e MYSQL_DATABASE=mydb \
  -e TABLE_NAME=articles \
  -e TABLE_PRIMARY_KEY=id \
  -e TABLE_TEXT_COLUMN=content \
  -e TABLE_NGRAM_SIZE=2 \
  -e REPLICATION_SERVER_ID=12345 \
  -e NETWORK_ALLOW_CIDRS=0.0.0.0/0 \
  ghcr.io/libraz/mygram-db:latest
```

::: warning
`NETWORK_ALLOW_CIDRS=0.0.0.0/0` はすべてのIPからの接続を許可します。本番環境では特定の範囲に制限してください（例: `10.0.0.0/8,172.16.0.0/12`）。
:::

::: tip 初回ロードについて
MygramDBは起動しただけでは既存データを自動では読み込みません。最初に `SYNC articles` を実行して、MySQLの既存行から検索インデックスを作成します。
:::

```bash
# 1つの対話セッションを開始し、プロンプトで以下のコマンドを入力します。
docker exec -it mygramdb mygram-cli
AUTH <API_ADMIN_TOKEN>
SYNC articles
SYNC STATUS
SEARCH articles hello world
```

## クライアントライブラリ

詳しい使い方は [公式クライアント](/ja/docs/client-libraries) を参照してください。

### Node.js <span class="version-badge">v1.8 compatible</span>

::: code-group

```bash [npm]
npm install mygramdb-client
```

```bash [yarn]
yarn add mygramdb-client
```

```bash [bun]
bun add mygramdb-client
```

:::

```javascript
import { createMygramClient } from 'mygramdb-client'

const client = createMygramClient({ host: 'localhost', port: 11016 })
await client.connect()

const results = await client.search('app_db.articles', 'hello world', {
  limit: 10
})
```

<a href="https://github.com/libraz/node-mygramdb-client" class="vp-button" target="_blank"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2A10 10 0 0 0 2 12c0 4.42 2.87 8.17 6.84 9.5c.5.08.66-.23.66-.5v-1.69c-2.77.6-3.36-1.34-3.36-1.34c-.46-1.16-1.11-1.47-1.11-1.47c-.91-.62.07-.6.07-.6c1 .07 1.53 1.03 1.53 1.03c.87 1.52 2.34 1.07 2.91.83c.09-.65.35-1.09.63-1.34c-2.22-.25-4.55-1.11-4.55-4.92c0-1.11.38-2 1.03-2.71c-.1-.25-.45-1.29.1-2.64c0 0 .84-.27 2.75 1.02c.79-.22 1.65-.33 2.5-.33s1.71.11 2.5.33c1.91-1.29 2.75-1.02 2.75-1.02c.55 1.35.2 2.39.1 2.64c.65.71 1.03 1.6 1.03 2.71c0 3.82-2.34 4.66-4.57 4.91c.36.31.69.92.69 1.85V21c0 .27.16.59.67.5C19.14 20.16 22 16.42 22 12A10 10 0 0 0 12 2Z"/></svg>mygramdb-client on GitHub</a>

### Go <span class="version-badge">v1.8 compatible</span>

```bash
go get github.com/libraz/go-mygram-client
```

```go
import mygram "github.com/libraz/go-mygram-client"

client := mygram.NewClient("localhost:11016")
defer client.Close()
client.Connect()

resp, _ := client.Search("app_db.articles", "hello world", mygram.SearchOptions{
    Limit: 10,
})
```

<a href="https://github.com/libraz/go-mygram-client" class="vp-button" target="_blank"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2A10 10 0 0 0 2 12c0 4.42 2.87 8.17 6.84 9.5c.5.08.66-.23.66-.5v-1.69c-2.77.6-3.36-1.34-3.36-1.34c-.46-1.16-1.11-1.47-1.11-1.47c-.91-.62.07-.6.07-.6c1 .07 1.53 1.03 1.53 1.03c.87 1.52 2.34 1.07 2.91.83c.09-.65.35-1.09.63-1.34c-2.22-.25-4.55-1.11-4.55-4.92c0-1.11.38-2 1.03-2.71c-.1-.25-.45-1.29.1-2.64c0 0 .84-.27 2.75 1.02c.79-.22 1.65-.33 2.5-.33s1.71.11 2.5.33c1.91-1.29 2.75-1.02 2.75-1.02c.55 1.35.2 2.39.1 2.64c.65.71 1.03 1.6 1.03 2.71c0 3.82-2.34 4.66-4.57 4.91c.36.31.69.92.69 1.85V21c0 .27.16.59.67.5C19.14 20.16 22 16.42 22 12A10 10 0 0 0 12 2Z"/></svg>go-mygram-client on GitHub</a>

### Python <span class="version-badge">v1.8 compatible</span>

```bash
pip install mygramdb-client
```

```python
from mygramdb_client import MygramClient, ClientConfig, SearchOptions

async with MygramClient(ClientConfig(host='localhost', port=11016)) as client:
    results = await client.search(
        'app_db.articles',
        'hello world',
        SearchOptions(limit=10),
    )
```

<a href="https://github.com/libraz/python-mygramdb-client" class="vp-button" target="_blank"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2A10 10 0 0 0 2 12c0 4.42 2.87 8.17 6.84 9.5c.5.08.66-.23.66-.5v-1.69c-2.77.6-3.36-1.34-3.36-1.34c-.46-1.16-1.11-1.47-1.11-1.47c-.91-.62.07-.6.07-.6c1 .07 1.53 1.03 1.53 1.03c.87 1.52 2.34 1.07 2.91.83c.09-.65.35-1.09.63-1.34c-2.22-.25-4.55-1.11-4.55-4.92c0-1.11.38-2 1.03-2.71c-.1-.25-.45-1.29.1-2.64c0 0 .84-.27 2.75 1.02c.79-.22 1.65-.33 2.5-.33s1.71.11 2.5.33c1.91-1.29 2.75-1.02 2.75-1.02c.55 1.35.2 2.39.1 2.64c.65.71 1.03 1.6 1.03 2.71c0 3.82-2.34 4.66-4.57 4.91c.36.31.69.92.69 1.85V21c0 .27.16.59.67.5C19.14 20.16 22 16.42 22 12A10 10 0 0 0 12 2Z"/></svg>python-mygramdb-client on GitHub</a>

## 関連プロジェクト

<div class="repo-card">
  <a class="repo-card__hit" href="https://github.com/libraz/mysql-event-stream" target="_blank" rel="noopener" aria-label="mysql-event-stream on GitHub"></a>
  <div class="repo-card__top">
    <svg class="repo-card__icon" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2A10 10 0 0 0 2 12c0 4.42 2.87 8.17 6.84 9.5c.5.08.66-.23.66-.5v-1.69c-2.77.6-3.36-1.34-3.36-1.34c-.46-1.16-1.11-1.47-1.11-1.47c-.91-.62.07-.6.07-.6c1 .07 1.53 1.03 1.53 1.03c.87 1.52 2.34 1.07 2.91.83c.09-.65.35-1.09.63-1.34c-2.22-.25-4.55-1.11-4.55-4.92c0-1.11.38-2 1.03-2.71c-.1-.25-.45-1.29.1-2.64c0 0 .84-.27 2.75 1.02c.79-.22 1.65-.33 2.5-.33s1.71.11 2.5.33c1.91-1.29 2.75-1.02 2.75-1.02c.55 1.35.2 2.39.1 2.64c.65.71 1.03 1.6 1.03 2.71c0 3.82-2.34 4.66-4.57 4.91c.36.31.69.92.69 1.85V21c0 .27.16.59.67.5C19.14 20.16 22 16.42 22 12A10 10 0 0 0 12 2Z"/></svg>
    <span class="repo-card__name">mysql-event-stream</span>
    <span class="repo-card__cta">GitHub<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 17 17 7M9 7h8v8"/></svg></span>
  </div>
  <p class="repo-card__desc">MygramDBから抽出した軽量なMySQL / MariaDB CDCエンジン。binlogレプリケーションイベントをパースし、アプリケーション向けのストリーミングAPIを提供します。MySQL 8.4/9.x・MariaDB 10.11+/11.xに対応し、Node.js (N-API) とPython (ctypes) バインディングを備えます。</p>
  <div class="repo-card__tags">
    <span class="repo-card__tag">CDC</span>
    <span class="repo-card__tag">binlog</span>
    <span class="repo-card__tag">Node.js</span>
    <span class="repo-card__tag">Python</span>
  </div>
</div>
