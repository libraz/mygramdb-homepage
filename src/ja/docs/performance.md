---
title: MygramDB パフォーマンスガイド - ベンチマークとチューニング
description: MygramDBのMySQL FULLTEXTとのベンチマーク比較、最適化のヒント、メモリサイジング、チューニング。
head:
  - - meta
    - name: keywords
      content: MygramDB パフォーマンス, MySQL FULLTEXT ベンチマーク, 検索レイテンシ, COUNT 性能, 並列スループット, OPTIMIZE, メモリサイジング, roaring bitmap
---

# パフォーマンスガイド

このガイドでは、MygramDB のベンチマーク結果、性能を見るときの前提、最適化の考え方、本番環境でのサイジングを説明します。

## ベンチマーク結果

ベンチマーク表、グラフ、計測条件、メモリ使用量は、[ベンチマーク](/ja/benchmarks)と同じ計測結果スナップショットから表示しています。このスナップショットでは `verify_text: all` を使用し、MygramDBのクエリキャッシュを無効にしています。

<BenchmarkResults />

## パフォーマンス分析

### MySQL が遅くなりやすい理由

1. **ディスクベースのB-tree**: FULLTEXT インデックスは各クエリでディスクI/Oが必要
2. **圧縮なし**: 転置インデックスが圧縮されておらず、より多くのディスク読み込みが必要
3. **キャッシュ依存**: コールドとウォームキャッシュで2-3倍のパフォーマンス差
4. **ソートのオーバーヘッド**: `ORDER BY` には追加の処理とI/Oが必要
5. **高頻度語句**: 短く一般的な語句は大きな転置リストのスキャンが必要
6. **並行性のボトルネック**: 高負荷な並行環境では、ディスクI/Oの待ち行列が伸びやすい

### MygramDB が速い理由

1. **インメモリインデックス**: 検索インデックスをRAM上に保持し、検索時のディスクI/Oを避ける
2. **圧縮転置リスト**: ハイブリッド Delta エンコーディング + Roaring ビットマップ
3. **最適化された交差演算**: SIMD アクセラレーション付きビットマップ演算
4. **ソート**: `SORT` はプライマリキーと設定済みフィルタカラムを検証してから結果を並べ替える
5. **verify_text**: 正確性が必要な場合に、ポストフィルタで偽陽性を除去できる。保持テキスト分のメモリは使う
6. **対象を絞ったキャッシュ無効化**: 行が変わったとき、その依存関係が影響を受けうるキャッシュエントリだけを調べる

## パフォーマンス特性

### クエリ時間計算量

| 操作 | MySQL FULLTEXT | MygramDB |
|-----------|----------------|----------|
| 単一語句検索 | O(n log n) + ディスクI/O | O(n) インメモリ |
| AND 交差演算 | O(n * m) + ディスクI/O | O(n + m) SIMD付き |
| `SORT id` | 比較ソート | 結果件数に応じた比較ソート（部分または完全） |
| COUNT | フルスキャン | ビットマップ基数 |

### スケーラビリティ

**MygramDB が線形にスケールするもの:**
- 検索語句の数（効率的なビットマップ交差演算）
- 結果セットのサイズ（圧縮ビットマップ）
- 同時クエリ数（スレッドプールアーキテクチャ）

**MygramDB がスケールしないもの:**
- 利用可能なRAMを超えるデータセットサイズ（インメモリのみ）

### 現行の実行経路

大きなクエリやキャッシュの負荷で、広い走査や長いロック保持が起きないように、検索と保守は次の構造を使います。

- 候補フィルタはポスティングリストとソート済み候補リストをそれぞれ1回だけ進めるため、処理量は調べた候補数とポスティング数に比例します。
- 候補テキストは上限付きのチャンクで取り出します。BM25スコアリング、出現頻度の集計、テキストのポストフィルタを始める前にDocumentStoreのロックを解放します。
- 重複を除いた term info の参照結果を、論理式の評価、NOTの除外、同義語の展開、照合で共有します。NOTを含まない式では、全DocIDを走査しません。
- フィルタカラム名はストアごとに1回だけインターンし、ドキュメントごとの値はそのカラム ID をキーにしたコンパクトなベクトルで持ちます。
- キャッシュ無効化には、N-gram、フィルタ、テキスト変化に敏感な依存関係ごとの逆引きインデックスがあります。LRU保守は1回の排他ロックでキャッシュ全体を走査せず、各 tick で上限付きの範囲から再開します。
- テーブルごとの統計は上限付きスナップショットへ集約し、`INFO`、`/metrics`、Prometheusへ返します。スクレイプのたびに全テーブルをロックしません。

## 最適化のヒント

### 1. 適切な ngram_size を選択

```yaml
tables:
  - name: "articles"
    ngram_size: 2          # ASCII/英数字: バイグラム（推奨）
    kanji_ngram_size: 1    # CJK文字: ユニグラム（推奨）
```

**推奨事項:**
- **バイグラム (2)** ASCII/英語用: 精度とインデックスサイズのバランスが良い
- **ユニグラム (1)** CJK用: 各文字が意味を持つ
- **トライグラム (3)**: より精密だがインデックスが大きく、クエリが遅い

### 2. メモリ設定

```yaml
memory:
  hard_limit_mb: 16384      # 予約済み / 現在は未強制
  soft_target_mb: 8192      # 予約済み / 現在は未強制
  roaring_threshold: 0.18   # Delta→Roaring 変換閾値
```

