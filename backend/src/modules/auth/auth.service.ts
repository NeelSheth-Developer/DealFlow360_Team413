import { and, eq, isNull, lt, ne, or } from 'drizzle-orm';
import { env, isProduction } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { db } from '../../db/index.js';
import { customers, refreshTokens, users, type SubjectKind } from '../../db/schema.js';
import { toCustomerCode } from '../../lib/customer-code.js';
import { sendOtpEmail } from '../../lib/email.js';
import { generateRefreshToken, hashRefreshToken, signAccessToken } from '../../lib/jwt.js';
import { clearOtp, isOnCooldown, issueOtp, verifyOtp, type OtpPurpose } from '../../lib/otp.js';
import { fakeVerify, hashPassword, verifyPassword } from '../../lib/password.js';
import { ApiError } from '../../utils/api-error.js';

export type AccountType = 'internal' | 'customer';

const kindOf = (type: AccountType): SubjectKind => (type === 'internal' ? 'staff' : 'customer');

type Session = {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
};

type RequestMeta = { userAgent: string | null; ip: string | null };

// ---------------------------------------------------------------------------
// Account lookup
// ---------------------------------------------------------------------------

type Account = {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  verified: boolean;
  active: boolean;
  role?: 'sales_rep' | 'sales_manager' | 'finance' | 'admin';
  seq?: number;
  contactName?: string | null;
  tier?: 'bronze' | 'silver' | 'gold';
  currency?: string;
};

async function findAccount(type: AccountType, email: string): Promise<Account | null> {
  if (type === 'internal') {
    const [row] = await db.select().from(users).where(eq(users.email, email)).limit(1);
    if (!row) return null;
    return {
      id: row.id,
      name: row.name,
      email: row.email,
      passwordHash: row.passwordHash,
      verified: row.emailVerifiedAt !== null,
      active: row.active,
      role: row.role,
    };
  }

  const [row] = await db.select().from(customers).where(eq(customers.email, email)).limit(1);
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    passwordHash: row.passwordHash,
    verified: row.emailVerifiedAt !== null,
    active: row.active,
    seq: row.seq,
    contactName: row.contactName,
    tier: row.tier,
    currency: row.currency,
  };
}

/** The account shape returned to clients. Never includes the password hash. */
export function publicAccount(type: AccountType, account: Account) {
  if (type === 'internal') {
    return {
      user: {
        id: account.id,
        name: account.name,
        email: account.email,
        role: account.role,
      },
    };
  }

  return {
    customer: {
      id: account.id,
      customerCode: toCustomerCode(account.seq ?? 0),
      name: account.name,
      contactName: account.contactName ?? null,
      email: account.email,
      tier: account.tier,
      currency: account.currency,
    },
  };
}

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

async function createSession(
  type: AccountType,
  account: Account,
  meta: RequestMeta,
): Promise<Session> {
  const kind = kindOf(type);
  const accessToken = signAccessToken({
    sub: account.id,
    kind,
    ...(kind === 'staff' && account.role ? { role: account.role } : {}),
  });

  const refreshToken = generateRefreshToken();
  await db.insert(refreshTokens).values({
    tokenHash: hashRefreshToken(refreshToken),
    subjectId: account.id,
    subjectKind: kind,
    expiresAt: new Date(Date.now() + env.REFRESH_TOKEN_TTL_SECONDS * 1000),
    userAgent: meta.userAgent,
    ip: meta.ip,
  });

  return { accessToken, refreshToken, expiresIn: env.ACCESS_TOKEN_TTL_SECONDS };
}

/** Revokes every live refresh token for an account. Used on password reset. */
async function revokeAllSessions(subjectId: string, kind: SubjectKind): Promise<number> {
  const revoked = await db
    .update(refreshTokens)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(refreshTokens.subjectId, subjectId),
        eq(refreshTokens.subjectKind, kind),
        isNull(refreshTokens.revokedAt),
      ),
    )
    .returning({ id: refreshTokens.id });

  return revoked.length;
}

// ---------------------------------------------------------------------------
// Signup / verification
// ---------------------------------------------------------------------------

export type SignupResult =
  | { status: 'otp_sent'; code: string }
  | { status: 'signed_in'; account: Account; session: Session };

/**
 * Signup, resend-on-unverified, and login-if-already-registered all funnel through
 * here so the response cannot be used to discover which addresses exist:
 *
 *   new email                  → create + send OTP
 *   exists, not yet verified   → send a fresh OTP   (same response as new)
 *   exists, verified, correct  → sign in
 *   exists, wrong password     → 401, same message as any other credential failure
 */
