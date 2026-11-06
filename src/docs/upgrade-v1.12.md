---
title: Upgrade to MygramDB v1.12
description: "Prepare for v1.12: binary logging checked at startup, stricter GTID start positions, tagged GTID support, MySQL 26.x, and stricter row decoding."
---

# Upgrade to v1.12

v1.12 needs no data migration: dumps written by v1.11 load without conversion, and the TCP and HTTP surfaces are unchanged. Two configurations that used to start are now refused. If you are upgrading from before v1.11, also complete the [v1.11 upgrade checklist](/docs/upgrade-v1.11) first.

## Confirm binary logging is on

The source must run with `log_bin=ON`. A server with binary logging off has no binlog to stream; MygramDB now refuses it at startup and on reconnect with `2008`, like the other unmet [source requirements](/docs/replication#source-and-table-validation).

Check the running server:

```sql
SELECT @@GLOBAL.log_bin;
```

`1` means binary logging is on. MySQL enables it by default; MariaDB does not. `log_bin` cannot be changed at runtime, so enable it in the server configuration and restart the source:

```ini
[mysqld]
log_bin = mysql-bin
```

## Check `replication.start_from`

A `gtid=` value holding only separators, such as `gtid=,`, is now a configuration error. Give a real position, or use `snapshot` or `latest`. Validate the file before replacing a running node:

```bash
mygramdb -t /etc/mygramdb/config.yaml
```

## What now works

- **Tagged GTIDs.** A MySQL 8.4+ source whose `gtid_executed` holds tagged entries (`UUID:tag:txn`) used to be refused with `2005`. It now starts, streams, and resumes across reconnects. A bare `UUID:tag:N` start position means "through N" and is widened to `UUID:tag:1-N`, as `UUID:N` is widened to `UUID:1-N`. See [`gtid=<position>`](/docs/replication#start-from-gtid).
- **MySQL 26.x.** Innovation releases are supported alongside the 8.4 and 9.7 LTS series. Their binlog format, GTID encoding, and required settings are the same as 9.7.

## Stricter row decoding

Binlog events are now decoded by libmybinlog, a separate library shared with other binlog tooling. Row values decoded from the binlog render with the same text the snapshot path produces.

Malformed input that used to be decoded by guesswork is now refused. A row event fails if it contains any of these:

- a zero-width BLOB length prefix
- a zero ENUM/SET pack length
- the packed integers `0xFB` or `0xFF`
- a column count of 0

A GTID event with a transaction number of 0 or `INT64_MAX` is an undecodable event (`2017`). A healthy source never writes these, so they point to a damaged binlog. If replication stops with `2017`, follow [Recovering from an undecodable binlog event](/docs/replication#recovering-from-an-undecodable-binlog-event).

Compressed transaction events and `PARTIAL_UPDATE_ROWS` remain unsupported.

## Building from source

The build now requires CMake 3.18 or later and fetches libmybinlog from GitHub. For an offline build, see [Build from Source](/docs/installation#build).

## Update the client libraries

The client releases that track v1.12 are `mygramdb-client` 1.7.0 (Node.js), `mygramdb-client` 1.6.0 (Python), and `go-mygram-client` v0.7.0 (Go). They read each reply to the end the server's grammar defines, and convert web-syntax expressions with the server's grouping, so `a OR b c` becomes `(a OR b c)`. The parsed `SearchExpression` drops the always-empty `optionalTerms` field. See [Client Libraries](/docs/client-libraries).

## Rollout Checklist

1. Confirm `SELECT @@GLOBAL.log_bin;` returns `1` on the source.
2. Validate the production configuration with `mygramdb -t`, and replace any `gtid=` value that holds only separators.
3. If you build from source, check that CMake 3.18 or later is installed.
4. Upgrade application clients to Node.js 1.7.0, Python 1.6.0, or Go v0.7.0, and remove any use of `optionalTerms`.
5. After restart, wait for readiness and confirm replication advances. If it stops with `2017`, check the binlog for damage.

See the [v1.12.0 release notes](https://github.com/libraz/mygram-db/blob/main/docs/releases/v1.12.0.md) for the full change list.
