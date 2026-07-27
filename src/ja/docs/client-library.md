---
title: libmygramclient - MygramDB C/C++ クライアントライブラリ
description: libmygramclientはMygramDB用のC/C++クライアントライブラリ。C++17 API、バインディング用のC API、検索式パーサー、Node.js node-gypの例、スレッド安全性、エラー処理。
head:
  - - meta
    - name: keywords
      content: libmygramclient, MygramDB クライアントライブラリ, C++ API, C API, node-gyp バインディング, 検索式パーサー, MygramClient
---

# libmygramclient - MygramDB クライアントライブラリ

## 概要

libmygramclientは、MygramDBサーバーに接続してクエリを実行するためのC/C++クライアントライブラリです。C++17 APIと、node-gypなどの言語バインディングから呼びやすいC APIの両方を提供します。

::: info 読み始める前に
このライブラリはMygramDBのTCPプロトコルを扱う薄いクライアントです。検索の文法や結果の意味はサーバー側と同じなので、クエリの詳細は[クエリ構文ガイド](/ja/docs/query-syntax)も併せて参照してください。
:::

## 機能

- MygramDBの主要なTCPプロトコルコマンドに対応
- RAIIと型安全性を備えたC++17 API
- 他の言語との統合が容易なC API
- 単一接続を明示的に管理する軽量なクライアント設計
- 静的ライブラリと共有ライブラリの両方をビルド
- 4バイトUTF-8文字を含むUnicode文字列に対応

::: info 用語補足
**RAII** はC++の設計パターンで、オブジェクトの生成時に接続やメモリなどのリソースを確保し、破棄時に自動解放する考え方です。例外や早期returnがあっても後片付けを書き忘れにくくなります。
:::

## ビルド

ライブラリはMygramDBと一緒に自動的にビルドされます：

```bash
make
```

これにより以下が作成されます：

- `build/lib/libmygramclient.a` - 静的ライブラリ
- `build/lib/libmygramclient.dylib` (macOS) または `libmygramclient.so` (Linux) - 共有ライブラリ

## インストール

```bash
sudo make install
```

ヘッダーファイルは `/usr/local/include/mygramdb/` に、ライブラリは `/usr/local/lib/` にインストールされます。現在のC++ヘッダーはMygramDBコアのヘッダーにも依存するため、単独のSDKとしては使えません。C++アプリケーションはMygramDBのソースチェックアウトからビルドしてください。

## C++ API

### 基本的な使い方

```cpp
#include "client/mygramclient.h"
#include <iostream>

using namespace mygramdb::client;

int main() {
    // クライアント設定
    ClientConfig config;
    config.host = "localhost";
    config.port = 11016;
    config.timeout_ms = 5000;

    // クライアント作成
    MygramClient client(config);

    // 接続
    if (auto connected = client.Connect(); !connected) {
        std::cerr << "接続失敗: " << connected.error().message() << std::endl;
        return 1;
    }

    // 検索。複数DB構成では DB 修飾形式 <database>.<table> を使います。
    auto result = client.Search("app_db.articles", "hello world", 100);
    if (!result) {
        std::cerr << "検索失敗: " << result.error().message() << std::endl;
        return 1;
    }

    const auto& resp = *result;
    std::cout << resp.total_count << "件の結果を発見\n";
    for (const auto& doc : resp.results) {
        std::cout << "  - " << doc.primary_key << "\n";
    }

    return 0;
}
```

### libmygramclientを使ってコンパイル

```bash
g++ -std=c++17 -I./src -L./build/lib -o myapp myapp.cpp -lmygramclient
```

::: tip リンクで失敗する場合
`libmygramclient` を標準以外の場所にインストールした場合は、コンパイル時に `-I` と `-L`、実行時に `LD_LIBRARY_PATH`（Linux）または `DYLD_LIBRARY_PATH`（macOS）が必要になることがあります。
:::

### 高度な検索

```cpp
// AND、NOT、FILTERを使った検索
std::vector<std::string> and_terms = {"AI"};
std::vector<std::string> not_terms = {"old"};
std::vector<std::pair<std::string, std::string>> filters = {
    {"status", "active"},
    {"category", "tech"}
};

auto result = client.Search(
    "app_db.articles",    // DB 修飾テーブル名
    "technology",         // クエリ
    50,                   // 上限
    0,                    // オフセット
    and_terms,            // AND条件
    not_terms,            // NOT条件
    filters,              // フィルター
    "created_at",         // ソート列
    true                  // 降順
);
```

### 型付き検索オプション

