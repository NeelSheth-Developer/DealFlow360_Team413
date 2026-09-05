import { Redis } from '@upstash/redis';
import { env } from '../config/env.js';

/**
 * Upstash Redis over HTTP — stateless, so there is no connection to open or
 * drain and it works from serverless/edge runtimes.
 */
export const redis = new Redis({
  url: env.UPSTASH_REDIS_REST_URL,
  token: env.UPSTASH_REDIS_REST_TOKEN,
});

/** Namespaces every key so environments sharing a database cannot collide. */
export const key = (name: string) => `${env.REDIS_PREFIX}:${name}`;

/** Verifies the Upstash credentials at boot so misconfiguration fails fast. */
export async function verifyRedisConnection(): Promise<void> {
  await redis.ping();
}

/**
 * The SDK deserializes stored values automatically, so a miss and a stored
 * `null` are indistinguishable — treat both as a miss.
 */
export async function cacheGet<T>(name: string): Promise<T | null> {
  return (await redis.get<T>(key(name))) ?? null;
}

export async function cacheSet(
  name: string,
  value: unknown,
  ttlSeconds = env.REDIS_TTL_SECONDS,
): Promise<void> {
  await redis.set(key(name), value, { ex: ttlSeconds });
}

export async function cacheDel(name: string): Promise<void> {
  await redis.del(key(name));
}

/** Fetches through the cache: returns the cached value or computes and stores it. */
export async function cached<T>(
  name: string,
  loader: () => Promise<T>,
  ttlSeconds = env.REDIS_TTL_SECONDS,
): Promise<T> {
  const hit = await cacheGet<T>(name);
  if (hit !== null) return hit;

  const value = await loader();
  await cacheSet(name, value, ttlSeconds);
  return value;
}
