import { asc } from 'drizzle-orm';
import { db } from '../db/index.js';
import {
  approvalRules,
  categoryConfig,
  tierConfig,
  type Category,
  type Role,
  type Tier,
} from '../db/schema.js';
import { ApiError } from '../utils/api-error.js';
import { num, numOrNull, round2 } from './money.js';

/**
 * The blended discount risk score.
 *
 * From the problem statement, section 10: every line is measured against ITS OWN
 * binding ceiling — the stricter of its product-category ceiling and the customer's
 * tier ceiling. A Gold customer is allowed 15%, but a thin-margin service line capped
 * at 10% still breaks its own limit at 18%, and that one line flags the whole
 * quotation.
 *
 * "Blended" is the other half. Sometimes no single line is badly over, but many lines
 * are each a little over — 2 points, 3 points, 2 points — and added across the order
 * the rep has quietly given away real margin. So overages are weighted by GROSS line
 * value (`qty x unitPrice`, before discount) and averaged over the order:
 *
 *     bindingCeiling = min(categoryCeiling[line.category], tierCeiling)
 *     effectivePct   = line.discountPct + orderDiscountPct * (1 - line.discountPct / 100)
 *     overBy         = max(0, effectivePct - bindingCeiling)
 *     lineValue      = line.qty * line.unitPrice
 *
 *     score              = SUM(lineValue * overBy) / SUM(lineValue)
 *     worstSingleOverage = max(overBy)
 *
 * The two numbers catch different failures and are both needed. `score` catches the
 * death-by-a-thousand-cuts order; `worstSingleOverage` catches one badly-over line in
 * an otherwise clean one.
 *
 * Gross value is deliberate: weighting by the DISCOUNTED total would give the biggest
 * give-aways the smallest weight, which is exactly backwards.
 */

export type RiskLine = {
  id: string | null;
  productName: string;
  category: Category;
  qty: number;
  unitPrice: number;
  discountPct: number;
};

export type RiskInput = {
  quotationId: string | null;
  tier: Tier;
  orderDiscountPct: number;
  lines: RiskLine[];
  /** Overrides for the admin sandbox. Omitted fields fall back to stored config. */
  tierCeiling?: number | undefined;
  categoryCeilings?: Partial<Record<Category, number>> | undefined;
};

export type RiskLineBreakdown = {
  lineId: string | null;
  productName: string;
  category: Category;
  value: number;
  givenPct: number;
  lineDiscountPct: number;
  ceilingPct: number;
  categoryCeilingPct: number;
  tierCeilingPct: number;
  overBy: number;
  isViolation: boolean;
  contribution: number;
};

export type RiskResult = {
  quotationId: string | null;
  score: number;
  worstSingleOverage: number;
  violationCount: number;
  totalValue: number;
  weightedOverage: number;
  lineBreakdown: RiskLineBreakdown[];
  approvers: Role[];
  ruleId: string | null;
  label: string;
};

export type Ceilings = {
  tier: Record<Tier, number>;
  category: Record<Category, number>;
};

export type ChainRule = {
  id: string;
  minScore: number;
  maxScore: number | null;
  approvers: Role[];
  singleLineTrip: number | null;
  note: string | null;
  sortOrder: number;
};

const APPROVER_ROLES = new Set<string>(['sales_rep', 'sales_manager', 'finance', 'admin']);

/** Loads both ceiling tables in one round trip. */
export async function loadCeilings(): Promise<Ceilings> {
  const [tiers, categories] = await Promise.all([
    db.select().from(tierConfig),
    db.select().from(categoryConfig),
  ]);

  const tier = {} as Record<Tier, number>;
  for (const row of tiers) tier[row.tier] = num(row.maxDiscountPct);

  const category = {} as Record<Category, number>;
  for (const row of categories) category[row.category] = num(row.maxDiscountPct);

  return { tier, category };
}

/** The approval chain, in display order. */
export async function loadChain(): Promise<ChainRule[]> {
  const rows = await db.select().from(approvalRules).orderBy(asc(approvalRules.sortOrder));

  return rows.map((row) => ({
    id: row.id,
    minScore: num(row.minScore),
    maxScore: numOrNull(row.maxScore),
    // `approvers` is a text[] rather than a role[] so a rule survives a role rename;
    // anything unrecognised is dropped instead of being routed to a role that is gone.
    approvers: row.approvers.filter((role): role is Role => APPROVER_ROLES.has(role)),
    singleLineTrip: numOrNull(row.singleLineTrip),
    note: row.note,
    sortOrder: row.sortOrder,
  }));
}