比較フィルタ、ファジー検索、ハイライト、ソート、ページネーションが必要な場合は `SearchOptions` を使います。`SearchRaw` はアプリケーションが意図して組み立てたBoolean式だけに使ってください。

```cpp
SearchOptions options;
options.limit = 50;
options.sort_column = "created_at";
options.sort_desc = true;
options.filters = {{"status", FilterOp::kEqual, "active"}};
options.fuzzy_distance = 1;
options.highlight = HighlightOptions{"<strong>", "</strong>", 200, 3};

auto result = client.Search("app_db.articles", "technology", options);
if (!result) {
    std::cerr << result.error().message() << "\n";
}
```

::: warning 1接続あたりの並行性
`MygramClient` は単一TCP接続上の同時コマンドを内部で直列化するため、安全に共有できます。ただし1インスタンスでは1件ずつ実行されます。スループットが必要な場合は複数インスタンスを使ってください。リクエスト実行中に `Disconnect()` を呼ばないでください。
:::

::: info 接続の考え方
短いリクエストごとに接続を作り直すより、ワーカーやスレッドごとにクライアントを保持して再利用する方が効率的です。接続断やタイムアウト時は、新しい `MygramClient` を作り直して再接続してください。
:::

### COUNT クエリ

```cpp
auto result = client.Count("app_db.articles", "hello");
if (result) {
    std::cout << "合計マッチ数: " << result->count << "\n";
} else {
    std::cerr << "Count失敗: " << result.error().message() << "\n";
}
```

### ドキュメント取得

```cpp
auto result = client.Get("app_db.articles", "12345");
if (result) {
    std::cout << "プライマリキー: " << result->primary_key << "\n";
    for (const auto& [key, value] : result->fields) {
        std::cout << "  " << key << " = " << value << "\n";
    }
}
```

### サーバー情報

```cpp
auto result = client.Info();
if (result) {
    std::cout << "バージョン: " << result->version << "\n";
    std::cout << "ドキュメント数: " << result->doc_count << "\n";
    std::cout << "稼働時間: " << result->uptime_seconds << "秒\n";
}
```

### デバッグモード

```cpp
// デバッグモード有効化
client.EnableDebug();

auto result = client.Search("app_db.articles", "hello", 10);
if (result && result->debug) {
    std::cout << "クエリ時間: " << result->debug->query_time_ms << "ms\n";
    std::cout << "候補数: " << result->debug->candidates << "\n";
}

// デバッグモード無効化
client.DisableDebug();
```

### 検索式パーサー

ライブラリには、Googleライクな検索構文をMygramDBクエリ形式に変換する、Web検索スタイルの検索式パーサーが含まれています。

#### 構文

- `term1 term2` - スペース区切りで暗黙的AND（両方とも必ず含まれる）
- `"phrase"` - ダブルクォートでフレーズ検索（スペースを含む語句）
- `+term` - 明示的な必須語句（プレフィックスなしと同じ）
- `-term` - 除外語句（結果に含まれない）
- `term1 OR term2` - 語句間の論理OR
- `(expr)` - 括弧によるグループ化
- 全角スペース（`　`）も区切りとしてサポート（日本語テキストに便利）

#### 例

```cpp
#include <mygramdb/search_expression.h>

using namespace mygramdb::client;

auto parsed = ParseSearchExpression("\"ディープラーニング\" +(チュートリアル OR ガイド) -古い");
if (!parsed) {
    std::cerr << parsed.error().message() << "\n";
    return 1;
}

const auto& expr = *parsed;
// expr.required_terms には必須語句が入ります。
// expr.excluded_terms には "古い" が入ります。
```

#### クエリ文字列への変換

```cpp
// QueryAST互換の文字列に直接変換
auto result = ConvertSearchExpression("+golang -old");
if (result) {
    std::string query = *result;
    // query = "golang AND NOT old"

    // MygramClientで使用
    auto search_result = client.SearchRaw("app_db.articles", query, 100);
} else {
    std::cerr << result.error().message() << "\n";
}
```

#### 式の例

| 入力 | 出力クエリ | 説明 |
|-------|-------------|-------------|
| `golang tutorial` | `golang AND tutorial` | 暗黙的AND - 両方の語句が必須 |
| `"機械学習"` | `"機械学習"` | フレーズ検索 |
| `golang -old` | `golang AND NOT old` | 「golang」を含み、「old」を含まない |
| `python OR ruby` | `(python OR ruby)` | 「python」または「ruby」のいずれか |
| `"深層学習" チュートリアル` | `"深層学習" AND チュートリアル` | フレーズと語句 |
| `golang +(tutorial OR guide)` | `golang AND (tutorial OR guide)` | 「golang」AND（「tutorial」OR「guide」） |
| `AI machine -learning` | `AI AND machine AND NOT learning` | 「AI」と「machine」を含み、「learning」を除外 |
| `機械学習　チュートリアル` | `機械学習 AND チュートリアル` | 全角スペース区切り |
| `😀 tutorial -😢` | `😀 AND tutorial AND NOT 😢` | 絵文字検索（4バイトUTF-8） |

