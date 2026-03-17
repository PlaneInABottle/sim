# Error Recovery & Advanced Patterns

Error handling, rollback procedures, and advanced testing patterns for Sim workflow testing.
Complements the core 6-phase protocol in `testing-protocol.md`.

---

## Table of Contents

1. [Error Handling](#error-handling)
2. [Rollback Procedure](#rollback-procedure)
3. [Multi-Scenario Batch Protocol](#multi-scenario-batch-protocol)
4. [Profile Transition Protocol](#profile-transition-protocol)

---

## Error Handling

### Test Execution Fails

If a draft test run (`execute_workflow`, `run_block`, or `run_from_block`) returns an error:

1. Record the failing request, payload, and exact error text
2. Reproduce once with the same draft path so the failure is deterministic
3. Diagnose with `get_execution_logs` / `get_execution_log_detail` or the current verification surface
4. Retry once only if the issue is clearly payload- or input-shape-related
5. Mark the scenario as `error` if it still fails after one evidence-based retry

### Legacy Block-State Recovery (historical only)

The current default testing flow does **not** require block toggles, block
snapshots, or restore loops. The notes below are only for older sessions that
already used `toggle_block_enabled` and snapshot tables before the workflow
surface moved to the current `validate_workflow` / `execute_workflow` / `run_*` pattern.

If a historical `toggle_block_enabled` step fails:

1. Retry the toggle operation once
2. If still failing, fetch the workflow to check current state
3. If the block doesn't exist, the workflow may have been modified — abort test run
4. Report the issue and any un-restored blocks

### Legacy Partial Restore Failure (historical only)

If some historically toggled blocks can't be restored:

1. List all un-restored blocks clearly
2. Try restoring each one individually
3. If all individual attempts fail, report the list of blocks needing manual restoration
4. **Never leave a test run without attempting restore**

### Agent Session Interruption

If the agent session is interrupted mid-test:

1. On next session, first re-run the failing draft scenario with the current
   `validate_workflow` / `execute_workflow` surface to confirm whether manual recovery is
   still needed
2. Only if the interrupted run was using the older block-snapshot workflow,
   check for un-completed test runs:
   ```sql
   SELECT * FROM test_runs WHERE status = 'running';
   ```
3. For each running historical test, check block snapshots:
   ```sql
   SELECT block_id, block_name FROM block_snapshots
   WHERE run_id = '<RUN_ID>' AND restored = 0 AND test_enabled IS NOT NULL;
   ```
4. Restore any un-restored blocks immediately
5. Mark the test run as `error`

---

## Legacy Rollback Procedure (historical only)

Use this section only when you are cleaning up an older run that already relied
on block toggles and snapshot tables. It is **not** part of the default current
testing workflow.

### Emergency Full Rollback (If Restore Phase Fails Catastrophically)

**Situation:** All blocks remain disabled; restore operations failed completely.

> ⚠️ **WARNING:** This procedure sets ALL blocks to `enabled=true`, regardless of their
> original state. If any blocks were intentionally disabled before testing, this will
> change production state. **Use Selective Rollback (below) instead when snapshot data
> is available.** Only use Emergency Full Rollback when no snapshot exists.

**Procedure:**

1. Fetch the workflow state:
   ```
   get_workflow(workflowId="<WORKFLOW_ID>", verbose=false)
   ```

2. For each block returned where enabled=false (or where it should be true):
   ```
   toggle_block_enabled(
       workflowId="<WORKFLOW_ID>",
       blockId="<BLOCK_ID>",
       enabled=true
   )
   ```
   Repeat for all blocks that should be enabled.

3. Verify full restore:
   ```
   get_workflow(workflowId="<WORKFLOW_ID>", verbose=false)
   ```
   Check: zero blocks with enabled=false

4. Report: "Emergency rollback complete. All blocks restored to enabled=true."

### Selective Rollback (From Snapshot)

1. Query the block_snapshots table to get all disabled blocks and their original_enabled values:
   ```
   SELECT block_id, original_enabled FROM block_snapshots WHERE run_id='<RUN_ID>' AND restored=0
   ```

2. For each row returned:
   ```
   toggle_block_enabled(
       workflowId="<WORKFLOW_ID>",
       blockId="<BLOCK_ID>",
       enabled=<ORIGINAL_ENABLED>
   )
   ```

3. After each toggle, update the snapshot:
   ```
   UPDATE block_snapshots SET restored=1 WHERE run_id='<RUN_ID>' AND block_id='<BLOCK_ID>'
   ```

4. Verify all blocks are restored:
   ```
   SELECT COUNT(*) as unrestored FROM block_snapshots WHERE run_id='<RUN_ID>' AND restored=0
   -- Should return 0
   ```

---

## Legacy Multi-Scenario Batch Protocol (historical only)

When running multiple scenarios under the same historical block-toggle profile:

1. **Snapshot once** — All blocks have the same starting state
2. **Disable once** — Same blocks disabled for all scenarios in the profile
3. **Execute each scenario** — One at a time, capturing each execution ID
4. **Verify each result** — Independently check trace spans per scenario
5. **Restore once** — After ALL scenarios complete

```
PREPARE → CONFIGURE → [EXECUTE → VERIFY] × N scenarios → RESTORE → RECORD
```

This saves time by avoiding repeated disable/restore cycles for the same profile.

### Error Handling During Batch

If a scenario errors (draft run fails, assertion fails, etc.):

1. Record the error in test_results
2. **CONTINUE to the next scenario** (do NOT restore yet, do NOT abort)
3. Keep all blocks disabled for the next scenario
4. Only restore after ALL scenarios complete OR on a CRITICAL error

**CRITICAL Error** = toggle/block-state operation fails, workflow structure changed mid-batch, or the MCP surface itself errors
**NON-CRITICAL Error** = draft run timeout, assertion mismatch, empty response

Example: 3 scenarios, Scenario 1 fails assertion → continue to Scenario 2, keep disabled, test Scenario 2, restore after Scenario 3 completes.

---

## Legacy Profile Transition Protocol (historical only)

When switching between historical test profiles (e.g., CONDITION_ONLY → PATH_ISOLATION):

1. **Restore all blocks** from the previous profile
2. **Verify restoration** — All blocks back to original state
3. **Start a new test run** — New run ID, new profile
4. **Snapshot again** — Even though states should be the same
5. **Disable per new profile** — Different block set

Never switch profiles without restoring first.
