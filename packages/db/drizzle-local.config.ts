import type { Config } from 'drizzle-kit'

/**
 * Drizzle config for fork-only custom tables (budget system).
 *
 * These migrations live in `local-migrations/` — a directory that upstream
 * never touches. This eliminates sequential-index collisions on every rebase.
 *
 * Run order: upstream `migrations/` first, then `local-migrations/`.
 * The `db:migrate` npm script chains both automatically.
 */
export default {
  out: './local-migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
} satisfies Config