#### 簡易API（後方互換性）

OR/グループ化を使わない単純なユースケース向け：

```cpp
auto simplified = SimplifySearchExpression("+golang +tutorial -old");
if (simplified) {
    // simplified->main_term == "golang"
    // simplified->and_terms には "tutorial" が入る
    // simplified->not_terms には "old" が入る
}
```

**注意:** ORと括弧を含む複雑な式は、`SimplifySearchExpression()`を使用すると意味が失われます。

## C API

### 基本的な使い方

```c
#include <mygramdb/mygramclient_c.h>
#include <stdio.h>

int main() {
    // クライアント設定
    MygramClientConfigV2_C config = {
        .struct_size = sizeof(config),
        .version = MYGRAMCLIENT_CONFIG_V2_VERSION,
        .host = "localhost",
        .port = 11016,
        .timeout_ms = 5000,
        .recv_buffer_size = 65536,
        .unix_socket_path = NULL,
        .dump_save_timeout_ms = 600000
    };

    // クライアント作成
    MygramClient_C* client = mygramclient_create_v2(&config);
    if (!client) {
        fprintf(stderr, "クライアント作成失敗\n");
        return 1;
    }

    // 接続
    if (mygramclient_connect(client) != 0) {
        fprintf(stderr, "接続失敗: %s\n",
                mygramclient_get_last_error(client));
        mygramclient_destroy(client);
        return 1;
    }

    // 検索
    MygramSearchResult_C* result = NULL;
    if (mygramclient_search(client, "app_db.articles", "hello", 100, 0, &result) == 0) {
        printf("%llu件の結果を発見（%zu件表示）:\n",
               result->total_count, result->count);
        for (size_t i = 0; i < result->count; i++) {
            printf("  - %s\n", result->primary_keys[i]);
        }
        mygramclient_free_search_result(result);
    } else {
        fprintf(stderr, "検索失敗: %s\n",
                mygramclient_get_last_error(client));
    }

    // クリーンアップ
    mygramclient_disconnect(client);
    mygramclient_destroy(client);

    return 0;
}
```

### Cプログラムのコンパイル

```bash
gcc -o myapp myapp.c -lmygramclient
```

### 高度な検索（C API）

新しいコードでは `MygramSearchOptions_C` と `mygramclient_search_with_options` を使ってください。構造体はゼロ初期化し、`struct_size` を設定します。型付きフィルタは `=`、`!=`、`>`、`>=`、`<`、`<=`、`fuzzy_distance` は `1` または `2` を使えます。

新しいCプログラムでは `MygramClientConfigV2_C` を使います。`unix_socket_path` を設定するとUnixソケットを使い、TCPのhost/portより優先されます。`dump_save_timeout_ms` は非同期 `DUMP SAVE` を待つ合計期限です。従来の `MygramClientConfig_C` と `mygramclient_create()` はABI互換のままです。

```c
const char* and_terms[] = {"AI"};
const char* not_terms[] = {"old"};
const char* filter_keys[] = {"status", "category"};
const char* filter_values[] = {"active", "tech"};

MygramSearchResult_C* result = NULL;
int ret = mygramclient_search_advanced(
    client,
    "app_db.articles",    // DB 修飾テーブル名
    "technology",         // クエリ
    50,                   // 上限
    0,                    // オフセット
    and_terms, 1,         // AND条件
    not_terms, 1,         // NOT条件
    filter_keys, filter_values, 2,  // フィルター
    "created_at",         // ソート列
    1,                    // 降順
    &result
);

if (ret == 0) {
    // 結果を処理
    mygramclient_free_search_result(result);
}
```

## Node.jsバインディングの例

node-gypでC APIを使用：

```javascript
// binding.gyp
{
  "targets": [{
    "target_name": "mygramdb",
    "sources": [ "src/mygramdb_node.cpp" ],
    "include_dirs": [
      "/usr/local/include",
      "<!(node -p \"require('node-addon-api').include_dir\")"
    ],
    "libraries": [
      "-L/usr/local/lib",
      "-lmygramclient"
    ],
    "cflags!": [ "-fno-exceptions" ],
    "cflags_cc!": [ "-fno-exceptions" ],
    "defines": [ "NAPI_DISABLE_CPP_EXCEPTIONS" ]
  }]
}
```

