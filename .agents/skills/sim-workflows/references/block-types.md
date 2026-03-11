# Block Types Reference

Comprehensive list of block types available in Sim workflows.

## Trigger Blocks

### start_trigger
**Recommended** unified workflow entry point for API, manual, chat, MCP, and A2A runs. Replaces legacy `api_trigger`, `chat_trigger`, and `manual_trigger` blocks.

**Data structure:**
```typescript
{
  inputFormat?: Array<{       // Custom input fields beyond built-in ones
    name: string
    type: "string" | "number" | "boolean" | "object" | "array"
  }>
}
```

**Output:** `.input` (full input object), `.conversationId`, `.files`, plus spread fields from custom `inputFormat`

**Trigger modes (block UI):** `chat`, `manual`, `api` — the three modes available in the block's trigger selector.

> **Execution-level trigger types:** When running a workflow via the current workflow run tools, the executor still distinguishes trigger metadata such as `api`, `manual`, `chat`, `schedule`, `webhook`, `mcp`, and `a2a`. Exact parameter names may vary by MCP surface, but these modes still resolve through the same trigger model.

### generic_webhook
Receive webhooks from any external service. Exposes a unique webhook URL.

**Data structure:**
```typescript
{}  // Dynamic — fields come from the incoming webhook payload
```

**Output:** Fields from webhook payload, accessible via dot notation (e.g., `<Webhook.message>`)

### schedule
Trigger workflow execution on a schedule.

**Data structure:**
```typescript
{
  scheduleType: "minutes" | "hourly" | "daily" | "weekly" | "monthly" | "custom"
  cronExpression?: string     // For custom schedule type
  timezone?: string           // IANA timezone (e.g., "America/New_York")
}
```

> **⚠️ Legacy triggers (`api_trigger`, `chat_trigger`, `manual_trigger`, `input_trigger`, `starter`) are hidden and deprecated. Always use `start_trigger` instead.**

## Agent Blocks

### agent
AI agent with LLM capabilities, tool access, and knowledge base integration.

**Data structure:**
```typescript
{
  model: string              // e.g., "gpt-4", "claude-3-opus"
  messages: Array<{          // Conversation messages (includes system prompt)
    role: "system" | "user" | "assistant"
    content: string
  }>
  temperature?: number       // 0-1, controls randomness
  maxTokens?: number        // Maximum response length
  tools?: string[]          // Tool IDs to enable
  knowledgeBase?: string    // Knowledge base ID
  skills?: Array<{ skillId: string, name?: string }>  // Agent skills (progressive disclosure)
}
```

**⚠️ No `systemPrompt` subblock** — use the `messages` array with `{ "role": "system", "content": "..." }` instead.

**Output fields:**
- `content` (string) — Generated response text
- `model` (string) — Model used for generation (e.g., `"gpt-4o"`)
- `tokens` (json) — Token usage statistics `{ prompt, completion, total }`
- `toolCalls` (json) — Tool calls made `{ list, count }`
- `providerTiming` (json) — Provider timing information
- `cost` (json) — Cost of the API call

#### Skills

Agent blocks support **progressive disclosure skills** — reusable instruction sets that are loaded on-demand when the LLM requests them via the `load_skill` tool.

Skills are stored at the workspace level and attached to agent blocks via the `skills` sub-block. At execution time:
1. Available skills are listed in the system prompt
2. The LLM receives a `load_skill` tool
3. When called, the full skill content is provided to the LLM

**Format:** Array of `{ skillId: string, name?: string }`
- `skillId` references a skill in the workspace (UUID)
- `name` is optional (used as fallback display name if skill is deleted)

#### Attaching Skills to Agent Blocks

> **Lower-level substrate note:** The example below uses the historical/raw
> block-mutation layer. Prefer the current workspace skill-management surface
> when it already covers the change; use `update_subblock` only when you
> intentionally need block-level edits.

```
// Attach skills
update_subblock({
  workflowId: "wf_abc", blockId: "agent1", subblockId: "skills",
  value: [
    { "skillId": "code-reviewer-skill-id", "name": "code-reviewer" },
    { "skillId": "sql-expert-skill-id", "name": "sql-expert" }
  ]
})

// Clear all skills
update_subblock({ ..., subblockId: "skills", value: [] })
```

