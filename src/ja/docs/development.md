---
title: MygramDB 開発環境セットアップ - ビルド、リント、ツール
description: MygramDBの開発環境セットアップ。CMake、LLVM 18、MySQLクライアント、ICUのインストール、VS Codeリンティング設定、Google C++スタイル規約、ビルド・フォーマット・テストの流れ。
head:
  - - meta
    - name: keywords
      content: MygramDB 開発, C++ ビルド セットアップ, clang-format 18, clang-tidy, Google C++ スタイル, VS Code clangd, CMake ビルド
---

# 開発環境セットアップ

このガイドでは、リアルタイムリンティングと自動フォーマット（JavaScript の ESLint/Prettier のような機能）を備えた MygramDB の開発環境をセットアップする方法を説明します。

::: info このページの対象
MygramDB本体をビルドしたり、C++コードを変更したりする開発者向けのページです。MygramDBを使うだけなら、まず[インストール](/ja/docs/installation)と[設定](/ja/docs/configuration)を読んでください。
:::

## 前提条件

開発を始める前に、必要なツールをインストールします。

### macOS

```bash
# Homebrew をインストール（まだインストールしていない場合）
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# 開発ツールをインストール
brew install cmake
brew install llvm@18  # バージョン 18 が必要（一貫したフォーマットのため）
brew install mysql-client@8.4
brew install icu4c

# LLVM 18 をデフォルトで使用するためのシンボリックリンクを作成
# 重要: CI と一貫したコードフォーマットを保証するため
ln -sf "$(brew --prefix llvm@18)/bin/clang-format" "$(brew --prefix)/bin/clang-format"
ln -sf "$(brew --prefix llvm@18)/bin/clang-tidy" "$(brew --prefix)/bin/clang-tidy"
ln -sf "$(brew --prefix llvm@18)/bin/clangd" "$(brew --prefix)/bin/clangd"
```

### Linux（Ubuntu/Debian）

```bash
# パッケージリストを更新
sudo apt-get update

# 基本的な開発ツールをインストール
sudo apt-get install -y \
  cmake \
  build-essential \
  libmysqlclient-dev \
  libicu-dev \
  pkg-config \
  wget \
  lsb-release \
  software-properties-common \
  gnupg

# LLVM/Clang 18 をインストール（一貫したフォーマットのため必須）
# 重要: CI 環境と一致させるためバージョン 18 が必要
wget https://apt.llvm.org/llvm.sh
chmod +x llvm.sh
sudo ./llvm.sh 18

# clang-format、clang-tidy、clangd バージョン 18 をインストール
sudo apt-get install -y clang-format-18 clang-tidy-18 clangd-18

# バージョン 18 をデフォルトに設定
sudo update-alternatives --install /usr/bin/clang-format clang-format /usr/bin/clang-format-18 100
sudo update-alternatives --install /usr/bin/clang-tidy clang-tidy /usr/bin/clang-tidy-18 100
sudo update-alternatives --install /usr/bin/clangd clangd /usr/bin/clangd-18 100
```

## インストールの確認

```bash
# ツールがインストールされているか確認
cmake --version        # 3.16+ であることを確認
clang-format --version # 18.x.x であることを確認
clang-tidy --version   # 18.x.x であることを確認
clangd --version       # 18.x.x であることを確認（オプション、LSP 用）
```

::: info 用語補足
**clang-format** はC++コードの見た目を自動整形するツール、**clang-tidy** は危険な書き方やスタイル違反を検出する静的解析ツールです。バージョンが違うと整形結果も変わるため、このプロジェクトではCIと同じバージョン18に揃えています。
:::

## プロジェクトのビルド

```bash
# プロジェクトをビルド（compile_commands.json を生成）
make

# テストを実行
make test

# コードをフォーマット
make format
```

ビルド後、`compile_commands.json` が `build/` ディレクトリに生成されます。このファイルは clangd と clang-tidy が正しく動作するために必要です。

## VS Code セットアップ

### 必須エクステンション

VS Code を開いて、推奨エクステンションをインストールします：

1. **C/C++**（`ms-vscode.cpptools`）- IntelliSense とデバッグ
2. **CMake Tools**（`ms-vscode.cmake-tools`）- CMake 統合
3. **Error Lens**（`usernamehw.errorlens`）- インラインエラー表示（ESLint のような）

### オプションのエクステンション（快適に開発するため）

4. **clangd**（`llvm-vs-code-extensions.vscode-clangd`）- リアルタイムリンティング用の高速 LSP

## リンティングを有効化

プロジェクトをビルドした後、VS Code でリンティングを有効化します：

### オプション A: C/C++ エクステンションを使用（シンプル）

`.vscode/settings.json` を編集して変更：

```json
{
  "C_Cpp.codeAnalysis.clangTidy.enabled": true,
  "C_Cpp.codeAnalysis.clangTidy.useBuildPath": true,
  "C_Cpp.codeAnalysis.clangTidy.path": "/absolute/path/to/llvm18/bin/clang-tidy",
  "C_Cpp.clang_format_path": "/absolute/path/to/llvm18/bin/clang-format"
}
```

