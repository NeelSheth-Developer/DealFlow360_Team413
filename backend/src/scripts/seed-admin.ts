import { pathToFileURL } from 'node:url';
import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { users } from '../db/schema.js';
import { hashPassword } from '../lib/password.js';
import { normalizeEmail } from '../lib/sanitize.js';

/**
 * Creates or promotes the first admin.
 *
 * This exists because the API deliberately cannot produce an admin:
 *
 *   - `POST /auth/signup` always writes `role = 'sales_rep'`; `role` in the body is
 *     rejected with 400 FIELD_NOT_ALLOWED
 *   - `PATCH /users/:id` is the only way to change a role, and it requires an
 *     existing admin
 *
 * So the first one has to be planted from the backend, by someone with database
 * access. Every admin after that is promoted by an existing admin, and that change
 * is attributable.
 *
 * Usage:
 *   npm run seed:admin -- admin@teamvector.space "Neha Gupta" "S3cure!pass"
 *
 * Promoting an existing account needs only the email; the name and password are used
 * when the account does not exist yet.
 *
 * `seedAdmin` is exported so the end-to-end script can bootstrap its own admin without
 * shelling out. It returns a result rather than calling `process.exit`, which is what
 * makes it safe to call in-process; the CLI wrapper below turns that into an exit code.
 */
export type SeedResult =
  | { status: 'already-admin'; email: string }
  | { status: 'promoted'; email: string; from: string }
  | { status: 'created'; email: string };

export async function seedAdmin(
  emailArg: string,
  nameArg?: string,
  passwordArg?: string,
): Promise<SeedResult> {
  const email = normalizeEmail(emailArg);
  const [existing] = await db.select().from(users).where(eq(users.email, email)).limit(1);

  if (existing) {
    if (existing.role === 'admin') return { status: 'already-admin', email };

    await db
      .update(users)
      .set({ role: 'admin', active: true, updatedAt: new Date() })
      .where(eq(users.id, existing.id));

    return { status: 'promoted', email, from: existing.role };
  }

  if (!nameArg || !passwordArg) {
    throw new Error(
      `No account for ${email}. Provide a name and password to create one:\n` +
        '  npm run seed:admin -- <email> "<name>" "<password>"',
    );
  }
  if (passwordArg.length < 8) {
    throw new Error('Password must be at least 8 characters.');
  }

  await db.insert(users).values({
    name: nameArg.trim(),
    email,
    passwordHash: await hashPassword(passwordArg),
    role: 'admin',
    // Seeded from the backend by someone with database access, so the address is
    // taken as proved — no OTP round-trip for the bootstrap account.
    emailVerifiedAt: new Date(),
  });

  return { status: 'created', email };
}

async function main() {
  const [emailArg, nameArg, passwordArg] = process.argv.slice(2);

  if (!emailArg) {
    console.error(
      'Usage: npm run seed:admin -- <email> [name] [password]\n' +
        '  existing account → promoted to admin\n' +
        '  new account      → created as a verified admin (name and password required)',
    );
    process.exit(1);
  }

  const result = await seedAdmin(emailArg, nameArg, passwordArg);

  if (result.status === 'already-admin') {
    console.log(`${result.email} is already an admin. Nothing to do.`);
  } else if (result.status === 'promoted') {
    console.log(`Promoted ${result.email}: ${result.from} -> admin`);
  } else {
    console.log(`Created admin ${result.email}. Sign in with POST /auth/login (type: "internal").`);
  }

  process.exit(0);
}

/** Only run the CLI when this file is the entry point, not when it is imported. */
const isEntryPoint =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isEntryPoint) {
  main().catch((error: unknown) => {
    console.error('seed:admin failed:', error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
