import { and, desc, eq, inArray, ne } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { lineComments, quotations, users, type Role } from '../../db/schema.js';
import { audit, type AuditActor } from '../../lib/audit.js';
import {
  emailConfirmationPendingApproval,
  emailCounterProposed,
  emailCustomerMessage,
  emailOrderConfirmed,
  emailReapprovalTriggered,
} from '../../lib/emails.js';
import { notify, usersWithRole } from '../../lib/notify.js';
import { pct } from '../../lib/money.js';
import { ApiError } from '../../utils/api-error.js';
import { scoreQuotation } from '../approvals/approvals.service.js';
import { loadQuotation, type LoadedQuotation } from '../quotations/quotations.repo.js';
import { capabilitiesFor, projectForCustomer } from './portal.projection.js';
import type { CounterRequestInput } from './portal.schemas.js';

/**
 * The customer portal.
 *
 * Every query here is scoped by the session's customer id IN THE QUERY ITSELF, not by
 * filtering after a fetch. And a quotation belonging to someone else returns 404 rather
 * than 403 — a 403 confirms the record exists, which is itself a disclosure.
 *
 * Nothing in this module returns the internal quotation shape. Everything goes through
 * `projectForCustomer`, which is an allow-list.
 */

/** Loads a quotation, or 404s if it is not this customer's, or is still a draft. */
async function loadForCustomer(customerId: string, id: string): Promise<LoadedQuotation> {
  const [row] = await db
    .select({ id: quotations.id })
    .from(quotations)
    .where(
      and(
        eq(quotations.id, id),
        // Scoped in the query — see the file header.
        eq(quotations.customerId, customerId),
        // A draft is working material and is never visible to a customer.
        ne(quotations.stage, 'draft'),
        ne(quotations.negotiationStatus, 'none'),
      ),
    )
    .limit(1);

  if (!row) throw ApiError.notFound('Quotation not found');
  return loadQuotation(row.id);
}

export async function listForCustomer(customerId: string) {
  const rows = await db
    .select({ id: quotations.id })
    .from(quotations)
    .where(
      and(
        eq(quotations.customerId, customerId),
        ne(quotations.stage, 'draft'),
        ne(quotations.negotiationStatus, 'none'),
      ),
    )
    .orderBy(desc(quotations.lastActivityAt));

  const loaded = await Promise.all(rows.map((row) => loadQuotation(row.id)));
  return loaded.map(projectForCustomer);
}

export async function getForCustomer(customerId: string, id: string) {
  return projectForCustomer(await loadForCustomer(customerId, id));
}

/** Posts a message on a line. Permitted whenever `canMessage`. */
export async function postComment(
  actor: AuditActor,
  customerId: string,
  id: string,
  lineId: string,
  message: string,
) {
  const loaded = await loadForCustomer(customerId, id);
  const capabilities = capabilitiesFor(loaded.stage);

  if (!capabilities.canMessage) {
    throw ApiError.conflict(
      'ACTION_NOT_AVAILABLE',
      'This quotation is closed, so messages can no longer be posted.',
    );
  }

  const line = loaded.lines.find((candidate) => candidate.id === lineId);
  if (!line) throw ApiError.notFound('Line not found on this quotation');

  await db.insert(lineComments).values({
    lineId,
    authorName: actor.name,
    authorId: actor.id,
    side: 'customer',
    message,
  });

  await db
    .update(quotations)
    .set({ awaitingSeller: true, lastActivityAt: new Date(), updatedAt: new Date() })
    .where(eq(quotations.id, id));

  await audit({
    entityType: 'quotation',
    entityId: id,
    entityRef: loaded.reference,
    action: `Customer commented on ${line.productName}`,
    actor,
    meta: { lineId },
  });

  await notify({
    userIds: [loaded.ownerId],
    type: 'negotiation',
    title: `${loaded.customerName} commented on ${loaded.reference}`,
    body: message.slice(0, 200),
    entityType: 'quotation',
    entityId: id,
    entityRef: loaded.reference,
    view: 'negotiation',
  });

  await emailCustomerMessage({
    to: loaded.ownerEmail,
    ownerName: loaded.ownerName,
    reference: loaded.reference,
    customerName: loaded.customerName,
    productName: line.productName,
    message,
  });

  return projectForCustomer(await loadQuotation(id));
}

