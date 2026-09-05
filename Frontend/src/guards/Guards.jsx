import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAppStore } from '@/store/useAppStore';
import { GlassCard } from '@/components/glass/Glass';

/**
 * Two independent identity spaces, two independent guards.
 *
 * A staff session never grants access to /customer/*, and a customer session
 * never grants access to /app/*. Signing into one clears the other, so the two
 * can't be held simultaneously.
 *
 * WHY EVERY GUARD CHECKS `isRestoringSession` FIRST
 * The session is no longer persisted in the store — it is re-derived from the
 * stored token via GET /auth/me during boot. That is a network round trip, so on
 * a hard refresh of a deep link like /app/quotations/Q-1042 there is a window
 * where `currentUser` is legitimately null but the user IS signed in. Redirecting
 * during that window would bounce a valid session to /login on every refresh.
 */

/** Shown while GET /auth/me is in flight. */
function SessionLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <GlassCard className="flex items-center gap-3 px-5 py-4">
        <span
          className="h-4 w-4 animate-spin rounded-full border-2 border-brand-500/30 border-t-brand-600"
          aria-hidden="true"
        />
        <p className="text-xs font-semibold text-ink-soft" role="status">
          Restoring your session…
        </p>
      </GlassCard>
    </div>
  );
}

/** Requires an internal staff session. */
export function RequireStaffAuth() {
  const currentUser = useAppStore((s) => s.currentUser);
  const isRestoringSession = useAppStore((s) => s.isRestoringSession);
  const location = useLocation();

  if (isRestoringSession) return <SessionLoading />;
  if (!currentUser) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  return <Outlet />;
}

/** Requires one of the given internal roles. */
export function RequireRole({ allow = [] }) {
  const currentUser = useAppStore((s) => s.currentUser);
  const isRestoringSession = useAppStore((s) => s.isRestoringSession);

  if (isRestoringSession) return <SessionLoading />;
  if (!currentUser) return <Navigate to="/login" replace />;
  if (!allow.includes(currentUser.role)) return <Navigate to="/403" replace />;
  return <Outlet />;
}

/** Requires a signed-in customer. Entirely separate from staff auth. */
export function RequireCustomerAuth() {
  const customerUser = useAppStore((s) => s.customerUser);
  const isRestoringSession = useAppStore((s) => s.isRestoringSession);
  const location = useLocation();

  if (isRestoringSession) return <SessionLoading />;
  if (!customerUser) {
    return <Navigate to="/customer/login" replace state={{ from: location.pathname }} />;
  }
  return <Outlet />;
}

/** Sends an already-signed-in visitor to their own home instead of a login form. */
export function RedirectIfAuthenticated({ children }) {
  const currentUser = useAppStore((s) => s.currentUser);
  const customerUser = useAppStore((s) => s.customerUser);
  const isRestoringSession = useAppStore((s) => s.isRestoringSession);

  // Render the auth form rather than a spinner while restoring: an anonymous
  // visitor is the common case here, and flashing a loader on /login is worse
  // than briefly showing a form we may redirect away from.
  if (isRestoringSession) return children;
  if (currentUser) return <Navigate to="/app/dashboard" replace />;
  if (customerUser) return <Navigate to="/customer/quotations" replace />;
  return children;
}
