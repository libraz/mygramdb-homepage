---
title: Upgrade to MygramDB v1.10.2
description: "Upgrade checklist for MygramDB v1.10.1 and v1.10.2: authentication, fail-closed replication, filters, dumps, cache limits, environment overrides, and shared rate limiting."
---

# Upgrade to v1.10.2

::: info Upgrading to the current release
Also follow the [v1.11 upgrade checklist](/docs/upgrade-v1.11), including the required source metadata setting and native client rebuild.
:::

The v1.10.1 and v1.10.2 patch releases correct replication safety, configuration validation, dump recovery, API authentication, and protocol-wide rate limiting. Review these actions before replacing a running node.

## Before You Upgrade

### Set an administrative token

Set `api.admin_token` before exposing the TCP or HTTP listener beyond loopback. A token is required when TCP uses a non-loopback address without a Unix socket, or when HTTP is enabled on a non-loopback address. A Unix socket only exempts the TCP listener.

Prefer `MYGRAM_API_ADMIN_TOKEN` in production. The variable is applied even when the configuration has no `api` block. Generate a high-entropy value and keep it out of the configuration file and shell history:

```bash
openssl rand -hex 32
```

TCP clients must send `AUTH <token>` on the same connection before an administrative command. Administrative HTTP requests use `Authorization: Bearer <token>`. TCP does not encrypt the token, so use it only on a trusted or encrypted network. See the [protocol reference](/docs/protocol) and [HTTP API guide](/docs/http-api) for request details.

### Validate the network and source configuration

The configuration parser rejects combinations that weaken the network boundary:

- a public TCP or enabled HTTP listener without `api.admin_token`;
- a non-loopback listener with an open `0.0.0.0/0` or `::/0` allow list;
- CORS enabled without `cors_allow_origin`;
- MySQL TLS with certificate verification enabled but no CA; and
- a MySQL source without GTID support or with a missing `mysql.user`.

Validate the exact production file before rollout:

```bash
mygramdb -t /etc/mygramdb/config.yaml
```

MygramDB supports MySQL 8.4/9.x and MariaDB 10.11+/11.x/12.x. Use GTID replication with `binlog_format=ROW` and `binlog_row_image=FULL`.

### Check settings that now refuse startup

Update these configurations before restarting:

- `dump.load_on_startup: true` requires `replication.start_from: "snapshot"`. `latest` and `gtid=...` are refused because they could skip binlog changes between the dump GTID and the configured position.
- `cache.ttl_seconds`, `cache.eviction_batch_size`, `cache.invalidation.batch_size`, and `cache.invalidation.max_delay_ms` must not exceed `2147483647`.
- `required_filters` values with type `datetime`, `date`, or `timestamp` must not carry a trailing `Z`, numeric offset, or other suffix. Use epoch seconds or an ISO date/time in the offset configured by `mysql.datetime_timezone`.
- `required_filters` values with type `time` must fit `-838:59:59` through `838:59:59`.
- `float` is not an accepted filter type. `FLOAT` columns used as a primary key, text source, or filter are refused when replication starts.
- `OPTIMIZE` now requires roughly 2.1 times the index memory free and refuses admission when that space is unavailable.

### Check environment overrides

The startup path applies `MYGRAM_MYSQL_HOST`, `MYGRAM_MYSQL_PORT`, `MYGRAM_MYSQL_USER`, `MYGRAM_MYSQL_PASSWORD`, and `MYGRAM_MYSQL_DATABASE` even when the `mysql` block is absent. `MYGRAM_MYSQL_PORT` must be an integer from `1` through `65535`. `MYGRAM_API_ADMIN_TOKEN` likewise applies without an `api` block. An empty environment value is treated as unset and falls through to the file or built-in default.

### Update Docker deployments

The supplied Compose stack publishes the TCP and HTTP ports on `127.0.0.1`. Reaching the container from another host requires an explicit host-side port mapping.

