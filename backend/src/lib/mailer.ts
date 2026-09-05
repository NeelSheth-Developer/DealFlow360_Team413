import { logger } from '../config/logger.js';
import { sendEmail } from './email.js';

/**
 * Transactional emails for the sales workflow.
 *
 * One layout, used by every message: a heading, a short lead sentence, an optional
 * table of the facts, and an optional closing note. No images, no external CSS, no
 * web fonts — inline styles and a table are what render the same in Outlook, Gmail and
 * Apple Mail, and a sales notification is read on a phone far more often than not.
 *
 * Every function here is fire-and-forget. `deliver` swallows its errors on purpose:
 * an approval that succeeded must not be rolled back because a mail server was slow.
 * The failure is logged at error level, never silently dropped.
 */

export type DetailRow = { label: string; value: string };

type Message = {
  to: string;
  subject: string;
  heading: string;
  lead: string;
  rows?: DetailRow[];
  note?: string;
};

const BRAND = '#4f46e5';
const INK = '#111827';
const MUTED = '#6b7280';
const LINE = '#e5e7eb';

function renderHtml(message: Message): string {
  const rows = (message.rows ?? [])
    .map(
      (row) => `
        <tr>
          <td style="padding:8px 16px 8px 0;color:${MUTED};font-size:14px;vertical-align:top;white-space:nowrap">${escapeHtml(row.label)}</td>
          <td style="padding:8px 0;color:${INK};font-size:14px;font-weight:600;vertical-align:top">${escapeHtml(row.value)}</td>
        </tr>`,
    )
    .join('');

  const table =
    rows.length > 0
      ? `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:20px 0;border-top:1px solid ${LINE};border-bottom:1px solid ${LINE}">${rows}</table>`
      : '';

  const note = message.note
    ? `<p style="color:${MUTED};font-size:14px;line-height:22px;margin:16px 0 0">${escapeHtml(message.note)}</p>`
    : '';

  return `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;padding:8px">
      <p style="color:${BRAND};font-size:13px;font-weight:700;letter-spacing:0.5px;margin:0 0 20px">DEALFLOW360</p>
      <h1 style="color:${INK};font-size:20px;line-height:28px;font-weight:600;margin:0 0 12px">${escapeHtml(message.heading)}</h1>
      <p style="color:${INK};font-size:15px;line-height:24px;margin:0">${escapeHtml(message.lead)}</p>
      ${table}
      ${note}
    </div>
  `;
}

function renderText(message: Message): string {
  const rows = (message.rows ?? []).map((row) => `${row.label}: ${row.value}`).join('\n');

  return [
    'DEALFLOW360',
    '',
    message.heading,
    '',
    message.lead,
    rows ? `\n${rows}` : '',
    message.note ? `\n${message.note}` : '',
  ]
    .filter((part) => part !== '')
    .join('\n');
}

/**
 * Sends one message. Never throws — see the note at the top of this file.
 * Returns `true` when the send succeeded, for callers that want to log the outcome.
 */
export async function deliver(message: Message): Promise<boolean> {
  if (!message.to) return false;

  try {
    await sendEmail({
      to: message.to,
      subject: message.subject,
      html: renderHtml(message),
      text: renderText(message),
    });
    return true;
  } catch (error) {
    logger.error(
      { err: error, subject: message.subject, to: message.to },
      'Transactional email failed',
    );
    return false;
  }
}

/** Sends the same message to several addresses, skipping blanks and duplicates. */
export async function deliverAll(
  recipients: string[],
  build: (to: string) => Message,
): Promise<void> {
  const unique = [...new Set(recipients.filter(Boolean))];
  await Promise.all(unique.map((to) => deliver(build(to))));
}

/** Formats an amount for an email body. Currency first, grouped, always 2 decimals. */
export function formatAmount(value: number, currency: string): string {
  return `${currency} ${value.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/**
 * User-supplied names, product names and reasons all land inside an HTML email, so
 * they are escaped here. Sanitising on the way in is not a reason to skip encoding on
 * the way out.
 */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
