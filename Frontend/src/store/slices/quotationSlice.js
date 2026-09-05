import { nextId, nowISO, addDaysISO } from '@/lib/utils';
import { roleLabel, stageLabel } from '@/lib/format';
import { tierPrice } from '@/lib/pricing';
import { buildApprovalSteps, currentPendingStep } from '@/lib/riskEngine';
import { canTransition } from '@/lib/stageMachine';
import { defaultPlanForProduct } from '@/data/seed/subscriptionPlans';

/**
 * Quotation lifecycle: create, edit lines, submit for approval, act on approval
 * steps, move stages. This slice owns the approval routing described in the
 * spec — the rep never asks for approval manually, the risk score decides.
 */
export function createQuotationSlice(set, get) {
  /** Internal helper: patch a quotation and bump its activity timestamp. */
  function patchQuote(id, patch, { touch = true } = {}) {
    set((state) => ({
      quotations: state.quotations.map((q) =>
        q.id === id ? { ...q, ...patch, ...(touch ? { lastActivityAt: nowISO() } : {}) } : q,
      ),
    }));
  }

  function nextQuoteNumber() {
    const numbers = get()
      .quotations.map((q) => Number(String(q.id).replace(/\D/g, '')))
      .filter((n) => !Number.isNaN(n));
    const max = numbers.length ? Math.max(...numbers) : 1000;
    return `Q-${max + 1}`;
  }

  return {
    getQuotation(id) {
      return get().quotations.find((q) => q.id === id) ?? null;
    },

    // -------------------------------------------------------------- creation
    /**
     * Creates a quotation assigned to a registered customer.
     *
     * A rep always owns what they create. Admin and Sales Manager may assign the
     * quotation to a specific rep at creation time.
     */
    createQuotation(customerId, ownerId = null) {
      const customer = get().customers.find((c) => c.id === customerId);
      const me = get().currentUser;
      if (!customer || !me) return null;

      let owner = me;
      if (ownerId && ownerId !== me.id) {
        if (!get().canAssignQuotations()) return null;
        const candidate = get().users.find((u) => u.id === ownerId);
        if (candidate && ['sales_rep', 'sales_manager'].includes(candidate.role)) {
          owner = candidate;
        }
      }

      const quotation = {
        id: nextQuoteNumber(),
        customerId: customer.id,
        customerName: customer.name,
        tier: customer.tier,
        currency: customer.currency,
        ownerId: owner.id,
        ownerName: owner.name,
        createdById: me.id,
        createdByName: me.name,
        stage: 'draft',
        lines: [],
        orderDiscountPct: 0,
        approvalSteps: [],
        negotiationStatus: 'none',
        awaitingSeller: false,
        sharedAt: null,
        counterDiscountPct: null,
        counterJustification: null,
        dismissedSuggestions: [],
        createdAt: nowISO(),
        lastActivityAt: nowISO(),
        promisedDeliveryDate: addDaysISO(new Date(), 14),
        validUntil: addDaysISO(new Date(), 21),
        internalNotes: '',
        customerTerms:
          'Prices valid until the date shown above. Delivery within 10 business days of confirmation. Payment due 15 days from invoice.',
      };

      set((state) => ({ quotations: [quotation, ...state.quotations] }));

      get().logAudit({
        entityType: 'quotation',
        entityId: quotation.id,
        action: `Quotation created for ${customer.name} and assigned to ${owner.name}`,
        meta: { customerId: customer.id, tier: customer.tier, ownerId: owner.id },
      });

      if (owner.id !== me.id) {
        get().notify({
          userId: owner.id,
          type: 'system',
          title: `${quotation.id} assigned to you`,
          body: `${customer.name} · created by ${me.name}.`,
          link: `/app/quotations/${quotation.id}`,
        });
      }

      return quotation;
    },

    // ----------------------------------------------------------------- lines
    addLine(quoteId, productId, qty = 1, planId = null) {
      const quote = get().getQuotation(quoteId);
      const product = get().products.find((p) => p.id === productId);
      if (!quote || !product) return null;

      const unitPrice = tierPrice(product, quote.tier, get().priceLists, quote.currency);
      const isSubscription = product.category === 'subscription';
      const resolvedPlan = isSubscription
        ? (planId
            ? get().subscriptionPlans.find((p) => p.id === planId)
            : defaultPlanForProduct(productId, get().subscriptionPlans))
        : null;

      // Adding an existing product bumps its quantity instead of duplicating.
      const existing = quote.lines.find(
        (l) => l.productId === productId && l.planId === (resolvedPlan?.id ?? null),
      );

      if (existing) {
        get().updateLine(quoteId, existing.id, { qty: existing.qty + qty });
        return existing;
      }

      const line = {
        id: nextId('l'),
        productId: product.id,
        productName: product.name,
        category: product.category,
        qty,
        unitPrice,
        costPrice: product.costPrice,
        discountPct: 0,
        taxPct: product.taxPct,
        isSubscription,
        planId: resolvedPlan?.id ?? null,
        subscriptionStartDate: isSubscription ? addDaysISO(new Date(), 7) : null,
        subscriptionStatus: 'active',
        comments: [],
      };

      patchQuote(quoteId, { lines: [...quote.lines, line] });
      get().logAudit({
        entityType: 'quotation',
        entityId: quoteId,
        action: `Line added: ${product.name} × ${qty}`,
        meta: { unitPrice, category: product.category },
      });
      get().recomputeAlerts();
      return line;
    },

    updateLine(quoteId, lineId, patch) {
      const quote = get().getQuotation(quoteId);
      if (!quote) return;
      const before = quote.lines.find((l) => l.id === lineId);
      if (!before) return;

      const lines = quote.lines.map((l) => (l.id === lineId ? { ...l, ...patch } : l));
      patchQuote(quoteId, { lines });

      // Only audit the changes worth an entry — not every keystroke on qty.
      if (patch.discountPct != null && patch.discountPct !== before.discountPct) {
        const ceiling = Math.min(
          get().categoryCeilings[before.category] ?? 100,
          get().tierCeilings[quote.tier] ?? 100,
        );
        get().logAudit({
          entityType: 'quotation',
          entityId: quoteId,
          action: `Discount changed on ${before.productName}: ${before.discountPct}% → ${patch.discountPct}%`,
          meta: { ceilingPct: ceiling, overBy: Math.max(0, patch.discountPct - ceiling) },
        });
      }
      get().recomputeAlerts();
    },

    removeLine(quoteId, lineId) {
      const quote = get().getQuotation(quoteId);
      if (!quote) return;
      const line = quote.lines.find((l) => l.id === lineId);
      patchQuote(quoteId, { lines: quote.lines.filter((l) => l.id !== lineId) });
      get().logAudit({
        entityType: 'quotation',
        entityId: quoteId,
        action: `Line removed: ${line?.productName ?? lineId}`,
      });
      get().recomputeAlerts();
    },

    setOrderDiscount(quoteId, pct) {
      const quote = get().getQuotation(quoteId);
      if (!quote) return;
      const value = Math.max(0, Math.min(100, Number(pct) || 0));
      if (value === quote.orderDiscountPct) return;
      patchQuote(quoteId, { orderDiscountPct: value });
      get().logAudit({
        entityType: 'quotation',
        entityId: quoteId,
        action: `Order-level discount set to ${value}%`,
      });
      get().recomputeAlerts();
    },

    setQuoteMeta(quoteId, patch) {
      patchQuote(quoteId, patch);
    },

    // ------------------------------------------------------- risk & approval
    /**
     * Routes the quotation using a freshly-fetched, server-authoritative score.
     * Empty approver list means it auto-approves — the rep never has to request
     * approval, and never gets to skip it either.
     */
    async submitForApproval(quoteId) {
      const quote = get().getQuotation(quoteId);
      if (!quote) return { ok: false, error: 'Quotation not found.' };
      if (!quote.lines.length) return { ok: false, error: 'Add at least one line first.' };

      // Never route on a cached number — re-score before deciding.
      const scored = await get().ensureRisk(quoteId);
      const risk = scored.risk;
      const path = scored.approvalPath;

      if (path.approvers.length === 0) {
        const check = canTransition(quote.stage, 'approved', quote);
        if (!check.ok) return { ok: false, error: check.reason };

        patchQuote(quoteId, { stage: 'approved', approvalSteps: [] });
        get().logAudit({
          entityType: 'quotation',
          entityId: quoteId,
          action: 'Auto-approved (every line inside its ceiling)',
          meta: { blendedScore: risk.score },
        });
        get().notify({
          userId: quote.ownerId,
          type: 'approval_result',
          title: `${quote.id} auto-approved`,
          body: 'Every line was inside its ceiling. Fulfillment split is ready.',
          link: `/app/quotations/${quoteId}/fulfillment`,
        });
        get().computeFulfillment(quoteId);
        get().recomputeAlerts();
        return { ok: true, autoApproved: true, risk, path };
      }

      const check = canTransition(quote.stage, 'pending_approval', quote);
      if (!check.ok) return { ok: false, error: check.reason };

      patchQuote(quoteId, {
        stage: 'pending_approval',
        approvalSteps: buildApprovalSteps(path.approvers),
      });

      get().logAudit({
        entityType: 'quotation',
        entityId: quoteId,
        action: `Submitted for approval — ${path.label}`,
        meta: {
          blendedScore: risk.score,
          worstSingleOverage: risk.worstSingleOverage,
          approvers: path.approvers,
        },
      });

      // Only the first approver is actioned, but everyone in the chain is told.
      get().notifyRole({
        role: path.approvers[0],
        type: 'approval_request',
        title: `${quote.id} needs your approval`,
        body: `${quote.customerName} · blended risk ${risk.score.toFixed(2)} pts · ${risk.violationCount} line(s) over ceiling`,
        link: `/app/quotations/${quoteId}/approval`,
      });

      get().recomputeAlerts();
      return { ok: true, autoApproved: false, risk, path };
    },

    approveStep(quoteId, comment = null) {
      const quote = get().getQuotation(quoteId);
      const me = get().currentUser;
      if (!quote || !me) return { ok: false, error: 'Not available.' };

      const step = currentPendingStep(quote);
      if (!step) return { ok: false, error: 'Nothing is pending approval on this quotation.' };
      if (step.role !== me.role && me.role !== 'admin') {
        return { ok: false, error: `This step needs ${roleLabel(step.role)} approval.` };
      }

      let advanced = false;
      const steps = quote.approvalSteps.map((s) => {
        if (advanced || s.status !== 'pending') return s;
        advanced = true;
        return {
          ...s,
          status: 'approved',
          reviewerId: me.id,
          reviewerName: me.name,
          at: nowISO(),
          reason: comment,
        };
      });

      const remaining = steps.find((s) => s.status === 'pending');

      if (remaining) {
        patchQuote(quoteId, { approvalSteps: steps });
        get().logAudit({
          entityType: 'quotation',
          entityId: quoteId,
          action: `Approved by ${roleLabel(step.role)}`,
          reason: comment,
          meta: { nextApprover: remaining.role },
        });
        get().notifyRole({
          role: remaining.role,
          type: 'approval_request',
          title: `${quote.id} now needs your approval`,
          body: `${roleLabel(step.role)} has signed off. ${quote.customerName}.`,
          link: `/app/quotations/${quoteId}/approval`,
        });
        get().recomputeAlerts();
        return { ok: true, complete: false, nextRole: remaining.role };
      }

      patchQuote(quoteId, { stage: 'approved', approvalSteps: steps });
      get().logAudit({
        entityType: 'quotation',
        entityId: quoteId,
        action: `Approved by ${roleLabel(step.role)} — approval chain complete`,
        reason: comment,
      });
      get().notify({
        userId: quote.ownerId,
        type: 'approval_result',
        title: `${quote.id} fully approved`,
        body: 'Fulfillment split is ready to review.',
        link: `/app/quotations/${quoteId}/fulfillment`,
      });
      get().computeFulfillment(quoteId);
      get().recomputeAlerts();
      return { ok: true, complete: true };
    },

    rejectQuote(quoteId, reason) {
      const quote = get().getQuotation(quoteId);
      const me = get().currentUser;
      if (!quote || !me) return { ok: false, error: 'Not available.' };
      if (!reason || reason.trim().length < 10) {
        return { ok: false, error: 'A reason of at least 10 characters is required to reject.' };
      }

      const step = currentPendingStep(quote);
      let handled = false;
      const steps = quote.approvalSteps.map((s) => {
        if (s.status !== 'pending') return s;
        if (!handled) {
          handled = true;
          return {
            ...s,
            status: 'rejected',
            reviewerId: me.id,
            reviewerName: me.name,
            at: nowISO(),
            reason,
          };
        }
        return { ...s, status: 'skipped' };
      });

      patchQuote(quoteId, { stage: 'lost', approvalSteps: steps });
      get().logAudit({
        entityType: 'quotation',
        entityId: quoteId,
        action: `Rejected by ${roleLabel(step?.role ?? me.role)}`,
        reason,
      });
      get().notify({
        userId: quote.ownerId,
        type: 'approval_result',
        title: `${quote.id} was rejected`,
        body: reason,
        link: `/app/quotations/${quoteId}/approval`,
      });
      get().recomputeAlerts();
      return { ok: true };
    },

    returnForRevision(quoteId, reason) {
      const quote = get().getQuotation(quoteId);
      const me = get().currentUser;
      if (!quote || !me) return { ok: false, error: 'Not available.' };
      if (!reason || reason.trim().length < 10) {
        return { ok: false, error: 'A reason of at least 10 characters is required to return.' };
      }

      const step = currentPendingStep(quote);
      patchQuote(quoteId, { stage: 'draft', approvalSteps: [] });
      get().logAudit({
        entityType: 'quotation',
        entityId: quoteId,
        action: `Returned for revision by ${roleLabel(step?.role ?? me.role)}`,
        reason,
      });
      get().notify({
        userId: quote.ownerId,
        type: 'approval_result',
        title: `${quote.id} returned for revision`,
        body: reason,
        link: `/app/quotations/${quoteId}`,
      });
      get().recomputeAlerts();
      return { ok: true };
    },

    // ---------------------------------------------------------- stage moves
    moveStage(quoteId, toStage) {
      const quote = get().getQuotation(quoteId);
      if (!quote) return { ok: false, error: 'Quotation not found.' };

      const check = canTransition(quote.stage, toStage, quote);
      if (!check.ok) return { ok: false, error: check.reason };

      const from = quote.stage;
      patchQuote(quoteId, { stage: toStage });
      get().logAudit({
        entityType: 'quotation',
        entityId: quoteId,
        action: `Stage moved ${stageLabel(from)} → ${stageLabel(toStage)}`,
      });

      if (toStage === 'fulfillment') get().computeFulfillment(quoteId);
      if (toStage === 'billed') get().buildBilling(quoteId);

      get().recomputeAlerts();
      return { ok: true };
    },

    markLost(quoteId, reason) {
      const quote = get().getQuotation(quoteId);
      if (!quote) return { ok: false, error: 'Quotation not found.' };
      if (!reason || reason.trim().length < 5) {
        return { ok: false, error: 'Give a short reason so the pipeline data stays useful.' };
      }
      patchQuote(quoteId, { stage: 'lost' });
      get().logAudit({
        entityType: 'quotation',
        entityId: quoteId,
        action: 'Marked as lost',
        reason,
      });
      get().recomputeAlerts();
      return { ok: true };
    },

    /**
     * Shares the quotation with the assigned customer. It then appears in that
     * customer's own signed-in quotation list — there is no link to send.
     */
    sendToCustomer(quoteId) {
      const quote = get().getQuotation(quoteId);
      if (!quote) return { ok: false, error: 'Quotation not found.' };
      if (!quote.lines.length) return { ok: false, error: 'Add at least one line first.' };

      const customer = get().customers.find((c) => c.id === quote.customerId);
      if (!customer) return { ok: false, error: 'This quotation has no assigned customer.' };

      patchQuote(quoteId, {
        stage: quote.stage === 'draft' ? 'sent' : quote.stage,
        negotiationStatus: 'sent',
        awaitingSeller: false,
        sharedAt: nowISO(),
      });

      get().logAudit({
        entityType: 'quotation',
        entityId: quoteId,
        action: `Shared with ${customer.name} for review`,
        meta: { customerId: customer.id, hasAccount: Boolean(customer.password) },
      });

      return {
        ok: true,
        customer,
        // Flags the case where the company exists but nobody has claimed the
        // login yet, so the rep knows to ask them to register.
        needsRegistration: !customer.password,
      };
    },

    /**
     * Reassigns the owning rep. Only Admin and Sales Manager may do this — a rep
     * cannot hand their own deal to someone else.
     */
    assignOwner(quoteId, ownerId) {
      if (!get().canAssignQuotations()) {
        return { ok: false, error: 'Only an Admin or Sales Manager can reassign a quotation.' };
      }
      const quote = get().getQuotation(quoteId);
      const owner = get().users.find((u) => u.id === ownerId);
      if (!quote || !owner) return { ok: false, error: 'Unknown quotation or user.' };
      if (owner.role !== 'sales_rep' && owner.role !== 'sales_manager') {
        return { ok: false, error: 'Quotations can only be owned by a Sales Rep or Sales Manager.' };
      }

      const previous = quote.ownerName;
      patchQuote(quoteId, { ownerId: owner.id, ownerName: owner.name });

      get().logAudit({
        entityType: 'quotation',
        entityId: quoteId,
        action: `Reassigned from ${previous} to ${owner.name}`,
        meta: { fromId: quote.ownerId, toId: owner.id },
      });

      get().notify({
        userId: owner.id,
        type: 'system',
        title: `${quote.id} assigned to you`,
        body: `${quote.customerName} · reassigned by ${get().currentUser?.name}.`,
        link: `/app/quotations/${quoteId}`,
      });

      get().recomputeAlerts();
      return { ok: true, owner };
    },

    // ------------------------------------------------------- rep-side replies
    replyToComment(quoteId, lineId, message) {
      const quote = get().getQuotation(quoteId);
      const me = get().currentUser;
      if (!quote || !me || !message?.trim()) return { ok: false };

      const lines = quote.lines.map((l) =>
        l.id === lineId
          ? {
              ...l,
              comments: [
                ...(l.comments ?? []),
                {
                  id: nextId('cm'),
                  author: me.name,
                  role: me.role,
                  message: message.trim(),
                  at: nowISO(),
                },
              ],
            }
          : l,
      );

      patchQuote(quoteId, { lines, awaitingSeller: false });
      get().logAudit({
        entityType: 'quotation',
        entityId: quoteId,
        action: `Replied to customer on ${quote.lines.find((l) => l.id === lineId)?.productName ?? 'a line'}`,
      });
      return { ok: true };
    },

    /** Applies the customer's counter-discount across all lines, then re-scores. */
    async applyCounterDiscount(quoteId) {
      const quote = get().getQuotation(quoteId);
      if (!quote || quote.counterDiscountPct == null) {
        return { ok: false, error: 'No counter-discount to apply.' };
      }

      const pct = quote.counterDiscountPct;
      const lines = quote.lines.map((l) => ({ ...l, discountPct: pct }));
      patchQuote(quoteId, { lines, awaitingSeller: false });

      get().logAudit({
        entityType: 'quotation',
        entityId: quoteId,
        action: `Applied customer's counter-discount of ${pct}% to all lines`,
        meta: { counterDiscountPct: pct },
      });

      const scored = await get().ensureRisk(quoteId);
      get().recomputeAlerts();
      return { ok: true, risk: scored.risk, path: scored.approvalPath };
    },

    // ------------------------------------------------------------- upsell
    acceptSuggestion(quoteId, productId) {
      const line = get().addLine(quoteId, productId, 1);
      if (!line) return { ok: false };
      get().logAudit({
        entityType: 'quotation',
        entityId: quoteId,
        action: `Upsell accepted: ${line.productName}`,
        meta: { source: 'upsell_panel' },
      });
      return { ok: true, line };
    },

    dismissSuggestion(quoteId, productId) {
      const quote = get().getQuotation(quoteId);
      if (!quote) return;
      if (quote.dismissedSuggestions.includes(productId)) return;
      patchQuote(
        quoteId,
        { dismissedSuggestions: [...quote.dismissedSuggestions, productId] },
        { touch: false },
      );
    },

    undoDismiss(quoteId, productId) {
      const quote = get().getQuotation(quoteId);
      if (!quote) return;
      patchQuote(
        quoteId,
        { dismissedSuggestions: quote.dismissedSuggestions.filter((id) => id !== productId) },
        { touch: false },
      );
    },

  };
}
