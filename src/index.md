---
layout: home
title: MygramDB - In-memory full-text search with MySQL replication
titleTemplate: false
description: MySQL FULLTEXT too slow? MygramDB is an in-memory full-text search engine that syncs via MySQL replication. Sub-millisecond queries on million-row datasets.
head:
  - - meta
    - name: keywords
      content: MySQL FULLTEXT slow, MySQL search timeout, MySQL full-text search alternative, in-memory search engine

hero:
  name: "MygramDB"
  text: "Sub-millisecond full-text search"
  tagline: In-memory search engine with MySQL / MariaDB binlog replication
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
    details: MygramDB delivers sub-millisecond queries with in-memory indexing. No more timeout errors.
  - icon:
      src: /icons/refresh-cw.svg
    title: Real-time MySQL / MariaDB sync
    details: GTID-based binlog replication for MySQL 8.4/9.x and MariaDB 10.6+/11.x. Keep writes where they are, just speed up search.
  - icon:
      src: /icons/globe.svg
    title: Full Unicode, multibyte-ready
    details: ICU-based NFKC normalization with language-agnostic N-gram tokenization. Handles 3-byte and 4-byte UTF-8 out of the box — no language-specific plugins.
  - icon:
      src: /icons/radio.svg
    title: Dual Protocol
    details: Memcached-like TCP and REST/JSON HTTP API. Easy integration.
  - icon:
      src: /icons/zap.svg
    title: BM25 scoring & highlighting
    details: Rank results by BM25 relevance score, return highlighted snippets, and expand queries via synonym dictionaries.
  - icon:
      src: /icons/globe.svg
    title: Fuzzy search & faceted aggregation
    details: Levenshtein fuzzy matching and filter-column aggregation with document counts.
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

### Node.js <span class="version-badge">v1.6 compatible</span>

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
import { MygramClient } from 'mygramdb-client'

const client = new MygramClient({ host: 'localhost', port: 11016 })
const results = await client.search('articles', 'hello world')
```

<a href="https://github.com/libraz/node-mygramdb-client" class="vp-button" target="_blank"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2A10 10 0 0 0 2 12c0 4.42 2.87 8.17 6.84 9.5c.5.08.66-.23.66-.5v-1.69c-2.77.6-3.36-1.34-3.36-1.34c-.46-1.16-1.11-1.47-1.11-1.47c-.91-.62.07-.6.07-.6c1 .07 1.53 1.03 1.53 1.03c.87 1.52 2.34 1.07 2.91.83c.09-.65.35-1.09.63-1.34c-2.22-.25-4.55-1.11-4.55-4.92c0-1.11.38-2 1.03-2.71c-.1-.25-.45-1.29.1-2.64c0 0 .84-.27 2.75 1.02c.79-.22 1.65-.33 2.5-.33s1.71.11 2.5.33c1.91-1.29 2.75-1.02 2.75-1.02c.55 1.35.2 2.39.1 2.64c.65.71 1.03 1.6 1.03 2.71c0 3.82-2.34 4.66-4.57 4.91c.36.31.69.92.69 1.85V21c0 .27.16.59.67.5C19.14 20.16 22 16.42 22 12A10 10 0 0 0 12 2Z"/></svg>mygramdb-client on GitHub</a>

### Go <span class="version-badge">v1.6 compatible</span>

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

### Python <span class="version-badge">v1.6 compatible</span>

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

## Related Projects

### mysql-event-stream

A lightweight MySQL / MariaDB CDC (Change Data Capture) engine extracted from MygramDB. Parses binlog replication events and provides a streaming API for applications. Supports MySQL 8.4/9.x (VECTOR type, RSA auth) and MariaDB 10.11+/11.x (flavor auto-detection, `domain-server-seq` GTID, ANNOTATE_ROWS). Node.js (N-API) and Python (ctypes) bindings.

<a href="https://github.com/libraz/mysql-event-stream" class="vp-button" target="_blank"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2A10 10 0 0 0 2 12c0 4.42 2.87 8.17 6.84 9.5c.5.08.66-.23.66-.5v-1.69c-2.77.6-3.36-1.34-3.36-1.34c-.46-1.16-1.11-1.47-1.11-1.47c-.91-.62.07-.6.07-.6c1 .07 1.53 1.03 1.53 1.03c.87 1.52 2.34 1.07 2.91.83c.09-.65.35-1.09.63-1.34c-2.22-.25-4.55-1.11-4.55-4.92c0-1.11.38-2 1.03-2.71c-.1-.25-.45-1.29.1-2.64c0 0 .84-.27 2.75 1.02c.79-.22 1.65-.33 2.5-.33s1.71.11 2.5.33c1.91-1.29 2.75-1.02 2.75-1.02c.55 1.35.2 2.39.1 2.64c.65.71 1.03 1.6 1.03 2.71c0 3.82-2.34 4.66-4.57 4.91c.36.31.69.92.69 1.85V21c0 .27.16.59.67.5C19.14 20.16 22 16.42 22 12A10 10 0 0 0 12 2Z"/></svg>mysql-event-stream on GitHub</a>
