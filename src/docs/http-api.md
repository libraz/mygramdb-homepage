---
title: MygramDB HTTP API - RESTful JSON Search Endpoints
description: MygramDB RESTful JSON API reference. Search, count, facet, document GET, /info, Prometheus /metrics, health probes, replication status, CORS, and client examples in curl, JS, and Python.
head:
  - - meta
    - name: keywords
      content: MygramDB HTTP API, REST JSON search, /metrics Prometheus, health check, readiness probe, CORS, search endpoint, MySQL full-text API
---

# HTTP API Guide

MygramDB provides a RESTful JSON API for easy integration with web applications and HTTP clients.

::: info How this differs from the TCP API
The HTTP API is the JSON entry point for search, count, facet, and document lookup. Operational commands such as `SYNC`, `DUMP`, and `SET` are run over TCP/CLI.
:::

## Configuration

Enable the HTTP server in your `config.yaml`:

```yaml
api:
  tcp:
    bind: "127.0.0.1"
    port: 11016
  http:
    enable: true          # Enable HTTP server
    bind: "127.0.0.1"     # Bind address (default: localhost only)
    port: 8080            # HTTP port (default: 8080)
    enable_cors: false    # Optional: enable only when exposing to browsers
    cors_allow_origin: "" # Optional origin allowed when CORS is enabled
```

::: warning
TCP/HTTP servers bind to loopback by default. If you must expose them publicly, explicitly set `api.tcp.bind`/`api.http.bind`, configure `network.allow_cidrs` to the exact IP ranges that should connect, and keep TLS/API authentication in front of MygramDB (e.g., reverse proxy). CORS is disabled by default and should only be enabled with a trusted origin.
:::

::: info What is CORS?
**CORS** is the browser mechanism that permits a page to call an API on another domain. Server-to-server traffic does not need it. Enable it only when a browser calls MygramDB directly, and restrict it to a trusted origin.
:::

## API Endpoints

All responses are in JSON format with `Content-Type: application/json`. Table routes use a single
identity segment `/tables/{identity}`, where `{identity}` is the database-qualified name `` `database.table` ``
(for example, table `articles` in database `app_db` is addressed as `/tables/app_db.articles`). In a
single-database deployment (only one distinct database is configured), a bare `table` name also works
and resolves to that database — for example `/tables/articles`. A qualifier is required only when the
configuration spans two or more databases; a bare name is then rejected as ambiguous.

::: tip Thinking about identity
`identity` is the name that uniquely designates the table to search. With one database it is `articles`; with several it is `app_db.articles`.
:::

The legacy `/{table}/search`, `/{table}/count`, and `/{table}/{primary_key}` routes were removed in v1.7.0. Use `/tables/{identity}/...` for all table operations.

### POST /tables/{identity}/search

Full-text search with filters and pagination.

**Request:**

```http
POST /tables/app_db.threads/search HTTP/1.1
Content-Type: application/json

{
  "q": "breaking news AND tech",
  "mode": "boolean",
  "filters": {
    "status": 1,
    "category": "tech"
  },
  "limit": 50,
  "offset": 0
}
```

**Request Body Parameters:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `q` | string | Yes | Search text; treated literally unless `mode` is `"boolean"` |
| `mode` | string | No | `"literal"` (default) or `"boolean"` |
| `filters` | object | No | Filter conditions (column: value pairs) |
| `limit` | integer | No | Maximum results to return (default: 100, max: 1000) |
| `offset` | integer | No | Number of results to skip (default: 0) |
| `sort` | object | No | Sort configuration (e.g., `{"column": "_score", "order": "DESC"}`) |
| `highlight` | object | No | Highlight configuration (see below) |
| `fuzzy` | integer | No | Fuzzy search edit distance (`1` or `2`) |

### Literal and Boolean Search

HTTP treats `q` as literal text by default. For example, `"AND"` and `"LIMIT"` are ordinary search terms, not operators or control clauses. To send a boolean expression, set `"mode": "boolean"` explicitly:

