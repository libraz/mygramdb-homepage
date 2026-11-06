---
title: MygramDB Docker による Linux CI テスト
description: Docker で MygramDB の Linux 互換性を確認します。ネイティブビルドとは作業コピーを分け、ビルド、リント、フォーマット、デフォルトのテストを実行します。
head:
  - - meta
    - name: keywords
      content: MygramDB Linux テスト, Docker CI, GitHub Actions, clang-tidy, ccache, Ubuntu 22.04, クロスプラットフォーム ビルド
---

# Docker による Linux CI テスト

## 概要

Docker の開発用イメージを使い、Linux 固有のヘッダーやコンパイラの問題を確認します。

::: info このページを読むタイミング
macOS で開発していて、GitHub Actions や Linux 上のビルド失敗を事前に潰したい場合に使います。通常の利用者が MygramDB をインストールするための手順ではありません。
:::

## 問題

macOS で開発していると、次のような問題が Linux 環境でしか表れないことがあります。

- **ヘッダーファイルの記載漏れ** (例: `<cstdint>`, `<climits>`)
- **コンパイラの挙動の違い** (Clang vs GCC)
- **ライブラリバージョンの違い**
- **パス処理の違い**

これらは macOS では見つからず、push 後の CI で初めて失敗として現れます。

## 解決策

開発用イメージは Ubuntu 22.04 とビルドに必要な依存ライブラリを使います。GitHub Actions は `ubuntu-latest` を使い、`MYGRAMDB_PORTABLE_BUILD` も有効にします。Docker のターゲットではこのオプションを有効にしません。ローカルの Linux 確認は、CI 全体の再現ではありません。

## クイックスタート

