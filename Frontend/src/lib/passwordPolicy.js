/**
 * The password rules, in one place.
 *
 * The server's floor is 8 characters and nothing else (`z.string().min(8)`), so only the
 * `required` rule can actually block a submission. The rest are ADVISORY and are labelled
 * as such in the UI — presenting an app-invented rule as if the API enforced it would
 * mean rejecting a password the server would happily accept.
 *
 * Kept apart from the components that render it so the constants can be imported by
 * validation code without dragging JSX along, and so the component file stays
 * fast-refresh clean.
 */
export const PASSWORD_RULES = [
  { id: 'length', label: 'At least 8 characters', required: true, test: (v) => v.length >= 8 },
  { id: 'upper', label: 'One capital letter', test: (v) => /[A-Z]/.test(v) },
  { id: 'lower', label: 'One lowercase letter', test: (v) => /[a-z]/.test(v) },
  { id: 'number', label: 'One number', test: (v) => /\d/.test(v) },
  { id: 'symbol', label: 'One symbol', test: (v) => /[^A-Za-z0-9]/.test(v) },
];

/** True when the password clears everything the SERVER requires. */
export function meetsPasswordPolicy(value = '') {
  return PASSWORD_RULES.filter((r) => r.required).every((r) => r.test(value));
}

/** How many rules a password clears — drives the strength bar. */
export function passwordScore(value = '') {
  return PASSWORD_RULES.filter((r) => r.test(value)).length;
}
