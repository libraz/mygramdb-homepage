---
title: MygramDB パフォーマンスガイド - ベンチマークとチューニング
description: MygramDBのMySQL FULLTEXTとのベンチマーク比較、最適化のヒント、メモリサイジング、チューニング。
head:
  - - meta
    - name: keywords
      content: MygramDB パフォーマンス, MySQL FULLTEXT ベンチマーク, 検索レイテンシ, COUNT 性能, 並列スループット, OPTIMIZE, メモリサイジング, roaring bitmap
---

<script setup>
import { VERIFY_ALL_PER_MILLION_GB } from '../../data/memory'
</script>

# パフォーマンスガイド

このガイドでは、MygramDB のベンチマーク結果、性能を見るときの前提、最適化の考え方、本番環境でのサイジングを説明します。

## ベンチマーク結果

ベンチマーク表、グラフ、計測条件、メモリ使用量は、[ベンチマーク](/ja/benchmarks)と同じ計測結果スナップショットから表示しています。このスナップショットでは `verify_text: all` を使用し、MygramDBのクエリキャッシュを無効にしています。

<BenchmarkResults />

## パフォーマンス分析

公開ベンチマークでの MySQL の InnoDB バッファプールヒット率は 99.9989% でした。実測した差は、MySQL が毎回ディスクを読んだためとは説明できません。MygramDB は検索インデックスをメモリに保持し、ドキュメント ID をポスティングリストに格納します。差はクエリ、データ、ソート、メモリ、同時実行数に左右されるため、上の計測条件と併せて評価してください。

## パフォーマンス特性

### 現行の実行経路

大きなクエリやキャッシュの負荷で、処理量やロック保持時間を抑えるために、検索と保守は次の構造を使います。

- 候補フィルタはポスティングリストとソート済み候補リストをそれぞれ1回だけ進めるため、処理量は調べた候補数とポスティング数に比例します。
- 候補テキストは上限付きのチャンクで取り出します。BM25スコアリング、出現頻度の集計、テキストのポストフィルタを始める前にDocumentStoreのロックを解放します。
- ポスティングリストと語の出現頻度の参照結果を、論理式の評価、NOTの除外、同義語の展開、テキスト照合で共有します。NOTを含まない式では、全DocIDを走査しません。
- フィルタカラム名はテーブル内に一度だけ登録します。各ドキュメントはカラム ID をキーにしたコンパクトなベクトルに値を持ちます。
- キャッシュ無効化には、N-gram、フィルタ、テキスト変化に敏感な依存関係ごとの逆引きインデックスがあります。LRU保守は1回の排他ロックでキャッシュ全体を走査せず、各 tick で上限付きの範囲から再開します。
- テーブルごとの統計は上限付きスナップショットへ集約し、`INFO`、`/metrics`、Prometheusへ返します。スクレイプのたびに全テーブルをロックしません。

## 最適化のヒント

### 1. 適切な ngram_size を選択

```yaml
tables:
  - name: "articles"
    ngram_size: 2          # 漢字以外に適用するデフォルトサイズ
    kanji_ngram_size: 1    # CJK表意文字に適用するサイズ。データに合わせて調整
```

**推奨事項:**
- **バイグラム (2)** はASCIIテキストとCJK表意文字のデフォルトです。
- **ユニグラム (1)** は、検索パターンやデータによってCJK表意文字に適する場合があります。
- **トライグラム (3)** は、インデックスに登録する文字列の種類と候補の絞り込み方を変えます。作成時間、メモリ、検索レイテンシへの影響はデータやクエリによって変わるため、初期値を変える前に実測してください。

### 2. verify_text で候補を照合

```yaml
memory:
  verify_text: "all"  # 正規化テキストとの部分文字列照合
```

`verify_text: all` は、対象となる候補の正規化テキストに検索語が部分文字列として含まれるかを確認します。この照合ルールでN-gram検索の偽陽性を除けますが、MySQL FULLTEXTとすべてのクエリで同じ意味論になるわけではありません。今回計測したクエリでは MySQL FULLTEXT と同じ件数でした。正規化テキストはどのモードでも保存するため、`off` にしてもテキスト保存分のメモリは減りません。

### 3. メモリ設定

```yaml
memory:
  hard_limit_mb: 16384      # 予約済み / 現在は未強制
  soft_target_mb: 8192      # 予約済み / 現在は未強制
  roaring_threshold: 0.18   # OPTIMIZE が使う密度の閾値
```

