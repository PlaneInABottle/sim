# ========================================
# Base Stage: Debian-based Bun with Node.js 22
# ========================================
# - Node.js 22 is required for isolated-vm worker execution at runtime
# - Build toolchain needed for dependencies compilation
FROM oven/bun:1.3.10-slim AS base

# Install Node.js 22 and common dependencies once in base stage
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt,sharing=locked \
    apt-get update && apt-get install -y --no-install-recommends \
    python3 python3-pip python3-venv make g++ curl ca-certificates bash ffmpeg \
    && curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

# ========================================
# Dependencies Stage: Install Dependencies
# ========================================
FROM base AS deps
WORKDIR /app

COPY package.json bun.lock turbo.json ./
RUN mkdir -p apps packages/db packages/testing packages/logger packages/tsconfig
COPY apps/sim/package.json ./apps/sim/package.json
COPY packages/db/package.json ./packages/db/package.json
COPY packages/testing/package.json ./packages/testing/package.json
COPY packages/logger/package.json ./packages/logger/package.json
COPY packages/tsconfig/package.json ./packages/tsconfig/package.json

# Install turbo globally, then dependencies, then rebuild isolated-vm for Node.js
# Use --linker=hoisted for flat node_modules layout (required for Docker multi-stage builds)
RUN --mount=type=cache,id=bun-cache,target=/root/.bun/install/cache \
    --mount=type=cache,id=npm-cache,target=/root/.npm \
    bun install -g turbo && \
    HUSKY=0 bun install --omit=dev --ignore-scripts --linker=hoisted && \
    cd node_modules/isolated-vm && npx node-gyp rebuild --release

# ========================================
# Builder Stage: Build the Application
# ========================================
FROM base AS builder
WORKDIR /app

# Install turbo globally (cached for fast reinstall)
RUN --mount=type=cache,id=bun-cache,target=/root/.bun/install/cache \
    bun install -g turbo

# Copy node_modules from deps stage (cached if dependencies don't change)
COPY --from=deps /app/node_modules ./node_modules

# Copy package configuration files (needed for build)
COPY package.json bun.lock turbo.json ./
COPY apps/sim/package.json ./apps/sim/package.json
COPY packages/db/package.json ./packages/db/package.json
COPY packages/testing/package.json ./packages/testing/package.json
COPY packages/logger/package.json ./packages/logger/package.json

# Copy workspace configuration files (needed for turbo)
COPY apps/sim/next.config.ts ./apps/sim/next.config.ts
COPY apps/sim/tsconfig.json ./apps/sim/tsconfig.json
COPY apps/sim/tailwind.config.ts ./apps/sim/tailwind.config.ts
COPY apps/sim/postcss.config.mjs ./apps/sim/postcss.config.mjs

# Copy source code (changes most frequently - placed last to maximize cache hits)
COPY apps/sim ./apps/sim
COPY packages ./packages

# Required for standalone nextjs build
WORKDIR /app/apps/sim
RUN --mount=type=cache,id=bun-cache,target=/root/.bun/install/cache \
    HUSKY=0 bun install sharp --linker=hoisted

ENV NEXT_TELEMETRY_DISABLED=1 \
    VERCEL_TELEMETRY_DISABLED=1 \
    DOCKER_BUILD=1

WORKDIR /app

# Provide dummy database URL during image build so server code that imports @sim/db
# can be evaluated without crashing. Runtime environments MUST override this.
ARG DATABASE_URL="postgres://build:build@localhost:5432/build"
ENV DATABASE_URL=${DATABASE_URL}

# Provide dummy NEXT_PUBLIC_APP_URL for build-time evaluation
# Runtime environments should override this with the actual URL
ARG NEXT_PUBLIC_APP_URL="http://localhost:3000"
ENV NEXT_PUBLIC_APP_URL=${NEXT_PUBLIC_APP_URL}

RUN bun run build

# ========================================
# Runner Stage: Run the actual app
# ========================================

FROM base AS runner
WORKDIR /app

# Runtime deps are installed in the runtime base stage
ENV NODE_ENV=production

# Create non-root user and group
RUN groupadd -g 1001 nodejs && \
    useradd -u 1001 -g nodejs nextjs

