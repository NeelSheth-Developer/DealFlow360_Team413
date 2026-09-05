import { and, eq, gte, inArray, lte, sql, type SQL } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { products, quotationLines, quotations, teams, users } from '../../db/schema.js';
import { num, round2 } from '../../lib/money.js';
import { orderTotals, type LineForTotals } from '../../lib/totals.js';
import type { ReportQuery } from './reports.schemas.js';

/**
 * Reporting.
 *
 * Every figure and every chart series respects the same filter set, including the
 * exports the frontend generates from this payload — a PDF whose numbers disagree with
 * the screen it was exported from is worse than no export.
 *
 * Team reporting is the rollup above rep reporting. It is what catches a whole
 * territory discounting hard: an individual rep compared against their own history
 * looks normal, and only the group view shows the pattern.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** Reps with no team land in a single named bucket rather than being dropped. */
const UNASSIGNED = 'Unassigned';

type LoadedLine = LineForTotals & {
  quotationId: string;
  productId: string;
  productName: string;
};

async function loadScope(query: ReportQuery) {
  const filters: SQL[] = [];

  if (query.from) filters.push(gte(quotations.createdAt, new Date(`${query.from}T00:00:00Z`)));
  if (query.to) filters.push(lte(quotations.createdAt, new Date(`${query.to}T23:59:59Z`)));
  if (query.repIds && query.repIds.length > 0) {
    filters.push(inArray(quotations.ownerId, query.repIds));
  }
  if (query.teamIds && query.teamIds.length > 0) {
    filters.push(inArray(users.teamId, query.teamIds));
  }
  if (query.stages && query.stages.length > 0) {
    filters.push(inArray(quotations.stage, query.stages));
  }

  const rows = await db
    .select({
      id: quotations.id,
      reference: quotations.reference,
      stage: quotations.stage,
      ownerId: quotations.ownerId,
      ownerName: users.name,
      teamId: users.teamId,
      teamName: teams.name,
      orderDiscountPct: quotations.orderDiscountPct,
      createdAt: quotations.createdAt,
      updatedAt: quotations.updatedAt,
    })
    .from(quotations)
    .innerJoin(users, eq(users.id, quotations.ownerId))
    .leftJoin(teams, eq(teams.id, users.teamId))
    .where(filters.length > 0 ? and(...filters) : undefined);

  if (rows.length === 0) return { quotations: rows, linesByQuotation: new Map<string, LoadedLine[]>() };

  const lineFilters: SQL[] = [
    inArray(
      quotationLines.quotationId,
      rows.map((row) => row.id),
    ),
  ];
  // Category filters the LINES, not the quotations — a mixed order still contributes
  // its hardware lines to a hardware report.
  if (query.category) lineFilters.push(eq(quotationLines.category, query.category));

  const lines = await db
    .select()
    .from(quotationLines)
    .where(and(...lineFilters));

  const byQuotation = new Map<string, LoadedLine[]>();
  for (const line of lines) {
    const list = byQuotation.get(line.quotationId) ?? [];
    list.push({
      quotationId: line.quotationId,
      productId: line.productId,
      productName: line.productName,
      qty: line.qty,
      unitPrice: num(line.unitPrice),
      costPrice: num(line.costPrice),
      discountPct: num(line.discountPct),
      taxPct: num(line.taxPct),
      category: line.category,
      isSubscription: line.isSubscription,
    });
    byQuotation.set(line.quotationId, list);
  }

  return { quotations: rows, linesByQuotation: byQuotation };
}

