/**
 * HTTP client for the DealFlow360 backend.
 *
 * Response envelope (from postman.json):
 *   success  { "success": true,  "data": { ... } }
 *   error    { "success": false, "error": { "code": "OTP_INVALID", "message": "..." } }
 *   empty    204 No Content (logout)
 *
 * `request()` unwraps `data` on success and throws an ApiError carrying the
 * server's `code` on failure, so callers branch on a stable code rather than
 * matching on message strings.
 *
 * TOKENS
 * accessToken lives 15 minutes, refreshToken 7 days, and refresh ROTATES — the
 * old refresh token is revoked and replaying it kills every session. So the new
 * pair must be stored the instant it arrives, and two concurrent 401s must not
 * both try to refresh. `refreshInFlight` makes refresh single-flight: the second
 * caller awaits the first one's promise instead of burning the rotated token.
 *
 * Storage lives in cookies — see src/services/tokenStore.js. Cookies are shared
 * across tabs of the same origin, so opening a portal link in a new tab keeps the
 * session, and the browser expires each token for us.
 */

import {
  clearTokens,
  getAccessToken,
  getRefreshToken,
  hasSession,
  setTokens,
} from './tokenStore';

/**
 * The deployed API. Used unless VITE_API_BASE_URL overrides it, so the app works
 * out of the box with no .env file — point the env var at localhost when you are
 * running the backend yourself.
 */
const DEFAULT_BASE_URL = 'https://api.dealflow360.teamvector.space/api/v1';

const BASE_URL = (import.meta.env.VITE_API_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, '');
const TIMEOUT_MS = Number(import.meta.env.VITE_API_TIMEOUT_MS ?? 15000);

export function isBackendConfigured() {
  return BASE_URL.length > 0;
}

export function apiBaseUrl() {
  return BASE_URL;
}

/* ------------------------------------------------------------------ tokens */

/**
 * Cookies are the single source of truth — nothing is cached in a module-level
 * variable. Two tabs share one cookie jar, so a token rotated in one tab is
 * immediately visible in the other; a cached copy would go stale and get replayed,
 * which the server answers by revoking every session.
 */

/** Called after login / verify-otp / refresh. `expiresIn` is seconds (900). */
export function setAuthTokens({ accessToken, refreshToken, expiresIn } = {}) {
  setTokens({ accessToken, refreshToken, expiresIn });
}

export function clearAuthTokens() {
  clearTokens();
}

export { getAccessToken, getRefreshToken, hasSession };

/** Back-compat with the original single-token helpers. */
export function setAuthToken(token) {
  setTokens({ accessToken: token });
}

export function getAuthToken() {
  return getAccessToken();
}

/* ------------------------------------------------------------------- errors */

class ApiError extends Error {
  constructor(message, status, code, payload) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code ?? null;
    this.payload = payload ?? null;
  }

  /** True when the failure is "backend unreachable" rather than a real reply. */
  get isNetwork() {
    return this.status === 0;
  }
}

export const NO_BACKEND_CODE = 'NO_BACKEND_CONFIGURED';

function safeParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

/* ------------------------------------------------------------------ request */

/**
 * Endpoints that must never trigger a token refresh.
 *
 * Two separate reasons:
 *  · /auth/refresh itself would recurse.
 *  · The rest either establish a session or deliberately tear one down, so a
 *    401 from them is a real answer ("wrong password", "bad OTP") and must reach
 *    the caller unchanged rather than being masked by a refresh-and-retry.
 *
 * /auth/change-password is here for a sharper reason: it carries the current
 * refreshToken in its BODY to keep this session alive. Refresh rotates and
 * revokes the old token, so refreshing first would post an already-revoked
 * token — which the API treats as replay and answers by killing every session.
 * The access token alone is used instead.
 */
const NO_REFRESH_PATHS = [
  '/auth/login',
  '/auth/signup',
  '/auth/refresh',
  '/auth/verify-otp',
  '/auth/resend-otp',
  '/auth/forgot-password',
  '/auth/reset-password',
  '/auth/change-password',
  '/auth/logout',
];