export async function signup(
  type: AccountType,
  input: { name: string; email: string; password: string },
  meta: RequestMeta,
): Promise<SignupResult> {
  const existing = await findAccount(type, input.email);

  if (existing) {
    const matches = await verifyPassword(input.password, existing.passwordHash);
    if (!matches) throw ApiError.invalidCredentials();
    if (!existing.active) {
      throw ApiError.forbidden('ACCOUNT_DISABLED', 'This account is no longer active');
    }

    if (existing.verified) {
      const session = await createSession(type, existing, meta);
      return { status: 'signed_in', account: existing, session };
    }

    const code = await sendCode('signup', type, existing.email, existing.name);
    return { status: 'otp_sent', code };
  }

  const passwordHash = await hashPassword(input.password);

  if (type === 'internal') {
    // role defaults to 'sales_rep' at the database level and is never accepted
    // from the request body.
    await db.insert(users).values({ name: input.name, email: input.email, passwordHash });
  } else {
    // tier defaults to 'bronze' and currency to 'INR' at the database level.
    await db.insert(customers).values({ name: input.name, email: input.email, passwordHash });
  }

  const code = await sendCode('signup', type, input.email, input.name);
  return { status: 'otp_sent', code };
}

/** Issues a code and emails it, honouring the resend cooldown. */
async function sendCode(
  purpose: OtpPurpose,
  type: AccountType,
  email: string,
  name: string,
): Promise<string> {
  const kind = kindOf(type);
  if (await isOnCooldown(purpose, kind, email)) {
    throw ApiError.tooManyRequests(
      'OTP_RESEND_TOO_SOON',
      `Please wait ${env.OTP_RESEND_COOLDOWN_SECONDS} seconds before requesting another code`,
    );
  }

  const code = await issueOtp(purpose, kind, email);

  try {
    await sendOtpEmail({ to: email, name, code, purpose });
  } catch (error) {
    // The account row exists and the code is live in Redis, so the signup itself
    // succeeded. Failing the request here would report failure for work that was
    // actually done, and the caller could not tell the difference from a real
    // rejection. Log loudly instead; the user can request a new code.
    logger.error({ err: error, purpose }, 'OTP email delivery failed — code still issued');
  }

  return code;
}

/**
 * The OTP, but only when BOTH guards allow it: a non-production NODE_ENV and an
 * explicit opt-in flag. Two independent conditions, so a single misconfiguration
 * cannot start leaking codes to anyone who can reach the signup endpoint.
 */
export function devOtp(code: string): { devOtp?: string } {
  return !isProduction && env.EXPOSE_DEV_OTP ? { devOtp: code } : {};
}

export async function verifyOtpAndSignIn(
  type: AccountType,
  email: string,
  code: string,
  meta: RequestMeta,
): Promise<{ account: Account; session: Session }> {
  const kind = kindOf(type);
  const verdict = await verifyOtp('signup', kind, email, code);

  if (!verdict.ok) {
    if (verdict.reason === 'expired') {
      throw ApiError.gone('OTP_EXPIRED', 'That code has expired. Request a new one.');
    }
    if (verdict.reason === 'too_many_attempts') {
      throw ApiError.tooManyRequests(
        'OTP_TOO_MANY_ATTEMPTS',
        'Too many incorrect attempts. Request a new code.',
      );
    }
    throw ApiError.badRequest('OTP_INVALID', 'That code is not correct');
  }

  const account = await findAccount(type, email);
  // The code was valid, so the account existed when it was issued. If it is gone the
  // row was deleted mid-flow; fail closed rather than trusting a dangling code.
  if (!account) throw ApiError.invalidCredentials();
  if (!account.active) {
    throw ApiError.forbidden('ACCOUNT_DISABLED', 'This account is no longer active');
  }

  const verifiedAt = new Date();
  if (type === 'internal') {
    await db
      .update(users)
      .set({ emailVerifiedAt: verifiedAt, updatedAt: verifiedAt })
      .where(eq(users.id, account.id));
  } else {
    await db
      .update(customers)
      .set({ emailVerifiedAt: verifiedAt, updatedAt: verifiedAt })
      .where(eq(customers.id, account.id));
  }

  account.verified = true;
  const session = await createSession(type, account, meta);
  return { account, session };
}

export async function resendOtp(
  type: AccountType,
  email: string,
  purpose: OtpPurpose,
): Promise<string | null> {
  const account = await findAccount(type, email);
  // Silently succeed for unknown addresses so the endpoint cannot enumerate accounts.
  if (!account || !account.active) return null;
  if (purpose === 'signup' && account.verified) return null;

  return sendCode(purpose, type, account.email, account.name);
}

