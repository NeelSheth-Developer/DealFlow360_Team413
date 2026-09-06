/**
 * Auth against the real backend. Maps 1:1 onto the Auth folder of postman.json.
 *
 *   POST /auth/signup           201 = OTP sent · 200 = already verified, tokens issued
 *   POST /auth/verify-otp       confirms the 6-digit code, issues tokens
 *   POST /auth/resend-otp       60s cooldown, purpose: signup | password_reset
 *   POST /auth/login            tokens + expiresIn 900
 *   POST /auth/forgot-password  always 200, never reveals whether the email exists
 *   POST /auth/reset-password   verifies OTP, sets password, revokes ALL sessions
 *   POST /auth/change-password  authed; server keeps this session, revokes the rest
 *   POST /auth/refresh          rotating — handled inside apiClient
 *   POST /auth/logout           204, idempotent
 *   GET  /auth/me               session restore
 *
 * `type` is 'internal' for staff and 'customer' for buyers. They are two
 * separate identity spaces on the server, so it must be passed on every call.
 *
 * IMPORTANT: /auth/signup rejects role, team, tier and currency with
 * 400 FIELD_NOT_ALLOWED. Roles are assigned afterwards by an admin through
 * PATCH /users/:id — a user cannot choose their own role at signup.
 */

import { ApiError, api, clearAuthTokens, getRefreshToken, setAuthTokens } from './apiClient';
import { avatarGradient } from '@/lib/utils';

/**
 * Every auth call goes through here.
 *
 * WHY THE ACCESS TOKEN IS ATTACHED AND THE REFRESH TOKEN IS NOT
 * The API expects the bearer access token on these routes when one exists, so
 * the header is always sent if we hold a token. It is additive: an anonymous
 * visitor simply has no token, no header is set, and forgot-password still works.
 *
 * The refresh token is deliberately never used here. Refresh ROTATES — one use
 * revokes the old token — and every path below is listed in NO_REFRESH_PATHS in
 * apiClient.js, so a 401 is returned to the caller as-is instead of triggering a
 * refresh-and-retry. Attempting a refresh mid-reset would burn the token and
 * break the forgot-password flow, since reset-password revokes all sessions
 * anyway and issues no replacement.
 */
function authRequest(method, path, body) {
  return api.raw(method, path, body, true);
}

/**
 * TOKEN POLICY — which credential each auth call carries.
 *
 *   endpoint            access token (header)   refresh token (body)
 *   ─────────────────── ────────────────────── ────────────────────
 *   signup              if held                 never
 *   verify-otp          if held                 never
 *   resend-otp          if held                 never
 *   login               if held                 never
 *   forgot-password     if held                 NEVER
 *   reset-password      if held                 NEVER
 *   change-password     required                never (strict body rejects it)
 *   logout              if held                 yes — that is what it revokes
 *   refresh             no                      yes — apiClient owns this
 *
 * The reset flow is the important row. It must work for a signed-out visitor who
 * has no tokens at all, so the access token is sent only when one happens to
 * exist, and the refresh token is never involved. Sending a refresh token to
 * reset-password would be actively harmful: the endpoint revokes every session on
 * success, and a rotated-then-replayed token triggers the server's replay
 * defence, which also revokes everything — an identical symptom with a different
 * cause, and a miserable thing to debug.
 */

export const INTERNAL = 'internal';
export const CUSTOMER = 'customer';

/* --------------------------------------------------------------- normalising */

/** Staff session shape used across the app. */
function toStaffSession(user, permissions) {
  if (!user) return null;
  return {
    kind: 'staff',
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    team: user.team ?? null,
    active: user.active ?? true,
    permissions: permissions ?? user.permissions ?? null,
    // Derived, not stored — the API has no opinion on avatar styling.
    avatarColor: avatarGradient(user.id ?? user.email),
  };
}

