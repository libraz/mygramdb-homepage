---
title: MygramDB Glossary
description: Short definitions for MygramDB terms including GTID, binlog, N-grams, posting lists, DocIDs, snapshots, and network access control.
---

# Glossary

You do not need to memorize every implementation term to get started. The useful mental model is: MygramDB receives changes from MySQL and updates an in-memory search index.

::: tip Start here
For a first setup, understand **binlog**, **GTID**, **initial snapshot**, **N-gram**, and **CIDR** first.
:::

## MySQL and Replication

### binlog

The MySQL or MariaDB log of changes such as INSERT, UPDATE, and DELETE. MygramDB reads it to update its search index.

### ROW format

A binlog format that records which row changed and how. MygramDB requires `binlog_format=ROW`.

### binlog_row_image=FULL

A setting that includes enough before-and-after row data for UPDATE and DELETE events. It lets MygramDB update text and filter columns correctly.

### binlog_row_metadata=FULL

A MySQL or MariaDB source-server setting that includes optional column metadata, such as names, in `TABLE_MAP` events. MygramDB uses that event metadata to decode rows against the table definition that was in effect when they were written.

### GTID

A unique identifier for a MySQL transaction. MygramDB stores GTIDs in dump files so it can resume from the correct replication position after a restart. On MySQL 8.4 and later a GTID can also carry a tag (`UUID:tag:txn`); see [tagged GTIDs](/docs/replication#start-from-gtid).

### Replica

A server that receives MySQL changes. MygramDB behaves like a search-focused replica, not a general-purpose MySQL replica that serves SQL.

### Replication lag

The delay between a change committed in MySQL and the same change becoming searchable in MygramDB. While lag is high, searches miss the newest writes.

### Initial snapshot

The first read of existing MySQL rows that builds a MygramDB index. Start it explicitly with `SYNC <table>` in the usual setup. It is a read from MySQL, not a file; see [Snapshot and dump](#snapshot-and-dump).

## Search Index

### N-gram

A fixed-length fragment of text. For example, the bigrams of `search` are `se`, `ea`, `ar`, `rc`, and `ch`. MygramDB uses these fragments to find candidates quickly.

### CJK

CJK is short for Chinese, Japanese, and Korean. In MygramDB's indexing settings, CJK refers to ideographs such as the characters in `東京`, not every character used to write those languages. `kanji_ngram_size` controls how these ideographs are split.

### Posting list

The list of document IDs containing an N-gram. If `se` occurs in documents 1, 5, and 42, its posting list is `se -> [1, 5, 42]`.

### Document store

The per-table store that maps DocIDs to MySQL primary keys and keeps filter-column values and normalized text. The index finds candidates; the document store returns and narrows them.

### DocID

MygramDB's internal numeric document ID. It differs from the MySQL primary key; search runs on DocIDs and returns the original primary key.

### Roaring bitmap

A compressed integer-set data structure used for some posting lists. It stores IDs in chunks and chooses a representation for each chunk, such as an array or bitmap. MygramDB uses it for dense lists; the actual memory use depends on the IDs and workload.

### Delta encoding

A compression method that stores the difference from the preceding ID. For example, `100, 105, 200` becomes `100, 5, 95`.

### BM25

A common full-text ranking method. In MygramDB, set `bm25.enable: true` and use `SORT _score DESC` to order results by relevance.

### verify_text

An option that checks normalized search terms against stored normalized text, respecting the query expression, and removes false-positive N-gram candidates. It does not make MygramDB equivalent to MySQL FULLTEXT. Use `memory.verify_text: "all"` to apply this check to all eligible candidates.

### Synonym

A configured alternate term that MygramDB adds to a query. Synonyms can broaden a search to include related wording.

### SIMD

Short for single instruction, multiple data. CPU vector instructions apply one operation to several values at once. CRoaring can use these instructions for bitmap operations when the build and CPU support them.

### Facet

An aggregation of search results by a filter-column value, such as 15 results for `category=tech` and 7 for `category=ops`.

## API and Operations

### TCP protocol

MygramDB's text command protocol. Send commands such as `SEARCH articles hello` to TCP port 11016.

### HTTP API

A JSON API for search, count, facets, and document lookup. Table routes use `/tables/{identity}/...`. The `q` value is treated as a literal search string by default; set `"mode": "boolean"` to use boolean query syntax.

### CIDR

Notation for an IP-address range. `10.0.0.0/8` describes a broad range beginning with `10.`. MygramDB uses `network.allow_cidrs` as an allowlist that restricts which clients may connect.

### CORS

A browser mechanism for calling an HTTP API on another origin. Server-to-server traffic usually does not need it. If a browser must call MygramDB directly, enable CORS and allow only trusted origins; do not use a wildcard for a private API.

### Admin token

The secret set in `api.admin_token`. When it is set, a client must authenticate before running administrative commands such as `DUMP SAVE`.

### Snapshot and dump

The two words name different things. An [initial snapshot](#initial-snapshot) is a read from MySQL that builds the index. A **dump file** is a file MygramDB writes itself, containing the index, document store, and GTID position. Create one with `DUMP SAVE` and restore it with `DUMP LOAD`. See [Snapshot and Dump Recovery](/docs/snapshot).

### WAL

Short for write-ahead log, a common database recovery technique. MygramDB does not use a WAL; it recovers from a dump file plus MySQL binlog replay.
