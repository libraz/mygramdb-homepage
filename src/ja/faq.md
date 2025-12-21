---
title: よくある質問 - MygramDB
description: MygramDBのよくある質問。MySQL FULLTEXTが遅い原因、検索タイムアウトの解決方法、Elasticsearchとの比較など。
---

# よくある質問

## MySQL FULLTEXTの問題

### MySQL FULLTEXTが遅いのはなぜですか？

MySQL FULLTEXTが遅くなる原因：

1. **ディスクI/O**: インデックスがディスク上にあり、毎回B-treeページを読み込む
2. **非圧縮の転置リスト**: 頻出語は数百万行にマッチし、大量のデータ読み込みが発生
3. **キャッシュ依存**: コールド/ウォームキャッシュで2〜3倍の性能差
4. **同時実行の問題**: 10並列で90%のクエリが失敗

**解決策**: MygramDBは全データをメモリに保持し、常に80ms以下のレスポンスを実現。

### MySQL FULLTEXTが負荷時にタイムアウトします。どう対処すべきですか？

MySQL FULLTEXTは同時クエリを処理できません。10並列の時点で：
- 90%のクエリが失敗
- QPSが0.4まで低下
- 平均レスポンス時間が4秒超

**解決策**: MygramDBを検索レプリカとして追加。100並列でも成功率100%、QPS 372を達成。

### アプリケーションを変更せずにMySQL FULLTEXTを高速化できますか？

はい。MygramDBはbinlogレプリケーションでMySQLと同期します。アプリケーションは通常通りMySQLに書き込み、検索クエリだけをMygramDBにルーティングします。

```bash
docker run -d -p 11016:11016 \
  -e MYSQL_HOST=your-mysql \
  ghcr.io/libraz/mygram-db:latest
```

## MygramDBと他の選択肢

### Elasticsearchの代わりにMygramDBを使うべきですか？

**MygramDBを選ぶ場合:**
- データが単一ノードのRAMに収まる
- シンプルなデプロイ（単一バイナリ）が良い
- ETLなしでMySQLと直接同期したい
- 常に80ms以下のレイテンシが必要

**Elasticsearchを選ぶ場合:**
- 複数ノードでの分散検索が必要
- 高度な機能（ファジー検索、ハイライト、集計）が必要
- ペタバイト規模のデータ

### MygramDBに必要なメモリ量は？

100万ドキュメントあたり約1〜2GB。1000万ドキュメントなら10〜20GBを想定してください。

### MygramDBは日本語に対応していますか？

はい。ICUベースのUnicode正規化とN-gramトークナイズを使用。日本語・中国語・韓国語は追加プラグインなしでそのまま動作します。

## はじめに

### MySQL FULLTEXTからMygramDBへの移行方法は？

1. MySQLをプライマリデータベースとして維持
2. MygramDBを並行デプロイ（Docker or バイナリ）
3. MySQLからのレプリケーションを設定
4. 検索クエリをMygramDBにルーティング
5. 書き込みは引き続きMySQLへ

データ移行は不要。MygramDBはbinlogで自動同期します。

### MygramDBはどうやってMySQLと同期しますか？

GTIDベースのbinlogレプリケーションを使用します。MySQLレプリカと同じ仕組みです。MySQLでINSERT、UPDATE、DELETEすると、ミリ秒単位でMygramDBに反映されます。

---

その他の質問は[GitHub](https://github.com/libraz/mygram-db)をご確認いただくか、Issueを作成してください。