/** Customer session shape used across the portal. */
function toCustomerSession(customer) {
  if (!customer) return null;
  return {
    kind: 'customer',
    id: customer.id,
    // The server calls the human-readable reference `customerId` (e.g. DF-CMC827)
    // and the uuid `id`. Kept under `customerCode` internally so it is never
    // confused with the uuid that foreign keys point at.
    customerCode: customer.customerId ?? customer.customerCode ?? null,
    name: customer.name,
    contactName: customer.contactName ?? null,
    email: customer.email,
    tier: customer.tier ?? 'bronze',
    currency: customer.currency ?? 'INR',
    avatarColor: avatarGradient(customer.id ?? customer.email),
  };
}

/**
 * Both login and verify-otp return the same envelope: a `user` OR a `customer`
 * alongside the token trio. Store the tokens and hand back a uniform session.
 */
function consumeAuthPayload(payload) {
  if (!payload?.accessToken) return null;

  setAuthTokens({
    accessToken: payload.accessToken,
    refreshToken: payload.refreshToken,
    expiresIn: payload.expiresIn,
  });

  if (payload.user) return toStaffSession(payload.user);
  if (payload.customer) return toCustomerSession(payload.customer);
  return null;
}

/* ---------------------------------------------------------------- endpoints */

/**
 * Create an account.
 * @returns {{status:'otp_sent'}|{status:'authenticated', session:Object}}
 */
export async function signup({ name, email, password, type = INTERNAL }) {
  // Deliberately only these four fields — anything else is rejected by the API.
  const payload = await authRequest('POST', '/auth/signup', { name, email, password, type });

  const session = consumeAuthPayload(payload);
  if (session) return { status: 'authenticated', session };

  return { status: 'otp_sent', message: payload?.message ?? 'OTP sent successfully' };
}

/** Confirm the 6-digit code and receive tokens. */
export async function verifyOtp({ email, otp, type = INTERNAL }) {
  const payload = await authRequest('POST', '/auth/verify-otp', { email, otp, type });
  const session = consumeAuthPayload(payload);
  if (!session) {
    throw new ApiError('Verification succeeded but no session was returned.', 500, 'NO_SESSION', payload);
  }
  return session;
}

/**
 * Ask for a new code. Always resolves with the same message whether or not the
 * address exists, so the UI must not treat it as confirmation of an account.
 * @param purpose 'signup' | 'password_reset'
 */
export async function resendOtp({ email, type = INTERNAL, purpose = 'signup' }) {
  const payload = await authRequest('POST', '/auth/resend-otp', { email, type, purpose });
  return {
    message: payload?.message ?? 'If that address needs a code, one has been sent.',
    retryAfterSeconds: payload?.retryAfterSeconds ?? 60,
  };
}

/** Sign in. Every credential failure returns an identical 401 by design. */
export async function login({ email, password, type = INTERNAL }) {
  const payload = await authRequest('POST', '/auth/login', { email, password, type });
  const session = consumeAuthPayload(payload);
  if (!session) {
    throw new ApiError('Sign-in succeeded but no session was returned.', 500, 'NO_SESSION', payload);
  }
  return session;
}

/** Step 1 of reset. Always 200 — never reveals whether the email is registered. */
export async function forgotPassword({ email, type = INTERNAL }) {
  const payload = await authRequest('POST', '/auth/forgot-password', { email, type });
  return {
    message: payload?.message ?? 'If that address matches an account, a reset code has been sent.',
    retryAfterSeconds: payload?.retryAfterSeconds ?? 60,
  };
}

/**
 * Step 2 of reset. Revokes every session and issues NO token, so the caller
 * must send the user back to the login screen.
 */
export async function resetPassword({ email, otp, newPassword, type = INTERNAL }) {
  const payload = await authRequest('POST', '/auth/reset-password', {
    email,
    otp,
    // API-REFERENCE §2.9 names this field `password`, not `newPassword`. Bodies
    // are strict, so the wrong key is a 400 rather than a silently ignored field.
    password: newPassword,
    type,
  });
  clearAuthTokens();
  return {
    message: payload?.message ?? 'Password updated. Please sign in with your new password.',
    sessionsRevoked: payload?.sessionsRevoked ?? 0,
  };
}

