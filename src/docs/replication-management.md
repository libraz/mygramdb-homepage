---
title: MygramDB Replication Management - Auto Stop/Restart Coordination
description: How MygramDB coordinates MySQL replication across DUMP SAVE/LOAD, SYNC, and MySQL failover. Automatic stop/restart, manual control blocking, state flags, and GTID preservation.
head:
  - - meta
    - name: keywords
      content: MygramDB replication management, automatic replication, DUMP SAVE, DUMP LOAD, SYNC, GTID consistency, replication blocking
---

# Replication Management

::: info What this page covers
"Management" here means how MygramDB automatically pauses and resumes its own replication around `DUMP SAVE`, `DUMP LOAD`, `SYNC`, and MySQL failover. It is not a feature for managing MySQL primary promotion or your replica topology.
:::

This document describes how MygramDB manages MySQL replication across different operations.

## Overview

MygramDB automatically manages replication start/stop to ensure data consistency during critical operations. Manual replication control is blocked when automatic management is in progress.

## Automatic Replication Management

### DUMP SAVE Operations

::: tip Searching during DUMP SAVE
`DUMP SAVE` writes a snapshot to disk. Search requests keep working, but replication is paused for the duration, so a long save temporarily increases the lag behind MySQL.
:::

When executing `DUMP SAVE`:

1. **Pre-operation**: If replication is running, it is automatically stopped
   - Sets `replication_paused_for_dump` flag to `true`
   - Logs: `"Stopped replication before DUMP SAVE (will auto-restart after completion)"`

2. **During operation**: Dump file is created with consistent snapshot

3. **Post-operation**: Replication is automatically restarted (regardless of save success/failure)
   - Clears `replication_paused_for_dump` flag
   - Logs: `"Auto-restarted replication after DUMP SAVE"` (on success)
   - Logs: `"replication_restart_failed"` event (on failure, but DUMP SAVE still succeeds)

**Rationale**: DUMP SAVE creates a consistent snapshot. Stopping replication ensures no binlog events are processed during the snapshot creation, maintaining GTID consistency with the dumped data.

### DUMP LOAD Operations

::: warning DUMP LOAD replaces, it does not merge
`DUMP LOAD` discards the current index and document store before reading the dump file. Loading the wrong file replaces your live search data, so verify the file path, the target environment, and the GTID inside the dump first.
:::

When executing `DUMP LOAD`:

1. **Pre-operation**: If replication is running, it is automatically stopped
   - Sets `replication_paused_for_dump` flag to `true`
   - Logs: `"Stopped replication before DUMP LOAD (will auto-restart after completion)"`

2. **During operation**: All data is cleared and reloaded from dump file

3. **Post-operation**: Replication is restarted only if it was running before the load
   - If load succeeded and dump contains GTID: Uses the loaded GTID position
   - Clears `replication_paused_for_dump` flag
   - Logs: `"Auto-restarted replication after DUMP LOAD"` with new GTID (on success)

