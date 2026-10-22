---
title: libmygramclient - MygramDB C/C++ Client Library
description: libmygramclient is the installable C/C++ client SDK bundled with MygramDB. It provides CMake and pkg-config integration, C++17 and C APIs, typed errors, and search-expression helpers.
head:
  - - meta
    - name: keywords
      content: libmygramclient, MygramDB client library, C++ API, C API, node-gyp bindings, search expression parser, MygramClient
---

# libmygramclient - MygramDB Client Library

## Overview

libmygramclient is the C/C++ client SDK bundled with MygramDB. It connects to and queries MygramDB over its TCP protocol, and provides a C++17 API plus a C API for native integrations and language bindings. Installing MygramDB installs the headers, libraries, CMake package, and pkg-config metadata together.

::: info Before you start
This library is a thin client for the MygramDB TCP protocol. Query grammar and result semantics are identical to the server side, so read the [Query Syntax Guide](/docs/query-syntax) alongside this page.
:::

## Features

::: info What is RAII?
**RAII** is a C++ pattern where a resource — a connection, memory — is acquired when an object is constructed and released automatically when it is destroyed. It makes cleanup hard to forget, even with exceptions or early returns.
:::

- Full support for all MygramDB protocol commands
- Modern C++17 API with RAII and type safety
- C API for easy integration with other languages
- Thread-safe connection management
- Both static and shared library builds
- Full Unicode support including 4-byte UTF-8 characters (emojis: 😀🎉👍)

## Building

The library is built automatically with MygramDB:

```bash
make
```

This creates both `libmygramclient.a` and the platform shared library. CMake exposes them as `MygramDB::client_static` and `MygramDB::client_shared`.

## Installation

```bash
sudo make install
```

This installs headers under `<prefix>/include/mygramdb`, libraries under `<prefix>/lib` (or the platform library directory), a `MygramDBClient` CMake package, and `mygramclient.pc`. Set your build tool's prefix or `PKG_CONFIG_PATH` when installing to a non-default location.

::: warning Rebuild native clients
The shared library uses soname 2 (`VERSION 2.0.0`). Rebuild and relink C/C++ programs against the current headers because public search-expression structures changed layout.
:::

## C++ API

### Basic Usage

```cpp
#include <mygramdb/mygramclient.h>
#include <iostream>

using namespace mygramdb::client;

int main() {
    // Configure client
    ClientConfig config;
    config.host = "localhost";
    config.port = 11016;
    config.timeout_ms = 5000;

    // Create client
    MygramClient client(config);

    // Connect
    if (auto connected = client.Connect(); !connected) {
        std::cerr << "Connection failed: " << connected.error().message() << std::endl;
        return 1;
    }

    // Use a bare table name on a single-database server; otherwise qualify it.
    auto result = client.Search("app_db.articles", "hello world", 100);
    if (!result) {
        std::cerr << "Search failed: " << result.error().message() << std::endl;
        return 1;
    }

    const auto& resp = *result;
    std::cout << "Found " << resp.total_count << " results\n";
    for (const auto& doc : resp.results) {
        std::cout << "  - " << doc.primary_key << "\n";
    }

    return 0;
}
```

### Consume the installed SDK

::: tip If linking fails
When `libmygramclient` is installed outside the standard prefixes, you may need `-I` and `-L` at compile time and `LD_LIBRARY_PATH` (Linux) or `DYLD_LIBRARY_PATH` (macOS) at run time.
:::

```cmake
cmake_minimum_required(VERSION 3.15)
project(myapp LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
find_package(MygramDBClient CONFIG REQUIRED)

add_executable(myapp myapp.cpp)
target_link_libraries(myapp PRIVATE MygramDB::client_static)
```

Build it with the installation prefix when required:

```bash
cmake -S . -B build -DCMAKE_PREFIX_PATH=/path/to/mygramdb-prefix
cmake --build build
```

