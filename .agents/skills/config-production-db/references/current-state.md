# Config Production - Current State

This document describes the **current, existing** database objects and runtime logic in the `config_production` schema. It does **not** include planned or deferred work.

---

## Scope

- **Database:** `sim_production` (Render PostgreSQL)
- **Schema:** `config_production`
- **Auth model:** Webhook token lookup (no RLS)
- **Access model:** Single read-only role for workflow queries

---

## Schema Overview

### Tables

#### 1) `companies`
Core tenant table.

**Columns:**
- `id` UUID (PK)
- `account_id` INTEGER (tenant grouping; multiple companies can share an account)
- `company_name` TEXT
- `primary_platform_id` UUID (FK to `platform_configs.id`, nullable)
- `webhook_token` TEXT (unique, used for webhook authentication)
- `metadata` JSONB
- `created_at`, `updated_at`

**Indexes/Constraints:**
- `companies` PK
- `idx_companies_account_id`
- `idx_companies_webhook_token`
- FK: `primary_platform_id` -> `platform_configs.id` (ON DELETE SET NULL)
- Trigger: `set_companies_updated_at`

---

#### 2) `platform_configs`
Platform integration configuration per company.

**Columns:**
- `id` UUID (PK)
- `company_id` UUID (FK to `companies.id`)
- `platform_type` TEXT (e.g., `ikas`, `shopify`)
- `platform_name` TEXT
- `credentials_encrypted` TEXT (expects encrypted payload; encryption done at application layer)
- `config_json` JSONB
- `is_active` BOOLEAN
- `environment` TEXT (`production|staging|development|test`)
- `created_at`, `updated_at`

**Indexes/Constraints:**
- `platform_configs` PK
- `idx_platform_configs_company_id`
- `idx_platform_configs_active` (partial, active platforms)
- FK: `company_id` -> `companies.id` (ON DELETE CASCADE)
- `uq_company_platform_environment` (one platform type per company per environment)
- Trigger: `set_platform_configs_updated_at`

---

#### 3) `agent_prompts`
Agent roles and system prompts per company.

**Columns:**
- `id` UUID (PK)
- `company_id` UUID (FK to `companies.id`)
- `agent_role` TEXT (e.g., `customer_service`, `sales`)
- `agent_name` TEXT
- `system_prompt` TEXT
- `is_default` BOOLEAN
- `prompt_version` INTEGER
- `metadata` JSONB
- `created_at`, `updated_at`

**Indexes/Constraints:**
- `agent_prompts` PK
- `idx_agent_prompts_company_id`
- `idx_agent_prompts_role_default` (partial, defaults)
- `uq_agent_default_per_role` (unique default per company/role)
- `chk_agent_role_not_empty`
- `chk_prompt_version_positive`
- `chk_prompt_max_size` (max 200KB)
- FK: `company_id` -> `companies.id` (ON DELETE CASCADE)
- Trigger: `set_agent_prompts_updated_at`

---

## Security and Auth

### Webhook Token Auth (Current)
- Each company has a **unique** `webhook_token` stored in `companies.webhook_token`.
- Webhooks send the token in header: `X-Tenant-Token`.
- Workflow must lookup company by token before any config queries.

### Database Roles
- **`sim_workflow_reader`** exists and has **read-only** access to `config_production`.
- No per-tenant roles and **no RLS** are used.

### Prompt Size Limit
- `agent_prompts.system_prompt` capped at **200KB** (`chk_prompt_max_size`).

---

## Runtime Logic (Current)

Minimal workflow for dynamic configs at runtime:

1. **Webhook Trigger** receives payload + `X-Tenant-Token` header.
2. **Lookup Company**:
   ```sql
   SELECT id, account_id, company_name, primary_platform_id, metadata
   FROM config_production.companies
   WHERE webhook_token = $1
   LIMIT 1;
   ```
3. **If not found**: return `401`.
4. **Load Platform Config** (by company_id, environment, platform_type).
5. **Load Agent Prompt** (by company_id, role, is_default=true).
6. **Run Agent** with dynamic prompt and platform credentials.

---

## Current Data (Seeded)

Sample data exists for **Kamatas**:
- **1 company** (account_id 1001)
- **2 platforms** (IKAS primary, Shopify secondary)
- **3 prompts** (customer_service default, sales, support)

---

## What Is NOT Present

- No RLS / `_auth` schema
- No Redis cache
- No PgBouncer configuration
- No audit logging tables
- No token expiration/rotation automation

---

## SQL Migration History

This section preserves rollout-note filenames that were associated with the
production setup. Those SQL files are **not committed** to this repository, so
this is provenance only, not an executable repo-local runbook.

For current-state answers, treat the schema documented in this file as the
authoritative local artifact.

1. `00_preflight_checks.sql` — Reported preflight checks before schema creation
2. `01_create_schema.sql` — Reported schema and extension setup
3. `02_create_tables.sql` — Reported creation of `companies`, `platform_configs`, `agent_prompts`
4. `04_add_webhook_token.sql` — Reported webhook token column and read-only role setup
5. `05_seed_kamatas.sql` — Reported Kamatas seed step
6. `06_security_and_integrity_fixes_v2.sql` — Reported constraint and integrity hardening

---

## Notes

- `credentials_encrypted` is a **TEXT field** and expects **application-layer encryption** before insert.
- Token secrets are **not stored** in this document.
