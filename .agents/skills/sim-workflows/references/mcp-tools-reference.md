# MCP Tools Parameter Reference

Historical appendix for the older fine-grained workflow-editing surface.
Use [SKILL.md](../SKILL.md) for the current build/test flow, and verify exact tool
names against the current MCP definitions before assuming every tool below is still
exposed unchanged.

> **Do not treat this file as the current parameter authority.** Commands such as
> `update_subblock`, `toggle_block_enabled`, `execute_workflow`,
> `get_execution_logs`, and `get_block` are retained here so older notes can be
> interpreted, but the default live workflow surface is the current sim-mcp
> workflow surface documented in [SKILL.md](../SKILL.md), especially
> `validate_workflow` → `execute_workflow` → execution-log inspection.

---

## Creation

### `list_tools`

List all available sim-mcp tools and their descriptions.

```
list_tools()
```

**Returns:** Server metadata plus the full registered tools list.

---

### `create_workflow`

Create a new empty workflow.

```
create_workflow({ name: "My Workflow", workspaceId: "ws_id" })
→ { id: "wf_abc123", name: "My Workflow" }
```

| Param | Required | Description |
|-------|----------|-------------|
| `name` | ✅ | Display name |
| `workspaceId` | ✅ | Workspace to create in |
| `description` | | Optional description |
| `color` | | Hex color (default: `#3972F6`) |
| `folderId` | | Folder placement |
| `sortOrder` | | Sort order within folder/workspace |

---

## Building

### `add_blocks`

Add one or more blocks with optional edges in a single call.

```
add_blocks({
  workflowId: "wf_abc",
  blocks: [
    { type: "agent", name: "Agent 1", position: { x: 400, y: 300 } }
  ],
  edges: [
    { id: "e1", source: "starter_id", target: "new_block_id" }
  ]
})
```

| Param | Required | Description |
|-------|----------|-------------|
| `workflowId` | ✅ | Target workflow |
| `blocks` | ✅ | Array of `{ type, name, position: {x,y}, data?, enabled?, id? }` |
| `edges` | | Optional edges to create simultaneously |

On the older fine-grained surface, blocks were often configured with
`update_subblock` after creation. Treat that as historical guidance only; use the
current workflow-editing surface documented in [SKILL.md](../SKILL.md) unless you
are intentionally maintaining an older flow.

### `add_edge`

Connect two blocks.

```
add_edge({ workflowId: "wf_abc", source: "block_a", target: "block_b" })
```

| Param | Required | Description |
|-------|----------|-------------|
| `workflowId` | ✅ | Target workflow |
| `source` | ✅ | Source block ID |
| `target` | ✅ | Target block ID |
| `sourceHandle` | | For condition/router branches (e.g., `"condition-cond_1"`, `"router-0"`) |
| `targetHandle` | | Target input handle |
| `edgeId` | | Custom edge ID |

### `add_variable`

Add a workflow variable.

```
add_variable({ workflowId: "wf_abc", name: "apiUrl", type: "string", value: "https://api.example.com" })
```

| Param | Required | Description |
|-------|----------|-------------|
| `workflowId` | ✅ | Target workflow |
| `name` | ✅ | Variable name |
| `type` | ✅ | `string`, `number`, `boolean`, `object`, `array`, `plain` |
| `value` | ✅ | Initial value |
| `id` | | Custom variable ID |

Reference in blocks: `<variable.apiUrl>`

---

## Configuration

### `update_subblock`

Set a block's configuration field. On the older fine-grained surface this was a
common post-creation edit path, but it is no longer the default workflow-editing
guidance in this skill.

```
update_subblock({
  workflowId: "wf_abc",
  blockId: "block_1",
  subblockId: "messages",
  value: [{ "role": "system", "content": "You are a helpful assistant." }]
})
```

| Param | Required | Description |
|-------|----------|-------------|
| `workflowId` | ✅ | Target workflow |
| `blockId` | ✅ | Block to configure |
| `subblockId` | ✅ | SubBlock identifier (from Block Types Reference) |
| `value` | ✅ | New value for the subblock |

**⚠️ MULTILINE VALUES — ALWAYS USE REAL NEWLINES:**

When passing multi-line content (SQL queries, JavaScript code) to `update_subblock`, you **must** use actual newline characters in the tool call parameter — **not** `\n` escape sequences.

