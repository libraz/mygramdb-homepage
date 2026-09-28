---
title: MygramDB vs Elasticsearch vs MySQL FULLTEXT 比較
description: MygramDB、Elasticsearch、MySQL FULLTEXTを徹底比較。レイテンシ、導入の手軽さ、データ同期、使い分けを解説。
head:
  - - meta
    - name: keywords
      content: MySQL FULLTEXT 代替, Elasticsearch 代替, MySQL Elasticsearch 比較, 全文検索 比較
---

# MygramDB vs Elasticsearch vs MySQL FULLTEXT

全文検索ソリューションは要件に応じて選ぶ必要があります。それぞれの特徴を比較します。

::: info 選び方の前提
MygramDBは「既にMySQL/MariaDBに正本データがあり、検索だけを高速化したい」ケースに特化しています。検索エンジンをデータ基盤の中心に置きたい場合や、分散分析基盤が必要な場合はElasticsearchなどの方が適しています。
:::

## 早見表

| 項目 | MygramDB | Elasticsearch | MySQL FULLTEXT |
|------|----------|---------------|----------------|
| **レイテンシ** | [実測値](/ja/benchmarks) | このサイトでは未計測 | [実測値](/ja/benchmarks) |
| **導入** | 独立した検索サービス | 単一ノードまたはクラスタ | MySQL に組み込み |
| **データ同期** | MySQL / MariaDB binlog | アプリまたはコネクタでインデックスへ投入 | 元データを直接利用 |
| **スケール** | フルレプリカ、アプリ側で分割 | 分散インデックス | DB 側のレプリケーションや分割 |
| **メモリ** | [実測値](/ja/benchmarks) | インデックスと負荷に依存 | バッファプールと負荷に依存 |
| **日本語対応** | N-gram（ICU NFKC） | アナライザーを設定可能 | パーサーを設定可能 |
| **集計** | FACET | Aggregations | SQL クエリ |

## それぞれの特徴

### MygramDB

**向いているケース:** MySQLを使っていて、手軽に検索を高速化したい

**良い点:**
- キャッシュ無効のベンチマーク結果を公開
- MySQL / MariaDB の binlog から自動同期（MySQL 8.4/9.x および MariaDB 10.11+/11.x/12.x に対応）
- バイナリ1つ置くだけで動く
- クラスタ管理なし
- 日本語のN-gram検索が得意
- BM25関連度スコア・ハイライト・ファジー検索・ファセット集計・シノニム展開に対応

**注意点:**
- 分散検索はできない
- データがメモリに収まる必要あり

::: tip ETLが不要な意味
MygramDBでは、アプリケーションが検索用データを別途pushする必要はありません。ただし、MySQL側のGTID、ROW形式binlog、レプリケーションユーザー、初回 `SYNC` などの設定は必要です。
:::

### Elasticsearch

**向いているケース:** 大規模データで高度な検索・分析が必要

**良い点:**
- 水平スケールで容量追加可能
- ファジー検索・ハイライト・集計など機能豊富
- エコシステムが充実

**注意点:**
- クラスタの構築・運用が大変
- MySQL を正本にする場合は、別途インデックスへの投入経路が必要

### MySQL FULLTEXT

**向いているケース:** 独立した検索サービスを使わず MySQL で要件を満たせる場合

**良い点:**
- MySQLに標準搭載
- 追加のシステム不要
- データ同期の手間なし

**注意点:**
- レイテンシとスループットはクエリにより変わるため、キャッシュ無効のベンチマークを参照
- バッファプールの状態やリソースによって性能が変わる

## 性能比較

詳しい数値と測定条件は、[ベンチマーク](/ja/benchmarks)をご覧ください。

## 移行方法

### MySQL FULLTEXTからMygramDBへ

1. MySQLはそのまま使い続ける
2. MygramDBを横に立てる
3. 検索だけMygramDBに向ける
4. 書き込みはMySQLのまま

::: warning HTTPルートのバージョン差
v1.7.0以降のHTTP APIは `/tables/{identity}/search` を使います。古い `/{table}/search` 形式は削除されています。移行時は[v1.7 へのアップグレード](/ja/docs/migration-v1.7)を確認してください。
:::

[Docker デプロイガイド](/ja/docs/docker-deployment)に沿って MySQL の接続先、認証情報、bind アドレス、ネットワーク許可範囲を設定してください。初期インデックスは `SYNC` を実行するか `replication.auto_initial_snapshot` を有効にして構築し、その後で検索を MygramDB の TCP または HTTP API へ送ります。

### ElasticsearchからMygramDBへ

こんな場合は乗り換えを検討：
- 分散検索が実は不要だった
- データが1台のメモリに収まる
- 運用が大変すぎる
- MySQLとの連携をシンプルにしたい

詳しくは[GitHub](https://github.com/libraz/mygram-db)をご覧ください。
