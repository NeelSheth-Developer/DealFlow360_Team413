import { nextId, nowISO } from '@/lib/utils';
import {
  canConfirm,
  canMessage,
  canProposeTerms,
  isSharedWithCustomer,
  toCustomerView,
} from '@/lib/customerView';
import { buildApprovalSteps } from '@/lib/riskEngine';
import { canTransition } from '@/lib/stageMachine';

/**
 * Customer-side actions.
 *
 * Every read is scoped to the signed-in customer session and passes through
 * `toCustomerView`, which is an allow-list projection. There is no token in a
 * URL: a customer authenticates, then sees only quotations addressed to their
 * own company that have actually been shared with them.
 */
export function createCustomerSlice(set, get) {
  function session() {
    return get().customerUser;
  }

  /** Resolves a quotation only if it belongs to the signed-in customer. */
  function ownedQuote(quoteId) {
    const me = session();
    if (!me) return null;
    const quote = get().quotations.find((q) => q.id === quoteId);
    if (!quote) return null;
    if (quote.customerId !== me.id) return null;
    if (!isSharedWithCustomer(quote)) return null;
    return quote;
  }

  function customerActor(quote) {
    const me = session();
    return {
      id: quote.customerId,
      name: me?.contactName || quote.customerName,
      role: 'customer',
    };
  }

  return {
    /** Every quotation shared with the signed-in customer, newest first. */
    customerQuotations() {
      const me = session();
      if (!me) return [];
      return get()
        .quotations.filter((q) => q.customerId === me.id && isSharedWithCustomer(q))
        .sort((a, b) => new Date(b.lastActivityAt) - new Date(a.lastActivityAt))
        .map((q) =>
          toCustomerView(q, { products: get().products, plans: get().subscriptionPlans }),
        );
    },

    /** One quotation, or null if it is not this customer's to see. */
    customerGetQuote(quoteId) {
      const quote = ownedQuote(quoteId);
      if (!quote) return null;
      return toCustomerView(quote, {
        products: get().products,
        plans: get().subscriptionPlans,
      });
    },

    customerCanAccess(quoteId) {
      return Boolean(ownedQuote(quoteId));
    },

    /** How many of this customer's quotations have an unanswered seller reply. */
    customerUnreadCount() {
      const me = session();
      if (!me) return 0;
      return get()
        .quotations.filter((q) => q.customerId === me.id && isSharedWithCustomer(q))
        .filter((q) =>
          (q.lines ?? []).some((l) => {
            const last = (l.comments ?? [])[l.comments.length - 1];
            return last && last.role !== 'customer';
          }),
        ).length;
    },

    /**
     * Post a message on a line.
     *
     * Deliberately permitted right through internal review — a customer with a
     * question should never be frozen out of asking it. Only a closed quotation
     * blocks messaging.
     */
    customerAddComment(quoteId, lineId, message) {
      const quote = ownedQuote(quoteId);
      if (!quote) return { ok: false, error: 'This quotation is no longer available.' };
      if (!message?.trim()) return { ok: false, error: 'Type a message first.' };
      if (!canMessage(quote)) {
        return { ok: false, error: 'This quotation is closed, so messaging is disabled.' };
      }

      const actor = customerActor(quote);
      const lines = quote.lines.map((l) =>
        l.id === lineId
          ? {
              ...l,
              comments: [
                ...(l.comments ?? []),
                {
                  id: nextId('cm'),
                  author: actor.name,
                  role: 'customer',
                  message: message.trim(),
                  at: nowISO(),
                },
              ],
            }
          : l,
      );

      set((state) => ({
        quotations: state.quotations.map((q) =>
          q.id === quote.id ? { ...q, lines, lastActivityAt: nowISO() } : q,
        ),
      }));

      const line = quote.lines.find((l) => l.id === lineId);
      get().logAudit({
        entityType: 'quotation',
        entityId: quote.id,
        action: `Customer comment on ${line?.productName ?? 'a line'}`,
        actor,
      });

      get().notify({
        userId: quote.ownerId,
        type: 'negotiation',
        title: `${quote.customerName} commented on ${quote.id}`,
        body: message.trim().slice(0, 140),
        link: `/app/quotations/${quote.id}`,
      });

      return { ok: true };
    },

    /** Customer submits change requests plus an optional counter-discount. */
    customerSubmitRequest(quoteId, { counterDiscountPct = null, justification = '' } = {}) {
      const quote = ownedQuote(quoteId);
      if (!quote) return { ok: false, error: 'This quotation is no longer available.' };
      if (!canProposeTerms(quote)) {
        return {
          ok: false,
          error:
            quote.stage === 'pending_approval'
              ? 'Your previous request is still with our team. You can send a message while you wait.'
              : 'Terms on this quotation are already settled.',
        };
      }

      const actor = customerActor(quote);
      const pct =
        counterDiscountPct === null || counterDiscountPct === '' ? null : Number(counterDiscountPct);

      set((state) => ({
        quotations: state.quotations.map((q) =>
          q.id === quote.id
            ? {
                ...q,
                stage: q.stage === 'sent' ? 'under_negotiation' : q.stage,
                negotiationStatus: 'under_negotiation',
                awaitingSeller: true,
                counterDiscountPct: pct ?? q.counterDiscountPct,
                counterJustification: justification || q.counterJustification,
                lastActivityAt: nowISO(),
              }
            : q,
        ),
      }));

      get().logAudit({
        entityType: 'quotation',
        entityId: quote.id,
        action: pct == null ? 'Customer submitted a change request' : `Counter-discount requested: ${pct}%`,
        reason: justification || null,
        meta: { counterDiscountPct: pct },
        actor,
      });

      get().notify({
        userId: quote.ownerId,
        type: 'negotiation',
        title: `${quote.customerName} responded on ${quote.id}`,
        body:
          pct == null
            ? 'A change request is waiting for your reply.'
            : `They are asking for ${pct}%. ${justification}`.trim(),
        link: `/app/quotations/${quote.id}`,
      });

      get().recomputeAlerts();
      return { ok: true };
    },

    /**
     * Customer confirms.
     *
     * The final terms are re-scored by the server before deciding. If they now
     * exceed the thresholds the quotation re-enters the approval chain on its
     * own — no rep action required, which is the behaviour the brief demands.
     */
    async customerConfirm(quoteId) {
      const quote = ownedQuote(quoteId);
      if (!quote) return { ok: false, error: 'This quotation is no longer available.' };
      if (!canConfirm(quote)) {
        return {
          ok: false,
          error:
            quote.stage === 'pending_approval'
              ? 'This is already with our team for approval.'
              : 'This quotation has already been decided.',
        };
      }

      const actor = customerActor(quote);

      // Server-authoritative score on the FINAL agreed terms.
      const scored = await get().ensureRisk(quoteId);
      const { risk, approvalPath } = scored;

      if (approvalPath.approvers.length > 0) {
        const check = canTransition(quote.stage, 'pending_approval', quote);
        if (!check.ok) return { ok: false, error: check.reason };

        set((state) => ({
          quotations: state.quotations.map((q) =>
            q.id === quote.id
              ? {
                  ...q,
                  stage: 'pending_approval',
                  approvalSteps: buildApprovalSteps(approvalPath.approvers),
                  negotiationStatus: 'pending_reapproval',
                  awaitingSeller: false,
                  lastActivityAt: nowISO(),
                }
              : q,
          ),
        }));

        get().logAudit({
          entityType: 'quotation',
          entityId: quote.id,
          action: 'Re-approval triggered by customer-negotiated terms',
          reason: `Final terms score ${risk.score.toFixed(2)} pts (${risk.violationCount} line(s) over ceiling), requiring ${approvalPath.label}.`,
          meta: { blendedScore: risk.score, approvers: approvalPath.approvers },
          actor,
        });

        get().notifyRole({
          role: approvalPath.approvers[0],
          type: 'approval_request',
          title: `${quote.id} re-entered approval after negotiation`,
          body: `${quote.customerName} confirmed at terms scoring ${risk.score.toFixed(2)} pts.`,
          link: `/app/quotations/${quote.id}/approval`,
        });

        get().notify({
          userId: quote.ownerId,
          type: 'negotiation',
          title: `${quote.customerName} confirmed ${quote.id}`,
          body: `Terms exceeded thresholds, so it went to ${approvalPath.label} automatically.`,
          link: `/app/quotations/${quote.id}/approval`,
        });

        get().recomputeAlerts();
        return { ok: true, reapproval: true, risk, path: approvalPath };
      }

      const check = canTransition(quote.stage, 'confirmed', quote);
      if (!check.ok) return { ok: false, error: check.reason };

      set((state) => ({
        quotations: state.quotations.map((q) =>
          q.id === quote.id
            ? {
                ...q,
                stage: 'confirmed',
                negotiationStatus: 'confirmed',
                awaitingSeller: false,
                lastActivityAt: nowISO(),
              }
            : q,
        ),
      }));

      get().logAudit({
        entityType: 'quotation',
        entityId: quote.id,
        action: 'Quotation confirmed by customer',
        reason: 'Final terms were inside every ceiling — no further approval needed.',
        meta: { blendedScore: risk.score },
        actor,
      });

      get().notify({
        userId: quote.ownerId,
        type: 'negotiation',
        title: `${quote.customerName} confirmed ${quote.id}`,
        body: 'Terms were within limits. Moving to fulfillment.',
        link: `/app/quotations/${quote.id}/fulfillment`,
      });

      get().computeFulfillment(quote.id);
      get().buildBilling(quote.id);
      get().recomputeAlerts();
      return { ok: true, reapproval: false, risk, path: approvalPath };
    },
  };
}
