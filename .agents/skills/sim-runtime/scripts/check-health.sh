#!/usr/bin/env bash
# Check health of all Sim Studio development services.
# Exit 0 if all healthy, exit 1 if any unhealthy.

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
NC='\033[0m'

REPO_ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
COMPOSE_FILE="$REPO_ROOT/docker-compose.local.yml"

all_healthy=true

echo "=== Sim Studio Health Check ==="
echo ""

# 1. PostgreSQL
printf "PostgreSQL (5432): "
if docker compose -f "$COMPOSE_FILE" exec -T db pg_isready -U postgres -q 2>/dev/null; then
    printf "${GREEN}HEALTHY${NC}\n"
else
    printf "${RED}UNHEALTHY${NC}\n"
    all_healthy=false
fi

# 2. Socket.io Server
printf "Socket.io  (3002): "
if curl -sf http://localhost:3002/health >/dev/null 2>&1; then
    printf "${GREEN}HEALTHY${NC}\n"
else
    printf "${RED}UNHEALTHY${NC}\n"
    all_healthy=false
fi

# 3. Next.js App
printf "Next.js    (3000): "
if curl -sf http://localhost:3000/api/health >/dev/null 2>&1; then
    printf "${GREEN}HEALTHY${NC}\n"
else
    printf "${RED}UNHEALTHY${NC}\n"
    all_healthy=false
fi

echo ""

if $all_healthy; then
    echo -e "${GREEN}All services healthy.${NC}"
    exit 0
else
    echo -e "${YELLOW}Some services are not ready.${NC}"
    exit 1
fi