export async function summary(query: ReportQuery) {
  const { quotations: rows, linesByQuotation } = await loadScope(query);

  const enriched = rows.map((row) => {
    const lines = linesByQuotation.get(row.id) ?? [];
    const totals = orderTotals(lines, num(row.orderDiscountPct));
    return { ...row, lines, totals };
  });

  // A quotation whose lines were all filtered out by `category` contributes nothing.
  const scoped = query.category ? enriched.filter((row) => row.lines.length > 0) : enriched;

  const totalValue = round2(scoped.reduce((sum, row) => sum + row.totals.subtotal, 0));
  const wonStages = ['confirmed', 'billed'];
  const won = scoped.filter((row) => wonStages.includes(row.stage)).length;
  const lost = scoped.filter((row) => row.stage === 'lost').length;
  const decided = won + lost;

  const withDiscount = scoped.filter((row) => row.totals.subtotal > 0);
  const avgDiscountPct =
    withDiscount.length > 0
      ? round2(
          withDiscount.reduce((sum, row) => sum + row.totals.effectiveDiscountPct, 0) /
            withDiscount.length,
        )
      : 0;

  const withMargin = scoped.filter((row) => row.totals.marginPct !== 0);
  const avgMarginPct =
    withMargin.length > 0
      ? round2(withMargin.reduce((sum, row) => sum + row.totals.marginPct, 0) / withMargin.length)
      : 0;

  const closed = scoped.filter((row) => [...wonStages, 'lost'].includes(row.stage));
  const avgCycleDays =
    closed.length > 0
      ? round2(
          closed.reduce(
            (sum, row) => sum + (row.updatedAt.getTime() - row.createdAt.getTime()) / DAY_MS,
            0,
          ) / closed.length,
        )
      : 0;

  // --- by rep --------------------------------------------------------------
  const repMap = new Map<string, { name: string; count: number; value: number; discount: number }>();
  for (const row of scoped) {
    const entry = repMap.get(row.ownerId) ?? {
      name: row.ownerName,
      count: 0,
      value: 0,
      discount: 0,
    };
    entry.count += 1;
    entry.value += row.totals.subtotal;
    entry.discount += row.totals.effectiveDiscountPct;
    repMap.set(row.ownerId, entry);
  }

  // --- by team -------------------------------------------------------------
  const teamMap = new Map<
    string,
    { team: string; reps: Set<string>; count: number; value: number; discount: number }
  >();
  for (const row of scoped) {
    const key = row.teamId ?? UNASSIGNED;
    const entry = teamMap.get(key) ?? {
      team: row.teamName ?? UNASSIGNED,
      reps: new Set<string>(),
      count: 0,
      value: 0,
      discount: 0,
    };
    entry.reps.add(row.ownerId);
    entry.count += 1;
    entry.value += row.totals.subtotal;
    entry.discount += row.totals.effectiveDiscountPct;
    teamMap.set(key, entry);
  }

  // --- discount buckets ----------------------------------------------------
  const buckets = [
    { name: '0–5%', min: 0, max: 5, count: 0 },
    { name: '5–10%', min: 5, max: 10, count: 0 },
    { name: '10–15%', min: 10, max: 15, count: 0 },
    { name: '15–20%', min: 15, max: 20, count: 0 },
    { name: '20%+', min: 20, max: Number.POSITIVE_INFINITY, count: 0 },
  ];
  for (const row of scoped) {
    const discount = row.totals.effectiveDiscountPct;
    const bucket = buckets.find((b) => discount >= b.min && discount < b.max);
    if (bucket) bucket.count += 1;
  }

  // --- funnel --------------------------------------------------------------
  const funnelMap = new Map<string, number>();
  for (const row of scoped) funnelMap.set(row.stage, (funnelMap.get(row.stage) ?? 0) + 1);

  // --- revenue mix ---------------------------------------------------------
  const mix = new Map<string, { oneTime: number; recurring: number }>();
  for (const row of scoped) {
    const month = row.createdAt.toISOString().slice(0, 7);
    const entry = mix.get(month) ?? { oneTime: 0, recurring: 0 };
    entry.oneTime += row.totals.oneTimeTotal;
    entry.recurring += row.totals.recurringTotal;
    mix.set(month, entry);
  }

  return {
    kpis: {
      totalQuotations: scoped.length,
      totalValue,
      winRate: decided > 0 ? round2((won / decided) * 100) : 0,
      avgDiscountPct,
      avgMarginPct,
      avgCycleDays,
    },
    valueByRep: [...repMap.entries()]
      .map(([repId, entry]) => ({
        repId,
        name: entry.name,
        count: entry.count,
        value: round2(entry.value),
        avgDiscountPct: round2(entry.discount / entry.count),
      }))
      .sort((a, b) => b.value - a.value),
    /**
     * The rollup the brief asks for. Reps with no team appear under "Unassigned" so
     * the team rows always sum back to `kpis.totalValue` — a report whose parts do not
     * reconcile to its header is worse than no report.
     */
    valueByTeam: [...teamMap.entries()]
      .map(([teamId, entry]) => ({
        teamId: teamId === UNASSIGNED ? null : teamId,
        team: entry.team,
        repCount: entry.reps.size,
        count: entry.count,
        value: round2(entry.value),
        avgDiscountPct: round2(entry.discount / entry.count),
      }))
      .sort((a, b) => b.value - a.value),
    discountBuckets: buckets.map((bucket) => ({ name: bucket.name, count: bucket.count })),
    funnel: [
      'draft',
      'sent',
      'under_negotiation',
      'pending_approval',
      'approved',
      'fulfillment',
      'billed',
      'confirmed',
      'lost',
    ].map((stage) => ({ stage, count: funnelMap.get(stage) ?? 0 })),
    revenueMix: [...mix.entries()]
      .map(([month, entry]) => ({
        month,
        oneTime: round2(entry.oneTime),
        recurring: round2(entry.recurring),
      }))
      .sort((a, b) => a.month.localeCompare(b.month)),
  };
}

