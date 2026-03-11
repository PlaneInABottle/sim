---
name: sim-workflows
description: Use when building or modifying Sim workflows programmatically via MCP tools - adding/removing blocks, connecting edges, managing workflow state, importing/exporting workflows, or automating workflow creation. Provides comprehensive guide for all sim-mcp operations including block types, API operations, variables, subflows, templates, and best practices.
---

# AI-Native Workflow Management

Autonomous guide for creating, building, executing, and monitoring Sim Studio workflows via the 28 sim-mcp tools. All operations update the UI in real-time.

> **Deep dives:** [MCP Tools](references/mcp-tools-reference.md) · [Block Types](references/block-types.md) · [Function Patterns](references/function-block-patterns.md) · [API Patterns](references/api-block-patterns.md) · [Troubleshooting](references/troubleshooting.md) · [Templates](examples/workflow-templates.json)

**When to read references:**
- **Detailed tool parameters** → [MCP Tools Reference](references/mcp-tools-reference.md)
- **Subblock IDs, formats, output fields** → [Block Types](references/block-types.md)
- **Function block sandbox & code patterns** → [Function Patterns](references/function-block-patterns.md)
- **API block headers, body, tag resolution** → [API Patterns](references/api-block-patterns.md)
- **Debug workflows & common errors** → [Troubleshooting](references/troubleshooting.md)

## Workflow Lifecycle

```
Create → Build → Configure → Execute → Monitor → Debug → Iterate
```

| Phase | Tools | Purpose |
|-------|-------|---------|
| **Create** | `create_workflow` | Create empty workflow |
| **Build** | `add_blocks`, `add_edge`, `add_variable` | Add blocks, connect them, define variables |
| **Configure** | `update_subblock`, `update_block_name`, `toggle_block_enabled`, `update_block_parent` | Set block parameters |
| **Execute** | `execute_workflow` | Run with any trigger type |
| **Monitor** | `get_execution_logs`, `get_execution_log_detail` | Retrieve logs, trace spans, costs |
| **Inspect** | `list_workflows`, `get_workflow`, `get_block` | Read workflow state |
| **Manage** | `remove_blocks`, `remove_edge`, `remove_variable` | Remove components |
| **Skills** | `list_skills`, `get_skill`, `create_skill`, `update_skill`, `delete_skill` | Manage workspace skills for agents |
| **Advanced** | `replace_workflow_state`, `update_subflow`, `list_custom_tools`, `get_custom_tool`, `upsert_custom_tools` | Bulk ops, loops, custom tools |

---

## Tool Quick Reference

> **Full parameter tables:** [MCP Tools Reference](references/mcp-tools-reference.md)

### Creation & Building

- **`create_workflow`**`({ name, workspaceId })` → `{ id, name }`
- **`add_blocks`**`({ workflowId, blocks: [{ type, name, position: {x,y} }] })` — configure with `update_subblock` after
- **`add_edge`**`({ workflowId, source, target, sourceHandle?, targetHandle? })` — always use separate calls
- **`add_variable`**`({ workflowId, name, type, value })` — reference as `<variable.name>`

### Configuration

