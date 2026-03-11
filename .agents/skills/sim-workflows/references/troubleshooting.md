# Troubleshooting Reference

Detailed troubleshooting guide for workflow MCP operations. Exact tool names may
drift; prefer the current `run_*`, `sim_test`, and `sim_debug` surface exposed by
the app repo over older legacy names.

---

## Error Diagnosis Table

| Issue | Cause | Solution |
|-------|-------|----------|
| "No start block found" | Wrong trigger type for a workflow run | Use `start_trigger` for normal API/manual/chat/MCP/A2A runs, `generic_webhook` for webhook executions, and `schedule` for scheduled execution |
| "Block not found" | Block was deleted or ID is wrong | Call `get_workflow` to verify current block IDs |
| "Invalid block type" | Misspelled type name | Check the Block Types Reference |
| "Edge already exists" | Duplicate source→target connection | Check existing edges with `get_workflow` first |
| Execution returns no output | Missing response block or broken edge chain | Verify all blocks are connected; set `dataMode` to `"json"` on response block |
| "missing required fields: API Key" | Agent block missing API key | Set `apiKey` and `model` subBlocks — both required (validated at runtime when block executes) |
| Workflow edit has no effect | Draft change was applied to the wrong field or not applied through the current editing surface | Re-check the current build/edit result, then verify the expected field names in SKILL.md or block-types before re-testing |
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

### Step 1: Reproduce the failure

```
sim_test({
  workflowId: "wf_abc",
  request: "Run the failing scenario on the draft workflow and summarize the failing path."
})
```

### Step 2: Inspect the specific failure

```
sim_debug({ workflowId: "wf_abc", error: "<exact error text from the failed run>" })
→ Use the diagnosis plus the failing path summary to identify the broken block
```

### Step 3: Fix the block configuration

```
Apply the fix through the current workflow-editing surface (`sim_build` or
`sim_plan` → `sim_edit`), then confirm the draft state before re-running.
```

### Step 4: Re-run to verify

```
run_workflow({ workflowId: "wf_abc", workflow_input: { ... } })
```

---

## Execute and Monitor Pattern

```
Step 1: Execute the workflow
run_workflow({
  workflowId: "wf_new",
  workflow_input: { message: "Test payload" }
})
→ returns execution result

Step 2: Ask for a verification summary
sim_test({
  workflowId: "wf_new",
  request: "Run the same payload on the draft workflow and summarize the block path, outputs, and any errors."
})
→ returns a verification summary for the run

Step 3: Debug a specific failure if needed
sim_debug({ workflowId: "wf_new", error: "<error text>" })
→ returns root-cause analysis and likely fixes
```
