import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import {
  ArrowRight,
  ClipboardCheck,
  MailCheck,
  ShieldCheck,
  Sparkles,
  UserCog,
} from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import { roleLabel } from '@/lib/format';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { AuthAside, AuthShell } from '@/components/auth/AuthShell';
import { OtpVerification } from '@/components/auth/OtpVerification';
import { PasswordChecklist, PasswordField } from '@/components/auth/PasswordField';
import { Logo } from '@/components/shared/Logo';

/**
 * Staff self-registration. POST /auth/signup with type:'internal'.
 *
 * NO ROLE PICKER. The API rejects `role`, `team`, `tier` and `currency` with
 * 400 FIELD_NOT_ALLOWED — a user choosing their own role would be a privilege
 * escalation hole. The server assigns a default role and an admin promotes from
 * Users & roles via PATCH /users/:id.
 *
 * TWO STEPS. Signup replies 201 with an OTP and no tokens, so the form swaps to
 * the verification step. Only POST /auth/verify-otp creates the session.
 */

const STEPS = [
  {
    icon: Sparkles,
    title: 'Create your account',
    blurb: 'Name, work email and a password of at least 8 characters.',
  },
  {
    icon: MailCheck,
    title: 'Confirm your email',
    blurb: 'We send a 6-digit code. Entering it signs you straight in.',
  },
  {
    icon: UserCog,
    title: 'An admin sets your role',
    blurb: 'Every new account starts as a Sales Rep until someone promotes it.',
  },
  {
    icon: ClipboardCheck,
    title: 'Start building quotations',
    blurb: 'Tier pricing, ceiling hints and a live risk score as you type.',
  },
  {
    icon: ShieldCheck,
    title: 'Approvals route themselves',
    blurb: 'The blended score picks Manager or Manager + Finance.',
  },
];

export default function Signup() {
  const navigate = useNavigate();
  const signup = useAppStore((s) => s.signup);
  const verifyOtp = useAppStore((s) => s.verifyOtp);
  const clearPendingVerification = useAppStore((s) => s.clearPendingVerification);

  const [step, setStep] = useState('details'); // 'details' | 'verify'
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);

  const setField = (key) => (e) => {
    setForm((f) => ({ ...f, [key]: e.target.value }));
    setErrors((prev) => ({ ...prev, [key]: null }));
  };

  const validate = () => {
    const next = {};
    if (form.name.trim().length < 2) next.name = 'Enter your full name.';
    if (!/^\S+@\S+\.\S+$/.test(form.email.trim())) next.email = 'Enter a valid email address.';
    if (form.password.length < 8) next.password = 'Use at least 8 characters.';
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;

    setBusy(true);
    const result = await signup({
      name: form.name.trim(),
      email: form.email.trim(),
      password: form.password,
    });
    setBusy(false);

    if (!result.ok) {
      setErrors({ email: result.error });
      return;
    }

    // 200 = the address was already verified, so a session came back directly.
    if (result.status === 'authenticated') {
      toast.success(`Welcome back, ${result.user.name}`, {
        description: roleLabel(result.user.role),
      });
      navigate('/app/dashboard', { replace: true });
      return;
    }

    setStep('verify');
    toast.success('Check your email', { description: result.message });
  };

  const handleVerify = async (otp) => {
    const result = await verifyOtp({ otp });
    if (result.ok) {
      toast.success('Account verified', {
        description: `Signed in as ${roleLabel(result.session.role)}.`,
      });
      navigate('/app/dashboard', { replace: true });
    }
    return result;
  };

  const handleBack = () => {
    clearPendingVerification();
    setStep('details');
  };

  return (
    <AuthShell
      backTo="/login"
      backLabel="Back to sign in"
      aside={
        <AuthAside
          title="Join the sales workspace"
          description="Registration is for the internal sales team."
          items={STEPS}
          note="You don’t choose your role here."
        />
      }
    >
      {step === 'verify' ? (
        <OtpVerification
          email={form.email.trim()}
          onVerify={handleVerify}
          onBack={handleBack}
          confirmLabel="Verify and sign in"
        />
      ) : (
        <>
          <Logo size="lg" className="mb-4" />

          <h1 className="text-xl font-extrabold tracking-tight text-ink">Create your account</h1>
          <p className="mt-1.5 text-sm text-ink-soft">
            For the internal sales team. We&apos;ll email you a code to confirm the address.
          </p>

          <form onSubmit={handleSubmit} className="mt-5 space-y-3.5">
            <Input
              label="Full name"
              required
              autoComplete="name"
              placeholder="Asha Verma"
              value={form.name}
              error={errors.name}
              onChange={setField('name')}
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
            <PasswordField
              label="Password"
              required
              autoComplete="new-password"
              placeholder="At least 8 characters"
              value={form.password}
              error={errors.password}
              onChange={setField('password')}
            />
            {/* Appears on the first keystroke — five red crosses against an untouched
                field would read as five mistakes already made. */}
            <PasswordChecklist value={form.password} />

            <Button type="submit" fullWidth size="lg" loading={busy} iconRight={ArrowRight}>
              Create account
            </Button>
          </form>

          {/* The role explainer lives in the aside — repeating it here was noise. */}
          <p className="mt-4 text-xs text-ink-muted">
            Already have an account?{' '}
            <Link to="/login" className="font-semibold text-brand-600 hover:underline">
              Sign in
            </Link>
          </p>
        </>
      )}
    </AuthShell>
  );
}
