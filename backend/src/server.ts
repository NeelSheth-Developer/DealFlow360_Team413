import { createApp } from './app.js';
import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { verifyDatabaseConnection } from './db/index.js';
import { verifyRedisConnection } from './lib/redis.js';

async function bootstrap() {
  await verifyDatabaseConnection();
  await verifyRedisConnection();
  logger.info('Upstash Redis reachable');

  const server = createApp().listen(env.PORT, () => {
    logger.info(`Server listening on ${env.API_URL} (${env.NODE_ENV})`);
  });

  const shutdown = (signal: string) => {
    logger.info(`${signal} received, shutting down`);
    // Upstash speaks HTTP, so there is no cache connection to close here.
    server.close(() => process.exit(0));

    // Force-exit if in-flight requests refuse to drain.
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

bootstrap().catch((error) => {
  logger.fatal({ err: error }, 'Failed to start server');
  process.exit(1);
});