/**
 * Scores one quotation or an ad-hoc set of lines.
 *
 * Pure arithmetic over the ceilings it is handed — no database access — so the admin
 * risk sandbox can preview unsaved config by passing overrides, and the same function
 * still serves the real routing path.
 */
export function scoreLines(input: RiskInput, ceilings: Ceilings, chain: ChainRule[]): RiskResult {
  const tierCeiling = input.tierCeiling ?? ceilings.tier[input.tier] ?? 0;
  const orderDiscountPct = input.orderDiscountPct;

  let totalValue = 0;
  let weightedOverage = 0;
  let worstSingleOverage = 0;
  let violationCount = 0;

  const rows = input.lines.map((line) => {
    const categoryCeiling =
      input.categoryCeilings?.[line.category] ?? ceilings.category[line.category] ?? 0;

    // The stricter of the two binds. This is the whole rule.
    const ceilingPct = Math.min(categoryCeiling, tierCeiling);

    // An order-level discount compounds on top of the line discount rather than
    // adding to it: 8% off, then 10% off the remainder, is 17.2% off list — not 18%.
    const effectivePct = line.discountPct + orderDiscountPct * (1 - line.discountPct / 100);
    const overBy = Math.max(0, effectivePct - ceilingPct);

    // Gross value, before any discount — see the note above on weighting.
    const value = line.qty * line.unitPrice;

    totalValue += value;
    weightedOverage += value * overBy;
    if (overBy > worstSingleOverage) worstSingleOverage = overBy;
    if (overBy > 0) violationCount += 1;

    return {
      lineId: line.id,
      productName: line.productName,
      category: line.category,
      value: round2(value),
      givenPct: round2(effectivePct),
      lineDiscountPct: round2(line.discountPct),
      ceilingPct: round2(ceilingPct),
      categoryCeilingPct: round2(categoryCeiling),
      tierCeilingPct: round2(tierCeiling),
      overBy: round2(overBy),
      isViolation: overBy > 0,
      // Filled once totalValue is known — a line's share of the final score.
      contribution: 0,
      rawValue: value,
      rawOverBy: overBy,
    };
  });

  const score = totalValue > 0 ? weightedOverage / totalValue : 0;

  const lineBreakdown: RiskLineBreakdown[] = rows.map((row) => ({
    lineId: row.lineId,
    productName: row.productName,
    category: row.category,
    value: row.value,
    givenPct: row.givenPct,
    lineDiscountPct: row.lineDiscountPct,
    ceilingPct: row.ceilingPct,
    categoryCeilingPct: row.categoryCeilingPct,
    tierCeilingPct: row.tierCeilingPct,
    overBy: row.overBy,
    isViolation: row.isViolation,
    contribution: totalValue > 0 ? round2((row.rawValue * row.rawOverBy) / totalValue) : 0,
  }));

  const rounded = round2(score);
  const worst = round2(worstSingleOverage);
  const matched = resolveRule(rounded, worst, chain);

  return {
    quotationId: input.quotationId,
    score: rounded,
    worstSingleOverage: worst,
    violationCount,
    totalValue: round2(totalValue),
    weightedOverage: round2(weightedOverage),
    lineBreakdown,
    approvers: matched.approvers,
    ruleId: matched.id,
    label: labelFor(matched.approvers),
  };
}

/**
 * Picks the approval rule.
 *
 * Two independent triggers. A rule matches on the blended score when
 * `score > minScore && score <= (maxScore ?? Infinity)`, and it ALSO matches when any
 * single line is more than `singleLineTrip` points over its own ceiling — that is what
 * escalates one badly-over line inside an otherwise clean order.
 *
 * When several rules match, the one demanding MORE approvers wins. Routing must never
 * step down: a quotation that qualifies for Finance on the single-line trip does not
 * get to take the Manager-only path because its blended score is mild.
 */
