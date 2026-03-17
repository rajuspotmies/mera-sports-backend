/**
 * Run migration 0004: payment overhaul tables + enums.
 * Usage: pnpm exec tsx src/scripts/run-migration-0004.ts
 */
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { db } from '@/db';
import { sql } from 'drizzle-orm';

async function main() {
  const migrationPath = path.resolve(__dirname, '../db/migrations/0004_payment_overhaul.sql');
  const migrationSql = fs.readFileSync(migrationPath, 'utf-8');

  // IMPORTANT:
  // Do NOT split on ';' because this migration contains DO $$ ... $$ blocks
  // that include internal semicolons and EXCEPTION handlers.
  await db.execute(sql.raw(migrationSql));

  console.log('\n✅ Migration 0004 complete');
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
