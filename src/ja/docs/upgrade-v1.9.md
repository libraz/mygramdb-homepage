---
title: MygramDB v1.9 へのアップグレード
description: v1.9.0 へ更新する前に確認するスキーマ検証、ダンプ互換性、コマンド変更、Docker 環境変数を説明します。
---

# v1.9 へのアップグレード

MygramDB v1.9.0 では、C/C++ の型付き検索オプション、レプリケーション値の再現性、設定検証を強化しました。多くの構成は設定変更なしで更新できますが、実行中のノードを置き換える前に以下を確認してください。

## 更新前の確認

### 設定済みのカラムと照合順序

MygramDB は、レプリケーション開始前に設定済みの主キー、テキストソース、フィルタカラムを検証します。次の型は設定に使えません。

- `BINARY`
- `VARBINARY`
- `BLOB`

文字列カラムには `utf8mb4`、`utf8`/`utf8mb3`、`ascii` のいずれかの照合順序が必要です。たとえば設定済みのカラムが `latin1_swedish_ci` の場合、初期ロードと binlog 読み取りで同じ値として扱えないため、v1.9 では起動に失敗します。

設定から参照するカラムを確認し、未対応のカラムは変換するか、テーブル定義から外してください。

### 設定内の識別子

テーブル名、データベース名、主キー、フィルタ名、テキストソース名は、設定読み込み時に SQL 識別子として検証されます。生成する SQL に無効な名前が渡る前に停止します。

サービスで使う設定ファイルをそのまま検証します。

```bash
mygramdb -t /etc/mygramdb/config.yaml
```

### 単独の `SAVE` と `LOAD` を置き換える

v1.9 では旧コマンドを受け付けません。スクリプトや運用手順を次の形に直してください。

```mygram
# 更新前
SAVE mygramdb.dmp
LOAD mygramdb.dmp

# v1.9
DUMP SAVE mygramdb.dmp
DUMP LOAD mygramdb.dmp
```

`DUMP SAVE` は非同期です。バックアップ完了を判定する前に `DUMP STATUS` を確認してください。

## ダンプと復元

v1.9 が書き出すダンプ形式は引き続き format v2 で、format v1/v2 のダンプを読み込めます。埋め込みのドキュメントストア形式は v3 になり、正確なハイライトに使う正規化前テキストを保持します。古い版へロールバックする可能性がある場合は、互換性のあるバックアップを残してください。

`DUMP LOAD` は、空でないレプリケーション位置を消してしまうダンプを拒否します。メンテナンス前にダンプと復元先を確認します。

```mygram
DUMP VERIFY mygramdb.dmp
DUMP INFO mygramdb.dmp
```

## Docker デプロイ

最新の[環境変数テンプレート](https://github.com/libraz/mygram-db/blob/main/.env.example)から `.env` を作り直してください。`SNAPSHOT_DIR`、`SNAPSHOT_INTERVAL_SEC`、`SNAPSHOT_RETAIN` は Docker の設定項目からなくなりました。代わりに `DUMP_DIR`、`DUMP_INTERVAL_SEC`、`DUMP_RETAIN` を使います。

現在のテンプレートには BM25、キャッシュ、レート制限、TLS の設定もあります。エントリポイントは bind mount した設定ファイルを上書きしません。

## 確認する動作変更

- `CONFIG VERIFY relative.yaml` の相対パスは、サービスの作業ディレクトリではなく、使用中の設定ファイルから解決します。影響する自動化では絶対パスを使ってください。
- `SHOW VARIABLES LIKE` はパターンを1つだけ受け付けます。`SHOW VARIABLES LIKE 'cache%'` は引き続き使えます。
- HTTP の検索とファセットでは、既定で `q` をリテラル文字列として扱います。式を送るときだけ `"mode": "boolean"` を指定します。
- Boolean 検索では、`c++`、`e-mail`、バージョン文字列などの句読点も含めて1つの検索語として扱います。アプリケーション側でクエリを整形している場合は確認してください。

## 新しい設定項目

v1.9 では、既存の TCP アイドル接続回収と保留フレーム数の上限を設定できるようになりました。通常はデフォルトのままで構いません。接続の動作を調整するときだけ変更してください。

```yaml
api:
  tcp:
    idle_timeout_sec: 300       # 0 でアイドル接続の回収を無効化
    reaper_interval_sec: 5
    max_pending_frames: 1024
    max_pending_frame_bytes: 4194304
```

フィルタ型には `mediumint` と `mediumint_unsigned` も追加されました。全設定は[設定リファレンス](/ja/docs/configuration)を参照してください。

## 更新チェックリスト

1. `mygramdb -t` で本番設定を検証する。
2. 設定済みカラムの型と照合順序を確認する。
3. 単独の `SAVE` / `LOAD` 呼び出しを `DUMP SAVE` / `DUMP LOAD` に置き換える。
4. 現在のダンプを検証し、ロールバックできるバックアップを残す。
5. Compose を使う場合は Docker 環境変数ファイルを作り直す。
6. 新しいノードが ready になったら、検索とレプリケーションのスモークテストを行う。

変更の全体は [v1.9.0 リリースノート](https://github.com/libraz/mygram-db/blob/main/docs/releases/v1.9.0.md)を参照してください。
