import { createHash, randomBytes } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import type { Role, SubjectKind } from '../db/schema.js';

const ISSUER = 'dealflow360';

export type AccessClaims = {
  sub: string;
  kind: SubjectKind;
  /** Present only for staff. A customer token carries no role, so none can be escalated. */
  role?: Role;
};

/**
 * Short-lived (15 min) because it is a self-contained JWT the server never looks up —
 * it CANNOT be revoked. Logout, a password reset, or deactivating a user all take
 * effect on the refresh token; any access token already issued keeps working until it
 * expires. Fifteen minutes bounds that window.
 */
export function signAccessToken(claims: AccessClaims): string {
  return jwt.sign(claims, env.JWT_SECRET, {
    expiresIn: env.ACCESS_TOKEN_TTL_SECONDS,
    issuer: ISSUER,
    audience: claims.kind,
  });
}

/**
 * Verifies signature, expiry, issuer and audience. Returns null on any failure so
 * callers cannot accidentally treat a rejected token as valid.
 */
export function verifyAccessToken(token: string): AccessClaims | null {
  try {
    const payload = jwt.verify(token, env.JWT_SECRET, {
      issuer: ISSUER,
      audience: ['staff', 'customer'],
    });

    if (typeof payload === 'string' || typeof payload.sub !== 'string') return null;

    const kind = payload.kind as unknown;
    if (kind !== 'staff' && kind !== 'customer') return null;

    const role = payload.role as unknown;
    // A customer token must never carry a role, however it was minted.
    if (kind === 'customer' && role !== undefined) return null;

    return {
      sub: payload.sub,
      kind,
      ...(typeof role === 'string' ? { role: role as Role } : {}),
    };
  } catch {
    return null;
  }
}

/**
 * Opaque refresh token. Not a JWT: it is looked up server-side on every use, which
 * is exactly what makes it revocable.
 */
export function generateRefreshToken(): string {
  return randomBytes(32).toString('base64url');
}

/**
 * Only the hash is persisted, so a database leak does not hand out live sessions.
 * SHA-256 is right here (unlike for passwords): the input is 256 bits of entropy we
 * generated, so there is nothing to brute-force and no need to be slow.
 */
export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