// ---------------------------------------------------------------------------
// Login
// ---------------------------------------------------------------------------

export async function login(
  type: AccountType,
  email: string,
  password: string,
  meta: RequestMeta,
): Promise<{ account: Account; session: Session }> {
  const account = await findAccount(type, email);

  if (!account) {
    // Same CPU cost as a real check, so response time does not reveal that the
    // address is unknown.
    await fakeVerify();
    throw ApiError.invalidCredentials();
  }

  const matches = await verifyPassword(password, account.passwordHash);
  if (!matches) throw ApiError.invalidCredentials();

  if (!account.active) {
    throw ApiError.forbidden('ACCOUNT_DISABLED', 'This account is no longer active');
  }
  if (!account.verified) {
    throw ApiError.forbidden(
      'EMAIL_NOT_VERIFIED',
      'Confirm your email address before signing in. Request a new code to continue.',
    );
  }

  const session = await createSession(type, account, meta);
  return { account, session };
}

// ---------------------------------------------------------------------------
// Refresh / logout
// ---------------------------------------------------------------------------

/**
 * Rotating refresh: the presented token is revoked and a new one issued. If a stolen
 * token is replayed after the legitimate client has already rotated, the lookup finds
 * a revoked row — and every session for that account is killed, because a replay
 * means the token leaked.
 */
export async function refresh(token: string, meta: RequestMeta): Promise<Session> {
  const tokenHash = hashRefreshToken(token);
  const [row] = await db
    .select()
    .from(refreshTokens)
    .where(eq(refreshTokens.tokenHash, tokenHash))
    .limit(1);

  if (!row) throw ApiError.unauthorized('INVALID_REFRESH_TOKEN', 'Invalid refresh token');

  if (row.revokedAt !== null) {
    const killed = await revokeAllSessions(row.subjectId, row.subjectKind);
    logger.warn(
      { subjectId: row.subjectId, kind: row.subjectKind, killed },
      'Revoked refresh token replayed — all sessions terminated',
    );
    throw ApiError.unauthorized('INVALID_REFRESH_TOKEN', 'Invalid refresh token');
  }

  if (row.expiresAt.getTime() <= Date.now()) {
    throw ApiError.unauthorized('INVALID_REFRESH_TOKEN', 'Refresh token has expired');
  }

  const type: AccountType = row.subjectKind === 'staff' ? 'internal' : 'customer';
  const account = await findAccountById(type, row.subjectId);
  if (!account || !account.active) {
    throw ApiError.forbidden('ACCOUNT_DISABLED', 'This account is no longer active');
  }

  await db
    .update(refreshTokens)
    .set({ revokedAt: new Date() })
    .where(eq(refreshTokens.id, row.id));

  return createSession(type, account, meta);
}

async function findAccountById(type: AccountType, id: string): Promise<Account | null> {
  if (type === 'internal') {
    const [row] = await db.select().from(users).where(eq(users.id, id)).limit(1);
    if (!row) return null;
    return {
      id: row.id,
      name: row.name,
      email: row.email,
      passwordHash: row.passwordHash,
      verified: row.emailVerifiedAt !== null,
      active: row.active,
      role: row.role,
    };
  }

  const [row] = await db.select().from(customers).where(eq(customers.id, id)).limit(1);
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    passwordHash: row.passwordHash,
    verified: row.emailVerifiedAt !== null,
    active: row.active,
    seq: row.seq,
    contactName: row.contactName,
    tier: row.tier,
    currency: row.currency,
  };
}

/** Idempotent: an unknown or already-revoked token still reports success. */
export async function logout(token: string): Promise<void> {
  await db
    .update(refreshTokens)
    .set({ revokedAt: new Date() })
    .where(and(eq(refreshTokens.tokenHash, hashRefreshToken(token)), isNull(refreshTokens.revokedAt)));
}

// ---------------------------------------------------------------------------
// Password reset / change
// ---------------------------------------------------------------------------

export async function forgotPassword(
  type: AccountType,
  email: string,
): Promise<string | null> {
  const account = await findAccount(type, email);
  // Always report success — otherwise this endpoint confirms which emails exist.
  if (!account || !account.active) return null;

  return sendCode('password_reset', type, account.email, account.name);
}

