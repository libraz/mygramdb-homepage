---
title: MygramDB が binlog を読む仕組み - GTID と libmybinlog
description: MygramDB が MySQL と MariaDB の binlog を読む仕組み。レプリケーション接続、libmybinlog によるデコード、イベント区分、チェックサム、GTID、圧縮イベント、起動時のサーバー設定チェック、オフラインビルド。
head:
  - - meta
    - name: keywords
      content: MygramDB binlog デコード, libmybinlog, MySQL binlog パーサー, MariaDB binlog, binlog チェックサム CRC32, タグ付き GTID, イベント区分, COM_BINLOG_DUMP_GTID, mysql-event-stream
---

# MygramDB が binlog を読む仕組み

MygramDB は MySQL または MariaDB にレプリカとして接続し、生の binlog ストリームを受け取って、別ライブラリの [libmybinlog](https://github.com/libraz/libmybinlog) でデコードします。libmybinlog は binlog のバイト列を、型付きのイベントと行の値に変換するライブラリです。このページでは、1件の変更がソースサーバーから検索インデックスへ届くまでを追い、イベントを適用できないときの動作を説明します。

::: info binlog とは
**binlog**（バイナリログ）は、MySQL や MariaDB がコミット済みの変更をすべて記録するログです。ROW 形式では、各エントリにテーブル名と変更された行が入ります。MygramDB が binlog から得たい情報は、どの行が変わったか、新しい値は何か、再起動後に再開するための位置（GTID）の 3つです。[用語集](/ja/docs/glossary#binlog)も参照してください。
:::

## デコードの経路

<DocDiagram name="binlog-decode-path" alt="binlog のバイト列は、MySQL または MariaDB からレプリカ接続を通って libmybinlog に入ります。libmybinlog はフレームとチェックサムを検証し、TABLE_MAP、GTID、ROWS イベントを読み、各イベントを区分します。MygramDB は設定したテーブルだけを残し、インデックスとドキュメントストアを更新して GTID 位置を記録します。デコードできないイベントがあるとエラー 2017 でレプリケーションが停止します。" />

libmybinlog にはネットワーク処理がありません。接続、認証、ダンプ要求は MygramDB が MySQL C クライアント API で行い、接続から届いたイベントを 1件ずつ libmybinlog のパーサーに渡します。デコード結果は MygramDB が設定済みのテーブルに絞り、インデックスとドキュメントストアへ適用します。

## ストリームを開く

ダンプのコマンドは MySQL と MariaDB で異なるため、MygramDB はサーバーの種類ごとにストリームの実装を持ちます。種類の判定には、MariaDB にだけ存在する変数 `SELECT @@GLOBAL.gtid_binlog_pos` を使います。

| | MySQL | MariaDB |
| --- | --- | --- |
| ダンプコマンド | `COM_BINLOG_DUMP_GTID` | `COM_BINLOG_DUMP` |
| 開始位置の渡し方 | ダンプ要求に GTID セットを入れる（libmybinlog がエンコード） | ダンプ前にセッション変数 `@slave_connect_state` を設定する |
| 要求するチェックサム | `@source_binlog_checksum='CRC32'` | `@master_binlog_checksum='CRC32'` |
| その他のセッション設定 | 3秒ごとのハートビート | 3秒ごとのハートビート、GTID ケイパビリティ、厳密 GTID モード |

MariaDB は、レプリカが GTID ケイパビリティ（`@mariadb_slave_capability = 4`）を通知しない限り、GTID イベントを送りません。MygramDB はこれを設定し、すべてのトランザクションを記録可能な GTID とともに受け取ります。厳密 GTID モードとハートビートはベストエフォートで、サーバーが拒否してもストリームは開きます。

## libmybinlog の処理

| 段階 | 処理内容 | 失敗したとき |
| --- | --- | --- |
| フレーミングとチェックサム | イベントヘッダーを読み、CRC32 トレーラーを検証し、`FORMAT_DESCRIPTION` イベントごとにチェックサムのアルゴリズムを取り直す | 最後に処理した GTID から再接続する |
| `TABLE_MAP` | カラム型と、監視対象テーブルではカラム名、符号の有無、`ENUM`/`SET` のラベルを読む | 未知のカラム型、またはメタデータの欠落や不正があると `2017` で停止する |
| GTID | 各トランザクションの前にある GTID を読む | 形式は完全だが内容が不正な GTID イベント（トランザクション番号 0 など）は `2017` で報告し、途中で切れたものは汎用の binlog エラーで報告する。どちらも最後に処理した GTID から再接続する |
| ROWS イベント | 監視対象テーブルの `WRITE_ROWS`、`UPDATE_ROWS`、`DELETE_ROWS` を行の値にデコードする | 行のデコード失敗は `2008` で報告し、通常の再接続処理に従う |
| `QUERY` | トランザクション境界と、設定済みテーブルの DDL を判定するための文を渡す | 行を変更する可能性があるのに判別できない文は `2017` で停止する |

行の値は、初期スナップショットと同じ文字列に変換します。そのため、スナップショットから索引化した行と、同じ行を binlog から更新した結果は、1つのドキュメントに揃います。両方の経路で同一にできないカラム型は、設定の段階で拒否されます。[対応するカラム型](/ja/docs/replication#%E3%82%B5%E3%83%9B%E3%82%9A%E3%83%BC%E3%83%88%E3%81%95%E3%82%8C%E3%81%A6%E3%81%84%E3%82%8B%E3%82%AB%E3%83%A9%E3%83%A0%E5%9E%8B)を参照してください。

## イベント区分

イベントを読み飛ばしてよいのは、行も位置も運んでいないと言い切れる場合だけです。libmybinlog はすべてのイベント型を一度だけ分類し、MygramDB はその結果を 3つの動作にまとめます。

| 動作 | イベント型 |
| --- | --- |
| デコードして適用 | `TABLE_MAP`、GTID イベント、`XID`、`QUERY`、非圧縮の `WRITE_ROWS`/`UPDATE_ROWS`/`DELETE_ROWS` |
| 読み飛ばす | ストリームのフレーミング（`ROTATE`、`FORMAT_DESCRIPTION`）、`HEARTBEAT`、`ROWS_QUERY`、`PREVIOUS_GTIDS`、MariaDB の `ANNOTATE_ROWS` などの情報イベント、ソースが無視可能（`LOG_EVENT_IGNORABLE_F`）と示した未知の型 |
| 停止する（フェイルクローズ） | `ANONYMOUS_GTID`、`XA_PREPARE`、`INCIDENT`、`EXECUTE_LOAD_QUERY`、MySQL の `TRANSACTION_PAYLOAD` と `PARTIAL_UPDATE_ROWS`、MariaDB の圧縮イベント、無視可能と示されていない未知の型 |

停止したリーダーはエラー `2017` を報告し、最後に適用した GTID を保持します。該当イベントは binlog に残るため、その位置から再接続しても同じイベントに到達します。イベントを生んだサーバー設定を変えても、書き込み済みのイベントは消えません。復旧は、イベントを越えてリーダーを再開する `SYNC` で行います。手順は[デコードできない binlog イベントから復旧する](/ja/docs/replication#%E3%83%86%E3%82%99%E3%82%B3%E3%83%BC%E3%83%88%E3%82%99%E3%81%A6%E3%82%99%E3%81%8D%E3%81%AA%E3%81%84-binlog-%E3%82%A4%E3%83%98%E3%82%99%E3%83%B3%E3%83%88%E3%81%8B%E3%82%89%E5%BE%A9%E6%97%A7%E3%81%99%E3%82%8B)を参照してください。

## チェックサム

binlog のイベントは、末尾に 4 バイトの CRC32 トレーラーを持つことがあります。トレーラーの有無はファイルごとに `FORMAT_DESCRIPTION` イベントで宣言されるため、libmybinlog はファイルの境目ごとにアルゴリズムを取り直します。サーバー変数 `binlog_checksum` は参照しません。以前の設定で書かれた古いファイルも、ストリームで読まれることがあるためです。

MygramDB はストリームを開くときにソースへ CRC32 を要求し、`binlog_checksum` が `CRC32` でないソースは起動時に拒否します。検証に失敗したフレームや途中で切れたフレームは適用せず、最後に処理した GTID から再接続します。

## GTID

| | MySQL | MariaDB |
| --- | --- | --- |
| GTID の形式 | `uuid:gno` または `uuid:tag:gno` | `domain-server-seq` |
| 各トランザクションの前のイベント | `GTID` または `GTID_TAGGED` | `GTID`（MariaDB の型 162） |
| 位置の表現 | UUID とタグごとの区間の集合 | ドメインごとの最大シーケンス番号 |

MySQL 8.4 以降では、GTID にタグを付けられます。タグ付きのトランザクションは、タグを持つ同じ GTID として届き、libmybinlog はタグを小文字で保持します。同じ UUID のタグ付きとタグなしの GTID は別のエントリとして管理され、タグ付きのセットはダンプ要求で別のバイナリ形式を使います。MariaDB の位置はドメインごとのシーケンス番号で比較します。フェイルオーバーでサーバー ID が変わるのは正常なので、サーバー ID は無視します。開始位置と再開の動作は [GTID 位置と復旧](/ja/docs/replication#gtid-position)を参照してください。

トランザクションの GTID が適用済みの位置になるのは、そのコミットを処理した時点です。トランザクション内の行の変更をすべて適用した後に進みます。切断で途中までになったトランザクションは、読み飛ばさず直前の位置から再生します。

## 圧縮イベント

どちらのサーバーも binlog を圧縮でき、libmybinlog は両方を展開できます。ただし MygramDB は圧縮イベントを適用せず、拒否します。

| 圧縮される対象 | サーバー設定 | MygramDB の動作 |
| --- | --- | --- |
| MySQL のトランザクション全体（`TRANSACTION_PAYLOAD`） | `binlog_transaction_compression=ON` | 起動時に拒否し、後から現れた場合は `2017` で停止する |
| MariaDB の `QUERY` と rows イベント | `log_bin_compress=ON` | 起動時に拒否し、後から現れた場合は `2017` で停止する |
| 通常の rows イベント内の、MariaDB `COMPRESSED` の `VARCHAR`/`TEXT` カラム 1つ | カラム属性 | インデックス化の前に展開する |

MySQL の `PARTIAL_JSON` の行値（`binlog_row_value_options`）も圧縮と同じ扱いで、起動時に拒否し、実行中はフェイルクローズします。

## 起動時にチェックするサーバー設定

libmybinlog は、binlog リーダーが依存するサーバー変数のルールを持っています。MygramDB は読み取りを始める前に、そのルールを `SHOW VARIABLES` の結果に当てはめます。チェックする変数は、`log_bin`、`gtid_mode`（MySQL）、`binlog_format`、`binlog_row_image`、`binlog_checksum`、`binlog_row_metadata`、前述の圧縮と `PARTIAL_JSON` の設定、およびソース自身がレプリカである場合の `log_replica_updates`（MariaDB では `log_slave_updates`）です。違反があると `2008` で起動を拒否し、変数名を示します。必要な値と理由は [MySQL サーバー要件](/ja/docs/replication#mysql-%E3%82%B5%E3%83%BC%E3%83%8F%E3%82%99%E3%83%BC%E8%A6%81%E4%BB%B6)にあります。

起動後に有効にされた圧縮や `PARTIAL_JSON` は、影響を受ける最初のイベントが届いた時点で検出されます。前述のイベント区分がフェイルクローズするためです。

## libmybinlog を使ったビルド

ビルドでは、`third_party/CMakeLists.txt` に固定したリリースタグの libmybinlog を GitHub から取得します。通常の `make` に追加の手順は要りません。オフラインでビルドするときは、`MYBINLOG_SOURCE_DIR` にローカルのチェックアウトを指定します。

```bash
make MYBINLOG_SOURCE_DIR=/path/to/libmybinlog
```

前提条件は[ソースからビルド](/ja/docs/installation#%E3%83%92%E3%82%99%E3%83%AB%E3%83%88%E3%82%99)を参照してください。

## mysql-event-stream との関係

[mysql-event-stream](https://github.com/libraz/mysql-event-stream) は、Node.js と Python のバインディングを持つ、単体の変更データキャプチャエンジンです。レプリケーション接続は独自に実装し、ワイヤーフォーマットの読み取りは同じ libmybinlog で行います。そのため MygramDB と mysql-event-stream は、チェックサム、GTID、行の値、イベント区分のデコード規則を共有し、接続のコードは別々に持っています。

## 関連項目

- [MySQL レプリケーションガイド](/ja/docs/replication) - 要件、開始モード、GTID 位置と復旧
- [SYNC コマンドガイド](/ja/docs/sync-command) - デコードできないイベントを越えた再構築
- [アーキテクチャ](/ja/docs/architecture) - サーバー内でのリーダーの位置づけ
- [用語集](/ja/docs/glossary#binlog) - binlog と GTID の用語
- [libmybinlog のドキュメント](https://github.com/libraz/libmybinlog) - デコーダー、チェックサム、GTID、イベント区分の詳細
