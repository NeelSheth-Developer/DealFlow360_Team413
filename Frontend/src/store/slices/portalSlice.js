import { nextId, nowISO } from '@/lib/utils';
import { toPortalView } from '@/lib/portalView';
import { buildApprovalSteps, currentPendingStep } from '@/lib/riskEngine';
import { canTransition } from '@/lib/stageMachine';

/**
 * Customer portal actions (spec B8).
 *
 * Every read goes through `toPortalView`, which is an allow-list — cost prices,
 * margins, risk scores, ceilings, internal notes and approval detail are never
 * included in what the portal receives.
 *
 * `portalConfirm` contains the branch the spec insists must be automatic: if the
 * negotiated terms now exceed the thresholds, the quotation re-enters the
 * approval flow on its own, with no rep action required.
 */
export function createPortalSlice(set, get) {
  function findByToken(token) {
    return get().quotations.find((q) => q.portalToken === token) ?? null;
  }

  function customerActor(quote) {
    const customer = get().customers.find((c) => c.id === quote.customerId);
    return {
      id: quote.customerId,
      name: customer?.contactName || quote.customerName,
      role: 'customer',
    };
  }

  return {
    /** The only read path the portal is allowed to use. */
    portalGetQuote(token) {
      const quote = findByToken(token);
      if (!quote) return null;
      return toPortalView(quote, {
        products: get().products,
        plans: get().subscriptionPlans,
      });
    },

    portalQuoteExists(token) {
      return Boolean(findByToken(token));
    },

    /** Demo helper for the portal login screen — seeded links to try. */
    portalDemoLinks() {
      return get()
        .quotations.filter((q) => q.portalToken && !['lost'].includes(q.stage))
        .slice(0, 6)
        .map((q) => ({
          token: q.portalToken,
          customerName: q.customerName,
          reference: q.id,
          status: q.negotiationStatus,
        }));
    },

    portalAddComment(token, lineId, message) {
      const quote = findByToken(token);
      if (!quote || !message?.trim()) return { ok: false };

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

      return { ok: true };
    },

    /** Customer submits comments plus an optional counter-discount. */
    portalSubmitRequest(token, { counterDiscountPct = null, justification = '' } = {}) {
      const quote = findByToken(token);
      if (!quote) return { ok: false, error: 'This quotation link is no longer valid.' };

      const actor = customerActor(quote);
      const pct = counterDiscountPct == null || counterDiscountPct === '' ? null : Number(counterDiscountPct);

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
        action:
          pct == null
            ? 'Customer submitted a change request'
            : `Counter-discount requested: ${pct}%`,
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
     * Customer confirms. Re-scores the FINAL terms and branches:
     *  - over threshold -> back into the approval chain automatically
     *  - within limits   -> confirmed, straight to fulfillment
     */
    portalConfirm(token) {
      const quote = findByToken(token);
      if (!quote) return { ok: false, error: 'This quotation link is no longer valid.' };

      const actor = customerActor(quote);
      const risk = get().riskFor(quote.id);
      const path = get().approvalPathFor(quote.id);

      if (path.approvers.length > 0) {
        const check = canTransition(quote.stage, 'pending_approval', quote);
        if (!check.ok) return { ok: false, error: check.reason };

        set((state) => ({
          quotations: state.quotations.map((q) =>
            q.id === quote.id
              ? {
                  ...q,
                  stage: 'pending_approval',
                  approvalSteps: buildApprovalSteps(path.approvers),
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
          reason: `Final terms score ${risk.score.toFixed(2)} pts (${risk.violationCount} line(s) over ceiling), requiring ${path.label}.`,
          meta: { blendedScore: risk.score, approvers: path.approvers },
          actor,
        });

        get().notifyRole({
          role: path.approvers[0],
          type: 'approval_request',
          title: `${quote.id} re-entered approval after negotiation`,
          body: `${quote.customerName} confirmed at terms scoring ${risk.score.toFixed(2)} pts.`,
          link: `/app/quotations/${quote.id}/approval`,
        });

        get().notify({
          userId: quote.ownerId,
          type: 'negotiation',
          title: `${quote.customerName} confirmed ${quote.id}`,
          body: `Terms exceeded thresholds, so it went to ${path.label} automatically.`,
          link: `/app/quotations/${quote.id}/approval`,
        });

        get().recomputeAlerts();
        return { ok: true, reapproval: true, risk, path };
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
      return { ok: true, reapproval: false, risk, path };
    },

    /** True when the current pending step is the last one in the chain. */
    portalPendingApprover(token) {
      const quote = findByToken(token);
      if (!quote) return null;
      return currentPendingStep(quote);
    },
  };
}
