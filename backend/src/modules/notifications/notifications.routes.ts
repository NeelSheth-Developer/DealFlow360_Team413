import { and, count, desc, eq } from 'drizzle-orm';
import { Router } from 'express';
import { z } from 'zod';
import { db } from '../../db/index.js';
import { notifications } from '../../db/schema.js';
import { requireAuth, requireKind } from '../../middleware/auth.js';
import { ApiError } from '../../utils/api-error.js';
import { asyncHandler } from '../../utils/async-handler.js';

export const notificationsRouter = Router();

/**
 * In-app notifications, standing in for the emails a production deployment would send.
 * (This build sends those emails too — see `lib/emails.ts`.)
 *
 * Every query is scoped to the caller's own user id. There is no way to read anyone
 * else's notifications, including for an admin: the row often carries a summary of a
 * deal the reader is not part of.
 *
 * The row stores `entityType` / `entityId` / `entityRef` / `view` rather than a URL. A
 * frontend route is the frontend's business, and hardcoding one here would mean a
 * routing change on their side needs a backend deploy on ours.
 */
notificationsRouter.use(requireAuth, requireKind('staff'));

const idParam = z.string().uuid('Invalid notification id');

const querySchema = z
  .object({
    unreadOnly: z
      .enum(['true', 'false'])
      .transform((value) => value === 'true')
      .optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .strict();

function callerId(auth: { id: string } | undefined): string {
  if (!auth) throw ApiError.unauthorized();
  return auth.id;
}

notificationsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const query = querySchema.parse(req.query);
    const userId = callerId(req.auth);

    const where =
      query.unreadOnly === true
        ? and(eq(notifications.userId, userId), eq(notifications.read, false))
        : eq(notifications.userId, userId);

    const [rows, [unread]] = await Promise.all([
      db
        .select()
        .from(notifications)
        .where(where)
        .orderBy(desc(notifications.createdAt))
        .limit(query.limit),
      db
        .select({ total: count() })
        .from(notifications)
        .where(and(eq(notifications.userId, userId), eq(notifications.read, false))),
    ]);

    res.json({
      success: true,
      data: rows.map((row) => ({
        id: row.id,
        userId: row.userId,
        type: row.type,
        title: row.title,
        body: row.body,
        entityType: row.entityType,
        entityId: row.entityId,
        entityRef: row.entityRef,
        view: row.view,
        read: row.read,
        at: row.createdAt,
      })),
      meta: { unreadCount: unread?.total ?? 0 },
    });
  }),
);

/** Scoped to the caller in the WHERE clause, so another user's id simply matches nothing. */
notificationsRouter.patch(
  '/read-all',
  asyncHandler(async (req, res) => {
    const userId = callerId(req.auth);
    await db
      .update(notifications)
      .set({ read: true })
      .where(and(eq(notifications.userId, userId), eq(notifications.read, false)));

    res.status(204).send();
  }),
);

notificationsRouter.patch(
  '/:id/read',
  asyncHandler(async (req, res) => {
    const id = idParam.parse(req.params.id);
    const userId = callerId(req.auth);

    const [updated] = await db
      .update(notifications)
      .set({ read: true })
      .where(and(eq(notifications.id, id), eq(notifications.userId, userId)))
      .returning({ id: notifications.id });

    if (!updated) throw ApiError.notFound('Notification not found');
    res.status(204).send();
  }),
);
