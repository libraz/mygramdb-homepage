---
title: MygramDB v1.8 へのアップグレード
description: v1.8系へ更新する前に確認する ngram_size のデフォルト変更、HTTPのブール検索、SYNCの競合制御、ダンプ互換性を説明します。
---

# v1.8 へのアップグレード

MygramDB v1.8.1 は、v1.8系の正確性と信頼性を高めるリリースです。APIの破壊的変更はありません。v1.8.0では、`ngram_size` を省略した場合のデフォルトが `1` から `2` に変わりました。

多くの環境ではそのままアップグレードできます。設定ファイルで暗黙のデフォルトに依存していないか、HTTPクライアントでBoolean式を使うか、`SYNC` を他のメンテナンス処理中に起動する自動化がないかを確認してください。

## 変更点

### ngram_size のデフォルト

ASCII/英数字テキスト向けの `ngram_size` のグローバルデフォルトは `2` になりました。これは、このドキュメント全体で推奨しているバイグラム設定と同じです。

以前のユニグラム挙動が必要な場合は、明示的に指定してください。

```yaml
tables:
  - name: "articles"
    ngram_size: 1
    text_source:
      column: "content"
```

一般的な英語または多言語混在のテキストでは、次の設定を推奨します。

```yaml
tables:
  - name: "articles"
    ngram_size: 2
    kanji_ngram_size: 1
```

### 設定検証

`ENUM` と `SET` はフィルタ型として拒否されるようになりました。binlog行イベントだけではラベルを復元できず、初期ロードとレプリケーションで意味がずれる可能性があるためです。また、`auto_initial_snapshot: true` を使う場合は、複数テーブル構成だけでなく単一テーブル構成でも `start_from: "snapshot"` が必要です。

### レプリケーションの正確性修正

v1.8.0 では、フィルタだけを変更する `UPDATE` で検索対象の行が結果から消える問題、主キーを変更する `UPDATE` で古い行がインデックスに残る問題、危険なbinlog状態を継続せず失敗または再接続する処理などが修正されています。

### クエリとHTTPの挙動

HTTPの `q` は既定でリテラルな検索テキストとして扱われます。`limit`、`offset`、`sort`、`filters`、`highlight`、`fuzzy` などはJSONフィールドから指定します。`q` をBoolean式として実行する場合は `"mode": "boolean"` を指定してください。テーブル同期中は、HTTPの search/count/facet/get は同期中の再構築と競合せず、一時的に `503` を返します。

つまり、HTTPクライアントではコマンド文字列ではなく、意図をJSONフィールドとして送ります。

```json
{
  "q": "quantum physics",
  "mode": "literal",
  "limit": 20,
  "sort": { "column": "created_at", "order": "DESC" },
  "filters": { "status": 1 }
}
```

Booleanクエリでは、バイグラム設定下の短い語、`AND`/`OR`/`NOT` を含む引用符付きフレーズ、`<>` の不等価フィルタ演算子、クライアントライブラリから送る生のBooleanクエリ解析が修正されています。

### v1.8.1の信頼性向上

v1.8.1では、Booleanフィルタ列、V2ダンプ復元時の上限、Unixソケットと非同期 `DUMP SAVE` のタイムアウトを持つsize/version付きCクライアント設定を追加しました。HTTPの許可リストはfail closedとなり、CIDRチェックを通さないのは `/health/live` と `/health/ready` だけです。

日時パースでは `2024-01-15` のような日付のみの文字列を受け付け、小数付きepoch秒は整数秒へ切り捨てます。

`OPTIMIZE`、`DUMP SAVE`、`DUMP LOAD` の実行中は `SYNC` が拒否されるようになりました。処理完了後に再実行してください。

CLIの `DOC` 出力は、`\n`、`\t`、`\\`、`\"`、`\xHH` などのエスケープ値をそのまま表示せず、復元して表示するようになりました。

設定済みの主キー、テキストソース、フィルタカラムに対する互換性のない `DROP`、`RENAME`、意味を変える変更があると、GTID を進める前にレプリケーションを停止します。スキーマまたは設定を修正してから、対象テーブルを `SYNC` で再構築してください。

## アップグレードチェックリスト

1. `ngram_size` を省略しているテーブル設定を確認する。
2. 旧来のユニグラム挙動が必要な場合だけ `ngram_size: 1` を明示する。
3. フィルタ設定に `ENUM` や `SET` を使っていないか確認する。
4. `auto_initial_snapshot: true` を有効にしている場合は、`start_from: "snapshot"` が設定されているか確認する。
5. HTTP検索ではオプションをJSONフィールドで指定し、意図したBoolean式だけ `"mode": "boolean"` を付ける。
6. `SYNC` 中のテーブル読み取りエンドポイントは一時的に `503` を返すため、readiness復帰後にリトライする。
7. 設定済みカラムを変更した場合は、レプリケーションが正常か確認する。互換性のないDDLで停止した場合は修正後に `SYNC` を実行する。
8. アップグレード後に通常の検索・レプリケーションのスモークテストを実行する。

詳細は [v1.8.1 リリースノート](https://github.com/libraz/mygram-db/blob/main/docs/releases/v1.8.1.md) を参照してください。