**推奨事項:**
- `hard_limit_mb`と`soft_target_mb`は互換性のための予約フィールドとして
  扱ってください。現時点ではプロセスメモリ上限を強制しません
- `roaring_threshold` はメモリが逼迫していない限りデフォルト（0.18）のまま

::: warning メモリ上限はOS側でも設定
MygramDBの `hard_limit_mb` は現時点で強制的なプロセスメモリ制限ではありません。Docker、systemd、Kubernetesなどで実行する場合は、コンテナやサービス側のメモリ制限と監視も設定してください。
:::

### 3. フィルタで候補を絞る

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

### 4. クエリパターンの最適化

**高速なクエリ:**
- `SEARCH table term SORT id LIMIT 100` - プライマリキーで並べ替える
- `COUNT table term` - ビットマップ基数演算
- `SEARCH table term1 AND term2` - 効率的なビットマップ交差演算

**やや遅いクエリ:**
- `SEARCH table term LIMIT 100` - それでも高速だが、明示的にソートする場合より多くスキャンする可能性
- 非常に大きな LIMIT 値（>1000） - 返すIDが多い

### 5. OPTIMIZE コマンドの使用

定期的に実行して転置リストのストレージを最適化:

```mygram
OPTIMIZE
```

これにより、密度に基づいて Delta エンコーディングリストを Roaring ビットマップに変換し、メモリ使用量を10-30%削減します。

## 本番環境デプロイの推奨事項

### 1. メモリサイジング

**経験則:** `verify_text` の設定によって必要なRAMが大きく変わります。`verify_text: off` なら100万ドキュメントあたり約1GB前後、`verify_text: all` なら約2.3GBを目安にしてください。

**サイジング例:**
- 100万ドキュメント: 2GB RAM 最小、4GB 推奨（`verify_text: all` の場合）
- 1000万ドキュメント: 24GB RAM 最小、32GB以上推奨（`verify_text: all` の場合）
- 1億ドキュメント: 複数インスタンスへのシャーディングを検討

### 2. 高可用性セットアップ

ロードバランサーの背後に複数の MygramDB インスタンスをデプロイ:

<DocDiagram name="ha-topology" alt="1台の MySQL プライマリが binlog を server_id の異なる3台の独立した MygramDB ノードへ複製し、/health/ready で判定するロードバランサがアプリケーションの検索トラフィックを振り分ける構成図" />

### 3. モニタリング

`INFO` コマンドで主要メトリクスを監視します。

```mygram
INFO
```

見るべき主な項目:
- `doc_count`: インデックスされたドキュメント数
- `index_size`: インデックスが使用するメモリ
- `total_requests`: 処理された総クエリ数
- `connections`: 現在のアクティブ接続数
- `uptime`: サーバー稼働時間（秒）

### 4. バックアップ戦略

`DUMP SAVE` コマンドでスナップショットを作成:

```mygram
DUMP SAVE /path/to/snapshot.dmp
```

定期的なスナップショットをスケジュール:
```bash
# 毎日のスナップショット
0 2 * * * dump_date=$(date +\%Y\%m\%d); printf 'AUTH \%s\nDUMP SAVE /backup/mygramdb-\%s.dmp\n' "$MYGRAM_API_ADMIN_TOKEN" "$dump_date" | mygram-cli
```

この cron の例では `AUTH` と `DUMP SAVE` を1つの接続に送ります。`api.admin_token` が空の場合だけ `AUTH` は不要です。非ループバックのデプロイではトークンを設定してください。

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
   `index_size`とプロセスRSSを確認してください。`hard_limit_mb`は予約済みで、
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
   密な転置リストを Roaring ビットマップに変換（10-30%削減）。

2. **roaring_threshold を調整:**
   ```yaml
   memory:
     roaring_threshold: 0.15  # 低い = より積極的な圧縮
   ```

3. **シャーディングを検討:** データを複数の MygramDB インスタンスに分割。

## 代替手段との比較

### vs MySQL FULLTEXT

**MygramDB の利点:**

- キャッシュ無効の実測値は、このページ上部のベンチマークスナップショットに集約
- ディスクキャッシュの暖まり具合に左右されにくい
- COUNTを含む実測値はベンチマークスナップショットを参照
- `verify_text` によりn-gramの偽陽性を除去できる
- 読み取り中心の並列負荷でスループットを伸ばしやすい

**MySQL の利点:**

- 別の検索基盤が不要
- 既存の MySQL データで動作
- メモリ要件が低い
- マッチ数が少ない単純なクエリでは十分な速度

### vs Elasticsearch

**MygramDB の利点:**
- デプロイ構成が小さい（単一バイナリ）
- 運用の複雑さが低い
- 直接 MySQL レプリケーション（ETL不要）
- シンプルなクエリでのレイテンシが低い

**Elasticsearch の利点:**
- ノード間の分散検索
- 高度な分析と集計
- 全文検索機能（ハイライト、ファジー検索）
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

`verify_text: all` を有効にした今回の計測では、MygramDBはMySQL FULLTEXTと同じ件数を返しました。CJKの低頻度語のようにMySQL側が短時間で完了するケースでは、差が小さくなります。

数百万件の読み取り中心ワークロードでは、付属ベンチマークを自分のデータで実行して評価してください: `make bench-up && make bench-run`。
