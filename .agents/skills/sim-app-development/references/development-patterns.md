# Development Patterns

Use this reference when you need the repo-local map for application and integration
work in Sim.

## Core Touchpoints

| Area | Typical Location |
|------|------------------|
| Main app | `apps/sim/` |
| Block definitions and registry | `apps/sim/blocks/` |
| Tool definitions and registry | `apps/sim/tools/` |
| Trigger handlers and registry | `apps/sim/triggers/` |
| Provider integrations | `apps/sim/providers/` |
| Execution engine | `apps/sim/executor/` |
| Shared packages | `packages/` |

## Integration Checklist

Adapt this repo checklist from `CLAUDE.md` when adding an integration:

- look up API docs
- create `tools/{service}/` with types and tools
- register tools in `tools/registry.ts`
- add the icon in `components/icons.tsx`
- create the block in `blocks/blocks/{service}.ts`
- register the block in `blocks/registry.ts`
- optionally create/register triggers under `triggers/{service}/`
- if uploads are involved, add the internal API route that handles stored files

## Boundary Rules

- If the change is mostly canvas/workflow structure or MCP block operations, switch to `sim-workflows`.
- If the change is mostly "start the app, run health checks, inspect logs", switch to `sim-runtime`.
- If the change is mostly deployment target, environment, Docker Compose, Render, Helm, or npm self-hosting, switch to `sim-self-hosting`.
- After changing app behavior that surfaces through workflows, hand off verification to `sim-workflow-testing`.

## Working Style

- Prefer existing registries and patterns over introducing new abstractions.
- Keep changes close to the owning integration/service directory.
- Verify the feature at the boundary it exposes: API route, tool output, block behavior, or UI path.
