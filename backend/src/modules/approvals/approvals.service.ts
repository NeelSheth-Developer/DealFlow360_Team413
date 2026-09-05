import { and, asc, eq, inArray } from 'drizzle-orm';
import { db } from '../../db/index.js';
import {
  approvalSteps,
  customers,
  quotations,
  users,
  type Role,
} from '../../db/schema.js';
import { audit, SYSTEM_ACTOR, type AuditActor } from '../../lib/audit.js';
import {
  emailApprovalApproved,
  emailApprovalRejected,
  emailApprovalRequested,
  emailApprovalReturned,
} from '../../lib/emails.js';
import { notify, usersWithRole } from '../../lib/notify.js';
import { labelFor, scoreWithStoredConfig, type RiskResult } from '../../lib/risk.js';
import { ApiError } from '../../utils/api-error.js';
import {
  loadQuotation,
  presentQuotation,
  type LoadedQuotation,
} from '../quotations/quotations.repo.js';

/**
 * The approval workflow.
 *
 * Four invariants hold here, and each exists because breaking it is how discount
 * governance gets quietly defeated:
 *
 *   1. A rep never chooses the route. `submitForApproval` re-scores from live line
 *      data and resolves the chain from stored config — the submitter has no input.
 *   2. Steps are strictly ordered. Only the first step still `pending` is actionable,
 *      so Finance cannot sign off before the Sales Manager has.
 *   3. A return clears the chain entirely. A resubmission re-scores from scratch, so a
 *      worse quotation cannot ride an approval that was given for a better one.
 *   4. Scores are never cached across a submission. The number that routes a quotation
 *      is computed at the moment of routing, from the lines as they stand.
 */

/** Re-scores a loaded quotation from its current lines. */
export async function scoreQuotation(loaded: LoadedQuotation): Promise<RiskResult> {
  return scoreWithStoredConfig({
    quotationId: loaded.id,
    tier: loaded.tier,
    orderDiscountPct: loaded.orderDiscountPct,
    lines: loaded.lines.map((line) => ({
      id: line.id,
      productName: line.productName,
      category: line.category,
      qty: line.qty,
      unitPrice: line.unitPrice,
      discountPct: line.discountPct,
    })),
  });
}

/**
 * Routes a quotation, or approves it outright when every line sits inside its ceiling.
 *
 * Called both by the rep pressing "submit" and by a customer confirming negotiated
 * terms in the portal — same code, same guarantees, which is what makes the automatic
 * re-approval path trustworthy.
 */
export async function submitForApproval(actor: AuditActor, id: string) {
  const loaded = await loadQuotation(id);

  if (loaded.lines.length === 0) {
    throw ApiError.conflict('EMPTY_QUOTATION', 'Add at least one line before submitting for approval');
  }

  const submittable: string[] = ['draft', 'sent', 'under_negotiation'];
  if (!submittable.includes(loaded.stage)) {
    throw ApiError.conflict(
      'STAGE_LOCKED',
      `This quotation is ${loaded.stage.replace(/_/g, ' ')} and cannot be submitted for approval from here.`,
    );
  }

  const risk = await scoreQuotation(loaded);

  // Cleared unconditionally, not merged. A resubmission starts a fresh chain — see
  // invariant 3 at the top of this file.
  await db.delete(approvalSteps).where(eq(approvalSteps.quotationId, id));

  if (risk.approvers.length === 0) {
    await db
      .update(quotations)
      .set({ stage: 'approved', lastActivityAt: new Date(), updatedAt: new Date() })
      .where(eq(quotations.id, id));

    await audit({
      entityType: 'quotation',
      entityId: id,
      entityRef: loaded.reference,
      action: 'Auto-approved — every line within its ceiling',
      // The server made this call, not the submitter.
      actor: SYSTEM_ACTOR,
      meta: { score: risk.score, submittedBy: actor.name, ruleId: risk.ruleId },
    });

    await notify({
      userIds: [loaded.ownerId],
      type: 'approval_result',
      title: `${loaded.reference} was auto-approved`,
      body: `${loaded.customerName} — every line is within its discount ceiling`,
      entityType: 'quotation',
      entityId: id,
      entityRef: loaded.reference,
      view: 'builder',
    });

    return {
      quotation: presentQuotation(await loadQuotation(id)),
      autoApproved: true,
      risk,
      approvers: [] as Role[],
      label: risk.label,
    };
  }

  await db.insert(approvalSteps).values(
    risk.approvers.map((role, index) => ({
      quotationId: id,
      role,
      stepOrder: index,
      status: 'pending' as const,
    })),
  );

  await db
    .update(quotations)
    .set({ stage: 'pending_approval', lastActivityAt: new Date(), updatedAt: new Date() })
    .where(eq(quotations.id, id));

  await audit({
    entityType: 'quotation',
    entityId: id,
    entityRef: loaded.reference,
    action: `Submitted for approval — ${risk.label}`,
    actor,
    meta: {
      score: risk.score,
      worstSingleOverage: risk.worstSingleOverage,
      violationCount: risk.violationCount,
      approvers: risk.approvers,
      ruleId: risk.ruleId,
    },
  });

  await notifyStep(loaded, risk, risk.approvers[0]);

  return {
    quotation: presentQuotation(await loadQuotation(id)),
    autoApproved: false,
    risk,
    approvers: risk.approvers,
    label: risk.label,
  };
}

