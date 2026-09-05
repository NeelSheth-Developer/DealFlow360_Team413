import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAppStore } from '@/store/useAppStore';

/**
 * Two independent identity spaces, two independent guards.
 *
 * A staff session never grants access to /customer/*, and a customer session
 * never grants access to /app/*. Signing into one clears the other, so the two
 * can't be held simultaneously.
 */

/** Requires an internal staff session. */
export function RequireStaffAuth() {
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

/** Requires a signed-in customer. Entirely separate from staff auth. */
export function RequireCustomerAuth() {
  const customerUser = useAppStore((s) => s.customerUser);
  const location = useLocation();

  if (!customerUser) {
    return <Navigate to="/customer/login" replace state={{ from: location.pathname }} />;
  }
  return <Outlet />;
}

/** Sends an already-signed-in visitor to their own home instead of a login form. */
export function RedirectIfAuthenticated({ children }) {
  const currentUser = useAppStore((s) => s.currentUser);
  const customerUser = useAppStore((s) => s.customerUser);

  if (currentUser) return <Navigate to="/app/dashboard" replace />;
  if (customerUser) return <Navigate to="/customer/quotations" replace />;
  return children;
}
