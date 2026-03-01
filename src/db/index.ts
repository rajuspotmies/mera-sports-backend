import { drizzle } from 'drizzle-orm/node-postgres';
import { pool } from '@/config/database';
import * as schema from './schema';

export const db = drizzle(pool, { schema });

export type DB = typeof db;
