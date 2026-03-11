---
name: sim-self-hosting
description: Narrow repo-local guide for Sim deployment and self-hosting operations. Use when working on self-hosted setup, deployment targets, environment-variable requirements, Docker Compose, npm package startup, Render, Helm, or other operator-facing deployment tasks that are outside local dev runtime management and general app feature development.
---

# Sim Self-Hosting

Use this skill as the deployment/self-hosting wrapper over the repo's shipped docs.
Do not use it for:

- local dev lifecycle and health checks — use `../sim-runtime/SKILL.md`
- application feature or integration development — use `../sim-app-development/SKILL.md`
- skill creation or packaging mechanics — use external authority skills

## Reference Files

- [`references/environment.md`](references/environment.md) — environment-variable guidance and target-specific notes
- [`references/deployment-targets.md`](references/deployment-targets.md) — supported deployment entrypoints documented in this repo
