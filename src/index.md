---
layout: home
title: MygramDB - 27-3700x faster than MySQL FULLTEXT
titleTemplate: false
description: MySQL FULLTEXT too slow? MygramDB is an in-memory full-text search engine that syncs via MySQL replication. Sub-80ms queries, 100% success under load.
head:
  - - meta
    - name: keywords
      content: MySQL FULLTEXT slow, MySQL search timeout, MySQL full-text search alternative, in-memory search engine

hero:
  name: "MygramDB"
  text: "27-3700x faster than MySQL FULLTEXT"
  tagline: In-memory full-text search engine with MySQL replication
  actions:
    - theme: brand
      text: View on GitHub
      link: https://github.com/libraz/mygram-db
    - theme: alt
      text: Benchmarks
      link: /benchmarks

features:
  - icon:
      src: /icons/zap.svg
    title: MySQL FULLTEXT too slow?
    details: MygramDB delivers sub-80ms queries with in-memory indexing. No more timeout errors.
  - icon:
      src: /icons/refresh-cw.svg
    title: Real-time MySQL sync
    details: GTID-based binlog replication. Keep writes in MySQL, just speed up search.
  - icon:
      src: /icons/globe.svg
    title: CJK Ready
    details: ICU-based Unicode normalization with N-gram. Perfect for Japanese, Chinese, Korean.
  - icon:
      src: /icons/radio.svg
    title: Dual Protocol
    details: Memcached-like TCP and REST/JSON HTTP API. Easy integration.
---

## Quick Start

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
# Search via HTTP API
curl "http://localhost:8080/articles/search?q=hello+world"
```

## Client Libraries

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
