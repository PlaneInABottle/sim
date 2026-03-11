# API Block Patterns Reference

Comprehensive guide for using API blocks in Sim workflows.

---

## SubBlock Configuration

| SubBlock ID | Type | Description |
|------------|------|-------------|
| `url` | `string` | Request URL — supports tags: `https://api.example.com/<Start.input.id>` |
| `method` | `string` | HTTP method: `GET`, `POST`, `PUT`, `DELETE`, `PATCH` |
| `headers` | `table` | Request headers as 2D array: `[["Key", "Value"], ...]` |
| `body` | `string` or `object` | Request body (for POST/PUT/PATCH) |
| `params` | `table` | Query parameters as 2D array: `[["key", "value"], ...]` |
| `timeout` | `number` | Request timeout in milliseconds (default: 300000 = 5 min, max: 600000 = 10 min) |

---

## Headers Format

Headers use a **table subblock** format — a 2D array of `[key, value]` pairs:

```javascript
// Correct format
update_subblock({
  workflowId: "...",
  blockId: "api_block",
  subblockId: "headers",
  value: [
    ["Content-Type", "application/json"],
    ["Authorization", "Bearer <variable.apiToken>"],
    ["X-Custom-Header", "custom-value"]
  ]
})
```

### ⚠️ Common Mistakes

```javascript
// ❌ WRONG: Object format (not supported for headers subblock)
value: { "Content-Type": "application/json" }

// ❌ WRONG: Single array
value: ["Content-Type", "application/json"]

// ✅ CORRECT: 2D array (table format)
value: [["Content-Type", "application/json"]]
```

### Tags in Headers
```javascript
value: [
  ["Authorization", "Bearer <variable.apiKey>"],
  ["X-User-Id", "<Start.input.userId>"]
]
```

---

## Body Handling

The body subblock accepts a **string** (JSON-encoded) or an **object**:

```javascript
// String format (recommended for complex payloads)
update_subblock({
  blockId: "api_block",
  subblockId: "body",
  value: '{"name": "<Start.input.name>", "email": "<Start.input.email>"}'
})

// Object format
update_subblock({
  blockId: "api_block",
  subblockId: "body",
  value: { "name": "<Start.input.name>", "action": "process" }
})
```

### Tags in Body
Tags are resolved before the request is sent:
```javascript
value: '{"query": "<AI Agent.content>", "userId": "<Start.input.userId>"}'
```

---

## Output Fields

API block output is accessible with these fields:

| Field | Type | Description |
|-------|------|-------------|
| `.data` | `any` | Response body (parsed JSON or raw text) |
| `.status` | `number` | HTTP status code (200, 404, 500, etc.) |
| `.headers` | `object` | Response headers |

```
<Fetch Data.data>           — Response body
<Fetch Data.status>         — Status code (e.g., 200)
<Fetch Data.headers>        — Response headers object
<Fetch Data.data.items>     — Nested field in response body
<Fetch Data.data.items[0]>  — Array element access
```

---

## Common Public APIs for Testing

### JSONPlaceholder (Free, no auth)
```javascript
// GET users
url: "https://jsonplaceholder.typicode.com/users"
method: "GET"

// GET single post
url: "https://jsonplaceholder.typicode.com/posts/1"
method: "GET"

// POST new item
url: "https://jsonplaceholder.typicode.com/posts"
method: "POST"
body: '{"title": "Test", "body": "Content", "userId": 1}'
headers: [["Content-Type", "application/json"]]
```

### httpbin (Request inspection)
```javascript
// Echo request details
url: "https://httpbin.org/anything"
method: "POST"
body: '{"test": true}'

// Simulate status codes
url: "https://httpbin.org/status/200"
method: "GET"

// Get request headers back
url: "https://httpbin.org/headers"
method: "GET"

// Simulate delay
url: "https://httpbin.org/delay/2"  // 2 second delay
method: "GET"
```

### Other Free APIs
```javascript
// Random user data
url: "https://randomuser.me/api/"

// IP geolocation
url: "https://ipapi.co/json/"

// Public holidays
url: "https://date.nager.at/api/v3/PublicHolidays/2024/US"
```

---

## Tag Resolution in URL, Headers, and Body

Tags (`<BlockName.field>`) are resolved in all API block fields:

```javascript
// URL with tags
url: "https://api.example.com/users/<Start.input.userId>/posts"

// Headers with variable reference
headers: [["Authorization", "Bearer <variable.apiToken>"]]

// Body with multiple tags
body: '{"message": "<AI Agent.content>", "priority": "<Start.input.priority>"}'
```

### Dynamic URL Construction
```javascript
// Base URL from variable, path from input
url: "<variable.baseUrl>/api/v1/<Start.input.resource>"
```

---

## Timeout Configuration

```javascript
update_subblock({
  blockId: "api_block",
  subblockId: "timeout",
  value: 10000   // 10 seconds
})
```

**Recommended timeouts:**
| Scenario | Timeout |
|----------|---------|
| Fast APIs (internal) | 5,000-10,000 ms |
| Standard APIs | 15,000-30,000 ms |
| Slow/heavy APIs | 30,000-60,000 ms |
| File uploads | 60,000-120,000 ms |

---

## Error Handling

### With Condition Block
```
API Call → Condition (check status) → Success Path / Error Path
```

Condition expression: `<API Call.status> === 200`

### With onError Configuration
```javascript
// In block data
"onError": {
  "continueOnError": true      // Don't stop workflow on error
}
```
When `continueOnError` is true, the API block will still produce output even on HTTP errors, allowing downstream condition blocks to check `<API Call.status>`.

---

## Complete Example: Authenticated API Call

```javascript
// Step 1: Add variable for API key
add_variable({ workflowId, name: "apiKey", type: "string", value: "sk-..." })

// Step 2: Add API block
add_blocks({
  workflowId,
  blocks: [{
    type: "api",
    name: "Fetch Data",
    position: { x: 400, y: 300 }
  }]
})

// Step 3: Configure
update_subblock({ blockId, subblockId: "method", value: "POST" })
update_subblock({ blockId, subblockId: "url", value: "https://api.example.com/data" })
update_subblock({ blockId, subblockId: "headers", value: [
  ["Content-Type", "application/json"],
  ["Authorization", "Bearer <variable.apiKey>"]
]})
update_subblock({ blockId, subblockId: "body", value: '{"query": "<Start.input.query>"}' })
update_subblock({ blockId, subblockId: "timeout", value: 15000 })
```