```json
{
  "q": "tech AND (AI OR machine learning) NOT old",
  "mode": "boolean",
  "limit": 50
}
```

**Boolean Query Syntax (`mode: "boolean"`):**

- **Simple search**: `"keyword"`
- **Quoted phrases**: `"\"breaking news\""` (searches for exact phrase)
- **AND operator**: `"tech AND AI AND machine learning"`
- **OR operator**: `"(mysql OR postgresql) AND performance"`
- **NOT operator**: `"news NOT sports"`
- **Combined**: `"tech AND AI NOT old"`

Use JSON fields for `limit`, `offset`, `sort`, `filters`, `highlight`, and `fuzzy`. `q` never accepts those control clauses; in literal mode, text such as `LIMIT` or `SORT` remains part of the search text.

**Response (200 OK):**

```json
{
  "count": 2,
  "limit": 50,
  "offset": 0,
  "results": [
    {
      "primary_key": "article_101",
      "filters": {
        "status": 1,
        "category": "tech"
      }
    },
    {
      "primary_key": "article_205",
      "filters": {
        "status": 1,
        "category": "tech"
      }
    }
  ]
}
```

**Error Response (400 Bad Request):**

```json
{
  "error": "Missing required field: q"
}
```

**Error Response (500 Internal Server Error):**

```json
{
  "error": "Internal error: database connection failed"
}
```

**Highlight Configuration:**

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `open_tag` | string | `<em>` | Opening tag for highlighted terms |
| `close_tag` | string | `</em>` | Closing tag for highlighted terms |
| `snippet_length` | integer | 100 | Max code points per snippet (1-10,000) |
| `max_fragments` | integer | 3 | Max snippet fragments (1-100) |

**Search with Highlighting Example:**

```http
POST /tables/app_db.articles/search HTTP/1.1
Content-Type: application/json

{
  "q": "machine learning",
  "highlight": {
    "open_tag": "<strong>",
    "close_tag": "</strong>",
    "snippet_length": 150,
    "max_fragments": 5
  },
  "sort": {"column": "_score", "order": "DESC"},
  "limit": 10
}
```

### POST /tables/{identity}/count

Count documents matching a full-text query and optional filters. COUNT returns only the total count; pagination,
highlighting, fuzzy search, and `_score` sorting are search-only features and are rejected on this endpoint.

**Request:**

```http
POST /tables/app_db.threads/count HTTP/1.1
Content-Type: application/json

{
  "q": "breaking news AND tech",
  "mode": "boolean",
  "filters": {
    "status": 1
  }
}
```

**Response (200 OK):**

```json
{
  "count": 42
}
```

### POST /tables/{identity}/facet

Return facet buckets for a column, optionally scoped by a query and filters.

**Request Body Parameters:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `column` | string | Yes | Filter column to aggregate |
| `q` | string | No | Search query used to scope the facet |
| `mode` | string | No | `"literal"` (default) or `"boolean"` for `q` |
| `filters` | object | No | Additional filter conditions |
| `limit` | integer | No | Maximum number of facet buckets (1-1000) |
| `offset` | integer | No | Number of facet buckets to skip (default: 0) |

`sort`, `highlight`, and `fuzzy` are not supported by FACET and are rejected.

**Request:**

```http
POST /tables/app_db.articles/facet HTTP/1.1
Content-Type: application/json

{
  "column": "category",
  "q": "database OR mysql",
  "mode": "boolean",
  "filters": {
    "status": 1
  },
  "limit": 10
}
```

**Response (200 OK):**

```json
{
  "column": "category",
  "count": 2,
  "facets": [
    {"value": "tech", "count": 15},
    {"value": "ops", "count": 7}
  ]
}
```

### HTTP Surface Limits

