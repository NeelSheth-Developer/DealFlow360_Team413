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
 */
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

  const email = normalizeEmail(emailArg);
  const [existing] = await db.select().from(users).where(eq(users.email, email)).limit(1);

  if (existing) {
    if (existing.role === 'admin') {
      console.log(`${email} is already an admin. Nothing to do.`);
      process.exit(0);
    }

    await db
      .update(users)
      .set({ role: 'admin', active: true, updatedAt: new Date() })
      .where(eq(users.id, existing.id));

    console.log(`Promoted ${email}: ${existing.role} -> admin`);
    process.exit(0);
  }

  if (!nameArg || !passwordArg) {
    console.error(`No account for ${email}. Provide a name and password to create one:\n` +
      '  npm run seed:admin -- <email> "<name>" "<password>"');
    process.exit(1);
  }
  if (passwordArg.length < 8) {
    console.error('Password must be at least 8 characters.');
    process.exit(1);
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

  console.log(`Created admin ${email}. Sign in with POST /auth/login (type: "internal").`);
  process.exit(0);
}

main().catch((error: unknown) => {
  console.error('seed:admin failed:', error instanceof Error ? error.message : error);
  process.exit(1);
});