Use the current workspace skill-management tools to discover available skill IDs. Names must be kebab-case. Deleted skills are silently skipped at runtime.

## Logic Blocks

### condition
Branching logic based on JavaScript expression evaluation.

**Data structure:**
```typescript
{
  conditions: Array<{
    id: string                // Unique condition ID (used in edge sourceHandle)
    title: string             // "if", "else if", or "else"
    value: string             // JavaScript expression using `<BlockName.field>` tag syntax
  }>
}
```

**Condition expression syntax:**
Use `<BlockName.field>` tag syntax to reference upstream block outputs by display name.

```typescript
// Examples by source block type:
"<Function 1.result.priority> === 'high'"      // source = function block
"<Agent 1.content>.includes('urgent')"          // source = agent block
"<API Call.status> === 200"                      // source = api block
"<API Call.data.items>.length > 0"              // source = api block
"<Start.input.mode> === 'strict'"              // source = start_trigger

// Multi-condition chain:
// condition 1 (if):     "<API Call.status> === 200 && <API Call.data.valid> === true"
// condition 2 (else if): "<API Call.status> === 200"
// condition 3 (else):    ""   ← empty = catch-all fallback
```

**Output fields:**
- `conditionResult` (boolean) — whether a condition matched
- `selectedPath` (object | null) — `{ blockId, blockType, blockTitle }` of matched path
- `selectedOption` (string | null) — matched condition's ID
- Also spreads source block output into its own output

**Handles:**
- `condition-{conditionId}` — routes to the target for each matching condition

### Condition Branching Deep Dive

**Multi-condition chains (if / else-if / else):**
```json
[
  { "id": "high", "title": "if", "value": "<Function 1.result.priority> === 'high'" },
  { "id": "medium", "title": "else if", "value": "<Function 1.result.priority> === 'medium'" },
  { "id": "fallback", "title": "else", "value": "" }
]
```
Each condition is evaluated in order. The first truthy match wins. An empty `value` (`""`) acts as a catch-all fallback (always matches if no prior condition matched).

**Edge wiring for multi-conditions:**
```
edge: source="cond", target="high_agent",   sourceHandle="condition-high"
edge: source="cond", target="medium_agent",  sourceHandle="condition-medium"
edge: source="cond", target="default_agent", sourceHandle="condition-fallback"
```

**Complex expressions:**
```javascript
// Boolean logic (&&, ||)
"<API Call.status> === 200 && <API Call.data.items>.length > 0"
"<Function 1.result.type> === 'A' || <Function 1.result.type> === 'B'"

// Nested property checks
"<API Call.data.user.role> === 'admin'"
"<Function 1.result.scores>[0] >= 80"

// Null-safe checks
"<API Call.data> && <API Call.data.results> && <API Call.data.results>.length > 0"

// String methods
"<Agent 1.content>.toLowerCase().includes('error')"
"<API Call.data.email>.endsWith('@company.com')"

// Numeric comparisons
"<Function 1.result.confidence> >= 0.95"
"<API Call.data.items>.length > 0 && <API Call.data.items>.length <= 100"

// Type checks
"typeof <Function 1.result> === 'object'"
"Array.isArray(<API Call.data.items>)"
```

### Condition Context Object

Use `<BlockName.field>` tag syntax in condition expressions to reference upstream block outputs by display name:

| Source Block | Available Fields | Example Expression |
|-------------|-----------------|-------------------|
| `function` | `.result`, `.stdout` | `<Function 1.result.priority> === 'high'` |
| `agent` | `.content`, `.tokens`, `.model` | `<Agent 1.content>.includes('urgent')` |
| `api` | `.data`, `.status`, `.headers` | `<API Call.status> === 200` |
| `start_trigger` | `.input`, `.conversationId`, `.files`, + inputFormat fields | `<Start.input.priority> === 'high'` |
| `condition` | Inherits upstream source fields | `<Function 1.result> > 100` |

> ⚠️ **Deprecated:** The `context.field` syntax (e.g., `context.status === 200`) is still supported at runtime but should not be used. Always use `<BlockName.field>` for clarity and consistency.

> ⚠️ Tags use display names only: `<Agent 1.content>` not `<PreviousBlock.content>`.

