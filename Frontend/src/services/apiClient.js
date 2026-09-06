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

const DEFAULT_TIMEOUT_MS = 30000;
const MIN_TIMEOUT_MS = 1000;

/**
 * Request timeout, read from the environment but never trusted blindly.
 *
 * `Number(import.meta.env.VITE_API_TIMEOUT_MS ?? 30000)` was the previous form and it
 * has a trap: `??` only substitutes for null and undefined, so a MALFORMED value survives
 * it and `Number()` turns it into NaN. `setTimeout(fn, NaN)` does not mean "no timeout" —
 * it coerces to 0 and fires on the next tick, aborting every request the instant it is
 * sent. A single stray character in a .env file (`8000ss`) therefore took the entire app
 * down, and it presented as "The server took too long to respond" on every screen, which
 * points at the network rather than at the typo that caused it.
 *
 * So the value has to be finite and sane before it is used, and a floor stops a `0` or a
 * `50` from doing the same thing more slowly. An unusable value falls back to the default
 * and says so once, because failing silently here is what made this expensive to find.
 */
const TIMEOUT_MS = (() => {
  const raw = import.meta.env.VITE_API_TIMEOUT_MS;
  if (raw === undefined || raw === null || raw === '') return DEFAULT_TIMEOUT_MS;

  const parsed = Number(raw);
  if (Number.isFinite(parsed) && parsed >= MIN_TIMEOUT_MS) return parsed;

  console.warn(
    `[api] VITE_API_TIMEOUT_MS="${raw}" is not a number of milliseconds >= ${MIN_TIMEOUT_MS}. ` +
      `Falling back to ${DEFAULT_TIMEOUT_MS}ms.`,
  );
  return DEFAULT_TIMEOUT_MS;
})();

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

/* ------------------------------------------------------------------ retries */

/**
 * Bounded retry for READS only.
 *
 * The list endpoints that fan out per row — GET /quotations, GET /invoices and
 * GET /customer/quotations each load every line, comment and approval step for every
 * row they return — intermittently answer 500 under load, and the failure rate climbs
 * with `pageSize`. A single 500 on the boot fetch left the whole workspace showing an
 * empty pipeline, which reads as "there are no deals" rather than "one request failed".
 *
 * Only GET is replayed, and only on a transport failure or a 5xx. A POST, PUT, PATCH or
 * DELETE is never retried here: the server may well have applied it before the
 * connection broke, and a second attempt would add a line, record a second payment or
 * approve a step twice. Payments carry an Idempotency-Key for exactly that reason, and
 * that is the mechanism a write retry belongs in — not this one.
 *
 * 4xx is never retried either. A 400, 403, 404 or 409 is a real answer, and asking again
 * gets the same one more slowly.
 */
const RETRYABLE_STATUS = new Set([500, 502, 503, 504]);
const MAX_READ_ATTEMPTS = 3;
const RETRY_BASE_MS = 400;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableRead(method, error) {
  if (method !== 'GET') return false;
  if (!(error instanceof ApiError)) return false;
  if (error.status === 0) return error.code === 'NETWORK_ERROR' || error.code === 'TIMEOUT';
  return RETRYABLE_STATUS.has(error.status);
}

/**
 * Run `attempt` up to MAX_READ_ATTEMPTS times with exponential backoff.
 *
 * The jitter matters: `loadReferenceData` fires eleven requests at once, and a fixed
 * delay would line their retries up into the same second and reproduce the load that
 * caused the failure.
 */
async function withReadRetry(method, attempt) {
  const maxAttempts = method === 'GET' ? MAX_READ_ATTEMPTS : 1;

  for (let i = 0; ; i += 1) {
    try {
      return await attempt();
    } catch (error) {
      if (i >= maxAttempts - 1 || !isRetryableRead(method, error)) throw error;
      await sleep(RETRY_BASE_MS * 2 ** i + Math.random() * 250);
    }
  }
}

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

/**
 * Server-assigned fields that must never appear in a request body.
 *
 * Every write schema is `.strict()`, so one of these in a payload is a 400
 * FIELD_NOT_ALLOWED and a save that silently does nothing. The failure mode is always
 * the same: an editor seeds its form with `{ ...entityFromServer }` and hands the whole
 * thing back, carrying `id`, `createdAt` and whatever else the response happened to
 * include.
 *
 * The services whitelist their own payloads, which is the actual fix. This is the net
 * underneath it — it costs nothing in production and turns "the backend ignored my
 * change" into a named warning in the console the moment it is reintroduced.
 */
const SERVER_ASSIGNED_KEYS = ['id', 'createdAt', 'updatedAt', 'reference', 'customerId'];

