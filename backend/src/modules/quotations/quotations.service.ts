import { and, count, desc, eq, gte, ilike, lte, or, sql, type SQL } from 'drizzle-orm';
import { db } from '../../db/index.js';
import {
  customers,
  lineComments,
  products,
  quotationLines,
  quotations,
  subscriptionPlans,
  users,
  type Stage,
} from '../../db/schema.js';
import { audit, type AuditActor } from '../../lib/audit.js';
import {
  emailOwnerAssigned,
  emailQuotationShared,
  emailSellerReplied,
  emailTermsUpdated,
} from '../../lib/emails.js';
import { money, pct } from '../../lib/money.js';
import { notify } from '../../lib/notify.js';
import { withReference } from '../../lib/reference.js';
import { bindingCeiling, loadCeilings, scoreWithStoredConfig } from '../../lib/risk.js';
import { ApiError } from '../../utils/api-error.js';
import { resolveUnitPrice } from '../catalog/catalog.service.js';
import { defaultPlanFor } from '../subscriptions/subscriptions.service.js';
import { loadQuotation, presentQuotation, touch, type LoadedQuotation } from './quotations.repo.js';
import type {
  AddLineInput,
  CreateQuotationInput,
  ListQuotationsQuery,
  UpdateLineInput,
  UpdateQuotationInput,
} from './quotations.schemas.js';

/**
 * Quotation lifecycle: create, edit lines, share, move stage.
 *
 * Two rules run through everything here.
 *
 * First, prices come from the server. `POST /lines` resolves the unit price from the
 * customer's tier price list and the cost, tax and category from the product; a client
 * never supplies them. A later negotiated price CAN be set through `PATCH /lines`,
 * because agreeing a number on a call is a real commercial act — but it is bounded and
 * audited, and the cost and category stay server-owned so margin and the binding
 * ceiling remain honest.
 *
 * Second, edits are only legal while the quotation is `draft` or `under_negotiation`.
 * Anything else would let a rep change the lines out from under an approval that has
 * already been given.
 */

/** Stages in which the lines and commercial terms may still be changed. */
const EDITABLE_STAGES: Stage[] = ['draft', 'under_negotiation'];

/**
 * The stage graph from the problem statement. Anything not listed is rejected with a
 * message written for a salesperson, because the UI shows it verbatim in a toast.
 */
const TRANSITIONS: Record<Stage, Stage[]> = {
  draft: ['pending_approval', 'approved', 'sent', 'lost'],
  sent: ['under_negotiation', 'confirmed', 'pending_approval', 'draft', 'lost'],
  under_negotiation: ['draft', 'pending_approval', 'confirmed', 'lost'],
  pending_approval: ['approved', 'draft', 'lost'],
  approved: ['fulfillment', 'sent', 'lost'],
  fulfillment: ['billed', 'lost'],
  billed: ['confirmed', 'lost'],
  confirmed: [],
  lost: ['draft'],
};

const STAGE_LABEL: Record<Stage, string> = {
  draft: 'Draft',
  sent: 'Sent',
  under_negotiation: 'Under negotiation',
  pending_approval: 'Pending approval',
  approved: 'Approved',
  fulfillment: 'Fulfillment',
  billed: 'Billed',
  confirmed: 'Confirmed',
  lost: 'Lost',
};

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