### router_v2
AI-powered semantic routing using an LLM to select the best path. The router sends a prompt describing the input context to an LLM provider, which selects the most appropriate route from user-defined options.

> **⚠️ There are two router versions.** `router` (legacy, hidden) auto-detects downstream blocks. `router_v2` (active) uses explicit user-defined routes. Both use LLM-powered routing, NOT JavaScript expressions.

**Data structure (router_v2 — current):**
```typescript
{
  context: string              // Input context for the LLM to evaluate (required, supports tags)
  routes: Array<{              // User-defined route options
    id: string                 // Unique route ID (used in edge sourceHandle)
    title: string              // Route display name
    value: string              // Description of when this route should be selected
  }>
  model: string                // LLM model (default: "claude-sonnet-4-5")
  // + provider credential subblocks (apiKey, etc.)
}
```

**How it works:**
1. The `context` subblock provides the input the LLM evaluates (use `<BlockName.field>` tags)
2. The `routes` subblock defines available destinations with descriptions
3. The LLM uses structured output to return `{ route: "<id>", reasoning: "..." }`
4. Temperature is fixed at 0.1 for deterministic routing
5. If no route matches, the LLM returns `NO_MATCH` and an error is thrown

**Handles:** `router-{routeId}` — each route's `id` becomes a sourceHandle

**Output:** `selectedRoute` (route ID), `reasoning` (LLM explanation), `selectedPath` (target block info), `context` (input context used), `model`, `tokens`, `cost`

**Key differences from condition block:**
- **Condition:** Evaluates JavaScript expressions deterministically
- **Router:** Uses LLM semantic understanding to select the best route
- Router requires an LLM provider (model + API key), condition does not

**Edge wiring:**
```
add_edge({ source: "router_1", target: "support_agent", sourceHandle: "router-support" })
add_edge({ source: "router_1", target: "sales_agent",   sourceHandle: "router-sales" })
add_edge({ source: "router_1", target: "general_agent", sourceHandle: "router-general" })
```

## Subflow Containers

> **⚠️ Important:** Loop and parallel are **subflow containers**, not registered block types. They do not appear in the block registry (`blocks/registry.ts`). They are managed by the workflow editing surface, and blocks are nested inside them via parent-container wiring in that surface.

### loop (subflow)
Iterate over collections, repeat N times, or loop until a condition is met. Created via `add_blocks` with `type: "loop"`.

**Data structure:**
```typescript
{
  loopType: "for" | "forEach" | "while" | "doWhile"
  // for:       runs N times (configure iterations through the active workflow editing surface)
  // forEach:   iterates over a collection
  // while:     runs while condition is true (checked before each iteration)
  // doWhile:   runs at least once, then checks condition
  forCount?: number          // For 'for': number of iterations
  array?: string             // For 'forEach': array expression
  condition?: string         // For 'while'/'doWhile': continuation condition
  maxIterations?: number     // Safety limit
}
```

**Output:** Array of iteration results

### parallel (subflow)
Execute multiple paths simultaneously and aggregate results. Created via `add_blocks` with `type: "parallel"`. This is a **subflow container**, not to be confused with the `parallel_ai` integration block.

**Data structure:**
```typescript
{
  waitForAll?: boolean      // Wait for all branches or first completion
  timeout?: number          // Milliseconds
}
```

**Output:** Array of parallel execution results

### parallel_ai
AI-powered web research block (Parallel AI integration). Uses API key auth. **Not a subflow** — this is a tool block for search, extraction, and deep research.

**Data structure:**
```typescript
{
  operation: "search" | "extract" | "deep_research"
  apiKey: string                    // Required
  // Search operation:
  objective?: string                // Search objective
  search_queries?: string           // Comma-separated queries
  processor?: "lite" | "base" | "core" | "core2x" | "pro" | "ultra" | "ultra2x" | "ultra4x"  // Processing tier (default: "base")
  max_results?: string
  max_chars_per_result?: string
  // Extract operation:
  urls?: string                     // URLs to extract from
  extract_objective?: string
  excerpts?: "Yes" | "No"
  full_content?: "Yes" | "No"
  // Deep research operation:
  research_input?: string
  include_domains?: string
  exclude_domains?: string
}
```

**Output:** Search results, extracted content, or research report

