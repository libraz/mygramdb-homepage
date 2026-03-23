---
title: ベンチマーク - MygramDB vs MySQL FULLTEXT
description: 110万件のWikipedia記事でMygramDB vs MySQL FULLTEXTを計測。make bench-upで再現可能。
head:
  - - meta
    - name: keywords
      content: MySQL FULLTEXT ベンチマーク, MySQL 検索 性能, 全文検索 ベンチマーク, MygramDB 性能
---

# ベンチマーク

**110万件のWikipedia記事**（英語100万件 + 日本語10万件、平均666文字）で MySQL 8.4 FULLTEXT（ngram パーサー）と比較。MygramDB v1.5.0、`verify_text: all`、クエリキャッシュ無効。すべての数値は10回計測のp50。

::: info 再現可能
[リポジトリ](https://github.com/libraz/mygram-db)で `make bench-up && make bench-run` を実行すると同じベンチマークを実行できます。
:::

::: info ハードウェアについて
Apple M4 Max（128GB ユニファイドメモリ）で計測。ユニファイドメモリは一般的なサーバー用 DDR4/DDR5 より帯域が広いため、サーバー環境では両エンジンとも絶対値で遅くなりますが、相対的な性能差は同程度です。
:::

## 検索レイテンシ（SORT id LIMIT 100）

<BenchChart
  title="検索レイテンシ（p50、対数スケール）"
  :data="[
    { label: '複合語', mysql: 2566, mygramdb: 0.09 },
    { label: '中頻度', mysql: 1874, mygramdb: 0.28 },
    { label: '低頻度', mysql: 507, mygramdb: 0.42 },
    { label: '希少語', mysql: 936, mygramdb: 0.08 },
  ]"
/>

| クエリタイプ | マッチ数 | MySQL | MygramDB | 高速化 |
|------------|---------|-------|----------|---------|
| 複合語 ("quantum physics") | 104 | 2,566ms | 0.09ms | 27,600倍 |
| 中頻度 ("quantum") | 1,961 | 1,874ms | 0.28ms | 6,700倍 |
| 低頻度 ("algorithm") | 2,498 | 507ms | 0.42ms | 1,200倍 |
| 希少語 ("fibonacci") | 84 | 936ms | 0.08ms | 11,600倍 |

## CJK検索レイテンシ（SORT id LIMIT 100）

<BenchChart
  title="CJK検索レイテンシ（p50、対数スケール）"
  :data="[
    { label: '日本（高頻度）', mysql: 1204, mygramdb: 1.1 },
    { label: '東京（中頻度）', mysql: 300, mygramdb: 3.9 },
    { label: '科学（低頻度）', mysql: 4.2, mygramdb: 2.2 },
  ]"
/>

| クエリ | マッチ数 | MySQL | MygramDB | 高速化 |
|-------|---------|-------|----------|---------|
| 日本 | 32,282 | 1,204ms | 1.1ms | 1,100倍 |
| 東京 | 6,989 | 300ms | 3.9ms | 77倍 |
| 科学 | 1,551 | 4.2ms | 2.2ms | 1.9倍 |

## COUNT性能

<BenchChart
  title="COUNTレイテンシ（p50、対数スケール）"
  :data="[
    { label: '中頻度', mysql: 1797, mygramdb: 0.08 },
    { label: '低頻度', mysql: 416, mygramdb: 0.08 },
  ]"
/>

| クエリタイプ | カウント | MySQL | MygramDB | 高速化 |
|------------|-------|-------|----------|---------|
| 中頻度 ("quantum") | 1,961 | 1,797ms | 0.08ms | 21,600倍 |
| 低頻度 ("algorithm") | 2,498 | 416ms | 0.08ms | 5,500倍 |

## 結果一致性（v1.5.0）

`verify_text: all` を有効にすると、MygramDB は MySQL FULLTEXT と**完全一致**の結果を返します：

| クエリ | MySQL | MygramDB | 一致 |
|-------|-------|----------|------|
| quantum | 1,961 | 1,961 | 完全一致 |
| algorithm | 2,498 | 2,498 | 完全一致 |
| 日本 | 32,282 | 32,282 | 完全一致 |
| 科学 | 1,551 | 1,551 | 完全一致 |

`verify_text` なしの場合、n-gram インデックスは偽陽性を含む場合があります（例: "quantum" で 1,961件ではなく 58,214件がヒット）。これは n-gram トークン化の特性であり、想定される動作です。

## 並列スループット

<BenchChart
  title="スループット — QPS（高いほど良い）"
  :data="[
    { label: '1接続', mysql: 2, mygramdb: 2634 },
    { label: '4接続', mysql: 8, mygramdb: 11766 },
  ]"
  unit=" QPS"
/>

クエリ: "algorithm"、レベルあたり10秒。

| 接続数 | MySQL QPS | MygramDB QPS | MySQL p50 | MygramDB p50 |
|--------|-----------|-------------|-----------|-------------|
| 1 | 2 | 2,634 | 470ms | 0.35ms |
| 4 | 8 | 11,766 | 495ms | 0.32ms |

## メモリ使用量

| ドキュメント数 | インデックス | ドキュメント+テキスト | RSS合計 | 100万件あたり |
|--------------|------------|-------------------|---------|-------------|
| 1,100,000 | 813MB | 1.54GB | 2.53GB | 約2.3GB |

::: tip verify_text モード
- `off`（デフォルト）: メモリ使用量が少ないが、n-gram 偽陽性を含む場合あり
- `all`: ドキュメントテキストを保持してポストフィルタ検証。110万件で約1.5GB 追加だが結果は正確
:::

## なぜこの性能が出るのか

アーキテクチャの違いについては[MySQL FULLTEXTが遅い理由](/ja/why)を、Elasticsearchとの比較は[比較ページ](/ja/comparison)をご覧ください。