The HTTP API exposes search, count, document lookup, health, metrics, replication status, and redacted configuration
inspection. Administrative commands such as `SET`, `SHOW VARIABLES`, `SYNC`, and `DUMP` remain available through the
TCP/CLI protocol and are not exposed as HTTP routes.

### GET /tables/{identity}/{primary_key}

Get a single document by its primary key.

**Request:**

```http
GET /tables/app_db.threads/thread_12345 HTTP/1.1
```

**Response (200 OK):**

```json
{
  "primary_key": "thread_12345",
  "filters": {
    "status": 1,
    "user_id": 42
  }
}
```

**Error Response (404 Not Found):**

```json
{
  "error": "Document not found"
}
```

### GET /info

Server information and detailed statistics (Redis-style monitoring).

::: info When to use /info
`/info` suits human reading and simple monitoring scripts that parse JSON. For continuous time-series monitoring with Prometheus and Grafana, use `/metrics`.
:::

**Request:**

```http
GET /info HTTP/1.1
```

**Response (200 OK):**

```json
{
  "server": "MygramDB",
  "version": "1.0.0",
  "uptime_seconds": 3600,
  "total_requests": 15000,
  "total_commands_processed": 15000,
  "memory": {
    "used_memory_bytes": 524288000,
    "used_memory_human": "500.00 MB",
    "peak_memory_bytes": 629145600,
    "peak_memory_human": "600.00 MB",
    "used_memory_index": "400.00 MB",
    "used_memory_documents": "100.00 MB",
    "total_system_memory": 17179869184,
    "total_system_memory_human": "16.00 GB",
    "available_system_memory": 9126805504,
    "available_system_memory_human": "8.50 GB",
    "system_memory_usage_ratio": 0.47,
    "process_rss": 545259520,
    "process_rss_human": "520.00 MB",
    "process_rss_peak": 629145600,
    "process_rss_peak_human": "600.00 MB",
    "memory_health": "HEALTHY"
  },
  "index": {
    "total_documents": 1000000,
    "total_terms": 1500000,
    "total_postings": 5000000,
    "avg_postings_per_term": 3.33,
    "delta_encoded_lists": 1200000,
    "roaring_bitmap_lists": 300000
  },
  "tables": {
    "products": {
      "documents": 500000,
      "terms": 800000,
      "postings": 2500000,
      "ngram_size": 2,
      "memory_bytes": 262144000,
      "memory_human": "250.00 MB"
    },
    "users": {
      "documents": 500000,
      "terms": 700000,
      "postings": 2500000,
      "ngram_size": 1,
      "memory_bytes": 262144000,
      "memory_human": "250.00 MB"
    }
  }
}
```

**Response Fields:**

| Field | Description |
|-------|-------------|
| `server` | Server name (MygramDB) |
| `version` | Server version |
| `uptime_seconds` | Server uptime in seconds |
| `total_requests` | Total number of requests processed |
| `total_commands_processed` | Total number of commands processed |
| **Memory (Application)** | |
| `memory.used_memory_bytes` | Current memory usage in bytes (index + documents) |
| `memory.used_memory_human` | Human-readable current memory usage |
| `memory.peak_memory_bytes` | Peak memory usage in bytes |
| `memory.peak_memory_human` | Human-readable peak memory usage |
| `memory.used_memory_index` | Memory used by index |
| `memory.used_memory_documents` | Memory used by document store |
| **Memory (System)** | |
| `memory.total_system_memory` | Total physical RAM in bytes |
| `memory.total_system_memory_human` | Human-readable total system memory |
| `memory.available_system_memory` | Available physical RAM in bytes |
| `memory.available_system_memory_human` | Human-readable available memory |
| `memory.system_memory_usage_ratio` | System-wide memory usage (0.0-1.0) |
| **Memory (Process)** | |
| `memory.process_rss` | Process RSS (physical memory used) in bytes |
| `memory.process_rss_human` | Human-readable process RSS |
| `memory.process_rss_peak` | Peak RSS since process start in bytes |
| `memory.process_rss_peak_human` | Human-readable peak RSS |
| **Memory (Health)** | |
| `memory.memory_health` | Memory health status (HEALTHY/WARNING/CRITICAL/UNKNOWN) |
| **Index (Aggregated)** | |
| `index.total_documents` | Total number of documents across all tables |
| `index.total_terms` | Total number of unique terms |
| `index.total_postings` | Total number of postings |
| `index.avg_postings_per_term` | Average postings per term |
| `index.delta_encoded_lists` | Number of posting lists using delta encoding |
| `index.roaring_bitmap_lists` | Number of posting lists using Roaring Bitmaps |
| **Tables (Per-table)** | |
| `tables.<name>.documents` | Number of documents in table |
| `tables.<name>.terms` | Number of terms in table |
| `tables.<name>.postings` | Number of postings in table |
| `tables.<name>.ngram_size` | N-gram size for table |
| `tables.<name>.memory_bytes` | Memory usage for table in bytes |
| `tables.<name>.memory_human` | Human-readable memory usage for table |

