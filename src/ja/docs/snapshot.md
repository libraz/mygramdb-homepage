---
title: MygramDB スナップショットコマンド - DUMP SAVE/LOAD/VERIFY
description: DUMP SAVE/LOAD/VERIFY/INFOでMygramDBの状態をバックアップ・復元。バイナリスナップショット形式、CRC32整合性チェック、GTIDベースのリカバリ、保持ポリシー、トラブルシューティング。
head:
  - - meta
    - name: keywords
      content: MygramDB スナップショット, DUMP SAVE, DUMP LOAD, DUMP VERIFY, バックアップ 復元, CRC32 整合性, GTID リカバリ, dmp ファイル
---

# スナップショットコマンド

MygramDB は、検索インデックスの状態を保存・復元するためのスナップショットコマンドを提供します。スナップショットには、インデックス化されたデータ、設定、レプリケーション位置（GTID）が含まれます。

::: info 用語補足
このページでは「スナップショット」と「ダンプ」はほぼ同じ意味で使っています。どちらも、MygramDBのメモリ上の検索インデックスをファイルに保存したものです。
:::

## 概要

スナップショットは、以下を含む単一のバイナリファイル（`.dmp`）です：
- MygramDB側の検索状態（すべてのテーブル、ドキュメント、インデックス）
- 設定情報
- 復旧時にbinlogを再開するためのレプリケーション位置（GTID）
- 破損検出のための整合性チェックサム（CRC32）

v1.7.0以降、スナップショットメタデータには各テーブルのDB名も保存されます。これは、1つのMygramDBインスタンスに `app_db.articles` と `archive_db.articles` が共存するような複数DB構成で必要です。

::: tip MySQLのバックアップではありません
MygramDBのダンプは、MygramDBを速く復旧するためのファイルです。MySQL本体のバックアップではありません。MySQLのデータ保護には、別途MySQL側のバックアップを用意してください。
:::

## コマンド

| コマンド | 目的 | 既存データへの影響 |
|----------|------|--------------------|
| `DUMP SAVE` | 現在の検索状態をファイルに保存 | 置き換えなし |
| `DUMP VERIFY` | ファイル破損がないか検証 | 置き換えなし |
| `DUMP INFO` | GTID、テーブル数、作成時刻などを表示 | 置き換えなし |
| `DUMP LOAD` | ファイルから検索状態を復元 | 現在の検索状態を置き換える |

### DUMP SAVE - スナップショット作成

現在のMygramDBの検索状態をスナップショットファイルに保存します。

**構文:**
```mygram
DUMP SAVE [<filepath>] [--with-stats]
```

**パラメータ:**
- `<filepath>`（オプション）: スナップショットファイルの保存先パス
- `--with-stats`（オプション）: パフォーマンス統計情報をスナップショットに含める

**例:**
```mygram
-- 基本的なスナップショット
DUMP SAVE /var/lib/mygramdb/dumps/mygramdb.dmp

-- 統計情報付きスナップショット
DUMP SAVE /var/lib/mygramdb/dumps/mygramdb.dmp --with-stats
```

**レスポンス:**
```mygram
OK DUMP_STARTED /var/lib/mygramdb/dumps/mygramdb.dmp
```

### DUMP LOAD - スナップショット復元

スナップショットファイルを読み込み、MygramDBの検索状態を復元します。

**構文:**
```mygram
DUMP LOAD <filepath>
```

**パラメータ:**
- `<filepath>`: 読み込むスナップショットファイルのパス

**例:**
```mygram
DUMP LOAD /var/lib/mygramdb/dumps/mygramdb.dmp
```

**レスポンス:**
```mygram
OK LOADED /var/lib/mygramdb/dumps/mygramdb.dmp
```

::: warning DUMP LOAD の重要事項
`DUMP LOAD` は現在のインデックスを置き換えます。誤ったファイルを読み込むと検索結果が古い状態に戻るため、必ず `DUMP VERIFY` と `DUMP INFO` でGTID・テーブル数・作成時刻を確認してから実行してください。

- 読み込み後は、スナップショットに保存されたGTIDからレプリケーションを再開します。
- すべてのテーブルが現在の設定ファイルに定義されている必要があります。
- 複数DB構成では、設定済みテーブル識別子がダンプメタデータ（`<database>.<table>`）と一致している必要があります。
- MygramDBは起動時にダンプファイルを自動読み込みしません。再起動後にダンプから復旧する場合は、MygramDBを起動してから手動で `DUMP LOAD` を実行してください。
- v1.9 が書き出すダンプ形式は format v2 で、format v1/v2 を引き続き読み込めます。埋め込みのドキュメントストア形式は v3 になり、正確なハイライトに使う正規化前テキストを保持します。
:::

### DUMP VERIFY - 整合性チェック

スナップショットファイルを読み込まずに整合性を検証します。

**構文:**
```mygram
DUMP VERIFY <filepath>
```

**パラメータ:**
- `<filepath>`: 検証するスナップショットファイルのパス

**例:**
```mygram
DUMP VERIFY /var/lib/mygramdb/dumps/mygramdb.dmp
```

