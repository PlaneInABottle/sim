---
name: sim-app-development
description: Narrow repo-local guide for Sim application code changes and integration touchpoints. Use when changing the app codebase itself, adding an integration surface, tracing which directories own a feature, or applying the repository integration checklist outside workflow-only editing, runtime operations, deployment, or skill governance.
---

# Sim App Development

Use this skill for repository code changes that touch the Sim application itself.
Do not use it for:

- workflow construction via MCP tools — use `../sim-workflows/SKILL.md`
- local runtime lifecycle and health checks — use `../sim-runtime/SKILL.md`
- deployment and self-hosting operations — use `../sim-self-hosting/SKILL.md`
- skill auditing/packaging — use external authority skills
- workflow behavior verification after your code change — use `../sim-workflow-testing/SKILL.md`

## Reference File

- [`references/development-patterns.md`](references/development-patterns.md) — repo
  touchpoints, integration checklist, and where common changes usually land
