const PREFIX = 'CUST-';
const PAD = 4;

/**
 * The public handle a customer reads out to their sales rep. Derived from the
 * database identity column rather than stored, so two concurrent signups can never
 * be handed the same code.
 */
export function toCustomerCode(seq: number): string {
  return `${PREFIX}${String(seq).padStart(PAD, '0')}`;
}

/** Parses `CUST-0001` back to `1`. Returns null for anything else. */
export function parseCustomerCode(code: string): number | null {
  const match = /^CUST-(\d{1,9})$/i.exec(code.trim());
  if (!match) return null;
  const seq = Number(match[1]);
  return Number.isSafeInteger(seq) && seq > 0 ? seq : null;
}