Use `MygramDB::client_shared` when the application must link to the shared library. For a C or C++ build system that uses pkg-config, `mygramclient` supplies the include directory, library, and private thread dependency:

```bash
cc -std=c11 myapp.c $(pkg-config --cflags --libs mygramclient) -o myapp
```

### Advanced Search

```cpp
// Search with AND, NOT, and FILTER
std::vector<std::string> and_terms = {"AI"};
std::vector<std::string> not_terms = {"old"};
std::vector<std::pair<std::string, std::string>> filters = {
    {"status", "active"},
    {"category", "tech"}
};

auto result = client.Search(
    "app_db.articles",    // database-qualified table
    "technology",         // query
    50,                   // limit
    0,                    // offset
    and_terms,            // AND terms
    not_terms,            // NOT terms
    filters,              // filters
    "created_at",         // order by column
    true                  // descending
);
```

Literal search text, `and_terms`, `not_terms`, filter values, and highlight tags use one wire-quoting rule. Empty values, clause keywords such as `AND`, `OR`, `NOT`, and `ORDER`, Unicode whitespace (including full-width and no-break spaces), quotes, backslashes, and parentheses are quoted and escaped so they arrive as one value. Boolean query text passed with `query_mode = QueryMode::kBoolean` or to `SearchRaw` is an expression and is sent as written; use `ConvertSearchExpression()` when constructing it from web syntax.

Table names, column names, filter keys, and names passed to `SetVariable` must not contain Unicode whitespace. The client rejects such identifiers before sending the command.

### Typed Search Options

Use `SearchOptions` when a query needs comparison filters, fuzzy matching, highlighting, sorting, or pagination. Use `SearchRaw` only for a boolean expression you construct deliberately.

::: warning Concurrency per connection
`MygramClient` serializes concurrent commands on its single TCP connection, so it is safe to share for correctness; one instance still executes one request at a time. Use several instances when you need throughput.
:::

::: info Thinking about connections
Holding one client per worker or thread and reusing it beats reconnecting for every short request. After a disconnect or timeout, construct a fresh `MygramClient` and reconnect.

`ClientConfig::host` accepts an IPv4 or IPv6 literal (for example, `"::1"`) and hostnames that resolve only to IPv6. `Connect()` tries the addresses returned by the system resolver. If a peer resets the connection while a command is being sent, `SendCommand()` returns a typed error and disconnects the socket; create a fresh client before retrying. Responses are accumulated until the protocol marks them complete, so a small `recv_buffer_size` does not truncate multi-line responses such as highlighted searches, DEBUG output, or `SHOW VARIABLES`.
:::

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

### Count Query

```cpp
auto result = client.Count("app_db.articles", "hello");
if (result) {
    std::cout << "Total matches: " << result->count << "\n";
} else {
    std::cerr << "Count failed: " << result.error().message() << "\n";
}
```

### Facet pagination

`Facet` returns one page of values in `facets`. Each facet's `count` is the number of documents with that value; `total_count` is the number of distinct facet values before `offset` and `limit`. Use `facets.size()` for the returned page size and `total_count` to calculate pagination.

```cpp
auto response = client.Facet("app_db.articles", "category", "technology", 10,
                             {}, {}, {}, 20);
if (response) {
    std::cout << response->total_count << " distinct categories\n";
    for (const auto& facet : response->facets) {
        std::cout << facet.value << ": " << facet.count << "\n";
    }
}
```

### Get Document

```cpp
auto result = client.Get("app_db.articles", "12345");
if (result) {
    std::cout << "Primary key: " << result->primary_key << "\n";
    for (const auto& [key, value] : result->fields) {
        std::cout << "  " << key << " = " << value << "\n";
    }
}
```

### Server Info

```cpp
auto result = client.Info();
if (result) {
    std::cout << "Version: " << result->version << "\n";
    std::cout << "Documents: " << result->doc_count << "\n";
    std::cout << "Uptime: " << result->uptime_seconds << "s\n";
}
```

