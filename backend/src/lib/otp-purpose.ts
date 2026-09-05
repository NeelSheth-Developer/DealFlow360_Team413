/**
 * What a one-time code is for.
 *
 * Lives in its own module because two unrelated things need it: `otp.ts`, which keys
 * the stored code by purpose, and `email.ts`, which picks a template from it. Having
 * `email.ts` import from `otp.ts` pointed the dependency the wrong way — the email
 * layer should not know how codes are stored.
 *
 * The purpose is part of the OTP's HMAC, so a code minted for one flow cannot be
 * spent on another. Adding a value here means adding a template in `email.ts`, which
 * the exhaustive `Record<OtpPurpose, …>` there enforces at compile time.
 */
export type OtpPurpose = 'signup' | 'password_reset';
