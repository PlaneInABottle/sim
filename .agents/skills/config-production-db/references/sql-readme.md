# Config Production SQL Rollout Notes

**Schema:** `config_production`  
**Target database in rollout notes:** `sim_production` (Render PostgreSQL)  
**Architecture label in notes:** v4.4 (Webhook Token Authentication)

---

## Source of Truth

- This file preserves rollout notes about SQL reportedly applied to production.
- The named SQL files are currently **not committed** in this repository, so
  this file is not an executable repo-local migration set.
- For current schema and constraints, use `references/current-state.md` as the
  authoritative local source.

---

## Recorded Rollout Order

The rollout notes recorded this order, but the SQL files themselves are absent
from the repo. Treat the list below as historical provenance, not runnable repo
instructions.

1. **00_preflight_checks.sql**
   - Reported safety checks before schema creation
   - Reported database-state verification

2. **01_create_schema.sql**
   - Reported creation of `config_production` schema
   - Reported `pgcrypto` enablement

3. **02_create_tables.sql**
   - Reported creation of `companies`, `platform_configs`, `agent_prompts`
   - Reported indexes, constraints, and triggers

4. **04_add_webhook_token.sql**
   - Reported `webhook_token` column addition on `companies`
   - Reported `sim_workflow_reader` read-only role creation

5. **05_seed_kamatas.sql**
   - Reported Kamatas seed data (account_id 1001)
   - Reported 2 platforms and 3 agent prompts

6. **06_security_and_integrity_fixes_v2.sql**
   - Reported webhook-token rotation
   - Reported unique constraint for default prompts
   - Reported 200KB prompt-size limit

---

## Architecture History

### v4.3 (Not Implemented)
Initially designed with Row-Level Security (RLS):
- `_auth` schema with tenant mapping
- Per-tenant database roles (`client_1001`, `client_1002`, etc.)
- RLS policies for tenant isolation

**Files created but never executed:**
- ~~`03_auth_schema_and_tenant_map.sql`~~ (deleted)
- ~~`04_rls_policies_and_grants.sql`~~ (deleted)

**Why abandoned:** PostgreSQL blocks in Sim workflows create ephemeral connections. Session-based `SET ROLE` commands don't persist. RLS approach was overly complex for the use case.

### v4.4 (Current)
Switched to webhook token authentication:
- Each company has unique `webhook_token` stored in `companies` table
- Single `sim_workflow_reader` role for all queries
- Workflow validates token → identifies tenant → queries their data
- Workflow-level tenant filtering instead of database-level RLS

---

## Authentication Model

**Webhook Flow:**
```
1. External service sends webhook with X-Tenant-Token header
2. Workflow queries: SELECT id, account_id, company_name, primary_platform_id, metadata FROM config_production.companies WHERE webhook_token = $1 LIMIT 1
3. If found: Load company's platform_configs and agent_prompts
4. If not found: Return 401 Unauthorized
```

**Database Access:**
- All queries use `sim_workflow_reader` role (read-only)
- No per-tenant roles or RLS policies
- Tenant isolation via application-level WHERE clauses

---

## Connection String

```
postgresql://sim_production_user:***@<redacted-host>:5432/sim_production
```

**Role for workflows:** `sim_workflow_reader` (read-only access to `config_production` schema)

---

## Security Notes

1. **Webhook token auth** is enforced by matching `X-Tenant-Token` to `companies.webhook_token`
2. **DB access for workflows** uses `sim_workflow_reader` (read-only role)
3. **Credentials storage field** is `platform_configs.credentials_encrypted` (application must encrypt before insert)
4. **Prompt size guardrail** is enforced by DB constraint (`chk_prompt_max_size`, 200KB)

---

*Last updated: 2026-03-04*
