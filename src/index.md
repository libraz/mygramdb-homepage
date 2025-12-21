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

MySQL requires GTID mode and a replication user:

```sql
SET GLOBAL gtid_mode = ON;
CREATE USER 'repl_user'@'%' IDENTIFIED BY 'your_password';
-- SELECT: for initial snapshot of search target tables
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
`NETWORK_ALLOW_CIDRS=0.0.0.0/0` allows connections from any IP. For production, restrict to specific ranges (e.g., `10.0.0.0/8,172.16.0.0/12`).
:::

```bash
echo "SEARCH articles hello world" | nc localhost 11016
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

<a href="https://github.com/libraz/node-mygramdb-client" class="vp-button" target="_blank"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2A10 10 0 0 0 2 12c0 4.42 2.87 8.17 6.84 9.5c.5.08.66-.23.66-.5v-1.69c-2.77.6-3.36-1.34-3.36-1.34c-.46-1.16-1.11-1.47-1.11-1.47c-.91-.62.07-.6.07-.6c1 .07 1.53 1.03 1.53 1.03c.87 1.52 2.34 1.07 2.91.83c.09-.65.35-1.09.63-1.34c-2.22-.25-4.55-1.11-4.55-4.92c0-1.11.38-2 1.03-2.71c-.1-.25-.45-1.29.1-2.64c0 0 .84-.27 2.75 1.02c.79-.22 1.65-.33 2.5-.33s1.71.11 2.5.33c1.91-1.29 2.75-1.02 2.75-1.02c.55 1.35.2 2.39.1 2.64c.65.71 1.03 1.6 1.03 2.71c0 3.82-2.34 4.66-4.57 4.91c.36.31.69.92.69 1.85V21c0 .27.16.59.67.5C19.14 20.16 22 16.42 22 12A10 10 0 0 0 12 2Z"/></svg>mygramdb-client on GitHub</a>
