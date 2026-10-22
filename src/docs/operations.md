---
title: MygramDB Operations Guide
description: Operate MygramDB with runtime variables, configured MySQL endpoints, readiness probes, replication diagnostics, and log rotation.
head:
  - - meta
    - name: keywords
      content: MygramDB operations, runtime variables, MySQL endpoint, readiness, replication lag, SIGUSR1
---

# Operations Guide

## Operating model

MygramDB has two kinds of configuration. A small allowlist can be changed with `SET` while the server is running. Connection, table, replication, and listener settings are startup-only: edit the configuration, validate it, and restart the process.

::: info Runtime settings and configuration files
`SET` changes the running process only. It does not rewrite the configuration file, so record a permanent change in that file as well.
:::

## Runtime variables

Use `SHOW VARIABLES` to inspect the effective values, and `SET` for the runtime allowlist.

`SET` validates assigned values against the same schema rules used when loading the configuration. If startup used `--schema`, runtime `SET` also applies that custom schema. A multi-assignment command is atomic: if one value fails with `1004`, none of the assignments are applied, and the error identifies the rejected variable. The `replication.server_id` non-zero check and the enabled-cache ceiling of 50% of detected physical memory also apply to runtime `SET` validation.

```sql
SHOW VARIABLES LIKE 'cache%'
SET logging.level = 'debug'
SET cache.enabled = false
SET api.default_limit = 200, api.rate_limiting.capacity = 200
```

| Mutable variable | Typical use |
| --- | --- |
| `logging.level`, `logging.format` | Change diagnostics or log encoding. |
| `api.default_limit`, `api.max_query_length` | Tune request defaults and bounds. |
| `api.rate_limiting.enable`, `api.rate_limiting.capacity`, `api.rate_limiting.refill_rate` | Tune the shared TCP and HTTP rate limiter. |
| `cache.enabled`, `cache.min_query_cost_ms`, `cache.ttl_seconds` | Enable or tune the query cache. |

All other known variables are immutable. In particular, `mysql.host` and `mysql.port` are startup-only:

```sql
SET mysql.host = 'mysql-primary-2.example.com'
-- ERROR: Variable 'mysql.host' is immutable (requires restart)
```

## Changing the MySQL source

MygramDB reconnects automatically to the configured endpoint after a transport failure. That reconnect verifies the source; a changed MySQL server UUID is rejected rather than silently following a promoted or unrelated server.

For planned maintenance or a primary promotion:

1. Make the promoted MySQL server available at the intended endpoint, with the required GTID history, row binlog format, and configured tables.
2. Update `mysql.host` and/or `mysql.port` in the MygramDB configuration.
3. Validate the configuration with `mygramdb -t <config>`.
4. Restart MygramDB and wait for its readiness probe before sending traffic.

Do not use `SET mysql.host` or `SET mysql.port`, and do not treat an automatic reconnect as permission to follow a different source UUID.

## Readiness, liveness, and traffic gates

`GET /health/live` reports whether the process is alive. `GET /health/ready` is the traffic gate: it returns `200` only when the initial data is initialized, no dump load or `SYNC` is active, and replication is not unavailable. Otherwise it returns `503` with a reason and a redacted replication summary.

```bash
curl -fsS http://127.0.0.1:8080/health/live
curl -fsS http://127.0.0.1:8080/health/ready
```

TCP-only deployments can use `INFO`. Its `data_initialized` and `readiness` fields use the same inputs as `/health/ready`.

```text
# Server
data_initialized: true
readiness: ready
```

Readiness stays false while any configured table has not been initialized. A successful startup dump restore or `DUMP LOAD` marks restored tables initialized, but a replication restart failure still leaves readiness false.

## Replication diagnostics

Use `INFO`, `/health/ready`, `/health/detail`, or `/metrics` to observe replication. When `api.admin_token` is set, TCP `INFO` omits the entire `# Replication` section until the connection completes `AUTH`. HTTP `/metrics` remains public but omits all `mygramdb_replication_` metrics unless the request carries the bearer token. The health routes remain public and redact the current GTID, processed-event and queue counters, CRC counts, schema-incompatibility details, and raw MySQL error text. `/replication/status` also requires the token when `api.admin_token` is configured. The full error remains available to authorized clients and in the logs.

The lag timestamp is updated when MygramDB advances the applied GTID. Treat `replication_seconds_since_last_applied` as an elapsed-time signal, not proof that MySQL currently has no new commits: an idle source also has no recent applied event. Alert on it together with MySQL write activity, replication state, and the error fields.

If readiness returns `503`, use its `reason` first. Common states are an initial load that has not happened, an active `SYNC`, an active dump load, a stopped replication reader, or an incompatible schema. See [Replication](/docs/replication) for recovery and [Snapshot and dump recovery](/docs/snapshot) for dump procedures.

## Safe operational changes

Long-running operations share one maintenance slot. `SYNC`, `DUMP SAVE`, `DUMP LOAD`, `OPTIMIZE`, and scheduled snapshots cannot overlap. Schedule them deliberately, watch their status, and keep traffic out of a table while it is synchronizing.

`OPTIMIZE` checks memory before rebuilding an index. Its admission estimate includes the resident index, a full rebuild copy, term snapshots, batch bookkeeping, and a safety margin, so keep roughly 2.1 times the current index memory free. If the estimate does not fit, `OPTIMIZE` is refused before it starts; provision memory or reduce the indexed data before retrying.

The rate limiter uses one token bucket per client IP across TCP and HTTP. `capacity` and `refill_rate` therefore apply to the combined traffic, and runtime `SET api.rate_limiting.*` changes both protocol surfaces. A client that uses both protocols draws from the same burst and refill budget.

For settings that require restart, use a rollout that keeps a healthy instance available if the deployment topology allows it. Confirm the configuration before stopping a healthy process, then confirm `INFO` or `/health/ready` after it starts.

## Log rotation

Send `SIGUSR1` to ask MygramDB to reopen its log file after an external rotation tool has moved it.

```bash
kill -USR1 "$(pgrep -x mygramdb)"
```

Check the process manager and the new log file after rotation. Do not use signals as a substitute for a supervised restart when changing startup-only settings.

`SIGINT` and `SIGTERM` request graceful shutdown. MygramDB does not handle `SIGHUP`; its default action terminates the process. Use `SIGUSR1` for log rotation.

## See also

- [Replication management](/docs/replication-management)
- [Replication](/docs/replication)
- [Snapshot and dump recovery](/docs/snapshot)
- [SYNC command](/docs/sync-command)