XML/tool call parameters do NOT interpret `\n` as a newline. `\n` in XML is stored as two literal characters (backslash + n), which breaks SQL (CTE validator rejects it) and JavaScript (a `//` comment with no real newline will consume everything after it).

```
✅ CORRECT — actual line breaks in the value:
update_subblock({
  value: "WITH
recent AS (
  SELECT 1 FROM my_table
  WHERE id = '<variable.X>'
)"
})

❌ WRONG — \n escape sequences:
update_subblock({
  value: "WITH\nrecent AS (\n  SELECT 1 FROM my_table\n  WHERE id = '<variable.X>'\n)"
})
```

This also applies to `add_blocks` when setting `data.code` or any multi-line subblock value inline.

### `update_block_name`

Rename a block.

```
update_block_name({ workflowId: "wf_abc", blockId: "block_1", name: "Customer Support Agent" })
```

### `toggle_block_enabled`

Enable or disable a block in a workflow. Disabled blocks are skipped during workflow execution but retain their configuration, connections, and position.

| Param | Required | Type | Description |
|-------|----------|------|-------------|
| `workflowId` | ✅ | string | ID of the workflow containing the block |
| `blockId` | ✅ | string | ID of the block to toggle |
| `enabled` | ✅ | boolean | `true` to enable, `false` to disable |

**Returns:** `{ success: boolean, operationId: string }`

```
// Disable a block
toggle_block_enabled({ workflowId: "wf_abc", blockId: "block_1", enabled: false })

// Re-enable a block
toggle_block_enabled({ workflowId: "wf_abc", blockId: "block_1", enabled: true })
```