**推奨事項:**
- `hard_limit_mb`と`soft_target_mb`は互換性のための予約フィールドとして
  扱ってください。現時点ではプロセスメモリ上限を強制しません
- `roaring_threshold` はデフォルト（0.18）から始めてください。変更する場合は `OPTIMIZE` を実行し、実データでメモリへの影響を測定してください

::: warning メモリ上限はOS側でも設定
MygramDBの `hard_limit_mb` は現時点で強制的なプロセスメモリ制限ではありません。Docker、systemd、Kubernetesなどで実行する場合は、コンテナやサービス側のメモリ制限と監視も設定してください。
:::

### 4. フィルタで候補を絞る

```yaml
tables:
  - name: "articles"
    filters:
      - name: "status"
        type: "int"
      - name: "category_id"
        type: "int"
```

検索対象を早い段階で絞り込み、結果セットを小さくします。
```mygram
SEARCH articles tech FILTER status=1 FILTER category_id=5 LIMIT 100
```

### 5. クエリパターンの最適化

`SEARCH table term SORT id LIMIT 100` は、設定済みの主キーが `id` の場合にその値で並べ替えます。`SEARCH table term1 AND term2` は両方の語句の候補を交差します。`COUNT table term` は ID のページを返さず件数を返しますが、テキスト照合が有効な場合はそれも含めて検索処理を実行します。大きな `LIMIT` は返す ID が増えるため、応答処理も増えます。速度の順序を固定して考えず、実データで測定してください。

### 6. OPTIMIZE コマンドの使用

`OPTIMIZE` は現在の密度に基づいてポスティングリストの形式を再構築します:

```mygram
OPTIMIZE
```

密度に応じてデルタエンコーディングのポスティングリストを Roaring ビットマップへ変換できます。メモリ使用量の変化はデータに依存します。実行前にインデックスサイズの約2.1倍の空きメモリを確保してください。見積もりが空き容量を超える場合、`OPTIMIZE` は実行を拒否します。

## 本番環境デプロイの推奨事項

### 1. メモリサイジング

**容量の参考値:** [公開した v1.10.0 のベンチマーク](/ja/benchmarks)では、`verify_text: all` で100万ドキュメントあたり約{{ VERIFY_ALL_PER_MILLION_GB }}GBの常駐メモリを使用しました。現行版は `verify_text: off` でもハイライト用の正規化テキストを保持するため、インデックスだけのメモリ構成にはなりません。実データで RSS を測定し、余裕分を確保してください。

**計画時の目安（`verify_text: all` の場合）:**
- 100万ドキュメント: 4GB 以上を計画し、8GB なら増加分の余裕を持たせられます
- 1000万ドキュメント: 32GB 以上を計画し、48GB なら増加分の余裕を持たせられます
- 1億ドキュメント: アプリケーション側で分割して複数インスタンスに振り分ける方法を検討します

これらは公開ベンチマークのデータセットを基にした概算で、必要容量を保証する値ではありません。ドキュメント長、フィルタ、インデックス構造によって変わるため、代表的なデータで測定し、余裕を確保してください。

### 2. 高可用性セットアップ

ロードバランサーの背後に複数の MygramDB インスタンスをデプロイ:

<DocDiagram name="ha-topology" alt="1台の MySQL プライマリが binlog を server_id の異なる3台の独立した MygramDB ノードへ複製し、/health/ready で判定するロードバランサがアプリケーションの検索トラフィックを振り分ける構成図" />

### 3. モニタリング

`INFO` コマンドで主要メトリクスを監視します。

```mygram
INFO
```

見るべき主な項目:
- `total_documents`: インデックスされたドキュメント数
- `used_memory_index`: インデックスが使用するメモリ（読みやすい単位で表示）
- `total_requests`: 処理された総クエリ数
- `connected_clients`: 現在のアクティブ接続数
- `uptime_seconds`: サーバー稼働時間（秒）

### 4. バックアップ戦略

`DUMP SAVE` コマンドでスナップショットを作成:

```mygram
DUMP SAVE snapshot.dmp
```

定期的なスナップショットをスケジュール:
```bash
# 毎日のスナップショット
0 2 * * * dump_date=$(date +\%Y\%m\%d); printf 'AUTH \%s\nDUMP SAVE mygramdb-\%s.dmp\n' "$MYGRAM_API_ADMIN_TOKEN" "$dump_date" | mygram-cli
```

これらのファイル名は `dump.dir` の下に解決され、外側のパスは拒否されます。この cron の例では `AUTH` と `DUMP SAVE` を1つの接続に送ります。`api.admin_token` が空の場合だけ `AUTH` は不要です。非ループバックのデプロイではトークンを設定してください。

