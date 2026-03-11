# Function Block Patterns Reference

Comprehensive guide for using function (code) blocks in Sim workflows.

---

## Runtime Environment

Function blocks do **not** use one runtime in every case:

- **JavaScript without imports / require** runs locally in the fast local VM path
- **JavaScript with imports / require** uses the E2B sandbox
- **Python** uses the E2B sandbox

Plan examples around that split. If code needs external imports or Python, assume an
E2B-backed execution path instead of the local VM path.

### Commonly Available APIs

| API | Description | Notes |
|-----|-------------|-------|
| `console.log()` | Logging (captured in `stdout`) | Also `console.error()`, `console.warn()` |
| `fetch()` | HTTP requests | Async; must `await` |
| `Math` | Standard Math object | All methods available |
| `Date` | Date constructor & methods | `new Date()`, `Date.now()` |
| `JSON` | Parse and stringify | `JSON.parse()`, `JSON.stringify()` |
| `environmentVariables` | Access env vars | `environmentVariables.MY_VAR` |
| `setTimeout` | Delayed execution | Available but subject to timeout |

### Runtime-Specific Constraints

- **Local JavaScript path:** keep code self-contained; if you need `import` / `require`, it will switch to E2B instead of staying local
- **Python path:** requires E2B
- **Filesystem / package assumptions:** treat them as runtime-dependent and verify against the current execution environment before relying on them
- **HTTP requests:** prefer `fetch()` over older browser-only patterns such as `XMLHttpRequest`

---

## Input: Accessing Data via Tags

Function blocks receive upstream data via **tag syntax** `<BlockName.field>`. Tags are resolved server-side before execution, becoming safe variable references:

```javascript
// Tags become variables — NOT string interpolation
const userInput = <Start.input>;           // Full input object
const message = <Start.input.message>;     // Nested field
const apiData = <Fetch Data.data>;         // API block output
const agentReply = <AI Agent.content>;     // Agent block output

// Process and return
return { processed: true, message: message };
```

### Tag Resolution Rules

1. Tags use the block's **display name** (not ID)
2. Tags become variable references (safe, typed values — not strings)
3. Block names with spaces work in tags but create sanitized variable names internally
4. Dot notation accesses nested fields: `<BlockName.field.nested.path>`

### ⚠️ Common Mistakes

```javascript
// ❌ WRONG: Using params (always {})
const data = params.input;

// ❌ WRONG: Using inputData (not defined)
const data = inputData;

// ❌ WRONG: String interpolation of tags
const msg = `Hello ${<Start.input.name>}`;  // Tags aren't template literals

// ✅ CORRECT: Assign tag to variable first
const name = <Start.input.name>;
const msg = `Hello ${name}`;
```

---

## Output Format

Function blocks always return output in this structure:
```javascript
{
  result: <whatever you return>,  // Your return value
  stdout: ""                       // Captured console output
}
```

Reference the return value from other blocks as: `<FunctionName.result>`

```javascript
// Simple return
return { score: 95, grade: 'A' };
// → <MyFunction.result.score> = 95
// → <MyFunction.result.grade> = "A"

// Return a string
return "processed successfully";
// → <MyFunction.result> = "processed successfully"

// Return an array
return [1, 2, 3];
// → <MyFunction.result> = [1, 2, 3]
```

---

## Error Handling Patterns

### Try/Catch
```javascript
try {
  const data = <API Call.data>;
  const parsed = JSON.parse(data);
  return { success: true, data: parsed };
} catch (error) {
  console.error('Processing failed:', error.message);
  return { success: false, error: error.message };
}
```

### Null-Safe Access
```javascript
const data = <API Call.data>;

// Check before accessing nested fields
const userName = data && data.user ? data.user.name : 'Unknown';

// Or use optional chaining
const email = data?.user?.email ?? 'no-email';

return { userName, email };
```

### Validation
```javascript
const input = <Start.input>;

if (!input || !input.items || !Array.isArray(input.items)) {
  return { error: 'Invalid input: items array required', valid: false };
}

if (input.items.length === 0) {
  return { error: 'Empty items array', valid: false };
}

return { valid: true, count: input.items.length };
```

---

## Common Patterns

### Parse & Transform JSON
```javascript
const rawData = <API Call.data>;

// Transform array of items
const transformed = rawData.items.map(item => ({
  id: item.id,
  name: item.name.toUpperCase(),
  score: Math.round(item.score * 100) / 100
}));

return { items: transformed, count: transformed.length };
```

### Calculate & Aggregate
```javascript
const data = <Start.input>;

const scores = data.items.map(item => item.score);
const stats = {
  count: scores.length,
  sum: scores.reduce((a, b) => a + b, 0),
  avg: scores.reduce((a, b) => a + b, 0) / scores.length,
  min: Math.min(...scores),
  max: Math.max(...scores)
};

return stats;
```

### String Processing
```javascript
const content = <AI Agent.content>;

// Extract structured data from agent response
const lines = content.split('\n').filter(line => line.trim());
const sections = {};
let currentSection = 'intro';

for (const line of lines) {
  if (line.startsWith('##')) {
    currentSection = line.replace(/^#+\s*/, '').toLowerCase().replace(/\s+/g, '_');
    sections[currentSection] = [];
  } else {
    if (!sections[currentSection]) sections[currentSection] = [];
    sections[currentSection].push(line.trim());
  }
}

return sections;
```

### Date/Time Operations
```javascript
const now = new Date();
const timestamp = Date.now();

return {
  iso: now.toISOString(),
  unix: Math.floor(timestamp / 1000),
  formatted: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`,
  dayOfWeek: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][now.getDay()]
};
```

### Async Fetch (HTTP Requests)
```javascript
const userId = <Start.input.userId>;

const response = await fetch(`https://jsonplaceholder.typicode.com/users/${userId}`);
const user = await response.json();

return {
  name: user.name,
  email: user.email,
  company: user.company.name
};
```

### Environment Variables
```javascript
const apiKey = environmentVariables.MY_API_KEY;
const baseUrl = environmentVariables.API_BASE_URL || 'https://api.default.com';

const response = await fetch(`${baseUrl}/data`, {
  headers: { 'Authorization': `Bearer ${apiKey}` }
});

return await response.json();
```

### Filter & Sort
```javascript
const data = <Start.input>;

// Filter items
const active = data.items.filter(item => item.status === 'active');

// Sort by priority (descending)
const sorted = active.sort((a, b) => b.priority - a.priority);

// Take top 5
const top5 = sorted.slice(0, 5);

return { results: top5, totalActive: active.length };
```

---

## Timeout & Limits

- **Default timeout:** 5 seconds (configurable)
- **Memory:** Limited by isolated-vm sandbox
- **Console output:** Captured in `stdout` field
- **Return values:** Must be JSON-serializable (no functions, no circular references)

## Debugging Tips

1. **Use `console.log()`** — output appears in `stdout` and execution logs
2. **Return intermediate values** — check them in execution trace spans
3. **Type-check inputs** — tags may resolve to `undefined` if the source block hasn't run
4. **Test with simple returns first** — verify data flow before adding complex logic
