#!/usr/bin/env bash
# Complete Sim Studio startup sequence.
# Starts PostgreSQL, waits for health, runs migrations.
# Does NOT start the app — use `bun run dev:full` separately (async mode recommended for AI agents).

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
NC='\033[0m'

REPO_ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
cd "$REPO_ROOT"

COMPOSE_FILE="docker-compose.local.yml"

echo "=== Sim Studio Startup ==="

# Step 1: Start PostgreSQL
echo ""
echo -e "${YELLOW}[1/3] Starting PostgreSQL...${NC}"
docker compose -f "$COMPOSE_FILE" up db -d

# Step 2: Wait for PostgreSQL to be ready
echo -e "${YELLOW}[2/3] Waiting for PostgreSQL...${NC}"
max_attempts=30
attempt=0
until docker compose -f "$COMPOSE_FILE" exec -T db pg_isready -U postgres -q 2>/dev/null; do
    attempt=$((attempt + 1))
    if [ "$attempt" -ge "$max_attempts" ]; then
        echo -e "${RED}PostgreSQL failed to start after ${max_attempts} attempts.${NC}"
        exit 1
    fi
    sleep 1
done
echo -e "${GREEN}PostgreSQL is ready.${NC}"

# Step 3: Run migrations
echo -e "${YELLOW}[3/3] Running database migrations...${NC}"
cd packages/db
bunx drizzle-kit migrate --config=./drizzle.config.ts
bunx drizzle-kit migrate --config=./drizzle-local.config.ts
cd "$REPO_ROOT"
echo -e "${GREEN}Migrations complete.${NC}"

echo ""
echo -e "${GREEN}Database is ready.${NC}"
echo -e "Start the app with: ${YELLOW}bun run dev:full${NC}"
echo -e "Or in AI agent mode: ${YELLOW}bash(command: \"bun run dev:full\", mode=\"async\")${NC}"
