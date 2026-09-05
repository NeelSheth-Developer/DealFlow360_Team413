import { sql } from 'drizzle-orm';
import { db } from '../db/index.js';

/**
 * Human-readable references — `Q-1042`, `INV-2031`, `CN-0007`.
 *
 * Primary keys stay uuid; this is a second, unique identifier that exists purely
 * because people read these out to each other. A rep says "Q-1042" on a call; nobody
 * says "3f2a9c14-...". The uuid is what foreign keys point at, so a reference is free
 * to be regenerated or reformatted later without touching a single relationship.
 *
 * The counter is derived from the highest existing value rather than a sequence, so
 * the numbering survives a database restore that does not carry sequence state. Two
 * concurrent creates can pick the same number; the unique index rejects the loser and
 * the caller retries — see `withReference`.
 */

type Prefix = 'Q' | 'INV' | 'CN';

const START: Record<Prefix, number> = {
  Q: 1001,
  INV: 2001,
  CN: 1,
};

const PAD: Record<Prefix, number> = {
  Q: 4,
  INV: 4,
  CN: 4,
};

/** The next unused reference for a table, e.g. `Q-1042`. */
export async function nextReference(prefix: Prefix, table: string): Promise<string> {
  // `substring` past the prefix and the dash, cast to int. Rows whose reference does
  // not match the pattern are excluded so a hand-inserted oddity cannot poison the max.
  const pattern = `^${prefix}-[0-9]+$`;
  const result = await db.execute(
    sql`SELECT COALESCE(MAX(SUBSTRING(reference FROM ${prefix.length + 2})::bigint), 0) AS top
        FROM ${sql.identifier(table)}
        WHERE reference ~ ${pattern}`,
  );

  const top = Number((result.rows[0] as Record<string, unknown> | undefined)?.top ?? 0);
  const next = Math.max(top + 1, START[prefix]);
  return `${prefix}-${String(next).padStart(PAD[prefix], '0')}`;
}

/** Postgres unique-violation. Two creates raced for the same reference. */
function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error
    ? (error as { code?: unknown }).code === '23505'
    : false;
}

/**
 * Runs `insert` with a freshly allocated reference, retrying when a concurrent create
 * takes the same one. Five attempts is far beyond what real contention needs — the
 * window is a single round trip — and it fails loudly rather than silently looping.
 */
export async function withReference<T>(
  prefix: Prefix,
  table: string,
  insert: (reference: string) => Promise<T>,
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const reference = await nextReference(prefix, table);
    try {
      return await insert(reference);
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      lastError = error;
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error(`Could not allocate a ${prefix} reference after 5 attempts`);
}