export async function productPerformance(query: ReportQuery) {
  const { linesByQuotation, quotations: rows } = await loadScope(query);
  const discountByQuotation = new Map(rows.map((row) => [row.id, num(row.orderDiscountPct)]));

  const byProduct = new Map<
    string,
    { name: string; category: string; qty: number; value: number; discount: number; lines: number }
  >();

  for (const [quotationId, lines] of linesByQuotation) {
    const orderDiscount = discountByQuotation.get(quotationId) ?? 0;
    for (const line of lines) {
      const entry = byProduct.get(line.productId) ?? {
        name: line.productName,
        category: line.category,
        qty: 0,
        value: 0,
        discount: 0,
        lines: 0,
      };
      const gross = line.qty * line.unitPrice;
      const effective = line.discountPct + orderDiscount * (1 - line.discountPct / 100);

      entry.qty += line.qty;
      entry.value += gross;
      entry.discount += effective;
      entry.lines += 1;
      byProduct.set(line.productId, entry);
    }
  }

  const ids = [...byProduct.keys()];
  const costs = new Map<string, number>();
  if (ids.length > 0) {
    const productRows = await db
      .select({ id: products.id, costPrice: products.costPrice })
      .from(products)
      .where(inArray(products.id, ids));
    for (const row of productRows) costs.set(row.id, num(row.costPrice));
  }

  return [...byProduct.entries()]
    .map(([productId, entry]) => ({
      productId,
      productName: entry.name,
      category: entry.category,
      qty: entry.qty,
      value: round2(entry.value),
      avgDiscountPct: round2(entry.discount / entry.lines),
      estimatedCost: round2((costs.get(productId) ?? 0) * entry.qty),
    }))
    .sort((a, b) => b.value - a.value);
}

/** The team list, for the report filter dropdown. */
export async function listTeams() {
  const rows = await db
    .select({
      id: teams.id,
      name: teams.name,
      active: teams.active,
      memberCount: sql<number>`(SELECT COUNT(*)::int FROM ${users} WHERE ${users.teamId} = ${teams.id} AND ${users.active} = true)`,
    })
    .from(teams)
    .orderBy(teams.name);

  return rows;
}
