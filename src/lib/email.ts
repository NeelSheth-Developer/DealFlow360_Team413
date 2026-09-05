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

export async function sendEmail({ to, subject, html, text }: SendEmailOptions) {
  const { data, error } = await resend.emails.send({
    from: env.EMAIL_FROM,
    to: Array.isArray(to) ? to : [to],
    subject,
    html,
    ...(text ? { text } : {}),
    ...(env.EMAIL_REPLY_TO ? { replyTo: env.EMAIL_REPLY_TO } : {}),
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
    subject: 'Welcome to Team 413',
    html: `
      <h1>Welcome, ${name}!</h1>
      <p>Your account is ready.</p>
      <p><a href="${env.CLIENT_URL}">Open the app</a></p>
    `,
    text: `Welcome, ${name}! Your account is ready: ${env.CLIENT_URL}`,
  });
}

export function sendVerificationEmail(to: string, token: string) {
  const link = `${env.API_URL}/api/v1/auth/verify?token=${encodeURIComponent(token)}`;
  return sendEmail({
    to,
    subject: 'Verify your email address',
    html: `<p>Confirm your email by clicking <a href="${link}">this link</a>.</p>`,
    text: `Confirm your email: ${link}`,
  });
}
