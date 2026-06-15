---
title: MygramDB レプリケーション管理 - 自動停止/再起動の調整
description: MygramDBがDUMP SAVE/LOAD、SYNC、MySQLフェイルオーバーをまたいでMySQLレプリケーションを調整する方法。自動停止/再起動、手動制御が拒否される条件、状態フラグ、GTID保持を解説。
head:
  - - meta
    - name: keywords
      content: MygramDB レプリケーション管理, 自動レプリケーション, DUMP SAVE, DUMP LOAD, SYNC, GTID 整合性, レプリケーション 制御
---

# レプリケーション管理

このドキュメントは、MygramDBがさまざまな操作でMySQLレプリケーションを管理する方法について説明します。

::: info このページで扱うこと
ここでいう「管理」は、`DUMP SAVE`、`DUMP LOAD`、`SYNC`、MySQLフェイルオーバーの前後で、MygramDBがレプリケーションを自動的に止めたり再開したりする挙動です。MySQL側のプライマリ昇格やレプリカ構成そのものを管理する機能ではありません。
:::

## 概要

MygramDBは、`DUMP`、`SYNC`、MySQL再接続のような状態を大きく変える操作の前後で、レプリケーションの開始/停止を自動的に調整します。自動管理が進行中の場合、競合する手動操作は拒否されます。

## 自動レプリケーション管理

### DUMP SAVE操作

`DUMP SAVE`を実行する場合：

1. **操作前**: レプリケーションが実行中の場合、自動的に停止されます
   - `replication_paused_for_dump`フラグを`true`に設定
   - ログ: `"Stopped replication before DUMP SAVE (will auto-restart after completion)"`

2. **操作中**: 一貫したスナップショットでダンプファイルが作成されます

3. **操作後**: レプリケーションが自動的に再起動されます（保存の成功/失敗に関わらず）
   - `replication_paused_for_dump`フラグをクリア
   - ログ: `"Auto-restarted replication after DUMP SAVE"` (成功時)
   - ログ: `"replication_restart_failed"`イベント (失敗時、ただしDUMP SAVEは成功)

**理由**: DUMP SAVEでは、ダンプ対象のインデックス状態とGTID位置を対応させる必要があります。レプリケーションを停止することで、スナップショット作成中にbinlogイベントが混ざらないようにし、ダンプされたデータとGTIDのずれを避けます。

::: tip DUMP SAVE中の検索
`DUMP SAVE` は保存用のスナップショットを作る操作です。検索リクエストは継続できますが、レプリケーションは一時停止するため、保存処理が長い場合はMySQLとの同期ラグが一時的に増えます。
:::

### DUMP LOAD操作

`DUMP LOAD`を実行する場合：

1. **操作前**: レプリケーションが実行中の場合、自動的に停止されます
   - `replication_paused_for_dump`フラグを`true`に設定
   - ログ: `"Stopped replication before DUMP LOAD (will auto-restart after completion)"`

2. **操作中**: すべてのデータがクリアされ、ダンプファイルから再ロードされます

3. **操作後**: レプリケーションが更新されたGTIDで自動的に再起動されます
   - ロードが成功し、ダンプにGTIDが含まれる場合: ロードされたGTID位置にレプリケーションを更新
   - `replication_paused_for_dump`フラグをクリア
   - ログ: `"Auto-restarted replication after DUMP LOAD"`と新しいGTID (成功時)

**理由**: DUMP LOADはすべての検索データを置き換えます。ロード中にレプリケーションを実行すると以下の問題が発生します：
- 不完全なロード状態にbinlogイベントが適用される
- 現在のGTID位置がロード後のデータと一致しない

::: warning DUMP LOADは置き換え操作
`DUMP LOAD` は既存のインデックスとドキュメントストアを消してから、ダンプファイルの内容を読み込みます。読み込み先を間違えると現在の検索データが置き換わるため、ファイルパス、対象環境、ダンプ内のGTIDを確認してから実行してください。
:::

### SYNC操作

テーブルに対して`SYNC`を実行する場合：

1. **操作前**: SYNC操作はレプリケーションが実行中かどうかを確認します
   - 異なるGTIDで実行中の場合、レプリケーションが停止されます
   - 完全なテーブル同期を実行

2. **操作後**: SYNC完了後にレプリケーションが自動的に開始されます
   - `SyncOperationManager`によって管理

**理由**: SYNCは完全なテーブルスキャンと再構築を実行します。完全同期の進行中に増分変更が適用されないように、レプリケーションを停止する必要があります。

::: info 用語補足
**完全同期**は、MySQLの対象テーブルを先頭から読み直してMygramDB側の検索データを作り直す処理です。binlogで届く差分だけを適用する通常のレプリケーションとは異なり、対象行数に比例してMySQLへの読み取り負荷が発生します。
:::

### SET VARIABLES mysql.host / mysql.port

MySQL接続設定を変更する場合：

1. **操作前**: レプリケーションが自動的に停止されます
   - `mysql_reconnecting`フラグを`true`に設定
   - 現在のGTID位置を保存
   - 古いMySQL接続を閉じる
   - ログ: `"Stopping replication before MySQL reconnection"`

2. **再接続**: 新しいMySQL接続が確立されます
   - 接続が検証されます（GTIDモード、binlogフォーマット）
   - GTID位置が復元されます

3. **操作後**: 保存されたGTIDからレプリケーションが自動的に再起動されます
   - `mysql_reconnecting`フラグをクリア（成功または失敗時）
   - ログ: `"Restarted replication after MySQL reconnection"` (成功時)