### Administrative authentication

Administrative authentication is required only when the server has a non-empty `api.admin_token`. The C++ `ClientConfig` has no admin-token field, so send `AUTH` on that same `MygramClient` and require the exact `OK AUTHENTICATED` response before `GetConfig`/`CONFIG`, `SetVariable`, `ShowVariables`, `Cache*`, `Optimize`, `Sync*`, `Dump*`, `Save`, `Load`, replication, or `EnableDebug`/`DisableDebug`. A successful raw send only means a response was received. A manually sent `AUTH` applies to the current connection; authenticate again after reconnecting. Search, count, get, and facet operations do not require authentication.

```cpp
#include <cstdlib>
#include <iostream>
#include <string>

const char* token = std::getenv("MYGRAM_API_ADMIN_TOKEN");
if (token == nullptr) {
    std::cerr << "MYGRAM_API_ADMIN_TOKEN is not set\n";
    return 1;
}

auto auth = client.SendCommand(std::string("AUTH ") + token);
if (!auth) {
    std::cerr << "Admin authentication request failed: " << auth.error().message() << "\n";
    return 1;
}
if (*auth != "OK AUTHENTICATED") {
    std::cerr << "Admin authentication was rejected\n";
    return 1;
}
// Do not log the token or the AUTH command.
auto optimized = client.Optimize("app_db.articles");
```

### Debug Mode

Debug mode is administrative. This example assumes that the same `client` was authenticated as in the preceding section.

```cpp
// Enable debug mode
client.EnableDebug();

auto result = client.Search("app_db.articles", "hello", 10);
if (result && result->debug) {
    std::cout << "Query time: " << result->debug->query_time_ms << "ms\n";
    std::cout << "Candidates: " << result->debug->candidates << "\n";
}

// Disable debug mode
client.DisableDebug();
```

### Search Expression Parser

The library includes a web-style search expression parser that converts Google-like search syntax into MygramDB query format.

#### Syntax

- `term1 term2` - Multiple terms with implicit AND (both must appear)
- `"phrase"` - Quoted phrase (exact match with spaces)
- `+term` - Explicitly required term (same as non-prefixed)
- `-term` - Excluded term (must NOT appear in results)
- `term1 OR term2` - Logical OR between terms
- `(expr)` - Grouping with parentheses
- Full-width space (`　`) is supported as a delimiter (useful for Japanese text)

#### Examples

```cpp
#include <mygramdb/search_expression.h>

using namespace mygramdb::client;

auto parsed = ParseSearchExpression("\"deep learning\" +(tutorial OR guide) -old");
if (!parsed) {
    std::cerr << parsed.error().message() << "\n";
    return 1;
}

const auto& expr = *parsed;
// Current fields: required_terms, excluded_terms, raw_expression,
// required_is_group, and excluded_is_group.
// The group-flag vectors parallel their term vectors; true marks a grouped entry.
// For this expression, required_is_group is [false, true] and excluded_is_group is [false].
// expr.excluded_terms contains "old".
```

#### Converting to Query String

```cpp
// Convert directly to QueryAST-compatible string
auto result = ConvertSearchExpression("+golang -old");
if (result) {
    std::string query = *result;
    // query = "golang AND NOT old"

    // Use with MygramClient
    auto search_result = client.SearchRaw("app_db.articles", query, 100);
} else {
    std::cerr << result.error().message() << "\n";
}
```

#### Expression Examples

