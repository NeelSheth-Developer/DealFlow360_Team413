import { Router } from 'express';
import { sql } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { redis } from '../../lib/redis.js';
import { asyncHandler } from '../../utils/async-handler.js';
import { logger } from '../../config/logger.js';

export const healthRouter = Router();

healthRouter.get('/', (_req, res) => {
  logger.info('Health check endpoint called');
  res.json({ success: true, status: 'ok', uptime: process.uptime() });
});

/** Reports the live status of every external dependency. */
healthRouter.get(
  '/ready',
  asyncHandler(async (_req, res) => {
    const [database, cache] = await Promise.all([
      db
        .execute(sql`select 1`)
        .then(() => 'up' as const)
        .catch(() => 'down' as const),
      redis
        .ping()
        .then(() => 'up' as const)
        .catch(() => 'down' as const),
    ]);

    const healthy = database === 'up' && cache === 'up';

    res.status(healthy ? 200 : 503).json({
      success: healthy,
      services: { database, cache },
      timestamp: new Date().toISOString(),
    });
  }),
);