**レスポンス（成功）:**
```mygram
OK DUMP_VERIFIED /var/lib/mygramdb/dumps/mygramdb.dmp
```

**レスポンス（失敗）:**
```mygram
ERROR CRC mismatch: file may be corrupted
expected: 0x12345678
actual: 0x87654321
```

### DUMP INFO - スナップショットメタデータ表示

スナップショットファイルを読み込まずにメタデータを表示します。

**構文:**
```mygram
DUMP INFO <filepath>
```

**パラメータ:**
- `<filepath>`: スナップショットファイルのパス

**例:**
```mygram
DUMP INFO /var/lib/mygramdb/dumps/mygramdb.dmp
```

**レスポンス:**
```mygram
OK DUMP_INFO /var/lib/mygramdb/dumps/mygramdb.dmp
version: 2
gtid: 3E11FA47-71CA-11E1-9E33-C80AA9429562:1-10
tables: 2
flags: 24
file_size: 1234567
timestamp: 1672531200
has_statistics: true
END
```

## 整合性保護

### CRC32チェックサム

すべてのスナップショットファイルには、複数レベルのCRC32チェックサムが含まれます：
- **ファイルレベルCRC**: ファイル全体の破損を検出
- **セクションレベルCRC**: 個別セクション（設定、統計、インデックス、ドキュメントストア）を検証

::: info 用語補足
**CRC32** はファイルが壊れていないかを検出するための短い検査値です。暗号学的な改ざん検知ではありませんが、途中で切れたファイルやディスク破損の検出に役立ちます。
:::

### ファイルサイズ検証

スナップショットヘッダーには期待されるファイルサイズが含まれます：
- 不完全な書き込みを検出
- ネットワーク転送の失敗をキャッチ
- 切り詰められたファイルを識別

### 検証ワークフロー

読み込み前に必ずスナップショットの整合性を検証してください：

```mygram
-- 1. 整合性を検証
DUMP VERIFY mygramdb.dmp

-- 2. メタデータを確認
DUMP INFO mygramdb.dmp

-- 3. 問題なければ読み込み
DUMP LOAD mygramdb.dmp
```

## エラーハンドリング

### CRC不一致

CRC検証が失敗した場合、スナップショットファイルが破損しています：

```mygram
ERROR CRC32 mismatch: expected 0x12345678, got 0x87654321 (file may be corrupted)
```

**対処方法:**
1. 破損したスナップショットは読み込まない
2. バックアップコピーから復元を試みる
3. 破損が頻繁に発生する場合はディスクの健全性をチェック

### ファイル切り詰め

ファイルサイズが期待値と一致しない場合：

```mygram
ERROR File size mismatch: expected 1234567 bytes, got 1000000 bytes (file may be truncated or corrupted)
```

**対処方法:**
1. ファイルが完全に書き込まれなかった
2. SAVE操作を再試行
3. 利用可能なディスク容量を確認

### バージョン不一致

スナップショットのバージョンが新しすぎる場合：

```mygram
ERROR Snapshot file version 3 is newer than supported version 2
```

**対処方法:**
1. MygramDBを新しいバージョンにアップグレード
2. または互換性のあるバージョンで作成されたスナップショットを使用

## 推奨事項

### 自動スナップショット

MygramDBは、定期的にスナップショットを保存する設定に対応しています。

```yaml
# config.yaml
dump:
  dir: /var/lib/mygramdb/dumps    # ダンプファイルのディレクトリ
  interval_sec: 600                 # 10分ごとに自動保存（0 = 無効）
  retain: 3                         # 最新の3つの自動保存ダンプを保持
```

**機能:**
- 自動スナップショットはタイムスタンプベースのファイル名（`auto_YYYYMMDD_HHMMSS.dmp`）で保存されます
- `retain`カウントに基づいて古い自動保存ファイルが自動的にクリーンアップされます
- 手動スナップショット（`DUMP SAVE`経由）は自動クリーンアップの影響を受けません
- ディレクトリのパーミッションは起動時に検証されます
- 自動保存スナップショットはバックアップファイルであり、サーバー起動時に自動復元されるものではありません。

### 手動バックアップ

災害復旧のために手動スナップショットをスケジュールすることもできます：

```bash
# 例: 日次バックアップスクリプト
#!/bin/bash
DATE=$(date +%Y%m%d)
echo "DUMP SAVE /var/lib/mygramdb/dumps/manual_${DATE}.dmp --with-stats" | mygram-cli
```

### 保持ポリシー

複数のスナップショットバージョンを保持します：

```yaml
# config.yaml
dump:
  dir: /var/lib/mygramdb/dumps
  default_filename: mygramdb.dmp
  interval_sec: 600      # 10分ごとに保存
  retain: 3              # 最新の3つを保持
```

### 読み込み前の検証

読み込み前に必ず整合性を検証します：

```bash
# まず検証
echo "DUMP VERIFY mygramdb.dmp" | mygram-cli

# その後読み込み
echo "DUMP LOAD mygramdb.dmp" | mygram-cli
```