```cpp
// src/mygramdb_node.cpp（簡略化した例）
#include <napi.h>
#include <mygramdb/mygramclient_c.h>

Napi::Value Search(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    // パラメータ取得
    std::string table = info[0].As<Napi::String>();
    std::string query = info[1].As<Napi::String>();
    uint32_t limit = info[2].As<Napi::Number>().Uint32Value();

    // クライアント作成と接続
    MygramClientConfig_C config{};
    config.host = "localhost";
    config.port = 11016;
    config.timeout_ms = 5000;
    config.recv_buffer_size = 65536;

    MygramClient_C* client = mygramclient_create(&config);
    if (mygramclient_connect(client) != 0) {
        Napi::Error::New(env, mygramclient_get_last_error(client)).ThrowAsJavaScriptException();
        mygramclient_destroy(client);
        return env.Null();
    }

    // 検索
    MygramSearchResult_C* result = NULL;
    if (mygramclient_search(client, table.c_str(), query.c_str(), limit, 0, &result) != 0) {
        Napi::Error::New(env, mygramclient_get_last_error(client)).ThrowAsJavaScriptException();
        mygramclient_destroy(client);
        return env.Null();
    }

    // JavaScript配列に変換
    Napi::Array jsResults = Napi::Array::New(env, result->count);
    for (size_t i = 0; i < result->count; i++) {
        jsResults[i] = Napi::String::New(env, result->primary_keys[i]);
    }

    // クリーンアップ
    mygramclient_free_search_result(result);
    mygramclient_disconnect(client);
    mygramclient_destroy(client);

    return jsResults;
}

Napi::Object Init(Napi::Env env, Napi::Object exports) {
    exports.Set("search", Napi::Function::New(env, Search));
    return exports;
}

NODE_API_MODULE(mygramdb, Init)
```

## APIリファレンス

### C++ APIクラス

#### ClientConfig

- `host` - サーバーホスト名（デフォルト: "127.0.0.1"）
- `port` - サーバーポート（デフォルト: 11016）
- `timeout_ms` - 接続タイムアウト（デフォルト: 5000）
- `recv_buffer_size` - 受信バッファサイズ（デフォルト: 65536）
- `unix_socket_path` - Unixソケットのパス。設定時はTCPより優先
- `dump_save_timeout_ms` - 非同期 `DUMP SAVE` のポーリング期限

#### SearchResponse

- `results` - SearchResultのベクター
- `total_count` - マッチしたドキュメントの総数
- `debug` - オプションのデバッグ情報

#### Error

- `message` - エラーメッセージ文字列

### C API関数

関数一覧と引数の詳細は `mygramclient_c.h` を参照してください。

主な関数：

- `mygramclient_create_v2()` - size/version付き設定でクライアントを作成
- `mygramclient_connect()` - サーバーに接続
- `mygramclient_search()` - シンプル検索
- `mygramclient_search_advanced()` - フィルター付き高度な検索
- `mygramclient_search_with_options()` - 型付きフィルタ、ファジー、ハイライト、ソート、ページネーション検索
- `mygramclient_count()` - マッチ数カウント
- `mygramclient_get()` - キーでドキュメント取得
- `mygramclient_free_*()` - 結果構造体の解放

## スレッド安全性

`MygramClient` は単一のTCP接続で同時コマンドを直列化します。そのため正しさのためには共有できますが、1インスタンスが実行できるのは1件ずつです。スループットが必要な場合は複数インスタンスを使ってください。リクエスト実行中に `Disconnect()` を呼ばないでください。

## エラー処理

### C++ API

関数は `mygram::utils::Expected<T, Error>` を返します。値を使う前に成功を確認してください。

```cpp
auto result = client.Search(...);
if (!result) {
    // エラー処理: result.error().message()
} else {
    const auto& resp = *result;
    // respを使用
}
```

### C API

関数は成功時に0、エラー時に-1を返します。エラーメッセージの取得には `mygramclient_get_last_error()` を使用してください。

## ライセンス

MITライセンス（[LICENSE](https://github.com/libraz/mygram-db/blob/main/LICENSE)ファイル参照）

## 関連項目

- [プロトコルリファレンス](/ja/docs/protocol) - TCPコマンドリファレンス
- [クエリ構文ガイド](/ja/docs/query-syntax) - 検索クエリ文法
- [HTTP APIガイド](/ja/docs/http-api) - RESTful JSON API
