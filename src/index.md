---
layout: home
title: MygramDB - In-memory full-text search with MySQL replication
titleTemplate: false
description: MySQL FULLTEXT too slow? MygramDB is an in-memory full-text search engine that syncs through MySQL replication. See reproducible benchmarks on 1.1M articles.
head:
  - - meta
    - name: keywords
      content: MySQL FULLTEXT slow, MySQL search timeout, MySQL full-text search alternative, in-memory search engine

hero:
  name: "MygramDB"
  text: "In-memory full-text search"
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
    details: Route heavyweight FULLTEXT reads to an in-memory search index. See the reproducible benchmarks for measured latency and throughput.
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

MygramDB deploys as a sidecar next to MySQL/MariaDB: the application keeps writing through the database as before, MygramDB follows the binlog to build its own in-memory search index, and only search reads are routed to MygramDB.

<DocDiagram name="deployment-topology" alt="The application keeps writing to MySQL or MariaDB as before, MygramDB follows the GTID binlog stream to maintain an in-memory search index, and the application sends only search queries to MygramDB over TCP 11016 or HTTP 8080." />

## Quick Start

MySQL requires GTID mode and a replication user:

::: info GTID and binlog
**GTID** is a unique identifier attached to each MySQL change; **binlog** is MySQL's change log. MygramDB reads the binlog and tracks how far it has read using the GTID. See the [Glossary](/docs/glossary) for more.
:::

```sql
SET GLOBAL enforce_gtid_consistency = ON;
SET GLOBAL gtid_mode = OFF_PERMISSIVE;
SET GLOBAL gtid_mode = ON_PERMISSIVE;
SET GLOBAL gtid_mode = ON;
SET GLOBAL binlog_format = ROW;
SET GLOBAL binlog_row_image = FULL;
CREATE USER 'repl_user'@'%' IDENTIFIED BY 'your_password';
-- SELECT: for initial snapshot of search target tables
GRANT REPLICATION SLAVE, REPLICATION CLIENT, SELECT ON mydb.* TO 'repl_user'@'%';
```

::: warning Persist MySQL settings
`SET GLOBAL` changes the running MySQL server, but the values may reset after restart. For production, also set `gtid_mode=ON`, `binlog_format=ROW`, and `binlog_row_image=FULL` in `my.cnf` or your managed MySQL parameter group.
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
`NETWORK_ALLOW_CIDRS=0.0.0.0/0` allows connections from any IP. For production, restrict to specific ranges (e.g., `10.0.0.0/8,172.16.0.0/12`).
:::

::: tip Initial load
MygramDB does not load existing rows just by starting the process. Run `SYNC articles` once to build the search index from MySQL, then use `SYNC STATUS` to watch completion.
:::

```bash
# Start one interactive session, then enter these commands at its prompt.
docker exec -it mygramdb mygram-cli
AUTH <API_ADMIN_TOKEN>
SYNC articles
SYNC STATUS
SEARCH articles hello world
```

## Client Libraries

See [Official Clients](/docs/client-libraries) for full Node.js, Python, and Go usage.

### Node.js <span class="version-badge">v1.10 compatible</span>

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

### Go <span class="version-badge">v1.10 compatible</span>

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

### Python <span class="version-badge">v1.10 compatible</span>

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

## Related Projects

<div class="repo-card">
  <a class="repo-card__hit" href="https://github.com/libraz/mysql-event-stream" target="_blank" rel="noopener" aria-label="mysql-event-stream on GitHub"></a>
  <div class="repo-card__top">
    <svg class="repo-card__icon" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2A10 10 0 0 0 2 12c0 4.42 2.87 8.17 6.84 9.5c.5.08.66-.23.66-.5v-1.69c-2.77.6-3.36-1.34-3.36-1.34c-.46-1.16-1.11-1.47-1.11-1.47c-.91-.62.07-.6.07-.6c1 .07 1.53 1.03 1.53 1.03c.87 1.52 2.34 1.07 2.91.83c.09-.65.35-1.09.63-1.34c-2.22-.25-4.55-1.11-4.55-4.92c0-1.11.38-2 1.03-2.71c-.1-.25-.45-1.29.1-2.64c0 0 .84-.27 2.75 1.02c.79-.22 1.65-.33 2.5-.33s1.71.11 2.5.33c1.91-1.29 2.75-1.02 2.75-1.02c.55 1.35.2 2.39.1 2.64c.65.71 1.03 1.6 1.03 2.71c0 3.82-2.34 4.66-4.57 4.91c.36.31.69.92.69 1.85V21c0 .27.16.59.67.5C19.14 20.16 22 16.42 22 12A10 10 0 0 0 12 2Z"/></svg>
    <span class="repo-card__name">mysql-event-stream</span>
    <span class="repo-card__cta">GitHub<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 17 17 7M9 7h8v8"/></svg></span>
  </div>
  <p class="repo-card__desc">A lightweight MySQL / MariaDB CDC engine extracted from MygramDB — it parses binlog replication events and exposes a streaming API for applications. Supports MySQL 8.4/9.x and MariaDB 10.11+/11.x, with Node.js (N-API) and Python (ctypes) bindings.</p>
  <div class="repo-card__tags">
    <span class="repo-card__tag">CDC</span>
    <span class="repo-card__tag">binlog</span>
    <span class="repo-card__tag">Node.js</span>
    <span class="repo-card__tag">Python</span>
  </div>
</div>