| Input | Output Query | Description |
|-------|-------------|-------------|
| `golang tutorial` | `golang AND tutorial` | Implicit AND - both terms required |
| `"machine learning"` | `"machine learning"` | Exact phrase search |
| `golang -old` | `golang AND NOT old` | Must have "golang", must not have "old" |
| `python OR ruby` | `(python OR ruby)` | Either "python" or "ruby" |
| `order` | `"order"` | Literal word; reserved clause keywords are quoted |
| `go or rust` | `(go OR rust)` | `OR` is recognized case-insensitively as a whole word |
| `owner's draft` | `"owner's draft"` | Apostrophes make the value one quoted wire token |
| `"deep learning" tutorial` | `"deep learning" AND tutorial` | Phrase and term |
| `golang +(tutorial OR guide)` | `golang AND (tutorial OR guide)` | "golang" AND either "tutorial" or "guide" |
| `(tutorial -video)` | `(tutorial NOT video)` | A minus inside a group becomes `NOT` |
| `AI machine -learning` | `AI AND machine AND NOT learning` | Must have "AI" and "machine", exclude "learning" |
| `機械学習　チュートリアル` | `機械学習 AND チュートリアル` | Full-width space delimiter; values emitted by the SDK are quoted when needed |
| `😀 tutorial -😢` | `😀 AND tutorial AND NOT 😢` | Emoji search (4-byte UTF-8) |

#### Simplified API (Backward Compatible)

For simple use cases without OR/grouping:

```cpp
auto simplified = SimplifySearchExpression("+golang +tutorial -old");
if (simplified) {
    // simplified->main_term == "golang"
    // simplified->and_terms contains "tutorial"
    // simplified->not_terms contains "old"
}
```

`SimplifySearchExpression()` returns the typed `kClientExpressionParseError` error when the expression contains `OR` or parenthesized grouping because its structured fields cannot represent those forms. It preserves simple terms and quoted phrases as plain values; the structured search methods quote them once when building the command. Use `ConvertSearchExpression()` followed by `SearchRaw()` for lossless phrases, OR groups, and grouping.

## C API

### Basic Usage

```c
#include <mygramdb/mygramclient_c.h>
#include <stdio.h>

int main() {
    // Configure client
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

    // Create client
    MygramClient_C* client = mygramclient_create_v2(&config);
    if (!client) {
        fprintf(stderr, "Failed to create client\n");
        return 1;
    }

    // Connect
    if (mygramclient_connect(client) != 0) {
        fprintf(stderr, "Connection failed: %s\n",
                mygramclient_get_last_error(client));
        mygramclient_destroy(client);
        return 1;
    }

    // Search
    MygramSearchResult_C* result = NULL;
    if (mygramclient_search(client, "app_db.articles", "hello", 100, 0, &result) == 0) {
        printf("Found %llu results (showing %zu):\n",
               result->total_count, result->count);
        for (size_t i = 0; i < result->count; i++) {
            printf("  - %s\n", result->primary_keys[i]);
        }
        mygramclient_free_search_result(result);
    } else {
        fprintf(stderr, "Search failed: %s\n",
                mygramclient_get_last_error(client));
    }

    // Cleanup
    mygramclient_disconnect(client);
    mygramclient_destroy(client);

    return 0;
}
```

### Compiling C Programs

```bash
cc -std=c11 myapp.c $(pkg-config --cflags --libs mygramclient) -o myapp
```

### Administrative authentication

Administrative authentication is required only when the server has a non-empty `api.admin_token`. `MygramClientConfig_C` and `MygramClientConfigV2_C` have no admin-token field. In that case, before calling an administrative method, send `AUTH` with `mygramclient_send_command` on the same connected `MygramClient_C` and require the exact `OK AUTHENTICATED` response; a `0` return only means a raw response was received and clears the last error. Use `mygramclient_get_last_error` only when the return value is nonzero. A manually sent `AUTH` applies to the current connection, so send it again after reconnecting. This applies to the C equivalents of `GetConfig`/`CONFIG`, `SetVariable`, `ShowVariables`, `Cache*`, `Optimize`, `Sync*`, `Dump*`, `Save`, `Load`, replication, and `EnableDebug`/`DisableDebug`, but not to search, count, get, or facet operations. Free the response with `mygramclient_free_string` and never log the token or command.