export async function listQuotations(actor: AuditActor, query: ListQuotationsQuery) {
  const filters: SQL[] = [];
  if (query.stage) filters.push(eq(quotations.stage, query.stage));
  if (query.ownerId) filters.push(eq(quotations.ownerId, query.ownerId));
  if (query.customerId) filters.push(eq(quotations.customerId, query.customerId));
  if (query.tier) filters.push(eq(quotations.tier, query.tier));
  if (query.from) filters.push(gte(quotations.createdAt, new Date(`${query.from}T00:00:00Z`)));
  if (query.to) filters.push(lte(quotations.createdAt, new Date(`${query.to}T23:59:59Z`)));

  if (query.search) {
    const term = `%${query.search}%`;
    const search = or(ilike(quotations.reference, term), ilike(customers.name, term));
    if (search) filters.push(search);
  }

  /**
   * A rep sees their own drafts and nobody else's.
   *
   * A draft is working material — a half-built quote with a placeholder discount is
   * not something another rep should be reading, and a manager needs the full picture.
   * So the restriction is on drafts specifically, not on the whole list.
   */
  if (actor.role === 'sales_rep') {
    const visible = or(
      sql`${quotations.stage} <> 'draft'`,
      eq(quotations.ownerId, actor.id ?? ''),
    );
    if (visible) filters.push(visible);
  }

  const where = filters.length > 0 ? and(...filters) : undefined;
  const offset = (query.page - 1) * query.pageSize;

  const [rows, [totals]] = await Promise.all([
    db
      .select({ id: quotations.id })
      .from(quotations)
      .innerJoin(customers, eq(customers.id, quotations.customerId))
      .where(where)
      .orderBy(desc(quotations.lastActivityAt))
      .limit(query.pageSize)
      .offset(offset),
    db
      .select({ total: count() })
      .from(quotations)
      .innerJoin(customers, eq(customers.id, quotations.customerId))
      .where(where),
  ]);

  const loaded = await Promise.all(rows.map((row) => loadQuotation(row.id)));
  const total = totals?.total ?? 0;

  return {
    data: loaded.map(presentQuotation),
    meta: {
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
    },
  };
}

export async function getQuotation(actor: AuditActor, id: string) {
  const loaded = await loadQuotation(id);
  assertCanView(actor, loaded);
  return presentQuotation(loaded);
}

// ---------------------------------------------------------------------------
// Creating and editing
// ---------------------------------------------------------------------------

export async function createQuotation(actor: AuditActor, input: CreateQuotationInput) {
  const [customer] = await db
    .select()
    .from(customers)
    .where(eq(customers.id, input.customerId))
    .limit(1);

  if (!customer) throw ApiError.notFound('Customer not found');
  if (!customer.active) {
    throw ApiError.conflict('ACCOUNT_DISABLED', 'That customer account is not active');
  }

  const ownerId = await resolveOwner(actor, input.ownerId);

  const created = await withReference('Q', 'quotations', async (reference) => {
    const [row] = await db
      .insert(quotations)
      .values({
        reference,
        customerId: customer.id,
        ownerId,
        createdById: actor.id ?? ownerId,
        // Snapshotted so a later tier move cannot silently rewrite an open quotation.
        tier: customer.tier,
        currency: customer.currency,
      })
      .returning();
    return row;
  });

  if (!created) throw ApiError.notFound('Quotation not found');

  await audit({
    entityType: 'quotation',
    entityId: created.id,
    entityRef: created.reference,
    action: `Quotation created for ${customer.name}`,
    actor,
    meta: { customerId: customer.id, ownerId, tier: customer.tier },
  });

  if (ownerId !== actor.id) {
    const [newOwner] = await db.select().from(users).where(eq(users.id, ownerId)).limit(1);
    await notify({
      userIds: [ownerId],
      type: 'system',
      title: `${created.reference} was created for you`,
      body: `${customer.name} — assigned by ${actor.name}`,
      entityType: 'quotation',
      entityId: created.id,
      entityRef: created.reference,
      view: 'builder',
    });
    if (newOwner) {
      await emailOwnerAssigned({
        to: newOwner.email,
        newOwnerName: newOwner.name,
        reference: created.reference,
        customerName: customer.name,
        assignedByName: actor.name,
      });
    }
  }

  return presentQuotation(await loadQuotation(created.id));
}

/**
 * A `sales_rep` may only own their own quotations. Managers and admins may assign to
 * any rep or manager — but never to a finance user, who has no book of business and
 * whose independence from the sale is the point of the payment controls.
 */
