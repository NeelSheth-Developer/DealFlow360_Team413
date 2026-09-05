import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import { env } from '../config/env.js';
import { key, redis } from './redis.js';
import type { OtpPurpose } from './otp-purpose.js';
import type { SubjectKind } from '../db/schema.js';

export type { OtpPurpose };

export type OtpVerdict =
  | { ok: true }
  | { ok: false; reason: 'invalid' | 'expired' | 'too_many_attempts' };

/**
 * Codes live in Redis rather than Postgres: they are short-lived, high-churn, and
 * Redis expires them for us, so there is no sweeper job and no way to forget one.
 */
const otpKey = (purpose: OtpPurpose, kind: SubjectKind, email: string) =>
  key(`otp:${purpose}:${kind}:${email}`);

const attemptsKey = (purpose: OtpPurpose, kind: SubjectKind, email: string) =>
  key(`otp:attempts:${purpose}:${kind}:${email}`);

const cooldownKey = (purpose: OtpPurpose, kind: SubjectKind, email: string) =>
  key(`otp:cooldown:${purpose}:${kind}:${email}`);

/** Uniformly distributed 6-digit code. `randomInt` is CSPRNG-backed; `Math.random` is not. */
function generateCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}

/**
 * Stored as an HMAC rather than in the clear, so a Redis dump cannot be replayed to
 * take over an account mid-signup. Keyed by purpose and email, so a code minted for a
 * password reset cannot be spent on a signup.
 */
function fingerprint(code: string, purpose: OtpPurpose, kind: SubjectKind, email: string): string {
  return createHmac('sha256', env.JWT_SECRET)
    .update(`${purpose}:${kind}:${email}:${code}`)
    .digest('hex');
}

/** True when a code was requested within the cooldown window. */
export async function isOnCooldown(
  purpose: OtpPurpose,
  kind: SubjectKind,
  email: string,
): Promise<boolean> {
  return (await redis.exists(cooldownKey(purpose, kind, email))) === 1;
}

/**
 * Issues a code, replacing any previous one for the same purpose — so an attacker
 * cannot keep several live codes in flight. Attempt counter resets with it.
 */
export async function issueOtp(
  purpose: OtpPurpose,
  kind: SubjectKind,
  email: string,
): Promise<string> {
  const code = generateCode();
  const ttl = env.OTP_TTL_SECONDS;

  await Promise.all([
    redis.set(otpKey(purpose, kind, email), fingerprint(code, purpose, kind, email), { ex: ttl }),
    redis.del(attemptsKey(purpose, kind, email)),
    redis.set(cooldownKey(purpose, kind, email), '1', { ex: env.OTP_RESEND_COOLDOWN_SECONDS }),
  ]);

  return code;
}

/**
 * Single-use: a correct code is destroyed immediately, so it cannot be replayed.
 * A wrong code burns an attempt, and the code is destroyed once the limit is hit —
 * that turns an unlimited guessing game into at most five tries per issued code.
 */
export async function verifyOtp(
  purpose: OtpPurpose,
  kind: SubjectKind,
  email: string,
  code: string,
  /**
   * When false the code survives a successful check, so the caller can run further
   * validation before spending it. Attempts are still counted either way.
   */
  consume = true,
): Promise<OtpVerdict> {
  const stored = await redis.get<string>(otpKey(purpose, kind, email));
  if (!stored) return { ok: false, reason: 'expired' };

  const attempts = await redis.incr(attemptsKey(purpose, kind, email));
  if (attempts === 1) {
    await redis.expire(attemptsKey(purpose, kind, email), env.OTP_TTL_SECONDS);
  }

  if (attempts > env.OTP_MAX_ATTEMPTS) {
    await clearOtp(purpose, kind, email);
    return { ok: false, reason: 'too_many_attempts' };
  }

  const expected = Buffer.from(stored, 'hex');
  const actual = Buffer.from(fingerprint(code, purpose, kind, email), 'hex');
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    return { ok: false, reason: 'invalid' };
  }

  if (consume) await clearOtp(purpose, kind, email);
  return { ok: true };
}

export async function clearOtp(
  purpose: OtpPurpose,
  kind: SubjectKind,
  email: string,
): Promise<void> {
  await Promise.all([
    redis.del(otpKey(purpose, kind, email)),
    redis.del(attemptsKey(purpose, kind, email)),
  ]);
}