The C API uses the same quoting rule for literal search text, AND/NOT terms, filter values, and highlight tags. A failed send after a reset returns a nonzero status; inspect `mygramclient_get_last_error`, reconnect, and then retry.

```c
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

const char* token = getenv("MYGRAM_API_ADMIN_TOKEN");
if (token == NULL) {
    fprintf(stderr, "MYGRAM_API_ADMIN_TOKEN is not set\n");
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
    fprintf(stderr, "Admin authentication request failed: %s\n",
            mygramclient_get_last_error(client));
    return 1;
}
int authenticated = response != NULL && strcmp(response, "OK AUTHENTICATED") == 0;
mygramclient_free_string(response);
if (!authenticated) {
    fprintf(stderr, "Admin authentication was rejected\n");
    return 1;
}
```

### Advanced Search (C API)

For new code, use `MygramSearchOptions_C` and `mygramclient_search_with_options`. Zero-initialize the structure and set `struct_size`; its typed filters support `=`, `!=`, `>`, `>=`, `<`, and `<=`, and `fuzzy_distance` is `1` or `2`. Set `query_mode` to `MYGRAM_QUERY_BOOLEAN` to send a boolean expression instead of a literal query.

In `MygramSearchOptions_C`, `sort_desc` values of `0` or greater mean descending, and a negative value means ascending. Zero-initializing the typed structure therefore keeps the default descending order. The older `mygramclient_search_advanced()` function uses a different convention: its `sort_desc` argument is `0` for ascending and non-zero for descending.

`MygramClientConfigV2_C` is the preferred configuration for new C programs. `timeout_ms` is the ordinary operation deadline; `connect_timeout_ms` is the connection deadline and falls back to `timeout_ms` when zero. `max_response_bytes` limits a response frame and defaults to 64 MiB when zero. The dedicated `dump_*_timeout_ms` and `optimize_timeout_ms` fields use the client defaults when zero or unavailable in an older structure. Set `unix_socket_path` to use a Unix socket; it takes precedence over TCP host and port.

Both `MygramClientConfigV2_C` and `MygramSearchOptions_C` are append-only, size-aware structures within the same shared-library ABI major. Set `struct_size` to the size your caller knows. The library ignores later fields and supplies their defaults. V2 configurations also set `version` to `MYGRAMCLIENT_CONFIG_V2_VERSION`. The legacy `MygramClientConfig_C` and `mygramclient_create()` remain available as the legacy API.

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

Use `mygramclient_facet_paged(client, table, column, query, limit, offset, &result)` for a facet page. Its `result->total_count` is the total number of distinct values before pagination; release it with `mygramclient_free_facet_result`.

### C parsed expression fields

`MygramParsedExpression_C` contains `main_term`, `and_terms` with `and_count`, and `not_terms` with `not_count`. It has no optional-term fields. Use the converter API for expressions containing OR or grouping.

```c
typedef struct {
    char* main_term;
    char** and_terms;
    size_t and_count;
    char** not_terms;
    size_t not_count;
} MygramParsedExpression_C;
```

### C expression diagnostics

