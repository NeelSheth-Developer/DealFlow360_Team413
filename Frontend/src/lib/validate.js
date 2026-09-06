/**
 * Field validation shared by every form in the app.
 *
 * WHY IT IS CENTRAL. Each form grew its own rules, so the same field was checked
 * differently depending on where you met it: signup required a name of 2+ characters and
 * a well-formed email, while sign-in checked nothing and posted blanks straight to the
 * server. That produced "Invalid email or password" for an empty box — technically true,
 * useless as guidance, and a wasted round trip.
 *
 * THE SERVER IS STILL THE AUTHORITY. These rules exist to catch what is obviously wrong
 * before a request is spent, never to second-guess the API: nothing here rejects a value
 * the server would have accepted. Password strength lives in `passwordPolicy.js` for the
 * same reason — only its 8-character floor is enforced, because that is the only rule the
 * server actually has.
 */

/** Trimmed length, treating null/undefined as empty. */
const len = (v) => String(v ?? '').trim().length;

export function requiredText(value, message = 'This field is required.') {
  return len(value) === 0 ? message : null;
}

export function minLength(value, min, message) {
  return len(value) < min ? (message ?? `Use at least ${min} characters.`) : null;
}

/**
 * Deliberately permissive: `something@something.tld`.
 *
 * A stricter regex rejects addresses that are perfectly valid (plus-tags, new TLDs,
 * quoted locals), and the cost of a false rejection here is a user who cannot sign in at
 * all. The server normalises and verifies by sending a code, which is the only check that
 * actually proves an address works.
 */
export function validEmail(value, message = 'Enter a valid email address.') {
  const v = String(value ?? '').trim();
  if (!v) return 'Enter your email address.';
  return /^\S+@\S+\.\S+$/.test(v) ? null : message;
}

export function matches(value, other, message = 'The two values do not match.') {
  return value !== other ? message : null;
}

/**
 * Non-negative number. Used for money, quantities and percentages, none of which have a
 * meaningful negative in this product — a negative price would invert every margin and
 * risk figure downstream of it.
 */
export function nonNegative(value, message = 'This cannot be negative.') {
  const n = Number(value);
  if (!Number.isFinite(n)) return 'Enter a number.';
  return n < 0 ? message : null;
}

export function inRange(value, min, max, message) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 'Enter a number.';
  return n < min || n > max ? (message ?? `Enter a value between ${min} and ${max}.`) : null;
}

/**
 * Run a `{ field: () => error | null }` map and collect the failures.
 *
 * @returns {{ errors, ok }} — `ok` is true when nothing failed.
 * @example
 *   const { errors, ok } = runChecks({
 *     email: () => validEmail(email),
 *     password: () => requiredText(password, 'Enter your password.'),
 *   });
 *   if (!ok) return setErrors(errors);
 */
export function runChecks(checks) {
  const errors = {};
  for (const [field, check] of Object.entries(checks)) {
    const error = check();
    if (error) errors[field] = error;
  }
  return { errors, ok: Object.keys(errors).length === 0 };
}
