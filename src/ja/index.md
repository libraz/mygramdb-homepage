---
layout: home
title: MygramDB - MySQLレプリケーション対応インメモリ全文検索
titleTemplate: false
description: MySQL FULLTEXTが遅い？MygramDBはMySQLレプリケーションで同期するインメモリ全文検索エンジン。100万行規模でサブミリ秒のクエリ応答。
head:
  - - meta
    - name: keywords
      content: MySQL FULLTEXT 遅い, MySQL 全文検索 遅い, MySQL 検索 タイムアウト, MySQL 検索 高速化, インメモリ検索エンジン

hero:
  name: "MygramDB"
  text: "サブミリ秒の全文検索"
  tagline: MySQL binlogレプリケーションで同期するインメモリ検索エンジン
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
    details: MygramDBはインメモリでサブミリ秒のクエリを実現。タイムアウトエラーを解消。
  - icon:
      src: /icons/refresh-cw.svg
    title: MySQLとリアルタイム同期
    details: GTIDベースのbinlogレプリケーション。書き込みはMySQLのまま、検索だけ高速化。
  - icon:
      src: /icons/globe.svg
    title: 日本語対応
    details: ICUベースのUnicode正規化とN-gram対応。日本語・CJKテキストに最適。
  - icon:
      src: /icons/radio.svg
    title: デュアルプロトコル
    details: memcachedライクTCPとREST/JSON HTTP API。どの言語からも簡単接続。
---

## クイックスタート

MySQLでGTIDモードとレプリケーションユーザーを設定:

```sql
SET GLOBAL gtid_mode = ON;
CREATE USER 'repl_user'@'%' IDENTIFIED BY 'your_password';
-- SELECT: 全文検索対象テーブルの初期スナップショット取得用
GRANT REPLICATION SLAVE, REPLICATION CLIENT, SELECT ON mydb.* TO 'repl_user'@'%';
```

```bash
docker run -d --name mygramdb \
  -p 11016:11016 -p 8080:8080 \
  -e MYSQL_HOST=your-mysql-host \
  -e MYSQL_USER=repl_user \
  -e MYSQL_PASSWORD=your_password \
  -e MYSQL_DATABASE=mydb \
  -e TABLE_NAME=articles \
  -e NETWORK_ALLOW_CIDRS=0.0.0.0/0 \
  ghcr.io/libraz/mygram-db:latest
```

::: warning
`NETWORK_ALLOW_CIDRS=0.0.0.0/0` はすべてのIPからの接続を許可します。本番環境では特定の範囲に制限してください（例: `10.0.0.0/8,172.16.0.0/12`）。
:::

```bash
echo "SEARCH articles hello world" | nc localhost 11016
```

## クライアントライブラリ

### Node.js

```bash
npm install mygramdb-client
```

```javascript
import { MygramClient } from 'mygramdb-client'

const client = new MygramClient({ host: 'localhost', port: 11016 })
const results = await client.search('articles', 'hello world')
```

<a href="https://github.com/libraz/node-mygramdb-client" class="vp-button" target="_blank"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2A10 10 0 0 0 2 12c0 4.42 2.87 8.17 6.84 9.5c.5.08.66-.23.66-.5v-1.69c-2.77.6-3.36-1.34-3.36-1.34c-.46-1.16-1.11-1.47-1.11-1.47c-.91-.62.07-.6.07-.6c1 .07 1.53 1.03 1.53 1.03c.87 1.52 2.34 1.07 2.91.83c.09-.65.35-1.09.63-1.34c-2.22-.25-4.55-1.11-4.55-4.92c0-1.11.38-2 1.03-2.71c-.1-.25-.45-1.29.1-2.64c0 0 .84-.27 2.75 1.02c.79-.22 1.65-.33 2.5-.33s1.71.11 2.5.33c1.91-1.29 2.75-1.02 2.75-1.02c.55 1.35.2 2.39.1 2.64c.65.71 1.03 1.6 1.03 2.71c0 3.82-2.34 4.66-4.57 4.91c.36.31.69.92.69 1.85V21c0 .27.16.59.67.5C19.14 20.16 22 16.42 22 12A10 10 0 0 0 12 2Z"/></svg>mygramdb-client on GitHub</a>

### Go

```bash
go get github.com/libraz/go-mygram-client
```

```go
import mygram "github.com/libraz/go-mygram-client"

client := mygram.NewClient("localhost:11016")
defer client.Close()
client.Connect()

resp, _ := client.Search("articles", "hello world", mygram.SearchOptions{})
```