**Memory Health Status:**
- `HEALTHY`: >20% system memory available
- `WARNING`: 10-20% system memory available
- `CRITICAL`: <10% system memory available (OPTIMIZE will be rejected)
- `UNKNOWN`: Unable to determine status

This endpoint is suitable for integration with monitoring tools that support JSON format.

### GET /metrics

Prometheus metrics endpoint in Prometheus Exposition Format for monitoring and alerting.

::: info What is the Prometheus Exposition Format?
It is the text format Prometheus scrapes. Beyond values it carries types such as Counter and Gauge plus labels, which is what makes the data usable as time series in tools like Grafana.
:::

**Request:**

```http
GET /metrics HTTP/1.1
```

**Response (200 OK):**

```prometheus
# HELP mygramdb_server_info MygramDB server information
# TYPE mygramdb_server_info gauge
mygramdb_server_info{version="1.0.0"} 1

# HELP mygramdb_server_uptime_seconds Server uptime in seconds
# TYPE mygramdb_server_uptime_seconds counter
mygramdb_server_uptime_seconds 3600

# HELP mygramdb_memory_used_bytes Current memory usage in bytes
# TYPE mygramdb_memory_used_bytes gauge
mygramdb_memory_used_bytes{type="index"} 419430400
mygramdb_memory_used_bytes{type="documents"} 104857600
mygramdb_memory_used_bytes{type="total"} 524288000

# HELP mygramdb_memory_health_status Memory health status (0=UNKNOWN, 1=HEALTHY, 2=WARNING, 3=CRITICAL)
# TYPE mygramdb_memory_health_status gauge
mygramdb_memory_health_status 1

# HELP mygramdb_index_documents_total Total number of documents in the index
# TYPE mygramdb_index_documents_total gauge
mygramdb_index_documents_total{table="products"} 500000
mygramdb_index_documents_total{table="users"} 500000

# HELP mygramdb_command_total Total number of commands executed by type
# TYPE mygramdb_command_total counter
mygramdb_command_total{command="search"} 10000
mygramdb_command_total{command="count"} 2000
mygramdb_command_total{command="get"} 3000
```

**Content-Type**: `text/plain; version=0.0.4; charset=utf-8`

**Metric Categories:**

| Category | Description |
|----------|-------------|
| **Server Metrics** | Server version, uptime, commands processed |
| **Command Statistics** | Command execution counters by type (search, count, get, info, etc.) |
| **Memory Metrics** | Application memory (index/documents), system memory, process RSS, health status |
| **Index Metrics** | Documents, terms, postings, optimization status (per-table with `table` label) |
| **Client Metrics** | Current connections, total connections |
| **Replication Metrics** | Replication status, events processed, operation counters (MySQL build only) |

**Metric Types:**

