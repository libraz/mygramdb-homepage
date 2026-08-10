---
title: libmygramclient - MygramDB C/C++ クライアントライブラリ
description: libmygramclientはMygramDBに同梱されるインストール可能なC/C++クライアントSDKです。CMakeとpkg-configの統合、C++17とCのAPI、型付きエラー、検索式ヘルパーを提供します。
head:
  - - meta
    - name: keywords
      content: libmygramclient, MygramDB クライアントライブラリ, C++ API, C API, node-gyp バインディング, 検索式パーサー, MygramClient
---

# libmygramclient - MygramDB クライアントライブラリ

## 概要

libmygramclientは、MygramDBに同梱されるC/C++クライアントSDKです。TCPプロトコルでMygramDBに接続してクエリを実行します。C++17 APIと、ネイティブ統合や言語バインディング向けのC APIを提供します。MygramDBをインストールすると、ヘッダー、ライブラリ、CMakeパッケージ、pkg-configメタデータも一緒に入ります。

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

これにより `libmygramclient.a` と、プラットフォーム向けの共有ライブラリが作成されます。CMakeでは `MygramDB::client_static` と `MygramDB::client_shared` として公開されます。

## インストール

```bash
sudo make install
```

ヘッダーは `<prefix>/include/mygramdb` に、ライブラリは `<prefix>/lib`（またはプラットフォームのライブラリディレクトリ）にインストールされます。さらに `MygramDBClient` CMakeパッケージと `mygramclient.pc` も入ります。標準外の場所へインストールした場合は、ビルドツールのprefixまたは `PKG_CONFIG_PATH` を設定してください。

## C++ API

### 基本的な使い方