/** Tells the holders of the current step's role that something is waiting on them. */
async function notifyStep(loaded: LoadedQuotation, risk: RiskResult, role: Role | undefined) {
  if (!role) return;

  const approverIds = await usersWithRole(role);
  if (approverIds.length === 0) return;

  await notify({
    userIds: approverIds,
    type: 'approval_request',
    title: `${loaded.reference} needs your approval`,
    body: `${loaded.customerName} · blended risk ${risk.score.toFixed(2)} pts · ${risk.violationCount} line(s) over ceiling`,
    entityType: 'quotation',
    entityId: loaded.id,
    entityRef: loaded.reference,
    view: 'approval',
  });

  const rows = await db
    .select({ email: users.email })
    .from(users)
    .where(inArray(users.id, approverIds));

  await emailApprovalRequested({
    recipients: rows.map((row) => row.email),
    reference: loaded.reference,
    customerName: loaded.customerName,
    ownerName: loaded.ownerName,
    currency: loaded.currency,
    grandTotal: loaded.totals.grandTotal,
    score: risk.score,
    worstSingleOverage: risk.worstSingleOverage,
    violationCount: risk.violationCount,
    label: risk.label,
  });
}

/**
 * The step this caller is allowed to act on.
 *
 * `admin` may unblock any step so a deployment with one operator is never deadlocked.
 * That is a deliberate escape hatch, and it is audited as one — the entry records that
 * an admin acted in another role's place.
 */
async function currentStepFor(actor: AuditActor, loaded: LoadedQuotation) {
  if (loaded.stage !== 'pending_approval') {
    throw ApiError.conflict(
      'NOT_PENDING',
      `This quotation is ${loaded.stage.replace(/_/g, ' ')} — there is nothing awaiting approval.`,
    );
  }

  const step = loaded.approvalSteps.find((candidate) => candidate.status === 'pending');
  if (!step) {
    throw ApiError.conflict('NOT_PENDING', 'Every approval step on this quotation is already resolved.');
  }

  const isAdminOverride = actor.role === 'admin' && step.role !== 'admin';
  if (actor.role !== step.role && !isAdminOverride) {
    throw ApiError.forbidden(
      'WRONG_APPROVER',
      `This step is waiting on ${step.role.replace(/_/g, ' ')} — your role cannot action it.`,
    );
  }

  return { step, isAdminOverride };
}

