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

::: warning C/C++ クライアントの再ビルド
共有ライブラリの soname は 2（`VERSION 2.0.0`）です。公開検索式構造体のレイアウトが変わったため、現在のヘッダーで C/C++ プログラムを再ビルドしてリンクし直してください。
:::

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

リテラル検索語、`and_terms`、`not_terms`、フィルター値、ハイライトタグには同じワイヤー引用規則が適用されます。空の値、`AND`、`OR`、`NOT`、`ORDER` などの句キーワード、全角・ノーブレークスペースを含む Unicode 空白、引用符、バックスラッシュ、括弧は、1つの値として届くように引用・エスケープされます。`query_mode = QueryMode::kBoolean` や `SearchRaw` に渡す検索文は式としてそのまま送られるため、Web構文から組み立てる場合は `ConvertSearchExpression()` を使ってください。

テーブル名、カラム名、フィルタキー、`SetVariable` に渡す名前には Unicode 空白を含められません。クライアントは送信前にこうした識別子を拒否します。

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
`MygramClient` は単一TCP接続上の同時コマンドを直列化するため、正しさの面では安全に共有できます。ただし1インスタンスでは1件ずつ実行します。スループットが必要な場合は複数インスタンスを使ってください。
:::

::: info 接続の考え方
短いリクエストごとに接続を作り直すより、ワーカーやスレッドごとにクライアントを保持して再利用する方が効率的です。接続断やタイムアウト時は、新しい `MygramClient` を作り直して再接続してください。

`ClientConfig::host` には IPv4/IPv6 リテラル（例: `"::1"`）と、IPv6だけに解決されるホスト名を指定できます。`Connect()` はシステムの名前解決が返すアドレスを順に試します。送信中に相手から接続をリセットされた場合、`SendCommand()` は型付きエラーを返してソケットを切断します。新しいクライアントを作成してから再試行してください。レスポンスはプロトコルが完了を示すまで蓄積されるため、`recv_buffer_size` が小さくても、ハイライト検索、DEBUG出力、`SHOW VARIABLES` などの複数行レスポンスが途中で切れません。
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

`Facet` は値の1ページを `facets` に返します。各 facet の `count` はその値を持つドキュメント数、`total_count` は `offset` と `limit` の適用前にある異なる値の総数です。`facets.size()` で返されたページの件数を取り、`total_count` でページネーションを計算できます。

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

管理操作の認証が必要なのは、サーバーの `api.admin_token` が空でない場合だけです。C++ の `ClientConfig` に管理トークンのフィールドはありません。その場合は同じ `MygramClient` で `AUTH` を送り、正確に `OK AUTHENTICATED` が返ったことを確認してから `GetConfig`/`CONFIG`、`SetVariable`、`ShowVariables`、`Cache*`、`Optimize`、`Sync*`、`Dump*`、`Save`、`Load`、レプリケーション、`EnableDebug`/`DisableDebug` を呼び出してください。rawコマンドの送信成功は、レスポンスを受信したことだけを意味します。手動で送った `AUTH` は現在の接続にだけ適用されるため、再接続後にもう一度認証してください。検索、count、get、facet 操作には認証は不要です。

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
// 現在のフィールドは required_terms、excluded_terms、raw_expression、
// required_is_group、excluded_is_group です。
// グループフラグの配列は各語句の配列と対応し、true は括弧付きグループを示します。
// この式では required_is_group が [false, true]、excluded_is_group が [false] です。
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
| `order` | `"order"` | リテラル語。予約された句キーワードは引用されます |
| `go or rust` | `(go OR rust)` | 単独の `OR` は大文字小文字を区別せず認識されます |
| `owner's draft` | `"owner's draft"` | アポストロフィを含む値は1つの引用されたワイヤートークンになります |
| `"深層学習" チュートリアル` | `"深層学習" AND チュートリアル` | フレーズと語句 |
| `golang +(tutorial OR guide)` | `golang AND (tutorial OR guide)` | 「golang」AND（「tutorial」OR「guide」） |
| `(tutorial -video)` | `(tutorial NOT video)` | グループ内のマイナスは `NOT` になります |
| `AI machine -learning` | `AI AND machine AND NOT learning` | 「AI」と「machine」を含み、「learning」を除外 |
| `機械学習　チュートリアル` | `機械学習 AND チュートリアル` | 全角スペース区切り。SDKから出力する値は必要に応じて引用されます |
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

