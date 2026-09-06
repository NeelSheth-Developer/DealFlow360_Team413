import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import {
  ArrowRight,
  FileText,
  LogIn,
  MessageSquareQuote,
  Percent,
  Repeat,
  ShieldCheck,
} from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { AuthAside, AuthShell } from '@/components/auth/AuthShell';
import { PasswordField } from '@/components/auth/PasswordField';
import { requiredText, runChecks, validEmail } from '@/lib/validate';
import { Logo } from '@/components/shared/Logo';

/**
 * Customer sign-in. POST /auth/login with type:'customer'.
 *
 * Entirely separate from the staff login at /login — different route, different
 * identity space on the server, different session. Signing in here clears any
 * staff session, so a rep who opens this page becomes a customer rather than
 * seeing internal data through a customer screen.
 *
 * The old "Demo accounts" card listing seeded emails and a shared password has
 * been removed: those addresses only existed in the local seed file and the
 * password was hardcoded in the client.
 */

const PORTAL_NOTES = [
  {
    icon: FileText,
    title: 'Review line by line',
    blurb: 'Quantities, unit prices and exactly what you save on each item.',
  },
  {
    icon: MessageSquareQuote,
    title: 'Ask about anything',
    blurb: 'Open a thread on a single line — price, quantity, spec or delivery.',
  },
  {
    icon: Percent,
    title: 'Counter the discount',
    blurb: 'Propose the number you want with a justification.',
  },
  {
    icon: Repeat,
    title: 'See recurring charges clearly',
    blurb: 'Subscription lines are labelled with their cadence and billing dates.',
  },
  {
    icon: ShieldCheck,
    title: 'Confirm online',
    blurb: 'Accept and the order moves into fulfilment. No email thread, no PDF.',
  },
];

export default function CustomerLogin() {
  const navigate = useNavigate();
  const location = useLocation();
  const customerLogin = useAppStore((s) => s.customerLogin);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});
  const [busy, setBusy] = useState(false);

  const destination = location.state?.from ?? '/customer/quotations';

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
    const result = await customerLogin({ email: email.trim(), password });
    setBusy(false);

    if (!result.ok) {
      setError(result.error);
      if (result.code === 'EMAIL_NOT_VERIFIED') {
        toast.info('Email not verified', {
          description: 'Register again with the same address to receive a fresh code.',
        });
      }
      return;
    }

    toast.success(`Welcome back, ${result.customer.contactName ?? result.customer.name}`, {
      description: result.customer.name,
    });
    navigate(destination, { replace: true });
  };

  return (
    <AuthShell
      backTo="/"
      backLabel="Back to home"
      aside={
        <AuthAside
          tone="teal"
          title="Your quotations, in one place"
          description="Everything your account manager sends you becomes a live document you can question and negotiate."
          items={PORTAL_NOTES}
          note="The portal is a genuinely separate area from the sales workspace."
        />
      }
    >
      <Logo size="lg" className="mb-4" />

      <h1 className="text-xl font-extrabold tracking-tight text-ink">Customer sign in</h1>
      <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">
        Sign in to review your quotations, ask questions and confirm terms.
      </p>

      <form onSubmit={handleSubmit} className="mt-5 space-y-3.5">
        <Input
          label="Email address"
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
            setFieldErrors((f) => ({ ...f, password: null }));
          }}
        />

        <div className="flex justify-end">
          <Link
            to="/forgot-password?type=customer"
            className="text-xs font-semibold text-accent-teal hover:underline"
          >
            Forgot your password?
          </Link>
        </div>

        <Button type="submit" fullWidth size="lg" loading={busy} icon={LogIn}>
          Sign in
        </Button>
      </form>

      <p className="mt-4 text-xs text-ink-muted">
        New here?{' '}
        <Link to="/customer/signup" className="font-semibold text-accent-teal hover:underline">
          Create a customer account
        </Link>
      </p>

      <div className="border-brand-500/12 mt-4 border-t pt-4">
        <p className="text-xs text-ink-muted">
          Are you on the sales team?{' '}
          <Link
            to="/login"
            className="inline-flex items-center gap-1 font-semibold text-brand-600 hover:underline"
          >
            Staff sign in
            <ArrowRight className="h-3 w-3" aria-hidden="true" />
          </Link>
        </p>
      </div>
    </AuthShell>
  );
}
