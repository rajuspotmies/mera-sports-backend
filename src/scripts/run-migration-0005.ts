/**
 * Run migration 0005: product tracking + finalPaidAt.
 * Usage: pnpm exec tsx src/scripts/run-migration-0005.ts
 */
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { db } from '@/db';
import { sql } from 'drizzle-orm';

async function main() {
  const migrationPath = path.resolve(__dirname, '../db/migrations/0005_product_tracking_and_final_paid.sql');
  const migrationSql = fs.readFileSync(migrationPath, 'utf-8');

  await db.execute(sql.raw(migrationSql));

  console.log('\n✅ Migration 0005 complete');
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
