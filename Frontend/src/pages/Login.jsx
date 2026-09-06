import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import {
  ArrowRight,
  Gauge,
  Repeat,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Truck,
} from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import { roleLabel } from '@/lib/format';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { AuthAside, AuthShell } from '@/components/auth/AuthShell';

/**
 * Staff sign-in. POST /auth/login with type:'internal'.
 *
 * There is no role quick-pick and no seeded account list here. Those cards logged
 * you in as a hardcoded user with no server involved, which cannot work against a
 * real API — and there is no endpoint that would let it.
 *
 * The aside is static copy. It deliberately does not call GET /roles: that
 * endpoint is admin-only, so an unauthenticated visitor would get a 401.
 */

/**
 * The platform's capabilities, per 01-PROJECT-OVERVIEW.md §1. Shown beside the
 * form so the panel carries real substance instead of filler.
 */
const CAPABILITIES = [
  {
    icon: ShieldCheck,
    title: 'Discount governance that routes itself',
    blurb: 'Per-category ceilings and a blended risk score pick the approver. Nobody requests approval by hand.',
  },
  {
    icon: TrendingUp,
    title: 'Live upsell with margin impact',
    blurb: 'Ranked suggestions while you build, filtered by a margin floor so nothing loss-making surfaces.',
  },
  {
    icon: Truck,
    title: 'Multi-warehouse fulfilment',
    blurb: 'Orders split across depots to cut shipments, with backorder ETAs and manual override.',
  },
  {
    icon: Repeat,
    title: 'Hybrid billing on one order',
    blurb: 'One-time and recurring lines side by side, with real proration and credit notes.',
  },
  {
    icon: Gauge,
    title: 'Deal health and anomaly alerts',
    blurb: 'Stalled deals, discount outliers against each rep’s own history, and approval bottlenecks.',
  },
];

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const login = useAppStore((s) => s.login);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const destination = location.state?.from ?? '/app/dashboard';

  const handleSubmit = async (e) => {
    e.preventDefault();
    setBusy(true);
    const result = await login({ email: email.trim(), password });
    setBusy(false);

    if (!result.ok) {
      setError(result.error);
      // An unverified account can still finish signing up, so point the way.
      if (result.code === 'EMAIL_NOT_VERIFIED') {
        toast.info('Email not verified', {
          description: 'Use "Create an account" with the same address to re-request a code.',
        });
      }
      return;
    }

    toast.success(`Welcome back, ${result.user.name}`, {
      description: roleLabel(result.user.role),
    });
    navigate(destination, { replace: true });
  };

  return (
    <AuthShell
      backTo="/"
      backLabel="Back to home"
      aside={
        <AuthAside
          title="The self-governing sales engine"
          description="Quote-to-cash for real B2B conditions — discount approvals that route themselves, stock split across warehouses, and subscriptions reconciled with hardware on one order."
          items={CAPABILITIES}
          note="Your permissions come from the server on sign-in. You act on the approval steps that match your role and nothing else."
        />
      }
    >
      <span className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 to-accent-indigo text-white shadow-glass">
        <Sparkles className="h-5 w-5" aria-hidden="true" />
      </span>

      <h1 className="text-xl font-extrabold tracking-tight text-ink">Sign in to DealFlow360</h1>
      <p className="mt-1.5 text-sm text-ink-soft">
        For the internal sales team. Customers have a separate portal.
      </p>

      <form onSubmit={handleSubmit} className="mt-5 space-y-3.5">
        <Input
          label="Work email"
          type="email"
          required
          autoComplete="email"
          placeholder="you@company.com"
          value={email}
          error={error}
          onChange={(e) => {
            setEmail(e.target.value);
            setError(null);
          }}
        />
        <Input
          label="Password"
          type="password"
          required
          autoComplete="current-password"
          placeholder="Your password"
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
            setError(null);
          }}
        />

        <div className="flex justify-end">
          <Link
            to="/forgot-password"
            className="text-xs font-semibold text-brand-600 hover:underline"
          >
            Forgot your password?
          </Link>
        </div>

        <Button type="submit" fullWidth size="lg" loading={busy} iconRight={ArrowRight}>
          Sign in
        </Button>
      </form>

      <p className="mt-4 text-xs text-ink-muted">
        Need an account?{' '}
        <Link to="/signup" className="font-semibold text-brand-600 hover:underline">
          Create an account
        </Link>
      </p>

      <div className="mt-4 border-t border-brand-500/12 pt-4">
        <p className="text-xs text-ink-muted">
          Are you a customer reviewing a quotation?{' '}
          <Link to="/customer/login" className="font-semibold text-brand-600 hover:underline">
            Use the portal
          </Link>
        </p>
      </div>
    </AuthShell>
  );
}