> **⚠️ Important distinction:** In the MCP `add_blocks` tool, `type: "parallel"` creates a subflow container for parallel execution paths. The block registry type `parallel_ai` is a completely different integration block for AI-powered web research. Do not confuse the two.

## Integration Blocks

### api
Make HTTP requests to external APIs.

**Data structure:**
```typescript
{
  method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH"
  url: string
  headers?: Record<string, string>
  body?: any
  timeout?: number          // Milliseconds (default: 300000 = 5 min, max: 600000 = 10 min)
}
```

**Output:** Response data (status, headers, body)

### webhook_request
Send HTTP POST requests to external webhook URLs with optional HMAC signing.

**Data structure:**
```typescript
{
  url: string               // Webhook URL (required)
  body?: string             // JSON payload
  secret?: string           // HMAC signing secret (password field)
  headers?: Array<{         // Custom headers
    key: string
    value: string
  }>
}
```

**Output:** `{ data: object, status: number, headers: object }`

> **Note:** Do not confuse with `generic_webhook` (a trigger block that *receives* webhooks). `webhook_request` is an action block that *sends* outbound webhook requests.

## Recent Additions (v0.5.104)
| Block Type | Name | Category |
|-----------|------|----------|
| `brandfetch` | Brandfetch | tools |
| `google_meet` | Google Meet | tools |
| `dub` | Dub.co | tools |
| `amplitude` | Amplitude | tools |
| `google_pagespeed` | Google PageSpeed | tools |
| `pagerduty` | PagerDuty | tools |

## Data & Storage Blocks

### response
Return data from workflow execution. Typically last block in workflow.

**Data structure:**
```typescript
{
  dataMode: "structured" | "json"  // Builder mode vs JSON editor (set to "json" BEFORE setting data)
  builderData?: object             // For structured mode (response-format)
  data?: string                    // For json mode: expression/JSON string
  status?: string                  // HTTP status code as string (default: "200")
  headers?: Array<{ key: string, value: string }>  // Custom response headers
}
```

**SubBlock IDs:** `dataMode`, `builderData`, `data`, `status`, `headers`

> **⚠️ The subblock ID is `status` (not `statusCode`).** It's a `short-input` field that accepts a string value like `"200"`, `"404"`, etc.

**Output:** Formatted response

### function
Execute custom JavaScript (or Python when E2B is enabled) code.

**Data structure:**
```typescript
{
  language?: "javascript" | "python"  // Default: JavaScript; Python requires E2B feature flag
  code: string                        // JavaScript/Python code to execute
}
```

**Input:** `params` is always `{}` for regular function blocks (only populated for custom tool executions). Previous block outputs accessed via tag syntax `<BlockName.field>` (replaced with variable references before execution; block names in function code must not contain spaces).
**Output:** `{ result: <returnValue>, stdout: "" }`

### memory
Conversation memory store for adding, retrieving, and deleting message history. Used to inject artificial memory into agent conversations.

**Data structure:**
```typescript
{
  operation: "add" | "getAll" | "get" | "delete"
  id?: string                    // Conversation ID (required for add, get, delete)
  role?: "user" | "assistant" | "system"  // Message role (required for add)
  content?: string               // Message content (required for add)
}
```

**SubBlock IDs:** `operation`, `id`, `role`, `content`

> **⚠️ Best practice:** Only use this block when explicitly needed for artificial memory injection. For natural conversations, use the agent block's built-in memory modes instead.

**Output:** `.memories` (memory data), `.id` (memory identifier)

### workflow_input
Execute another (child) workflow and map variables to its Start trigger schema. Enables modular workflow composition.

**Data structure:**
```typescript
{
  workflowId: string             // Child workflow ID (workflow-selector, required)
  inputMapping?: object          // Map of child Start block fields to parent values (input-mapping)
}
```

**SubBlock IDs:** `workflowId`, `inputMapping`

> **⚠️ Note:** The `inputMapping` subblock depends on `workflowId` — select the child workflow first, then map its Start block inputs.

**Output:** `.success` (boolean), `.childWorkflowName` (string), `.childWorkflowId` (string), `.result` (execution result), `.error` (error message if failed)

### knowledge
Query, upload to, or create documents in a vector knowledge base.