function warnOnServerAssignedKeys(method, path, body) {
  if (!import.meta.env.DEV) return;
  if (!body || typeof body !== 'object' || Array.isArray(body)) return;
  if (method === 'GET' || method === 'DELETE') return;

  // `customerId` is legitimately part of POST /quotations, and `reference` never is.
  const allowed = path === '/quotations' ? ['customerId'] : [];
  const offenders = SERVER_ASSIGNED_KEYS.filter(
    (k) => k in body && !allowed.includes(k),
  );
  if (offenders.length === 0) return;

  console.warn(
    `[api] ${method} ${path} is sending server-assigned field(s): ${offenders.join(', ')}. ` +
      'Request bodies are strict — this will fail with 400 FIELD_NOT_ALLOWED. ' +
      'Whitelist the payload in the service rather than forwarding the whole entity.',
  );
}

async function request(method, path, body, unwrap = true, extraHeaders) {
  warnOnServerAssignedKeys(method, path, body);

  const send = () => withReadRetry(method, () => rawRequest(method, path, body, true, unwrap, extraHeaders));

  try {
    return await send();
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

    return send();
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

  // The reference is the filename when this gets saved rather than opened. It is only
  // readable because the API lists these two in its CORS `exposedHeaders`; without that
  // a cross-origin response hides everything outside the safelist and every download
  // lands as an unnamed blob.
  const blob = await response.blob();
  return {
    url: URL.createObjectURL(blob),
    reference: response.headers.get('x-document-reference') ?? null,
    hosted: false,
    revoke: true,
  };
}

/**
 * Whether a hosted PDF link is actually openable — checked once, then remembered.
 *
 * A hosted URL is a promise the API cannot keep on its own. Cloudinary ships with
 * "Allow delivery of PDF and ZIP files" disabled, and under that setting the upload
 * SUCCEEDS and returns a real-looking `secure_url` that answers every GET with
 * `401 · x-cld-error: deny or ACL failure`. The API has no way to know: from its side
 * the upload worked. The user sees a new tab that fails to load and no error anywhere.
 *
 * That is exactly what happened in production, twice — the second time because a merge
 * reverted the server-side guard. So the client does not take `hosted: true` on trust.
 * It probes the link once per session and, if the host refuses it, re-requests the same
 * route with `?stream=1` and opens the bytes instead. The document always exists; only
 * the delivery route is in doubt.
 *
 * `null` = not probed. Latched to `false` only on a definitive HTTP refusal — a thrown
 * fetch is left unlatched so one flaky moment does not force streaming all session.
 */
let hostedPdfDelivers = null;

/** Add `stream=1` to a PDF route, preserving any query it already carries. */
function streamVariant(path) {
  return path.includes('?') ? `${path}&stream=1` : `${path}?stream=1`;
}

/**
 * HEAD the hosted URL to see whether the browser will be able to open it.
 *
 * Cloudinary answers with `access-control-allow-origin: *`, so the status is readable
 * cross-origin. `undefined` means the question could not be answered — treated as
 * "assume it works", because failing closed here would push every deployment onto the
 * streamed path over a transient network error.
 */
async function hostedPdfIsDeliverable(url) {
  try {
    const response = await fetch(url, { method: 'HEAD', mode: 'cors', credentials: 'omit' });
    return response.ok;
  } catch {
    return undefined;
  }
}

async function pdfRequest(path) {
  // A PDF route is a GET, so it gets the same 5xx retry as any other read. Rendering
  // one is the heaviest thing the API does, which is exactly when a transient failure
  // is most likely.
  const send = (target) => withReadRetry('GET', () => rawPdfRequest(target));

  const fetchOnce = async (target) => {
    try {
      return await send(target);
    } catch (err) {
      const retryable = err instanceof ApiError && err.status === 401 && getRefreshToken();
      if (!retryable) throw err;

      try {
        await refreshTokens();
      } catch {
        clearAuthTokens();
        throw new ApiError('Your session has expired. Please sign in again.', 401, 'SESSION_EXPIRED', null);
      }
      return send(target);
    }
  };

  // Known-bad host: skip the round trip that would only hand back a dead link.
  if (hostedPdfDelivers === false) return fetchOnce(streamVariant(path));

  const result = await fetchOnce(path);
  if (!result.hosted || !result.url) return result;

  if (hostedPdfDelivers === true) return result;

  const deliverable = await hostedPdfIsDeliverable(result.url);
  if (deliverable === true) {
    hostedPdfDelivers = true;
    return result;
  }
  if (deliverable === undefined) return result;

  console.warn(
    `[api] The document host refused to serve ${result.url}. Falling back to streaming the file from the API. ` +
      'Enable "Allow delivery of PDF and ZIP files" in the Cloudinary account to restore hosted links.',
  );
  hostedPdfDelivers = false;

  const streamed = await fetchOnce(streamVariant(path));

  // An API too old to know about `?stream=1` ignores it and returns the same dead link.
  // Opening it would show the customer a browser error page with no explanation, so this
  // surfaces as a real failure the UI can put in a toast instead.
  if (streamed.hosted) {
    throw new ApiError(
      'The document was generated but the file host refused to serve it.',
      502,
      'PDF_NOT_DELIVERABLE',
      null,
    );
  }
  return streamed;
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
   * Every page of a paginated list, walked in order.
   *
   * Two problems this solves, and both of them showed up as "the data isn't there":
   *
   *  1. A PAGE CAP IS NOT A TOTAL. `GET /products` caps `pageSize` at 200 and the
   *     catalogue holds more than that, so a single maximal request silently dropped
   *     the tail — a rep simply could not find those products in the picker.
   *  2. A BIG PAGE IS NOT A CHEAP PAGE. `GET /quotations` loads every line, comment and
   *     approval step for every row it returns. On one deployment that is fine; on a
   *     smaller one it answers 500 for every `pageSize=100` request while small pages
   *     succeed. Which host `VITE_API_BASE_URL` points at decides which is true.
   *
   * SO THE PAGE SIZE ADAPTS. The walk starts at `pageSize` — the biggest the endpoint
   * allows, which is usually the whole collection in one request. If the FIRST page comes
   * back as a server error and `fallbackPageSize` is set, the walk restarts at the
   * smaller size. That gets the fast, exact answer where the server can give one, and
   * still gets an answer where it cannot.
   *
   * FEWER PAGES IS ALSO MORE CORRECT, which is why the big page is tried first rather
   * than being a mere optimisation. `GET /quotations` orders by `lastActivityAt DESC`
   * with LIMIT/OFFSET, and that column is not unique — seeded rows share a timestamp to
   * the millisecond. Postgres may order those ties differently between the two queries
   * that serve page 1 and page 2, so a row can appear on both while another is skipped
   * entirely: walking 100 quotations in pages of 25 yields 100 rows of which only 98 are
   * distinct. One page of 100 has no boundary to lose a row across.
   *
   * DEDUPED BY `id` regardless, because when the fallback does run, a duplicate is
   * visible — the same quote number twice in the list, and its value counted twice in the
   * pipeline header. The row skipped in that case is NOT recoverable on this side; only a
   * stable tiebreaker in the server's ORDER BY can fix that.
   *
   * SEQUENTIAL ON PURPOSE when it does page. Firing pages in parallel puts the same load
   * back on the server in one burst, which is what fails. Each page also carries the read
   * retry from `request`, so one flaky page does not lose the whole collection.
   *
   * `onPage` is called with the rows accumulated so far after each page, so a caller can
   * paint the first batch immediately instead of holding a blank screen for the walk.
   *
   * `buildPath` receives `{ page, pageSize }` and returns the full path with its query.
   * `maxPages` is a stop so a server that always reports another page cannot spin here.
   */
  listAll: async (
    buildPath,
    { pageSize = 25, fallbackPageSize = null, maxPages = 40, onPage } = {},
  ) => {
    const walk = async (size) => {
      const items = [];
      const seen = new Set();
      let lastMeta = null;

      for (let page = 1; page <= maxPages; page += 1) {
        const { items: pageItems, meta } = await api.list(buildPath({ page, pageSize: size }));
        lastMeta = meta;

        for (const item of pageItems) {
          // Rows without an id cannot be deduped, so they are kept as-is rather than
          // collapsed onto each other by `undefined`.
          const key = item?.id;
          if (key !== undefined && key !== null) {
            if (seen.has(key)) continue;
            seen.add(key);
          }
          items.push(item);
        }

        onPage?.(items.slice(), meta);

        // No meta means the endpoint does not paginate — one pass is the whole answer.
        if (!meta) break;
        if (pageItems.length === 0) break;
        if (page >= (meta.totalPages ?? 1)) break;
      }

      return {
        items,
        // `page`/`pageSize` are rewritten to describe what was actually returned: this is
        // one collection, not page 4 of it. `total` stays the server's own count so a
        // screen can still tell whether the walk came up short.
        meta: lastMeta ? { ...lastMeta, page: 1, pageSize: items.length, totalPages: 1 } : null,
      };
    };

    if (!fallbackPageSize || fallbackPageSize >= pageSize) return walk(pageSize);

    try {
      return await walk(pageSize);
    } catch (error) {
      // Only a server-side failure means "that page was too big to build". A 401, 403 or
      // a bad filter would fail identically at any size, so those are re-thrown.
      const tooBig = error instanceof ApiError && RETRYABLE_STATUS.has(error.status);
      if (!tooBig) throw error;
      return walk(fallbackPageSize);
    }
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
