import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { sql } from 'drizzle-orm';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import * as schema from './schema.js';

const client = neon(env.DATABASE_URL);

export const db = drizzle(client, { schema, logger: env.LOG_LEVEL === 'trace' });

/** Verifies the Neon connection at boot so misconfiguration fails fast. */
export async function verifyDatabaseConnection(): Promise<void> {
  await db.execute(sql`select 1`);
  logger.info('Neon Postgres connected');
}

export { schema };