- **Counter**: Monotonically increasing values (e.g., `mygramdb_command_total`)
- **Gauge**: Values that can increase or decrease (e.g., `mygramdb_memory_used_bytes`)

**Prometheus Scrape Configuration:**

```yaml
scrape_configs:
  - job_name: 'mygramdb'
    scrape_interval: 15s
    static_configs:
      - targets: ['localhost:8080']
        labels:
          environment: 'production'
```

**Key Features:**

- **Standard Prometheus format**: Compatible with all Prometheus-based monitoring stacks
- **Multi-dimensional metrics**: Uses labels for grouping (e.g., `table`, `command`, `status`)
- **Memory health tracking**: Numeric status values for alerting (1=HEALTHY, 2=WARNING, 3=CRITICAL)
- **Per-table metrics**: Index statistics broken down by table name
- **Backward compatible**: Existing `/info` endpoint remains unchanged

**Comparison with /info:**

| Feature | `/info` | `/metrics` |
|---------|---------|------------|
| Format | JSON | Prometheus text |
| Use case | General monitoring, debugging | Prometheus/Grafana integration |
| Metric types | Generic values | Typed metrics (Counter/Gauge) |
| Multi-dimensional | Limited | Full label support |
| Compatibility | Any HTTP client | Prometheus ecosystem |

Both endpoints provide the same underlying data but in different formats. Use `/metrics` for Prometheus integration and `/info` for general-purpose monitoring or human-readable output.

### GET /health

Health check endpoint for load balancers and monitoring.

**Request:**

```http
GET /health HTTP/1.1
```

**Response (200 OK):**

```json
{
  "status": "ok",
  "timestamp": 1699000000
}
```

### GET /health/live

Liveness probe. Returns `200 OK` while the HTTP server process is running, even if the node is still loading or replication is degraded.

### GET /health/ready

Readiness probe for traffic gating. Returns `200 OK` only when the node can accept search traffic. Returns `503 Service Unavailable` while a dump load or table synchronization is in progress, or when configured replication is unavailable. In v1.8.0 and later, table read routes (`search`, `count`, `facet`, and document `GET`) also return `503` while their table is synchronizing.

::: tip Choosing between live and ready
On Kubernetes, wire `/health/live` to the liveness probe and `/health/ready` to the readiness probe. `live` answers "should this process be restarted"; `ready` answers "may search traffic be sent here".
:::

### GET /health/detail

Detailed monitoring snapshot. Returns `200 OK` with `"status": "healthy"` or `"status": "degraded"`; use `/health/ready` rather than this endpoint for load balancer readiness decisions. Unlike `/health/live` and `/health/ready`, this endpoint is subject to the CIDR allow list.

### GET /config

Current server configuration summary (sensitive values are omitted).

**Request:**

```http
GET /config HTTP/1.1
```

**Response (200 OK):**

```json
{
  "mysql": {
    "configured": true,
    "database_defined": true
  },
  "api": {
    "tcp": {
      "enabled": true
    },
    "http": {
      "enabled": true,
      "cors_enabled": false
    }
  },
  "network": {
    "allow_cidrs_configured": false
  },
  "replication": {
    "enable": true
  },
  "notes": "Sensitive configuration values are redacted over HTTP. Use CONFIG SHOW over a secured connection for details."
}
```

### GET /replication/status

MySQL replication status (requires replication enabled).

**Request:**

```http
GET /replication/status HTTP/1.1
```

**Response (200 OK):**

```json
{
  "enabled": true,
  "status": "running",
  "current_gtid": "3E11FA47-71CA-11E1-9E33-C80AA9429562:1-5",
  "processed_events": 12345,
  "queue_size": 0
}
```

**Error Response (503 Service Unavailable):**

```json
{
  "error": "Replication not configured"
}
```

## CORS Support

Set `api.http.enable_cors: true` to turn on CORS (Cross-Origin Resource Sharing) headers for browser clients, then specify the trusted origin via `api.http.cors_allow_origin`. An empty configured origin becomes `*`, so do not enable CORS without setting a trusted origin. Keep CORS disabled when the API is not accessed directly from browsers.

