# Sim Runtime — Extended Troubleshooting

## Table of Contents

- [Port Conflicts](#port-conflicts)
- [Database Issues](#database-issues)
- [Migration Failures](#migration-failures)
- [App Startup Failures](#app-startup-failures)
- [Socket Server Issues](#socket-server-issues)
- [Environment Variable Issues](#environment-variable-issues)
- [Performance Issues](#performance-issues)
- [Docker Issues](#docker-issues)

## Port Conflicts

### Diagnosing

```bash
# Check what's using each port
lsof -i :5432  # PostgreSQL
lsof -i :3000  # Next.js
lsof -i :3002  # Socket.io
```

### Resolving

Kill the specific process by PID (from `lsof` output):

```bash
kill <PID>
```

**Never use `pkill` or `killall`** — always target a specific PID.

If port 5432 is occupied by a system PostgreSQL:

```bash
# Check if it's a Docker container or system service
docker ps | grep postgres
# If system service on macOS:
brew services stop postgresql@17
```

## Database Issues

### Connection Refused

1. Check Docker is running: `docker info`
2. Check container status: `docker compose -f docker-compose.local.yml ps db`
3. Check container logs: `docker compose -f docker-compose.local.yml logs db --tail 20`
4. Restart: `docker compose -f docker-compose.local.yml restart db`

### Database Does Not Exist

```bash
# Connect and create manually
docker compose -f docker-compose.local.yml exec db psql -U postgres -c "CREATE DATABASE simstudio;"
```

### Corrupted Data / Fresh Start

```bash
docker compose -f docker-compose.local.yml down -v  # Removes volume
docker compose -f docker-compose.local.yml up db -d
# Wait for healthy, then re-run migrations
```

### Check Database Contents

```bash
docker compose -f docker-compose.local.yml exec db psql -U postgres -d simstudio -c "\dt"
```

## Migration Failures

### "relation already exists"

The migration was partially applied. Options:

1. Push schema directly (dev only): `cd packages/db && bunx drizzle-kit push --config=./drizzle.config.ts`
2. Reset database (destructive): `docker compose -f docker-compose.local.yml down -v` then restart

### "connection refused" During Migration

Database is not ready. Wait and retry:

```bash
docker compose -f docker-compose.local.yml exec db pg_isready -U postgres
# Once ready:
cd packages/db && bunx drizzle-kit migrate --config=./drizzle.config.ts
```

### Missing DATABASE_URL

Ensure `apps/sim/.env` contains:

```
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/simstudio"
```

## App Startup Failures

### MODULE_NOT_FOUND

```bash
bun install  # from repo root
```

### "ENOENT: .env"

Copy the example:

```bash
cp apps/sim/.env.example apps/sim/.env
# Edit apps/sim/.env with required values
```

### Next.js Compilation Stuck

1. Clear cache: `rm -rf apps/sim/.next`
2. Restart: `bun run dev:full`

### Out of Memory

Next.js can be memory-hungry. Check available RAM. The Docker Compose file requests 12-16GB for the app container — native dev should use less but still needs several GB free.

## Socket Server Issues

### Socket Server Won't Start

Check the socket entry point:

```bash
# Verify the file exists
ls apps/sim/socket/index.ts
```

Check for TypeScript errors:

```bash
cd apps/sim && bunx tsc --noEmit --project tsconfig.json 2>&1 | head -20
```

### Socket Health Check Fails

```bash
# Detailed check
curl -v http://localhost:3002/health
```

If connection refused, the server hasn't started yet. Check logs from the `bun run dev:full` output for `[Realtime]` prefixed lines.

## Environment Variable Issues

### Required Variables

These must be set in `apps/sim/.env` for local dev:

| Variable | Example | Generate with |
|----------|---------|--------------|
| `DATABASE_URL` | `postgresql://postgres:postgres@localhost:5432/simstudio` | N/A |
| `BETTER_AUTH_SECRET` | 64-char hex | `openssl rand -hex 32` |
| `BETTER_AUTH_URL` | `http://localhost:3000` | N/A |
| `NEXT_PUBLIC_APP_URL` | `http://localhost:3000` | N/A |
| `ENCRYPTION_KEY` | 64-char hex | `openssl rand -hex 32` |
| `INTERNAL_API_SECRET` | 64-char hex | `openssl rand -hex 32` |

Optional extra security variable for API-key encryption:

| Variable | Example | Generate with |
|----------|---------|--------------|
| `API_ENCRYPTION_KEY` | 64-char hex | `openssl rand -hex 32` |

### Generate All Secrets at Once

```bash
echo "BETTER_AUTH_SECRET=$(openssl rand -hex 32)"
echo "ENCRYPTION_KEY=$(openssl rand -hex 32)"
echo "INTERNAL_API_SECRET=$(openssl rand -hex 32)"
echo "API_ENCRYPTION_KEY=$(openssl rand -hex 32)"  # optional
```

## Performance Issues

### Slow HMR

- Native dev HMR should be 50-200ms. If slower:
  - Check disk space: `df -h`
  - Check CPU: `top -l 1 | head -10`
  - Clear `.next` cache: `rm -rf apps/sim/.next`

### High Memory Usage

- Next.js dev server can use 2-4GB
- PostgreSQL container uses ~256MB
- Socket server uses ~100-200MB
- Total expected: 3-5GB

## Docker Issues

### Docker Not Running

```bash
docker info 2>&1 | head -5
# If error: start Docker Desktop or docker daemon
```

### Container Won't Start

```bash
docker compose -f docker-compose.local.yml logs db --tail 30
```

### Stale Containers

```bash
docker compose -f docker-compose.local.yml down
docker compose -f docker-compose.local.yml up db -d
```

### Disk Space (Docker Volumes)

```bash
docker system df
# Clean unused: docker system prune (careful — removes unused resources)
```