- **`update_subblock`**`({ workflowId, blockId, subblockId, value })` — primary block configuration tool
- **`update_block_name`**`({ workflowId, blockId, name })`
- **`toggle_block_enabled`**`({ workflowId, blockId, enabled })` — [safe testing patterns](references/mcp-tools-reference.md#disabling-blocks-for-safe-testing)
- **`update_block_parent`**`({ workflowId, blockId, parentId })` — nest in loop/parallel or `null` to remove

### Execution & Monitoring

- **`execute_workflow`**`({ workflowId, input?, triggerType? })` — `useDraftState: true` (default) = no deployment needed
- **`get_execution_logs`**`({ workspaceId, workflowId?, level?, details?, includeTraceSpans? })`
- **`get_execution_log_detail`**`({ logId })` — full trace with cost breakdown

### Inspection & Removal

- **`list_workflows`**`({ workspaceId })` · **`get_workflow`**`({ workflowId, verbose: false })` · **`get_block`**`({ workflowId, blockId })`
- **`remove_blocks`**`({ workflowId, blockIds })` · **`remove_edge`**`({ workflowId, edgeId })` · **`remove_variable`**`({ workflowId, variableId })`

### Skills & Advanced

- **`list_skills`**`({ workspaceId })` · **`get_skill`**`({ workspaceId, id })` · **`create_skill`**`({ workspaceId, name, description, content })` · **`update_skill`**`(...)` · **`delete_skill`**`({ workspaceId, id })`
- **`replace_workflow_state`**`({ workflowId, state })` · **`update_subflow`**`({ workflowId, id, type, config })`
- **`list_custom_tools`**`({ workspaceId })` · **`get_custom_tool`**`({ toolId, workspaceId? })` · **`upsert_custom_tools`**`({ workspaceId, tools })`

**⚠️ After deleting a skill:** Manually remove the skill reference from agent blocks — deletion does NOT auto-remove references. [Details](references/mcp-tools-reference.md#delete_skill)

### Using MCP Tools Correctly

- Block IDs must be unique within a workflow
- Create blocks first (`add_blocks`), then connect (`add_edge` — one call per connection)
- For condition/router blocks: set conditions via `update_subblock` BEFORE adding edges
- `sourceHandle` format: `"condition-{conditionId}"` or `"router-{routeId}"`

---

## Data Reference Syntax

**Block outputs** — use display name (not ID):

```
<Agent 1.content>          — Agent's text response
<Start.input>              — Full trigger input object
<Function 1.result>        — Function return value (always .result, not .output)
```

**Variables & environment:**

```
<variable.myVar>           — Workflow variable (angle brackets everywhere)
{{ENV_VAR}}                — Environment variable (double braces)
```

**Condition expressions:** Use `<BlockName.field>` tags to reference any upstream block's output by display name. Example: `<Function 1.result.priority> === 'high'`.

> [Full output fields table, tag edge cases, condition expression details](references/block-types.md#block-output-fields)

---

## Block Types

> **Full subblock IDs, data structures, examples:** [Block Types Reference](references/block-types.md)

### Triggers (exactly one per workflow)

| Type | Use For | Key SubBlocks |
|------|---------|---------------|
| `start_trigger` | ✅ **Recommended** — API, manual, chat, MCP, A2A | `inputFormat` |
| `generic_webhook` | Incoming webhooks from external services | (dynamic) |
| `schedule` | Cron/scheduled workflows | `scheduleType`, `cronExpression`, `timezone` |

> ⚠️ Legacy triggers (`api_trigger`, `chat_trigger`, `manual_trigger`, `input_trigger`, `starter`) are deprecated. Always use `start_trigger`.

### Core Blocks

| Type | Purpose | Key SubBlocks |
|------|---------|---------------|
| `agent` | LLM execution | `model`, `messages`, `tools`, `apiKey`, `skills` |
| `function` | JavaScript code | `language`, `code` |
| `condition` | Branching logic | `conditions` |
| `router_v2` | AI-powered routing | `context`, `routes`, `model` |
| `response` | Return data | `data`, `dataMode` |

**Agent:** ⚠️ Requires `apiKey` and `model`. Agent blocks have no `systemPrompt` subblock — use `messages` with `{"role":"system","content":"..."}`. (Other blocks like `evaluator`, `perplexity`, `huggingface`, `translate` do have `systemPrompt`.)
**Function:** Output is `{ result, stdout }` → reference as `<FnName.result>`. [Sandbox details](references/function-block-patterns.md)

**Condition:** sourceHandle = `"condition-{conditionId}"`. [Condition syntax details](references/block-types.md#condition-context-object)

**Response:** ⚠️ Set `dataMode` to `"json"` BEFORE setting `data` for programmatic use.

### Integration Blocks

| Type | Key SubBlocks |
|------|---------------|
| `api` | `url`, `method`, `headers`, `body`, `params`, `timeout` |
| `slack` | `operation`, `credential`, `channel`, `text` |
| `gmail` / `gmail_v2` | `operation`, `credential`, `to`, `subject`, `body` |
| `notion` | `operation`, `credential`, `databaseId` |
| `discord` | `operation`, `botToken`, `channelId`, `content` |
| `google_sheets` | `operation`, `credential`, `spreadsheetId` |

> **200+ integration blocks:** [Full reference](references/block-types.md#integration-blocks)

---

## Quick Start: Start → Agent → Response

```
// 1. Create workflow
create_workflow({ name: "My Workflow", workspaceId: "825eaf6a-..." })
→ { id: "wf_new" }

// 2. Add blocks
add_blocks({ workflowId: "wf_new", blocks: [
  { id: "trigger", type: "start_trigger", name: "Start", position: { x: 100, y: 300 } },
  { id: "agent1", type: "agent", name: "Process", position: { x: 400, y: 300 } },
  { id: "resp", type: "response", name: "Response", position: { x: 700, y: 300 } }
]})

// 3. Connect blocks
add_edge({ workflowId: "wf_new", source: "trigger", target: "agent1" })
add_edge({ workflowId: "wf_new", source: "agent1", target: "resp" })

// 4. Configure agent
update_subblock({ ..., blockId: "agent1", subblockId: "model", value: "gpt-4o" })
update_subblock({ ..., blockId: "agent1", subblockId: "apiKey", value: "{{OPENAI_API_KEY}}" })
update_subblock({ ..., blockId: "agent1", subblockId: "messages", value: [
  { "role": "system", "content": "Process the payload." },
  { "role": "user", "content": "Process: <Start.input>" }
]})

// 5. Configure response (dataMode FIRST)
update_subblock({ ..., blockId: "resp", subblockId: "dataMode", value: "json" })
update_subblock({ ..., blockId: "resp", subblockId: "data", value: "<Process.content>" })

// 6. Execute
execute_workflow({ workflowId: "wf_new", input: { message: "Test" }, triggerType: "api" })
```

> [Conditional branching pattern](references/block-types.md#condition-branching-deep-dive) · [Debug failures](references/troubleshooting.md#debug-workflow-pattern)

---

## Debugging

1. **Inspect state:** `get_workflow({ workflowId, verbose: true })` — check blocks, edges, subBlocks
2. **Check logs:** `get_execution_logs({ workspaceId, workflowId, details: "full", includeTraceSpans: true })`
3. **Common issues:** missing edges, wrong sourceHandle, missing apiKey, incorrect tag syntax

> [Full debug guide](references/troubleshooting.md) · [Error diagnosis table](references/troubleshooting.md#error-diagnosis-table)

---

## Critical Warnings

| ⚠️ Mistake | Fix |
|-----------|-----|
| Wrong trigger type | `start_trigger` for `"api"/"manual"/"chat"/"mcp"/"a2a"`, `generic_webhook` for `"webhook"`, `schedule` for `"schedule"` |
| Block ID in tags | Use **display name**: `<Agent 1.content>` not `<block_id.content>` |
| Missing API key | Set both `apiKey` and `model` on agent blocks |
| **OpenRouter + temperature** | ⚠️ **NEVER set `temperature` for OpenRouter models** (models starting with `openrouter/`) — causes `400 Bad Request`. Leave `temperature` subblock **null/empty**. OpenRouter uses model defaults. |
| Wrong condition handles | Use `"condition-{conditionId}"` NOT `"true"`/`"false"` |
| Response returns `{}` | Set `dataMode` to `"json"` before setting `data` |
| `inputData is not defined` | Use `<BlockName.field>` tag syntax; `params` is always `{}` |
| Function `.output` | Use `.result` — output is `{ result: ..., stdout: "" }` |
| No `systemPrompt` subblock | Use `messages` array with `{"role":"system"}` |

---

## Cheatsheet

**Minimum viable workflow:**
```
create_workflow → add_blocks (trigger + agent + response) → add_edge × 2 → update_subblock (model, apiKey, messages, dataMode, data) → execute_workflow
```

**Tag syntax:** `<BlockName.field>` (block output) · `<variable.name>` (workflow var) · `{{ENV_VAR}}` (env)

**Trigger types:** `api` | `manual` | `schedule` | `chat` | `webhook` | `mcp` | `a2a`

**Block positioning:** Trigger x=100, Processing x=400-700, Response x=900+, Branch spacing y±150