function resolveRule(
  score: number,
  worstSingleOverage: number,
  chain: ChainRule[],
): { id: string | null; approvers: Role[] } {
  if (chain.length === 0) {
    throw ApiError.conflict(
      'CHAIN_NOT_CONFIGURED',
      'No approval rules are configured, so this quotation cannot be routed. An admin must define the approval chain first.',
    );
  }

  const matches = chain.filter((rule) => {
    const inScoreBand =
      score > rule.minScore && score <= (rule.maxScore ?? Number.POSITIVE_INFINITY);
    const trips = rule.singleLineTrip !== null && worstSingleOverage > rule.singleLineTrip;
    return inScoreBand || trips;
  });

  const pool = matches.length > 0 ? matches : chain;

  let winner = pool[0] as ChainRule;
  for (const rule of pool) {
    if (rule.approvers.length > winner.approvers.length) winner = rule;
  }

  return { id: winner.id, approvers: winner.approvers };
}

const ROLE_LABEL: Record<Role, string> = {
  sales_rep: 'Rep',
  sales_manager: 'Manager',
  finance: 'Finance',
  admin: 'Admin',
};

/** `"Auto-approve"` / `"Manager approval"` / `"Manager + Finance"`. */
export function labelFor(approvers: Role[]): string {
  if (approvers.length === 0) return 'Auto-approve';
  if (approvers.length === 1) return `${ROLE_LABEL[approvers[0] as Role]} approval`;
  return approvers.map((role) => ROLE_LABEL[role]).join(' + ');
}

/** Convenience wrapper: loads config, then scores. Used by every non-sandbox caller. */
export async function scoreWithStoredConfig(input: RiskInput): Promise<RiskResult> {
  const [ceilings, chain] = await Promise.all([loadCeilings(), loadChain()]);
  return scoreLines(input, ceilings, chain);
}

/** The binding ceiling for one line — exported for the audit entry on a discount change. */
export function bindingCeiling(category: Category, tier: Tier, ceilings: Ceilings): number {
  return Math.min(ceilings.category[category] ?? 0, ceilings.tier[tier] ?? 0);
}

// ---------------------------------------------------------------------------
// Blended score — lightweight weighted-average formula
// ---------------------------------------------------------------------------

export type BlendedScoreLine = {
  lineId: string;
  category: Category;
  discountPct: number;
  lineTotal: number;
};

export type BlendedScoreInput = {
  customerTier: Tier;
  lines: BlendedScoreLine[];
};

export type BlendedScoreResult = {
  blended_score: number;
  flagged_lines: { line_id: string; effective_ceiling: number; overage: number }[];
  requires_approval: boolean;
  /** Approvers resolved purely from score-band matching against the DB approval chain. */
  approval_level: Role[];
};

/**
 * effective_ceiling = min(tier_ceiling, category_ceiling)
 * overage           = max(0, discount_pct - effective_ceiling)
 * blended_score     = SUM(overage * line_total) / SUM(line_total)
 *
 * approval_level is resolved by matching blended_score against the chain's
 * minScore/maxScore bands ONLY — singleLineTrip is intentionally ignored here.
 * If no band covers the score, approval_level is empty.
 */
export function computeBlendedScore(
  input: BlendedScoreInput,
  ceilings: Ceilings,
  chain: ChainRule[],
): BlendedScoreResult {
  const subtotal = input.lines.reduce((s, l) => s + l.lineTotal, 0) || 1;
  const tierCeiling = ceilings.tier[input.customerTier] ?? 0;

  let weightedOverage = 0;
  const flaggedLines: BlendedScoreResult['flagged_lines'] = [];

  for (const line of input.lines) {
    const categoryCeiling = ceilings.category[line.category] ?? 0;
    const effectiveCeiling = Math.min(tierCeiling, categoryCeiling);
    const overage = Math.max(0, line.discountPct - effectiveCeiling);

    if (overage > 0) {
      weightedOverage += overage * (line.lineTotal / subtotal);
      flaggedLines.push({
        line_id: line.lineId,
        effective_ceiling: effectiveCeiling,
        overage: round2(overage),
      });
    }
  }

  const blendedScore = round2(weightedOverage);

  if (blendedScore === 0) {
    return {
      blended_score: 0,
      flagged_lines: [],
      requires_approval: false,
      approval_level: [],
    };
  }

  // Match blended_score against score bands only — no singleLineTrip.
  const matched = chain.find(
    (rule) =>
      blendedScore > rule.minScore &&
      blendedScore <= (rule.maxScore ?? Number.POSITIVE_INFINITY),
  );

  return {
    blended_score: blendedScore,
    flagged_lines: flaggedLines,
    requires_approval: true,
    approval_level: matched ? matched.approvers : [],
  };
}
