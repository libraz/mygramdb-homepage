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
  text: "Fast full-text search for MySQL"
  tagline: An in-memory index that follows the MySQL / MariaDB binlog. Writes stay in MySQL; search moves to MygramDB.
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
    details: GTID-based binlog replication for MySQL 8.4/9.7/26.x and MariaDB 10.11+/11.x/12.x. Writes stay in MySQL; only search moves.
  - icon:
      src: /icons/globe.svg
    title: Full Unicode, multibyte-ready
    details: ICU-based NFKC normalization with language-agnostic n-gram tokenization. Handles 3-byte and 4-byte UTF-8 out of the box, with no language-specific plugins.
  - icon:
      src: /icons/radio.svg
    title: Dual Protocol
    details: A memcached-like TCP protocol and a REST/JSON HTTP API. Connect from the CLI, any HTTP client, or the client libraries.
  - icon:
      src: /icons/list-ordered.svg
    title: BM25 scoring & highlighting
    details: Rank results by BM25 relevance score, return highlighted snippets, and expand queries via synonym dictionaries.
  - icon:
      src: /icons/funnel.svg
    title: Fuzzy search & faceted aggregation
    details: Levenshtein fuzzy matching and filter-column aggregation with document counts.
---

## How it fits

MygramDB runs as a sidecar next to MySQL or MariaDB. Your application keeps writing to the database as before. MygramDB follows the binlog into its own in-memory index, and only search queries go to MygramDB.

<DocDiagram name="deployment-topology" alt="The application keeps writing to MySQL or MariaDB as before, MygramDB follows the GTID binlog stream to maintain an in-memory search index, and the application sends only search queries to MygramDB over TCP 11016 or HTTP 8080." />

## Quick Start

### Prepare MySQL {.qs-step}

Turn on GTID mode and create a replication user. MygramDB reads the binlog (MySQL's change log) and uses GTIDs to track how far it has read; see the [Glossary](/docs/glossary).

```sql
SET GLOBAL enforce_gtid_consistency = ON;
SET GLOBAL gtid_mode = OFF_PERMISSIVE;
SET GLOBAL gtid_mode = ON_PERMISSIVE;
SET GLOBAL gtid_mode = ON;
SET GLOBAL binlog_format = ROW;
SET GLOBAL binlog_row_image = FULL;
SET GLOBAL binlog_row_metadata = FULL;
CREATE USER 'repl_user'@'%' IDENTIFIED BY 'your_password';
-- SELECT: for initial snapshot of search target tables
GRANT REPLICATION SLAVE, REPLICATION CLIENT ON *.* TO 'repl_user'@'%';
GRANT SELECT ON mydb.* TO 'repl_user'@'%';
```

::: warning Persist the settings
`SET GLOBAL` values can reset on restart. In production, keep `log_bin` on and also set `gtid_mode=ON`, `binlog_format=ROW`, `binlog_row_image=FULL` and `binlog_row_metadata=FULL` in `my.cnf` or your managed parameter group. Upgrading an existing deployment? Follow the [upgrade checklist](/docs/upgrade-v1.12) first.
:::

### Start MygramDB {.qs-step}

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

::: warning Network allowlist
Set `NETWORK_ALLOW_CIDRS` to the subnet MygramDB actually sees clients from; `172.16.0.0/12` is a local Docker bridge example. Keep the loopback entries for in-container clients and health checks. A `0.0.0.0/0` allowlist with a non-loopback container listener is rejected. See [Docker deployment](/docs/docker-deployment).
:::

### Load and search {.qs-step}

MygramDB does not import existing rows on startup. Run `SYNC` once to build the index from MySQL, check `SYNC STATUS`, then search.

```bash
docker exec -it mygramdb mygram-cli
```

```mygram
AUTH <API_ADMIN_TOKEN>
SYNC articles
SYNC STATUS
SEARCH articles hello world
```

## Client Libraries

Official clients for Node.js, Go and Python. The [client guide](/docs/client-libraries) covers connection options, filters and error handling.

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

## Related Projects

<div class="repo-grid">

<div class="repo-card">
  <a class="repo-card__hit" href="https://github.com/libraz/libmybinlog" target="_blank" rel="noopener" aria-label="libmybinlog on GitHub"></a>
  <div class="repo-card__top">
    <svg class="repo-card__icon" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2A10 10 0 0 0 2 12c0 4.42 2.87 8.17 6.84 9.5c.5.08.66-.23.66-.5v-1.69c-2.77.6-3.36-1.34-3.36-1.34c-.46-1.16-1.11-1.47-1.11-1.47c-.91-.62.07-.6.07-.6c1 .07 1.53 1.03 1.53 1.03c.87 1.52 2.34 1.07 2.91.83c.09-.65.35-1.09.63-1.34c-2.22-.25-4.55-1.11-4.55-4.92c0-1.11.38-2 1.03-2.71c-.1-.25-.45-1.29.1-2.64c0 0 .84-.27 2.75 1.02c.79-.22 1.65-.33 2.5-.33s1.71.11 2.5.33c1.91-1.29 2.75-1.02 2.75-1.02c.55 1.35.2 2.39.1 2.64c.65.71 1.03 1.6 1.03 2.71c0 3.82-2.34 4.66-4.57 4.91c.36.31.69.92.69 1.85V21c0 .27.16.59.67.5C19.14 20.16 22 16.42 22 12A10 10 0 0 0 12 2Z"/></svg>
    <span class="repo-card__name">libmybinlog</span>
    <span class="repo-card__cta">GitHub<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 17 17 7M9 7h8v8"/></svg></span>
  </div>
  <p class="repo-card__desc">The C++17 binlog decoder under MygramDB. Turns MySQL and MariaDB binlog bytes into typed events and row values, including checksums, GTIDs and compressed events. No network code.</p>
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
  <p class="repo-card__desc">A lightweight MySQL / MariaDB CDC engine extracted from MygramDB. Streams decoded binlog events to applications through Node.js (N-API) and Python (ctypes) bindings. MySQL 8.4+ and MariaDB 10.11+.</p>
  <div class="repo-card__tags">
    <span class="repo-card__tag">CDC</span>
    <span class="repo-card__tag">binlog</span>
    <span class="repo-card__tag">Node.js</span>
    <span class="repo-card__tag">Python</span>
  </div>
</div>

</div>
