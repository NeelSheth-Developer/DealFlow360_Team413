import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Building2, FileText, Hash, MailCheck, MessageSquareQuote, UserPlus } from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { AuthAside, AuthShell } from '@/components/auth/AuthShell';
import { OtpVerification } from '@/components/auth/OtpVerification';

/**
 * Customer self-registration. POST /auth/signup with type:'customer'.
 *
 * The API accepts exactly { name, email, password, type } — `name` is the
 * organisation name. The previous form also collected `contactName` and tried to
 * "claim" an existing unclaimed customer record; neither has any server support,
 * so both are gone. A contact name can be set once PATCH /auth/me exists.
 *
 * Tier is never chosen here. The server starts every account at bronze and only a
 * Sales Manager or Admin can promote it, because tier decides pricing. The
 * CUST-XXXX reference is issued by the server after OTP verification.
 */

const STEPS = [
  {
    icon: Building2,
    title: 'Register your organisation',
    blurb: 'The name you enter is the one that appears on your quotations.',
  },
  {
    icon: MailCheck,
    title: 'Confirm your email',
    blurb: 'We send a 6-digit code to verify the address is yours.',
  },
  {
    icon: Hash,
    title: 'Get your account reference',
    blurb: 'A reference is issued so your rep can find you instantly.',
  },
  {
    icon: FileText,
    title: 'Review your quotations',
    blurb: 'Line items, savings and recurring charges, all itemised.',
  },
  {
    icon: MessageSquareQuote,
    title: 'Negotiate and confirm',
    blurb: 'Ask questions, counter a discount, then accept when you’re happy.',
  },
];

export default function CustomerSignup() {
  const navigate = useNavigate();
  const customerSignup = useAppStore((s) => s.customerSignup);
  const verifyOtp = useAppStore((s) => s.verifyOtp);
  const clearPendingVerification = useAppStore((s) => s.clearPendingVerification);

  const [step, setStep] = useState('details'); // 'details' | 'verify'
  const [form, setForm] = useState({ name: '', email: '', password: '', confirm: '' });
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);

  const setField = (key) => (e) => {
    setForm((f) => ({ ...f, [key]: e.target.value }));
    setErrors((prev) => ({ ...prev, [key]: null }));
  };

  const validate = () => {
    const next = {};
    if (form.name.trim().length < 2) next.name = 'Enter your organisation name.';
    if (!/^\S+@\S+\.\S+$/.test(form.email.trim())) next.email = 'Enter a valid email address.';
    if (form.password.length < 8) next.password = 'Use at least 8 characters.';
    if (form.password !== form.confirm) next.confirm = 'Passwords do not match.';
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;

    setBusy(true);
    const result = await customerSignup({
      name: form.name.trim(),
      email: form.email.trim(),
      password: form.password,
    });
    setBusy(false);

    if (!result.ok) {
      setErrors({ email: result.error });
      return;
    }

    if (result.status === 'authenticated') {
      toast.success(`Welcome, ${result.customer.name}`);
      navigate('/customer/quotations', { replace: true });
      return;
    }

    setStep('verify');
    toast.success('Check your email', { description: result.message });
  };

  const handleVerify = async (otp) => {
    const result = await verifyOtp({ otp });
    if (result.ok) {
      toast.success('Account verified', {
        description: result.session.customerCode
          ? `Your account reference is ${result.session.customerCode}.`
          : 'Your quotations are ready to review.',
      });
      navigate('/customer/quotations', { replace: true });
    }
    return result;
  };

  const handleBack = () => {
    clearPendingVerification();
    setStep('details');
  };

  return (
    <AuthShell
      backTo="/customer/login"
      backLabel="Back to sign in"
      aside={
        <AuthAside
          tone="teal"
          title="Review and negotiate online"
          description="Registering turns every quotation you receive into a live document — question a line, counter a discount, and confirm without a single email."
          items={STEPS}
          note="New accounts start on our standard price list. If your organisation has an agreed commercial tier, your account manager applies it — tiers decide pricing, so they are never self-selected."
        />
      }
    >
      {step === 'verify' ? (
        <OtpVerification
          email={form.email.trim()}
          onVerify={handleVerify}
          onBack={handleBack}
          confirmLabel="Verify and continue"
        />
      ) : (
        <>
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
              label="Organisation name"
              required
              autoComplete="organization"
              placeholder="Acme Corp"
              value={form.name}
              error={errors.name}
              onChange={setField('name')}
              hint="This is the name that appears on your quotations."
            />
            <Input
              label="Work email"
              type="email"
              required
              autoComplete="email"
              placeholder="you@company.com"
              value={form.email}
              error={errors.email}
              onChange={setField('email')}
            />
            <Input
              label="Password"
              type="password"
              required
              autoComplete="new-password"
              placeholder="At least 8 characters"
              value={form.password}
              error={errors.password}
              onChange={setField('password')}
            />
            <Input
              label="Confirm password"
              type="password"
              required
              autoComplete="new-password"
              value={form.confirm}
              error={errors.confirm}
              onChange={setField('confirm')}
            />

            <Button type="submit" fullWidth size="lg" loading={busy} icon={UserPlus}>
              Create account
            </Button>
          </form>

          <p className="mt-3 text-[11px] leading-snug text-ink-muted">
            New accounts start on our standard price list. Pricing tiers are applied by your account
            manager, never self-selected.
          </p>

          <p className="mt-4 text-xs text-ink-muted">
            Already registered?{' '}
            <Link to="/customer/login" className="font-semibold text-accent-teal hover:underline">
              Sign in
            </Link>
          </p>
        </>
      )}
    </AuthShell>
  );
}