以下は、ネイティブビルドとは別の、Linux 専用の作業コピーで実行してください。作業コピーの作成方法は[推奨ワークフロー](#推奨ワークフロー)を参照してください。

### 1. フル CI チェック（push 前に推奨）

```bash
make docker-ci-check
```

次のローカル確認を順に実行します。

1. コードフォーマットチェック
2. カバレッジ、ICU、MySQL を有効にした Debug ビルド
3. clang-tidy リント
4. `SLOW` と `LOAD` を除くデフォルトのテスト実行

すべての CTest 階層を実行するには、Linux シェル内で `make test-all` を実行します。実データベースを使う E2E スイートは別の確認です。[開発ガイド](/ja/docs/development#e2e-スイート)を参照してください。

### 2. 個別ステップの実行

```bash
# ビルドのみ
make docker-build-linux

# テストのみ
make docker-test-linux

# リントのみ
make docker-lint-linux

# フォーマットチェックのみ
make docker-format-check-linux
```

### 3. 対話的開発シェル

```bash
make docker-dev-shell
```

Linux コンテナ内で対話的な bash シェルが起動し、コマンドを手動で実行できます。

```bash
# コンテナ内で
make build
make test
make lint
./build/bin/mygramdb --help
```

## 仕組み

### Docker イメージ: `support/dev/Dockerfile`

`support/dev/Dockerfile` は、次のローカル Linux 開発環境を作成します。

- **ベース**: Ubuntu 22.04
- **コンパイラ**: GCC
- **ツール**: clang-format-18, clang-tidy-18, ccache
- **依存関係**: libmysqlclient-dev, libicu-dev など

### Makefile ターゲット

Makefile には、次の Linux 開発用ターゲットがあります。

| ターゲット | 説明 |
|-----------|------|
| `docker-dev-build` | Linux Docker イメージのビルド（他のターゲットから自動実行） |
| `docker-dev-shell` | Linux コンテナでの対話的シェル |
| `docker-build-linux` | Linux でプロジェクトをビルド |
| `docker-test-linux` | Linux でテストを実行 |
| `docker-lint-linux` | Linux で clang-tidy を実行 |
| `docker-format-check-linux` | Linux でフォーマットをチェック |
| `docker-clean-linux` | Linux でビルドディレクトリをクリーン |
| `docker-ci-check` | ローカルのフォーマット、ビルド、リント、デフォルトのテストを実行 |

## 推奨ワークフロー

Docker 用には別の作業コピーを使ってください。各ターゲットはリポジトリをマウントして `build/` を構成するため、macOS の CMake キャッシュは再利用できません。同じ作業コピーでネイティブビルドとコンテナビルドを並行実行したり、複数の Docker ビルドを同時に実行したりしないでください。

**パターン 1: push 前のフルチェック。** ローカルクローンにはコミット済みの変更だけが含まれます。確認する変更を先にコミットするか、別の作業コピーへ反映してから実行してください。

```bash
git clone --no-hardlinks . ../mygram-db-linux
cd ../mygram-db-linux
make docker-ci-check
```

### パターン 2: 継続的テスト

Linux 用の作業コピーで、依存する手順を順に実行します。

```bash
make docker-build-linux
make docker-test-linux
```

`docker-test-linux` はビルドターゲットに依存します。対話的シェルでも、リポジトリのルートから `make build`、`make test`、`make lint` を実行できます。

### パターン 3: CI 失敗時のデバッグ

```bash
make docker-dev-shell

# コンテナ内のリポジトリルートから実行
cmake -S . -B build -DCMAKE_BUILD_TYPE=Debug -DBUILD_TESTS=ON -DENABLE_COVERAGE=ON -DUSE_ICU=ON -DUSE_MYSQL=ON
cmake --build build -j$(nproc)
make lint
exit
```

CI の失敗を再現する際は、失敗したジョブのビルド設定に合わせてください。上記は開発用コンテナの設定です。

## パフォーマンスのヒント

### 1. イメージキャッシング

初回は依存関係のインストールと全体のコンパイルが必要です。以降はイメージとビルド済みファイルを再利用します。所要時間はホストと変更内容によって変わります。

### 2. インクリメンタルビルド

`build/` ディレクトリはボリュームとしてマウントされるため、ビルドはインクリメンタルになります。

```bash
# 初回ビルド: 全コンパイル
make docker-build-linux

# 2回目のビルド: 変更ファイルのみ
make docker-build-linux  # ずっと高速！
```

### 3. 並列テスト

テストは、利用可能なすべての CPU コアを使って並列に実行されます。

```bash
make docker-test-linux  # $(nproc) コアを使用
```

### 4. ccache

::: info 用語補足
**ccache** は、コンパイル結果を再利用するためのキャッシュです。ヘッダーやコンパイルオプションが変わっていないファイルは再コンパイルを省けるため、2回目以降のビルドが速くなります。
:::

コンテナは ccache を使いますが、デフォルトのターゲットは ccache 用の永続ボリュームをマウントしません。キャッシュは同じコンテナ内でのみ再利用でき、`--rm` でコンテナを削除すると失われます。`build/` のコンパイル済みファイルは作業コピーに残るため、インクリメンタルビルドには使われます。

## トラブルシューティング

### 問題: "permission denied" エラー

コンテナは root として実行されますが、ファイルはユーザーが所有しています。権限の問題が起きたときは、次のようにします。

```bash
# ビルドディレクトリをクリーン
make docker-clean-linux

# または手動で
sudo rm -rf build/
```

### 問題: Docker イメージが古い

依存関係が変わった場合（新しい LLVM バージョン、新しいライブラリなど）は、イメージを再ビルドします。

```bash
# 開発イメージを再ビルド
docker build -f support/dev/Dockerfile -t mygramdb-dev:latest --no-cache .
```

### 問題: ディスク容量

Docker イメージはディスク容量を消費します。次のコマンドで整理できます。

```bash
# 開発イメージを削除
docker rmi mygramdb-dev:latest

# 未使用のDockerリソースを全てクリーン
docker system prune -a
```

### 問題: ビルドが遅い

キャッシュを使ってもビルドが遅い場合は、ccache の統計を確認します。

```bash
# ccache統計を確認
make docker-dev-shell
ccache --show-stats

# 必要に応じてccacheサイズを増やす（コンテナ内）
ccache --set-config=max_size=1G
```

## CI 環境の詳細

以下は `support/dev/Dockerfile` の構成で、現在の GitHub ホストランナーの構成ではありません。CI の OS とビルド設定は[ワークフロー](https://github.com/libraz/mygram-db/blob/main/.github/workflows/ci.yml)を参照してください。

| コンポーネント | バージョン |
|--------------|----------|
| OS | Ubuntu 22.04 |
| コンパイラ | GCC（デフォルト）+ Clang 18 |
| CMake | apt から最新版 |
| clang-format | 18 |
| clang-tidy | 18 |
| MySQL Client | libmysqlclient-dev |
| ICU | libicu-dev |
| Readline | libreadline-dev |
| カバレッジ | lcov |
| キャッシュ | ccache |

## Git Hooks との連携

pre-push フックを追加すると、push の前に CI チェックを自動で実行できます。

```bash
# .git/hooks/pre-push
#!/bin/bash
echo "Running CI checks before push..."
make docker-ci-check
if [ $? -ne 0 ]; then
    echo "CI checks failed. Push aborted."
    exit 1
fi
```

```bash
chmod +x .git/hooks/pre-push
```

## 高度な使用方法

### カスタム CMake オプション

```bash
# 異なるオプションでビルド
docker run --rm -v "$PWD:/workspace" -w /workspace mygramdb-dev:latest \
    bash -c 'cmake -S . -B build-asan -DCMAKE_BUILD_TYPE=Debug -DENABLE_ASAN=ON && \
    cmake --build build-asan -j$(nproc)'
```

### 特定のテストを実行

```bash
docker run --rm -v "$PWD:/workspace" -w /workspace mygramdb-dev:latest \
    bash -c 'ctest --test-dir build -R "MyTest.*" --verbose'
```

### カバレッジレポートの生成

```bash
make docker-dev-shell
# コンテナ内
cd build
make coverage
# coverage/html/index.htmlを表示
```

## 比較: macOS と Linux のテスト

| 側面 | macOS (`make build`) | Linux (`make docker-build-linux`) |
|------|----------------------|----------------------------------|
| 速度 | 高速（ネイティブ） | やや遅い（コンテナ化） |
| 環境 | 開発用の macOS | 開発用イメージ（Ubuntu 22.04） |
| 用途 | 高速イテレーション | push 前の検証 |
| コンパイラ | Clang（macOS） | GCC（Linux） |
| ヘッダー | より寛容 | より厳格（記載漏れを検出） |

**推奨**: 両方を併用します。
- macOS: 日常の開発用
- Linux: push 前の検証用

## 関連ドキュメント

- [開発ガイド](/ja/docs/development)
- [GitHub Actions CI ワークフロー](https://github.com/libraz/mygram-db/blob/main/.github/workflows/ci.yml)
