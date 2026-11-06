---
title: How MygramDB Reads the MySQL Binlog - GTIDs and libmybinlog
description: "How MygramDB reads the MySQL and MariaDB binlog: the replication connection, libmybinlog decoding, checksums, GTIDs, compressed events, and startup checks."
head:
  - - meta
    - name: keywords
      content: MygramDB binlog decoding, libmybinlog, MySQL binlog parser, MariaDB binlog, binlog checksum CRC32, tagged GTID, event disposition, COM_BINLOG_DUMP_GTID, mysql-event-stream
---

# How MygramDB Reads the Binlog

MygramDB connects to MySQL or MariaDB as a replica, receives the raw binlog stream, and decodes it with [libmybinlog](https://github.com/libraz/libmybinlog), a separate library that turns binlog bytes into typed events and row values. This page follows one change from the source server to the search index and explains what happens when an event cannot be applied.

::: info What is the binlog?
The **binlog** is the log in which MySQL and MariaDB record every committed change. In ROW format each entry names the table and carries the changed rows. MygramDB needs three things from it: which rows changed, their new values, and a position (a GTID) to resume from after a restart. See the [glossary](/docs/glossary#binlog).
:::

## The Decode Path

<DocDiagram name="binlog-decode-path" alt="Binlog bytes flow from MySQL or MariaDB over a replica connection into libmybinlog, which checks frames and checksums, reads TABLE_MAP, GTID and rows events, and classifies each event. MygramDB keeps the configured tables, updates the index and document store, and records the GTID position. An undecodable event stops replication with error 2017." />

libmybinlog has no network code. MygramDB owns the connection, authentication and the dump request through the MySQL C client API, and passes each event the connection delivers to libmybinlog's parsers. MygramDB then filters the decoded events to the configured tables and applies them to the index and document store.

## Opening the Stream

The two servers use different dump commands, so MygramDB has one stream implementation per server type. Detection uses `SELECT @@GLOBAL.gtid_binlog_pos`, a variable only MariaDB has.

| | MySQL | MariaDB |
| --- | --- | --- |
| Dump command | `COM_BINLOG_DUMP_GTID` | `COM_BINLOG_DUMP` |
| How the start position is sent | GTID set in the dump request, encoded by libmybinlog | `@slave_connect_state` session variable, set before the dump |
| Checksum requested | `@source_binlog_checksum='CRC32'` | `@master_binlog_checksum='CRC32'` |
| Other session setup | Heartbeat every 3 seconds | Heartbeat every 3 seconds, GTID capability, strict GTID mode |

MariaDB omits its GTID events unless the replica advertises GTID capability (`@mariadb_slave_capability = 4`). MygramDB sets it so that every transaction arrives with the GTID it can record. Strict GTID mode and the heartbeat are best-effort: if the server rejects them, the stream still opens.

## What libmybinlog Does

| Step | What happens | If it fails |
| --- | --- | --- |
| Framing and checksum | Reads the event header, checks the CRC32 trailer, and re-derives the checksum algorithm at each `FORMAT_DESCRIPTION` event | Reconnects from the last processed GTID |
| `TABLE_MAP` | Reads column types and, for monitored tables, the column names, signedness and `ENUM`/`SET` labels | Stops with `2017` for an unknown column type or for missing or malformed metadata |
| GTID | Reads the GTID that precedes each transaction | A complete but invalid GTID event (for example transaction number 0) is reported as `2017`; a truncated one is reported as a generic binlog error. Both reconnect from the last processed GTID |
| ROWS events | Decodes `WRITE_ROWS`, `UPDATE_ROWS` and `DELETE_ROWS` into row values for monitored tables | A row-decoding failure is reported as `2008` and follows normal reconnect handling |
| `QUERY` | Provides statement text for transaction boundaries and DDL on configured tables | A statement that may change rows but cannot be recognized stops with `2017` |

Row values are rendered as the same text the initial snapshot produces, so a row indexed from the snapshot and the same row updated from the binlog yield one document. Column types that cannot be rendered identically on both paths are refused in the configuration; see [Supported Column Types](/docs/replication#supported-column-types).

## Event Disposition

Skipping an event is safe only if it cannot carry a row or a position. libmybinlog classifies every event type once, and MygramDB reduces that to three actions.

| Action | Event types |
| --- | --- |
| Decode and apply | `TABLE_MAP`, GTID events, `XID`, `QUERY`, and uncompressed `WRITE_ROWS`/`UPDATE_ROWS`/`DELETE_ROWS` |
| Skip | Stream framing (`ROTATE`, `FORMAT_DESCRIPTION`), informational events such as `HEARTBEAT`, `ROWS_QUERY`, `PREVIOUS_GTIDS` and MariaDB `ANNOTATE_ROWS`, and a type this build does not know when the source marks it ignorable (`LOG_EVENT_IGNORABLE_F`) |
| Stop (fail closed) | `ANONYMOUS_GTID`, `XA_PREPARE`, `INCIDENT`, `EXECUTE_LOAD_QUERY`, MySQL `TRANSACTION_PAYLOAD` and `PARTIAL_UPDATE_ROWS`, MariaDB compressed events, and any unknown type that is not marked ignorable |

A stopped reader reports error `2017` and keeps the last applied GTID. The event stays in the binlog, so reconnecting from that position meets it again; changing the server setting that produced it does not remove it. Recovery is a `SYNC` that restarts the reader past the event. See [Recovering from an undecodable binlog event](/docs/replication#recovering-from-an-undecodable-binlog-event) for the procedure.

## Checksums

Each binlog event can end with a 4-byte CRC32 trailer. A file declares whether its events carry one in its `FORMAT_DESCRIPTION` event, so libmybinlog re-derives the algorithm at every file boundary. It never reads the `binlog_checksum` server variable for this, because older files written under a previous setting can still be streamed.

MygramDB asks the source for CRC32 when it opens the stream, and refuses a source whose `binlog_checksum` is not `CRC32` at startup. A frame that fails verification or arrives truncated is not applied; the reader reconnects from the last processed GTID.

## GTIDs

| | MySQL | MariaDB |
| --- | --- | --- |
| One GTID | `uuid:gno` or `uuid:tag:gno` | `domain-server-seq` |
| Event before each transaction | `GTID` or `GTID_TAGGED` | `GTID` (MariaDB type 162) |
| Position | Set of intervals per UUID and tag | Highest sequence number per domain |

MySQL 8.4 and later can add a tag to a GTID. A tagged transaction arrives as the same GTID with the tag set, and libmybinlog stores tags lower-cased. Tagged and untagged GTIDs from one UUID are tracked as separate entries, and a tagged set uses a different binary encoding in the dump request than an untagged one. MariaDB positions are compared by sequence number per domain; server ids differ legitimately after a failover and are ignored. For start positions and resume behavior, see [GTID Position and Recovery](/docs/replication#gtid-position).

A transaction's GTID becomes the applied position only when its commit is processed, after every row change in it has been applied. A transaction cut off by a disconnect is replayed from the previous position, not skipped.

## Compressed Events

Both servers can compress the binlog, and libmybinlog can expand both kinds. MygramDB does not apply compressed events and refuses them.

| What is compressed | Server setting | MygramDB |
| --- | --- | --- |
| A whole MySQL transaction (`TRANSACTION_PAYLOAD`) | `binlog_transaction_compression=ON` | Refused at startup; stops with `2017` if it appears later |
| MariaDB `QUERY` and rows events | `log_bin_compress=ON` | Refused at startup; stops with `2017` if it appears later |
| One MariaDB `COMPRESSED` `VARCHAR`/`TEXT` column in an ordinary rows event | Column attribute | Inflated before indexing |

MySQL `PARTIAL_JSON` row values (`binlog_row_value_options`) are handled the same way as compression: refused at startup and fail-closed at runtime.

## Server Settings Checked at Startup

libmybinlog holds the rules for which server variables a binlog reader depends on, and MygramDB evaluates them against `SHOW VARIABLES` before it starts reading. The checked variables are `log_bin`, `gtid_mode` (MySQL), `binlog_format`, `binlog_row_image`, `binlog_checksum`, `binlog_row_metadata`, the compression and `PARTIAL_JSON` settings above, and `log_replica_updates` (`log_slave_updates` on MariaDB) when the source is itself a replica. A violation refuses startup with `2008` and names the variable. The required values and their reasons are in [MySQL Server Requirements](/docs/replication#mysql-server-requirements).

A compression or `PARTIAL_JSON` setting enabled after startup is caught when the first affected event arrives, because the event classification above fails closed.

## Building with libmybinlog

The build fetches libmybinlog from GitHub at a pinned release tag set in `third_party/CMakeLists.txt`, so a normal `make` needs no extra step. For an offline build, point `MYBINLOG_SOURCE_DIR` at a local checkout:

```bash
make MYBINLOG_SOURCE_DIR=/path/to/libmybinlog
```

See [Build from Source](/docs/installation#build) for the prerequisites.

## Relationship to mysql-event-stream

[mysql-event-stream](https://github.com/libraz/mysql-event-stream) is a standalone change-data-capture engine with Node.js and Python bindings. It implements its own replication connection and reads the wire format through the same libmybinlog. MygramDB and mysql-event-stream therefore share one set of decoding rules (checksums, GTIDs, row values, event disposition) while keeping separate connection code.

## See Also

- [MySQL Replication Guide](/docs/replication) - Requirements, start modes, GTID positions and recovery
- [SYNC Command Guide](/docs/sync-command) - Rebuilding past an undecodable event
- [Architecture](/docs/architecture) - Where the reader sits in the server
- [Glossary](/docs/glossary#binlog) - Binlog and GTID terms
- [libmybinlog documentation](https://github.com/libraz/libmybinlog) - Decoder, checksums, GTIDs and event disposition in detail