**CORS Headers:**

```
Access-Control-Allow-Origin: https://app.example.com
Access-Control-Allow-Methods: GET, POST, OPTIONS
Access-Control-Allow-Headers: Content-Type
```

## Usage Examples

The examples below use the bare `threads` identity, which works in a single-database deployment. With
two or more databases, qualify it as `app_db.threads` (e.g. `/tables/app_db.threads/search`).

### cURL

**Search:**

```bash
curl -X POST http://localhost:8080/tables/threads/search \
  -H "Content-Type: application/json" \
  -d '{
    "q": "machine learning AND python",
    "filters": {"status": 1},
    "limit": 10
  }'
```

**Facet:**

```bash
curl -X POST http://localhost:8080/tables/threads/facet \
  -H "Content-Type: application/json" \
  -d '{
    "column": "category",
    "q": "machine learning",
    "filters": {"status": 1},
    "limit": 10
  }'
```

**Get document:**

```bash
curl http://localhost:8080/tables/threads/thread_12345
```

**Health check:**

```bash
curl http://localhost:8080/health
```

### JavaScript (fetch)

```javascript
// Search
const response = await fetch('http://localhost:8080/tables/threads/search', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    q: 'machine learning AND python',
    filters: { status: 1 },
    limit: 10
  })
});

const data = await response.json();
console.log(`Found ${data.count} results`);
data.results.forEach(doc => {
  console.log(`Document ${doc.primary_key}`);
});
```

### Python (requests)

```python
import requests

# Search
response = requests.post('http://localhost:8080/tables/threads/search', json={
    'q': 'machine learning AND python',
    'filters': {'status': 1},
    'limit': 10
})

data = response.json()
print(f"Found {data['count']} results")
for doc in data['results']:
    print(f"Document {doc['primary_key']}")
```

## Performance Considerations

- **Connection Pooling**: Use HTTP keep-alive for better performance
- **Pagination**: Use `limit` and `offset` for large result sets
- **Caching**: Consider caching frequent queries at the application layer
- **Network Security**: Use `network.allow_cidrs` to restrict access to trusted IP ranges

## Error Handling

All error responses follow this format:

```json
{
  "error": "Error message description"
}
```

**HTTP Status Codes:**

| Code | Description |
|------|-------------|
| 200 | Success |
| 400 | Bad Request (invalid input) |
| 403 | Forbidden (source IP is not allowed) |
| 404 | Not Found (document doesn't exist) |
| 429 | Too Many Requests (rate limit exceeded) |
| 500 | Internal Server Error |
| 503 | Service unavailable, feature not enabled, replication unavailable, or table synchronization in progress |

## Monitoring

The HTTP API provides multiple endpoints for monitoring and observability:

- **Health Check**: `GET /health` - Simple health check for load balancers
- **JSON Metrics**: `GET /info` - Detailed statistics in JSON format for general monitoring tools
- **Prometheus Metrics**: `GET /metrics` - Prometheus-compatible metrics for time-series monitoring and alerting
- **Replication Status**: `GET /replication/status` - MySQL replication status

### Monitoring Stack Integration

**Prometheus + Grafana:**

1. Configure Prometheus to scrape `/metrics` endpoint
2. Import Grafana dashboards for MygramDB visualization
3. Set up alerts based on memory health, query latency, and replication lag

**Other Monitoring Tools:**

- **Datadog/New Relic**: Parse `/info` JSON endpoint
- **Zabbix**: HTTP agent checks on `/health` and `/info`
- **Nagios/Icinga**: Check scripts using `/health` endpoint

## See Also

- [Query Guide](/docs/queries) - Search query syntax
- [Protocol Reference](/docs/protocol) - Full TCP command reference
- [Configuration Guide](/docs/configuration) - Server configuration