macOS では `brew --prefix llvm@18` の出力に `/bin/clang-tidy` または `/bin/clang-format` を付けた絶対パスへ置き換えてください。Linux では `/usr/bin/clang-tidy-18` と `/usr/bin/clang-format-18` を使います。リポジトリの `/opt/homebrew/opt/llvm/bin` は LLVM 18 を指すとは限りません。

VS Code ウィンドウをリロード（Cmd/Ctrl + Shift + P → "Developer: Reload Window"）

### オプション B: clangd を使用（高速）

1. clangd エクステンションがインストールされていることを確認
2. clangd セクションを有効にし、`clangd.path` を LLVM 18 の絶対パスにします。macOS では `brew --prefix llvm@18` の出力に `/bin/clangd` を付け、Linux では `/usr/bin/clangd-18` を指定します。
3. C/C++ エクステンションセクションをコメントアウト（OPTION 2）
4. VS Code ウィンドウをリロード

## 有効化される機能

セットアップ後、以下が利用可能になります：

- **リアルタイムリンティング** - タイプしながら clang-tidy がチェック
- **自動フォーマット** - 保存時にコードをフォーマット（Google C++ スタイル）
- **インラインエラー** - Error Lens でインラインにエラー表示
- **コード補完** - C++17 用の IntelliSense
- **クイックフィックス** - 保存時に利用可能な問題を自動修正

## コーディング規約

このプロジェクトは特定の設定で **Google C++ スタイルガイド** に従います：

### コードフォーマット

- ベーススタイル: Google
- カラム制限: 120 文字
- インデント: 2 スペース（タブなし）
- ポインタ配置: 左（`int* ptr`、`int *ptr` ではない）
- ブレース: アタッチスタイル（`if (x) {`）

フォーマットツールの実行:

```bash
make format        # コードを自動整形
make format-check  # フォーマットをチェック（CI モード）
make lint          # clang-tidy で静的解析（時間がかかる）
```

### 命名規則

| 要素 | 規則 | 例 |
|------|------|-----|
| クラス | CamelCase | `DocumentStore`, `Index` |
| 関数 | CamelCase | `AddDocument()`, `GetPrimaryKey()` |
| 変数 | lower_case | `doc_id`, `primary_key` |
| 定数 | kCamelCase | `kMaxConnections`, `kDefaultPort` |
| メンバー変数 | lower_case_ | `next_doc_id_`, `term_postings_` |
| 名前空間 | lower_case | `mygramdb::index` |

### ドキュメントコメント

すべての公開 API に Doxygen スタイルのコメントを使用：

```cpp
/**
 * @brief 関数が行うことの簡単な説明
 *
 * @param param_name パラメータの説明
 * @return 戻り値の説明
 */
ReturnType FunctionName(Type param_name);
```

### clang-tidy 警告の抑制

必要に応じて、NOLINTコメントで警告を抑制します:

```cpp
// 良い例: 問題のある行の前に NOLINTNEXTLINE を使用
// NOLINTNEXTLINE(cppcoreguidelines-pro-type-vararg)
snprintf(buf, sizeof(buf), "%d", value);

// 良い例: インライン NOLINT（120文字以内に収める）
char buf[32];  // NOLINT(cppcoreguidelines-avoid-c-arrays)

// 悪い例: 複数行の NOLINT（clang-tidy が認識しない）
snprintf(buf, sizeof(buf), "%d",
         value);  // NOLINT(cppcoreguidelines-pro-type-vararg)

// 良い例: ファイルレベルの抑制（広範囲に影響する問題）
// NOLINTBEGIN(cppcoreguidelines-pro-bounds-pointer-arithmetic)
// ... ポインタ演算が必要なコード ...
// NOLINTEND(cppcoreguidelines-pro-bounds-pointer-arithmetic)
```

**重要:** NOLINTコメントは1行で記述する必要があります。複数行のコメントは認識されません。

## テストの実行

既定のターゲット は `SLOW` と `LOAD` ラベルのテストを除外します。

```bash
# 既定の単体・結合テスト
make test

# SLOW と LOAD のテストも含める
make test-all

# 明示的に実行する、Docker 上の MySQL を起動するテスト
make test-mysql
make test-large-dump
```

### E2E スイート

```bash
# 既定の MySQL 8.4 スイート
make e2e-test

# MySQL 8.4/9.7、MariaDB 10.11/11.8/12.3 の組み合わせ
make e2e-matrix
```