# Copy application artifacts from builder
COPY --from=builder --chown=nextjs:nodejs /app/apps/sim/public ./apps/sim/public
COPY --from=builder --chown=nextjs:nodejs /app/apps/sim/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/sim/.next/static ./apps/sim/.next/static

# Copy isolated-vm native module (compiled for Node.js in deps stage)
COPY --from=deps --chown=nextjs:nodejs /app/node_modules/isolated-vm ./node_modules/isolated-vm

# Copy database package and migration dependencies for preDeployCommand
# Only copy necessary files: config, migrations, package.json, and core source files
COPY --from=builder --chown=nextjs:nodejs /app/package.json ./package.json
COPY --from=builder --chown=nextjs:nodejs /app/bun.lock ./bun.lock
COPY --from=builder --chown=nextjs:nodejs /app/packages/db/drizzle.config.ts ./packages/db/drizzle.config.ts
COPY --from=builder --chown=nextjs:nodejs /app/packages/db/drizzle-local.config.ts ./packages/db/drizzle-local.config.ts
COPY --from=builder --chown=nextjs:nodejs /app/packages/db/migrations ./packages/db/migrations
COPY --from=builder --chown=nextjs:nodejs /app/packages/db/local-migrations ./packages/db/local-migrations
COPY --from=builder --chown=nextjs:nodejs /app/packages/db/package.json ./packages/db/package.json
COPY --from=builder --chown=nextjs:nodejs /app/packages/db/index.ts ./packages/db/index.ts
COPY --from=builder --chown=nextjs:nodejs /app/packages/db/schema.ts ./packages/db/schema.ts
COPY --from=builder --chown=nextjs:nodejs /app/packages/db/tsconfig.json ./packages/db/tsconfig.json
COPY --from=builder --chown=nextjs:nodejs /app/packages/db/constants.ts ./packages/db/constants.ts
COPY --from=builder --chown=nextjs:nodejs /app/packages/tsconfig ./packages/tsconfig

# Copy migration deps from builder to avoid workspace install in runtime image
# drizzle-kit also requires esbuild/esbuild-register + scoped deps to load TS config at runtime
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/drizzle-kit ./node_modules/drizzle-kit
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/@drizzle-team ./node_modules/@drizzle-team
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/@esbuild-kit ./node_modules/@esbuild-kit
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/esbuild ./node_modules/esbuild
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/esbuild-register ./node_modules/esbuild-register
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/drizzle-orm ./node_modules/drizzle-orm
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/postgres ./node_modules/postgres

# Copy the isolated-vm worker script
COPY --from=builder --chown=nextjs:nodejs /app/apps/sim/lib/execution/isolated-vm-worker.cjs ./apps/sim/lib/execution/isolated-vm-worker.cjs

# Guardrails setup with pip caching
COPY --from=builder --chown=nextjs:nodejs /app/apps/sim/lib/guardrails/requirements.txt ./apps/sim/lib/guardrails/requirements.txt
COPY --from=builder --chown=nextjs:nodejs /app/apps/sim/lib/guardrails/validate_pii.py ./apps/sim/lib/guardrails/validate_pii.py

# Create .next/cache directory with correct ownership and switch to non-root user
# before creating venv to avoid inefficient chown of venv directory
RUN mkdir -p apps/sim/.next/cache && \
    chown -R nextjs:nodejs apps/sim/.next/cache

# Switch to non-root user before creating venv (avoids chown of venv directory)
USER nextjs

# Install Python dependencies with pip cache mount for faster rebuilds
# Now venv is created with correct ownership from the start
RUN --mount=type=cache,target=/home/nextjs/.cache/pip,uid=1001,gid=1001 \
    python3 -m venv ./apps/sim/lib/guardrails/venv && \
    ./apps/sim/lib/guardrails/venv/bin/pip install --upgrade pip && \
    ./apps/sim/lib/guardrails/venv/bin/pip install -r ./apps/sim/lib/guardrails/requirements.txt

EXPOSE 3000
ENV PORT=3000 \
    HOSTNAME="0.0.0.0"

# Bun-native HEALTHCHECK to avoid adding curl/wget to the runtime image
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD bun -e "fetch('http://127.0.0.1:' + (process.env.PORT || 3000) + '/').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["bun", "apps/sim/server.js"]