<a href="https://github.com/libraz/go-mygram-client" class="vp-button" target="_blank"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2A10 10 0 0 0 2 12c0 4.42 2.87 8.17 6.84 9.5c.5.08.66-.23.66-.5v-1.69c-2.77.6-3.36-1.34-3.36-1.34c-.46-1.16-1.11-1.47-1.11-1.47c-.91-.62.07-.6.07-.6c1 .07 1.53 1.03 1.53 1.03c.87 1.52 2.34 1.07 2.91.83c.09-.65.35-1.09.63-1.34c-2.22-.25-4.55-1.11-4.55-4.92c0-1.11.38-2 1.03-2.71c-.1-.25-.45-1.29.1-2.64c0 0 .84-.27 2.75 1.02c.79-.22 1.65-.33 2.5-.33s1.71.11 2.5.33c1.91-1.29 2.75-1.02 2.75-1.02c.55 1.35.2 2.39.1 2.64c.65.71 1.03 1.6 1.03 2.71c0 3.82-2.34 4.66-4.57 4.91c.36.31.69.92.69 1.85V21c0 .27.16.59.67.5C19.14 20.16 22 16.42 22 12A10 10 0 0 0 12 2Z"/></svg>go-mygram-client on GitHub</a>

### Python

```bash
pip install mygramdb-client
```

```python
from mygramdb_client import MygramClient, ClientConfig

client = MygramClient(ClientConfig(host='localhost', port=11016))
await client.connect()

results = await client.search('articles', 'hello world')
```

<a href="https://github.com/libraz/python-mygramdb-client" class="vp-button" target="_blank"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2A10 10 0 0 0 2 12c0 4.42 2.87 8.17 6.84 9.5c.5.08.66-.23.66-.5v-1.69c-2.77.6-3.36-1.34-3.36-1.34c-.46-1.16-1.11-1.47-1.11-1.47c-.91-.62.07-.6.07-.6c1 .07 1.53 1.03 1.53 1.03c.87 1.52 2.34 1.07 2.91.83c.09-.65.35-1.09.63-1.34c-2.22-.25-4.55-1.11-4.55-4.92c0-1.11.38-2 1.03-2.71c-.1-.25-.45-1.29.1-2.64c0 0 .84-.27 2.75 1.02c.79-.22 1.65-.33 2.5-.33s1.71.11 2.5.33c1.91-1.29 2.75-1.02 2.75-1.02c.55 1.35.2 2.39.1 2.64c.65.71 1.03 1.6 1.03 2.71c0 3.82-2.34 4.66-4.57 4.91c.36.31.69.92.69 1.85V21c0 .27.16.59.67.5C19.14 20.16 22 16.42 22 12A10 10 0 0 0 12 2Z"/></svg>python-mygramdb-client on GitHub</a>

## 関連プロジェクト

### mysql-event-stream

MygramDBから抽出した軽量なMySQL 8.4+ CDC (Change Data Capture) エンジン。MySQLのbinlogレプリケーションイベントをパースし、アプリケーション向けのストリーミングAPIを提供します。MySQL 9.x対応（VECTOR型、RSA認証）。Node.js (N-API) とPython (ctypes) バインディングに対応。

<a href="https://github.com/libraz/mysql-event-stream" class="vp-button" target="_blank"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2A10 10 0 0 0 2 12c0 4.42 2.87 8.17 6.84 9.5c.5.08.66-.23.66-.5v-1.69c-2.77.6-3.36-1.34-3.36-1.34c-.46-1.16-1.11-1.47-1.11-1.47c-.91-.62.07-.6.07-.6c1 .07 1.53 1.03 1.53 1.03c.87 1.52 2.34 1.07 2.91.83c.09-.65.35-1.09.63-1.34c-2.22-.25-4.55-1.11-4.55-4.92c0-1.11.38-2 1.03-2.71c-.1-.25-.45-1.29.1-2.64c0 0 .84-.27 2.75 1.02c.79-.22 1.65-.33 2.5-.33s1.71.11 2.5.33c1.91-1.29 2.75-1.02 2.75-1.02c.55 1.35.2 2.39.1 2.64c.65.71 1.03 1.6 1.03 2.71c0 3.82-2.34 4.66-4.57 4.91c.36.31.69.92.69 1.85V21c0 .27.16.59.67.5C19.14 20.16 22 16.42 22 12A10 10 0 0 0 12 2Z"/></svg>mysql-event-stream on GitHub</a>