**Rationale**: DUMP LOAD replaces all data. Running replication during load would cause:
- Data corruption (applying binlog events to incomplete data)
- GTID inconsistency (current position doesn't match loaded data)

### SYNC Operations

::: info What is a full resynchronization?
A **full resynchronization** re-reads the target MySQL table from the beginning and rebuilds MygramDB's search data. Unlike normal replication, which applies only the deltas arriving over the binlog, its read load on MySQL is proportional to the number of rows.
:::

When executing `SYNC` for a table:

1. **Pre-operation**: SYNC operation checks if replication is running
   - If running with different GTID, replication is stopped
   - Performs full table synchronization

2. **Post-operation**: Replication is automatically started after SYNC completes
   - Managed by `SyncOperationManager`

**Rationale**: SYNC performs full table scan and rebuild. Replication must be stopped to avoid applying incremental changes while full sync is in progress.

### SET VARIABLES mysql.host / mysql.port

When changing MySQL connection settings:

1. **Candidate validation**: MygramDB connects to and validates the new MySQL server before disturbing the live connection or replication reader.

2. **Handoff**: Only after validation succeeds does MygramDB stop the reader, save its drained GTID, and replace the connection.

3. **Post-operation**: Replication restarts from the saved GTID. If the later handoff fails, MygramDB restores the old connection and restarts its reader.

**Rationale**: Candidate validation keeps a failed failover from needlessly interrupting production replication.

## Manual Replication Control Blocking

### REPLICATION START Blocking

Manual `REPLICATION START` is blocked in the following scenarios:

| Scenario | Flag Checked | Error Message |
|----------|--------------|---------------|
| MySQL reconnection in progress | `mysql_reconnecting` | "Cannot start replication while MySQL reconnection is in progress. Replication will automatically restart after reconnection completes." |
| DUMP SAVE/LOAD in progress | `replication_paused_for_dump` | "Cannot start replication while DUMP SAVE/LOAD is in progress. Replication will automatically restart after DUMP completes." |
| DUMP SAVE in progress | `read_only` | "Cannot start replication while DUMP SAVE is in progress. Please wait for save to complete." |
| DUMP LOAD in progress | `loading` | "Cannot start replication while DUMP LOAD is in progress. Please wait for load to complete." |
| SYNC in progress | `sync_manager->IsAnySyncing()` | "Cannot start replication while SYNC is in progress. SYNC will automatically start replication when complete." |

### SET VARIABLES Blocking

Changing `mysql.host` or `mysql.port` is blocked during SYNC:

```
Cannot change 'mysql.host' while SYNC is in progress. Please wait for SYNC to complete.
```

## State Flags

### `mysql_reconnecting` (atomic&lt;bool&gt;)

- **Purpose**: Indicates MySQL reconnection is in progress (when changing mysql.host/port)
- **Set to `true`**: At start of reconnection
- **Set to `false`**: After reconnection completes (success or failure)
- **Used by**:
  - The reconnection handler to manage automatic reconnection
  - The replication handler to block manual `REPLICATION START`

### `replication_paused_for_dump` (atomic&lt;bool&gt;)

- **Purpose**: Indicates replication was automatically paused for DUMP operation
- **Set to `true`**: Before DUMP SAVE/LOAD when stopping replication
- **Set to `false`**: After DUMP SAVE/LOAD when restarting replication
- **Used by**:
  - The dump handler to manage automatic pause/resume
  - The replication handler to block manual `REPLICATION START`

### `read_only` (atomic&lt;bool&gt;)

- **Purpose**: Indicates DUMP SAVE is in progress (read-only mode)
- **Blocks**: REPLICATION START, DUMP LOAD, concurrent DUMP SAVE

### `loading` (atomic&lt;bool&gt;)

- **Purpose**: Indicates DUMP LOAD is in progress
- **Blocks**: REPLICATION START, DUMP SAVE, concurrent DUMP LOAD, OPTIMIZE

## Structured Logging Events

All replication state changes are logged with structured events:

```cpp
// Replication paused
StructuredLog()
    .Event("replication_paused")
    .Field("operation", "dump_save")
    .Field("reason", "automatic_pause_for_consistency")
    .Info();

// Replication resumed
StructuredLog()
    .Event("replication_resumed")
    .Field("operation", "dump_load")
    .Field("reason", "automatic_restart_after_completion")
    .Field("gtid", gtid)
    .Info();

// Restart failed (operation still succeeds)
StructuredLog()
    .Event("replication_restart_failed")
    .Field("operation", "dump_save")
    .Field("error", error_message)
    .Error();
```

## Summary

| Operation | Replication Management | Manual Control |
|-----------|------------------------|----------------|
| DUMP SAVE | Auto-stop → Auto-restart | Blocked during operation |
| DUMP LOAD | Auto-stop → Auto-restart with new GTID | Blocked during operation |
| SYNC | Auto-stop → Auto-restart after completion | Blocked during SYNC |
| SET mysql.host/port | Auto-stop → Reconnect → Auto-restart | Manual REPLICATION START blocked during reconnection |
| REPLICATION START | N/A | Blocked during DUMP/SYNC/MySQL reconnection |

All automatic replication management ensures data consistency and GTID integrity across operations.

## Key Design Decisions

1. **Auto-restart on all code paths**: Replication is restarted whether operations succeed or fail (with error logging on failure)
2. **Flag-based blocking**: All blocking uses atomic flags checked at operation start
3. **User-friendly error messages**: All blocking errors explain why and suggest waiting for auto-restart
4. **GTID preservation**: All operations maintain GTID continuity across stop/restart cycles
5. **No manual intervention during automatic operations**: Users cannot manually restart replication when auto-management is in progress

## See Also

- [Replication Guide](/docs/replication) - MySQL replication setup
- [Snapshot Guide](/docs/snapshot) - DUMP SAVE/LOAD/VERIFY commands
- [SYNC Command Guide](/docs/sync-command) - Manual snapshot synchronization
- [Operations Guide](/docs/operations) - Runtime variables and MySQL failover
