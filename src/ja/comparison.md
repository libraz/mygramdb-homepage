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

## 早見表

| 項目 | MygramDB | Elasticsearch | MySQL FULLTEXT |
|------|----------|---------------|----------------|
| **レイテンシ** | 80ms以下 | 50〜500ms | 100〜3000ms |
| **導入** | バイナリ1つ | クラスタ構築 | 標準搭載 |
| **データ同期** | binlogで自動 | ETLが必要 | 不要 |
| **スケール** | 単一ノード | 分散可能 | 単一ノード |
| **メモリ** | 100万件で1〜2GB | 100万件で2〜4GB | バッファプール次第 |
| **並列性能** | QPS 372 | 高い | QPS 0.4 |
| **日本語対応** | N-gram標準 | プラグイン追加 | N-gramパーサー |
| **分析機能** | 基本のみ | 充実 | なし |
| **学習コスト** | 低い | 高い | 低い |

## それぞれの特徴

### MygramDB

**向いているケース:** MySQLを使っていて、手軽に検索を高速化したい

**良い点:**
- 常に80ms以下の安定したレスポンス
- binlogで勝手に同期、設定不要
- バイナリ1つ置くだけで動く
- クラスタ管理なし
- 日本語のN-gram検索が得意

**注意点:**
- 分散検索はできない
- データがメモリに収まる必要あり
- あいまい検索やハイライトはなし

### Elasticsearch

**向いているケース:** 大規模データで高度な検索・分析が必要

**良い点:**
- 水平スケールで容量追加可能
- あいまい検索・ハイライト・集計など機能豊富
- エコシステムが充実
- ペタバイト級も対応

**注意点:**
- クラスタの構築・運用が大変
- データ連携にETLパイプラインが必要
- 運用コストが高い
- 学習に時間がかかる
- JVMのチューニングが必要

### MySQL FULLTEXT

**向いているケース:** 小規模データ（10万件以下）でシンプルに済ませたい

**良い点:**
- MySQLに標準搭載
- 追加のシステム不要
- データ同期の手間なし

**注意点:**
- 遅い（100〜3000ms）
- 並列アクセスに弱い（10並列で9割失敗）
- キャッシュ状態で性能が大きく変動
- スケールしない

## 性能比較

170万件のデータで10並列クエリを実行した結果：

| 指標 | MygramDB | Elasticsearch* | MySQL FULLTEXT |
|------|----------|----------------|----------------|
| 成功率 | 100% | ほぼ100% | 10% |
| 平均レイテンシ | 35ms | 100〜200ms | 4,641ms |
| QPS | 288 | 50〜100 | 0.4 |

*Elasticsearchはクラスタ構成で大きく変動

## 移行方法

### MySQL FULLTEXTからMygramDBへ

1. MySQLはそのまま使い続ける
2. MygramDBを横に立てる
3. 検索だけMygramDBに向ける
4. 書き込みはMySQLのまま

```bash
# 1. MygramDBを起動
docker run -d -p 11016:11016 \
  -e MYSQL_HOST=your-mysql \
  ghcr.io/libraz/mygram-db:latest

# 2. MygramDBで検索
curl "http://localhost:8080/articles/search" \
  -d '{"q": "検索ワード"}'
```

### ElasticsearchからMygramDBへ

こんな場合は乗り換えを検討：
- 分散検索が実は不要だった
- データが1台のメモリに収まる
- 運用が大変すぎる
- MySQLとの連携をシンプルにしたい

詳しくは[GitHub](https://github.com/libraz/mygram-db)をご覧ください。
