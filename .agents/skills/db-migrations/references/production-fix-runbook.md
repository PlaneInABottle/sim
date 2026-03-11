# Production Migration Fix Runbook

Step-by-step procedure for when a Render deploy fails with database migration
errors caused by stale watermark rows or trigger pre-existence.

---

## Symptoms

| Error message | Cause |
|---------------|-------|
| `index "X" does not exist` | `DROP INDEX` for an index that was never created (the `CREATE INDEX` migration was skipped) |
| `relation "Y" already exists` | `CREATE TABLE` for a table already present (duplicate apply or manual creation) |
| `column "Z" of relation already exists` | `ALTER TABLE ADD COLUMN` for an existing column |
| `trigger "X" already exists` | `CREATE TRIGGER` (not `CREATE OR REPLACE`) for a pre-existing trigger |

All of these typically trace back to the Drizzle watermark being inflated by
stale migration rows, causing legitimate migrations to be silently skipped.

---

## Step 1: Connect to Production

```bash
source apps/sim/.env && psql "$PROD_DATABASE_URL"
```

Verify you're on the correct database:

```sql
SELECT current_database(), inet_server_addr();
```

---

## Step 2: Identify the Watermark Issue

```sql
-- Current migration count
SELECT COUNT(*) AS migration_count FROM drizzle.__drizzle_migrations;

-- Current watermark (the MAX timestamp)
SELECT MAX(created_at) AS watermark,
       to_timestamp(MAX(created_at) / 1000.0) AS watermark_human
FROM drizzle.__drizzle_migrations;

-- Last 10 rows — look for timestamp outliers
SELECT id,
       created_at,
       to_timestamp(created_at / 1000.0) AS human_time
FROM drizzle.__drizzle_migrations
ORDER BY created_at DESC
LIMIT 10;
```

**What to look for:** Rows with timestamps significantly newer than the bulk of
entries. These are the stale rows from local/fork migrations that are inflating
the watermark.

---

## Step 3: Find Last Legitimate Upstream Timestamp

Get the `when` value of the last upstream journal entry:

```bash
# Run locally (not in psql)
cat packages/db/migrations/meta/_journal.json | jq '.entries[-1].when'
```

This is the **last legitimate timestamp**. Any `__drizzle_migrations` row with
`created_at` greater than this value is a stale row that must be removed.

Cross-reference:

```sql
-- Find rows beyond the last legitimate upstream migration
-- Replace <last_upstream_when> with the value from the journal
SELECT id, created_at, to_timestamp(created_at / 1000.0) AS human_time
FROM drizzle.__drizzle_migrations
WHERE created_at > <last_upstream_when>
ORDER BY created_at;
```

---

## Step 4: Delete Stale Rows

```sql
-- ⚠️  DESTRUCTIVE — double-check the timestamp first
-- Replace <last_legit_timestamp> with the last legitimate upstream created_at
DELETE FROM drizzle.__drizzle_migrations
WHERE created_at > <last_legit_timestamp>;

-- Verify deletion
SELECT COUNT(*) FROM drizzle.__drizzle_migrations;
```

---

## Step 5: Check Which Migrations Were Skipped

Compare the journal entry count with the DB row count:

```bash
# Journal entry count (run locally)
cat packages/db/migrations/meta/_journal.json | jq '.entries | length'
```

```sql
-- DB row count
SELECT COUNT(*) FROM drizzle.__drizzle_migrations;
```

The difference tells you how many migrations were skipped and need manual
application.

To identify **which specific migrations** were skipped:

```bash
# Extract journal timestamps
jq -r '.entries[].when' packages/db/migrations/meta/_journal.json | sort > /tmp/journal.txt

# Query DB timestamps
psql "$PROD_DATABASE_URL" -t -A -c \
  "SELECT created_at FROM drizzle.__drizzle_migrations ORDER BY created_at" \
  | sort > /tmp/db.txt

# Skipped migrations (in journal but not in DB)
comm -23 /tmp/journal.txt /tmp/db.txt
```

Map each skipped timestamp back to its migration file:

```bash
# Find the tag (filename) for a given timestamp
jq -r '.entries[] | select(.when == <TIMESTAMP>) | .tag' \
  packages/db/migrations/meta/_journal.json
```

---

## Step 6: Apply Skipped Migrations Manually

For each skipped migration, apply the SQL directly:

```sql
-- Option A: Use \i to run the file (if you have local access)
\i packages/db/migrations/<tag>.sql

-- Option B: Copy-paste the SQL content into psql
-- Open the file, copy its contents, paste into psql terminal
```

