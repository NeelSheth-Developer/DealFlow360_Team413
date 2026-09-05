/**
 * Token storage, in cookies.
 *
 * Three cookies rather than one blob, because the two tokens have very different
 * lifetimes and the browser can then expire each one for us:
 *
 *   df360_at   access token   ~15 min (from the server's `expiresIn`)
 *   df360_rt   refresh token  7 days
 *   df360_exp  access-token expiry as epoch ms, so callers can tell a token is
 *              stale without decoding the JWT
 *
 * Attributes: `path=/` so every route sees them, `SameSite=Lax` to block
 * cross-site sends while keeping normal top-level navigation working, and
 * `Secure` added automatically once the page is served over HTTPS.
 *
 * WHY COOKIES RATHER THAN localStorage
 * Cookies are shared across tabs of one origin and the browser expires them on
 * schedule. That matters here because refresh tokens ROTATE: if tab A refreshes
 * and tab B is holding a cached copy of the old token, tab B will eventually
 * replay it, and the server answers a replay by revoking every session. Reading
 * from one shared jar at call time removes that whole class of bug.
 *
 * HONEST LIMITATION
 * These are readable by JavaScript, so they are no more XSS-proof than
 * localStorage was. Only a cookie the SERVER sets with HttpOnly is beyond script
 * access, and JS cannot create one. For real hardening the backend should set an
 * HttpOnly + Secure refresh cookie on /auth/login and stop returning the refresh
 * token in the response body — at which point this module would only ever hold
 * the short-lived access token.
 */

const ACCESS_KEY = 'df360_at';
const REFRESH_KEY = 'df360_rt';
const EXPIRY_KEY = 'df360_exp';

const REFRESH_MAX_AGE = 7 * 24 * 60 * 60; // 7 days, matching the server
const ACCESS_FALLBACK_MAX_AGE = 15 * 60; // 15 min, used when expiresIn is absent

function isSecureContext() {
  return typeof window !== 'undefined' && window.location?.protocol === 'https:';
}

function writeCookie(name, value, maxAgeSeconds) {
  if (typeof document === 'undefined') return;

  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    'path=/',
    'SameSite=Lax',
    `max-age=${Math.max(0, Math.floor(maxAgeSeconds))}`,
  ];
  if (isSecureContext()) parts.push('Secure');

  document.cookie = parts.join('; ');
}

function readCookie(name) {
  if (typeof document === 'undefined') return null;

  for (const pair of document.cookie.split(';')) {
    const idx = pair.indexOf('=');
    if (idx === -1) continue;
    if (pair.slice(0, idx).trim() !== name) continue;
    try {
      return decodeURIComponent(pair.slice(idx + 1)) || null;
    } catch {
      return null;
    }
  }
  return null;
}

function deleteCookie(name) {
  if (typeof document === 'undefined') return;
  const parts = [`${name}=`, 'path=/', 'SameSite=Lax', 'max-age=0'];
  if (isSecureContext()) parts.push('Secure');
  document.cookie = parts.join('; ');
}

/* ------------------------------------------------------------------- public */

/** Persist the pair returned by login / verify-otp / refresh. */
export function setTokens({ accessToken, refreshToken, expiresIn } = {}) {
  const ttl = Number(expiresIn) > 0 ? Number(expiresIn) : ACCESS_FALLBACK_MAX_AGE;

  if (accessToken) {
    writeCookie(ACCESS_KEY, accessToken, ttl);
    writeCookie(EXPIRY_KEY, String(Date.now() + ttl * 1000), ttl);
  }
  // Refresh rotates: only overwrite when a new one actually arrived, so a
  // response that omits it does not silently wipe the stored token.
  if (refreshToken) {
    writeCookie(REFRESH_KEY, refreshToken, REFRESH_MAX_AGE);
  }
}

export function getAccessToken() {
  return readCookie(ACCESS_KEY);
}

export function getRefreshToken() {
  return readCookie(REFRESH_KEY);
}

/** Epoch ms at which the access token expires, or null when unknown. */
export function getAccessTokenExpiry() {
  const value = Number(readCookie(EXPIRY_KEY));
  return Number.isFinite(value) && value > 0 ? value : null;
}

/**
 * True when there is anything worth trying a session restore with.
 *
 * Deliberately checks the refresh token too: the access token expires after 15
 * minutes, so someone returning the next morning has only the refresh cookie —
 * and that is still a restorable session, because apiClient will refresh on the
 * first 401 from GET /auth/me.
 */
export function hasSession() {
  return Boolean(getAccessToken() || getRefreshToken());
}

export function clearTokens() {
  deleteCookie(ACCESS_KEY);
  deleteCookie(REFRESH_KEY);
  deleteCookie(EXPIRY_KEY);
}

export const TOKEN_COOKIE_NAMES = {
  access: ACCESS_KEY,
  refresh: REFRESH_KEY,
  expiry: EXPIRY_KEY,
};
