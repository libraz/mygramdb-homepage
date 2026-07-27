---
title: ベンチマーク - MygramDB vs MySQL FULLTEXT
description: Wikipedia記事を使ったMygramDBとMySQL FULLTEXTの再現可能なベンチマーク。
head:
  - - meta
    - name: keywords
      content: MySQL FULLTEXT ベンチマーク, MySQL 検索 性能, 全文検索 ベンチマーク, MygramDB 性能
---

# ベンチマーク

以下の表とグラフは、計測結果のスナップショットから表示しています。ここに載せる結果はすべて同じデータセット、同じクエリキャッシュ設定で計測しています。

::: info 再現可能
[リポジトリ](https://github.com/libraz/mygram-db)を clone して、次の順に実行します。

```bash
# Docker Compose と Rye が必要です。
make bench-up

# "Seed Data Load Complete" と MygramDB の "server_ready" が出るまで待ちます。
make bench-logs

make bench-run
make bench-down
```

`bench-down` はベンチマーク用のコンテナとボリュームを削除します。ベンチマーク用Compose設定ではMygramDBのクエリキャッシュを無効にしています。
:::

<BenchmarkResults />

::: tip `verify_text` モード

- `off`（デフォルト）: メモリ使用量は少ないですが、n-gramの偽陽性を含む場合があります。
- `all`: ドキュメントテキストを保持してポストフィルタ検証を行い、この計測ではMySQL FULLTEXTと同じ件数を返しました。
:::

アーキテクチャの違いは[MySQL FULLTEXTが遅い理由](/ja/why)を、製品ごとの使い分けは[比較ページ](/ja/comparison)をご覧ください。