**Data structure:**
```typescript
{
  operation: "search" | "upload_chunk" | "create_document"
  knowledgeBaseId: string           // Knowledge base selector (all operations)
  // Search operation:
  query?: string                    // Search query
  topK?: string                     // Max results (numeric string)
  tagFilters?: object               // Tag-based filters
  // Upload chunk operation:
  documentId?: string               // Target document ID
  content?: string                  // Chunk content
  // Create document operation:
  name?: string                     // Document name
  content?: string                  // Document content
  documentTags?: object             // Tags for the new document
}
```

**Output:** `.results` (search results), `.query` (query used), `.totalResults` (result count)

### variables
Set one or more workflow variable values. This is a single block type (not separate get/set blocks). Variables set here can be read elsewhere in the workflow via `<variable.variableName>` tag syntax.

**Data structure:**
```typescript
{
  variables: Array<{             // Select workflow variables and assign values
    variableId: string
    value: any                   // Value to set, supports tag expressions
  }>
}
```

**Output:** Each assigned variable becomes a top-level output field (dynamic)

> **Note:** There is no separate "variable_get" block. Reading variables is done via `<variable.variableName>` tag syntax in any block's fields.

## Utility Blocks

### wait
Pause workflow execution for a specified duration.

**Data structure:**
```typescript
{
  timeValue: string          // Numeric string, e.g., "10" (required)
  timeUnit: "seconds" | "minutes"  // Default: "seconds" (required)
}
```

**Output:** `{ waitDuration: number, status: string }`

## Human-in-the-Loop Blocks

### human_in_the_loop
Pause workflow and wait for human approval or input. Generates a unique URL/endpoint for an approver to submit a response.

**Data structure:**
```typescript
{
  builderData?: object        // Display data structure (response-format) shown to the approver
  notification?: object       // Notification tool config (e.g., Slack, Email) to alert approver
  inputFormat?: Array<{       // Resume form fields the approver fills out
    name: string
    type: "string" | "number" | "boolean" | "object" | "array"
  }>
}
```

**Output:** `{ url, resumeEndpoint, response, submission, resumeInput, submittedAt }`

## Block Configuration Best Practices

### Using Expressions
Blocks support tag expressions to reference workflow data:
- `<BlockName.field>` - Output from a specific block (uses display name)
- `<variable.name>` - Workflow variable reference
- In **condition blocks**, use `<BlockName.field>` tags to reference upstream block outputs
- In **function blocks**, tags become safe variable references (not inline strings)
- **Do NOT use** `{{blocks.blockId.output}}` or `{{input}}` — these are not valid syntax

### Position Layout
Standard spacing for visual clarity:
- Start blocks: x=100-200
- Middle blocks: x=300-700
- End blocks: x=800+
- Vertical spacing: 100-150px between parallel paths

### Block Output Fields

| Block Type | Output Fields |
|-----------|--------------|
| `agent` | `.content` (response text), `.model` (model used), `.tokens` (usage stats), `.toolCalls` (tool calls made), `.providerTiming` (timing info), `.cost` (API call cost) |
| `function` | `.result` (return value), `.stdout` (console output) |
| `start_trigger` | `.input` (full input), `.conversationId`, `.files`, + inputFormat fields |
| `api` | `.data` (response body), `.status`, `.headers` |
| `condition` | `.conditionResult`, `.selectedPath`, `.selectedOption`; spreads source output |
| `router_v2` | `.selectedRoute` (route ID), `.reasoning` (LLM explanation), `.selectedPath` (target block info), `.context` (input context), `.model`, `.tokens`, `.cost` |
| `memory` | `.memories` (memory data), `.id` (memory identifier) |
| `workflow_input` | `.success`, `.childWorkflowName`, `.childWorkflowId`, `.result`, `.error` |
| `knowledge` | `.results`, `.query`, `.totalResults` |
| `response` | `.data`, `.status`, `.headers` |
| `wait` | `.waitDuration` (duration in ms), `.status` (waiting/completed/cancelled) |
| `human_in_the_loop` | `.url`, `.resumeEndpoint`, `.response`, `.submission`, `.resumeInput`, `.submittedAt` |

### Tag Syntax Details

**Nested property access:** `<Function 1.result.user.name>`, `<API Call.data.items[0].id>`
If a nested path is `undefined`, the tag resolves to `undefined` (not an error).

