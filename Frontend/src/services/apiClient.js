/**
 * Thin HTTP client for the DealFlow360 backend.
 *
 * The backend is optional at build time. When `VITE_API_BASE_URL` is unset the
 * app runs entirely on local seed data and each service falls back to its local
 * mirror of the server algorithm. Point the env var at a real API and the same
 * services start hitting it with no other code changes.
 */

const BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/+$/, '');
const TIMEOUT_MS = Number(import.meta.env.VITE_API_TIMEOUT_MS ?? 8000);

export function isBackendConfigured() {
  return BASE_URL.length > 0;
}

export function apiBaseUrl() {
  return BASE_URL;
}

/** Auth token, set after a successful login against a real backend. */
let authToken = null;

export function setAuthToken(token) {
  authToken = token ?? null;
}

export function getAuthToken() {
  return authToken;
}

function buildHeaders(extra = {}) {
  const headers = { 'Content-Type': 'application/json', ...extra };
  if (authToken) headers.Authorization = `Bearer ${authToken}`;
  return headers;
}

class ApiError extends Error {
  constructor(message, status, payload) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.payload = payload;
  }
}

async function request(method, path, body) {
  if (!isBackendConfigured()) {
    throw new ApiError('No backend configured', 0, null);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(`${BASE_URL}${path}`, {
      method,
      headers: buildHeaders(),
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
      credentials: 'include',
    });

    const text = await response.text();
    const payload = text ? safeParse(text) : null;

    if (!response.ok) {
      throw new ApiError(
        payload?.message ?? `Request failed with ${response.status}`,
        response.status,
        payload,
      );
    }
    return payload;
  } finally {
    clearTimeout(timer);
  }
}

function safeParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

export const api = {
  get: (path) => request('GET', path),
  post: (path, body) => request('POST', path, body),
  put: (path, body) => request('PUT', path, body),
  patch: (path, body) => request('PATCH', path, body),
  del: (path) => request('DELETE', path),
};

export { ApiError };
