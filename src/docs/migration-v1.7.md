---
title: Upgrade to MygramDB v1.7
description: "Move a MygramDB deployment to v1.7: database-qualified table identities, the new /tables/{identity} HTTP routes, multi-database indexing, and consistent snapshots."
---

# Upgrade to v1.7

::: warning HTTP clients need attention
v1.7.0 changes the HTTP table routes. A TCP/CLI-centric deployment is barely affected, but an application that searches over HTTP will not work until its endpoints are updated.
:::

MygramDB v1.7.0 adds database-qualified table identities, multi-database indexing, HTTP/TCP feature parity for core search APIs, and multi-table consistent snapshots. Most single-database TCP/CLI users can upgrade without changing commands, but HTTP clients must update table routes.

## What Changed

### HTTP table routes

::: info What is a table identity?
A **table identity** is the name MygramDB uses to refer to one searchable table unambiguously. With multiple databases, the same table name such as `articles` can exist more than once, so the database is included as in `app_db.articles`.
:::

All table HTTP endpoints now live under `/tables/{identity}`:

| Operation | v1.7.0 route |
|-----------|--------------|
| Search | `POST /tables/{identity}/search` |
| Count | `POST /tables/{identity}/count` |
| Facet | `POST /tables/{identity}/facet` |
| Get document | `GET /tables/{identity}/{primary_key}` |

`{identity}` is either a bare table name in a single-database configuration or a database-qualified table name such as `app_db.articles`.

Old routes such as `/{table}/search`, `/{table}/count`, `/{table}/{primary_key}`, and the interim two-segment `/tables/{database}/{table}/...` form are removed.

```bash
# Before v1.7
curl -X POST http://localhost:8080/articles/search \
  -H "Content-Type: application/json" \
  -d '{"q":"mysql"}'

# v1.7 single-database deployment
curl -X POST http://localhost:8080/tables/articles/search \
  -H "Content-Type: application/json" \
  -d '{"q":"mysql"}'

# v1.7 multi-database deployment
curl -X POST http://localhost:8080/tables/app_db.articles/search \
  -H "Content-Type: application/json" \
  -d '{"q":"mysql"}'
```

### Table identity

Every configured table has an effective identity of `<database>.<table>`.

```yaml
mysql:
  database: app_db

tables:
  - name: articles          # Effective identity: app_db.articles
  - database: archive_db
    name: articles          # Effective identity: archive_db.articles
```

When all configured tables belong to one database, bare table references still work:

```mygram
SEARCH articles mysql
SYNC articles
GET articles 123
```

When the configuration spans two or more databases, every TCP, CLI, C++, C API, and HTTP table reference must use `<database>.<table>`:

```mygram
SEARCH app_db.articles mysql
SYNC archive_db.articles
GET app_db.articles 123
```

Bare names in a multi-database configuration are rejected because they can be ambiguous.

## New HTTP Capability

`FACET` is now available over HTTP:

```bash
curl -X POST http://localhost:8080/tables/app_db.articles/facet \
  -H "Content-Type: application/json" \
  -d '{
    "column": "category",
    "q": "database OR mysql",
    "filters": {"status": 1},
    "limit": 10
  }'
```

HTTP `/search` supports sort, fuzzy search, and highlighting through dedicated JSON fields. HTTP `/count` is intentionally strict: search-only fields such as `limit`, `offset`, `sort`, `highlight`, and `fuzzy` are rejected instead of ignored.

## Snapshot And Dump Notes

::: tip Take a dump right after upgrading
Creating a `DUMP SAVE` on the new version means later restores preserve multi-database table identities correctly. Keep the old version's dumps until you are past the point of rolling back.
:::

v1.7.0 preserves per-table database names in dump metadata. After upgrading, keep old dump files for rollback, then create a fresh dump so restored metadata contains qualified table identities.

For multi-table configurations with replication enabled, initial snapshots use one consistent MySQL snapshot across all tables and capture a shared GTID. Concurrent dump/snapshot operations coordinate on the drained GTID so the dump can resume replication from a precise position.

## Upgrade Checklist

1. Update HTTP clients from `/{table}/...` to `/tables/{identity}/...`.
2. If you configure tables from two or more databases, qualify all table references as `<database>.<table>`.
3. Add `tables[*].database` where a table is not in `mysql.database`.
4. Keep previous dumps until rollback is no longer needed.
5. Run `DUMP SAVE` after upgrade to create v1.7 metadata with qualified identities.
6. Verify `SYNC`, `SEARCH`, `/tables/{identity}/search`, `/tables/{identity}/count`, and `/tables/{identity}/facet` against each configured table.
