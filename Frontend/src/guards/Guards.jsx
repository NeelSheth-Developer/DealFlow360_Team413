import { Navigate, Outlet, useLocation, useParams } from 'react-router-dom';
import { ShieldX } from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import { GlassCard, GradientBlobBackground } from '@/components/glass/Glass';
import { Button } from '@/components/ui/Button';

/** Requires an internal session. */
export function RequireAuth() {
  const currentUser = useAppStore((s) => s.currentUser);
  const location = useLocation();

  if (!currentUser) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  return <Outlet />;
}

/** Requires one of the given internal roles. */
export function RequireRole({ allow = [] }) {
  const currentUser = useAppStore((s) => s.currentUser);

  if (!currentUser) return <Navigate to="/login" replace />;
  if (!allow.includes(currentUser.role)) return <Navigate to="/403" replace />;
  return <Outlet />;
}

/**
 * Validates a portal token. Completely independent of internal auth: a logged
 * out visitor with a valid token gets in, and a logged in rep visiting a portal
 * URL still only sees the customer view.
 */
export function RequirePortalToken() {
  const { token } = useParams();
  const exists = useAppStore((s) => s.quotations.some((q) => q.portalToken === token));

  if (!exists) {
    return (
      <div className="relative flex min-h-screen items-center justify-center px-4">
        <GradientBlobBackground variant="subtle" />
        <GlassCard strong className="relative z-10 max-w-md p-8 text-center">
          <span className="mx-auto mb-4 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-state-danger/12 text-state-danger">
            <ShieldX className="h-6 w-6" aria-hidden="true" />
          </span>
          <h1 className="text-lg font-extrabold tracking-tight text-ink">
            This link is invalid or has expired
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-ink-soft">
            Quotation links are single-purpose and time-limited. Ask your account contact to send a
            fresh one.
          </p>
          <Button as="a" variant="secondary" className="mt-5" onClick={() => window.history.back()}>
            Go back
          </Button>
        </GlassCard>
      </div>
    );
  }

  return <Outlet />;
}
