---
title: MygramDB Snapshot and Dump Recovery
description: Save, verify, restore, and load MygramDB dumps safely, including startup restore, provenance checks, format compatibility, and restore memory limits.
---

# Snapshot and Dump Recovery

## What a dump contains

A dump is a binary copy of MygramDB's indexed data, configuration compatibility metadata, and replication position. It is a recovery artifact, not a MySQL backup. Keep a MySQL backup and its binlogs independently.

`DUMP SAVE` always writes the current dump format. The reader accepts format 1 and format 2. Dumps with compatibility metadata version 1 remain readable; current metadata also records the MySQL source server UUID. A newer, unsupported dump format is rejected.

Older supported dumps remain restorable. The legacy zero `header_size` is
recognized, and a dump that has no recorded source UUID is treated as
source-unknown and accepted. A recorded UUID that differs from the running
source is still rejected. Dumps with the incompatible legacy posting-list byte
order remain unreadable.

## Save a dump

```mygram
DUMP SAVE
DUMP SAVE /var/lib/mygramdb/dumps/before-maintenance.dmp
```

`DUMP SAVE` has no `--with-stats` option. A command containing that flag is invalid.

`DUMP SAVE` starts a background operation and immediately returns `OK DUMP_STARTED <filepath>`. This acknowledges the start, not a completed backup. Run `DUMP STATUS` until it reports `COMPLETED`, check `result_filepath`, then run `DUMP VERIFY` before relying on the file. If it reports `FAILED`, inspect `error` and do not use that file for recovery.

Saving pauses and drains a running replication reader to record a consistent GTID, then resumes that reader. A reader that was already manually stopped remains stopped. When replication is enabled, a current GTID is required. Before writing the file, `DUMP SAVE` applies the restore limits to the live data and refuses an oversized primary key, filter value, text field, or data that would exceed `dump.restore_memory_budget_mb`. A dump whose status is `COMPLETED` therefore does not fail later because the restore path is stricter. `DUMP SAVE .` is rejected because `.` resolves to the dump directory itself rather than a file below it. Search stays available, but replication lag may grow during a large save. `SYNC`, `DUMP LOAD`, `OPTIMIZE`, and scheduled snapshots cannot run at the same time.

Dump paths containing control bytes are refused, and `DUMP SAVE` and `DUMP LOAD` replies do not echo control characters from a path. The writer uses a temporary file and commits it by rename; on POSIX, it fsyncs the file before the atomic rename. V2 limits each encoded section to 4 GiB, and `DUMP SAVE` refuses data that exceeds that format limit.

```mygram
DUMP SAVE .
```

The command is rejected; choose a filename inside `dump.dir`.

## Verify and inspect before restoring

```mygram
DUMP VERIFY /var/lib/mygramdb/dumps/mygramdb.dmp
DUMP INFO /var/lib/mygramdb/dumps/mygramdb.dmp
```

`DUMP VERIFY` checks file and section integrity without changing live data. `DUMP INFO` exposes the file format, GTID, table count, flags, size, and timestamp. Verify the intended file before a manual load, but remember that integrity alone does not prove it belongs to this MySQL source.

For format 2 dumps, verification streams file and section CRC checks and refuses a header without the required CRC flag. It also refuses a section larger than `dump.restore_max_section_mb`. Restore stages data within `dump.restore_memory_budget_mb` before replacing live tables. Defaults are 2048 MiB per encoded section and 4096 MiB aggregate staging memory. Set both limits for the capacity of the host and the largest trusted dump; a limit rejection protects the process from unbounded allocation.

## Manual restore

```mygram
DUMP VERIFY mygramdb.dmp
DUMP INFO mygramdb.dmp
DUMP LOAD mygramdb.dmp
```

`DUMP LOAD` replaces the live index and document store. It pauses replication, validates the dump before replacement, sets the loaded GTID, rebuilds search statistics, clears the query cache, and then restores replication. A successful load marks all restored tables initialized. If the reader fails to restart after the replacement, MygramDB keeps serving the restored data with replication stopped and readiness false.

The loader stages restored tables before installing them. If validation or decoding fails, the current live index and document store remain untouched.

The load rejects a dump whose indexed-table compatibility settings do not match, whose MySQL host, port, or database differs from the configured source, or whose recorded source UUID differs from the running source. A dump without a recorded source UUID is accepted as source-unknown. Replacing a non-empty replication position with a dump that has no GTID is also refused.

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

With replication enabled, `dump.load_on_startup: true` requires `replication.start_from: snapshot`; `latest` and `gtid=...` are rejected during configuration validation because they would ignore the dump's GTID. At startup MygramDB verifies the configured MySQL source and validates the dump's table compatibility, host, port, database, source UUID, and GTID. A startup dump without a recorded UUID is accepted as source-unknown, but a different recorded UUID is rejected. With replication enabled, a startup dump must contain a GTID. On success, MygramDB restores the dump, marks its tables initialized, then starts replication from the dump GTID and catches up.

If the default file is missing, corrupt, incompatible, from another source, or cannot be checked, MygramDB logs the failed startup restore and falls back to the normal MySQL initial snapshot. Treat that fallback as a signal to investigate the dump; it can place a full-table read load on MySQL.

If the binlog reader fails to start after a successful startup restore, MygramDB keeps serving the restored data with replication stopped and readiness false. Without a restored dump, the same reader-start failure is fatal.

## Retention and storage

```yaml
dump:
  interval_sec: 600
  retain: 3
```

`dump.retain` accepts 1–100 files and defaults to 3. Scheduled dumps use timestamped `auto_*.dmp` filenames, and retention removes older automatic files beyond that count. Scheduled snapshots wait until all configured tables have completed their initial load. Manual `DUMP SAVE` files are not removed by this retention. Dumps contain indexed content and connection metadata, so restrict access, store them on protected storage, and test a restore in an isolated environment.

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
