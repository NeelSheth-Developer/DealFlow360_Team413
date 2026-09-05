import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft, Building2, Info, UserPlus } from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import { GlassCard } from '@/components/glass/Glass';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

/**
 * Customer self-registration.
 *
 * Tier is never chosen here — every new account starts at Bronze and only a
 * Sales Manager or Admin can promote it, because tier decides pricing. If the
 * company already exists in the directory without a claimed login, this form
 * claims that record instead of creating a duplicate.
 */
export default function CustomerSignup() {
  const navigate = useNavigate();
  const customerSignup = useAppStore((s) => s.customerSignup);

  const [form, setForm] = useState({
    companyName: '',
    contactName: '',
    email: '',
    password: '',
    confirm: '',
  });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const setField = (key) => (e) => {
    setForm((f) => ({ ...f, [key]: e.target.value }));
    setError(null);
  };

  const handleSubmit = (e) => {
    e.preventDefault();

    if (form.password !== form.confirm) {
      setError('Passwords do not match.');
      return;
    }

    setBusy(true);
    const result = customerSignup({
      companyName: form.companyName,
      contactName: form.contactName,
      email: form.email,
      password: form.password,
    });
    setBusy(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    toast.success(
      result.claimed ? 'Account claimed' : `Welcome, ${result.customer.contactName}`,
      {
        description: result.claimed
          ? 'Your existing quotations are ready to review.'
          : 'Your account starts on our Bronze price list.',
      },
    );
    navigate('/customer/quotations', { replace: true });
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <Link
          to="/customer/login"
          className="mb-5 inline-flex items-center gap-1.5 text-xs font-semibold text-ink-soft transition-colors hover:text-brand-700"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
          Back to sign in
        </Link>

        <GlassCard strong className="p-6">
          <span className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-accent-teal to-state-info text-white shadow-glass">
            <Building2 className="h-5 w-5" aria-hidden="true" />
          </span>

          <h1 className="text-xl font-extrabold tracking-tight text-ink">
            Create a customer account
          </h1>
          <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">
            Register your organisation to review quotations and negotiate terms online.
          </p>

          <form onSubmit={handleSubmit} className="mt-5 space-y-3.5">
            <Input
              label="Company name"
              required
              placeholder="Acme Corp"
              value={form.companyName}
              onChange={setField('companyName')}
            />
            <Input
              label="Your name"
              required
              autoComplete="name"
              placeholder="Sundar Iyer"
              value={form.contactName}
              onChange={setField('contactName')}
            />
            <Input
              label="Work email"
              type="email"
              required
              autoComplete="email"
              placeholder="you@company.com"
              value={form.email}
              error={error}
              onChange={setField('email')}
            />
            <Input
              label="Password"
              type="password"
              required
              autoComplete="new-password"
              placeholder="At least 6 characters"
              value={form.password}
              onChange={setField('password')}
            />
            <Input
              label="Confirm password"
              type="password"
              required
              autoComplete="new-password"
              value={form.confirm}
              onChange={setField('confirm')}
            />

            <Button type="submit" fullWidth size="lg" loading={busy} icon={UserPlus}>
              Create account
            </Button>
          </form>

          <div className="mt-4 flex items-start gap-2.5 rounded-xl bg-brand-500/8 p-3">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" aria-hidden="true" />
            <p className="text-[11px] leading-relaxed text-ink-soft">
              New accounts start on our standard price list. If your organisation already has an
              agreed commercial tier, your account manager will apply it — pricing tiers are never
              self-selected.
            </p>
          </div>

          <p className="mt-4 text-xs text-ink-muted">
            Already registered?{' '}
            <Link to="/customer/login" className="font-semibold text-accent-teal hover:underline">
              Sign in
            </Link>
          </p>
        </GlassCard>
      </div>
    </div>
  );
}
