---
name: sim-debugging
description: Production debugging workflow for this Sim deployment. Use when investigating Render-hosted incidents, missing app logs, stuck or missing workflow executions, async worker issues, SSH access problems, or production Postgres state for executions and queues.
---

# Sim Debugging

## Overview

Use this skill to debug production incidents in the self-hosted Render deployment.
Favor evidence from Render CLI output, direct SSH, and production Postgres over guesses.

## Debug Order

1. Verify Render CLI auth first.
2. Map service IDs to human-readable names.
3. Check request logs and service instances.
4. Prefer direct SSH when CLI SSH is not workable in automation.
5. Inspect production Postgres for execution and queue state.
6. Correlate execution IDs, paused executions, and async job rows before concluding the issue is "missing."

## Render CLI

- Start with `render whoami`. If it fails or shows no user, re-authenticate; CLI auth can expire.
- List services with `render services -o json` and keep the JSON output when debugging. It is the fastest way to map service IDs to names, regions, and types.
- Useful pattern: extract `service.id`, `service.name`, and region from the JSON before tailing logs or building SSH targets.
- Use `render logs <service-id>` for service stdout/stderr when available.
- Use `render services instances <service-id>` to enumerate live instances before attempting SSH.
- Session-backed service IDs can drift. Refresh them with `render services -o json`
  during the incident instead of assuming older IDs are still valid.

## SSH Strategy

- `render ssh` is interactive by design. In agent/non-interactive runs it may not let you reliably pass follow-up shell commands even when authentication is valid.
- If `render ssh <service-id>` is insufficient, prefer direct SSH using the Render SSH address from docs plus the service ID or instance slug.
- Format:
  - service: `ssh <service-id>@ssh.<region>.render.com`
  - instance: `ssh <service-id>-<instance-slug>@ssh.<region>.render.com`
- Use a custom key only when the target instance accepts it and you have a local secret path configured. Keep local secrets in gitignored files such as `.env.render`.
- If direct SSH also fails, do not loop blindly: fall back to request logs, service metadata, and database evidence.

## Production Postgres

- Connect with the checked-in guidance mirrored in the db-migrations production
  runbook:
  - `source apps/sim/.env && psql "$PROD_DATABASE_URL"`
- `apps/sim/.env` contains `PROD_DATABASE_URL` for the Render Postgres database in this repo.
- Use SQL to answer operational questions when logs are incomplete.

## Execution Tables To Check

- `workflow_execution_logs`
  - Primary record for workflow runs.
  - Important fields in schema: `execution_id`, `workflow_id`, `workspace_id`, `status`, `level`, `trigger`, `started_at`, `ended_at`, `execution_data`.
  - Status comment in schema: `running | pending | completed | failed | cancelled`.
- `paused_executions`
  - Check when a run appears to stop mid-flight.
  - Useful fields: `execution_id`, `status`, `pause_points`, `resumed_count`, `paused_at`, `expires_at`.
- `resume_queue`
  - Correlates resume attempts from paused executions.
  - Useful fields: `parent_execution_id`, `new_execution_id`, `status`, `failure_reason`.
- `async_jobs`
  - Check background work that may continue after the request path finishes.
  - Useful fields: `id`, `type`, `status`, `payload`, `run_at`, `attempts`, `error`, `output`, `metadata`.

## Correlation Workflow

1. Start from the known execution ID, request timestamp, workflow ID, or webhook payload clue.
2. Query `workflow_execution_logs` first.
3. If the execution pauses or forks, check `paused_executions` and `resume_queue`.
4. If work moved to background processing, search `async_jobs` by time window plus payload/metadata fields that mention the execution or workflow.
5. Only after the DB picture is clear, interpret missing logs as an observability gap instead of missing execution.

## When Request Logs Exist But App Stdout Does Not

- Treat request logs as proof that Render received the request, not proof that the app emitted useful stdout.
- If request logs exist but `render logs` is empty or incomplete, inspect `workflow_execution_logs` and related tables immediately.
- Check both relevant services when the path crosses boundaries: `engine` for main app/background execution orchestration and `engine-realtime` for socket/realtime symptoms.
- If neither logs nor SSH are available, preserve the time window, service ID, and any execution/job IDs you found; that evidence is enough to continue with DB-first debugging.

## Minimal SQL Patterns

```sql
-- Latest executions for a workflow or time window
SELECT execution_id, workflow_id, status, level, trigger, started_at, ended_at
FROM workflow_execution_logs
WHERE started_at > now() - interval '1 hour'
ORDER BY started_at DESC
LIMIT 50;

-- Paused executions for a known execution
SELECT execution_id, status, resumed_count, paused_at, expires_at
FROM paused_executions
WHERE execution_id = 'exec_...';

-- Resume queue rows related to that execution
SELECT parent_execution_id, new_execution_id, status, failure_reason, queued_at, completed_at
FROM resume_queue
WHERE parent_execution_id = 'exec_...' OR new_execution_id = 'exec_...'
ORDER BY queued_at DESC;

-- Recent async jobs
SELECT id, type, status, attempts, run_at, started_at, completed_at
FROM async_jobs
WHERE created_at > now() - interval '1 hour'
ORDER BY created_at DESC
LIMIT 50;
```

No bundled resources are required for this skill.
