# Reference Files — Table of Contents

Quick index for the `sim-workflow-testing` skill reference files.
Load the file relevant to your current task; avoid loading all at once.

---

## Core Testing

| File | Lines | Purpose | Load When |
|------|-------|---------|-----------|
| [testing-protocol.md](testing-protocol.md) | 101 | 6-phase workflow test protocol (PREPARE→RECORD) | Every workflow test run |
| [verification-rules.md](verification-rules.md) | 112 | Assertion patterns, profile expectations, output semantics | Validating traces and outputs |
| [payload-templates.md](payload-templates.md) | 138 | Base Chatwoot webhook template, defaults, scenario override table | Building test payloads |
| [payload-examples.md](payload-examples.md) | 166 | Full neutral JSON payload examples for common message types | Need copy-paste payload examples |

## Error Handling & Advanced

| File | Lines | Purpose | Load When |
|------|-------|---------|-----------|
| [error-recovery.md](error-recovery.md) | 172 | Error handling, rollback, batch protocol, profile transitions | Test failures or multi-scenario runs |
| [custom-tool-testing.md](custom-tool-testing.md) | 166 | Custom-tool isolation workflow, anti-patterns, lifecycle checklist | Building or validating custom tools |

## Workflow Reference

| File | Lines | Purpose | Load When |
|------|-------|---------|-----------|
| [block-management.md](block-management.md) | 95 | Workflow inventory, path mapping rules, SQL tracking schema | Preparing a workflow for testing |
| [tag-reference-patterns.md](tag-reference-patterns.md) | 248 | Tag anti-patterns, GraphQL validation errors, tool schema, pre-deploy checklist | Writing function blocks or debugging tag errors |
