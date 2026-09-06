import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { checkReadiness } from '@/services/healthService';
import { Spinner } from '@/components/ui/Loading';

/**
 * "The backend is not answering" — said once, at the top, instead of thirty times.
 *
 * `checkReadiness` and `checkLiveness` have existed since the API layer was written, and
 * its own header says they are there to "show an honest backend-unreachable banner
 * instead of letting every screen fail one request at a time". Nothing ever rendered
 * them, so §1.1 and §1.2 were the only endpoints in the reference with no caller.
 *
 * The cost of that showed up the hard way: with a malformed request timeout every call
 * aborted instantly, and the app presented as a dozen unrelated empty screens and a
 * login that "took too long", with nothing anywhere saying the API was unreachable.
 *
 * WHAT IT DISTINGUISHES. `/health/ready` pings Postgres and Redis and answers 503 when
 * either is down, so there are three genuinely different situations and the banner names
 * whichever applies:
 *
 *   · unreachable    — no response at all: wrong base URL, server down, or the browser
 *                      blocked the request. Nothing in the app will work.
 *   · degraded       — the API answered but a dependency is down. Reads may work while
 *                      writes fail, which is the most confusing case to hit blind.
 *   · ok             — nothing is rendered.
 *
 * POLLS ONLY WHILE UNHEALTHY. One check on mount; if that passes the timer is never
 * started, so a healthy session costs exactly one request.
 */
const RETRY_MS = 15000;

export function ConnectionBanner() {
  const [state, setState] = useState({ status: 'checking', services: null, error: null });
  const [rechecking, setRechecking] = useState(false);
  const timer = useRef(null);

  const probe = useCallback(async () => {
    const result = await checkReadiness();

    if (!result.configured) {
      setState({ status: 'unconfigured', services: null, error: null });
      return true; // nothing to retry — this needs a .env change, not another request
    }
    if (result.ok) {
      setState({ status: 'ok', services: result.services, error: null });
      return true;
    }
    setState({
      // A `services` block means the API answered and told us what is down. No block at
      // all means we never reached it.
      status: result.services ? 'degraded' : 'unreachable',
      services: result.services,
      error: result.error ?? null,
    });
    return false;
  }, []);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      const healthy = await probe();
      if (cancelled || healthy) return;
      timer.current = setTimeout(run, RETRY_MS);
    };
    run();

    return () => {
      cancelled = true;
      if (timer.current) clearTimeout(timer.current);
    };
  }, [probe]);

  const handleRecheck = async () => {
    setRechecking(true);
    await probe();
    setRechecking(false);
  };

  // 'checking' renders nothing: a banner that flashes on every page load and then
  // disappears is noise, and the first probe resolves in well under a second.
  if (state.status === 'ok' || state.status === 'checking') return null;

  const down = Object.entries(state.services ?? {})
    .filter(([, v]) => v !== 'up' && v !== 'ok')
    .map(([k]) => k);

  const COPY = {
    unconfigured: {
      title: 'No backend configured',
      body: 'Set VITE_API_BASE_URL in Frontend/.env and reload. Nothing on these screens can load until it points at a running API.',
    },
    unreachable: {
      title: 'Cannot reach the server',
      body:
        state.error ??
        'The API did not respond. Check that it is running and that VITE_API_BASE_URL points at it.',
    },
    degraded: {
      title: 'The server is running but degraded',
      body: down.length
        ? `${down.join(' and ')} ${down.length > 1 ? 'are' : 'is'} unavailable. Reads may still work; saving anything will probably fail.`
        : 'A dependency the API needs is unavailable. Saving anything will probably fail.',
    },
  }[state.status];

  return (
    <div
      role="alert"
      className="border-b border-state-danger/25 bg-state-danger/10 px-4 py-2.5 sm:px-6"
    >
      <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-x-3 gap-y-1">
        <AlertTriangle className="h-4 w-4 shrink-0 text-state-danger" aria-hidden="true" />
        <span className="text-xs font-bold text-state-danger">{COPY.title}</span>
        <span className="min-w-0 flex-1 text-[11px] leading-relaxed text-ink-soft">
          {COPY.body}
        </span>

        {state.status !== 'unconfigured' && (
          <button
            type="button"
            onClick={handleRecheck}
            disabled={rechecking}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-state-danger/30 px-2.5 py-1 text-[11px] font-semibold text-state-danger transition-colors hover:bg-state-danger/10 disabled:opacity-60"
          >
            {rechecking ? (
              <Spinner size="xs" />
            ) : (
              <RefreshCw className="h-3 w-3" aria-hidden="true" />
            )}
            Retry
          </button>
        )}
      </div>
    </div>
  );
}