**Important:** Apply migrations in order of their `idx` (ascending) to respect
dependencies between migrations.

**Watch for `statement-breakpoint` comments:** Drizzle uses
`--> statement-breakpoint` as a delimiter. When running manually in psql, these
are treated as comments and are harmless.

---

## Step 7: Fix Trigger Pre-existence (If Applicable)

If any of the skipped migrations use `CREATE TRIGGER` and the triggers already
exist (from prior hotfixes or manual intervention):

```sql
-- Drop the conflicting triggers first
DROP TRIGGER IF EXISTS user_table_rows_insert_trigger ON user_table_rows;
DROP TRIGGER IF EXISTS user_table_rows_delete_trigger ON user_table_rows;

-- Then re-apply the migration that creates them
\i packages/db/migrations/<trigger_migration_tag>.sql
```

**How to find trigger migrations:**

```bash
grep -l "CREATE TRIGGER" packages/db/migrations/*.sql
```

---

## Step 8: Insert Migration Tracking Records

After manually applying each migration, insert its tracking row so Drizzle
knows it has been applied:

```sql
-- For each manually-applied migration:
INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
VALUES (
  '<sha256_of_sql_content>',     -- SHA-256 hex digest of the .sql file
  <folderMillis_from_journal>    -- the "when" value from _journal.json
);
```

**Computing the SHA-256 hash:**

```bash
# Run locally for each migration file
sha256sum packages/db/migrations/<tag>.sql | cut -d' ' -f1
```

**Getting the `folderMillis`:**

```bash
# Find the "when" value for a specific migration
jq -r '.entries[] | select(.tag == "<tag>") | .when' \
  packages/db/migrations/meta/_journal.json
```

**Example (complete):**

```bash
# 1. Get the hash
SHA=$(sha256sum packages/db/migrations/0155_strong_spyke.sql | cut -d' ' -f1)
echo $SHA

# 2. Get the timestamp
WHEN=$(jq -r '.entries[] | select(.tag == "0155_strong_spyke") | .when' \
  packages/db/migrations/meta/_journal.json)
echo $WHEN

# 3. Insert (in psql)
# INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
# VALUES ('<SHA_value>', <WHEN_value>);
```

---

## Step 9: Verify

```sql
-- Migration count should now match journal entry count
SELECT COUNT(*) AS db_count FROM drizzle.__drizzle_migrations;

-- Watermark should equal the last journal entry's "when" value
SELECT MAX(created_at) AS watermark FROM drizzle.__drizzle_migrations;

-- Verify critical tables exist
SELECT to_regclass('public.credential_member') AS credential_member,
       to_regclass('public.workspace_budget') AS workspace_budget;

-- Verify no orphaned triggers
SELECT tgname, tgrelid::regclass
FROM pg_trigger
WHERE tgname LIKE '%user_table_rows%';
```

---

## Step 10: Redeploy

1. Go to the Render dashboard
2. Trigger a new deploy (or push a commit)
3. **Monitor the pre-deploy migration step** in the deploy logs
4. Look for: `No new migrations to apply` or successful application messages
5. Verify the application starts correctly after deployment

---

## Quick Reference: Full Recovery Script

```bash
#!/usr/bin/env bash
# Run this locally after identifying the last legitimate timestamp

set -euo pipefail

source apps/sim/.env

LAST_LEGIT=$(cat packages/db/migrations/meta/_journal.json | jq '.entries[-1].when')
echo "Last legitimate upstream timestamp: $LAST_LEGIT"

# Show stale rows
psql "$PROD_DATABASE_URL" -c "
  SELECT id, created_at, to_timestamp(created_at/1000.0) AS human_time
  FROM drizzle.__drizzle_migrations
  WHERE created_at > $LAST_LEGIT
  ORDER BY created_at;
"

echo ""
echo "To delete stale rows, run in psql:"
echo "  DELETE FROM drizzle.__drizzle_migrations WHERE created_at > $LAST_LEGIT;"
echo ""
echo "Then apply skipped migrations manually and insert tracking rows."
```

---

## Prevention

1. The dual-config setup (`drizzle.config.ts` + `drizzle-local.config.ts`)
   prevents future watermark contamination by isolating local migration
   timestamps into a separate tracking table.

2. On rebase, always accept upstream's `_journal.json` entirely.

3. After any rebase that introduces new upstream migrations, verify the
   production watermark before deploying.
