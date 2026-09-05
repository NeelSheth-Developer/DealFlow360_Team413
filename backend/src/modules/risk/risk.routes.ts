import { Router } from 'express';
import { requireAuth, requireKind, requireRole } from '../../middleware/auth.js';
import { logger } from '../../config/logger.js';
import {
  computeBlendedScore,
  loadCeilings,
  loadChain,
  scoreLines,
  type RiskLine,
} from '../../lib/risk.js';
import { asyncHandler } from '../../utils/async-handler.js';
import {
  blendedScoreSchema,
  scoreBatchSchema,
  scoreSchema,
  type ScoreInput,
} from './risk.schemas.js';

export const riskRouter = Router();

/**
 * Blended discount risk scoring.
 *
 * Staff only. A customer must never see a score, a ceiling or a line breakdown — the
 * whole thing is internal governance data, and the portal projection exists precisely
 * to keep it out of their view.
 *
 * The ceiling overrides on the request body are honoured ONLY for `admin` and
 * `sales_manager`, who own the configuration and use the risk sandbox to preview a
 * change before saving it. For everyone else the overrides are ignored and stored
 * config is used, so a rep cannot score their own quotation against a ceiling they
 * invented.
 */
riskRouter.use(requireAuth, requireKind('staff'));

function toRiskLines(input: ScoreInput): RiskLine[] {
  return input.lines.map((line) => ({
    id: line.id,
    productName: line.productName,
    category: line.category,
    qty: line.qty,
    unitPrice: line.unitPrice,
    discountPct: line.discountPct,
  }));
}

/** Whether this caller's ceiling overrides should be honoured. */
function mayOverride(role: string | undefined): boolean {
  return role === 'admin' || role === 'sales_manager';
}

riskRouter.post(
  '/score',
  asyncHandler(async (req, res) => {
    const input = scoreSchema.parse(req.body);
    const [ceilings, chain] = await Promise.all([loadCeilings(), loadChain()]);
    const canOverride = mayOverride(req.auth?.role);

    const result = scoreLines(
      {
        quotationId: input.quotationId,
        tier: input.tier,
        orderDiscountPct: input.orderDiscountPct,
        lines: toRiskLines(input),
        tierCeiling: canOverride ? input.tierCeiling : undefined,
        categoryCeilings: canOverride ? input.categoryCeilings : undefined,
      },
      ceilings,
      chain,
    );

    res.json({ success: true, data: result });
  }),
);

/**
 * Batch scoring. A quotation list of 15 rows must not cost 15 requests.
 *
 * Config is loaded once for the whole batch rather than per quotation — that is most
 * of the saving, and it also guarantees every row in one response was scored against
 * the same ceilings.
 */
riskRouter.post(
  '/score-batch',
  asyncHandler(async (req, res) => {
    const { quotations } = scoreBatchSchema.parse(req.body);
    const [ceilings, chain] = await Promise.all([loadCeilings(), loadChain()]);
    const canOverride = mayOverride(req.auth?.role);

    const results = quotations.map((input) =>
      scoreLines(
        {
          quotationId: input.quotationId,
          tier: input.tier,
          orderDiscountPct: input.orderDiscountPct,
          lines: toRiskLines(input),
          tierCeiling: canOverride ? input.tierCeiling : undefined,
          categoryCeilings: canOverride ? input.categoryCeilings : undefined,
        },
        ceilings,
        chain,
      ),
    );

    res.json({ success: true, data: { results } });
  }),
);

/**
 * The ceilings and chain a sandbox needs to render its starting state. Restricted to
 * the roles that may write config — knowing the exact trip points makes it trivial to
 * price a quotation to sit one basis point under one.
 */
riskRouter.get(
  '/config',
  requireRole('admin', 'sales_manager', 'finance'),
  asyncHandler(async (_req, res) => {
    const [ceilings, chain] = await Promise.all([loadCeilings(), loadChain()]);
    res.json({
      success: true,
      data: {
        tierCeilings: ceilings.tier,
        categoryCeilings: ceilings.category,
        approvalChain: chain,
      },
    });
  }),
);

/**
 * Lightweight blended discount risk score for live UI preview.
 *
 * Accepts lines with discount % and pre-computed line totals directly — no saved
 * quotation needed. Designed to be called on every discount/qty change in the UI
 * (debounced) so the rep sees the risk impact before saving.
 *
 * Formula:
 *   effective_ceiling = min(tier_ceiling, category_ceiling)
 *   overage           = max(0, discount_pct - effective_ceiling)
 *   blended_score     = SUM(overage * line_total) / SUM(line_total)
 *
 * approval_level is resolved by matching blended_score against the chain's
 * minScore/maxScore bands only — singleLineTrip is not considered here.
 */
riskRouter.post(
  '/blended-score',
  asyncHandler(async (req, res) => {
    const input = blendedScoreSchema.parse(req.body);
    const [ceilings, chain] = await Promise.all([loadCeilings(), loadChain()]);

    logger.debug({ ceilings, chain }, '[blended-score] loaded config from DB');

    const data = computeBlendedScore(input, ceilings, chain);

    logger.debug(
      {
        customerTier: input.customerTier,
        lines: input.lines,
        blended_score: data.blended_score,
        flagged_lines: data.flagged_lines,
        approval_level: data.approval_level,
      },
      '[blended-score] computed result',
    );

    res.json({ success: true, data });
  }),
);