async function resolveOwner(actor: AuditActor, requested: string | undefined): Promise<string> {
  const actorId = actor.id ?? '';
  if (!requested || requested === actorId) return actorId;

  if (actor.role !== 'admin' && actor.role !== 'sales_manager') {
    throw ApiError.forbidden(
      'FORBIDDEN',
      'Only a sales manager or admin can assign a quotation to someone else',
    );
  }

  const [target] = await db.select().from(users).where(eq(users.id, requested)).limit(1);
  if (!target) throw ApiError.notFound('That user does not exist');
  if (!target.active) throw ApiError.conflict('ACCOUNT_DISABLED', 'That user is not active');

  if (target.role !== 'sales_rep' && target.role !== 'sales_manager') {
    throw ApiError.badRequest(
      'VALIDATION_FAILED',
      'A quotation can only be owned by a sales rep or a sales manager',
    );
  }

  return target.id;
}

export async function updateQuotation(actor: AuditActor, id: string, input: UpdateQuotationInput) {
  const loaded = await loadQuotation(id);
  assertCanEdit(actor, loaded);

  await db
    .update(quotations)
    .set({
      ...(input.orderDiscountPct !== undefined
        ? { orderDiscountPct: pct(input.orderDiscountPct) }
        : {}),
      ...(input.promisedDeliveryDate !== undefined
        ? { promisedDeliveryDate: input.promisedDeliveryDate }
        : {}),
      ...(input.validUntil !== undefined ? { validUntil: input.validUntil } : {}),
      ...(input.internalNotes !== undefined ? { internalNotes: input.internalNotes } : {}),
      ...(input.customerTerms !== undefined ? { customerTerms: input.customerTerms } : {}),
      lastActivityAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(quotations.id, id));

  // An order discount moves every line's effective discount at once, so it is a
  // governance event in the same way a line discount is.
  if (
    input.orderDiscountPct !== undefined &&
    input.orderDiscountPct !== loaded.orderDiscountPct
  ) {
    await audit({
      entityType: 'quotation',
      entityId: id,
      entityRef: loaded.reference,
      action: 'Order discount changed',
      actor,
      meta: { from: loaded.orderDiscountPct, to: input.orderDiscountPct },
    });
  }

  return presentQuotation(await loadQuotation(id));
}

/**
 * Adds a line, resolving everything commercial from the server.
 *
 * When the product is already on the quotation with the same plan, the quantity is
 * incremented instead of a duplicate line being created — two rows for one product
 * would show the customer the same item twice and make the discount picture harder to
 * read than it needs to be.
 */
export async function addLine(actor: AuditActor, id: string, input: AddLineInput) {
  const loaded = await loadQuotation(id);
  assertCanEdit(actor, loaded);

  const [product] = await db
    .select()
    .from(products)
    .where(eq(products.id, input.productId))
    .limit(1);

  if (!product) throw ApiError.notFound('Product not found');
  if (!product.active) {
    throw ApiError.conflict('PRODUCT_INACTIVE', `${product.name} is archived and cannot be quoted`);
  }

  // A subscription CATEGORY does not make a line recurring — an attached plan does.
  let planId = input.planId;
  if (planId) {
    const [plan] = await db
      .select({ id: subscriptionPlans.id, active: subscriptionPlans.active })
      .from(subscriptionPlans)
      .where(eq(subscriptionPlans.id, planId))
      .limit(1);

    if (!plan) throw ApiError.notFound('Subscription plan not found');
    if (!plan.active) {
      throw ApiError.conflict('VALIDATION_FAILED', 'That subscription plan is no longer active');
    }
  } else if (product.category === 'subscription') {
    const fallback = await defaultPlanFor(product.id);
    planId = fallback?.id ?? null;
  }

  const existing = loaded.lines.find(
    (line) => line.productId === product.id && line.planId === planId,
  );

  if (existing) {
    await db
      .update(quotationLines)
      .set({ qty: existing.qty + input.qty })
      .where(eq(quotationLines.id, existing.id));

    await touch(id);
    await audit({
      entityType: 'quotation',
      entityId: id,
      entityRef: loaded.reference,
      action: `Line quantity increased: ${product.name}`,
      actor,
      meta: { lineId: existing.id, from: existing.qty, to: existing.qty + input.qty },
    });

    return presentQuotation(await loadQuotation(id));
  }

  const unitPrice = await resolveUnitPrice(product.id, loaded.tier, loaded.currency);
  const isSubscription = planId !== null;

  const [line] = await db
    .insert(quotationLines)
    .values({
      quotationId: id,
      productId: product.id,
      // Snapshotted so a later rename does not rewrite an approved quotation.
      productName: product.name,
      category: product.category,
      qty: input.qty,
      unitPrice: money(unitPrice),
      costPrice: product.costPrice,
      taxPct: product.taxPct,
      isSubscription,
      planId,
      subscriptionStartDate: isSubscription ? new Date().toISOString().slice(0, 10) : null,
      position: loaded.lines.length,
    })
    .returning();

  await touch(id);
  await audit({
    entityType: 'quotation',
    entityId: id,
    entityRef: loaded.reference,
    action: `Line added: ${product.name}`,
    actor,
    meta: { lineId: line?.id, qty: input.qty, unitPrice, planId },
  });

  return presentQuotation(await loadQuotation(id));
}

/**
 * Updates a line.
 *
 * A discount change is a governance event, so the audit entry records the old value,
 * the new value, the binding ceiling and the resulting overage — enough for an
 * approver to reconstruct the decision months later without re-running the scorer.
 */
export async function updateLine(
  actor: AuditActor,
  id: string,
  lineId: string,
  input: UpdateLineInput,
) {
  const loaded = await loadQuotation(id);
  assertCanEdit(actor, loaded);

  const line = loaded.lines.find((candidate) => candidate.id === lineId);
  if (!line) throw ApiError.notFound('Line not found on this quotation');

  await db
    .update(quotationLines)
    .set({
      ...(input.qty !== undefined ? { qty: input.qty } : {}),
      ...(input.discountPct !== undefined ? { discountPct: pct(input.discountPct) } : {}),
      ...(input.unitPrice !== undefined ? { unitPrice: money(input.unitPrice) } : {}),
    })
    .where(eq(quotationLines.id, lineId));

  await touch(id);

  if (input.discountPct !== undefined && input.discountPct !== line.discountPct) {
    const ceilings = await loadCeilings();
    const ceiling = bindingCeiling(line.category, loaded.tier, ceilings);
    const effective =
      input.discountPct + loaded.orderDiscountPct * (1 - input.discountPct / 100);

    await audit({
      entityType: 'quotation',
      entityId: id,
      entityRef: loaded.reference,
      action: `Discount changed on ${line.productName}`,
      actor,
      meta: {
        lineId,
        from: line.discountPct,
        to: input.discountPct,
        orderDiscountPct: loaded.orderDiscountPct,
        effectivePct: Math.round(effective * 100) / 100,
        bindingCeilingPct: ceiling,
        overBy: Math.max(0, Math.round((effective - ceiling) * 100) / 100),
      },
    });
  }

  if (input.unitPrice !== undefined && input.unitPrice !== line.unitPrice) {
    await audit({
      entityType: 'quotation',
      entityId: id,
      entityRef: loaded.reference,
      action: `Negotiated price set on ${line.productName}`,
      actor,
      meta: { lineId, from: line.unitPrice, to: input.unitPrice },
    });
  }

  return presentQuotation(await loadQuotation(id));
}

export async function removeLine(actor: AuditActor, id: string, lineId: string) {
  const loaded = await loadQuotation(id);
  assertCanEdit(actor, loaded);

  const line = loaded.lines.find((candidate) => candidate.id === lineId);
  if (!line) throw ApiError.notFound('Line not found on this quotation');

  await db.delete(quotationLines).where(eq(quotationLines.id, lineId));
  await touch(id);

  await audit({
    entityType: 'quotation',
    entityId: id,
    entityRef: loaded.reference,
    action: `Line removed: ${line.productName}`,
    actor,
    meta: { lineId, qty: line.qty, unitPrice: line.unitPrice },
  });

  return presentQuotation(await loadQuotation(id));
}

// ---------------------------------------------------------------------------
// Workflow
// ---------------------------------------------------------------------------

export async function reassignOwner(actor: AuditActor, id: string, ownerId: string) {
  const loaded = await loadQuotation(id);

  if (actor.role !== 'admin' && actor.role !== 'sales_manager') {
    throw ApiError.forbidden('FORBIDDEN', 'Only a sales manager or admin can reassign a quotation');
  }

  const newOwnerId = await resolveOwner(actor, ownerId);
  if (newOwnerId === loaded.ownerId) return presentQuotation(loaded);

  await db
    .update(quotations)
    .set({ ownerId: newOwnerId, lastActivityAt: new Date(), updatedAt: new Date() })
    .where(eq(quotations.id, id));

  const [newOwner] = await db.select().from(users).where(eq(users.id, newOwnerId)).limit(1);

  await audit({
    entityType: 'quotation',
    entityId: id,
    entityRef: loaded.reference,
    action: `Owner reassigned to ${newOwner?.name ?? 'unknown'}`,
    actor,
    meta: { from: loaded.ownerId, to: newOwnerId },
  });

  await notify({
    userIds: [newOwnerId],
    type: 'system',
    title: `${loaded.reference} has been assigned to you`,
    body: `${loaded.customerName} — reassigned by ${actor.name}`,
    entityType: 'quotation',
    entityId: id,
    entityRef: loaded.reference,
    view: 'builder',
  });

  if (newOwner) {
    await emailOwnerAssigned({
      to: newOwner.email,
      newOwnerName: newOwner.name,
      reference: loaded.reference,
      customerName: loaded.customerName,
      assignedByName: actor.name,
    });
  }

  return presentQuotation(await loadQuotation(id));
}

/**
 * Shares the quotation to the customer's portal.
 *
 * There is no share link and no token in the email that goes out. Access is by
 * authenticated account only — a link that grants access is a credential, and a
 * forwarded one would hand a competitor the full commercial terms.
 */
export async function shareQuotation(actor: AuditActor, id: string) {
  const loaded = await loadQuotation(id);
  assertOwnerOrManager(actor, loaded);

  if (loaded.lines.length === 0) {
    throw ApiError.conflict('EMPTY_QUOTATION', 'Add at least one line before sharing this quotation');
  }
  if (loaded.stage !== 'draft' && loaded.stage !== 'sent') {
    throw ApiError.conflict(
      'NOT_SHAREABLE',
      `This quotation is ${STAGE_LABEL[loaded.stage]} and cannot be shared from here.`,
    );
  }

  const [customer] = await db
    .select()
    .from(customers)
    .where(eq(customers.id, loaded.customerId))
    .limit(1);

  // A customer row always has a password in this build — they self-register — but the
  // flag is computed rather than assumed, so a rep-created record would report
  // correctly if that path is ever added.
  const needsRegistration = customer?.emailVerifiedAt === null;

  await db
    .update(quotations)
    .set({
      stage: 'sent',
      negotiationStatus: 'sent',
      sharedAt: new Date(),
      lastActivityAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(quotations.id, id));

  await audit({
    entityType: 'quotation',
    entityId: id,
    entityRef: loaded.reference,
    action: `Shared with ${loaded.customerName}`,
    actor,
    meta: { needsRegistration },
  });

  await emailQuotationShared({
    to: loaded.customerEmail,
    contactName: loaded.customerContactName ?? loaded.customerName,
    companyName: loaded.customerName,
    reference: loaded.reference,
    currency: loaded.currency,
    grandTotal: loaded.totals.grandTotal,
    validUntil: loaded.validUntil,
    needsRegistration,
  });

  const fresh = await loadQuotation(id);

  return {
    quotation: presentQuotation(fresh),
    customer: {
      id: loaded.customerId,
      name: loaded.customerName,
      contactName: loaded.customerContactName,
      email: loaded.customerEmail,
    },
    needsRegistration,
  };
}

/**
 * Moves the quotation along the pipeline.
 *
 * Beyond the graph there are three extra gates. `pending_approval -> approved` needs
 * every step resolved; `-> fulfillment` needs something physical to ship; and
 * `billed -> confirmed` is driven by full payment rather than by a drag on a board.
 */
export async function moveStage(actor: AuditActor, id: string, toStage: Stage) {
  const loaded = await loadQuotation(id);
  assertOwnerOrManager(actor, loaded);

  if (loaded.stage === toStage) return presentQuotation(loaded);

  const allowed = TRANSITIONS[loaded.stage];
  if (!allowed.includes(toStage)) {
    throw ApiError.conflict(
      'INVALID_TRANSITION',
      `Can't move to ${STAGE_LABEL[toStage]} — this quotation is ${STAGE_LABEL[loaded.stage]}.`,
    );
  }

  if (toStage === 'approved' && loaded.approvalSteps.some((step) => step.status === 'pending')) {
    const next = loaded.approvalSteps.find((step) => step.status === 'pending');
    throw ApiError.conflict(
      'NOT_PENDING',
      `Can't approve — this quote still needs ${roleLabel(next?.role)} sign-off.`,
    );
  }

  if (toStage === 'fulfillment') {
    const shippable = loaded.lines.filter(
      (line) => line.category !== 'subscription' && line.category !== 'service',
    );
    if (shippable.length === 0) {
      throw ApiError.conflict(
        'NOTHING_TO_SHIP',
        "Can't move to Fulfillment — this order has nothing physical to ship.",
      );
    }
  }

  if (toStage === 'confirmed' && loaded.stage === 'billed') {
    throw ApiError.conflict(
      'INVALID_TRANSITION',
      "Can't confirm from here — an order moves to Confirmed when its invoice is paid in full.",
    );
  }

  await db
    .update(quotations)
    .set({ stage: toStage, lastActivityAt: new Date(), updatedAt: new Date() })
    .where(eq(quotations.id, id));

  await audit({
    entityType: 'quotation',
    entityId: id,
    entityRef: loaded.reference,
    action: `Stage moved to ${STAGE_LABEL[toStage]}`,
    actor,
    meta: { from: loaded.stage, to: toStage },
  });

  return presentQuotation(await loadQuotation(id));
}

export async function markLost(actor: AuditActor, id: string, reason: string) {
  const loaded = await loadQuotation(id);
  assertOwnerOrManager(actor, loaded);

  if (loaded.stage === 'lost') return presentQuotation(loaded);
  if (loaded.stage === 'confirmed') {
    throw ApiError.conflict('INVALID_TRANSITION', 'A confirmed order cannot be marked lost.');
  }

  await db
    .update(quotations)
    .set({ stage: 'lost', lostReason: reason, lastActivityAt: new Date(), updatedAt: new Date() })
    .where(eq(quotations.id, id));

  await audit({
    entityType: 'quotation',
    entityId: id,
    entityRef: loaded.reference,
    action: 'Marked lost',
    actor,
    reason,
    meta: { fromStage: loaded.stage, value: loaded.totals.grandTotal },
  });

  return presentQuotation(await loadQuotation(id));
}

/** A rep's reply on a line. Clears `awaitingSeller` and tells the customer. */
export async function addRepComment(
  actor: AuditActor,
  id: string,
  lineId: string,
  message: string,
) {
  const loaded = await loadQuotation(id);
  assertOwnerOrManager(actor, loaded);

  const line = loaded.lines.find((candidate) => candidate.id === lineId);
  if (!line) throw ApiError.notFound('Line not found on this quotation');

  await db.insert(lineComments).values({
    lineId,
    authorName: actor.name,
    authorId: actor.id,
    side: 'staff',
    message,
  });

  await db
    .update(quotations)
    .set({ awaitingSeller: false, lastActivityAt: new Date(), updatedAt: new Date() })
    .where(eq(quotations.id, id));

  await audit({
    entityType: 'quotation',
    entityId: id,
    entityRef: loaded.reference,
    action: `Replied on ${line.productName}`,
    actor,
    meta: { lineId },
  });

  await emailSellerReplied({
    to: loaded.customerEmail,
    contactName: loaded.customerContactName ?? loaded.customerName,
    reference: loaded.reference,
    productName: line.productName,
    message,
  });

  return presentQuotation(await loadQuotation(id));
}

/**
 * Applies the customer's counter-discount to every line, then re-scores.
 *
 * The score comes back with the quotation so the rep sees immediately what accepting
 * the counter would cost them in approvals — which is the decision they are actually
 * making.
 */
export async function applyCounter(actor: AuditActor, id: string) {
  const loaded = await loadQuotation(id);
  assertOwnerOrManager(actor, loaded);
  assertEditableStage(loaded);

  if (loaded.counterDiscountPct === null) {
    throw ApiError.conflict(
      'NO_COUNTER_PROPOSED',
      'This customer has not proposed a counter-discount.',
    );
  }

  const counter = loaded.counterDiscountPct;

  await db
    .update(quotationLines)
    .set({ discountPct: pct(counter) })
    .where(eq(quotationLines.quotationId, id));

  await db
    .update(quotations)
    .set({ awaitingSeller: false, lastActivityAt: new Date(), updatedAt: new Date() })
    .where(eq(quotations.id, id));

  const fresh = await loadQuotation(id);

  const risk = await scoreWithStoredConfig({
    quotationId: fresh.id,
    tier: fresh.tier,
    orderDiscountPct: fresh.orderDiscountPct,
    lines: fresh.lines.map((line) => ({
      id: line.id,
      productName: line.productName,
      category: line.category,
      qty: line.qty,
      unitPrice: line.unitPrice,
      discountPct: line.discountPct,
    })),
  });

  await audit({
    entityType: 'quotation',
    entityId: id,
    entityRef: loaded.reference,
    action: `Customer counter of ${counter}% applied to all lines`,
    actor,
    meta: { counterDiscountPct: counter, score: risk.score, approvers: risk.approvers },
  });

  await emailTermsUpdated({
    to: fresh.customerEmail,
    contactName: fresh.customerContactName ?? fresh.customerName,
    reference: fresh.reference,
    currency: fresh.currency,
    grandTotal: fresh.totals.grandTotal,
  });

  return { quotation: presentQuotation(fresh), risk };
}

/** Records that a rep dismissed an upsell suggestion, so it stops resurfacing. */
export async function dismissSuggestion(actor: AuditActor, id: string, productId: string) {
  const loaded = await loadQuotation(id);
  assertCanEdit(actor, loaded);

  if (loaded.dismissedSuggestions.includes(productId)) return presentQuotation(loaded);

  await db
    .update(quotations)
    .set({
      dismissedSuggestions: [...loaded.dismissedSuggestions, productId],
      updatedAt: new Date(),
    })
    .where(eq(quotations.id, id));

  return presentQuotation(await loadQuotation(id));
}

// ---------------------------------------------------------------------------
// Access rules
// ---------------------------------------------------------------------------

/** A rep may not read another rep's draft. Everything else is visible to staff. */
function assertCanView(actor: AuditActor, loaded: LoadedQuotation) {
  if (actor.role !== 'sales_rep') return;
  if (loaded.stage === 'draft' && loaded.ownerId !== actor.id) {
    // 404 rather than 403: confirming the record exists tells a rep something about a
    // colleague's pipeline that they are not entitled to know.
    throw ApiError.notFound('Quotation not found');
  }
}

function assertOwnerOrManager(actor: AuditActor, loaded: LoadedQuotation) {
  assertCanView(actor, loaded);
  if (actor.role === 'admin' || actor.role === 'sales_manager') return;
  if (loaded.ownerId === actor.id) return;

  throw ApiError.forbidden(
    'NOT_QUOTATION_OWNER',
    'Only the owning rep, a sales manager or an admin can act on this quotation',
  );
}

function assertEditableStage(loaded: LoadedQuotation) {
  if (!EDITABLE_STAGES.includes(loaded.stage)) {
    throw ApiError.conflict(
      'STAGE_LOCKED',
      `This quotation is ${STAGE_LABEL[loaded.stage]} and can no longer be edited. Return it to draft first.`,
    );
  }
}

function assertCanEdit(actor: AuditActor, loaded: LoadedQuotation) {
  assertOwnerOrManager(actor, loaded);
  assertEditableStage(loaded);
}

function roleLabel(role: string | undefined): string {
  const labels: Record<string, string> = {
    sales_manager: 'Sales Manager',
    finance: 'Finance',
    admin: 'Admin',
    sales_rep: 'Sales Rep',
  };
  return role ? (labels[role] ?? role) : 'further';
}

