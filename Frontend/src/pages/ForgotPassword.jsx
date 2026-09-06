import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowRight, KeyRound, Lock, LogIn, Mail } from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import { CUSTOMER, INTERNAL } from '@/services/authService';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { AuthAside, AuthShell } from '@/components/auth/AuthShell';
import { OtpVerification } from '@/components/auth/OtpVerification';
import { PasswordChecklist, PasswordField } from '@/components/auth/PasswordField';
import { requiredText } from '@/lib/validate';
import { Logo } from '@/components/shared/Logo';

/**
 * Password reset. Both endpoints existed on the server with no UI at all.
 *
 *   step 1  POST /auth/forgot-password  → emails a code, ALWAYS 200
 *   step 2  POST /auth/reset-password   → verifies code + sets password
 *
 * Two deliberate behaviours:
 *  - Step 1 never confirms whether the address exists. We show the same "check
 *    your email" state either way, because leaking account existence here would
 *    undo the server's care in always returning 200.
 *  - Step 2 revokes every session and issues NO token, so we always land the user
 *    back on the sign-in form rather than pretending they're logged in.
 *
 * `?type=customer` routes the reset at the customer identity space; the two are
 * separate on the server so the type must travel with every call.
 */

const RESET_STEPS = [
  {
    icon: Mail,
    title: 'Enter your email',
    blurb: 'We send a 6-digit code to the address on your account.',
  },
  {
    icon: KeyRound,
    title: 'Enter the code',
    blurb: 'Valid for 10 minutes, single use, five attempts.',
  },
  {
    icon: Lock,
    title: 'Choose a new password',
    blurb: 'At least 8 characters, and different from your current one.',
  },
  {
    icon: LogIn,
    title: 'Sign in again',
    blurb: 'No token is issued by a reset, so you start a fresh session.',
  },
];

export default function ForgotPassword() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const type = params.get('type') === 'customer' ? CUSTOMER : INTERNAL;
  const isCustomer = type === CUSTOMER;

  const forgotPassword = useAppStore((s) => s.forgotPassword);
  const resetPassword = useAppStore((s) => s.resetPassword);

  const [step, setStep] = useState('request'); // 'request' | 'verify' | 'reset'
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [passwords, setPasswords] = useState({ next: '', confirm: '' });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const loginPath = isCustomer ? '/customer/login' : '/login';
  const tone = isCustomer ? 'teal' : 'brand';

  const handleRequest = async (e) => {
    e.preventDefault();
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
      setError('Enter a valid email address.');
      return;
    }

    setBusy(true);
    const result = await forgotPassword({ email: email.trim(), type });
    setBusy(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }
    setStep('verify');
    toast.success('Check your email', { description: result.message });
  };

  /**
   * The OTP is not spent here — reset-password consumes it together with the new
   * password. So this step only holds the code and advances the form.
   */
  const handleVerify = async (code) => {
    setOtp(code);
    setStep('reset');
    return { ok: true };
  };

  const handleReset = async (e) => {
    e.preventDefault();
    const noCode = requiredText(otp, 'Enter the 6-digit code from your email.');
    if (noCode) {
      setError(noCode);
      return;
    }
    if (passwords.next.length < 8) {
      setError('Use at least 8 characters.');
      return;
    }
    if (passwords.next !== passwords.confirm) {
      setError('Passwords do not match.');
      return;
    }

    setBusy(true);
    const result = await resetPassword({
      email: email.trim(),
      otp,
      newPassword: passwords.next,
      type,
    });
    setBusy(false);

    if (!result.ok) {
      setError(result.error);
      // A bad or stale code has to be re-entered.
      if (['OTP_INVALID', 'OTP_EXPIRED', 'OTP_TOO_MANY_ATTEMPTS'].includes(result.code)) {
        setStep('verify');
      }
      return;
    }

    toast.success('Password updated', {
      description:
        result.sessionsRevoked > 0
          ? `${result.sessionsRevoked} other session(s) were signed out.`
          : 'Sign in with your new password.',
    });
    navigate(loginPath, { replace: true });
  };

  return (
    <AuthShell
      backTo={loginPath}
      backLabel="Back to sign in"
      aside={
        <AuthAside
          tone={tone}
          title="Resetting your password"
          description={`Four steps on your ${isCustomer ? 'customer' : 'staff'} account. Codes arrive by email and expire, so nothing lingers if you change your mind.`}
          items={RESET_STEPS}
          note="We return the same response whether or not an account exists at that address."
        />
      }
    >
      {step === 'verify' && (
        <OtpVerification
          email={email.trim()}
          onVerify={handleVerify}
          onBack={() => setStep('request')}
          title="Enter your reset code"
          confirmLabel="Continue"
        />
      )}

      {step === 'request' && (
        <>
          <Logo size="lg" className="mb-4" />

          <h1 className="text-xl font-extrabold tracking-tight text-ink">Reset your password</h1>
          <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">
            Enter the email on your {isCustomer ? 'customer' : 'staff'} account and we&apos;ll send
            a 6-digit code.
          </p>

          <form onSubmit={handleRequest} className="mt-5 space-y-3.5">
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
            <Button type="submit" fullWidth size="lg" loading={busy} iconRight={ArrowRight}>
              Send reset code
            </Button>
          </form>

          <p className="mt-4 text-[11px] leading-relaxed text-ink-muted">
            For your security we send the same response whether or not an account exists at that
            address.
          </p>
        </>
      )}

      {step === 'reset' && (
        <>
          <Logo size="lg" className="mb-4" />

          <h1 className="text-xl font-extrabold tracking-tight text-ink">Choose a new password</h1>
          <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">
            Setting a new password signs out every other device.
          </p>

          <form onSubmit={handleReset} className="mt-5 space-y-3.5">
            <PasswordField
              label="New password"
              required
              autoComplete="new-password"
              placeholder="At least 8 characters"
              value={passwords.next}
              onChange={(e) => {
                setPasswords((p) => ({ ...p, next: e.target.value }));
                setError(null);
              }}
            />
            <PasswordChecklist value={passwords.next} />
            <PasswordField
              label="Confirm new password"
              required
              autoComplete="new-password"
              value={passwords.confirm}
              error={error}
              onChange={(e) => {
                setPasswords((p) => ({ ...p, confirm: e.target.value }));
                setError(null);
              }}
            />
            <Button type="submit" fullWidth size="lg" loading={busy} iconRight={ArrowRight}>
              Update password
            </Button>
          </form>
        </>
      )}
    </AuthShell>
  );
}
