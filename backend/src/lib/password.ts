import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from 'node:crypto';

/**
 * `promisify` drops scrypt's options overload, so the wrapper is written by hand to
 * keep the cost parameters typed.
 */
function scryptAsync(
  password: string,
  salt: Buffer,
  keylen: number,
  options: ScryptOptions,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, keylen, options, (err, derived) => {
      if (err) reject(err);
      else resolve(derived);
    });
  });
}

/**
 * scrypt parameters. N=2^15 keeps a single hash around ~100ms on typical hardware,
 * which is the point: it makes offline brute-forcing of a leaked hash expensive.
 * The values are stored inside every hash string so they can be raised later without
 * invalidating existing passwords.
 */
const N = 32768;
const R = 8;
const P = 1;
const KEY_LEN = 64;
const SALT_LEN = 16;

/** Node caps scrypt memory at 32MB by default; N=32768 needs more than that. */
const MAX_MEM = 128 * 1024 * 1024;

/** `scrypt$N$r$p$salt$hash`, all binary parts base64url. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LEN);
  const derived = await scryptAsync(password, salt, KEY_LEN, {
    N,
    r: R,
    p: P,
    maxmem: MAX_MEM,
  });

  return ['scrypt', N, R, P, salt.toString('base64url'), derived.toString('base64url')].join('$');
}

/**
 * Constant-time verification. Returns false rather than throwing on a malformed
 * stored hash, so a corrupt row denies access instead of crashing the request.
 */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;

  const n = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  if (!Number.isInteger(n) || !Number.isInteger(r) || !Number.isInteger(p)) return false;

  const salt = Buffer.from(parts[4] ?? '', 'base64url');
  const expected = Buffer.from(parts[5] ?? '', 'base64url');
  if (salt.length === 0 || expected.length === 0) return false;

  try {
    const derived = await scryptAsync(password, salt, expected.length, {
      N: n,
      r,
      p,
      maxmem: MAX_MEM,
    });

    return timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

/**
 * Burns roughly the same CPU as a real verification. Called when an email does not
 * exist so that "no such user" and "wrong password" take the same time — otherwise
 * response latency alone reveals which addresses are registered.
 */
export async function fakeVerify(): Promise<void> {
  await scryptAsync('dummy-password', randomBytes(SALT_LEN), KEY_LEN, {
    N,
    r: R,
    p: P,
    maxmem: MAX_MEM,
  });
}