Regenerate `.env` from the current [environment template](https://github.com/libraz/mygram-db/blob/main/.env.example), then review all of these values:

- `API_ADMIN_TOKEN` is required and the placeholder value is rejected.
- `MYSQL_PASSWORD` and `MYSQL_ROOT_PASSWORD` must not retain the template placeholder.
- `API_CONTAINER_BIND` and `API_HTTP_CONTAINER_BIND` control the in-container listeners. Compose does not use `API_BIND` or `API_HTTP_BIND` for them.
- `NETWORK_ALLOW_CIDRS` must include the Docker bridge address that MygramDB sees, not only the address used by the host-side client.

Keep host ports on loopback unless remote access is deliberate. The [Docker deployment guide](/docs/docker-deployment) has a complete example.

### Remove runtime MySQL endpoint changes

`mysql.host` and `mysql.port` are startup-only. `SET mysql.host=...` and `SET mysql.port=...` return an immutable-variable error. Change the configuration and restart MygramDB instead.

Automatic reconnects stay on the configured endpoint and reject a changed source-server UUID. Remove failover automation that expected to redirect a running process with `SET`.

### Account for shared rate limiting

TCP and HTTP now use one token bucket per client address. A client using both protocols no longer receives a separate burst from each one. If the previous combined rate was intentional, raise `api.rate_limiting.capacity` and `api.rate_limiting.refill_rate` before rollout. Runtime `SET api.rate_limiting.*` updates the shared limiter.

### Reset query-cache expectations

Cache keys use a new serialization prefix. The query cache starts cold after the upgrade, so expect cache misses while entries warm again.

### Review fail-closed replication

Replication now stops when it cannot apply or prove harmless a binlog event. This includes transaction compression, anonymous transactions when `gtid_mode` is not `ON`, `LOAD DATA INFILE` on a replicated table, partial JSON row images, unsupported MariaDB compressed binlog events, and source-declared binlog gaps. This event-level rule is separate from MariaDB `COMPRESSED` column payloads, which v1.10.2 decodes. If one of these events affected a deployment before the upgrade, fix the source setting and run `SYNC` for every replicated table; changing the setting alone does not repair an already divergent index.

## Dumps and Startup Recovery

### Existing dump compatibility

The earlier v1.10.0 guidance that treated old dumps without a source UUID as unusable is corrected. Dumps written by v1.5.4 and later restore. The reader recognizes the zero `header_size` emitted by older writers through v1.5.3, while dumps written by v1.3.2 or earlier remain unreadable because their posting lists use an indistinguishable byte order. A dump with no recorded source UUID is treated as source-unknown; a recorded UUID that differs from the running source is still rejected.

Dump compatibility checks use the qualified table identity `<database>.<table>`. If multiple databases contain the same table name, inspect the index after upgrading and rebuild with `SYNC` if an older restore selected the wrong table.

### Startup dump loading

`dump.load_on_startup` tries `dump.dir/default_filename` before an initial MySQL snapshot. The dump's host, port, database, source UUID, GTID, and table configuration are checked against the configured source. A read, integrity, or identity failure logs a fallback and starts from a MySQL snapshot. Set `replication.start_from: "snapshot"` whenever this option is enabled.

`DUMP SAVE --with-stats` is no longer accepted. `DUMP SAVE [path]` remains available, but `DUMP SAVE .` is refused. The current writer refuses oversized primary keys, filter values, and text fields, so a dump whose `DUMP STATUS` is `COMPLETED` can pass the restore limits. The immediate `OK DUMP_STARTED` reply only confirms that saving began. Dumps written by v1.10.1 load unchanged.

After upgrading and synchronizing, create and verify a new dump before relying on dump-based recovery. See [Snapshot Commands](/docs/snapshot) for restore limits and the operational sequence.

## Replication Recovery

An undecodable binlog event stops replication with error code `2017`. A `TABLE_MAP` column type this build cannot size stops even for an unconfigured table, because row widths must be decoded before the table can be ignored. The event remains at the last applied GTID, so reconnecting alone meets it again. Missing or malformed optional metadata on a monitored table also stops with `2017`; set `binlog_row_metadata=FULL` on the source before recovery. Run `SYNC` for the highest-priority table first, then run it for every other replicated table, one at a time. See the [SYNC recovery procedure](/docs/sync-command#error-2017-undecodable-binlog-event).

`ALTER TABLE ... RENAME TO ...` that renames a table onto a configured name now stops replication with a renamed-table diagnostic. Resolve the schema change and rebuild the affected table before resuming normal writes.

## Rollout Checklist

1. Set a high-entropy admin token and update every administrative client.
2. Validate the production configuration with `mygramdb -t`.
3. Confirm a supported MySQL/MariaDB version, GTID, `ROW` binlogging, and `FULL` row images.
4. Check temporal required filters, rejected `FLOAT` roles, dump startup settings, and cache bounds.
5. Apply environment overrides and regenerate Docker files, including the root password.
6. Remove runtime MySQL endpoint changes and `DUMP SAVE --with-stats` calls.
7. Check old dump table identities, verify a current dump, and keep a rollback-compatible copy.
8. Recalculate the shared TCP/HTTP rate budget.
9. After restart, wait for readiness, run search and administrative smoke tests, and confirm replication lag advances.

Read the [v1.10.1 release notes](https://github.com/libraz/mygram-db/blob/main/docs/releases/v1.10.1.md) and [v1.10.2 release notes](https://github.com/libraz/mygram-db/blob/main/docs/releases/v1.10.2.md) for the complete change lists.