The C parser and converter have `_ex` variants for errors that need to be shown to a user. They initialize output pointers to `NULL`; on failure, `diagnostic` receives an allocated message when available. Release every returned string with `mygramclient_free_string`.

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
    /* raw_query is valid input to mygramclient_search_raw(). */
}
mygramclient_free_string(raw_query);
mygramclient_free_string(diagnostic);
```

## Node.js Bindings Example

Using node-gyp with the C API:

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
// src/mygramdb_node.cpp (simplified example)
#include <napi.h>
#include <mygramdb/mygramclient_c.h>

Napi::Value Search(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    // Get parameters
    std::string table = info[0].As<Napi::String>();
    std::string query = info[1].As<Napi::String>();
    uint32_t limit = info[2].As<Napi::Number>().Uint32Value();

    // Create and connect client
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

    // Search
    MygramSearchResult_C* result = NULL;
    if (mygramclient_search(client, table.c_str(), query.c_str(), limit, 0, &result) != 0) {
        Napi::Error::New(env, mygramclient_get_last_error(client)).ThrowAsJavaScriptException();
        mygramclient_destroy(client);
        return env.Null();
    }

    // Convert to JavaScript array
    Napi::Array jsResults = Napi::Array::New(env, result->count);
    for (size_t i = 0; i < result->count; i++) {
        jsResults[i] = Napi::String::New(env, result->primary_keys[i]);
    }

    // Cleanup
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

## API Reference

### C++ API Classes

#### ClientConfig
- `host` - Server hostname (default: "127.0.0.1")
- `port` - Server port (default: 11016)
- `timeout_ms` - Ordinary operation timeout (default: 5000)
- `connect_timeout_ms` - Connect timeout; `0` uses `timeout_ms`
- `recv_buffer_size` - Receive buffer size (default: 65536)
- `max_response_bytes` - Maximum response frame; `0` uses the 64 MiB default
- `unix_socket_path` - Unix socket path; when set, it takes precedence over TCP
- `dump_save_timeout_ms`, `dump_load_timeout_ms`, `dump_verify_timeout_ms`, `optimize_timeout_ms` - Operation-specific deadlines; `0` uses `timeout_ms`

#### SearchResponse
- `results` - Vector of SearchResult for the current `LIMIT`/`OFFSET` page
- `total_count` - Total matching documents before pagination; the server derives it with the page from one index read
- `debug` - Optional debug information

#### Error
- `code()` - Typed `mygram::utils::ErrorCode`; client failures use the 7000 range
- `message()` and `context()` - Error text and optional context
- `to_string()` - Formatted error text including the numeric code

When the server responds with `ERROR <code> ...`, the client preserves a parseable numeric code in the typed error. A response without a numeric token is reported as `kClientServerError`.

### C API Functions

See `mygramclient_c.h` for full function documentation.

Key functions:
- `mygramclient_create_v2()` - Create a client with the size/versioned configuration
- `mygramclient_connect()` - Connect to server
- `mygramclient_search()` - Simple search
- `mygramclient_search_advanced()` - Advanced search with filters
- `mygramclient_search_with_options()` - Typed filter, fuzzy, highlight, sort, and pagination search
- `mygramclient_count()` - Count matches
- `mygramclient_get()` - Get document by key
- `mygramclient_free_*()` - Free result structures

## Thread Safety

Connection lifecycle calls and commands on a `MygramClient` share one mutex. `Disconnect()` waits for an in-flight command to finish; it does not cancel that command. Destruction and move operations must not race with member calls. The C API also serializes connection lifecycle calls and commands, and `mygramclient_destroy()` must not race with another call on the same handle.

## Error Handling

### C++ API

Functions return `mygram::utils::Expected<T, Error>`. Check the result before accessing it:

```cpp
auto result = client.Search(...);
if (!result) {
    const auto& error = result.error();
    std::cerr << error.to_string() << "\n";
    if (error.code() == mygram::utils::ErrorCode::kClientTimeout) {
        // Reconnect or apply the application's retry policy.
    }
} else {
    const auto& resp = *result;
    // Use resp
}
```

### C API

Functions return `0` on success and `-1` on error. Use `mygramclient_get_last_error()` for the message and `mygramclient_get_last_error_code()` for the numeric MygramDB error code. A successful operation clears the last error state.

## License

MIT License (see the [LICENSE](https://github.com/libraz/mygram-db/blob/main/LICENSE) file)

## See Also

- [Protocol Reference](/docs/protocol) - TCP command reference
- [Query Syntax Guide](/docs/query-syntax) - Search query grammar
- [HTTP API Guide](/docs/http-api) - RESTful JSON API