## トラブルシューティング

### クエリが期待より遅い

1. **インデックスが最適化されているか確認:**
   ```mygram
   OPTIMIZE
   ```

2. **メモリ使用量を確認:**
   ```mygram
   INFO
   ```
   `used_memory_index`とプロセスRSSを確認してください。`hard_limit_mb`は予約済みで、
   現時点ではプロセスメモリ上限を強制しません。

3. **デバッグモードを有効化:**
   ```mygram
   DEBUG ON
   SEARCH table term LIMIT 100
   ```
   `query_time`、`index_time`、`optimization` フィールドを確認。

### 高メモリ使用量

1. **OPTIMIZE を実行:**
   ```mygram
   OPTIMIZE
   ```
   密なポスティングリストを Roaring ビットマップへ変換できます。再構築中はインデックスサイズの約2.1倍の空きメモリが必要なため、事前に確認してください。

2. **roaring_threshold を調整:**
   ```yaml
   memory:
     roaring_threshold: 0.15  # 低い = より積極的な圧縮
   ```

3. **アプリ側でのシャーディングを検討:** 元データを分割して各パーティションを別の MygramDB インスタンスで扱い、アプリ側でクエリを振り分けたり結果を統合したりします。MygramDB は自動でシャーディングしません。

## 代替手段との比較

### vs MySQL FULLTEXT

**MygramDB の利点:**

- キャッシュ無効の実測値は、このページ上部のベンチマークスナップショットに集約
- 検索インデックスの参照は MySQL のバッファプールに依存しない。ただし MygramDB 自身のクエリキャッシュのヒットはレイテンシを変える
- COUNTを含む実測値はベンチマークスナップショットを参照
- `verify_text` で正規化した部分文字列との照合を有効にできます。ベンチマークで試したクエリは MySQL FULLTEXT と同じ件数でしたが、すべてのクエリで同じ意味論を保証するものではありません
- 公開ベンチマークでは1・2・4・8・16接続を計測しました。別のワークロードでの性能は実データで確認してください

**MySQL FULLTEXT の利点:**

- 別の検索基盤が不要
- 既存の MySQL データとSQLクエリをそのまま利用
- マッチ数が少ない単純なクエリでは十分な速度

### vs Elasticsearch

**MygramDB の利点:**
- デプロイ構成が小さい（単一バイナリ）
- 運用の複雑さが低い
- 直接 MySQL レプリケーション（ETL不要）

**Elasticsearch の利点:**
- ノード間の分散検索
- 高度な分析と集計
- 分散検索・分析のための広いエコシステム
- 単一ノードRAMに制限されない

## ベンチマークの再現

付属のベンチマークスクリプトで結果を再現できます:

```bash
# ベンチマーク環境の起動（MySQL + MygramDB + データ投入）
make bench-up

# ベンチマーク実行
make bench-run
```

独自データでベンチマークする場合は、サーバーを起動します:

```bash
./mygramdb -c config.yaml
```

自動スナップショットを無効にしている場合は、同じ認証済み CLI 接続で同期を開始し、状態を確認してデバッグを有効にし、テストクエリを実行します:

```text
$ mygram-cli
127.0.0.1:11016> AUTH <token>
OK AUTHENTICATED
127.0.0.1:11016> SYNC table
127.0.0.1:11016> SYNC STATUS
127.0.0.1:11016> DEBUG ON
127.0.0.1:11016> SEARCH table common_term LIMIT 100
127.0.0.1:11016> COUNT table common_term
```

MySQL と比較します:

```bash
mysql -e "SELECT COUNT(*) FROM table WHERE MATCH(column) AGAINST('common_term')"
mysql -e "SELECT id FROM table WHERE MATCH(column) AGAINST('common_term') ORDER BY id LIMIT 100"
```

## まとめ

性能差はクエリ、データ、ハードウェア、キャッシュ設定で変わります。キャッシュ無効のスナップショットに載るレイテンシ、メモリ、並列スループットを、ここでの基準値として扱ってください。

`verify_text: all` は正規化テキストとの部分文字列照合を行います。今回計測したクエリの件数は MySQL FULLTEXT と同じでしたが、任意のクエリで意味論が一致する保証ではありません。CJK表意文字の低頻度語のように MySQL 側が短時間で完了する場合は、レイテンシの差が小さくなることがあります。

数百万件の読み取り中心ワークロードでは、付属ベンチマークを自分のデータで実行して評価してください: `make bench-up && make bench-run`。