/**
 * Change password while signed in.
 *
 * Body is exactly { currentPassword, newPassword } — API-REFERENCE §2.10. Do NOT
 * add refreshToken: schemas are strict, so an extra key is rejected with 400
 * FIELD_NOT_ALLOWED. The server already keeps the calling session and revokes
 * every other one, so there is nothing for the client to pass.
 *
 * The current password is required even though the caller is authenticated, so a
 * 15-minute token on an unattended laptop is not enough to take the account over.
 */
export async function changePassword({ currentPassword, newPassword }) {
  const payload = await authRequest('POST', '/auth/change-password', {
    currentPassword,
    newPassword,
  });
  return {
    message: payload?.message ?? 'Password updated.',
    sessionsRevoked: payload?.sessionsRevoked ?? 0,
    currentSessionKept: true,
  };
}

/** Revoke the refresh token. Idempotent, and clears local tokens regardless. */
export async function logout() {
  const refreshToken = getRefreshToken();
  try {
    if (refreshToken) {
      await authRequest('POST', '/auth/logout', { refreshToken });
    }
  } catch {
    // A failed logout must never trap the user in a signed-in state.
  } finally {
    clearAuthTokens();
  }
}

/**
 * Restore a session on page load.
 * @returns {Promise<Object|null>} session, or null when there is no valid one.
 */
export async function getMe() {
  const data = await api.get('/auth/me');
  if (!data) return null;

  if (data.kind === 'customer') return toCustomerSession(data);
  // Staff: /auth/me returns the fields flat alongside a permissions object.
  return toStaffSession(data, data.permissions);
}

export { toCustomerSession, toStaffSession };

/* ------------------------------------------------------------ error mapping */

/**
 * Turn an ApiError into something worth showing a user.
 *
 * Keyed on the server's stable `error.code` rather than the message text, so
 * copy changes on the backend cannot silently break this mapping.
 */
const MESSAGES = {
  NO_BACKEND_CONFIGURED:
    'The backend is not configured. Set VITE_API_BASE_URL in Frontend/.env and restart the dev server.',
  NETWORK_ERROR: 'Cannot reach the server. Check that the backend is running.',
  TIMEOUT: 'The server took too long to respond. Try again.',
  SESSION_EXPIRED: 'Your session has expired. Please sign in again.',

  INVALID_CREDENTIALS: 'Invalid email or password.',
  EMAIL_NOT_VERIFIED: 'Confirm your email address before signing in. Check your inbox for the code.',

  OTP_INVALID: 'That code is not correct.',
  OTP_EXPIRED: 'That code has expired. Request a new one.',
  OTP_TOO_MANY_ATTEMPTS: 'Too many incorrect attempts. Request a new code.',
  OTP_RESEND_TOO_SOON: 'Please wait a moment before requesting another code.',

  PASSWORD_REUSED: 'Your new password must be different from the current one.',
  FIELD_NOT_ALLOWED: 'One of the submitted fields is not accepted by the server.',
  EMAIL_IN_USE: 'That email already has an account. Sign in instead.',
};

export function authErrorMessage(error) {
  if (!error) return 'Something went wrong.';
  if (error.code && MESSAGES[error.code]) return MESSAGES[error.code];
  // Server messages are user-safe by design in this API, so prefer them over a
  // generic fallback when we have no mapping for the code.
  return error.message || 'Something went wrong.';
}

/** True when the failure means "there is no reachable backend", not "bad input". */
export function isBackendUnavailable(error) {
  return ['NO_BACKEND_CONFIGURED', 'NETWORK_ERROR', 'TIMEOUT'].includes(error?.code);
}
