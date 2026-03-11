# Testing Protocol

Run every workflow test with the same six phases so block state is restored and
results stay comparable across sessions.

---

## Overview

```text
Phase 1: PREPARE   → identify workflow, snapshot state, choose scenario
Phase 2: CONFIGURE → apply CONDITION_ONLY / PATH_ISOLATION / FULL_INTEGRATION
Phase 3: EXECUTE   → run execute_workflow with crafted payload
Phase 4: VERIFY    → inspect trace spans, outputs, and errors
Phase 5: RESTORE   → return all toggled blocks to original state
Phase 6: RECORD    → save pass/fail notes and next actions
```

---

## Phase 1: PREPARE

1. Fetch the workflow and confirm you have the right `workflowId`.
2. Record block names, IDs, enabled states, and relevant condition handles.
3. Choose one scenario only.
4. Create SQL tracking rows if you need structured reporting.

## Phase 2: CONFIGURE

Select the lightest profile that can prove the behavior:

- **CONDITION_ONLY** — keep only trigger + condition blocks enabled.
- **PATH_ISOLATION** — keep only the path under test enabled.
- **FULL_INTEGRATION** — keep the full workflow enabled except destructive final sends.

Rules:

- Disable the earliest block in an unwanted branch when possible.
- Re-fetch the workflow after toggles and confirm the expected blocks changed.
- Do not edit logic or subblocks during a verification-only run.

## Phase 3: EXECUTE

Run `execute_workflow` with:

- `useDraftState: true`
- one crafted payload
- identifiers and message fields matched to the scenario

If the workflow has side-effecting blocks, prefer test-safe IDs or temporary mock
blocks before using `FULL_INTEGRATION`.

## Phase 4: VERIFY

Inspect:

- execution status
- trace spans
- block-level outputs
- condition selections
- final workflow output (when relevant)

Use `verification-rules.md` for assertion patterns. If the workflow fails, capture
the failing block and the exact error text before making more changes.

## Phase 5: RESTORE

Always restore all toggled blocks, even if execution fails or times out.

Minimum restore loop:

1. Re-enable the blocks you disabled.
2. Re-fetch the workflow.
3. Confirm the enabled state matches the original snapshot.

Use `error-recovery.md` if the workflow is left in an uncertain state.

## Phase 6: RECORD

Record:

- scenario ID / name
- profile used
- execution ID
- expected path vs actual path
- pass / fail / error result
- follow-up debugging steps

## Concurrency Rule

Only one agent should test a workflow at a time. Parallel block toggles corrupt
the test state and make restore steps unreliable.

## Side-Effect Rule

Assume external integrations are destructive until proven otherwise. For media
handoff, notifications, database writes, or outbound messages:

- use mock blocks when possible
- disable final sends in `FULL_INTEGRATION`
- prefer test-safe conversation IDs and sandbox endpoints
