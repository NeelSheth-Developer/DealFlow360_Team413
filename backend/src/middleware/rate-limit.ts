import type { NextFunction, Request, Response } from 'express';
import { env } from '../config/env.js';
import { key, redis } from '../lib/redis.js';
import { ApiError } from '../utils/api-error.js';

/**
 * Fixed-window rate limiter backed by Upstash, so the limit holds across
 * instances rather than per-process.
 */
export function rateLimit(
  max = env.RATE_LIMIT_MAX_REQUESTS,
  windowSeconds = env.RATE_LIMIT_WINDOW_SECONDS,
) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const window = Math.floor(Date.now() / 1000 / windowSeconds);
      const bucket = key(`ratelimit:${req.ip}:${window}`);

      const hits = await redis.incr(bucket);
      if (hits === 1) await redis.expire(bucket, windowSeconds);

      res.setHeader('X-RateLimit-Limit', max);
      res.setHeader('X-RateLimit-Remaining', Math.max(0, max - hits));

      if (hits > max) {
        next(ApiError.tooManyRequests());
        return;
      }

      next();
    } catch {
      // An Upstash outage must not take the API down with it.
      next();
    }
  };
}
