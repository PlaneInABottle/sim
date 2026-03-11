---
name: config-production-db
description: Current-state guide for the config_production database used by multi-tenant dynamic workflow configuration. Use when you need the authoritative schema, constraints, auth model (X-Tenant-Token), runtime query flow, or data seeding status for the existing database—not future plans.
---

# Config Production DB (Current State)

## Overview

Use this skill to answer **what exists today** in the `config_production` schema: tables, constraints, auth model, runtime query flow, and seeding status. This skill explicitly avoids future plans or discarded designs.

## Quick Usage

When asked about the DB or workflow setup:
1. Read **references/current-state.md** for the authoritative snapshot.
2. Read **references/sql-readme.md** only for historical rollout notes and auth
   context; the named SQL files are not stored in this repo.
3. Answer using current state only (no roadmap or deferred work).

## Core Facts (Current)

- Schema: `config_production` in `sim_production`
- Tables: `companies`, `platform_configs`, `agent_prompts`
- Auth: `X-Tenant-Token` header → lookup `companies.webhook_token`
- Role: `sim_workflow_reader` (read-only)
- Constraints: unique default prompt per role, 200KB prompt size limit
- Seed: Kamatas (1 company, 2 platforms, 3 prompts)

## Error Response Notes

- This skill is schema/auth focused and does **not** define a canonical HTTP error payload contract by itself.
- Error envelope details depend on the consuming service layer that queries `config_production`.
- For documentation consumers, treat this as **TBD at API layer** and document:
  - auth failure behavior for missing/invalid `X-Tenant-Token`
  - not-found behavior for unresolved tenant/platform/prompt lookups
  - internal query failure behavior

## References

- **references/current-state.md** — full schema + runtime flow (authoritative)
- **references/sql-readme.md** — historical rollout notes + auth model summary