export async function approveStep(actor: AuditActor, id: string, comment: string | null) {
  const loaded = await loadQuotation(id);
  const { step, isAdminOverride } = await currentStepFor(actor, loaded);

  await db
    .update(approvalSteps)
    .set({
      status: 'approved',
      reviewerId: actor.id,
      reviewerName: actor.name,
      reason: comment,
      actedAt: new Date(),
    })
    .where(eq(approvalSteps.id, step.id));

  const remaining = loaded.approvalSteps.filter(
    (candidate) => candidate.status === 'pending' && candidate.id !== step.id,
  );

  const complete = remaining.length === 0;
  const nextRole = remaining[0]?.role ?? null;

  if (complete) {
    await db
      .update(quotations)
      .set({ stage: 'approved', lastActivityAt: new Date(), updatedAt: new Date() })
      .where(eq(quotations.id, id));
  } else {
    await db
      .update(quotations)
      .set({ lastActivityAt: new Date(), updatedAt: new Date() })
      .where(eq(quotations.id, id));
  }

  await audit({
    entityType: 'quotation',
    entityId: id,
    entityRef: loaded.reference,
    action: `Approved by ${roleLabel(step.role)}${isAdminOverride ? ' (admin override)' : ''}`,
    actor,
    reason: comment,
    meta: {
      step: step.stepOrder + 1,
      of: loaded.approvalSteps.length,
      adminOverride: isAdminOverride,
      complete,
    },
  });

  if (complete) {
    await notify({
      userIds: [loaded.ownerId],
      type: 'approval_result',
      title: `${loaded.reference} approved`,
      body: `${loaded.customerName} — cleared by ${actor.name}`,
      entityType: 'quotation',
      entityId: id,
      entityRef: loaded.reference,
      view: 'builder',
    });

    await emailApprovalApproved({
      to: loaded.ownerEmail,
      ownerName: loaded.ownerName,
      reference: loaded.reference,
      customerName: loaded.customerName,
      approverName: actor.name,
      comment,
    });
  } else if (nextRole) {
    const risk = await scoreQuotation(loaded);
    await notifyStep(loaded, risk, nextRole as Role);
  }

  return {
    quotation: presentQuotation(await loadQuotation(id)),
    complete,
    nextRole,
  };
}

/** Rejected outright. The deal is lost; every later step is marked skipped. */
export async function rejectStep(actor: AuditActor, id: string, reason: string) {
  const loaded = await loadQuotation(id);
  const { step, isAdminOverride } = await currentStepFor(actor, loaded);

  await db
    .update(approvalSteps)
    .set({
      status: 'rejected',
      reviewerId: actor.id,
      reviewerName: actor.name,
      reason,
      actedAt: new Date(),
    })
    .where(eq(approvalSteps.id, step.id));

  const laterIds = loaded.approvalSteps
    .filter((candidate) => candidate.status === 'pending' && candidate.id !== step.id)
    .map((candidate) => candidate.id);

  if (laterIds.length > 0) {
    await db
      .update(approvalSteps)
      .set({ status: 'skipped' })
      .where(inArray(approvalSteps.id, laterIds));
  }

  await db
    .update(quotations)
    .set({ stage: 'lost', lostReason: reason, lastActivityAt: new Date(), updatedAt: new Date() })
    .where(eq(quotations.id, id));

  await audit({
    entityType: 'quotation',
    entityId: id,
    entityRef: loaded.reference,
    action: `Rejected by ${roleLabel(step.role)}${isAdminOverride ? ' (admin override)' : ''}`,
    actor,
    reason,
    meta: { step: step.stepOrder + 1, of: loaded.approvalSteps.length, skipped: laterIds.length },
  });

  await notify({
    userIds: [loaded.ownerId],
    type: 'approval_result',
    title: `${loaded.reference} was rejected`,
    body: reason,
    entityType: 'quotation',
    entityId: id,
    entityRef: loaded.reference,
    view: 'builder',
  });

  await emailApprovalRejected({
    to: loaded.ownerEmail,
    ownerName: loaded.ownerName,
    reference: loaded.reference,
    customerName: loaded.customerName,
    approverName: actor.name,
    reason,
  });

  return { quotation: presentQuotation(await loadQuotation(id)) };
}

