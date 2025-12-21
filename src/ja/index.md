---
layout: home
title: MygramDB - MySQL FULLTEXTを27〜3700倍高速化
titleTemplate: false
description: MySQL FULLTEXTが遅い？MygramDBはMySQLレプリケーションで同期するインメモリ全文検索エンジン。80ms以下のクエリ、負荷時も100%成功。
head:
  - - meta
    - name: keywords
      content: MySQL FULLTEXT 遅い, MySQL 全文検索 遅い, MySQL 検索 タイムアウト, MySQL 検索 高速化, インメモリ検索エンジン

hero:
  name: "MygramDB"
  text: "MySQL FULLTEXTを27〜3700倍高速化"
  tagline: MySQLレプリケーションで同期するインメモリ全文検索エンジン
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
    details: MygramDBはインメモリで80ms以下のクエリを実現。タイムアウトエラーを解消。
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

```bash
docker run -d --name mygramdb \
  -p 11016:11016 -p 8080:8080 \
  -e MYSQL_HOST=your-mysql-host \
  -e MYSQL_USER=repl_user \
  -e MYSQL_PASSWORD=your_password \
  -e MYSQL_DATABASE=mydb \
  -e TABLE_NAME=articles \
  ghcr.io/libraz/mygram-db:latest
```

```bash
# HTTP APIで検索
curl "http://localhost:8080/articles/search?q=hello+world"
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

[mygramdb-client on GitHub](https://github.com/libraz/node-mygramdb-client)
