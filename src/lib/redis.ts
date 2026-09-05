import { Redis } from 'ioredis';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';

export const redis = new Redis(env.REDIS_URL, {
  keyPrefix: `${env.REDIS_PREFIX}:`,
  maxRetriesPerRequest: 3,
  lazyConnect: true,
  // Upstash and other managed providers require TLS on rediss:// URLs.
  ...(env.REDIS_URL.startsWith('rediss://') ? { tls: {} } : {}),
});

redis.on('error', (error) => logger.error({ err: error }, 'Redis error'));
redis.on('connect', () => logger.info('Redis connected'));

export async function connectRedis(): Promise<void> {
  if (redis.status === 'ready' || redis.status === 'connecting') return;
  await redis.connect();
}

/** Reads a JSON value from cache, returning null on a miss or malformed entry. */
export async function cacheGet<T>(key: string): Promise<T | null> {
  const raw = await redis.get(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    await redis.del(key);
    return null;
  }
}

export async function cacheSet(
  key: string,
  value: unknown,
  ttlSeconds = env.REDIS_TTL_SECONDS,
): Promise<void> {
  await redis.set(key, JSON.stringify(value), 'EX', ttlSeconds);
}

export async function cacheDel(key: string): Promise<void> {
  await redis.del(key);
}

/** Fetches through the cache: returns the cached value or computes and stores it. */
export async function cached<T>(
  key: string,
  loader: () => Promise<T>,
  ttlSeconds = env.REDIS_TTL_SECONDS,
): Promise<T> {
  const hit = await cacheGet<T>(key);
  if (hit !== null) return hit;

  const value = await loader();
  await cacheSet(key, value, ttlSeconds);
  return value;
}
