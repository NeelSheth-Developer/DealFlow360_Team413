import { eq } from 'drizzle-orm';
import type { Request } from 'express';
import { db } from '../db/index.js';
import { customers, users, type ActorRole } from '../db/schema.js';
import type { AuditActor } from './audit.js';
import { ApiError } from '../utils/api-error.js';

/**
 * Turns the verified token on a request into an audit actor.
 *
 * The name is resolved from the database rather than carried in the JWT: a token
 * minted before a rename would otherwise write a stale name into a permanent,
 * append-only trail. `actorFrom` is the cheap synchronous form used where only the id
 * and role matter; `resolveActor` is the one that fills in the display name.
 */

export function actorFrom(req: Request): AuditActor {
  if (!req.auth) throw ApiError.unauthorized();
  return {
    id: req.auth.id,
    // Filled by `resolveActor` where the name is actually rendered. Audit rows written
    // through this path record the id, which is the field that must be right.
    name: req.auth.kind === 'customer' ? 'Customer' : (req.auth.role ?? 'Staff'),
    role: (req.auth.kind === 'customer' ? 'customer' : req.auth.role) as ActorRole,
  };
}

/** The same actor with the display name looked up. Used wherever the name is shown. */
export async function resolveActor(req: Request): Promise<AuditActor> {
  if (!req.auth) throw ApiError.unauthorized();

  if (req.auth.kind === 'customer') {
    const [row] = await db
      .select({ name: customers.contactName, company: customers.name })
      .from(customers)
      .where(eq(customers.id, req.auth.id))
      .limit(1);

    return { id: req.auth.id, name: row?.name ?? row?.company ?? 'Customer', role: 'customer' };
  }

  const [row] = await db
    .select({ name: users.name })
    .from(users)
    .where(eq(users.id, req.auth.id))
    .limit(1);

  return {
    id: req.auth.id,
    name: row?.name ?? 'Staff',
    role: (req.auth.role ?? 'sales_rep') as ActorRole,
  };
}