テストの選択方法と MariaDB 専用の実行手順 は [E2E test README](https://github.com/libraz/mygram-db/tree/develop/e2e) を参照してください。

### ローカルでのサニタイザーとファジング

サニタイザー付きビルドとファジングは、明示的に実行するローカル確認です。CI のジョブには含まれず、ファジング用のプログラムは CTest に登録されません。

```bash
# 必要に応じて ENABLE_ASAN を ENABLE_TSAN または ENABLE_UBSAN に置き換える。
cmake -S . -B build-asan -DCMAKE_BUILD_TYPE=Debug -DENABLE_ASAN=ON
cmake --build build-asan -j
ctest --test-dir build-asan -L CONCURRENCY -LE LOAD --output-on-failure

# パーサーとダンプヘッダーをランダム入力で検証します。反復回数を引数で指定します。
cmake -S . -B build-fuzz -DCMAKE_BUILD_TYPE=Debug -DBUILD_FUZZERS=ON -DFUZZER_ENGINE=standalone
cmake --build build-fuzz --target binary_input_fuzz -j
./build-fuzz/bin/binary_input_fuzz 100000

# カバレッジ誘導型 libFuzzer。libFuzzer を含む Clang ツールチェーンを使用します。
cmake -S . -B build-libfuzzer -DCMAKE_BUILD_TYPE=Debug -DBUILD_FUZZERS=ON -DFUZZER_ENGINE=libfuzzer
cmake --build build-libfuzzer --target binary_input_fuzz -j
./build-libfuzzer/bin/binary_input_fuzz -runs=100000
```

## トラブルシューティング

### "clangd: Unable to find compile_commands.json"

**解決策:** 最初にプロジェクトをビルドするため `make` を実行。

### "clang-tidy: error while loading shared libraries"

**解決策:** clang-tidy バージョン 18 をインストール：

```bash
# macOS
brew install llvm@18
ln -sf "$(brew --prefix llvm@18)/bin/clang-tidy" "$(brew --prefix)/bin/clang-tidy"

# Linux
wget https://apt.llvm.org/llvm.sh
chmod +x llvm.sh
sudo ./llvm.sh 18
sudo apt-get install -y clang-tidy-18
sudo update-alternatives --install /usr/bin/clang-tidy clang-tidy /usr/bin/clang-tidy-18 100
```

### "Many errors in VS Code after opening project"

**解決策:**
1. プロジェクトがビルドされていることを確認: `make`
2. `build/compile_commands.json` が存在することを確認
3. VS Code ウィンドウをリロード: Cmd/Ctrl + Shift + P → "Developer: Reload Window"

### "clang-format not working"

**解決策:** clang-format バージョン 18 をインストール：

```bash
# macOS
brew install llvm@18
ln -sf "$(brew --prefix llvm@18)/bin/clang-format" "$(brew --prefix)/bin/clang-format"

# Linux
wget https://apt.llvm.org/llvm.sh
chmod +x llvm.sh
sudo ./llvm.sh 18
sudo apt-get install -y clang-format-18
sudo update-alternatives --install /usr/bin/clang-format clang-format /usr/bin/clang-format-18 100
```

バージョンを確認：

```bash
clang-format --version  # 18.x.x であることを確認
```

## クイックスタートチェックリスト

- [ ] cmake をインストール
- [ ] LLVM 18（clang-format-18、clang-tidy-18、clangd-18）をインストール
- [ ] clang-format --version で 18.x.x が表示されることを確認
- [ ] MySQL クライアントライブラリをインストール
- [ ] ICU ライブラリをインストール
- [ ] `make` を実行してプロジェクトをビルド
- [ ] `build/compile_commands.json` が存在することを確認
- [ ] VS Code エクステンションをインストール（C/C++、CMake Tools、Error Lens）
- [ ] `.vscode/settings.json` で clang-tidy を有効化
- [ ] VS Code ウィンドウをリロード

## 次のステップ

セットアップが完了したら：

1. 任意の `.cpp` または `.h` ファイルを開く
2. 小さな変更を加える（例: スペースを追加）
3. ファイルを保存 → 自動フォーマットが動作するはず
4. スタイルガイドに違反するコードを追加してみる → 警告が表示されるはず

## 開発の優先順位

機能を実装したり変更を加えたりする場合、以下の順序で優先順位を付けます：

1. **パフォーマンス**: 速度と低レイテンシを最適化
2. **メモリ効率**: メモリ使用量を抑える
3. **保守性**: クリーンでテスト可能なコードを書く

## Linux CI テスト（macOS開発者向け）

Linux 固有のヘッダやコンパイラの問題を確認するには、Docker の Ubuntu 22.04 環境を使います。GitHub Actions の `ubuntu-latest` と同一の OS・ビルド設定ではありません。ネイティブビルドと `build/` を共有しない別の作業コピーで実行してください。

```bash
make docker-ci-check
```

フォーマット、ビルド、clang-tidy、既定のテストを順に実行します。`SLOW` と `LOAD` は除外されます。全テストは `make test-all`、実データベースとの検証は E2E スイートで実行します。CI の実際の構成は [ワークフロー](https://github.com/libraz/mygram-db/blob/main/.github/workflows/ci.yml)、作業コピーの分離方法と個別コマンドは [Linux テストガイド](/ja/docs/linux-testing)を参照してください。
