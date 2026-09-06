import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { ArrowRight, MailCheck, RotateCcw } from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

/**
 * The 6-digit OTP step shared by staff signup, customer signup and password
 * reset. POST /auth/signup and /auth/forgot-password both reply "OTP sent"
 * without a token, so this screen is mandatory — it is not optional polish.
 *
 * Resend is rate limited server-side to 60s (429 OTP_RESEND_TOO_SOON), so the
 * button is locked for the `retryAfterSeconds` the server hands back rather than
 * letting the user hammer it into an error.
 *
 * @param email    the address awaiting verification, shown for confirmation
 * @param onVerify async (otp) => ({ok, error?}) — the caller decides what
 *                 verifying means (create session, or move to a reset form)
 * @param onBack   optional escape hatch back to the previous step
 */
export function OtpVerification({
  email,
  onVerify,
  onBack,
  title = 'Check your email',
  description,
  confirmLabel = 'Verify and continue',
}) {
  const resendOtp = useAppStore((s) => s.resendOtp);

  const [otp, setOtp] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const inputRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Tick the resend cooldown down to zero.
  useEffect(() => {
    if (cooldown <= 0) return undefined;
    const timer = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const handleChange = (e) => {
    // Digits only, max 6 — matches the server's expected format.
    const next = e.target.value.replace(/\D/g, '').slice(0, 6);
    setOtp(next);
    setError(null);
  };

  const submit = useCallback(
    async (code) => {
      if (code.length !== 6) {
        setError('Enter the 6-digit code from your email.');
        return;
      }
      setBusy(true);
      const result = await onVerify(code);
      setBusy(false);

      if (!result?.ok) {
        setError(result?.error ?? 'That code could not be verified.');
        // Expired or burnt codes need a fresh one, so clear the field.
        if (['OTP_EXPIRED', 'OTP_TOO_MANY_ATTEMPTS'].includes(result?.code)) setOtp('');
      }
    },
    [onVerify],
  );

  const handleSubmit = (e) => {
    e.preventDefault();
    submit(otp);
  };

  const handleResend = async () => {
    const result = await resendOtp({ email });
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    setCooldown(result.retryAfterSeconds ?? 60);
    setOtp('');
    setError(null);
    toast.success('Code sent', { description: result.message });
    inputRef.current?.focus();
  };

  return (
    <div>
      <span className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-accent-teal to-state-info text-white shadow-glass">
        <MailCheck className="h-5 w-5" aria-hidden="true" />
      </span>

      <h1 className="text-xl font-extrabold tracking-tight text-ink">{title}</h1>
      <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">
        {description ?? (
          <>
            We sent a 6-digit code to <span className="font-semibold text-ink">{email}</span>. Enter
            it below to continue.
          </>
        )}
      </p>

      <form onSubmit={handleSubmit} className="mt-5 space-y-3.5">
        <Input
          ref={inputRef}
          label="Verification code"
          required
          inputMode="numeric"
          autoComplete="one-time-code"
          placeholder="000000"
          maxLength={6}
          value={otp}
          error={error}
          onChange={handleChange}
          className="num text-center text-lg tracking-[0.4em]"
          hint={otp.length === 6 ? 'Ready to verify' : `${6 - otp.length} digit(s) remaining`}
        />

        <Button
          type="submit"
          fullWidth
          size="lg"
          loading={busy}
          disabled={otp.length !== 6}
          iconRight={ArrowRight}
        >
          {confirmLabel}
        </Button>
      </form>

      <div className="border-brand-500/12 mt-4 flex flex-wrap items-center justify-between gap-2 border-t pt-4">
        <Button
          variant="ghost"
          size="sm"
          icon={RotateCcw}
          onClick={handleResend}
          disabled={cooldown > 0 || busy}
        >
          {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend code'}
        </Button>

        {onBack && (
          <Button variant="ghost" size="sm" onClick={onBack} disabled={busy}>
            Use a different email
          </Button>
        )}
      </div>
    </div>
  );
}
