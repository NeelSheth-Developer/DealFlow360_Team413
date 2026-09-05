/**
 * Generates a memorable customer ID like `DF-MRK472`.
 *
 * Format: `DF-` + 3 consonants from the name (uppercased) + 3 digits derived
 * from the email. The result is short, pronounceable, and easy to share verbally
 * — similar to how people remember a Gmail handle or a short phone extension.
 *
 * Uniqueness is not guaranteed by this function alone; the caller must handle
 * collisions (retry with a different salt).
 */
export function generateCustomerId(name: string, email: string, salt = 0): string {
  const CONSONANTS = 'BCDFGHJKLMNPQRSTVWXYZ';

  // Extract up to 3 consonants from the name, left-to-right.
  const letters = name
    .toUpperCase()
    .replace(/[^A-Z]/g, '')
    .split('')
    .filter((c) => CONSONANTS.includes(c))
    .slice(0, 3)
    .join('')
    .padEnd(3, 'X'); // pad with X if the name has fewer than 3 consonants

  // Derive 3 digits from a simple hash of email + salt so retries differ.
  const raw = `${email.toLowerCase()}${salt}`;
  let h = 5381;
  for (let i = 0; i < raw.length; i++) h = ((h << 5) + h) ^ raw.charCodeAt(i);
  const digits = String(Math.abs(h) % 1000).padStart(3, '0');

  return `DF-${letters}${digits}`;
}
