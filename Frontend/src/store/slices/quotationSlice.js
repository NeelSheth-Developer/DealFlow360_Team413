import * as quotationsApi from '@/services/quotationsService';
import * as approvalsApi from '@/services/approvalsService';

/**
 * Quotations and approvals — API-REFERENCE §11 and §12.
 *
 * EVERY MUTATION IS A SERVER CALL, AND THE SERVER'S RESPONSE IS THE NEW TRUTH. Most
 * §11 endpoints return the FULL updated quotation, so `absorb()` writes it straight into
 * the list. Nothing is patched optimistically: the server recomputes totals, may bump
 * the stage, and may reject the change outright, and guessing at any of that locally is
 * how a UI ends up disagreeing with the record.
 *
 * WHAT THIS SLICE NO LONGER DOES, because the server owns it:
 *  · resolve unit prices          — POST /lines does it from the tier price list
 *  · compute totals or margin     — returned in `quotation.totals`
 *  · score risk or pick approvers — POST /submit-approval re-scores and routes
 *  · validate stage transitions   — POST /stage enforces the graph and its three gates
 *  · write audit entries          — the server audits every action in this file
 *  · generate references          — the server assigns "Q-1042"
 *
 * IDS: routes take the uuid `id`. `reference` is display-only.
 */
export function createQuotationSlice(set, get) {
  /** Insert or replace a quotation returned by the API. */
  function absorb(quotation) {
    if (!quotation?.id) return null;
    set((state) => {
      const exists = state.quotations.some((q) => q.id === quotation.id);
      return {
        quotations: exists
          ? state.quotations.map((q) => (q.id === quotation.id ? quotation : q))
          : [quotation, ...state.quotations],
      };
    });
    /**
     * NO `invalidateRisk` HERE, deliberately.
     *
     * It used to drop this quotation's cached score on every absorb, on the grounds that
     * the lines may have moved. That was both redundant and destructive:
     *
     *  · REDUNDANT — `riskInputKey` already fingerprints the line ids, quantities, unit
     *    prices, discounts, categories, the order discount and the ceilings. If any of
     *    those actually changed, `useRisk`'s effect re-runs on its own and refetches.
     *  · DESTRUCTIVE — deleting the entry does not schedule a replacement. `useRisk`
     *    only re-runs when `inputKey` changes, and a plain re-read of the same quotation
     *    leaves the key identical. So the sequence on every detail screen was: score
     *    arrives and renders → `useQuotation`'s fetch resolves → absorb wipes the entry →
     *    the effect does not re-run → the gauge and the whole "Why this needs review"
     *    breakdown fall back to PENDING_RISK and sit at ₹0 / 0.00 forever.
     *
     * That is what made the risk table appear and then empty itself a moment later.
     * Staleness is the fingerprint's job; this function's job is only to store the row.
     */
    return quotation;
  }

  /** Uniform failure shape. `error.message` is written for a salesperson — show it. */
  function fail(error) {
    return { ok: false, error: error.message, code: error.code ?? null };
  }

  return {
    quotationsLoading: false,
    quotationsMeta: null,
    quotationsError: null,

    /* --------------------------------------------------------------- reads */

    /**
     * Load the list. Filters map straight onto the query in §11.1.
     *
     * A sales_rep never sees another rep's DRAFTS — the server enforces that and
     * returns 404 rather than 403 for a direct fetch, so nothing is needed here.
     */
    async loadQuotations(filters = {}) {
      set({ quotationsLoading: true, quotationsError: null });
      try {
        // Every page, walked in order. This used to ask for `pageSize: 100` in one
        // request, which this route answers with a 500 every time — it loads every line,
        // comment and approval step per row — so the store was left empty and every
        // board, list and pipeline total rendered as if there were no deals at all.
        //
        // Each page is written as it lands. The walk takes a few seconds end to end, and
        // holding the whole thing back would trade one blank screen for a shorter one;
        // painting incrementally means the first rows are usable while the rest arrive.
        const { items, meta } = await quotationsApi.listAllQuotations(filters, {
          onPage: (soFar) => set({ quotations: soFar }),
        });
        set({ quotations: items, quotationsMeta: meta });
        return { ok: true, items };
      } catch (error) {
        set({ quotationsError: error.message });
        return fail(error);
      } finally {
        set({ quotationsLoading: false });
      }
    },

    /** Synchronous cache read. Call `fetchQuotation` when it may be missing. */
    getQuotation(id) {
      return get().quotations.find((q) => q.id === id) ?? null;
    },

    /** Fetch one quotation and merge it in. Needed on a deep link or hard refresh. */
    async fetchQuotation(id) {
      try {
        const quotation = await quotationsApi.getQuotation(id);
        absorb(quotation);
        return { ok: true, quotation };
      } catch (error) {
        return fail(error);
      }
    },

    /* ------------------------------------------------------------ creation */

    /**
     * The customer must already exist — there is no create-customer-inline path.
     *
     * A sales_rep may only own it themselves; admin and sales_manager may assign to any
     * rep or manager, never to finance. Omit `ownerId` to own it.
     */
    async createQuotation(customerId, ownerId = null) {
      try {
        const quotation = await quotationsApi.createQuotation({ customerId, ownerId });
        absorb(quotation);
        return { ok: true, quotation };
      } catch (error) {
        return fail(error);
      }
    },

    /* --------------------------------------------------------------- lines */

    /**
     * Add a line. No price is sent — the server resolves it from the tier price list.
     *
     * Adding a product already present with the same plan increments the quantity
     * server-side rather than creating a second row.
     */
    async addLine(quoteId, productId, qty = 1, planId = null) {
      try {
        const quotation = await quotationsApi.addLine(quoteId, { productId, qty, planId });
        absorb(quotation);
        return { ok: true, quotation };
      } catch (error) {
        return fail(error);
      }
    },

    /**
     * Patch qty, discountPct or unitPrice.
     *
     * Only permitted while draft or under_negotiation — anything else is
     * 409 STAGE_LOCKED, which would let a rep move the terms out from under an approval
     * already given.
     */
    async updateLine(quoteId, lineId, patch) {
      try {
        const quotation = await quotationsApi.updateLine(quoteId, lineId, patch);
        absorb(quotation);
        return { ok: true, quotation };
      } catch (error) {
        return fail(error);
      }
    },

    async removeLine(quoteId, lineId) {
      try {
        const quotation = await quotationsApi.removeLine(quoteId, lineId);
        absorb(quotation);
        return { ok: true, quotation };
      } catch (error) {
        return fail(error);
      }
    },

    /**
     * Order-level discount. Moves every line's effective discount at once, so the
     * server audits it as the governance event it is.
     */
    async setOrderDiscount(quoteId, pct) {
      try {
        const quotation = await quotationsApi.updateQuotation(quoteId, {
          orderDiscountPct: Number(pct) || 0,
        });
        absorb(quotation);
        return { ok: true, quotation };
      } catch (error) {
        return fail(error);
      }
    },

    /** Notes, terms and dates. Any subset of the §11.4 fields. */
    async setQuoteMeta(quoteId, patch) {
      try {
        const quotation = await quotationsApi.updateQuotation(quoteId, patch);
        absorb(quotation);
        return { ok: true, quotation };
      } catch (error) {
        return fail(error);
      }
    },

    /* ------------------------------------------------------------ approval */

    /**
     * Submit. The server re-scores from live line data and resolves the chain from
     * stored config — the request body is empty precisely so the client cannot
     * influence the route.
     *
     * @returns {{ok, autoApproved, risk, approvers, label}} `autoApproved` means every
     *   line sat inside its ceiling and the stage went straight to `approved`.
     */
    async submitForApproval(quoteId) {
      try {
        const result = await approvalsApi.submitForApproval(quoteId);
        absorb(result.quotation);
        return {
          ok: true,
          autoApproved: Boolean(result.autoApproved),
          risk: result.risk,
          approvers: result.approvers ?? [],
          label: result.label,
        };
      } catch (error) {
        return fail(error);
      }
    },

    /**
     * Approve the current step. Only the first pending step is actionable, so Finance
     * cannot sign off before the Manager. An admin may unblock any step.
     *
     * @returns {{ok, complete, nextRole}}
     */
    async approveStep(quoteId, comment = null) {
      try {
        const result = await approvalsApi.approveStep(quoteId, comment);
        absorb(result.quotation);
        return {
          ok: true,
          complete: Boolean(result.complete),
          nextRole: result.nextRole ?? null,
        };
      } catch (error) {
        return fail(error);
      }
    },

    /** Reason required, min 10 chars. stage → lost, later steps → skipped. */
    async rejectQuote(quoteId, reason) {
      try {
        const result = await approvalsApi.rejectQuotation(quoteId, reason);
        absorb(result.quotation ?? result);
        return { ok: true };
      } catch (error) {
        return fail(error);
      }
    },

    /**
     * Return for revision. Reason required, min 10 chars.
     *
     * stage → draft and the chain is DELETED, not marked returned — so a resubmission
     * re-scores from scratch and a worse quotation cannot ride an approval given for a
     * better one.
     */
    async returnForRevision(quoteId, reason) {
      try {
        const result = await approvalsApi.returnQuotation(quoteId, reason);
        absorb(result.quotation ?? result);
        return { ok: true };
      } catch (error) {
        return fail(error);
      }
    },

    /**
     * My queue — only quotations whose CURRENT step matches my role.
     *
     * `approvalQueue` starts as an empty array rather than undefined so the screen can
     * distinguish "loaded, nothing waiting" from "not fetched yet" using
     * `approvalQueueLoading`, and never renders `undefined.length`.
     */
    approvalQueue: [],
    approvalQueueLoading: false,
    approvalQueueError: null,

    async loadApprovalQueue() {
      set({ approvalQueueLoading: true, approvalQueueError: null });
      try {
        const queue = await approvalsApi.fetchApprovalQueue();
        set({ approvalQueue: queue });
        return { ok: true, queue };
      } catch (error) {
        set({ approvalQueueError: error.message });
        return fail(error);
      } finally {
        set({ approvalQueueLoading: false });
      }
    },

    /* --------------------------------------------------------------- stage */

    /**
     * Move stage. The server enforces the transition graph plus three extra gates
     * (`→ approved` needs no pending step, `→ fulfillment` needs a shippable line,
     * `billed → confirmed` is driven by full payment).
     *
     * On refusal it returns 409 with a message written for a salesperson, so pass
     * `error` through to the toast unchanged rather than composing your own.
     */
    async moveStage(quoteId, toStage) {
      try {
        const quotation = await quotationsApi.setStage(quoteId, toStage);
        absorb(quotation);
        return { ok: true, quotation };
      } catch (error) {
        return fail(error);
      }
    },

    /** Reason required, min 5 chars. A confirmed order cannot be marked lost. */
    async markLost(quoteId, reason) {
      try {
        const quotation = await quotationsApi.markLost(quoteId, reason);
        absorb(quotation);
        return { ok: true };
      } catch (error) {
        return fail(error);
      }
    },

    /* -------------------------------------------------- sharing, ownership */

    /**
     * Send to the customer.
     *
     * THERE IS NO LINK AND NO TOKEN — the server emails them and access is by
     * authenticated account only. `needsRegistration` means the email asked them to
     * sign up with that address, so the UI should say so rather than offering a link.
     *
     * @returns {{ok, quotation, customer, needsRegistration}}
     */
    async sendToCustomer(quoteId) {
      try {
        const result = await quotationsApi.shareQuotation(quoteId);
        absorb(result.quotation);
        return {
          ok: true,
          quotation: result.quotation,
          customer: result.customer,
          needsRegistration: Boolean(result.needsRegistration),
        };
      } catch (error) {
        return fail(error);
      }
    },

    /** Admin / sales_manager only. The target must be a rep or manager, never finance. */
    async assignOwner(quoteId, ownerId) {
      try {
        const quotation = await quotationsApi.setOwner(quoteId, ownerId);
        absorb(quotation);
        return { ok: true, owner: { id: quotation.ownerId, name: quotation.ownerName } };
      } catch (error) {
        return fail(error);
      }
    },

    /* --------------------------------------------------------- negotiation */

    /** Reply on a line thread. Clears `awaitingSeller` and emails the customer. */
    async replyToComment(quoteId, lineId, message) {
      try {
        const quotation = await quotationsApi.addLineComment(quoteId, lineId, message);
        absorb(quotation);
        return { ok: true, quotation };
      } catch (error) {
        return fail(error);
      }
    },

    /**
     * Accept the customer's counter on every line, then re-score.
     *
     * Returns the new risk alongside the quotation so the rep sees immediately what
     * accepting would cost them in approvals — which is the decision they are making.
     * 409 NO_COUNTER_PROPOSED when the customer has not proposed one.
     */
    async applyCounterDiscount(quoteId) {
      try {
        const result = await quotationsApi.applyCounter(quoteId);
        absorb(result.quotation);
        return { ok: true, risk: result.risk };
      } catch (error) {
        return fail(error);
      }
    },

    /* --------------------------------------------------------------- upsell */

    /** Add a suggested product. The server resolves its price and any default plan. */
    async acceptSuggestion(quoteId, productId) {
      try {
        const quotation = await quotationsApi.addLine(quoteId, { productId, qty: 1 });
        absorb(quotation);
        return { ok: true, quotation };
      } catch (error) {
        return fail(error);
      }
    },

    /**
     * The quotation as a customer-facing PDF — §11.15.
     *
     * The endpoint and its service function both existed; nothing called them, so a rep
     * had no way to produce the document they actually send. The render strips costs,
     * margins and every risk figure server-side, so this is safe to hand to a customer
     * directly.
     *
     * Resolves to `{ ok, url, hosted, revoke }` — `api.pdf` normalises the hosted-URL and
     * streamed-bytes shapes, and `openPdfResult` revokes the object URL when it was a
     * blob.
     */
    async quotationPdf(quoteId) {
      try {
        return { ok: true, ...(await quotationsApi.getQuotationPdf(quoteId)) };
      } catch (error) {
        return fail(error);
      }
    },

    /** Stops the suggestion resurfacing on this quotation. Idempotent server-side. */
    async dismissSuggestion(quoteId, productId) {
      try {
        const quotation = await quotationsApi.dismissSuggestion(quoteId, productId);
        absorb(quotation);
        return { ok: true };
      } catch (error) {
        return fail(error);
      }
    },

    /**
     * Undo a dismissal.
     *
     * NOT SUPPORTED BY THE API. `POST /dismiss-suggestion` only adds to
     * `dismissedSuggestions`; there is no route that removes an entry. Reported so the
     * UI can disable the control rather than silently doing nothing.
     *
     * See the missing-endpoint list: DELETE /quotations/:id/dismiss-suggestion.
     */
    async undoDismiss() {
      return {
        ok: false,
        error: 'Restoring a dismissed suggestion is not supported by the API yet.',
        code: 'NOT_IMPLEMENTED',
      };
    },
  };
}
