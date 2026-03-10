import { Pool } from 'pg';
import { env } from './env';
import { logger } from '@/shared/utils/logger';

export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

pool.on('error', (err) => {
  logger.error('Unexpected PostgreSQL pool error', err);
});

export async function checkDatabaseConnection(): Promise<void> {
  const client = await pool.connect();
  client.release();
}