```cpp
#include <mygramdb/mygramclient.h>
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

### インストール済みSDKを使う

```cmake
cmake_minimum_required(VERSION 3.15)
project(myapp LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
find_package(MygramDBClient CONFIG REQUIRED)

add_executable(myapp myapp.cpp)
target_link_libraries(myapp PRIVATE MygramDB::client_static)
```

必要ならインストール先を指定してビルドします。

```bash
cmake -S . -B build -DCMAKE_PREFIX_PATH=/path/to/mygramdb-prefix
cmake --build build
```

共有ライブラリへリンクする場合は `MygramDB::client_shared` を使います。CまたはC++のビルドシステムでpkg-configを使う場合、`mygramclient` がインクルードディレクトリ、ライブラリ、privateなスレッド依存を設定します。

```bash
cc -std=c11 myapp.c $(pkg-config --cflags --libs mygramclient) -o myapp
```

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
options.offset = 20;
options.sort_column = "created_at";
options.sort_desc = true;
options.filters = {{"status", FilterOp::kEqual, "active"}};
options.fuzzy_distance = 1;
options.highlight = HighlightOptions{"<strong>", "</strong>", 200, 3};
options.query_mode = QueryMode::kBoolean;

auto result = client.Search("app_db.articles", "technology OR programming", options);
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

### FACETのページネーション

`Facet` は値の1ページを `facets` に返します。`total_count` は `offset` と `limit` を適用する前の異なるfacet値の総数なので、ページネーションの表示に使えます。

```cpp
auto response = client.Facet("app_db.articles", "category", "technology", 10,
                             {}, {}, {}, 20);
if (response) {
    std::cout << response->total_count << "件の異なるカテゴリ\n";
    for (const auto& facet : response->facets) {
        std::cout << facet.value << ": " << facet.count << "\n";
    }
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

### 管理操作の認証

v1.10 では、管理操作の認証は接続単位です。`ClientConfig` に `admin_token` フィールドはありません。接続後、同じ `MygramClient` で `AUTH` を送信し、正確に `OK AUTHENTICATED` が返ったことを確認してから `GetConfig`/`CONFIG`、`SetVariable`、`ShowVariables`、`Cache*`、`Optimize`、`Sync*`、`Dump*`、`Save`、`Load`、レプリケーション、`EnableDebug`/`DisableDebug` を呼び出してください。rawコマンドの送信成功は、レスポンスを受信したことだけを意味します。再接続後は毎回認証し直します。検索、count、get、facet 操作にはこの認証は不要です。

```cpp
#include <cstdlib>
#include <iostream>
#include <string>

const char* token = std::getenv("MYGRAM_API_ADMIN_TOKEN");
if (token == nullptr) {
    std::cerr << "MYGRAM_API_ADMIN_TOKEN が設定されていません\n";
    return 1;
}

auto auth = client.SendCommand(std::string("AUTH ") + token);
if (!auth) {
    std::cerr << "管理操作の認証リクエストに失敗: " << auth.error().message() << "\n";
    return 1;
}
if (*auth != "OK AUTHENTICATED") {
    std::cerr << "管理操作の認証が拒否されました\n";
    return 1;
}
// トークンや AUTH コマンドをログに出力しないでください。
auto optimized = client.Optimize("app_db.articles");
```

### デバッグモード

デバッグモードは管理操作です。この例では、直前のセクションと同じ `client` で認証済みであることを前提にしています。

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
        .dump_save_timeout_ms = 600000,
        .max_response_bytes = 64ULL * 1024ULL * 1024ULL,
        .connect_timeout_ms = 1000
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
cc -std=c11 myapp.c $(pkg-config --cflags --libs mygramclient) -o myapp
```

### 管理操作の認証

v1.10 では、管理操作の認証は接続済みの `MygramClient_C` ごとに必要です。管理操作の前に `mygramclient_send_command` で `AUTH` を送信し、正確に `OK AUTHENTICATED` が返ったことを確認してください。`0` の戻り値はrawレスポンスを受信したことだけを意味し、最後のエラーもクリアします。`mygramclient_get_last_error` は戻り値が0以外の場合にだけ使用してください。再接続後も繰り返してください。これは `GetConfig`/`CONFIG`、`SetVariable`、`ShowVariables`、`Cache*`、`Optimize`、`Sync*`、`Dump*`、`Save`、`Load`、レプリケーション、`EnableDebug`/`DisableDebug` に対応するC APIに適用され、検索、count、get、facet 操作には不要です。レスポンスは `mygramclient_free_string` で解放し、トークンやコマンドをログに出力しないでください。

```c
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

const char* token = getenv("MYGRAM_API_ADMIN_TOKEN");
if (token == NULL) {
    fprintf(stderr, "MYGRAM_API_ADMIN_TOKEN が設定されていません\n");
    return 1;
}
char* auth_command = malloc(strlen("AUTH ") + strlen(token) + 1);
char* response = NULL;
if (auth_command == NULL) return 1;
sprintf(auth_command, "AUTH %s", token);
int rc = mygramclient_send_command(client, auth_command, &response);
free(auth_command);
if (rc != 0) {
    mygramclient_free_string(response);
    fprintf(stderr, "管理操作の認証リクエストに失敗: %s\n",
            mygramclient_get_last_error(client));
    return 1;
}
int authenticated = response != NULL && strcmp(response, "OK AUTHENTICATED") == 0;
mygramclient_free_string(response);
if (!authenticated) {
    fprintf(stderr, "管理操作の認証が拒否されました\n");
    return 1;
}
```

### 高度な検索（C API）

新しいコードでは `MygramSearchOptions_C` と `mygramclient_search_with_options` を使ってください。構造体はゼロ初期化し、`struct_size` を設定します。型付きフィルタは `=`、`!=`、`>`、`>=`、`<`、`<=`、`fuzzy_distance` は `1` または `2` を使えます。Boolean式をリテラル検索ではなくそのまま送るには、`query_mode` を `MYGRAM_QUERY_BOOLEAN` にします。

新しいCプログラムでは `MygramClientConfigV2_C` を使います。`timeout_ms` は通常操作の期限です。`connect_timeout_ms` は接続の期限で、0なら `timeout_ms` を使います。`max_response_bytes` はレスポンスフレームの上限で、0なら64 MiBが既定です。`dump_*_timeout_ms` と `optimize_timeout_ms` は操作別の期限で、0または古い構造体にない場合はクライアントの既定値を使います。`unix_socket_path` を設定するとUnixソケットを使い、TCPのhost/portより優先されます。

`MygramClientConfigV2_C` と `MygramSearchOptions_C` は末尾追加を前提にしたサイズ認識構造体です。呼び出し側が知っているサイズを `struct_size` に設定してください。ライブラリは後ろのフィールドを無視して既定値を使うので、古いバイナリも新しいライブラリを安全に利用できます。V2設定では `version` に `MYGRAMCLIENT_CONFIG_V2_VERSION` も設定します。従来の `MygramClientConfig_C` と `mygramclient_create()` はABI互換のために残っています。

```c
MygramFilter_C filters[] = {
    {.key = "status", .op = MYGRAM_FILTER_EQ, .value = "active"},
};
MygramSearchOptions_C options = {0};
options.struct_size = sizeof(options);
options.limit = 50;
options.offset = 20;
options.filters = filters;
options.filter_count = 1;
options.query_mode = MYGRAM_QUERY_BOOLEAN;

MygramSearchResultWithHighlights_C* result = NULL;
if (mygramclient_search_with_options(client, "app_db.articles",
        "technology OR programming", &options, &result) == 0) {
    mygramclient_free_search_result_with_highlights(result);
}
```

FACETのページには `mygramclient_facet_paged(client, table, column, query, limit, offset, &result)` を使います。`result->total_count` はページネーション前の異なる値の総数です。結果は `mygramclient_free_facet_result` で解放してください。

### Cの検索式診断

Cのパーサーと変換関数には、利用者へエラーを表示したい場合の `_ex` 版があります。出力ポインターは最初に `NULL` へ初期化されます。失敗時は可能な場合に `diagnostic` へ確保済みのメッセージが入ります。返された文字列はすべて `mygramclient_free_string` で解放してください。

```c
MygramParsedExpression_C* parsed = NULL;
char* diagnostic = NULL;
if (mygramclient_parse_search_expression_ex("+", &parsed, &diagnostic) != 0) {
    fprintf(stderr, "%s\n", diagnostic ? diagnostic : "invalid expression");
}
mygramclient_free_parsed_expression(parsed);
mygramclient_free_string(diagnostic);

char* raw_query = NULL;
diagnostic = NULL;
if (mygramclient_convert_search_expression_ex("go OR rust", &raw_query,
                                               &diagnostic) == 0) {
    /* raw_queryはmygramclient_search_raw()へ渡せます。 */
}
mygramclient_free_string(raw_query);
mygramclient_free_string(diagnostic);
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
- `timeout_ms` - 通常操作のタイムアウト（デフォルト: 5000）
- `connect_timeout_ms` - 接続タイムアウト。`0`なら `timeout_ms` を使用
- `recv_buffer_size` - 受信バッファサイズ（デフォルト: 65536）
- `max_response_bytes` - 最大レスポンスフレーム。`0`なら64 MiBを使用
- `unix_socket_path` - Unixソケットのパス。設定時はTCPより優先
- `dump_save_timeout_ms`、`dump_load_timeout_ms`、`dump_verify_timeout_ms`、`optimize_timeout_ms` - 操作別の期限。`0`なら `timeout_ms` を使用

#### SearchResponse

- `results` - SearchResultのベクター
- `total_count` - マッチしたドキュメントの総数
- `debug` - オプションのデバッグ情報

#### Error

- `code()` - 型付きの `mygram::utils::ErrorCode`。クライアントエラーは7000番台
- `message()` と `context()` - エラーテキストと任意のコンテキスト
- `to_string()` - 数値コードを含む整形済みエラーテキスト

サーバーが `ERROR <code> ...` を返した場合、数値コードを解析できれば型付きエラーに保持します。数値トークンがない応答は `kClientServerError` として扱います。

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
    const auto& error = result.error();
    std::cerr << error.to_string() << "\n";
    if (error.code() == mygram::utils::ErrorCode::kClientTimeout) {
        // アプリケーションの再接続またはリトライ方針を適用します。
    }
} else {
    const auto& resp = *result;
    // respを使用
}
```

### C API

関数は成功時に `0`、エラー時に `-1` を返します。メッセージは `mygramclient_get_last_error()`、数値のMygramDBエラーコードは `mygramclient_get_last_error_code()` で取得します。成功した操作は最後のエラー状態をクリアします。

## ライセンス

MITライセンス（[LICENSE](https://github.com/libraz/mygram-db/blob/main/LICENSE)ファイル参照）

## 関連項目

- [プロトコルリファレンス](/ja/docs/protocol) - TCPコマンドリファレンス
- [クエリ構文ガイド](/ja/docs/query-syntax) - 検索クエリ文法
- [HTTP APIガイド](/ja/docs/http-api) - RESTful JSON API
