import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as dotenv from 'dotenv';
dotenv.config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const db = drizzle(pool);

async function main() {
  try {
    console.log('Running ALTER TYPE...');
    await db.execute(`ALTER TYPE "public"."ci_status" ADD VALUE IF NOT EXISTS 'product_pending' AFTER 'paid';`);
    console.log('Successfully added product_pending to ci_status enum');
  } catch (err) {
    console.error('Migration failed:', err);
  } finally {
    await pool.end();
  }
}

main();
