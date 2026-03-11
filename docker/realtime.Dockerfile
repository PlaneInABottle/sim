# ========================================
# Base Stage: Alpine Linux with Bun
# ========================================
FROM oven/bun:1.3.10-alpine AS base

# ========================================
# Dependencies Stage: Install Dependencies
# ========================================
FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

COPY package.json bun.lock turbo.json ./
RUN mkdir -p apps packages/db packages/logger packages/testing packages/tsconfig
COPY apps/sim/package.json ./apps/sim/package.json
COPY packages/db/package.json ./packages/db/package.json
COPY packages/logger/package.json ./packages/logger/package.json
COPY packages/testing/package.json ./packages/testing/package.json
COPY packages/tsconfig/package.json ./packages/tsconfig/package.json

# Install dependencies with hoisted layout for Docker compatibility.
# Realtime runs TypeScript directly, so we must include devDependencies (e.g. @sim/tsconfig) for tsconfig extends/paths resolution.
# Using --linker=hoisted to avoid .bun directory symlinks that don't copy between stages.
RUN --mount=type=cache,id=bun-cache,target=/root/.bun/install/cache \
    bun install --ignore-scripts --linker=hoisted

# ========================================
# Builder Stage: Prepare source code
# ========================================
FROM base AS builder
WORKDIR /app

# Copy node_modules from deps stage (cached if dependencies don't change)
COPY --from=deps /app/node_modules ./node_modules

# Copy package configuration files (needed for build)
COPY package.json bun.lock turbo.json ./
COPY apps/sim/package.json ./apps/sim/package.json
COPY packages/db/package.json ./packages/db/package.json
COPY packages/logger/package.json ./packages/logger/package.json

# Copy source code (changes most frequently - placed last to maximize cache hits)
COPY apps/sim ./apps/sim
COPY packages ./packages

# ========================================
# Runner Stage: Run the Socket Server
# ========================================
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production

# Create non-root user and group (cached separately)
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nextjs -u 1001

# Copy package.json first (changes less frequently)
COPY --from=builder --chown=nextjs:nodejs /app/package.json ./package.json
COPY --from=builder --chown=nextjs:nodejs /app/bun.lock ./bun.lock

# Copy node_modules from builder (cached if dependencies don't change)
COPY --from=builder --chown=nextjs:nodejs /app/node_modules ./node_modules

# Copy workspace packages
COPY --from=builder --chown=nextjs:nodejs /app/packages/db ./packages/db
COPY --from=builder --chown=nextjs:nodejs /app/packages/logger ./packages/logger
COPY --from=builder --chown=nextjs:nodejs /app/packages/testing ./packages/testing
COPY --from=builder --chown=nextjs:nodejs /app/packages/tsconfig ./packages/tsconfig

# Copy sim app (changes most frequently - placed last)
COPY --from=builder --chown=nextjs:nodejs /app/apps/sim ./apps/sim

# Bun expects the app workspace-local node_modules directory to exist to walk up to /app/node_modules
RUN rm -rf /app/apps/sim/node_modules /app/packages/*/node_modules && \
    mkdir -p /app/apps/sim/node_modules && \
    chown -R nextjs:nodejs /app/apps/sim/node_modules

# Switch to non-root user
USER nextjs

# Expose socket server port (default 3002, but configurable via PORT env var)
EXPOSE 3002
ENV PORT=3002 \
    SOCKET_PORT=3002 \
    HOSTNAME="0.0.0.0"

# Run from the app workspace so tsconfig baseUrl/paths (@/*, @/...) resolve correctly
WORKDIR /app/apps/sim
CMD ["bun", "socket/index.ts"]