/** Proposes a counter-discount and/or a justification. */
export async function requestTerms(
  actor: AuditActor,
  customerId: string,
  id: string,
  input: CounterRequestInput,
) {
  const loaded = await loadForCustomer(customerId, id);
  const capabilities = capabilitiesFor(loaded.stage);

  if (!capabilities.canProposeTerms) {
    throw ApiError.conflict(
      'ACTION_NOT_AVAILABLE',
      'Your previous request is still under review. We will come back to you before you can send another.',
    );
  }

  await db
    .update(quotations)
    .set({
      counterDiscountPct:
        input.counterDiscountPct === null ? null : pct(input.counterDiscountPct),
      counterJustification: input.justification,
      stage: loaded.stage === 'sent' ? 'under_negotiation' : loaded.stage,
      negotiationStatus: 'under_negotiation',
      awaitingSeller: true,
      lastActivityAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(quotations.id, id));

  await audit({
    entityType: 'quotation',
    entityId: id,
    entityRef: loaded.reference,
    action: 'Customer proposed new terms',
    actor,
    reason: input.justification,
    meta: { counterDiscountPct: input.counterDiscountPct },
  });

  await notify({
    userIds: [loaded.ownerId],
    type: 'negotiation',
    title: `${loaded.customerName} proposed new terms on ${loaded.reference}`,
    body:
      input.counterDiscountPct !== null
        ? `Requested ${input.counterDiscountPct}% — ${input.justification ?? 'no justification given'}`
        : (input.justification ?? ''),
    entityType: 'quotation',
    entityId: id,
    entityRef: loaded.reference,
    view: 'negotiation',
  });

  await emailCounterProposed({
    to: loaded.ownerEmail,
    ownerName: loaded.ownerName,
    reference: loaded.reference,
    customerName: loaded.customerName,
    counterDiscountPct: input.counterDiscountPct,
    justification: input.justification,
  });

  return projectForCustomer(await loadQuotation(id));
}

/**
 * The customer confirms.
 *
 * This is the automatic re-approval branch, and the most important behaviour in the
 * product. The server re-scores the FINAL agreed terms — never a cached number — and
 * if the result needs approvers, the quotation re-enters the chain with no rep action
 * at all. That is what stops a negotiated discount from bypassing governance simply
 * because it was agreed after the last approval.
 *
 * The score itself is never returned here. It is internal governance data.
 */
export async function confirmQuotation(actor: AuditActor, customerId: string, id: string) {
  const loaded = await loadForCustomer(customerId, id);
  const capabilities = capabilitiesFor(loaded.stage);

  if (!capabilities.canConfirm) {
    throw ApiError.conflict(
      'ACTION_NOT_AVAILABLE',
      'This quotation cannot be confirmed in its current state.',
    );
  }

  if (loaded.lines.length === 0) {
    throw ApiError.conflict('EMPTY_QUOTATION', 'This quotation has no lines to confirm.');
  }

  const risk = await scoreQuotation(loaded);

  if (risk.approvers.length > 0) {
    // Rebuilt from scratch, not merged with whatever was there.
    await resetChain(id, risk.approvers);

    await db
      .update(quotations)
      .set({
        stage: 'pending_approval',
        negotiationStatus: 'pending_reapproval',
        awaitingSeller: false,
        lastActivityAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(quotations.id, id));

    await audit({
      entityType: 'quotation',
      entityId: id,
      entityRef: loaded.reference,
      action: 'Re-approval triggered by customer-negotiated terms',
      actor,
      reason: `Customer confirmed terms scoring ${risk.score.toFixed(2)} points, requiring ${risk.approvers.length} approver(s).`,
      meta: {
        score: risk.score,
        worstSingleOverage: risk.worstSingleOverage,
        approvers: risk.approvers,
        ruleId: risk.ruleId,
      },
    });

    const firstRole = risk.approvers[0] as Role;
    const approverIds = await usersWithRole(firstRole);
    const recipients = [...approverIds, loaded.ownerId];

    await notify({
      userIds: recipients,
      type: 'approval_request',
      title: `${loaded.reference} re-entered approval after customer confirmation`,
      body: `${loaded.customerName} · blended risk ${risk.score.toFixed(2)} pts`,
      entityType: 'quotation',
      entityId: id,
      entityRef: loaded.reference,
      view: 'approval',
    });

    const rows = await db
      .select({ email: users.email })
      .from(users)
      .where(inArray(users.id, recipients));

    await emailReapprovalTriggered({
      recipients: rows.map((row) => row.email),
      reference: loaded.reference,
      customerName: loaded.customerName,
      score: risk.score,
      requiredApprovers: risk.approvers.length,
      label: risk.label,
    });

    await emailConfirmationPendingApproval({
      to: loaded.customerEmail,
      contactName: loaded.customerContactName ?? loaded.customerName,
      reference: loaded.reference,
    });

    return {
      quotation: projectForCustomer(await loadQuotation(id)),
      reapproval: true,
      requiredApprovers: risk.approvers.length,
    };
  }

  await db
    .update(quotations)
    .set({
      stage: 'confirmed',
      negotiationStatus: 'confirmed',
      awaitingSeller: false,
      lastActivityAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(quotations.id, id));

  await audit({
    entityType: 'quotation',
    entityId: id,
    entityRef: loaded.reference,
    action: 'Confirmed by customer — within all ceilings, no approval required',
    actor,
    meta: { score: risk.score, value: loaded.totals.grandTotal },
  });

  await notify({
    userIds: [loaded.ownerId],
    type: 'negotiation',
    title: `${loaded.customerName} confirmed ${loaded.reference}`,
    body: 'Within all discount ceilings — no approval was needed.',
    entityType: 'quotation',
    entityId: id,
    entityRef: loaded.reference,
    view: 'builder',
  });

  await emailOrderConfirmed({
    to: loaded.customerEmail,
    contactName: loaded.customerContactName ?? loaded.customerName,
    reference: loaded.reference,
    currency: loaded.currency,
    grandTotal: loaded.totals.grandTotal,
  });

  return {
    quotation: projectForCustomer(await loadQuotation(id)),
    reapproval: false,
    requiredApprovers: 0,
  };
}

/**
 * Replaces the approval chain wholesale.
 *
 * `approvalSteps` is imported lazily because this module already imports the approvals
 * service for `scoreQuotation`, and a static import back into the schema through that
 * path is the shape that turns into a cycle as the modules grow.
 */
async function resetChain(quotationId: string, approvers: Role[]) {
  const { approvalSteps } = await import('../../db/schema.js');
  await db.delete(approvalSteps).where(eq(approvalSteps.quotationId, quotationId));
  await db.insert(approvalSteps).values(
    approvers.map((role, index) => ({
      quotationId,
      role: role as Role,
      stepOrder: index,
      status: 'pending' as const,
    })),
  );
}
