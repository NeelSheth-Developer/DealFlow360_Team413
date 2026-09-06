import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowRight, Repeat, ShieldCheck, TrendingUp, Truck } from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import { roleLabel } from '@/lib/format';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { AuthAside, AuthShell } from '@/components/auth/AuthShell';
import { PasswordField } from '@/components/auth/PasswordField';
import { requiredText, runChecks, validEmail } from '@/lib/validate';
import { Logo } from '@/components/shared/Logo';

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
/**
 * Four capabilities, one short line each.
 *
 * This was five entries with a two-clause sentence apiece — around eighty words beside a
 * form that asks for two fields. Nobody reads a feature essay while signing in, and the
 * density made the panel look like documentation rather than product voice. Each blurb is
 * now a single clause, and the weakest of the five is gone.
 */
const CAPABILITIES = [
  {
    icon: ShieldCheck,
    title: 'Approvals that route themselves',
    blurb: 'A blended risk score picks the approver.',
  },
  {
    icon: TrendingUp,
    title: 'Upsell with margin impact',
    blurb: 'Ranked as you build, never below the margin floor.',
  },
  {
    icon: Truck,
    title: 'Multi-warehouse fulfilment',
    blurb: 'Split across depots to cut shipments.',
  },
  {
    icon: Repeat,
    title: 'Hybrid billing',
    blurb: 'One-time and recurring on one order.',
  },
];

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const login = useAppStore((s) => s.login);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});
  const [busy, setBusy] = useState(false);

  const destination = location.state?.from ?? '/app/dashboard';

  const handleSubmit = async (e) => {
    e.preventDefault();

    // Checked before the request is spent. Posting a blank field earned
    // "Invalid email or password" from the server — true, but it points at the
    // credentials rather than at the empty box that actually caused it.
    const { errors, ok } = runChecks({
      email: () => validEmail(email),
      password: () => requiredText(password, 'Enter your password.'),
    });
    setFieldErrors(errors);
    if (!ok) return;

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
          description="Quote-to-cash built for real B2B conditions."
          items={CAPABILITIES}
          note="Your permissions come from the server on sign-in."
        />
      }
    >
      <Logo size="lg" className="mb-4" />

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
          error={fieldErrors.email ?? error}
          onChange={(e) => {
            setEmail(e.target.value);
            setError(null);
            setFieldErrors((f) => ({ ...f, email: null }));
          }}
        />
        <PasswordField
          label="Password"
          required
          autoComplete="current-password"
          placeholder="Your password"
          value={password}
          error={fieldErrors.password}
          onChange={(e) => {
            setPassword(e.target.value);
            setError(null);
            setFieldErrors((f) => ({ ...f, password: null }));
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

      <div className="border-brand-500/12 mt-4 border-t pt-4">
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
