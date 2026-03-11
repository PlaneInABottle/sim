---
name: kamatas-workflow-testing
description: Thin Kamatas-specific wrapper for workflow verification against the repo-local checked-in Kamatas workflow snapshot/reference wrapper and scenario suite. Use when testing the Kamatas PROD workflow, comparing current Kamatas IDs or block maps against the checked-in snapshot, or running the maintained Kamatas scenarios on top of the generic sim-workflow-testing framework.
---

# Kamatas Workflow Testing

Load [`../sim-workflow-testing/SKILL.md`](../sim-workflow-testing/SKILL.md) first for
the generic testing protocol, profiles, safety rules, and payload-building workflow.
This skill only adds the Kamatas-specific checked-in snapshot/reference wrapper
and scenario suite.

## Quick Start

1. Read [`../sim-workflow-testing/SKILL.md`](../sim-workflow-testing/SKILL.md).
2. Load [`references/TABLE_OF_CONTENTS.md`](references/TABLE_OF_CONTENTS.md) to choose the
   Kamatas-specific reference you need.
3. Use `references/kamatas-test-suite.md` for scenario selection and
   `references/block-management.md` for the checked-in workflow map snapshot.

## Reference Files

- [`references/kamatas-test-suite.md`](references/kamatas-test-suite.md) — the
  Kamatas scenario matrix, profiles, and expected traces.
- [`references/block-management.md`](references/block-management.md) — the
  checked-in Kamatas workflow block map, IDs, handles, and SQL tracking schema.
