# Block Management

Build a workflow-specific inventory before toggling blocks or asserting traces.
Do not assume block IDs, handles, or path shapes from another workflow.

---

## Table of Contents

1. [Inventory Checklist](#inventory-checklist)
2. [What to Capture](#what-to-capture)
3. [Path Mapping Rules](#path-mapping-rules)
4. [SQL Tracking Schema](#sql-tracking-schema)

---

## Inventory Checklist

For each workflow under test:

1. Fetch the workflow with `get_workflow(workflowId, verbose=false)`.
2. Record `workspaceId`, `workflowId`, workflow name, and block count.
3. Build a block map with block display name, block ID, type, and enabled state.
4. Record all condition handles you will assert against.
5. Mark the earliest block in each path so profile-specific disable lists stay minimal.
6. Mark side-effecting branch-entry blocks separately from downstream send / write / handoff blocks.

Use a workflow-local note or SQL table for this inventory when the workflow has
many branches or side-effecting integrations.

## What to Capture

Create a block table in this shape:

| Display Name | Block ID | Type | Path / Role | Enabled |
|--------------|----------|------|-------------|---------|
| `Webhook` | `<uuid>` | `generic_webhook` | Entry | `true` |
| `Route By Type` | `<uuid>` | `condition` | Router | `true` |
| `Send To Chatwoot` | `<uuid>` | `function` | Final send | `true` |

Also record:

- important source handles for each condition block
- any loop/parallel container boundaries
- the first block that enters each risky branch
- side-effecting blocks that should be disabled in `PATH_ISOLATION`
- final send / external API blocks that should stay off in `FULL_INTEGRATION`

## Path Mapping Rules

- Disable the **earliest** block in a branch when you want to suppress the whole downstream path.
- For risky workflows, disable only the **first** block that enters the risky branch unless a narrower verified exception exists.
- If a block has **multiple upstream inputs**, disabling one upstream path is not enough.
- Keep `CONDITION_ONLY`, `PATH_ISOLATION`, and `FULL_INTEGRATION` as the shared profile names.
- Store display names exactly as the workflow shows them; case and spacing matter in trace assertions.
- Snapshot original enabled state before any toggle and restore exactly after the run.
- If routing or transform logic is the target, stop before side-effecting send / write / handoff blocks instead of disabling deep downstream chains.

## SQL Tracking Schema

Use this schema to track a testing session:

```sql
CREATE TABLE IF NOT EXISTS test_runs (
    id TEXT PRIMARY KEY,
    workflow_id TEXT NOT NULL,
    workflow_name TEXT NOT NULL,
    profile TEXT NOT NULL,
    started_at TEXT DEFAULT (datetime('now')),
    completed_at TEXT,
    status TEXT DEFAULT 'running'
);

CREATE TABLE IF NOT EXISTS test_results (
    id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL REFERENCES test_runs(id),
    scenario_id TEXT NOT NULL,
    scenario_name TEXT NOT NULL,
    test_group TEXT NOT NULL,
    profile TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    execution_id TEXT,
    expected_path TEXT,
    actual_path TEXT,
    expected_output TEXT,
    actual_output TEXT,
    error_message TEXT,
    executed_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS block_snapshots (
    id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL REFERENCES test_runs(id),
    block_id TEXT NOT NULL,
    block_name TEXT NOT NULL,
    original_enabled INTEGER NOT NULL,
    test_enabled INTEGER,
    restored INTEGER DEFAULT 0
);
```
