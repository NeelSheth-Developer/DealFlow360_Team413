import { makeToken, nextId, nowISO, addDaysISO } from '@/lib/utils';
import { roleLabel, stageLabel } from '@/lib/format';
import { tierPrice } from '@/lib/pricing';
import {
  approvalPathLabel,
  buildApprovalSteps,
  computeBlendedRisk,
  currentPendingStep,
  resolveApprovalPath,
} from '@/lib/riskEngine';
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
    createQuotation(customerId) {
      const customer = get().customers.find((c) => c.id === customerId);
      const me = get().currentUser;
      if (!customer || !me) return null;

      const quotation = {
        id: nextQuoteNumber(),
        customerId: customer.id,
        customerName: customer.name,
        tier: customer.tier,
        currency: customer.currency,
        ownerId: me.id,
        ownerName: me.name,
        stage: 'draft',
        lines: [],
        orderDiscountPct: 0,
        approvalSteps: [],
        portalToken: makeToken(`${customer.name}${Date.now()}`),
        negotiationStatus: 'none',
        awaitingSeller: false,
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
        action: 'Quotation created',
        meta: { customer: customer.name, tier: customer.tier },
      });
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
    /** Live risk for a quotation using current configuration. */
    riskFor(quoteId) {
      const quote = get().getQuotation(quoteId);
      if (!quote) return null;
      return computeBlendedRisk(
        quote.lines,
        get().categoryCeilings,
        get().tierCeilings[quote.tier] ?? 0,
        quote.orderDiscountPct,
      );
    },

    approvalPathFor(quoteId) {
      const risk = get().riskFor(quoteId);
      if (!risk) return { approvers: [], label: 'Auto-approve', ruleId: null };
      return resolveApprovalPath(risk, get().approvalChain);
    },

    /**
     * Routes the quotation. Empty approver list means it auto-approves — the rep
     * never has to request approval, and never gets to skip it either.
     */
    submitForApproval(quoteId) {
      const quote = get().getQuotation(quoteId);
      if (!quote) return { ok: false, error: 'Quotation not found.' };
      if (!quote.lines.length) return { ok: false, error: 'Add at least one line first.' };

      const risk = get().riskFor(quoteId);
      const path = get().approvalPathFor(quoteId);

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

    /** Generates/reveals the portal link and marks the quote as sent. */
    sendToCustomer(quoteId) {
      const quote = get().getQuotation(quoteId);
      if (!quote) return { ok: false, error: 'Quotation not found.' };
      if (!quote.lines.length) return { ok: false, error: 'Add at least one line first.' };

      const token = quote.portalToken || makeToken(quote.id);

      patchQuote(quoteId, {
        stage: quote.stage === 'draft' ? 'sent' : quote.stage,
        negotiationStatus: 'sent',
        awaitingSeller: false,
        portalToken: token,
      });

      get().logAudit({
        entityType: 'quotation',
        entityId: quoteId,
        action: 'Sent to customer portal',
        meta: { token },
      });

      return { ok: true, token, url: `/portal/${token}` };
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
    applyCounterDiscount(quoteId) {
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

      const risk = get().riskFor(quoteId);
      get().recomputeAlerts();
      return { ok: true, risk, path: get().approvalPathFor(quoteId) };
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

    // -------------------------------------------------------------- helpers
    approvalLabelFor(quoteId) {
      return approvalPathLabel(get().approvalPathFor(quoteId).approvers);
    },
  };
}
