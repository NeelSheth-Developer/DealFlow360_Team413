import nodemailer, { type Transporter } from 'nodemailer';
import { Resend } from 'resend';
import { emailTransport, env, gmailConfigured, isProduction } from '../config/env.js';
import { logger } from '../config/logger.js';
import type { OtpPurpose } from './otp-purpose.js';

const resend = new Resend(env.RESEND_API_KEY);

/**
 * Gmail's SMTP transport, built on first use.
 *
 * Created lazily so a deployment with no Gmail credentials never opens a connection,
 * and reused afterwards — nodemailer pools, and building one per message would open a
 * fresh TLS handshake for every OTP.
 */
let gmail: Transporter | null = null;

function gmailTransport(): Transporter {
  gmail ??= nodemailer.createTransport({
    service: 'gmail',
    auth: { user: env.GMAIL_USER, pass: env.GMAIL_APP_PASSWORD },
    /**
     * Explicit timeouts, because the default is effectively "wait".
     *
     * Most hosting platforms block or throttle outbound SMTP to stop spam. On one of
     * those, a connection to Gmail does not fail — it hangs. And `sendCode` is
     * awaited on the signup path, so a hung socket hangs the HTTP request with it:
     * the user sees a spinner rather than an error, and the platform eventually kills
     * the request with no explanation.
     *
     * Ten seconds is far longer than a working connection needs and short enough that
     * a blocked port surfaces as ETIMEDOUT in the log, which is a diagnosable thing.
     */
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
  });
  return gmail;
}

/**
 * Gmail rewrites the From header to the authenticated account unless the address has
 * been verified under "Send mail as". Sending the Resend identity through it would
 * therefore produce a message that claims one sender and shows another — so the
 * fallback is honest about which account it came from.
 */
function gmailFrom(): string {
  return `DealFlow360 <${env.GMAIL_USER ?? ''}>`;
}

type SendEmailOptions = {
  to: string;
  subject: string;
  html: string;
  text: string;
};

const FOOTER_HTML = `
  <hr style="border:none;border-top:1px solid #e5e7eb;margin:32px 0" />
  <p style="color:#6b7280;font-size:12px">
    This message was sent from an unmonitored address — please do not reply.
  </p>
`;

const FOOTER_TEXT =
  '\n\n---\nThis message was sent from an unmonitored address — please do not reply.';

type Body = { html: string; text: string };

/** Resend's HTTP API — the primary route, sending from the verified domain. */
async function viaResend(to: string, subject: string, body: Body) {
  const { data, error } = await resend.emails.send({
    from: env.EMAIL_FROM,
    to: [to],
    subject,
    ...body,
  });

  // The SDK reports failure in the payload rather than by throwing, so this has to
  // be turned into one for the fallback below to catch it.
  if (error) throw new Error(error.message);

  return { id: data?.id ?? null, transport: 'resend' as const };
}

/** Gmail over SMTP — the fallback, and usable on its own via EMAIL_TRANSPORT=gmail. */
async function viaGmail(to: string, subject: string, body: Body) {
  const info = await gmailTransport().sendMail({
    from: gmailFrom(),
    to,
    subject,
    ...body,
  });

  return { id: info.messageId, transport: 'gmail' as const };
}

/**
 * The single place mail leaves the application.
 *
 * Resend first, Gmail if Resend refuses. The fallback exists because the failure it
 * covers is routine rather than exotic: a daily quota runs out mid-afternoon and every
 * OTP after that point silently fails, blocking signups for reasons the user cannot
 * see or fix. Retrying through a second provider turns that into a log line.
 *
 * Both are attempted only for the SAME message — there is no retry loop and no queue.
 * If both refuse, the error propagates and the caller decides; every caller in this
 * codebase treats a failed send as non-fatal and logs it, so a business action never
 * rolls back because mail was slow.
 *
 * No Reply-To is set: replies bounce rather than landing in a mailbox nobody reads.
 */
export async function sendEmail({ to, subject, html, text }: SendEmailOptions) {
  const body: Body = { html: html + FOOTER_HTML, text: text + FOOTER_TEXT };

  if (emailTransport === 'gmail') {
    const sent = await viaGmail(to, subject, body);
    logger.info({ ...sent, subject }, 'Email sent');
    return sent;
  }

  try {
    const sent = await viaResend(to, subject, body);
    logger.info({ ...sent, subject }, 'Email sent');
    return sent;
  } catch (resendError) {
    const reason = resendError instanceof Error ? resendError.message : String(resendError);

    if (env.EMAIL_TRANSPORT === 'resend' || !gmailConfigured) {
      logger.error({ err: resendError, subject, transport: 'resend' }, 'Email delivery failed');
      throw new Error(`Email delivery failed: ${reason}`, { cause: resendError });
    }

    logger.warn({ subject, reason }, 'Resend refused the message — falling back to Gmail');

    try {
      const sent = await viaGmail(to, subject, body);
      logger.info({ ...sent, subject, after: 'resend-failure' }, 'Email sent via fallback');
      return sent;
    } catch (gmailError) {
      // Both routes are gone. Report the original refusal too — it is usually the
      // informative one, and the Gmail error is often just "auth failed" on top of it.
      logger.error(
        { err: gmailError, resendReason: reason, subject },
        'Both email transports failed',
      );
      throw new Error(
        `Email delivery failed on both transports. Resend: ${reason}. ` +
          `Gmail: ${gmailError instanceof Error ? gmailError.message : String(gmailError)}`,
        { cause: gmailError },
      );
    }
  }
}

const COPY: Record<OtpPurpose, { subject: string; lead: string }> = {
  signup: {
    subject: 'Confirm your email address',
    lead: 'Use this code to finish setting up your DealFlow360 account.',
  },
  password_reset: {
    subject: 'Reset your password',
    lead: 'Use this code to set a new password for your DealFlow360 account.',
  },
};

/**
 * Delivers a one-time code.
 *
 * Outside production the code is also written to the log, so the flow can be walked
 * end to end without a verified sending domain. It is never logged in production —
 * an OTP in a log file is a password in a log file.
 */
export async function sendOtpEmail(options: {
  to: string;
  name: string;
  code: string;
  purpose: OtpPurpose;
}) {
  const { subject, lead } = COPY[options.purpose];
  const minutes = Math.round(env.OTP_TTL_SECONDS / 60);

  if (!isProduction) {
    logger.debug({ to: options.to, purpose: options.purpose, code: options.code }, 'OTP issued');
  }

  return sendEmail({
    to: options.to,
    subject,
    html: `
      <p>Hi ${escapeHtml(options.name)},</p>
      <p>${lead}</p>
      <p style="font-size:28px;font-weight:700;letter-spacing:6px;margin:24px 0">${options.code}</p>
      <p>The code expires in ${minutes} minutes. If you did not request it, ignore this email.</p>
    `,
    text:
      `Hi ${options.name},\n\n${lead}\n\nYour code: ${options.code}\n\n` +
      `The code expires in ${minutes} minutes. If you did not request it, ignore this email.`,
  });
}

/**
 * The name is user-supplied and lands inside an HTML email, so it is escaped here
 * rather than trusted — sanitisation on the way in is not a reason to skip encoding
 * on the way out.
 */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
