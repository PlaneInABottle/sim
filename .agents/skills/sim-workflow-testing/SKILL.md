---
name: sim-workflow-testing
description: >-
  Comprehensive framework for testing Sim Studio workflows via MCP tools.
  Use this as the generic default current surface for workflow verification,
  trace review, tool testing, and execution checks when no workflow-specific
  wrapper skill applies. Triggers: (1) testing a workflow, (2) verifying
  condition/routing logic, (3) checking trace spans or execution logs, (4)
  building/testing custom tools, (5) debugging block errors or tag reference
  failures, (6) running test scenarios against any Chatwoot webhook-driven
  workflow, (7) validating media handling or message routing, (8)
  pre-deployment verification, (9) GraphQL schema validation errors in ikas
  blocks, (10) "test", "verify", "execute workflow", "trace spans". Use
  block toggle/snapshot/restore guidance only for legacy cleanup or low-level
  fallback runs.
---

# Sim Workflow Testing Framework

Use this skill as the generic default current surface for Sim workflow
verification. It covers the current draft-run testing method plus the safer
fallback order for risky live webhook workflows; company-specific suites should
live in separate thin wrapper skills.

## Core Flow

```text
PREPARE → CONFIGURE → EXECUTE → VERIFY → DEBUG → RECORD
```

Use this flow first with `validate_workflow` + `execute_workflow`, then inspect
runtime evidence with `get_execution_logs` / `get_execution_log_detail`. Drop
into block-state isolation only when a workflow-specific note explicitly treats
it as a legacy or low-level fallback.

## Test Profiles

| Profile | Purpose | Typical enable set |
|---------|---------|--------------------|
| **CONDITION_ONLY** | Verify routing logic only | Trigger + condition blocks |
| **PATH_ISOLATION** | Verify one branch or subsystem | Only the target-path blocks |
| **FULL_INTEGRATION** | Verify end-to-end behavior | All required blocks except destructive final sends |

Keep these generic profile names intact when writing scenario docs or SQL tracking.
`CONDITION_ONLY` and `PATH_ISOLATION` are legacy low-level fallback labels;
`FULL_INTEGRATION` is the current end-to-end profile name, with an optional
legacy fallback toggle variant only when a workflow-specific note says so.

## Quick Start

1. Start with the safest option that can answer the question.
2. Treat `validate_workflow` as the default cheap structural preflight after workflow edits and before execution.
3. Follow the full execution sequence in [`references/testing-protocol.md`](references/testing-protocol.md).
3. Build payloads from [`references/payload-templates.md`](references/payload-templates.md).
4. Validate traces and outputs with [`references/verification-rules.md`](references/verification-rules.md).
5. Record results before moving to the next scenario; only use restore guidance if you intentionally used legacy block-state toggles.

Use workflow-local references when a repo keeps checked-in scenario suites or
snapshot notes for one specific workflow.

## Target Inventory

Before testing a workflow, record the target `workspaceId`, `workflowId`, block
names, and important condition handles for the specific workflow under test.
Use [`references/block-management.md`](references/block-management.md) to build
that inventory for the current workflow instead of relying on hard-coded IDs.

## Reference Files

See [`references/TABLE_OF_CONTENTS.md`](references/TABLE_OF_CONTENTS.md) for the
full index. Load only the files required for the current test run.

## Safety Rules

1. For risky live webhook workflows tied to real customers, do not default to live draft webhook execution.
2. Use this fallback order: static inspection → historical execution logs → `run_block` / `run_from_block` on a historical execution snapshot → live draft execution only when explicitly safe.
3. If you intentionally use legacy block toggles, snapshot and restore them even on failure.
4. Disable only the earliest block that enters the risky branch; do not fan out broad disable lists unless a workflow-specific note proves they are necessary.
5. Stop verification before side-effecting send / write / handoff blocks when routing or transforms are the target.
6. Test one scenario at a time and confirm trace spans before continuing.
7. Treat live integrations as side-effecting unless you have a proven mock path.

## Related Resources

- [`references/error-recovery.md`](references/error-recovery.md) — rollback and recovery guidance
- [`references/tag-reference-patterns.md`](references/tag-reference-patterns.md) — tag/schema debugging
- [`references/custom-tool-testing.md`](references/custom-tool-testing.md) — isolated custom-tool testing
- [`../sim-workflows/references/block-types.md`](../sim-workflows/references/block-types.md) — canonical block outputs and semantics
