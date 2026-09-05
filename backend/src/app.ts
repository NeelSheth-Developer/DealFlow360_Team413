import type { IncomingMessage, ServerResponse } from 'node:http';
import { fileURLToPath } from 'node:url';
import compression from 'compression';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import { env, isProduction } from './config/env.js';
import { logger } from './config/logger.js';
import { errorHandler, notFoundHandler } from './middleware/error.js';
import { rateLimit } from './middleware/rate-limit.js';
import { apiRouter } from './routes.js';

export function createApp() {
  const app = express();

  app.set('trust proxy', 1);

  /**
   * Dev-only auth tester at `/`.
   *
   * Mounted BEFORE helmet so its inline styles are not blocked by the CSP, and
   * served from the API's own origin so there is no CORS hop between the page and
   * the endpoints it calls. Absent entirely in production — the guard is on
   * NODE_ENV, not on a flag someone could flip.
   */
  if (!isProduction) {
    const publicDir = fileURLToPath(new URL('../public', import.meta.url));
    app.use('/', express.static(publicDir, { index: 'index.html' }));
  }

  app.use(helmet());
  app.use(
    cors({
      origin: env.CORS_ORIGINS.includes('*') ? true : env.CORS_ORIGINS,
      credentials: true,
    }),
  );
  app.use(compression());
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true }));
  /**
   * One line per request instead of pino's full req/res dump. The serializers are
   * typed against pino's own IncomingMessage/ServerResponse rather than left as
   * `any`, so a rename in a future pino version fails the build instead of silently
   * logging `undefined`.
   */
  app.use(
    pinoHttp({
      logger,
      customSuccessMessage: (req, res) => `${req.method ?? '?'} ${req.url ?? '?'} ${res.statusCode}`,
      customErrorMessage: (req, res) => `${req.method ?? '?'} ${req.url ?? '?'} ${res.statusCode}`,
      serializers: {
        req: (req: IncomingMessage) => ({ method: req.method, url: req.url }),
        res: (res: ServerResponse) => ({ statusCode: res.statusCode }),
      },
    }),
  );

  app.use(rateLimit());

  app.use('/api/v1', apiRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
