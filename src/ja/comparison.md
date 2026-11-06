---
title: MygramDB vs Elasticsearch vs MySQL FULLTEXT 比較
description: MygramDB、Elasticsearch、MySQL FULLTEXT を比較します。レイテンシ、導入の手間、データ同期、使い分けを説明します。
head:
  - - meta
    - name: keywords
      content: MySQL FULLTEXT 代替, Elasticsearch 代替, MySQL Elasticsearch 比較, 全文検索 比較
---

# MygramDB vs Elasticsearch vs MySQL FULLTEXT

適した全文検索の方法は、要件によって変わります。このページでは 3 つの選択肢を比較します。

::: info 選び方の前提
MygramDB は「既に MySQL/MariaDB に正本データがあり、検索だけを高速化したい」ケースに特化しています。検索エンジンをデータ基盤の中心に置きたい場合や、分散分析基盤が必要な場合は Elasticsearch などの方が適しています。
:::

## 早見表

| 項目 | MygramDB | Elasticsearch | MySQL FULLTEXT |
|------|----------|---------------|----------------|
| **レイテンシ** | [実測値](/ja/benchmarks) | このサイトでは未計測 | [実測値](/ja/benchmarks) |
| **導入** | 独立した検索サービス | 単一ノードまたはクラスタ | MySQL に組み込み |
| **データ同期** | MySQL / MariaDB binlog | アプリまたはコネクタでインデックスへ投入 | 元データを直接利用 |
| **スケール** | フルレプリカ、アプリ側で分割 | 分散インデックス | DB 側のレプリケーション（MySQL FULLTEXT はパーティションテーブル非対応。[MySQL の制約](https://dev.mysql.com/doc/refman/8.4/en/fulltext-restrictions.html)） |
| **メモリ** | [実測値](/ja/benchmarks) | インデックスと負荷に依存 | バッファプールと負荷に依存 |
| **マルチバイト / Unicode 対応** | N-gram（ICU NFKC） | アナライザーを設定可能 | パーサーを設定可能 |
| **集計** | FACET | Aggregations | SQL クエリ |

## それぞれの特徴

### MygramDB

**向いているケース:** MySQL を正本とし、データが 1 ノードのメモリに収まり、検索経路を MygramDB の API へ切り替えられる場合

**良い点:**
- キャッシュ無効のベンチマーク結果を公開
- MySQL / MariaDB の binlog から自動同期（MySQL 8.4/9.7/26.x および MariaDB 10.11+/11.x/12.x に対応）
- 単一バイナリで起動できる（MySQL 側の設定と初回同期は必要）
- クラスタ管理なし
- 言語に依存しない N-gram トークナイズで、マルチバイトの UTF-8 を標準で扱える（ICU NFKC 正規化）
- BM25 関連度スコア・ハイライト・あいまい検索・ファセット集計・同義語展開に対応

**注意点:**
- 分散検索はできない
- データがメモリに収まる必要あり

::: tip ETL が不要な意味
MygramDB では、アプリケーションが検索用データを別途送り込む必要はありません。ただし、MySQL 側の GTID、ROW 形式 binlog、レプリケーションユーザー、初回 `SYNC` などの設定は必要です。
:::

### Elasticsearch

**向いているケース:** 大規模データで高度な検索・分析が必要な場合

**良い点:**
- 水平スケールで容量を追加できる
- あいまい検索・ハイライト・集計など機能が豊富
- エコシステムとツールが充実している

**注意点:**
- クラスタの構築と運用が複雑
- MySQL を正本にする場合は、別途インデックスへの投入経路が必要

### MySQL FULLTEXT

**向いているケース:** 独立した検索サービスを使わず MySQL で要件を満たせる場合

**良い点:**
- MySQL に標準搭載
- 追加のインフラが不要
- データ同期の手間がない

**注意点:**
- レイテンシとスループットはクエリにより変わるため、キャッシュ無効のベンチマークを参照
- バッファプールの状態やリソースによって性能が変わる

## 性能比較

詳しい数値と測定条件は、[ベンチマーク](/ja/benchmarks)をご覧ください。

## 移行方法

### MySQL FULLTEXT から MygramDB へ

1. MySQL はそのまま使い続ける
2. MygramDB を横に立てる
3. 検索だけ MygramDB に向ける
4. 書き込みは MySQL のまま

[Docker デプロイガイド](/ja/docs/docker-deployment)に沿って MySQL の接続先、認証情報、バインドアドレス、ネットワークの許可リストを設定してください。初期インデックスは `SYNC` を実行するか `replication.auto_initial_snapshot` を有効にして構築し、その後で検索を MygramDB の TCP または HTTP API へ送ります。

### Elasticsearch から MygramDB へ

次のような場合は、乗り換えを検討できます。

- 分散検索が必要ない
- データが 1台のメモリに収まる
- 運用の複雑さが負担になっている
- MySQL との連携をシンプルにしたい

詳しくは [GitHub](https://github.com/libraz/mygram-db) をご覧ください。
