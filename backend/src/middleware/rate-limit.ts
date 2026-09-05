import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { key, redis } from '../lib/redis.js';
import { normalizeEmail } from '../lib/sanitize.js';
import { ApiError } from '../utils/api-error.js';

/**
 * Fixed-window limiter backed by Upstash, so the limit holds across instances rather
 * than per process.
 */
function limiter(options: {
  bucket: string;
  max: number;
  windowSeconds: number;
  identify: (req: Request) => string;
  failOpen: boolean;
}): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    void (async () => {
      try {
        const window = Math.floor(Date.now() / 1000 / options.windowSeconds);
        const bucketKey = key(`ratelimit:${options.bucket}:${options.identify(req)}:${window}`);

        const hits = await redis.incr(bucketKey);
        if (hits === 1) await redis.expire(bucketKey, options.windowSeconds);

        res.setHeader('X-RateLimit-Limit', options.max);
        res.setHeader('X-RateLimit-Remaining', Math.max(0, options.max - hits));

        if (hits > options.max) {
          next(ApiError.tooManyRequests());
          return;
        }
        next();
      } catch (error) {
        if (options.failOpen) {
          // A cache outage must not take the whole API down.
          logger.error({ err: error }, 'Rate limiter unavailable — allowing request');
          next();
          return;
        }
        // Credential endpoints fail CLOSED. Allowing unlimited login attempts because
        // Redis is down is worse than briefly rejecting valid ones.
        logger.error({ err: error }, 'Rate limiter unavailable — rejecting credential request');
        next(ApiError.tooManyRequests('RATE_LIMITED', 'Service temporarily unavailable'));
      }
    })();
  };
}

const clientIp = (req: Request) => req.ip ?? 'unknown';

/** Broad per-IP limit applied to every route. */
export function rateLimit(
  max = env.RATE_LIMIT_MAX_REQUESTS,
  windowSeconds = env.RATE_LIMIT_WINDOW_SECONDS,
): RequestHandler {
  return limiter({ bucket: 'global', max, windowSeconds, identify: clientIp, failOpen: true });
}

/**
 * Tight limit for credential endpoints, keyed on IP **and** the submitted email.
 * Keying on IP alone lets one attacker spread guesses across many accounts from a
 * botnet; adding the email caps attempts against any single account too.
 */
export function authRateLimit(
  max = env.AUTH_RATE_LIMIT_MAX,
  windowSeconds = env.RATE_LIMIT_WINDOW_SECONDS,
): RequestHandler {
  return limiter({
    bucket: 'auth',
    max,
    windowSeconds,
    failOpen: false,
    identify: (req) => {
      const body: unknown = req.body;
      const email =
        body && typeof body === 'object' && 'email' in body && typeof body.email === 'string'
          ? normalizeEmail(body.email).slice(0, 255)
          : 'anonymous';
      return `${clientIp(req)}:${email}`;
    },
  });
}
