import type { NextFunction, Request, Response } from 'express';
import { env } from '../config/env.js';
import { redis } from '../lib/redis.js';
import { ApiError } from '../utils/api-error.js';

/**
 * Fixed-window rate limiter backed by Redis, so the limit holds across instances.
 */
export function rateLimit(
  max = env.RATE_LIMIT_MAX_REQUESTS,
  windowSeconds = env.RATE_LIMIT_WINDOW_SECONDS,
) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const window = Math.floor(Date.now() / 1000 / windowSeconds);
      const key = `ratelimit:${req.ip}:${window}`;

      const hits = await redis.incr(key);
      if (hits === 1) await redis.expire(key, windowSeconds);

      res.setHeader('X-RateLimit-Limit', max);
      res.setHeader('X-RateLimit-Remaining', Math.max(0, max - hits));

      if (hits > max) {
        next(ApiError.tooManyRequests());
        return;
      }

      next();
    } catch {
      // A Redis outage must not take the API down with it.
      next();
    }
  };
}
