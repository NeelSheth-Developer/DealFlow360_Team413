import { asc, eq, sql } from 'drizzle-orm';
import { db } from '../../db/index.js';
import {
  approvalRules,
  categoryConfig,
  dashboardConfig,
  tierConfig,
  type Category,
  type Tier,
} from '../../db/schema.js';
import { audit, type AuditActor } from '../../lib/audit.js';
import { num, numOrNull, pct } from '../../lib/money.js';
import { ApiError } from '../../utils/api-error.js';
import type {
  ApprovalRuleInput,
  CategoryCeilingsInput,
  DashboardConfigInput,
  PatchCategoryCeilingsInput,
  PatchTierCeilingsInput,
  TierCeilingsInput,
} from './config.schemas.js';

/**
 * Governance configuration: the two ceiling tables and the approval chain.
 *
 * Together these decide what the blended risk score flags and who has to sign it off,
 * which makes them the most consequential rows in the database. Every write is audited
 * with the before and after values.
 */

/** Everything the discount-governance screen needs, in one round trip. */
export async function getDiscountConfig() {
  const [tiers, categories, chain] = await Promise.all([
    db.select().from(tierConfig),
    db.select().from(categoryConfig),
    db.select().from(approvalRules).orderBy(asc(approvalRules.sortOrder)),
  ]);

  const tierCeilings = {} as Record<Tier, number>;
  for (const row of tiers) tierCeilings[row.tier] = num(row.maxDiscountPct);

  const categoryCeilings = {} as Record<Category, number>;
  for (const row of categories) categoryCeilings[row.category] = num(row.maxDiscountPct);

  return {
    tierCeilings,
    categoryCeilings,
    approvalChain: chain.map(presentRule),
    warnings: chainWarnings(chain.map(presentRule)),
  };
}

export async function setTierCeilings(actor: AuditActor, input: TierCeilingsInput) {
  const before = await db.select().from(tierConfig);
  const previous = Object.fromEntries(before.map((row) => [row.tier, num(row.maxDiscountPct)]));

  for (const [tier, value] of Object.entries(input)) {
    await db
      .update(tierConfig)
      .set({ maxDiscountPct: pct(value), updatedAt: new Date() })
      .where(eq(tierConfig.tier, tier as Tier));
  }

  await audit({
    entityType: 'config',
    action: 'Tier discount ceilings updated',
    actor,
    meta: { from: previous, to: input },
  });

  return getDiscountConfig();
}

export async function patchTierCeilings(actor: AuditActor, input: PatchTierCeilingsInput) {
  const before = await db.select().from(tierConfig);
  const previous = Object.fromEntries(before.map((row) => [row.tier, num(row.maxDiscountPct)]));

  for (const [tier, value] of Object.entries(input)) {
    await db
      .update(tierConfig)
      .set({ maxDiscountPct: pct(value as number), updatedAt: new Date() })
      .where(eq(tierConfig.tier, tier as Tier));
  }

  await audit({
    entityType: 'config',
    action: 'Tier discount ceilings patched',
    actor,
    meta: { from: previous, to: input },
  });

  const updated = await db.select().from(tierConfig);
  const tierCeilings = {} as Record<Tier, number>;
  for (const row of updated) tierCeilings[row.tier] = num(row.maxDiscountPct);
  return { tierCeilings };
}

export async function setCategoryCeilings(actor: AuditActor, input: CategoryCeilingsInput) {
  const before = await db.select().from(categoryConfig);
  const previous = Object.fromEntries(before.map((row) => [row.category, num(row.maxDiscountPct)]));

  for (const [category, value] of Object.entries(input)) {
    await db
      .update(categoryConfig)
      .set({ maxDiscountPct: pct(value), updatedAt: new Date() })
      .where(eq(categoryConfig.category, category as Category));
  }

  await audit({
    entityType: 'config',
    action: 'Category discount ceilings updated',
    actor,
    meta: { from: previous, to: input },
  });

  return getDiscountConfig();
}

