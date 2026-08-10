---
title: MygramDB Snapshot and Dump Recovery
description: Save, verify, restore, and load MygramDB dumps safely, including startup restore, provenance checks, format compatibility, and restore memory limits.
---

# Snapshot and Dump Recovery

## What a dump contains

A dump is a binary copy of MygramDB's indexed data, configuration compatibility metadata, and replication position. It is a recovery artifact, not a MySQL backup. Keep a MySQL backup and its binlogs independently.

`DUMP SAVE` always writes the current dump format. The reader accepts format 1 and format 2. Dumps with compatibility metadata version 1 remain readable; current metadata also records the MySQL source server UUID. A newer, unsupported dump format is rejected.

## Save a dump

```mygram
DUMP SAVE
DUMP SAVE /var/lib/mygramdb/dumps/before-maintenance.dmp
```

`DUMP SAVE` has no `--with-stats` option. A command containing that flag is invalid.

Saving pauses and drains replication to record a consistent GTID, then resumes it. Search stays available, but replication lag may grow during a large save. `SYNC`, `DUMP LOAD`, `OPTIMIZE`, and scheduled snapshots cannot run at the same time.

## Verify and inspect before restoring

```mygram
DUMP VERIFY /var/lib/mygramdb/dumps/mygramdb.dmp
DUMP INFO /var/lib/mygramdb/dumps/mygramdb.dmp
```

`DUMP VERIFY` checks file and section integrity without changing live data. `DUMP INFO` exposes the file format, GTID, table count, flags, size, and timestamp. Verify the intended file before a manual load, but remember that integrity alone does not prove it belongs to this MySQL source.

For format 2 dumps, verification streams CRC data and refuses a section larger than `dump.restore_max_section_mb`. Restore also stages data within `dump.restore_memory_budget_mb` before replacing live tables. Defaults are 2048 MiB per encoded section and 4096 MiB aggregate staging memory. Set both limits for the capacity of the host and the largest trusted dump; a limit rejection protects the process from unbounded allocation.

## Manual restore

```mygram
DUMP VERIFY mygramdb.dmp
DUMP INFO mygramdb.dmp
DUMP LOAD mygramdb.dmp
```

`DUMP LOAD` replaces the live index and document store. It pauses replication, validates the dump before replacement, sets the loaded GTID, rebuilds search statistics, clears the query cache, and then restores replication. A successful load marks all restored tables initialized, but readiness remains false if replication cannot restart.

The load rejects a dump whose indexed-table compatibility settings do not match, whose MySQL host, port, or database differs from the configured source, or whose recorded source UUID differs from the running source. When a running source UUID is known, a dump that does not record one is rejected. Replacing a non-empty replication position with a dump that has no GTID is also refused.

## Startup restore

Set `dump.load_on_startup: true` to restore exactly `dump.dir/default_filename` during startup.

```yaml
dump:
  dir: /var/lib/mygramdb/dumps
  default_filename: mygramdb.dmp
  load_on_startup: true
  restore_memory_budget_mb: 4096
  restore_max_section_mb: 2048
```

At startup MygramDB verifies the configured MySQL source and validates the dump's table compatibility, host, port, database, source UUID, and GTID. With replication enabled, a startup dump must contain a GTID. On success, MygramDB restores the dump, marks its tables initialized, then starts replication from the dump GTID and catches up.

If the default file is missing, corrupt, incompatible, from another source, or cannot be checked, MygramDB logs the failed startup restore and falls back to the normal MySQL initial snapshot. Treat that fallback as a signal to investigate the dump; it can place a full-table read load on MySQL.

## Retention and storage

```yaml
dump:
  interval_sec: 600
  retain: 3
```

Scheduled dumps use timestamped filenames and retention applies to those automatic files. Manual `DUMP SAVE` files are not removed by this retention. Dumps contain indexed content and connection metadata, so restrict access, store them on protected storage, and test a restore in an isolated environment.

## Troubleshooting

| Symptom | Action |
| --- | --- |
| CRC or truncated-file error | Do not load it. Restore another verified copy and investigate the storage or transfer path. |
| Unsupported format | Use a MygramDB build that supports the dump format, or choose a compatible dump. |
| Source or UUID mismatch | Do not override it. Use a dump from the configured source, or deliberately change configuration and restart before recovery. |
| Restore limit exceeded | Increase the configured limit only after validating the file and provisioning enough memory. |
| Restore succeeds but readiness is false | Read the replication error in `/health/ready` or `INFO`; the data is installed but replication needs repair. |

## See also

- [Operations](/docs/operations)
- [Replication management](/docs/replication-management)
- [SYNC command](/docs/sync-command)
