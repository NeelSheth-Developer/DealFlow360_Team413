import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft, ArrowRight, Building2, LogIn } from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import { GlassCard } from '@/components/glass/Glass';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

/**
 * Customer sign-in. Entirely separate from the staff login at /login — different
 * route, different identity space, different session.
 */
export default function CustomerLogin() {
  const navigate = useNavigate();
  const location = useLocation();
  const customerLogin = useAppStore((s) => s.customerLogin);
  const demoPasswordHint = useAppStore((s) => s.demoPasswordHint);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const destination = location.state?.from ?? '/customer/quotations';

  const handleSubmit = (e) => {
    e.preventDefault();
    setBusy(true);
    const result = customerLogin(email, password);
    setBusy(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }
    toast.success(`Welcome back, ${result.customer.contactName}`, {
      description: result.customer.name,
    });
    navigate(destination, { replace: true });
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <Link
          to="/"
          className="mb-5 inline-flex items-center gap-1.5 text-xs font-semibold text-ink-soft transition-colors hover:text-brand-700"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
          Back to home
        </Link>

        <GlassCard strong className="p-6">
          <span className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-accent-teal to-state-info text-white shadow-glass">
            <Building2 className="h-5 w-5" aria-hidden="true" />
          </span>

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

            <Button type="submit" fullWidth size="lg" loading={busy} icon={LogIn}>
              Sign in
            </Button>
          </form>

          <p className="mt-4 text-xs text-ink-muted">
            New here?{' '}
            <Link
              to="/customer/signup"
              className="font-semibold text-accent-teal hover:underline"
            >
              Create a customer account
            </Link>
          </p>

          <div className="mt-4 rounded-xl bg-accent-teal/8 p-3">
            <p className="text-[11px] font-bold text-accent-teal">Demo accounts</p>
            <p className="mt-1 text-[11px] leading-relaxed text-ink-soft">
              Try{' '}
              <code className="rounded bg-white/70 px-1 py-0.5 text-[10px]">
                arjun.bose@cygnusretail.example
              </code>{' '}
              (has an open negotiation) or{' '}
              <code className="rounded bg-white/70 px-1 py-0.5 text-[10px]">
                sundar.iyer@acmecorp.example
              </code>
              . Password for all demo accounts:{' '}
              <code className="rounded bg-white/70 px-1 py-0.5 text-[10px]">
                {demoPasswordHint()}
              </code>
            </p>
          </div>

          <div className="mt-4 border-t border-brand-500/12 pt-4">
            <p className="text-xs text-ink-muted">
              Are you on the sales team?{' '}
              <Link to="/login" className="inline-flex items-center gap-1 font-semibold text-brand-600 hover:underline">
                Staff sign in
                <ArrowRight className="h-3 w-3" aria-hidden="true" />
              </Link>
            </p>
          </div>
        </GlassCard>
      </div>
    </div>
  );
}