### 安全な保存

スナップショットには機密データが含まれます：
- MySQL接続認証情報
- すべてのドキュメント内容
- レプリケーション位置

**推奨事項:**
1. ファイル権限を600（所有者の読み書きのみ）に設定
2. 暗号化されたボリュームにスナップショットを保存
3. リモートストレージには安全な転送プロトコル（SFTP、SCP）を使用
4. アクセスログを監査

### スナップショットサイズの監視

スナップショットファイルサイズを経時的に追跡します：

```bash
# スナップショットメタデータを確認
echo "DUMP INFO mygramdb.dmp" | mygram-cli
```

スナップショットサイズが予期せず増加する場合：
- インデックスの肥大化をチェック
- ドキュメント保持ポリシーを確認
- データアーカイブを検討

## パフォーマンス特性

### SAVE パフォーマンス

| ドキュメント数 | 平均テキスト長 | 保存時間 | ファイルサイズ |
|---------------|---------------|---------|---------------|
| 10万 | 100バイト | ~1-2秒 | ~20 MB |
| 100万 | 100バイト | ~10-15秒 | ~200 MB |
| 1000万 | 100バイト | ~2-3分 | ~2 GB |

### LOAD パフォーマンス

| ドキュメント数 | 平均テキスト長 | 読み込み時間 |
|---------------|---------------|-------------|
| 10万 | 100バイト | ~2-3秒 |
| 100万 | 100バイト | ~15-20秒 |
| 1000万 | 100バイト | ~3-5分 |

*パフォーマンスはハードウェア、ディスクI/O、データ特性によって異なります*

## 設定

ダンプの動作は `config.yaml` で設定できます：

```yaml
dump:
  # ダンプファイルのディレクトリ
  dir: /var/lib/mygramdb/dumps

  # 指定されない場合のデフォルトファイル名（手動DUMP SAVEコマンド用）
  default_filename: mygramdb.dmp

  # 自動ダンプ間隔（秒、0 = 無効）
  interval_sec: 600  # 10分ごとに自動保存

  # 保持する自動保存ダンプ数（手動ダンプは影響を受けません）
  retain: 3  # 最新の3つの自動保存ダンプを保持
```

**起動時チェック:**
- MygramDBは起動時にダンプディレクトリの権限を検証します
- ディレクトリが存在しない場合は自動的に作成されます
- ディレクトリが書き込み不可の場合、サーバーはエラーで起動に失敗します

## レプリケーションリカバリ

ダンプからの復旧は運用者が明示的に実行します。MygramDBは起動時に
`dump.dir`をスキャンしたり、最新ダンプを読み込んだりしません。まずサーバーを
起動し、対象ダンプを検証してから`DUMP LOAD`を実行してください。

`DUMP LOAD`が完了すると、ロード前にレプリケーションが実行中だった場合だけMygramDBは自動的に再開します：

1. **GTID抽出**: スナップショットからレプリケーション位置を読み取り
2. **BinlogReader再開**: 保存されたGTIDから継続
3. **追いつき**: 見逃したトランザクションを処理
4. **通常運用**: binlogレプリケーションに戻る

**例:**

```mygram
# 1. サーバーがGTID 1-100でクラッシュ
# 2. MygramDBを再起動
# 3. GTID 1-80のスナップショットを検証して読み込み
DUMP VERIFY mygramdb.dmp
DUMP LOAD mygramdb.dmp

# 4. ロード前にレプリケーションが実行中なら、MygramDBはトランザクション81-100を処理
# 5. 実行中でなかった場合は、ロードした状態を確認してから明示的に開始
```

## トラブルシューティング

### "Failed to open snapshot file"

**原因:** ファイルが存在しないか、権限が不十分

**解決方法:**
```bash
# ファイルの存在を確認
ls -l /path/to/snapshot.dmp

# 権限を確認
chmod 600 /path/to/snapshot.dmp
```

### "Invalid snapshot version"

**原因:** 互換性のないMygramDBバージョンで作成されたスナップショット

**解決方法:**
- MygramDBバージョンの互換性を確認
- 同じメジャーバージョンで作成されたスナップショットを使用

### "Table not found in config"

**原因:** スナップショットに現在の設定で定義されていないテーブルが含まれる

**解決方法:**
- `config.yaml`を更新してスナップショットのすべてのテーブルを含める
- または現在の設定で新しいスナップショットを作成

### "CRC mismatch during load"

**原因:** スナップショットファイルが破損

**解決方法:**
1. DUMP VERIFYを実行して破損セクションを特定
2. バックアップコピーから復元
3. ディスクの健全性とネットワークの信頼性を確認

## 関連コマンド

- **SEARCH**: インデックス化されたドキュメントをクエリ
- **STATUS**: データベースステータスとレプリケーション位置を確認
- **CONFIG RELOAD**: 再起動なしで設定を再読み込み

## 参照

- [設定ガイド](/ja/docs/configuration)
- [レプリケーション設定](/ja/docs/replication)
- [パフォーマンスチューニング](/ja/docs/performance)
