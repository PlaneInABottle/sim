---
name: sim-runtime
description: Comprehensive guide for starting, monitoring, and managing the Sim Studio development environment. Use when the AI agent needs to (1) start or stop the development servers, (2) check service health and readiness, (3) monitor logs for errors, (4) run database migrations, (5) troubleshoot runtime issues such as port conflicts or crashes, (6) manage the complete development lifecycle. Covers PostgreSQL via Docker Compose, Next.js app and Socket.io server via native bun, health checks, and process management.
---

# Sim Runtime

Manage the Sim Studio development environment: PostgreSQL in Docker, Next.js app + Socket.io server running natively via `bun run dev:full`.

## Architecture

```text
┌─────────────────────────────────────────────┐
│  Docker Compose (docker-compose.local.yml)  │
│  ┌────────────────────────────────────────┐  │
│  │  PostgreSQL (pgvector/pgvector:pg17)   │  │
│  │  Port: 5432 (localhost only)           │  │
│  │  Volume: postgres_data (persistent)    │  │
│  └────────────────────────────────────────┘  │
└─────────────────────────────────────────────┘

┌─────────────────────────────────────────────┐
│  Native (bun run dev:full via concurrently) │
│  ┌──────────────────┐ ┌──────────────────┐  │
│  │ Next.js App      │ │ Socket.io Server │  │
│  │ Port: 3000       │ │ Port: 3002       │  │
│  │ HMR: 50-200ms    │ │ /health endpoint │  │
│  └──────────────────┘ └──────────────────┘  │
└─────────────────────────────────────────────┘
```

Native dev is 3-5x faster than Docker volumes on macOS (50-200ms HMR vs 200-800ms). Database in Docker is reliable with persistent volumes and auto-restart.

## Prerequisites

- **bun** installed globally
- **Docker** and Docker Compose installed and running
- `.env` file at `apps/sim/.env` (copy from `apps/sim/.env.example`)
- Core env vars: `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `NEXT_PUBLIC_APP_URL`, `ENCRYPTION_KEY`, `INTERNAL_API_SECRET`
- Optional / deployment-specific security var: `API_ENCRYPTION_KEY` (not required by the local env schema; if you set it, use a 64-character hex string)

## Starting the Environment

### Step 1: Start PostgreSQL

**Check if already running:**
```bash
docker compose -f docker-compose.local.yml ps db
```

If already running and healthy, skip to Step 2. Otherwise:

```bash
docker compose -f docker-compose.local.yml up db -d
```

Wait for healthy status (~5 seconds):

```bash
docker compose -f docker-compose.local.yml exec db pg_isready -U postgres
```

Expected: `localhost:5432 - accepting connections`

### Step 2: Run Database Migrations

```bash
bun run --cwd packages/db db:migrate
```

Run from repo root. The `db:migrate` script lives in `packages/db/package.json`, not the workspace root package. It runs both upstream migrations (`drizzle.config.ts`) and local fork migrations (`drizzle-local.config.ts`). Requires `DATABASE_URL` in `apps/sim/.env`.

### Step 3: Start App + Socket Server

If you want the server to survive agent shutdown, use async mode with detach:

```text
bash(command: "bun run dev:full", mode="async", detach=true)
```

**Important:** `detach=true` ensures the server survives agent shutdown. Use plain async (without detach) when you specifically need `read_bash` / `stop_bash` control during the same session.

### Step 4: Verify Services Are Ready

**Socket server** (ready first, ~5-10s):

```bash
curl -s http://localhost:3002/health
```

Expected: `{"status":"ok","timestamp":"...","connections":N}`

**Next.js app** (ready in ~15-30s):

```bash
curl -s http://localhost:3000/api/health
```

Expected: `{"status":"ok","timestamp":"..."}`

> **Note:** The socket health endpoint returns three fields: `status` (`"ok"` or `"error"`), `timestamp` (ISO 8601), and `connections` (active connection count). On error it returns HTTP 503 with `{"status":"error","message":"Health check failed"}`.

If curl fails, the server is still compiling. Wait 10s and retry. If you started the process without detach, monitor with `read_bash`. If you started it detached, rely on health checks and the redirected log file instead.

### Step 5: Confirm All Running

Run the health check script:

```bash
bash .agents/skills/sim-runtime/scripts/check-health.sh
```

## Health Checks

| Service | Command | Expected | Timing |
|---------|---------|----------|--------|
| PostgreSQL | `docker compose -f docker-compose.local.yml exec db pg_isready -U postgres` | `accepting connections` | ~5s |
| Socket | `curl -s http://localhost:3002/health` | `{"status":"ok","timestamp":"...","connections":N}` | ~5-10s |
| App | `curl -s http://localhost:3000/api/health` | `{"status":"ok",...}` | ~15-30s |

