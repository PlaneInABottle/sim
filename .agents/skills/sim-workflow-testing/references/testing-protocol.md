# Testing Protocol

Run every workflow test with the same current six phases. Block-state restore
loops belong only to older fallback runs that already used toggles.

---

## Overview

```text
Phase 1: PREPARE   → identify workflow, choose scenario, confirm current surface
Phase 2: CONFIGURE → craft the lightest safe draft-run setup
Phase 3: EXECUTE   → run `sim_test` or `run_workflow` with one crafted payload
Phase 4: VERIFY    → inspect trace spans, outputs, and errors
Phase 5: DEBUG     → use `sim_debug`; only then consider a legacy fallback
Phase 6: RECORD    → save pass/fail notes and next actions
```

---

## Phase 1: PREPARE

1. Fetch the workflow and confirm you have the right `workflowId`.
2. Record block names, IDs, and relevant condition handles when they matter for assertions or a documented fallback profile.
3. Choose one scenario only.
4. Create SQL tracking rows if you need structured reporting.

## Phase 2: CONFIGURE

Select the lightest setup that can prove the behavior:

- **Default current path** — keep the draft workflow as-is and prove behavior with one crafted payload.
- **CONDITION_ONLY** — legacy low-level fallback profile; keep only trigger + condition blocks enabled.
- **PATH_ISOLATION** — legacy low-level fallback profile; keep only the path under test enabled.
- **FULL_INTEGRATION** — current end-to-end profile; run the full workflow, disabling destructive final sends only when needed. If older notes use `FULL_INTEGRATION` for a block-toggle variant, treat that as a legacy fallback form of the same profile, not the default path.

Rules:

- Do not edit logic or subblocks during a verification-only run.
- Only use low-level block toggles when the current draft execution surface cannot isolate behavior safely.
- If you do use legacy toggles, re-fetch the workflow and confirm the expected blocks changed.

## Phase 3: EXECUTE

Run the draft workflow with `sim_test` or `run_workflow` using:

- one crafted payload
- identifiers and message fields matched to the scenario
- draft state unless you intentionally need deployed behavior

If the workflow has side-effecting blocks, prefer test-safe IDs or temporary mock
blocks before using `FULL_INTEGRATION`.

## Phase 4: VERIFY

Inspect:

- execution status
- trace spans
- block-level outputs
- condition selections
- final workflow output (when relevant)

For live-seeded verification runs:

- keep draft runs as the default path
- use live authorized entrypoints only when verifying real runtime wiring
- seed uniquely identifiable rows
- seed FK-safe parents and IDs
- capture database before/after evidence
- clean up seeded rows and restore any temporary runtime or auth changes

Use `verification-rules.md` for assertion patterns. If the workflow fails, capture
the failing block and the exact error text before making more changes.

## Phase 5: DEBUG

If the run fails, diagnose first with `sim_debug`, execution logs, and trace
spans.

1. Capture the failing block, exact error text, and payload.
2. Reproduce once on the same current draft path if the failure is ambiguous.
3. Only if the run already used block toggles, follow the historical recovery
   steps in `error-recovery.md`.

## Phase 6: RECORD

Record:

- scenario ID / name
- profile used
- execution ID
- expected path vs actual path
- pass / fail / error result
- follow-up debugging steps

## Concurrency Rule

Only one agent should actively test a workflow at a time. If a run drops into
legacy block toggles, parallel edits corrupt the test state and make recovery
unreliable.

## Side-Effect Rule

Assume external integrations are destructive until proven otherwise. For media
handoff, notifications, database writes, or outbound messages:

- use mock blocks when possible
- disable final sends in `FULL_INTEGRATION`
- prefer test-safe conversation IDs and sandbox endpoints
