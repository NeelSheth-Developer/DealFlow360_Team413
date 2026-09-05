import { and, eq, inArray } from 'drizzle-orm';
import { db } from '../db/index.js';
import { logger } from '../config/logger.js';
import { notifications, users, type NotificationType, type Role } from '../db/schema.js';

/**
 * In-app notifications, standing in for the emails a production deployment would send.
 *
 * The row stores `entityType` / `entityId` / `entityRef` / `view` rather than a URL:
 * a frontend route is the frontend's business, and hardcoding `/app/quotations/...`
 * here would mean a routing change on their side needs a backend deploy on ours.
 */

export type NotifyInput = {
  userIds: string[];
  type: NotificationType;
  title: string;
  body?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  entityRef?: string | null;
  view?: string | null;
};

/**
 * Fans one notification out to a set of users.
 *
 * Never throws, for the same reason `audit` does not: failing to tell someone about an
 * approval must not undo the approval.
 */
export async function notify(input: NotifyInput): Promise<void> {
  const userIds = [...new Set(input.userIds)].filter(Boolean);
  if (userIds.length === 0) return;

  try {
    await db.insert(notifications).values(
      userIds.map((userId) => ({
        userId,
        type: input.type,
        title: input.title,
        body: input.body ?? null,
        entityType: input.entityType ?? null,
        entityId: input.entityId ?? null,
        entityRef: input.entityRef ?? null,
        view: input.view ?? null,
      })),
    );
  } catch (error) {
    logger.error({ err: error, type: input.type }, 'Notification write failed');
  }
}

/** Every active holder of a role — used to notify "all managers" on an escalation. */
export async function usersWithRole(...roles: Role[]): Promise<string[]> {
  if (roles.length === 0) return [];
  const rows = await db
    .select({ id: users.id })
    .from(users)
    .where(and(inArray(users.role, roles), eq(users.active, true)));
  return rows.map((row) => row.id);
}