export async function resetPassword(
  type: AccountType,
  email: string,
  code: string,
  newPassword: string,
): Promise<{ sessionsRevoked: number }> {
  const kind = kindOf(type);
  // Checked WITHOUT consuming: if the new password turns out to be the current one,
  // the user gets to retry with the same code instead of having to request another.
  // Attempts are still counted, so this is not a free guessing window.
  const verdict = await verifyOtp('password_reset', kind, email, code, false);

  if (!verdict.ok) {
    if (verdict.reason === 'expired') {
      throw ApiError.gone('OTP_EXPIRED', 'That code has expired. Request a new one.');
    }
    if (verdict.reason === 'too_many_attempts') {
      throw ApiError.tooManyRequests(
        'OTP_TOO_MANY_ATTEMPTS',
        'Too many incorrect attempts. Request a new code.',
      );
    }
    throw ApiError.badRequest('OTP_INVALID', 'That code is not correct');
  }

  const account = await findAccount(type, email);
  if (!account) throw ApiError.invalidCredentials();

  if (await verifyPassword(newPassword, account.passwordHash)) {
    throw ApiError.badRequest('PASSWORD_REUSED', 'New password must differ from the current one');
  }

  await applyPassword(type, account.id, newPassword);
  // A reset is the recovery path after a suspected compromise, so every existing
  // session dies with it.
  const sessionsRevoked = await revokeAllSessions(account.id, kind);
  await clearOtp('password_reset', kind, email);

  return { sessionsRevoked };
}

export async function changePassword(
  kind: SubjectKind,
  id: string,
  currentPassword: string,
  newPassword: string,
  keepRefreshToken: string | null,
): Promise<{ sessionsRevoked: number }> {
  const type: AccountType = kind === 'staff' ? 'internal' : 'customer';
  const account = await findAccountById(type, id);
  if (!account) throw ApiError.invalidCredentials();

  if (!(await verifyPassword(currentPassword, account.passwordHash))) {
    throw ApiError.invalidCredentials();
  }
  if (await verifyPassword(newPassword, account.passwordHash)) {
    throw ApiError.badRequest('PASSWORD_REUSED', 'New password must differ from the current one');
  }

  await applyPassword(type, account.id, newPassword);

  // Every other session is revoked; the caller's own stays alive so changing a
  // password does not sign you out of the tab you are using.
  const keepHash = keepRefreshToken ? hashRefreshToken(keepRefreshToken) : null;
  const revoked = await db
    .update(refreshTokens)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(refreshTokens.subjectId, account.id),
        eq(refreshTokens.subjectKind, kind),
        isNull(refreshTokens.revokedAt),
        ...(keepHash ? [ne(refreshTokens.tokenHash, keepHash)] : []),
      ),
    )
    .returning({ id: refreshTokens.id });

  return { sessionsRevoked: revoked.length };
}

async function applyPassword(type: AccountType, id: string, newPassword: string): Promise<void> {
  const passwordHash = await hashPassword(newPassword);
  const now = new Date();

  if (type === 'internal') {
    await db.update(users).set({ passwordHash, updatedAt: now }).where(eq(users.id, id));
  } else {
    await db.update(customers).set({ passwordHash, updatedAt: now }).where(eq(customers.id, id));
  }
}

/** Profile for `GET /auth/me`. Customers get no role and no permission map. */
export async function me(kind: SubjectKind, id: string) {
  const type: AccountType = kind === 'staff' ? 'internal' : 'customer';
  const account = await findAccountById(type, id);
  if (!account) throw ApiError.notFound('Account not found');

  if (kind === 'staff') {
    const role = account.role ?? 'sales_rep';
    return {
      kind,
      id: account.id,
      name: account.name,
      email: account.email,
      role,
      permissions: {
        canConfigureCatalog: role === 'admin',
        canConfigureDiscounts: role === 'admin' || role === 'sales_manager',
        canApproveManagerStep: role === 'admin' || role === 'sales_manager',
        canApproveFinanceStep: role === 'admin' || role === 'finance',
        canViewReports: role !== 'sales_rep',
        canAccessBackend: role !== 'sales_rep',
      },
    };
  }

  return {
    kind,
    id: account.id,
    customerCode: toCustomerCode(account.seq ?? 0),
    name: account.name,
    email: account.email,
    tier: account.tier,
    currency: account.currency,
  };
}

// ---------------------------------------------------------------------------
// Maintenance
// ---------------------------------------------------------------------------

/** Drops expired and long-revoked rows so the table does not grow without bound. */
export async function pruneRefreshTokens(): Promise<number> {
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const deleted = await db
    .delete(refreshTokens)
    .where(or(lt(refreshTokens.expiresAt, new Date()), lt(refreshTokens.revokedAt, cutoff)))
    .returning({ id: refreshTokens.id });

  return deleted.length;
}

export { type Account };
