import { Resend } from 'resend';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';

const resend = new Resend(env.RESEND_API_KEY);

type SendEmailOptions = {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
};

const FOOTER_HTML = `
  <hr style="border:none;border-top:1px solid #e5e7eb;margin:32px 0" />
  <p style="color:#6b7280;font-size:12px">
    This message was sent from an unmonitored address — please do not reply.
  </p>
`;

const FOOTER_TEXT = '\n\n---\nThis message was sent from an unmonitored address — please do not reply.';

/**
 * Sends through Resend from the no-reply sender. No Reply-To is set: replies
 * bounce rather than landing in a mailbox nobody reads.
 */
export async function sendEmail({ to, subject, html, text }: SendEmailOptions) {
  const { data, error } = await resend.emails.send({
    from: env.EMAIL_FROM,
    to: Array.isArray(to) ? to : [to],
    subject,
    html: html + FOOTER_HTML,
    ...(text ? { text: text + FOOTER_TEXT } : {}),
  });

  if (error) {
    logger.error({ err: error, to, subject }, 'Resend failed to send email');
    throw new Error(`Email delivery failed: ${error.message}`);
  }

  logger.info({ id: data?.id, to, subject }, 'Email sent');
  return data;
}

export function sendWelcomeEmail(to: string, name: string) {
  return sendEmail({
    to,
    subject: 'Welcome to DealFlow360',
    html: `
      <h1>Welcome, ${name}!</h1>
      <p>Your DealFlow360 account is ready.</p>
      <p><a href="${env.CLIENT_URL}">Open the app</a></p>
    `,
    text: `Welcome, ${name}! Your DealFlow360 account is ready: ${env.CLIENT_URL}`,
  });
}

export function sendVerificationEmail(to: string, token: string) {
  const link = `${env.API_URL}/api/v1/auth/verify?token=${encodeURIComponent(token)}`;
  return sendEmail({
    to,
    subject: 'Verify your email address',
    html: `<p>Confirm your DealFlow360 email by clicking <a href="${link}">this link</a>.</p>`,
    text: `Confirm your DealFlow360 email: ${link}`,
  });
}
