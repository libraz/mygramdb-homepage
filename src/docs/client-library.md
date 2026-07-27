---
title: libmygramclient - MygramDB C/C++ Client Library
description: libmygramclient is a C/C++ client library for MygramDB. Modern C++17 API, C API for bindings, search expression parser, Node.js node-gyp example, thread safety, and error handling.
head:
  - - meta
    - name: keywords
      content: libmygramclient, MygramDB client library, C++ API, C API, node-gyp bindings, search expression parser, MygramClient
---

# libmygramclient - MygramDB Client Library

## Overview

libmygramclient is a C/C++ client library for connecting to and querying MygramDB servers. It provides both a modern C++ API and a C API suitable for bindings (e.g., node-gyp).

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

This creates:
- `build/lib/libmygramclient.a` - Static library
- `build/lib/libmygramclient.dylib` (macOS) or `libmygramclient.so` (Linux) - Shared library

## Installation

```bash
sudo make install
```

This installs headers to `/usr/local/include/mygramdb/` and libraries to `/usr/local/lib/`. The C++ header currently depends on MygramDB core headers, so build C++ applications from a MygramDB source checkout rather than treating the installed header as a standalone SDK.

## C++ API

### Basic Usage

```cpp
#include "client/mygramclient.h"
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

### Compiling with libmygramclient

::: tip If linking fails
When `libmygramclient` is installed outside the standard prefixes, you may need `-I` and `-L` at compile time and `LD_LIBRARY_PATH` (Linux) or `DYLD_LIBRARY_PATH` (macOS) at run time.
:::

```bash
g++ -std=c++17 -I./src -L./build/lib -o myapp myapp.cpp -lmygramclient
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

### Typed Search Options

Use `SearchOptions` when a query needs comparison filters, fuzzy matching, highlighting, sorting, or pagination. Use `SearchRaw` only for a boolean expression you construct deliberately.

::: warning Concurrency per connection
`MygramClient` serializes concurrent commands on its single TCP connection, so it is safe to share — but one instance executes one request at a time. Use several instances when you need throughput, and never call `Disconnect()` while a request is in flight.
:::

::: info Thinking about connections
Holding one client per worker or thread and reusing it beats reconnecting for every short request. After a disconnect or timeout, construct a fresh `MygramClient` and reconnect.
:::

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

### Count Query

```cpp
auto result = client.Count("app_db.articles", "hello");
if (result) {
    std::cout << "Total matches: " << result->count << "\n";
} else {
    std::cerr << "Count failed: " << result.error().message() << "\n";
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

### Debug Mode

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
// expr.required_terms contains the required terms.
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
| `"deep learning" tutorial` | `"deep learning" AND tutorial` | Phrase and term |
| `golang +(tutorial OR guide)` | `golang AND (tutorial OR guide)` | "golang" AND either "tutorial" or "guide" |
| `AI machine -learning` | `AI AND machine AND NOT learning` | Must have "AI" and "machine", exclude "learning" |
| `機械学習　チュートリアル` | `機械学習 AND チュートリアル` | Full-width space delimiter |
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

**Note:** Complex expressions with OR and parentheses will lose their semantic meaning when using `SimplifySearchExpression()`.

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
        .dump_save_timeout_ms = 600000
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
gcc -o myapp myapp.c -lmygramclient
```

### Advanced Search (C API)

For new code, use `MygramSearchOptions_C` and `mygramclient_search_with_options`. Zero-initialize the struct and set `struct_size`; its typed filters support `=`, `!=`, `>`, `>=`, `<`, and `<=`, and `fuzzy_distance` is `1` or `2`.

`MygramClientConfigV2_C` is the preferred configuration for new C programs. Set `unix_socket_path` to use a Unix socket (it takes precedence over TCP host and port), and use `dump_save_timeout_ms` to set the total polling deadline for asynchronous `DUMP SAVE`. The legacy `MygramClientConfig_C` and `mygramclient_create()` remain ABI-compatible.

```c
const char* and_terms[] = {"AI"};
const char* not_terms[] = {"old"};
const char* filter_keys[] = {"status", "category"};
const char* filter_values[] = {"active", "tech"};

MygramSearchResult_C* result = NULL;
int ret = mygramclient_search_advanced(
    client,
    "app_db.articles",    // database-qualified table
    "technology",         // query
    50,                   // limit
    0,                    // offset
    and_terms, 1,         // AND terms
    not_terms, 1,         // NOT terms
    filter_keys, filter_values, 2,  // filters
    "created_at",         // order by
    1,                    // descending
    &result
);

if (ret == 0) {
    // Process results
    mygramclient_free_search_result(result);
}
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
- `timeout_ms` - Connection timeout (default: 5000)
- `recv_buffer_size` - Receive buffer size (default: 65536)
- `unix_socket_path` - Unix socket path; when set, it takes precedence over TCP
- `dump_save_timeout_ms` - Total polling deadline for asynchronous `DUMP SAVE`

#### SearchResponse
- `results` - Vector of SearchResult
- `total_count` - Total matching documents
- `debug` - Optional debug information

#### Error
- `message` - Error message string

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

`MygramClient` serializes concurrent commands on its single TCP connection, so it is safe to share for correctness but executes one request at a time. Use separate instances when you need more throughput. Do not call `Disconnect()` while another thread has a request in flight.

## Error Handling

### C++ API

Functions return `mygram::utils::Expected<T, Error>`. Check the result before accessing it:

```cpp
auto result = client.Search(...);
if (!result) {
    // Handle error: result.error().message()
} else {
    const auto& resp = *result;
    // Use resp
}
```

### C API

Functions return 0 on success, -1 on error. Use `mygramclient_get_last_error()` to retrieve the error message.

## License

MIT License (see the [LICENSE](https://github.com/libraz/mygram-db/blob/main/LICENSE) file)

## See Also

- [Protocol Reference](/docs/protocol) - TCP command reference
- [Query Syntax Guide](/docs/query-syntax) - Search query grammar
- [HTTP API Guide](/docs/http-api) - RESTful JSON API
