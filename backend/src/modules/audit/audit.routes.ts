import { and, count, desc, eq, gte, ilike, lte, or, type SQL } from 'drizzle-orm';
import { Router } from 'express';
import { z } from 'zod';
import { db } from '../../db/index.js';
import { auditLog } from '../../db/schema.js';
import { requireAuth, requireKind, requireRole } from '../../middleware/auth.js';
import { asyncHandler } from '../../utils/async-handler.js';

export const auditRouter = Router();

/**
 * The audit trail.
 *
 * READ ONLY. There is no POST, PUT, PATCH or DELETE on this router and there never
 * will be — the brief requires approvals, rejections and edits to be logged with user,
 * timestamp and reason, and a trail that can be edited afterwards proves nothing.
 * Entries are written only through `lib/audit.ts`, from inside the services.
 *
 * Manager, finance and admin. A rep cannot browse the trail: it exposes every
 * colleague's discount decisions and the reasons attached to them.
 */
auditRouter.use(
  requireAuth,
  requireKind('staff'),
  requireRole('sales_manager', 'finance', 'admin'),
);

const querySchema = z
  .object({
    entityType: z
      .enum([
        'quotation',
        'invoice',
        'product',
        'price_list',
        'customer',
        'user',
        'warehouse',
        'subscription_plan',
        'upsell_rule',
        'config',
      ])
      .optional(),
    entityId: z.string().uuid().optional(),
    actorId: z.string().uuid().optional(),
    actorRole: z
      .enum(['sales_rep', 'sales_manager', 'finance', 'admin', 'customer', 'system'])
      .optional(),
    search: z.string().max(255).optional(),
    from: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    to: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(200).default(50),
  })
  .strict();

auditRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const query = querySchema.parse(req.query);

    const filters: SQL[] = [];
    if (query.entityType) filters.push(eq(auditLog.entityType, query.entityType));
    if (query.entityId) filters.push(eq(auditLog.entityId, query.entityId));
    if (query.actorId) filters.push(eq(auditLog.actorId, query.actorId));
    if (query.actorRole) filters.push(eq(auditLog.actorRole, query.actorRole));
    if (query.from) filters.push(gte(auditLog.createdAt, new Date(`${query.from}T00:00:00Z`)));
    if (query.to) filters.push(lte(auditLog.createdAt, new Date(`${query.to}T23:59:59Z`)));

    if (query.search) {
      const term = `%${query.search}%`;
      const search = or(
        ilike(auditLog.action, term),
        ilike(auditLog.actorName, term),
        ilike(auditLog.entityRef, term),
      );
      if (search) filters.push(search);
    }

    const where = filters.length > 0 ? and(...filters) : undefined;
    const offset = (query.page - 1) * query.pageSize;

    const [rows, [totals]] = await Promise.all([
      db
        .select()
        .from(auditLog)
        .where(where)
        .orderBy(desc(auditLog.createdAt))
        .limit(query.pageSize)
        .offset(offset),
      db.select({ total: count() }).from(auditLog).where(where),
    ]);

    const total = totals?.total ?? 0;

    res.json({
      success: true,
      data: rows.map((row) => ({
        id: row.id,
        entityType: row.entityType,
        entityId: row.entityId,
        entityRef: row.entityRef,
        action: row.action,
        actorId: row.actorId,
        actorName: row.actorName,
        actorRole: row.actorRole,
        reason: row.reason,
        meta: row.meta,
        at: row.createdAt,
      })),
      meta: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
      },
    });
  }),
);