## Monitoring Logs

**App + Socket logs:** Detached processes redirect output to a temporary log file. Tail that file directly:
```bash
tail -f /var/folders/.../T/copilot-detached-*.log
```

**Best practice:** Use health checks (curl endpoints) instead of parsing logs to verify services are running. If you need live interactive output, start the server without detach and use `read_bash` on that session instead.

**Database logs:**

```bash
docker compose -f docker-compose.local.yml logs db --tail 50
```

**Watch for errors:** Look for lines containing `error`, `Error`, `EADDRINUSE`, `ECONNREFUSED`, or `ExitCode`.

## Common Operations

### Restart App (Keep Database)

1. Find the process: `ps aux | grep "bun run dev:full"`
2. Kill it: `kill <PID>` (detached processes cannot use `stop_bash`)
3. Restart: `bash(command: "bun run dev:full", mode="async", detach=true)`

### Stop Everything

```bash
# Stop app (detached process - use kill with PID)
ps aux | grep "bun run dev:full" | grep -v grep | awk '{print $2}' | xargs kill

# Stop database:
docker compose -f docker-compose.local.yml down
```

To also remove the database volume (destructive):

```bash
docker compose -f docker-compose.local.yml down -v
```

### Re-run Migrations

```bash
bun run --cwd packages/db db:migrate
```

### Clear Next.js Cache

```bash
rm -rf apps/sim/.next
```

Then restart the app process.

### Push Schema Changes (Dev Only)

```bash
bun run --cwd packages/db drizzle-kit push --config=./drizzle.config.ts
```

## Quick Troubleshooting

| Problem | Cause | Fix |
|---------|-------|-----|
| Port 5432 in use | Another Postgres running | `lsof -i :5432` to find PID, stop the other instance |
| Port 3000 in use | Stale Next.js process | `lsof -i :3000` to find PID, `kill <PID>` |
| Port 3002 in use | Stale socket process | `lsof -i :3002` to find PID, `kill <PID>` |
| DB connection refused | Postgres not running | `docker compose -f docker-compose.local.yml up db -d` |
| Migration fails | DB not ready or schema conflict | Check DB is healthy first; try `db:push` for dev |
| App crashes on start | Missing env vars | Check `.env` has all required vars from `.env.example` |
| `MODULE_NOT_FOUND` | Missing dependencies | Run `bun install` from repo root |
| HMR not working | Stale .next cache | `rm -rf apps/sim/.next` and restart |

**For advanced troubleshooting**, read `references/troubleshooting.md` from this skill directory.

## Resources

### scripts/

- `check-health.sh` — Check all three services are healthy. Run directly or read for command reference.
- `startup.sh` — Starts PostgreSQL, waits for DB readiness, and runs migrations. Use it as a DB/bootstrap reference; start the app and realtime server separately.

### references/

- `troubleshooting.md` — Extended troubleshooting guide with detailed diagnostic commands and edge cases. Read when the quick troubleshooting table above is insufficient.