**Historical use cases:** Disable email/Slack/webhook blocks during testing, A/B
test branches, isolate failures. See [safe testing patterns](#disabling-blocks-for-safe-testing)
for older examples.

#### Disabling Blocks for Safe Testing (historical only)

Disabled blocks preserve configuration and connections but are skipped by the executor.

**Common use cases:**
- Test without side effects (disable email/Slack/webhook blocks)
- A/B test paths (disable one branch)
- Isolate failures (disable downstream blocks)
- Staging workflows (disable production integrations)

**Pattern:** Disable → Execute → Verify logs → Re-enable

```
toggle_block_enabled({ workflowId: "wf_abc", blockId: "slack_notify", enabled: false })
execute_workflow({ workflowId: "wf_abc", input: { message: "Test" } })
get_execution_logs({ workspaceId: "ws_123", workflowId: "wf_abc", details: "full", includeTraceSpans: true })
toggle_block_enabled({ workflowId: "wf_abc", blockId: "slack_notify", enabled: true })
```

Emits Socket.io broadcast — UI updates in real-time.

### `update_block_parent`

Set or remove a block's parent container for nesting inside loop/parallel blocks.

| Param | Required | Type | Description |
|-------|----------|------|-------------|
| `workflowId` | ✅ | string | ID of the workflow containing the block |
| `blockId` | ✅ | string | ID of the block to update |
| `parentId` | ✅ | string \| null | ID of parent container (loop/parallel) or `null` to remove |

**Returns:** `{ success: boolean, operationId: string }`

```
// Nest a block inside a loop
update_block_parent({ workflowId: "wf_abc", blockId: "agent_1", parentId: "loop_1" })

// Remove from container
update_block_parent({ workflowId: "wf_abc", blockId: "agent_1", parentId: null })
```

**Use cases:** Programmatically build loop/parallel workflows, move blocks between containers.

#### Nesting Blocks in Containers

```
// Nest agent inside loop
update_block_parent({ workflowId: "wf_abc", blockId: "agent1", parentId: "loop1" })

// Remove from container
update_block_parent({ workflowId: "wf_abc", blockId: "agent1", parentId: null })
```

Works with both `loop` and `parallel` container types.

---

## Execution

### `validate_workflow`

Run the cheap structural/minimal-handle preflight before execution.

```
validate_workflow({ workflowId: "wf_abc" })
```

What it checks:
- malformed workflow state
- broken edges
- connectivity / reachability issues
- unused variables
- locally provable handle issues

What it does **not** prove:
- runtime success
- block semantic correctness
- external API behavior
- log-free execution correctness

Recent verified behavior: the validator ignores implicit branch handles such as
`source` / `error` / `target` and dynamic condition/router/switch handles, while
still surfacing real structural issues.

### Default validation sequence

```
validate_workflow({ workflowId: "wf_abc" })
execute_workflow({ workflowId: "wf_abc", input: { ... }, useDraftState: true })
get_execution_logs({ workspaceId: "ws_id", workflowId: "wf_abc", details: "full", includeTraceSpans: true })
```

### `execute_workflow`

Run a workflow and return the result.

```
execute_workflow({
  workflowId: "wf_abc",
  input: { message: "Hello!" },
  triggerType: "api"
})
```

| Param | Required | Default | Description |
|-------|----------|---------|-------------|
| `workflowId` | ✅ | | Workflow to execute |
| `input` | | `{}` | Input data passed to trigger |
| `triggerType` | | `"api"` | Trigger type: `api`, `manual`, `schedule`, `chat`, `webhook`, `mcp`, `a2a` |
| `useDraftState` | | `true` | Use draft (unsaved) state. Set `true` to run without deploying |

**Key:** `useDraftState: true` (default) executes the current draft, so deployment is NOT required for testing.

**Return values:**
- **Success:** `{ success: true, executionId: "...", output: {...}, metadata: { duration, startTime, endTime } }`
- **Error:** `{ code: "INTERNAL_ERROR", message: "Request failed with status code 500" }` — check execution logs for details

---

## Monitoring

### `get_execution_logs`

List and filter execution logs.

```
get_execution_logs({
  workspaceId: "ws_id",
  workflowId: "wf_abc",
  level: "error",
  details: "full",
  includeTraceSpans: true,
  includeFinalOutput: true,
  limit: 10
})
```

| Param | Required | Description |
|-------|----------|-------------|
| `workspaceId` | ✅ | Workspace ID |
| `workflowId` | | Filter by workflow |
| `executionId` | | Filter by specific execution |
| `level` | | `"info"` or `"error"` |
| `details` | | `"basic"` (summary) or `"full"` (includes execution data) |
| `includeTraceSpans` | | Per-block execution traces (requires `details: "full"`) |
| `includeFinalOutput` | | Include final workflow output (requires `details: "full"`) |
| `trigger` | | Filter by trigger type |
| `startDate` / `endDate` | | ISO 8601 date range |
| `minDurationMs` / `maxDurationMs` | | Duration filters |
| `minCost` / `maxCost` | | Cost filters |
| `limit` | | Max results (default: 100) |
| `cursor` | | Pagination cursor |
| `order` | | `"desc"` (default) or `"asc"` |

### `get_execution_log_detail`

Get comprehensive detail for one execution.

```
get_execution_log_detail({ logId: "log_xyz" })
```

Returns: execution data, workflow context, cost breakdown, trace spans, final output.

---

## Inspection

### `list_workflows`

List workflows with pagination.

```
list_workflows({ workspaceId: "ws_id", limit: 50, offset: 0 })
```

### `get_workflow`

Get workflow structure (blocks, edges, variables).

```
get_workflow({ workflowId: "wf_abc", verbose: false })
```

- `verbose: false` (default): Lightweight block metadata — use for discovering block IDs and connections
- `verbose: true`: Full block config including subBlocks — WARNING: can be very large
- **Historical note:** older flows often paired `get_workflow(verbose: false)` with
  `get_block(blockId)` for targeted inspection

### `get_block`

Get full detail for a single block.

```
get_block({ workflowId: "wf_abc", blockId: "block_1" })
```

Returns complete block config including all subBlocks and their current values.

---

## Removal

### `remove_blocks`

Remove blocks and their connected edges.

```
remove_blocks({ workflowId: "wf_abc", blockIds: ["block_1", "block_2"] })
```

### `remove_edge`

Remove a connection.

```
remove_edge({ workflowId: "wf_abc", edgeId: "edge_1" })
```

### `remove_variable`

Remove a workflow variable.

```
remove_variable({ workflowId: "wf_abc", variableId: "var_1" })
```

---

## Advanced

### `replace_workflow_state`

Overwrite entire workflow state. Use for major restructuring, restoring from backup, template application. Prefer targeted operations for normal edits.

```
replace_workflow_state({ workflowId: "wf_abc", state: { blocks, edges, loops, parallels } })
```

### `update_subflow`

Update loop/parallel configuration. Subflows are created via `add_blocks` with `type: "loop"` or `type: "parallel"`. This tool only updates existing ones.

```
update_subflow({ workflowId: "wf_abc", id: "loop_1", type: "loop", config: { ... } })
```

### `list_custom_tools`

List custom tools in a workspace.

```
list_custom_tools({ workspaceId: "ws_id" })
```

### `get_custom_tool`

Get full details for a specific custom tool by ID. Returns schema and code.

```
get_custom_tool({ toolId: "tool_uuid", workspaceId: "ws_id" })
```

| Param | Required | Description |
|-------|----------|-------------|
| `toolId` | ✅ | ID of the custom tool to retrieve |
| `workspaceId` | | Workspace ID (optional if workflowId provided) |
| `workflowId` | | Workflow ID to resolve workspace |

### `upsert_custom_tools`

Create or update custom tools.

```
upsert_custom_tools({
  workspaceId: "ws_id",
  tools: [{
    title: "My Tool",
    schema: { type: "function", function: { name: "my_tool", parameters: { ... } } },
    code: "async function execute(params) { ... }"
  }]
})
```

---

## Skill Management

Manage workspace skills — reusable instruction sets for agent blocks using progressive disclosure.

### `list_skills`

List all skills in a workspace.

```
list_skills({ workspaceId: "ws_id" })
```

| Param | Required | Description |
|-------|----------|-------------|
| `workspaceId` | ✅ | Workspace ID to list skills from |

**Returns:** Array of skill metadata only: `id`, `name`, `description` (no `content`).

### `get_skill`

Get full details of a specific skill by ID, including its content.

```
get_skill({ workspaceId: "ws_id", id: "skill-uuid" })
```

| Param | Required | Description |
|-------|----------|-------------|
| `workspaceId` | ✅ | Workspace ID containing the skill |
| `id` | ✅ | ID of the skill to retrieve |

**Returns:** Full skill object with id, name, description, content, createdAt, updatedAt.

### `create_skill`

Create a new skill in a workspace.

```
create_skill({
  workspaceId: "ws_id",
  name: "sql-expert",
  description: "Expert in SQL query optimization",
  content: "You are a SQL expert specializing in..."
})
```

| Param | Required | Description |
|-------|----------|-------------|
| `workspaceId` | ✅ | Workspace ID |
| `name` | ✅ | Skill name (kebab-case, max 64 chars) |
| `description` | ✅ | Skill description |
| `content` | ✅ | Skill instructions (max 50KB) |

**Returns:** Created skill with generated UUID.

### `update_skill`

Update an existing skill.

```
update_skill({
  workspaceId: "ws_id",
  id: "skill-uuid",
  name: "sql-expert",
  description: "Updated description",
  content: "Updated instructions..."
})
```

| Param | Required | Description |
|-------|----------|-------------|
| `workspaceId` | ✅ | Workspace ID |
| `id` | ✅ | Skill ID to update |
| `name` | ✅ | Skill name (kebab-case) |
| `description` | ✅ | New description |
| `content` | ✅ | New content |

**Returns:** Updated skill.

### `delete_skill`

Delete a skill from a workspace.

```
delete_skill({ workspaceId: "ws_id", id: "skill-uuid" })
```

| Param | Required | Description |
|-------|----------|-------------|
| `workspaceId` | ✅ | Workspace ID |
| `id` | ✅ | Skill ID to delete |

**Returns:** `{ success: true }`

**⚠️ IMPORTANT:** Deletion does NOT cascade to agent blocks. After deleting a skill, you must manually remove it from any agent blocks that reference it:

```javascript
// 1. Get agent block's current skills
const block = get_block({ workflowId: "wf_id", blockId: "agent_id" })
const currentSkills = block.data.skills || []

// 2. Filter out deleted skill
const updatedSkills = currentSkills.filter(s => s.id !== "deleted_skill_id")

// 3. Update agent block
update_subblock({ 
  workflowId: "wf_id", 
  blockId: "agent_id", 
  subblockId: "skills", 
  value: updatedSkills 
})
```

**Why manual cleanup?** Skill deletion is server-side only and doesn't scan/update workflow blocks. Stale references won't cause execution errors (non-existent skills are silently skipped), but they clutter the UI and block data.

**Note:** Deleting a skill does not affect workflows that reference it — the skill ID remains in the agent block's `skills` array but will be silently skipped during execution.
