---
title: MygramDB 運用ガイド
description: ランタイム変数、設定済み MySQL エンドポイント、readiness プローブ、レプリケーション診断、ログローテーションを使った MygramDB の運用方法。
---

# 運用ガイド

## 運用の考え方

MygramDB の設定には二種類あります。小さな許可リストにある項目は、稼働中に `SET` で変更できます。接続、テーブル、レプリケーション、リスナーの設定は起動時専用です。設定ファイルを編集して検証し、プロセスを再起動してください。

::: info ランタイム設定と設定ファイル
`SET` が変えるのは稼働中のプロセスだけです。設定ファイルは書き換えないため、恒久的な変更は設定ファイルにも反映してください。
:::

## ランタイム変数

有効な値は `SHOW VARIABLES` で確認し、許可された変数は `SET` で変更します。

```sql
SHOW VARIABLES LIKE 'cache%'
SET logging.level = 'debug'
SET cache.enabled = false
SET api.default_limit = 200, api.rate_limiting.capacity = 200
```

| 変更できる変数 | 用途 |
| --- | --- |
| `logging.level`、`logging.format` | 診断時の詳細度やログの形式を変更します。 |
| `api.default_limit`、`api.max_query_length` | リクエストの既定値と上限を調整します。 |
| `api.rate_limiting.enable`、`api.rate_limiting.capacity`、`api.rate_limiting.refill_rate` | TCP と HTTP で共有するレートリミッターを調整します。 |
| `cache.enabled`、`cache.min_query_cost_ms`、`cache.ttl_seconds` | クエリキャッシュを有効化または調整します。 |

既知の変数でも、これ以外は変更できません。特に `mysql.host` と `mysql.port` は起動時専用です。

```sql
SET mysql.host = 'mysql-primary-2.example.com'
-- ERROR: Variable 'mysql.host' is immutable (requires restart)
```

## MySQL ソースを変更する

通信断の後、MygramDB は設定済みエンドポイントへ自動再接続します。この再接続ではソースを検証します。MySQL サーバー UUID が変わっていれば、昇格後のサーバーや無関係なサーバーを暗黙に追従せず、接続を拒否します。

計画メンテナンスやプライマリ昇格では、次の順で進めてください。

1. 昇格後の MySQL サーバーで必要な GTID 履歴、ROW binlog 形式、設定済みテーブルを利用可能にします。
2. MygramDB の設定で `mysql.host` と必要なら `mysql.port` を変更します。
3. `mygramdb -t <config>` で設定を検証します。
4. MygramDB を再起動し、readiness プローブが通ってからトラフィックを流します。

`SET mysql.host` や `SET mysql.port` は使わないでください。自動再接続が別のソース UUID を追従することもありません。

## Readiness、liveness、トラフィック制御

`GET /health/live` はプロセスが生きているかを返します。トラフィックの判定には `GET /health/ready` を使います。初期データが読み込まれ、ダンプロードや `SYNC` が動いておらず、レプリケーションが利用可能なときだけ `200` を返します。それ以外は理由と秘匿されたレプリケーション概要を含めて `503` を返します。

```bash
curl -fsS http://127.0.0.1:8080/health/live
curl -fsS http://127.0.0.1:8080/health/ready
```

TCP だけを使う構成では `INFO` を利用できます。`data_initialized` と `readiness` は `/health/ready` と同じ条件で判定されます。

```text
# Server
data_initialized: true
readiness: ready
```

設定したテーブルのどれかが初期化されていなければ、readiness は false のままです。起動時のダンプ復元または `DUMP LOAD` が成功すると復元したテーブルは初期化済みになりますが、レプリケーションの再開に失敗すれば readiness は false のままです。

## レプリケーション診断

レプリケーションの状態は `INFO`、`/health/ready`、`/health/detail`、`/metrics` で確認します。公開ヘルスエンドポイントは、レプリケーションの実行・開始状態、要約した最後のエラーと数値コード、最後に適用した時刻、その後の経過秒数を返します。現在の GTID、処理済みイベント数とキュー数、CRC 件数、スキーマ非互換の詳細、MySQL の生のエラー文は返しません。管理者トークン付きのリクエストでは保護されたレプリケーション詳細を取得できます。`api.admin_token` を設定している場合、`/replication/status` にはそのトークンが必要です。完全なエラー文は認証済みクライアントとログで確認できます。

遅延の時刻は、MygramDB が適用済み GTID を進めたときに更新されます。`replication_seconds_since_last_applied` は経過時間の指標であり、MySQL に新しいコミットがない証明ではありません。ソースがアイドル中でも最近の適用イベントはありません。MySQL の書き込み状況、レプリケーション状態、エラー項目と合わせて監視してください。

readiness が `503` のときは、まず `reason` を読みます。初期ロード未実施、実行中の `SYNC`、実行中のダンプロード、停止したレプリケーションリーダー、非互換スキーマが代表的な状態です。復旧は [レプリケーション](/ja/docs/replication)、ダンプの手順は [スナップショットとダンプ復旧](/ja/docs/snapshot) を参照してください。

## 安全な運用変更

長時間操作は一つのメンテナンス枠を共有します。`SYNC`、`DUMP SAVE`、`DUMP LOAD`、`OPTIMIZE`、定期スナップショットは重ねて実行できません。計画的に実行し、状態を監視し、同期中のテーブルへはトラフィックを流さないでください。

`OPTIMIZE` はインデックスを再構築する前にメモリを判定します。常駐インデックス、完全な再構築用コピー、語句スナップショット、バッチ管理領域、安全余裕を見積もるため、現在のインデックスメモリの約 2.1 倍を空けてください。見積もりが収まらない場合、`OPTIMIZE` は開始前に拒否されます。メモリを増やすか、インデックス対象データを減らしてから再実行してください。

レートリミッターはクライアント IP ごとに TCP と HTTP で 1 つのトークンバケットを共有します。そのため `capacity` と `refill_rate` は合算した通信量に適用され、実行中の `SET api.rate_limiting.*` は両方のプロトコルに反映されます。両方を使うクライアントは同じバースト枠と補充レートを消費します。

再起動が必要な設定変更では、構成が許すなら健全なインスタンスを残すロールアウトを行います。健全なプロセスを止める前に設定を確認し、起動後に `INFO` または `/health/ready` を確認してください。

## ログローテーション

外部のローテーションツールがログファイルを移動した後、`SIGUSR1` を送ると MygramDB はログファイルを開き直します。

```bash
kill -USR1 "$(pgrep -x mygramdb)"
```

ローテーション後はプロセスマネージャーと新しいログファイルを確認してください。起動時専用の設定を変更するときは、シグナルではなく監視下で再起動します。

## 関連項目

- [レプリケーション管理](/ja/docs/replication-management)
- [レプリケーション](/ja/docs/replication)
- [スナップショットとダンプ復旧](/ja/docs/snapshot)
- [SYNC コマンド](/ja/docs/sync-command)
