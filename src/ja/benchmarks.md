---
title: ベンチマーク - MygramDB vs MySQL FULLTEXT
description: Wikipedia 記事を使った MygramDB と MySQL FULLTEXT の再現可能なベンチマーク。
head:
  - - meta
    - name: keywords
      content: MySQL FULLTEXT ベンチマーク, MySQL 検索 性能, 全文検索 ベンチマーク, MygramDB 性能
---

# ベンチマーク

以下の表とグラフは、計測結果のスナップショットから表示しています。ここに載せる結果はすべて同じデータセット、同じクエリキャッシュ設定で計測しています。

::: info 再現可能
[リポジトリ](https://github.com/libraz/mygram-db)をクローンして、次の順に実行します。

```bash
# Docker Compose と Rye が必要です。
make bench-up

# MySQL のログに "Seed Data Load Complete" が出るまで待ちます。
make bench-logs

# MygramDB の準備が整うと "server_ready" がログに出ます。
docker compose -f docker-compose.bench.yml logs mygramdb

make bench-run
make bench-down
```

`bench-down` はベンチマーク用のコンテナとボリュームを削除します。ベンチマーク用 Compose 設定では MygramDB のクエリキャッシュを無効にしています。
:::

<BenchmarkResults />

::: tip `verify_text` モード

- `off`（デフォルト）: テキスト照合を行わないため、N-gram 検索の偽陽性が残る場合があります。正規化テキストはどのモードでも保持します。
- `all`: 候補を正規化テキストと照合し、部分文字列として一致するか確認します。この計測で試したクエリは MySQL FULLTEXT と同じ件数を返しましたが、すべてのクエリで同等の結果になることを保証するものではありません。
:::

アーキテクチャの違いは [MySQL FULLTEXT が遅い理由](/ja/why)を、製品ごとの使い分けは[比較ページ](/ja/comparison)をご覧ください。