/**
 * Returned for revision. Back to draft, chain deleted entirely.
 *
 * Deleting rather than marking `returned` is what enforces invariant 3: there is no
 * partial approval left for a resubmission to inherit.
 */
export async function returnStep(actor: AuditActor, id: string, reason: string) {
  const loaded = await loadQuotation(id);
  const { step, isAdminOverride } = await currentStepFor(actor, loaded);

  await db.delete(approvalSteps).where(eq(approvalSteps.quotationId, id));

  await db
    .update(quotations)
    .set({ stage: 'draft', lastActivityAt: new Date(), updatedAt: new Date() })
    .where(eq(quotations.id, id));

  await audit({
    entityType: 'quotation',
    entityId: id,
    entityRef: loaded.reference,
    action: `Returned for revision by ${roleLabel(step.role)}${isAdminOverride ? ' (admin override)' : ''}`,
    actor,
    reason,
    meta: { clearedSteps: loaded.approvalSteps.length },
  });

  await notify({
    userIds: [loaded.ownerId],
    type: 'approval_result',
    title: `${loaded.reference} returned for revision`,
    body: reason,
    entityType: 'quotation',
    entityId: id,
    entityRef: loaded.reference,
    view: 'builder',
  });

  await emailApprovalReturned({
    to: loaded.ownerEmail,
    ownerName: loaded.ownerName,
    reference: loaded.reference,
    customerName: loaded.customerName,
    approverName: actor.name,
    reason,
  });

  return { quotation: presentQuotation(await loadQuotation(id)) };
}

/**
 * The steps this caller can action right now.
 *
 * Only the FIRST pending step of each quotation counts — a finance user should not see
 * a quotation still sitting with the manager, because they cannot act on it and it
 * would read as a backlog they are failing to clear.
 */
export async function approvalQueue(actor: AuditActor) {
  const role = actor.role;
  if (!role || role === 'customer' || role === 'system') return [];

  const pending = await db
    .select({
      quotationId: approvalSteps.quotationId,
      role: approvalSteps.role,
      stepOrder: approvalSteps.stepOrder,
      createdAt: approvalSteps.createdAt,
      reference: quotations.reference,
      customerName: customers.name,
      stage: quotations.stage,
    })
    .from(approvalSteps)
    .innerJoin(quotations, eq(quotations.id, approvalSteps.quotationId))
    .innerJoin(customers, eq(customers.id, quotations.customerId))
    .where(
      and(eq(approvalSteps.status, 'pending'), eq(quotations.stage, 'pending_approval')),
    )
    .orderBy(asc(approvalSteps.quotationId), asc(approvalSteps.stepOrder));

  const firstPending = new Map<string, (typeof pending)[number]>();
  for (const step of pending) {
    if (!firstPending.has(step.quotationId)) firstPending.set(step.quotationId, step);
  }

  const mine = [...firstPending.values()].filter(
    (step) => step.role === role || role === 'admin',
  );

  const loaded = await Promise.all(mine.map((step) => loadQuotation(step.quotationId)));

  return Promise.all(
    loaded.map(async (quotation) => {
      const risk = await scoreQuotation(quotation);
      const step = firstPending.get(quotation.id);

      return {
        quotation: presentQuotation(quotation),
        step: {
          role: step?.role ?? null,
          stepOrder: step?.stepOrder ?? 0,
          waitingSince: step?.createdAt ?? null,
        },
        risk: {
          score: risk.score,
          worstSingleOverage: risk.worstSingleOverage,
          violationCount: risk.violationCount,
          label: labelFor(risk.approvers),
        },
      };
    }),
  );
}

function roleLabel(role: string): string {
  const labels: Record<string, string> = {
    sales_manager: 'Sales Manager',
    finance: 'Finance',
    admin: 'Admin',
    sales_rep: 'Sales Rep',
  };
  return labels[role] ?? role;
}
