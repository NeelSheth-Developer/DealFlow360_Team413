/**
 * Money and percentage helpers.
 *
 * Postgres `numeric` arrives over the wire as a string — `"87400.00"`, not `87400` —
 * because JavaScript's number type cannot represent every decimal exactly. Every read
 * of a numeric column goes through `num()`, and every write through `money()` or
 * `pct()`, so the conversion happens in one place instead of being re-derived at each
 * call site.
 *
 * The API speaks major units (`87400`, `1470.97`), matching the frontend contract.
 */

/** A numeric column (or anything nullish) as a JS number. Null and undefined become 0. */
export function num(value: string | number | null | undefined): number {
  if (value === null || value === undefined) return 0;
  return typeof value === 'number' ? value : Number(value);
}

/** Same as `num`, but preserves null instead of collapsing it to 0. */
export function numOrNull(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  return typeof value === 'number' ? value : Number(value);
}

/** Rounds to 2 decimal places. Used everywhere a figure reaches the client. */
export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** Formats for a `numeric(14,2)` money column. */
export function money(value: number): string {
  return round2(value).toFixed(2);
}

/** Formats for a `numeric(5,2)` percentage column. */
export function pct(value: number): string {
  return round2(value).toFixed(2);
}

/**
 * Payment comparisons need a tolerance: a client sending `224130.00` and a balance
 * computed as `224129.999999` are the same amount, and rejecting that as an
 * overpayment would be wrong.
 */
export const MONEY_EPSILON = 0.01;

/** `true` when two money amounts are equal within the rounding tolerance. */
export function moneyEquals(a: number, b: number): boolean {
  return Math.abs(a - b) < MONEY_EPSILON;
}

/** `true` when `amount` exceeds `limit` by more than the rounding tolerance. */
export function exceeds(amount: number, limit: number): boolean {
  return amount - limit > MONEY_EPSILON;
}
