import { Resend } from 'resend';
import { env, isProduction } from '../config/env.js';
import { logger } from '../config/logger.js';
import type { OtpPurpose } from './otp-purpose.js';

const resend = new Resend(env.RESEND_API_KEY);

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

/**
 * Sends through Resend from the no-reply sender. No Reply-To is set: replies bounce
 * rather than landing in a mailbox nobody reads.
 */
export async function sendEmail({ to, subject, html, text }: SendEmailOptions) {
  const { data, error } = await resend.emails.send({
    from: env.EMAIL_FROM,
    to: [to],
    subject,
    html: html + FOOTER_HTML,
    text: text + FOOTER_TEXT,
  });

  if (error) {
    logger.error({ err: error, subject }, 'Resend failed to send email');
    throw new Error(`Email delivery failed: ${error.message}`);
  }

  logger.info({ id: data?.id, subject }, 'Email sent');
  return data;
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