export async function patchCategoryCeilings(actor: AuditActor, input: PatchCategoryCeilingsInput) {
  const before = await db.select().from(categoryConfig);
  const previous = Object.fromEntries(before.map((row) => [row.category, num(row.maxDiscountPct)]));

  for (const [category, value] of Object.entries(input)) {
    await db
      .update(categoryConfig)
      .set({ maxDiscountPct: pct(value as number), updatedAt: new Date() })
      .where(eq(categoryConfig.category, category as Category));
  }

  await audit({
    entityType: 'config',
    action: 'Category discount ceilings patched',
    actor,
    meta: { from: previous, to: input },
  });

  const updated = await db.select().from(categoryConfig);
  const categoryCeilings = {} as Record<Category, number>;
  for (const row of updated) categoryCeilings[row.category] = num(row.maxDiscountPct);
  return { categoryCeilings };
}

export async function listChain() {
  const rows = await db.select().from(approvalRules).orderBy(asc(approvalRules.sortOrder));
  const chain = rows.map(presentRule);
  return { approvalChain: chain, warnings: chainWarnings(chain) };
}

export async function addRule(actor: AuditActor, input: ApprovalRuleInput) {
  const [top] = await db
    .select({ max: sql<number>`COALESCE(MAX(${approvalRules.sortOrder}), -1)` })
    .from(approvalRules);

  await db.insert(approvalRules).values({
    minScore: pct(input.minScore),
    maxScore: input.maxScore === null ? null : pct(input.maxScore),
    approvers: input.approvers,
    singleLineTrip: input.singleLineTrip === null ? null : pct(input.singleLineTrip),
    note: input.note,
    sortOrder: Number(top?.max ?? -1) + 1,
  });

  await audit({ entityType: 'config', action: 'Approval rule added', actor, meta: { ...input } });
  return listChain();
}

export async function updateRule(actor: AuditActor, id: string, input: ApprovalRuleInput) {
  const [existing] = await db.select().from(approvalRules).where(eq(approvalRules.id, id));
  if (!existing) throw ApiError.notFound('Approval rule not found');

  await db
    .update(approvalRules)
    .set({
      minScore: pct(input.minScore),
      maxScore: input.maxScore === null ? null : pct(input.maxScore),
      approvers: input.approvers,
      singleLineTrip: input.singleLineTrip === null ? null : pct(input.singleLineTrip),
      note: input.note,
    })
    .where(eq(approvalRules.id, id));

  await audit({
    entityType: 'config',
    action: 'Approval rule updated',
    actor,
    meta: { id, from: presentRule(existing), to: input },
  });

  return listChain();
}

/**
 * Removing the last rule would leave routing undefined, and the risk engine fails
 * closed on an empty chain — every quotation would then be unroutable rather than
 * auto-approved. Blocking the delete gives a better error than that.
 */
export async function deleteRule(actor: AuditActor, id: string) {
  const [existing] = await db.select().from(approvalRules).where(eq(approvalRules.id, id));
  if (!existing) throw ApiError.notFound('Approval rule not found');

  const rows = await db.select({ id: approvalRules.id }).from(approvalRules);
  if (rows.length <= 1) {
    throw ApiError.conflict(
      'CHAIN_NOT_CONFIGURED',
      'This is the only approval rule. Removing it would leave every quotation unroutable — add a replacement first.',
    );
  }

  await db.delete(approvalRules).where(eq(approvalRules.id, id));
  await audit({
    entityType: 'config',
    action: 'Approval rule removed',
    actor,
    meta: { id, removed: presentRule(existing) },
  });

  return listChain();
}

