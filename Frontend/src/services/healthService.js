/**
 * Health probes. Maps onto the Health folder of postman.json.
 *
 *   GET /health        liveness, returns uptime in seconds
 *   GET /health/ready  pings Postgres and Redis. 200 = both up, 503 = degraded
 *
 * Used to show an honest "backend unreachable" banner instead of letting every
 * screen fail one request at a time.
 */

import { api, isBackendConfigured } from './apiClient';

export async function checkLiveness() {
  if (!isBackendConfigured()) {
    return { ok: false, configured: false, uptime: null };
  }
  try {
    const data = await api.get('/health');
    return { ok: true, configured: true, uptime: data?.uptime ?? null };
  } catch (error) {
    return { ok: false, configured: true, error: error.message };
  }
}

/**
 * Readiness. Note the server replies 503 when a dependency is down, which the
 * client throws on — so `services` is read off the error payload in that case.
 */
export async function checkReadiness() {
  if (!isBackendConfigured()) {
    return { ok: false, configured: false, services: null };
  }
  try {
    const data = await api.get('/health/ready');
    return { ok: true, configured: true, services: data?.services ?? null };
  } catch (error) {
    return {
      ok: false,
      configured: true,
      services: error?.payload?.services ?? null,
      error: error.message,
    };
  }
}
