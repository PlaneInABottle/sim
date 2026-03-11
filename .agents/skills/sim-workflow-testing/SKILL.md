---
name: sim-workflow-testing
description: >-
  Comprehensive framework for testing Sim Studio workflows via MCP tools.
  Use this skill for ANY workflow testing, tool testing, or execution verification task.
  Triggers: (1) testing a workflow, (2) verifying condition/routing logic, (3) checking
  trace spans or execution logs, (4) building/testing custom tools, (5) debugging block
  errors or tag reference failures, (6) running test scenarios against any Chatwoot
  webhook-driven workflow, (7) validating media handling or message routing,
  (8) pre-deployment verification, (9) GraphQL schema validation errors in ikas blocks,
  (10) "test", "verify", "execute workflow", "trace spans", "block toggle", "snapshot".
---

# Sim Workflow Testing Framework

Use this skill as the generic default surface for Sim workflow verification.
It covers the repeatable workflow-testing method; company-specific suites should
live in separate thin wrapper skills.

## Core Flow

```text
SNAPSHOT → DISABLE → EXECUTE → VERIFY → RESTORE
```

Use this flow to test draft workflows safely without deploying changes.

## Test Profiles

| Profile | Purpose | Typical enable set |
|---------|---------|--------------------|
| **CONDITION_ONLY** | Verify routing logic only | Trigger + condition blocks |
| **PATH_ISOLATION** | Verify one branch or subsystem | Only the target-path blocks |
| **FULL_INTEGRATION** | Verify end-to-end behavior | All required blocks except destructive final sends |

Keep these generic profile names intact when writing scenario docs or SQL tracking.

## Quick Start

1. Start with **CONDITION_ONLY** unless you already proved routing.
2. Follow the full execution sequence in [`references/testing-protocol.md`](references/testing-protocol.md).
3. Build payloads from [`references/payload-templates.md`](references/payload-templates.md).
4. Validate traces and outputs with [`references/verification-rules.md`](references/verification-rules.md).
5. Restore block state and record results before moving to the next scenario.

For a workflow-specific suite and live inventory wrapper, load
[`../kamatas-workflow-testing/SKILL.md`](../kamatas-workflow-testing/SKILL.md) when applicable.

## Target Inventory

Before testing a workflow, record the target `workspaceId`, `workflowId`, block
names, and important condition handles for the specific workflow under test.
Use [`references/block-management.md`](references/block-management.md) to build
that inventory for the current workflow instead of relying on hard-coded IDs.

## Reference Files

See [`references/TABLE_OF_CONTENTS.md`](references/TABLE_OF_CONTENTS.md) for the
full index. Load only the files required for the current test run.

## Safety Rules

1. Always snapshot block state before toggling anything.
2. Always restore blocks after testing, even on failure.
3. Use `useDraftState: true` instead of deploying for verification.
4. Test one scenario at a time and confirm trace spans before continuing.
5. Treat live integrations as side-effecting unless you have a proven mock path.

## Related Resources

- [`references/error-recovery.md`](references/error-recovery.md) — rollback and recovery guidance
- [`references/tag-reference-patterns.md`](references/tag-reference-patterns.md) — tag/schema debugging
- [`references/custom-tool-testing.md`](references/custom-tool-testing.md) — isolated custom-tool testing
- [`../sim-workflows/references/block-types.md`](../sim-workflows/references/block-types.md) — canonical block outputs and semantics