export async function reorderChain(actor: AuditActor, ids: string[]) {
  const rows = await db.select({ id: approvalRules.id }).from(approvalRules);
  const known = new Set(rows.map((row) => row.id));

  const unknown = ids.filter((id) => !known.has(id));
  if (unknown.length > 0) {
    throw ApiError.badRequest('VALIDATION_FAILED', 'Unknown approval rule id in the order', {
      unknown,
    });
  }
  if (ids.length !== rows.length) {
    throw ApiError.badRequest(
      'VALIDATION_FAILED',
      `The order must list every rule — expected ${rows.length}, received ${ids.length}`,
    );
  }

  for (const [index, id] of ids.entries()) {
    await db.update(approvalRules).set({ sortOrder: index }).where(eq(approvalRules.id, id));
  }

  await audit({ entityType: 'config', action: 'Approval chain reordered', actor, meta: { ids } });
  return listChain();
}

export async function getDashboardConfig() {
  const [row] = await db.select().from(dashboardConfig).where(eq(dashboardConfig.id, 1));
  // The row is seeded by migration; the fallback keeps the dashboard working rather
  // than 500-ing if someone deletes it.
  return {
    stallThresholdDays: row?.stallThresholdDays ?? 5,
    anomalySensitivity: num(row?.anomalySensitivity ?? '1.80'),
    approvalSlaHours: row?.approvalSlaHours ?? 24,
  };
}

export async function setDashboardConfig(actor: AuditActor, input: DashboardConfigInput) {
  const before = await getDashboardConfig();

  await db
    .insert(dashboardConfig)
    .values({
      id: 1,
      stallThresholdDays: input.stallThresholdDays,
      anomalySensitivity: input.anomalySensitivity.toFixed(2),
      approvalSlaHours: input.approvalSlaHours,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: dashboardConfig.id,
      set: {
        stallThresholdDays: input.stallThresholdDays,
        anomalySensitivity: input.anomalySensitivity.toFixed(2),
        approvalSlaHours: input.approvalSlaHours,
        updatedAt: new Date(),
      },
    });

  await audit({
    entityType: 'config',
    action: 'Dashboard thresholds updated',
    actor,
    meta: { from: before, to: input },
  });

  return getDashboardConfig();
}

function presentRule(row: {
  id: string;
  minScore: string;
  maxScore: string | null;
  approvers: string[];
  singleLineTrip: string | null;
  note: string | null;
  sortOrder: number;
}) {
  return {
    id: row.id,
    minScore: num(row.minScore),
    maxScore: numOrNull(row.maxScore),
    approvers: row.approvers,
    singleLineTrip: numOrNull(row.singleLineTrip),
    note: row.note,
    sortOrder: row.sortOrder,
  };
}

/**
 * Coverage problems are reported as advice, not rejected.
 *
 * A chain is often edited one rule at a time, and a mid-edit gap is normal — refusing
 * the save would force an admin to construct a valid chain in a single request. The
 * risk engine fails closed on a gap anyway (it escalates rather than auto-approves),
 * so a warning is the honest severity.
 */
function chainWarnings(chain: ReturnType<typeof presentRule>[]): string[] {
  if (chain.length === 0) return ['No approval rules configured — quotations cannot be routed.'];

  const warnings: string[] = [];
  const bands = [...chain].sort((a, b) => a.minScore - b.minScore);

  for (let i = 0; i < bands.length - 1; i += 1) {
    const current = bands[i];
    const next = bands[i + 1];
    if (!current || !next) continue;

    if (current.maxScore === null) {
      warnings.push(
        `The rule starting at ${current.minScore} is unbounded, so no rule after it can ever match.`,
      );
      continue;
    }
    if (current.maxScore < next.minScore) {
      warnings.push(`Gap in coverage between ${current.maxScore} and ${next.minScore}.`);
    }
    if (current.maxScore > next.minScore) {
      warnings.push(`Overlap between ${next.minScore} and ${current.maxScore}.`);
    }
  }

  const last = bands[bands.length - 1];
  if (last && last.maxScore !== null) {
    warnings.push(
      `Nothing covers a score above ${last.maxScore} — those quotations will escalate to the strictest rule.`,
    );
  }

  return warnings;
}
