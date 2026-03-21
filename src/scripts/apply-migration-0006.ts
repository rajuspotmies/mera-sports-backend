import 'dotenv/config';
import fs from 'fs/promises';
import path from 'path';
import { Client } from 'pg';

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is not set');
  }

  const migrationPath = path.resolve(
    process.cwd(),
    'src/db/migrations/0006_script_and_submission_flexible_content.sql'
  );

  const sql = await fs.readFile(migrationPath, 'utf8');
  const client = new Client({ connectionString: databaseUrl });

  await client.connect();
  try {
    console.log(`Applying migration: ${migrationPath}`);
    await client.query('BEGIN');
    await client.query(sql);
    await client.query('COMMIT');
    console.log('Migration applied successfully.');

    const verify = await client.query(`
      SELECT table_name, column_name
      FROM information_schema.columns
      WHERE table_schema='public'
        AND (
          (table_name='script_versions' AND column_name IN ('external_url','text_content','media_type'))
          OR
          (table_name='work_submissions' AND column_name IN ('version_number','external_url','text_content','media_url','media_type'))
        )
      ORDER BY table_name, column_name;
    `);

    console.table(verify.rows);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error('Migration failed:', error);
  process.exit(1);
});
