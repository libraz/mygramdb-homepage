---
title: MygramDB Replication Management
description: How MygramDB coordinates replication around DUMP, SYNC, maintenance operations, and source changes.
---

# Replication Management

## Scope

This page describes MygramDB's own replication lifecycle. It does not manage MySQL promotion or replica topology. MygramDB reads from the endpoint in its startup configuration; changing that endpoint requires a configuration change and restart.

## Coordination around maintenance

`DUMP SAVE`, `DUMP LOAD`, scheduled snapshots, and `SYNC` coordinate with the single binlog reader. The server pauses and drains replication where an operation needs a consistent position, then restores it after the operation succeeds or fails. A pause during a long dump can increase lag behind MySQL.

| Operation | Replication behavior | Reader impact |
| --- | --- | --- |
| `DUMP SAVE` | Pauses for a consistent saved GTID, then resumes. | Search remains available; lag can grow while saving. |
| `DUMP LOAD` | Pauses before replacing state; on success it uses the dump GTID before restoring replication. | Restored data is installed atomically; readiness also requires replication to be available. |
| `SYNC` | Drains the shared reader, builds one table off to the side, then restarts. | A single reader serves every configured table, so normal restarts use the drained position. |
| `OPTIMIZE` | Holds the shared maintenance slot. | Run it separately from dumps and SYNC. |

The long-running operations share one slot. A new request while another is active fails as busy; wait for the active operation to reach a terminal status.

## Source endpoint changes

`mysql.host` and `mysql.port` are immutable runtime variables. `SET` returns an immutable-variable error. To change sources, edit the configuration, validate it with `mygramdb -t <config>`, and restart.

An automatic reconnect stays on the configured endpoint. If that endpoint resolves to a MySQL server with a different source UUID, MygramDB rejects it instead of following it. Investigate the promotion or endpoint change, update the configuration when appropriate, and restart against the intended source.

## Readiness while replication is paused

Temporary maintenance pauses do not by themselves mean the reader has failed. `/health/ready` and `INFO` account for the operation in progress. They remain not ready for an active `SYNC` or dump load, for uninitialized data, and for a replication reader that is neither running nor starting once no coordinated pause applies.

After a successful `DUMP LOAD`, restored tables count as initialized even if restarting replication fails; the data is present, but readiness remains false until replication is available. Use the health reason and replication error to decide whether to repair the MySQL connection, credentials, GTID history, or schema.

## Operator checklist

1. Before maintenance, check `/health/ready`, `INFO`, and the active `SYNC` or dump status.
2. Run one long operation at a time.
3. After it completes, confirm replication is running and readiness is `ready`.
4. For a source move, change configuration and restart; never issue runtime endpoint `SET` commands.
5. If replication stopped on error `2017`, follow the special recovery in [Replication](/docs/replication#recovering-from-an-undecodable-binlog-event).

## See also

- [Operations](/docs/operations)
- [Replication](/docs/replication)
- [Snapshot and dump recovery](/docs/snapshot)
- [SYNC command](/docs/sync-command)
