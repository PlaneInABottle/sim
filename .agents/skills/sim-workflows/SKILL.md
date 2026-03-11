---
name: sim-workflows
description: Use when building or modifying Sim workflows via the current Sim MCP workflow tools. Best for workflow creation, sim_build / sim_plan / sim_edit changes, execution/testing flows, deployment, and block/output conventions. Load the references here for block semantics and patterns, but verify exact tool names against the current MCP definitions when the surface changes.
---

# AI-Native Workflow Management

Autonomous guide for creating, building, testing, and debugging Sim Studio workflows via the current workflow MCP surface. Tool names evolve faster than block semantics; use this skill for workflow patterns and treat the current MCP definitions as the authority for exact tool names.

> **Deep dives:** [Legacy MCP parameter appendix](references/mcp-tools-reference.md) · [Block Types](references/block-types.md) · [Function Patterns](references/function-block-patterns.md) · [API Patterns](references/api-block-patterns.md) · [Troubleshooting](references/troubleshooting.md) · [Templates](examples/workflow-templates.json)

**When to read references:**
- **Historical parameter examples from the older fine-grained surface** → [MCP Tools Reference](references/mcp-tools-reference.md) (legacy only; use current MCP definitions for the live surface)
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
| **Create** | `create_workflow` | Create an empty workflow shell |
| **Build** | `sim_build` or `sim_plan` → `sim_edit` | Make workflow changes through the current editing surface |
| **Execute / Test** | `sim_test`, `run_workflow`, `run_workflow_until_block`, `run_block`, `run_from_block` | Verify full or partial behavior without deploying |
| **Inspect** | `list_workspaces`, `list_workflows`, `get_workflow`, `get_deployed_workflow_state` | Discover workflows and compare draft vs deployed state |
| **Deploy** | `sim_deploy`, `generate_api_key` | Expose a workflow externally after draft verification |
| **Debug** | `sim_debug` | Diagnose failures or unexpected behavior |

---

## Tool Quick Reference

> **Historical parameter appendix only:** [MCP Tools Reference](references/mcp-tools-reference.md). For current tool names and parameters, use the live MCP definitions first.

### Create & Change

- **`create_workflow`**`({ name, workspaceId? })` → create the workflow shell first
- **`sim_build`**`({ workflowId, request })` — fastest path for most edits
- **`sim_plan`**`({ workflowId, request })` → **`sim_edit`**`({ workflowId, plan })` — use when you need an inspectable plan

### Execute & Verify

- **`sim_test`**`({ workflowId, request })` — preferred verification wrapper after builds
- **`run_workflow`**`({ workflowId, workflow_input?, useDeployedState? })` — full run
- **`run_workflow_until_block`**`({ workflowId, stopAfterBlockId, workflow_input? })` — stop after a target block
- **`run_block`**`({ workflowId, blockId, executionId? })` — isolate a single block after at least one prior run
- **`run_from_block`**`({ workflowId, startBlockId, executionId? })` — resume from a chosen block using cached upstream outputs

### Inspect, Deploy, Debug

- **`list_workspaces`**`()`, **`list_workflows`**`({ workspaceId?, folderId? })`, **`get_workflow`**`({ workflowId })`
- **`get_deployed_workflow_state`**`({ workflowId })` — compare draft vs deployed state
- **`sim_deploy`**`({ workflowId, request })` · **`generate_api_key`**`({ name, workspaceId? })`
- **`sim_debug`**`({ workflowId, error })` — use when a run fails and you need diagnosis

### Using MCP Tools Correctly

- Block IDs must be unique within a workflow
- Create or modify the draft workflow first, then test it before deploying
- For condition/router blocks: define the condition or route set before verifying branch behavior
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

## Quick Start: Create → Build → Test

```
// 1. Create workflow
create_workflow({ name: "My Workflow", workspaceId: "825eaf6a-..." })
→ { id: "wf_new" }

// 2. Build or modify it
sim_build({
  workflowId: "wf_new",
  request: "Create a start → agent → response workflow that processes the incoming payload and returns JSON."
})

// 3. Test the draft workflow
sim_test({
  workflowId: "wf_new",
  request: "Run one draft test with input {\"message\":\"Test\"} and verify the response path."
})

// 4. If you need the raw run result
run_workflow({ workflowId: "wf_new", workflow_input: { message: "Test" } })
```

> [Conditional branching pattern](references/block-types.md#condition-branching-deep-dive) · [Debug failures](references/troubleshooting.md#debug-workflow-pattern)

---

## Debugging

1. **Inspect draft state:** `get_workflow({ workflowId })`
2. **Run verification:** `sim_test({ workflowId, request: "test the failing path and summarize the trace" })`
3. **Escalate diagnosis:** `sim_debug({ workflowId, error: "<exact error text>" })`

> [Full debug guide](references/troubleshooting.md) · [Error diagnosis table](references/troubleshooting.md#error-diagnosis-table)

---

## Critical Warnings

| ⚠️ Mistake | Fix |
|-----------|-----|
| Wrong trigger type | `start_trigger` for `"api"/"manual"/"chat"/"mcp"/"a2a"`, `generic_webhook` for `"webhook"`, `schedule` for `"schedule"` |
| Block ID in tags | Use **display name**: `<Agent 1.content>` not `<block_id.content>` |
| Missing API key | Set both `apiKey` and `model` on agent blocks |
| **OpenRouter + temperature** | Do **not** rely on a blanket OpenRouter rule here. Provider/model support can vary. If a run fails, follow the provider error and retry with provider defaults instead of assuming every `openrouter/*` model rejects `temperature`. |
| Wrong condition handles | Use `"condition-{conditionId}"` NOT `"true"`/`"false"` |
| Response returns `{}` | Set `dataMode` to `"json"` before setting `data` |
| `inputData is not defined` | Use `<BlockName.field>` tag syntax; `params` is always `{}` |
| Function `.output` | Use `.result` — output is `{ result: ..., stdout: "" }` |
| No `systemPrompt` subblock | Use `messages` array with `{"role":"system"}` |

---

## Cheatsheet

**Minimum viable workflow:**
```
create_workflow → sim_build → sim_test → run_workflow (optional raw execution) → sim_deploy (only if external access is needed)
```

**Tag syntax:** `<BlockName.field>` (block output) · `<variable.name>` (workflow var) · `{{ENV_VAR}}` (env)

**Draft-first rule:** prefer `sim_test` / `run_workflow` on draft state before deploying

**Block positioning:** Trigger x=100, Processing x=400-700, Response x=900+, Branch spacing y±150
