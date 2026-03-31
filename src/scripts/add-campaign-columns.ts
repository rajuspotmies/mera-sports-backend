/**
 * One-off helper script to add new campaign columns to the existing database,
 * without running the full drizzle migration set (which fails because the DB
 * already has base tables like users).
 *
 * Usage:
 *   pnpm exec tsx src/scripts/add-campaign-columns.ts
 */
import 'dotenv/config';
import { sql } from 'drizzle-orm';
import { db } from '@/db';

async function main() {
  // This ALTER is idempotent because every column uses IF NOT EXISTS.
  await db.execute(sql`
    ALTER TABLE "campaigns"
      ADD COLUMN IF NOT EXISTS "creator_strategy" varchar(50),
      ADD COLUMN IF NOT EXISTS "mix_mode" boolean,
      ADD COLUMN IF NOT EXISTS "selected_tier" varchar(20),
      ADD COLUMN IF NOT EXISTS "product_details" text,
      ADD COLUMN IF NOT EXISTS "platform" varchar(50),
      ADD COLUMN IF NOT EXISTS "main_content_type" varchar(100),
      ADD COLUMN IF NOT EXISTS "content_types" text[] DEFAULT '{}'::text[] NOT NULL,
      ADD COLUMN IF NOT EXISTS "posting_type" varchar(50),
      ADD COLUMN IF NOT EXISTS "usage_rights" varchar(50),
      ADD COLUMN IF NOT EXISTS "script_type" varchar(50),
      ADD COLUMN IF NOT EXISTS "script_flow" text,
      ADD COLUMN IF NOT EXISTS "script_file_key" varchar(500),
      ADD COLUMN IF NOT EXISTS "application_deadline" timestamptz,
      ADD COLUMN IF NOT EXISTS "work_deadline" timestamptz,
      ADD COLUMN IF NOT EXISTS "script_deadline" timestamptz;
  `);

  // eslint-disable-next-line no-console
  console.log('✅ Campaign columns ensured on campaigns table');
  process.exit(0);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Failed to add campaign columns', err);
  process.exit(1);
});

