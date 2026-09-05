import { Router } from 'express';
import { requireAuth, requireKind, requireRole } from '../../middleware/auth.js';
import { asyncHandler } from '../../utils/async-handler.js';
import { reportQuerySchema } from './reports.schemas.js';
import { listTeams, productPerformance, summary } from './reports.service.js';

export const reportsRouter = Router();
export const teamsRouter = Router();

/**
 * Reporting.
 *
 * Manager, finance and admin. A rep is deliberately excluded: these figures include
 * every colleague's discount average and margin, and cross-rep visibility is a
 * management view, not a working one.
 */
reportsRouter.use(
  requireAuth,
  requireKind('staff'),
  requireRole('sales_manager', 'finance', 'admin'),
);

reportsRouter.get(
  '/summary',
  asyncHandler(async (req, res) => {
    const query = reportQuerySchema.parse(req.query);
    res.json({ success: true, data: await summary(query) });
  }),
);

reportsRouter.get(
  '/products',
  asyncHandler(async (req, res) => {
    const query = reportQuerySchema.parse(req.query);
    res.json({ success: true, data: await productPerformance(query) });
  }),
);

/**
 * Sales territories.
 *
 * Read-only and open to all staff — it populates the report filter and the staff
 * directory's team column. There is no create endpoint: the brief lists products,
 * price lists, tiers, warehouses and plans as the admin's configuration surface, and
 * teams are not among them, so the three rows are seeded by migration.
 */
teamsRouter.use(requireAuth, requireKind('staff'));

teamsRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    res.json({ success: true, data: await listTeams() });
  }),
);
