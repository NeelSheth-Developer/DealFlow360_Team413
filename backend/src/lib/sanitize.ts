/**
 * Input normalisation applied before validation, so every rule downstream sees one
 * canonical shape. None of this replaces parameterised queries or output encoding —
 * it exists so the same value cannot be stored two different ways.
 */

/**
 * C0 controls, DEL, and C1 controls. Matching these is the whole point of the rule —
 * they are stripped, never executed — so `no-control-regex` is disabled here rather
 * than worked around.
 */
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = new RegExp('[\\u0000-\\u001F\\u007F-\\u009F]', 'g');

/** Strips control characters and collapses runs of whitespace. */
export function cleanText(value: string): string {
  return value.replace(CONTROL_CHARS, '').replace(/\s+/g, ' ').trim();
}

/**
 * Lower-cases and trims. Unicode-normalised (NFKC) so two visually identical
 * addresses cannot both be registered — that would let two accounts claim one inbox.
 */
export function normalizeEmail(value: string): string {
  return value.normalize('NFKC').replace(CONTROL_CHARS, '').trim().toLowerCase();
}

/** Keeps only ASCII digits — OTP codes arrive pasted with spaces or dashes. */
export function digitsOnly(value: string): string {
  return value.replace(/\D/g, '');
}

/** Trims a request header to a safe length before it reaches the database. */
export function clampHeader(value: string | undefined, max: number): string | null {
  if (!value) return null;
  const cleaned = cleanText(value);
  return cleaned.length > 0 ? cleaned.slice(0, max) : null;
}
