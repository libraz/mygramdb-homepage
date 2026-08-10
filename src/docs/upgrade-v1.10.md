---
title: Upgrade to MygramDB v1.10
description: "Prepare a MygramDB deployment for v1.10.0: administrative authentication, fail-closed network settings, Docker changes, and replication recovery."
---

# Upgrade to v1.10

MygramDB v1.10.0 closes administrative access by default, rejects unsafe network configurations, and removes runtime MySQL endpoint changes. Review these items before replacing a running node.

## Before You Upgrade

### Set an administrative token

Set `api.admin_token` before exposing the TCP listener beyond loopback. A token is required when the TCP listener uses a non-loopback address and no Unix socket is configured.

Prefer the `MYGRAM_API_ADMIN_TOKEN` environment variable in production. Generate a high-entropy value and keep it out of the configuration file and shell history:

```bash
openssl rand -hex 32
```

TCP clients must send `AUTH <token>` on the same connection before an administrative command. Administrative HTTP requests use `Authorization: Bearer <token>`. TCP does not encrypt the token, so use it only on a trusted or encrypted network. See the [protocol reference](/docs/protocol) and [HTTP API guide](/docs/http-api) for request details.

### Validate the network configuration

The configuration parser now rejects combinations that would weaken the network boundary:

- a non-loopback listener with an open `0.0.0.0/0` or `::/0` allow list;
- CORS enabled without `cors_allow_origin`;
- MySQL TLS with server-certificate verification enabled but no CA configured;
- a MySQL source without GTID support; and
- a missing or empty `mysql.user` after applying `MYGRAM_MYSQL_USER`.

The built-in schema is checked before a custom schema, so a custom schema can add constraints but cannot remove these checks. Validate the exact production file before rollout:

```bash
mygramdb -t /etc/mygramdb/config.yaml
```

### Update Docker deployments

The supplied Compose stack publishes the TCP and HTTP ports on `127.0.0.1`. Reaching the container from another host now requires an explicit host-side port mapping.

Regenerate `.env` from the current [environment template](https://github.com/libraz/mygram-db/blob/main/.env.example), then review all of these values:

- `API_ADMIN_TOKEN` is required and the placeholder value is rejected.
- `MYSQL_PASSWORD` no longer has a default.
- `API_CONTAINER_BIND` and `API_HTTP_CONTAINER_BIND` control the in-container listeners. Compose does not use `API_BIND` or `API_HTTP_BIND` for them.
- `NETWORK_ALLOW_CIDRS` must include the Docker bridge address that MygramDB sees, not only the address used by the host-side client.

Keep the host ports on loopback unless remote access is deliberate. The [Docker deployment guide](/docs/docker-deployment) has a complete current example.

### Remove runtime MySQL endpoint changes

`mysql.host` and `mysql.port` are startup-only. `SET mysql.host=...` and `SET mysql.port=...` now return an immutable-variable error. Change the configuration and restart MygramDB instead.

Automatic reconnects stay on the configured endpoint and reject a changed source-server UUID. Remove any failover automation that expected to redirect a running process with `SET`.

### Update dump commands and cache expectations

Remove `--with-stats` from every `DUMP SAVE` call; the option no longer parses. `DUMP SAVE [path]` continues to work.

Cache keys use a new serialization prefix. A node starts with a cold query cache after upgrading rather than reusing entries created by an earlier release.

## Dumps and Startup Recovery

Dumps written by v1.9 use a readable file format, but their version 1 compatibility metadata has no source server UUID. A normal v1.10 startup restore rejects such a dump and falls back to a MySQL snapshot. Manual `DUMP LOAD` also rejects it when the running source UUID is known. After upgrading and synchronizing, create and verify a new dump before relying on dump-based recovery. Current compatibility metadata is version 2 and records the source UUID.

The new `dump.load_on_startup` setting tries `dump.dir/default_filename` before an initial MySQL snapshot. MygramDB validates the dump's host, port, database, source server UUID, and GTID against the configured source. If validation or loading fails, startup falls back to the MySQL snapshot path.

```yaml
dump:
  dir: /var/lib/mygramdb/dumps
  default_filename: mygramdb.dmp
  load_on_startup: true
```

Enable this only after verifying the file and its provenance. See [Snapshot Commands](/docs/snapshot) for the restore limits and operational sequence.

## Replication Recovery

An undecodable binlog event reports error code `2017`. If replication stops for this reason, run `SYNC` for the highest-priority table first, then rebuild every other replicated table. The first `SYNC` moves the shared stream past the event; a table that is not rebuilt would miss changes from the skipped interval.

Other replication failures resume from the drained position rather than using this recovery path. Check [SYNC Command Usage](/docs/sync-command) before performing the rebuild.

## Rollout Checklist

1. Set a high-entropy administrative token and update every administrative client.
2. Validate the production configuration with `mygramdb -t`.
3. Review listener addresses, CIDR allow lists, CORS, TLS, and GTID requirements.
4. Regenerate Docker environment files and verify host-side port exposure.
5. Remove runtime MySQL endpoint changes and `DUMP SAVE --with-stats` calls.
6. Verify a current dump and retain a rollback-compatible copy.
7. After restart, wait for readiness, run search and administrative smoke tests, and confirm replication lag advances.

For the complete change list, read the [v1.10.0 release notes](https://github.com/libraz/mygram-db/blob/main/docs/releases/v1.10.0.md).