**Null / Undefined references:**
- If a referenced block hasn't executed yet → `undefined`
- If a field doesn't exist on the output → `undefined`
- Use condition checks: `<Function 1.result> !== undefined && <Function 1.result.field> === 'value'`

**Tags in function block code:**
Tags are replaced with safe variable names before execution (`<My API.data>` → `__tag_my_api_0data`).
Prefer block names without spaces in function code for clarity.

**Tags in conditions:**
- `<BlockName.field>` — reference any upstream block by display name; resolved server-side
- Always use explicit block names for clarity: `<API Call.status> === 200 && <Start.input.mode> === 'strict'`

### Error Handling
Enable error handlers on critical blocks:
```typescript
{
  onError: {
    continueOnError: boolean
    fallbackValue?: any
    errorHandler?: string   // Block ID to handle errors
  }
}
```

### Timeouts
Set reasonable timeouts to prevent stuck workflows:
- API blocks: default 300,000 ms (5 min), max 600,000 ms (10 min)
- Agent blocks: 60-120 seconds recommended
- Code blocks: 10-30 seconds recommended
- Loop blocks: Set maxIterations (max 1000)

## SubBlock Types Reference

SubBlock types define the UI control used for each configuration field within a block. There are **42 SubBlock types** defined in `apps/sim/blocks/types.ts`:

### Core Input Controls
| Type | Description |
|------|-------------|
| `short-input` | Single-line text input |
| `long-input` | Multi-line text input |
| `dropdown` | Select menu |
| `combobox` | Searchable dropdown with text input |
| `slider` | Range input |
| `table` | Grid layout |
| `code` | Code editor |
| `switch` | Toggle button |
| `text` | Read-only text display |

### Specialized Input Controls
| Type | Description |
|------|-------------|
| `tool-input` | Tool configuration for agent blocks |
| `skill-input` | Skill selection for agent blocks |
| `condition-input` | Conditional logic expressions |
| `eval-input` | Evaluation input |
| `time-input` | Time input |
| `messages-input` | Message history with role and content for LLMs |
| `router-input` | Router route definitions with descriptions |
| `variables-input` | Variable assignments for updating workflow variables |
| `input-format` | Input structure format (trigger blocks) |
| `response-format` | Response structure format |
| `input-mapping` | Map parent variables to child workflow input schema |
| `file-upload` | File uploader |

### Selection Controls
| Type | Description |
|------|-------------|
| `checkbox-list` | Multiple selection |
| `grouped-checkbox-list` | Grouped, scrollable checkbox list with select all |
| `oauth-input` | OAuth credential selector |
| `knowledge-base-selector` | Knowledge base selector |
| `knowledge-tag-filters` | Multiple tag filters for knowledge bases |
| `document-selector` | Document selector for knowledge bases |
| `document-tag-entry` | Document tag entry for creating documents |
| `workflow-selector` | Workflow selector for agent tools |
| `workflow-input-mapper` | Dynamic workflow input mapper based on selected workflow |

### Integration-Specific Selectors
| Type | Description |
|------|-------------|
| `file-selector` | File selector (Google Drive, etc.) |
| `sheet-selector` | Sheet/tab selector (Google Sheets, Microsoft Excel) |
| `project-selector` | Project selector (Jira, Discord, etc.) |
| `channel-selector` | Channel selector (Slack, Discord, etc.) |
| `user-selector` | User selector (Slack, etc.) |
| `folder-selector` | Folder selector (Gmail, etc.) |

### MCP Controls
| Type | Description |
|------|-------------|
| `mcp-server-selector` | MCP server selector |
| `mcp-tool-selector` | MCP tool selector |
| `mcp-dynamic-args` | MCP dynamic arguments based on tool schema |

### Trigger/Schedule Controls
| Type | Description |
|------|-------------|
| `webhook-config` | Webhook configuration |
| `schedule-info` | Schedule status display (next run, last ran, failure badge) |
| `trigger-save` | ⚠️ **Deprecated** — Legacy trigger save button with validation |

## Block Validation

When adding blocks, the system validates:
1. Required fields present (type, name, position)
2. Block type exists and is supported
3. Data structure matches block type schema
4. Position values are numbers
5. IDs are unique within workflow

Invalid blocks will be rejected with error details.
