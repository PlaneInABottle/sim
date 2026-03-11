# Troubleshooting Reference

Detailed troubleshooting guide for sim-mcp workflow operations. See [SKILL.md](../SKILL.md) for quick reference.

---

## Error Diagnosis Table

| Issue | Cause | Solution |
|-------|-------|----------|
| "No start block found" | Wrong trigger type for `execute_workflow` | Use `start_trigger` with `triggerType: "api"/"manual"/"chat"/"mcp"/"a2a"`, `generic_webhook` with `triggerType: "webhook"`, `schedule` with `triggerType: "schedule"` |
| "Block not found" | Block was deleted or ID is wrong | Call `get_workflow` to verify current block IDs |
| "Invalid block type" | Misspelled type name | Check the Block Types Reference |
| "Edge already exists" | Duplicate source→target connection | Check existing edges with `get_workflow` first |
| Execution returns no output | Missing response block or broken edge chain | Verify all blocks are connected; set `dataMode` to `"json"` on response block |
| "missing required fields: API Key" | Agent block missing API key | Set `apiKey` and `model` subBlocks — both required (validated at runtime when block executes) |
| Subblock update has no effect | Wrong `subblockId` | SubBlock IDs must be known from SKILL.md or block-types reference (not discoverable via `get_block` on fresh blocks) |
| Logs show no results | Wrong `workspaceId` or time range | Verify workspaceId; try without date filters first |
| Condition never matches | Wrong sourceHandle format | Use `"condition-{conditionId}"` not `"true"` / `"false"` |
| `inputData is not defined` | Wrong variable in function code | Use `<BlockName.field>` tag syntax for block references (`params` is always `{}` for regular function blocks) |
| Response block returns `{}` | Default `structured` mode ignores `data` subblock | Set `dataMode` to `"json"` before setting `data` |
| Function output not accessible | Wrong field name in tag | Function output uses `{ result: ..., stdout: "" }` — reference via `<FnName.result>` |

---

## Common Mistakes

1. **Forgetting to connect blocks** — blocks without edges won't execute
2. **Using block ID instead of display name in tags** — `<Agent 1.content>` uses the display name
3. **Not setting API keys** — agent blocks need `apiKey` subBlock configured — **hard requirement**
4. **Missing trigger block** — every workflow needs exactly one trigger
5. **Wrong sourceHandle on conditions** — use `"condition-{conditionId}"` format, NOT `"true"` / `"false"`
6. **Wrong trigger type** — `start_trigger` for API/manual/chat/MCP/A2A execution, `generic_webhook` for webhook execution, `schedule` for scheduled execution
7. **Response block in structured mode** — set `dataMode` to `"json"` for tag-based responses
8. **Using `inputData` or `params` for block data in function blocks** — `params` is always `{}` for regular function blocks; use tag syntax `<BlockName.field>` instead
9. **Referencing function output as `.output`** — the correct field is `.result` (e.g., `<MyFunc.result>`)

---

## Debug Workflow Pattern

### Step 1: Find error logs

```
get_execution_logs({
  workspaceId: "ws_id",
  workflowId: "wf_abc",
  level: "error",
  details: "full",
  includeTraceSpans: true,
  limit: 5
})
```

### Step 2: Examine the specific failure

```
get_execution_log_detail({ logId: "failed_log_id" })
→ Look at trace spans to find which block failed and why
```

### Step 3: Fix the block configuration

```
update_subblock({ workflowId: "wf_abc", blockId: "failing_block_id", subblockId: "...", value: "..." })
```

### Step 4: Re-execute to verify

```
execute_workflow({ workflowId: "wf_abc", input: { ... } })
```

---

## Execute and Monitor Pattern

```
Step 1: Execute the workflow
execute_workflow({
  workflowId: "wf_new",
  input: { message: "Test payload" },
  triggerType: "api"
})
→ returns execution result

Step 2: Check execution logs
get_execution_logs({
  workspaceId: "825eaf6a-...",
  workflowId: "wf_new",
  details: "full",
  includeTraceSpans: true,
  includeFinalOutput: true,
  limit: 5
})
→ returns logs with per-block traces, costs, outputs

Step 3: Get detail for a specific execution
get_execution_log_detail({ logId: "log_id_from_step_2" })
→ returns full trace with block-by-block execution data
```
