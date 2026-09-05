import { db } from '../db/index.js';
import { auditLog, type ActorRole } from '../db/schema.js';
import { logger } from '../config/logger.js';

/**
 * The append-only audit trail.
 *
 * The problem statement requires that all approvals, rejections and edits are logged
 * with user, timestamp and reason — and an editable trail is worthless, so there is
 * deliberately no update or delete path anywhere in the codebase.
 *
 * The actor is always the server's own view of who called, taken from the verified
 * token. A client-supplied actor is never accepted: it would let a rep write a
 * manager's name onto their own approval.
 */

export type AuditActor = {
  id: string | null;
  name: string;
  role: ActorRole;
};

export type AuditEntry = {
  entityType:
    | 'quotation'
    | 'invoice'
    | 'product'
    | 'price_list'
    | 'customer'
    | 'user'
    | 'warehouse'
    | 'subscription_plan'
    | 'upsell_rule'
    | 'config';
  entityId?: string | null;
  entityRef?: string | null;
  action: string;
  actor: AuditActor;
  reason?: string | null;
  meta?: Record<string, unknown> | null;
};

/**
 * Writes one entry.
 *
 * Never throws. An audit write that fails must not roll back the business action that
 * succeeded — a rejected quotation stays rejected even if the trail write times out.
 * The failure is logged at error level so it is visible rather than silent, which is
 * the right trade: a missing trail line is recoverable, a half-applied approval is not.
 */
export async function audit(entry: AuditEntry): Promise<void> {
  try {
    await db.insert(auditLog).values({
      entityType: entry.entityType,
      entityId: entry.entityId ?? null,
      entityRef: entry.entityRef ?? null,
      action: entry.action,
      actorId: entry.actor.id,
      actorName: entry.actor.name,
      actorRole: entry.actor.role,
      reason: entry.reason ?? null,
      meta: entry.meta ?? null,
    });
  } catch (error) {
    logger.error({ err: error, entry }, 'Audit write failed');
  }
}

/** The server itself — auto-approvals and scheduled jobs. */
export const SYSTEM_ACTOR: AuditActor = { id: null, name: 'System', role: 'system' };