let refreshInFlight = null;

async function performRefresh() {
  const refreshToken = getRefreshToken();
  if (!refreshToken) {
    throw new ApiError('No refresh token', 401, 'NO_REFRESH_TOKEN', null);
  }

  const payload = await rawRequest('POST', '/auth/refresh', { refreshToken }, false);
  // Rotating refresh: store the NEW pair immediately.
  setAuthTokens(payload);
  return payload;
}

/** Single-flight wrapper so parallel 401s share one refresh. */
function refreshTokens() {
  if (!refreshInFlight) {
    refreshInFlight = performRefresh().finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

async function rawRequest(method, path, body, withAuth = true, unwrap = true, extraHeaders) {
  if (!isBackendConfigured()) {
    throw new ApiError(
      'No backend configured. Set VITE_API_BASE_URL in your .env file.',
      0,
      NO_BACKEND_CODE,
      null,
    );
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let response;
  try {
    const headers = { 'Content-Type': 'application/json', ...extraHeaders };
    // Read from the cookie at call time, never from a cached copy — another tab
    // may have rotated it since this module loaded.
    const accessToken = getAccessToken();
    if (withAuth && accessToken) {
      headers.Authorization = `Bearer ${accessToken}`;
    }

    response = await fetch(`${BASE_URL}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
      credentials: 'include',
    });
  } catch (err) {
    const aborted = err?.name === 'AbortError';
    throw new ApiError(
      aborted
        ? `Request timed out after ${TIMEOUT_MS}ms`
        : 'Cannot reach the server. Is the backend running?',
      0,
      aborted ? 'TIMEOUT' : 'NETWORK_ERROR',
      null,
    );
  } finally {
    clearTimeout(timer);
  }

  if (response.status === 204) return null;

  const text = await response.text();
  const payload = text ? safeParse(text) : null;

  if (!response.ok) {
    throw new ApiError(
      payload?.error?.message ?? payload?.message ?? `Request failed with ${response.status}`,
      response.status,
      payload?.error?.code,
      payload,
    );
  }

  // Unwrap the success envelope. Some endpoints reply { success, message }
  // with no data block (e.g. signup 201), so fall through to the whole payload.
  // `unwrap: false` keeps the envelope so paginated callers can read `meta`.
  if (unwrap && payload && typeof payload === 'object' && 'success' in payload) {
    return 'data' in payload ? payload.data : payload;
  }
  return payload;
}

async function request(method, path, body, unwrap = true, extraHeaders) {
  try {
    return await rawRequest(method, path, body, true, unwrap, extraHeaders);
  } catch (err) {
    const retryable =
      err instanceof ApiError &&
      err.status === 401 &&
      getRefreshToken() &&
      !NO_REFRESH_PATHS.some((p) => path.startsWith(p));

    if (!retryable) throw err;

    try {
      await refreshTokens();
    } catch {
      // Refresh failed — the session is genuinely dead. Clear it so guards
      // bounce the user to /login instead of looping on 401s.
      clearAuthTokens();
      throw new ApiError('Your session has expired. Please sign in again.', 401, 'SESSION_EXPIRED', null);
    }

    return rawRequest(method, path, body, true, unwrap, extraHeaders);
  }
}

/* ---------------------------------------------------------------------- pdf */

/**
 * PDF endpoints answer in ONE OF TWO SHAPES and the caller cannot know which.
 *
 * With Cloudinary configured the server uploads the file and returns JSON
 * `{ reference, url, publicId, bytes, hosted: true }`. Without it, the bytes are
 * streamed back with `Content-Type: application/pdf`. The document is the deliverable,
 * so a missing third-party account does not remove the feature — which means both
 * shapes are normal and both have to be handled.
 *
 * `request()` cannot do this: it calls `response.text()` and JSON-parses, which turns a
 * binary body into a garbage string. So this reads the content type first and, for a
 * stream, wraps the blob in an object URL.
 *
 * Returns `{ url, hosted, revoke }`. When `revoke` is true the URL is an in-memory blob
 * handle and the caller must `URL.revokeObjectURL(url)` once the tab has opened it,
 * otherwise the bytes stay pinned for the life of the document.
 */
async function rawPdfRequest(path) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let response;
  try {
    const headers = { Accept: 'application/pdf, application/json' };
    const accessToken = getAccessToken();
    if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

    response = await fetch(`${BASE_URL}${path}`, {
      method: 'GET',
      headers,
      signal: controller.signal,
      credentials: 'include',
    });
  } catch (err) {
    const aborted = err?.name === 'AbortError';
    throw new ApiError(
      aborted ? `Request timed out after ${TIMEOUT_MS}ms` : 'Cannot reach the server.',
      0,
      aborted ? 'TIMEOUT' : 'NETWORK_ERROR',
      null,
    );
  } finally {
    clearTimeout(timer);
  }

  const contentType = response.headers.get('content-type') ?? '';

  if (!response.ok) {
    // An error is always JSON even on a PDF route, so the code still reaches the caller.
    const text = await response.text();
    const payload = text ? safeParse(text) : null;
    throw new ApiError(
      payload?.error?.message ?? `Could not generate the PDF (${response.status})`,
      response.status,
      payload?.error?.code,
      payload,
    );
  }

  if (contentType.includes('application/json')) {
    const payload = await response.json();
    const data = payload && 'data' in payload ? payload.data : payload;
    return {
      url: data?.url ?? null,
      reference: data?.reference ?? null,
      hosted: true,
      revoke: false,
    };
  }

  const blob = await response.blob();
  return { url: URL.createObjectURL(blob), reference: null, hosted: false, revoke: true };
}

async function pdfRequest(path) {
  try {
    return await rawPdfRequest(path);
  } catch (err) {
    const retryable = err instanceof ApiError && err.status === 401 && getRefreshToken();
    if (!retryable) throw err;

    try {
      await refreshTokens();
    } catch {
      clearAuthTokens();
      throw new ApiError('Your session has expired. Please sign in again.', 401, 'SESSION_EXPIRED', null);
    }
    return rawPdfRequest(path);
  }
}

/**
 * Build a query string, dropping empty values.
 *
 * Undefined, null and '' are omitted rather than sent as blanks — the API's
 * schemas are strict, and `?tier=` is not the same request as no `tier` at all.
 * Shared by every service so filter handling cannot drift between them.
 */
export function buildQuery(params = {}) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    if (Array.isArray(value)) {
      if (value.length === 0) continue;
      search.set(key, value.join(','));
      continue;
    }
    search.set(key, String(value));
  }
  const qs = search.toString();
  return qs ? `?${qs}` : '';
}

export const api = {
  get: (path) => request('GET', path),
  post: (path, body) => request('POST', path, body),
  put: (path, body) => request('PUT', path, body),
  patch: (path, body) => request('PATCH', path, body),
  del: (path, body) => request('DELETE', path, body),

  /**
   * Paginated GET. Returns { items, meta } because list endpoints reply
   * { success, data: [...], meta: { page, limit, total } } and the plain
   * helpers above throw the `meta` block away.
   */
  list: async (path) => {
    const envelope = await request('GET', path, undefined, false);
    if (Array.isArray(envelope)) return { items: envelope, meta: null };
    return {
      items: Array.isArray(envelope?.data) ? envelope.data : [],
      meta: envelope?.meta ?? null,
    };
  },

  /**
   * GET a PDF route. Resolves to { url, hosted, revoke } — see rawPdfRequest.
   * Never use api.get for these; the body may be binary.
   */
  pdf: (path) => pdfRequest(path),

  /** Bypasses the refresh-retry wrapper. Used by the auth endpoints. */
  raw: (method, path, body, withAuth = true) => rawRequest(method, path, body, withAuth),

  /**
   * POST with extra headers. Only needed for `Idempotency-Key` on
   * POST /invoices/:id/payments, where a retry must not write a second payment.
   */
  postWithHeaders: (path, body, extraHeaders) =>
    request('POST', path, body, true, extraHeaders),
};

export { ApiError };