**理由**: MySQLサーバー接続を変更する場合は、いったんレプリケーションを止め、保存したGTID位置から新しい接続で再開する必要があります。

## 手動レプリケーション制御が拒否される条件

### REPLICATION STARTが拒否される場合

以下の状況では、手動の`REPLICATION START`は拒否されます：

| 状況 | 確認されるフラグ | エラーメッセージ |
|---------|------------------|----------------|
| MySQL再接続中 | `mysql_reconnecting` | "Cannot start replication while MySQL reconnection is in progress. Replication will automatically restart after reconnection completes." |
| DUMP SAVE/LOAD実行中 | `replication_paused_for_dump` | "Cannot start replication while DUMP SAVE/LOAD is in progress. Replication will automatically restart after DUMP completes." |
| DUMP SAVE実行中 | `read_only` | "Cannot start replication while DUMP SAVE is in progress. Please wait for save to complete." |
| DUMP LOAD実行中 | `loading` | "Cannot start replication while DUMP LOAD is in progress. Please wait for load to complete." |
| SYNC実行中 | `sync_manager->IsAnySyncing()` | "Cannot start replication while SYNC is in progress. SYNC will automatically start replication when complete." |

### SET VARIABLESが拒否される場合

SYNC中は`mysql.host`または`mysql.port`の変更が拒否されます：

```
Cannot change 'mysql.host' while SYNC is in progress. Please wait for SYNC to complete.
```

## 状態フラグ

### `mysql_reconnecting` (atomic&lt;bool&gt;)

- **目的**: MySQL再接続が進行中であることを示す（mysql.host/port変更時）
- **`true`に設定**: 再接続の開始時
- **`false`に設定**: 再接続完了後（成功または失敗）
- **使用者**:
  - 再接続ハンドラ - 自動再接続を管理
  - レプリケーションハンドラ - 手動`REPLICATION START`を拒否

### `replication_paused_for_dump` (atomic&lt;bool&gt;)

- **目的**: DUMP操作のためにレプリケーションが自動的に一時停止されたことを示す
- **`true`に設定**: レプリケーション停止時のDUMP SAVE/LOAD前
- **`false`に設定**: レプリケーション再起動時のDUMP SAVE/LOAD後
- **使用者**:
  - ダンプハンドラ - 自動一時停止/再開を管理
  - レプリケーションハンドラ - 手動`REPLICATION START`を拒否

### `read_only` (atomic&lt;bool&gt;)

- **目的**: DUMP SAVEが進行中であることを示す（読み取り専用モード）
- **拒否対象**: REPLICATION START、DUMP LOAD、同時DUMP SAVE

### `loading` (atomic&lt;bool&gt;)

- **目的**: DUMP LOADが進行中であることを示す
- **拒否対象**: REPLICATION START、DUMP SAVE、同時DUMP LOAD、OPTIMIZE

## 構造化ログイベント

すべてのレプリケーション状態変更は構造化イベントでログに記録されます：

```cpp
// レプリケーション一時停止
StructuredLog()
    .Event("replication_paused")
    .Field("operation", "dump_save")
    .Field("reason", "automatic_pause_for_consistency")
    .Info();

// レプリケーション再開
StructuredLog()
    .Event("replication_resumed")
    .Field("operation", "dump_load")
    .Field("reason", "automatic_restart_after_completion")
    .Field("gtid", gtid)
    .Info();

// 再起動失敗（操作自体は成功）
StructuredLog()
    .Event("replication_restart_failed")
    .Field("operation", "dump_save")
    .Field("error", error_message)
    .Error();
```

## まとめ

| 操作 | レプリケーション管理 | 手動制御 |
|-----|------------------|---------|
| DUMP SAVE | 自動停止 → 自動再起動 | 操作中は拒否 |
| DUMP LOAD | 自動停止 → 新しいGTIDで自動再起動 | 操作中は拒否 |
| SYNC | 自動停止 → 完了後に自動再起動 | SYNC中は拒否 |
| SET mysql.host/port | 自動停止 → 再接続 → 自動再起動 | 再接続中は手動REPLICATION STARTを拒否 |
| REPLICATION START | 手動操作 | DUMP/SYNC/MySQL再接続中は拒否 |

自動レプリケーション管理は、操作中に競合する更新が混ざらないようにして、検索データとGTID位置の対応を保つための仕組みです。再起動に失敗した場合は操作結果とログを確認し、必要に応じて `REPLICATION STATUS` や `SYNC STATUS` で状態を確認してください。

## 主要な設計判断

1. **操作後の自動再起動**: 操作完了後にレプリケーション再開を試みます（失敗時はエラーログ記録）
2. **フラグベースの拒否判定**: 競合する操作は、操作開始時に確認されるアトミックフラグで判定
3. **理由が分かるエラーメッセージ**: 拒否された理由と、自動再起動を待つべきことを返す
4. **GTID位置の引き継ぎ**: 停止/再起動サイクルでGTID位置を引き継ぎ、同じ位置から再開できるようにする
5. **自動操作中の手動介入不可**: 自動管理が進行中の場合、ユーザーは手動でレプリケーションを再起動できません

## 関連項目

- [レプリケーションガイド](/ja/docs/replication) - MySQLレプリケーション設定
- [スナップショットガイド](/ja/docs/snapshot) - DUMP SAVE/LOAD/VERIFYコマンド
- [SYNCコマンドガイド](/ja/docs/sync-command) - 手動スナップショット同期
- [運用ガイド](/ja/docs/operations) - ランタイム変数とMySQLフェイルオーバー