`SimplifySearchExpression()` は `OR` または括弧によるグループ化を含む式に対して、型付きの `kClientExpressionParseError` エラーを返します。構造化フィールドではこれらの形式を表現できないためです。単純な語句と引用フレーズはプレーンな値として保持され、構造化検索メソッドがコマンド作成時に1回だけ引用します。フレーズ、ORグループ、グループ化を意味どおりに扱う場合は、`ConvertSearchExpression()` の結果を `SearchRaw()` に渡してください。

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

管理操作の認証が必要なのは、サーバーの `api.admin_token` が空でない場合だけです。`MygramClientConfig_C` と `MygramClientConfigV2_C` に管理トークンのフィールドはありません。その場合は管理操作の前に、接続済みの同じ `MygramClient_C` で `mygramclient_send_command` を使って `AUTH` を送り、正確に `OK AUTHENTICATED` が返ったことを確認してください。`0` の戻り値はrawレスポンスを受信したことだけを意味し、最後のエラーもクリアします。`mygramclient_get_last_error` は戻り値が0以外の場合にだけ使用してください。手動で送った `AUTH` は現在の接続にだけ適用されるため、再接続後にもう一度認証してください。これは `GetConfig`/`CONFIG`、`SetVariable`、`ShowVariables`、`Cache*`、`Optimize`、`Sync*`、`Dump*`、`Save`、`Load`、レプリケーション、`EnableDebug`/`DisableDebug` に対応するC APIに適用され、検索、count、get、facet 操作には不要です。レスポンスは `mygramclient_free_string` で解放し、トークンやコマンドをログに出力しないでください。

C APIのリテラル検索語、AND/NOT条件、フィルター値、ハイライトタグにも同じ引用規則が適用されます。接続リセット後の送信失敗は0以外のステータスを返すため、`mygramclient_get_last_error` を確認して再接続してから再試行してください。

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

`MygramSearchOptions_C` の `sort_desc` は、0以上なら降順、負数なら昇順です。そのため、型付き構造体をゼロ初期化すると既定の降順になります。旧 `mygramclient_search_advanced()` 関数の `sort_desc` 引数は別の規則で、0が昇順、0以外が降順です。

新しいCプログラムでは `MygramClientConfigV2_C` を使います。`timeout_ms` は通常操作の期限です。`connect_timeout_ms` は接続の期限で、0なら `timeout_ms` を使います。`max_response_bytes` はレスポンスフレームの上限で、0なら64 MiBが既定です。`dump_*_timeout_ms` と `optimize_timeout_ms` は操作別の期限で、0または古い構造体にない場合はクライアントの既定値を使います。`unix_socket_path` を設定するとUnixソケットを使い、TCPのhost/portより優先されます。

`MygramClientConfigV2_C` と `MygramSearchOptions_C` は同じ共有ライブラリ ABI メジャー内で末尾追加できるサイズ認識構造体です。呼び出し側が把握しているサイズを `struct_size` に設定してください。ライブラリは後ろのフィールドを無視し、既定値を使います。V2設定では `version` に `MYGRAMCLIENT_CONFIG_V2_VERSION` も設定します。従来の `MygramClientConfig_C` と `mygramclient_create()` は旧APIとして引き続き利用できます。

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

### Cの解析済み検索式のフィールド

`MygramParsedExpression_C` は `main_term`、`and_count` 個の `and_terms`、`not_count` 個の `not_terms` を持ちます。削除された `optional_terms` と `optional_count` のフィールドはありません。OR やグループ化を含む式には変換 API を使ってください。

```c
typedef struct {
    char* main_term;
    char** and_terms;
    size_t and_count;
    char** not_terms;
    size_t not_count;
} MygramParsedExpression_C;
```

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

- `results` - 現在の `LIMIT`/`OFFSET` ページに含まれるSearchResultのベクター
- `total_count` - ページング前のマッチしたドキュメント総数。サーバーはページと同じ1回のインデックス読み取りから求めます
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

`MygramClient` の接続操作とコマンドは同じmutexで直列化されます。`Disconnect()` は実行中のコマンドが終わるまで待ち、コマンドをキャンセルしません。メンバー関数の実行中にオブジェクトを破棄またはムーブしてはいけません。C API も接続操作とコマンドを直列化しますが、`mygramclient_destroy()` を同じハンドルへの別の呼び出しと並行させてはいけません。

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
