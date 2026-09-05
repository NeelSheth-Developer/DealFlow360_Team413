import { Resend } from 'resend';
import { emailChain, env, isProduction, type EmailTransport } from '../config/env.js';
import { logger } from '../config/logger.js';
import type { OtpPurpose } from './otp-purpose.js';

const resend = new Resend(env.RESEND_API_KEY);

/** Splits `Name <addr@host>` into the pair Brevo's API expects. */
function parseFrom(value: string): { name: string; email: string } {
  const match = /^\s*(.*?)\s*<([^>]+)>\s*$/.exec(value);
  if (match) return { name: match[1] || 'DealFlow360', email: match[2] ?? '' };
  return { name: 'DealFlow360', email: value.trim() };
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
type Sent = { id: string | null; transport: EmailTransport };

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

/**
 * Brevo's HTTP API.
 *
 * Uses the global fetch rather than a client library — it is one POST, and a
 * dependency for that is a dependency to keep patched for no benefit. Being HTTPS on
 * 443 is the whole point: it keeps working on hosts that block outbound SMTP, which
 * is where an SMTP relay would silently hang instead of failing.
 */
async function viaBrevo(to: string, subject: string, body: Body) {
  const sender = parseFrom(env.EMAIL_FROM);

  const response = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'api-key': env.BREVO_API_KEY ?? '',
      'content-type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify({
      sender,
      to: [{ email: to }],
      subject,
      htmlContent: body.html,
      textContent: body.text,
    }),
    // Without this a stalled connection would hang the send indefinitely, which is
    // the failure this whole chain exists to avoid.
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    // Brevo puts the useful part in the body — an unverified sender reads as
    // "sender not valid", which is nothing like the status code alone suggests.
    const detail = await response.text();
    throw new Error(`Brevo ${response.status}: ${detail.slice(0, 200)}`);
  }

  const data = (await response.json()) as { messageId?: string };
  return { id: data.messageId ?? null, transport: 'brevo' as const };
}

/**
 * The single place mail leaves the application.
 *
 * Transports are tried in order until one accepts the message. The order matters:
 * both are HTTPS on 443, so neither is affected by the SMTP blocking that most
 * hosting platforms apply — an SMTP fallback looks fine locally and then silently
 * hangs in production, which is exactly the trap this replaced.
 *
 * The fallback exists because the failure it covers is routine rather than exotic: a
 * daily quota runs out mid-afternoon, and from then on every OTP fails and every
 * signup blocks for a reason the user can neither see nor fix.
 *
 * One attempt per transport, no retry loop and no queue. If all of them refuse, the
 * error carries every reason and propagates; callers treat a failed send as
 * non-fatal, so a business action never rolls back because mail was slow.
 *
 * No Reply-To is set: replies bounce rather than landing in a mailbox nobody reads.
 */
export async function sendEmail({ to, subject, html, text }: SendEmailOptions) {
  const body: Body = { html: html + FOOTER_HTML, text: text + FOOTER_TEXT };

  const send: Record<EmailTransport, (t: string, s: string, b: Body) => Promise<Sent>> = {
    resend: viaResend,
    brevo: viaBrevo,
  };

  const failures: string[] = [];

  for (const [index, transport] of emailChain.entries()) {
    try {
      const sent = await send[transport](to, subject, body);
      if (index > 0) {
        logger.info({ ...sent, subject, after: failures.join('; ') }, 'Email sent via fallback');
      } else {
        logger.info({ ...sent, subject }, 'Email sent');
      }
      return sent;
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      failures.push(`${transport}: ${reason}`);

      // Only worth a warning if something else is still going to be tried.
      if (index < emailChain.length - 1) {
        logger.warn({ subject, transport, reason }, 'Transport refused — trying the next');
      }
    }
  }

  logger.error({ subject, failures }, 'Every email transport refused the message');
  throw new Error(`Email delivery failed. ${failures.join(' | ')}`);
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
