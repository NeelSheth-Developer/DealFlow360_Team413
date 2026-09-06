import { useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { notify, toast } from '@/lib/notify';
import {
  Building2,
  Download,
  MessageSquare,
  Package,
  ShoppingCart,
  Sparkles,
  StickyNote,
  UserCircle2,
} from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import {
  resolveTotals,
  selectCatalogForQuote,
  selectCustomerRequests,
  selectDismissedSuggestions,
} from '@/store/selectors';
import { approvalPathLabel } from '@/lib/riskEngine';
import { isEditable } from '@/lib/stageMachine';
import { cn } from '@/lib/utils';
import { dateShort } from '@/lib/format';
import { openPdfResult } from '@/lib/openPdf';
import { useRisk } from '@/hooks/useRisk';
import { useQuotation } from '@/hooks/useQuotation';
import { useUpsellSuggestions } from '@/hooks/useUpsell';
import { useBlendedPreview } from '@/hooks/useBlendedPreview';
import { GlassCard, GlassPanel } from '@/components/glass/Glass';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/Button';
import { Input, Select, Textarea } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { StageBadge, TierBadge } from '@/components/shared/Indicators';
import { QuoteNav } from '@/components/quotation/QuoteNav';
import { QuoteLoading } from '@/components/quotation/QuoteLoading';
import { CatalogPanel } from '@/components/quotation/CatalogPanel';
import { OrderLinesTable } from '@/components/quotation/OrderLinesTable';
import { UpsellPanel } from '@/components/quotation/UpsellPanel';
import { QuoteSummaryRail } from '@/components/quotation/QuoteSummaryRail';
import { CustomerRequestsDrawer } from '@/components/quotation/CustomerRequestsDrawer';

/** Quotation builder (spec B3) with the inline upsell panel (spec B5). */
export default function QuotationBuilder() {
  const { id } = useParams();
  const navigate = useNavigate();

  const { quote, resolving, missing } = useQuotation(id);
  const plans = useAppStore((s) => s.subscriptionPlans);
  const tierCeilings = useAppStore((s) => s.tierCeilings);
  const categoryCeilings = useAppStore((s) => s.categoryCeilings);

  const catalog = useAppStore((s) => (quote ? selectCatalogForQuote(s, id) : []));
  const dismissed = useAppStore((s) => (quote ? selectDismissedSuggestions(s, id) : []));
  const requests = useAppStore((s) =>
    quote ? selectCustomerRequests(s, id) : { threads: [], unansweredCount: 0, counter: null },
  );
  const invoice = useAppStore((s) => s.invoices.find((i) => i.quotationId === id));

  const addLine = useAppStore((s) => s.addLine);
  const updateLine = useAppStore((s) => s.updateLine);
  const removeLine = useAppStore((s) => s.removeLine);
  const setQuoteMeta = useAppStore((s) => s.setQuoteMeta);
  const submitForApproval = useAppStore((s) => s.submitForApproval);
  const sendToCustomer = useAppStore((s) => s.sendToCustomer);
  const acceptSuggestion = useAppStore((s) => s.acceptSuggestion);
  const dismissSuggestion = useAppStore((s) => s.dismissSuggestion);
  const undoDismiss = useAppStore((s) => s.undoDismiss);
  const assignOwner = useAppStore((s) => s.assignOwner);
  const quotationPdf = useAppStore((s) => s.quotationPdf);
  const canAssign = useAppStore((s) => s.canAssignQuotations());
  const reps = useAppStore((s) => s.users.filter((u) => ['sales_rep', 'sales_manager'].includes(u.role)));

  const [pdfBusy, setPdfBusy] = useState(false);
  const [showUpsell, setShowUpsell] = useState(true);
  const [requestsOpen, setRequestsOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  // Risk is fetched from the backend, never computed here.
  const { risk, approvalPath, isLoading: riskLoading, isFallback } = useRisk(id);

  // Ranked server-side too (POST /upsell-rules/suggest). The margin floor is a hard
  // drop, so a second local copy of the rule could put a loss-making add-on on screen.
  const {
    suggestions,
    loading: suggestionsLoading,
    error: suggestionsError,
  } = useUpsellSuggestions(id);

  // Stateless live score (POST /risk/blended-score) so the rail reacts to a typed
  // discount immediately, while the authoritative re-score is still in flight.
  const { preview } = useBlendedPreview(quote);

  // "Still loading" and "does not exist" are different answers — only the second
  // redirects. A deep link or hard refresh renders before any list has arrived.
  if (resolving && !quote) return <QuoteLoading />;
  if (missing || !quote) return <Navigate to="/404" replace />;

  const editable = isEditable(quote.stage);
  // The server computes totals from the lines on every read and they are the numbers
  // the approval screen, the invoice and the audit trail all quote. `resolveTotals`
  // lets the server win and fills in only the presentation breakdowns it does not
  // return; the bare local rollup used here before could disagree with the record.
  const totals = resolveTotals(quote);

  const ceilingFor = (category) => {
    const categoryCeiling = categoryCeilings[category] ?? 100;
    const tierCeiling = tierCeilings[quote.tier] ?? 100;
    return {
      ceiling: Math.min(categoryCeiling, tierCeiling),
      binding: categoryCeiling <= tierCeiling ? 'category' : 'tier',
    };
  };

  const handleAdd = async (productId, planId) => {
    if (!editable) {
      toast.error('This quotation is locked', {
        description: `Lines can only be edited in Draft or Under Negotiation. Currently ${quote.stage.replace(/_/g, ' ')}.`,
      });
      return;
    }
    const result = await addLine(id, productId, 1, planId);
    if (!result.ok) {
      toast.error('Could not add that line', { description: result.error });
      return;
    }
    toast.success('Line added');
  };

  const handleSubmit = async () => {
    setBusy(true);
    const result = await submitForApproval(id);
    setBusy(false);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }

    if (result.autoApproved) {
      toast.success('Auto-approved', {
        description: 'Every line was inside its ceiling. Fulfillment split is ready.',
      });
      navigate(`/app/quotations/${id}/fulfillment`);
    } else {
      // `submitForApproval` resolves to { ok, autoApproved, risk, approvers, label } —
      // there is no `path` on it, so reading `result.path.label` threw a TypeError and
      // the rep saw a crashed screen instead of the routing decision. Both the label and
      // the score are also optional in principle, so neither is dereferenced blind.
      const label = result.label ?? approvalPathLabel(result.approvers ?? []);
      const score = Number(result.risk?.score);

      toast.success(`Sent for ${String(label).toLowerCase()}`, {
        description: Number.isFinite(score)
          ? `Blended risk ${score.toFixed(2)} pts · ${result.risk.violationCount} line(s) over ceiling.`
          : 'The server has routed it to the approvers the chain requires.',
      });
      navigate(`/app/quotations/${id}/approval`);
    }
  };

  const handleDownloadPdf = async () => {
    setPdfBusy(true);
    const result = await quotationPdf(id);
    setPdfBusy(false);
    if (result.ok) openPdfResult(result);
    else toast.error('Could not open the PDF', { description: result.error });
  };

  const handleSend = async () => {
    // `sendToCustomer` is async. Without the await this read `.ok` off a Promise, which
    // is undefined — so a successful share always reported `toast.error(undefined)`.
    const result = await sendToCustomer(id);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }

    if (result.needsRegistration) {
      toast.success(`Shared with ${result.customer.name}`, {
        description: `${result.customer.contactName} has not registered yet — ask them to create an account at /customer/signup using ${result.customer.email}.`,
        duration: 8000,
      });
    } else {
      toast.success(`Shared with ${result.customer.name}`, {
        description: 'It is now visible when they sign in to their customer account.',
      });
    }
  };

  return (
    <div>
      <PageHeader
        title={quote.customerName}
        description={`Quotation ${quote.reference ?? quote.id} · created ${dateShort(quote.createdAt)} · valid until ${dateShort(quote.validUntil)}`}
        breadcrumbs={[
          { label: 'Quotations', to: '/app/quotations' },
          { label: quote.reference ?? quote.id },
        ]}
        badge={
          <div className="flex flex-wrap items-center gap-2">
            <StageBadge stage={quote.stage} />
            <TierBadge tier={quote.tier} />
            <Badge tone="neutral" size="xs">
              {quote.currency}
            </Badge>
          </div>
        }
        actions={
          <>
            {requests.threads.length > 0 || requests.counter ? (
              <Button
                variant={requests.unansweredCount > 0 ? 'warning' : 'secondary'}
                size="sm"
                icon={MessageSquare}
                onClick={() => setRequestsOpen(true)}
              >
                Customer Requests
                {requests.unansweredCount > 0 && ` (${requests.unansweredCount})`}
              </Button>
            ) : null}

            {/* §11.15. Rendered server-side with no costs, margins or risk data on it,
                so it is the document a rep can send as-is. */}
            <Button
              variant="secondary"
              size="sm"
              icon={Download}
              loading={pdfBusy}
              onClick={handleDownloadPdf}
            >
              PDF
            </Button>

            <Button
              variant={showUpsell ? 'subtle' : 'secondary'}
              size="sm"
              icon={Sparkles}
              onClick={() => setShowUpsell((v) => !v)}
            >
              Suggestions ({suggestions.length})
            </Button>
          </>
        }
      />

      <QuoteNav quote={quote} hasInvoice={Boolean(invoice)} />

      {!editable && (
        <GlassCard className="mb-4 border-accent-amber/30 bg-accent-amber/8 p-3.5">
          <p className="text-xs font-bold text-accent-amber">This quotation is read-only</p>
          <p className="mt-0.5 text-xs leading-relaxed text-ink-soft">
            Lines can only be edited while a quotation is in Draft or Under Negotiation. It is
            currently <span className="font-semibold">{quote.stage.replace(/_/g, ' ')}</span>.
          </p>
        </GlassCard>
      )}

      <div
        className={cn(
          'grid gap-4',
          /*
            Order lines is the screen's subject, so it gets the elastic column and the
            other three are pinned narrow. Previously the catalogue, the suggestion rail
            and the summary took a fixed 900px between them, leaving the table itself
            squeezed enough that product names wrapped to three lines and the totals row
            scrolled sideways.
          */
          showUpsell
            ? 'xl:grid-cols-[216px_minmax(0,1fr)_244px_276px]'
            : 'xl:grid-cols-[232px_minmax(0,1fr)_288px]',
        )}
      >
        {/* --------------------------------------------------- catalog */}
        <GlassPanel
          title="Catalog"
          icon={Package}
          /*
            THE SCROLL CHAIN, and why the previous version could not work:
             · `self-start` — a grid item defaults to `stretch`, so this column grew to
               the height of the tallest one. A sticky element that already fills its
               container has nothing to stick against.
             · `flex flex-col` + `max-h` — gives the section a real height budget and
               lets the body claim what the header does not use.
             · the body is `flex-1 min-h-0`, so the list inside it inherits a DEFINITE
               height. Before, the body had only `max-height`, and `h-full` on the child
               resolved against an indefinite parent — which computes to `auto`, so
               `overflow-y-auto` had nothing to overflow.
            `xl:` throughout because that is where the grid actually becomes columns;
            below it the layout stacks and a short scrolling box would be worse.
          */
          className="xl:sticky xl:top-24 xl:flex xl:max-h-[calc(100vh-7rem)] xl:flex-col xl:self-start"
          bodyClassName="flex min-h-0 flex-col xl:flex-1 xl:overflow-hidden"
        >
          <CatalogPanel
            items={catalog}
            currency={quote.currency}
            onAdd={handleAdd}
            disabled={!editable}
          />
        </GlassPanel>

        {/* ----------------------------------------------- order lines */}
        <div className="min-w-0 space-y-4">
          {/*
            THE SUBJECT OF THE SCREEN, and now weighted like it.

            The three side columns are pinned as narrow as their content allows so this
            one keeps every remaining pixel, and `strong` + the accent edge lift it out of
            the row of equal-looking glass panels it used to sit in.
          */}
          <GlassPanel
            strong
            title="Order lines"
            description={`${quote.lines.length} line(s) · ${totals.oneTimeCount} one-time, ${totals.recurringCount} recurring`}
            icon={ShoppingCart}
            className="border-l-4 border-l-brand-500 shadow-glass-strong"
            bodyClassName="px-0 py-0 sm:px-0"
          >
            <OrderLinesTable
              quote={quote}
              plans={plans}
              ceilingFor={ceilingFor}
              editable={editable}
              /* A rejected line edit — 409 STAGE_LOCKED being the common one — used to
                 revert silently, so the field simply snapped back with no explanation. */
              onQtyChange={async (lineId, qty) => {
                const r = await updateLine(id, lineId, { qty });
                if (!r.ok) notify.report(r, null, 'Could not update the quantity');
              }}
              onDiscountChange={async (lineId, discountPct) => {
                const r = await updateLine(id, lineId, {
                  discountPct: Math.max(0, Math.min(100, discountPct)),
                });
                if (!r.ok) notify.report(r, null, 'Could not update the discount');
              }}
              onPriceChange={async (lineId, unitPrice) => {
                const r = await updateLine(id, lineId, { unitPrice });
                if (!r.ok) notify.report(r, null, 'Could not update the price');
              }}
              onRemove={async (lineId) => {
                const r = await removeLine(id, lineId);
                notify.report(r, { title: 'Line removed' }, 'Could not remove the line');
              }}
            />
          </GlassPanel>

          {/* ------------------------------------ order-level controls */}
          <GlassPanel title="Order-level terms" icon={StickyNote} accent="indigo">
            {/*
              EVERY FIELD HERE COMMITS ON BLUR, not on change.

              These were wired straight to the store, so each one PATCHed the quotation on
              every keystroke: typing a paragraph of internal notes fired a request per
              character, and the value that stuck was whichever response landed last —
              routinely a truncated prefix of what was typed. That is the "I saved it and
              the backend didn't update" case on this screen.

              The order discount additionally re-scores risk and rewrites every line's
              effective discount server-side, so per-keystroke was expensive as well as
              wrong.
            */}
            {/*
              ORDER DISCOUNT IS NOT EDITED HERE.

              Removed at the product owner's direction. It stays on the record — the
              summary rail still shows the amount it takes off, and it is still part of
              the blended risk score — but this card no longer offers it as a field.
              `PATCH /quotations/:id` still accepts `orderDiscountPct`, so nothing about
              the API changed; the control is simply gone from this surface.
            */}
            <div className="grid gap-3.5 sm:grid-cols-2">
              <Input
                label="Promised delivery date"
                type="date"
                disabled={!editable}
                defaultValue={quote.promisedDeliveryDate ?? ''}
                onBlur={async (e) => {
                  const next = e.target.value || null;
                  if (next === (quote.promisedDeliveryDate ?? null)) return;
                  const r = await setQuoteMeta(id, { promisedDeliveryDate: next });
                  if (!r.ok) notify.report(r, null, 'Could not save the delivery date');
                }}
                hint="Delivery slippage alerts compare against this."
              />
              <Textarea
                label="Internal notes"
                rows={3}
                disabled={!editable}
                defaultValue={quote.internalNotes ?? ''}
                placeholder="Context for approvers — never shown to the customer."
                onBlur={async (e) => {
                  if (e.target.value === (quote.internalNotes ?? '')) return;
                  const r = await setQuoteMeta(id, { internalNotes: e.target.value });
                  if (!r.ok) notify.report(r, null, 'Could not save the notes');
                }}
              />
              <Textarea
                label="Customer-visible terms"
                rows={3}
                disabled={!editable}
                defaultValue={quote.customerTerms ?? ''}
                placeholder="Shown on the portal and the invoice PDF."
                onBlur={async (e) => {
                  if (e.target.value === (quote.customerTerms ?? '')) return;
                  const r = await setQuoteMeta(id, { customerTerms: e.target.value });
                  if (!r.ok) notify.report(r, null, 'Could not save the terms');
                }}
              />
            </div>

            <div className="mt-3.5 grid gap-3.5 border-t border-brand-500/12 pt-3.5 sm:grid-cols-2">
              <div>
                <p className="mb-1 text-xs font-semibold text-ink-soft">Assigned customer</p>
                <div className="flex items-center gap-2 rounded-xl bg-white/60 px-3 py-2">
                  <Building2 className="h-3.5 w-3.5 shrink-0 text-accent-teal" aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate text-xs font-bold text-ink">
                    {quote.customerName}
                  </span>
                  <TierBadge tier={quote.tier} showIcon={false} />
                </div>
                <p className="mt-1 text-[11px] text-ink-muted">
                  Set at creation. Start a new quotation to bill a different customer.
                </p>
              </div>

              <div>
                {canAssign ? (
                  <Select
                    label="Owning rep"
                    value={quote.ownerId}
                    onChange={async (e) => {
                      const result = await assignOwner(id, e.target.value);
                      if (result.ok) {
                        toast.success(`Reassigned to ${result.owner.name}`);
                      } else {
                        toast.error(result.error);
                      }
                    }}
                    // `team` is null for an unassigned rep (§3.1), which printed
                    // "Priya Sharma · null" in the picker.
                    options={reps.map((u) => ({
                      value: u.id,
                      label: u.team ? `${u.name} · ${u.team}` : u.name,
                    }))}
                    hint="Only an Admin or Sales Manager can reassign."
                  />
                ) : (
                  <>
                    <p className="mb-1 text-xs font-semibold text-ink-soft">Owning rep</p>
                    <div className="flex items-center gap-2 rounded-xl bg-white/60 px-3 py-2">
                      <UserCircle2
                        className="h-3.5 w-3.5 shrink-0 text-brand-600"
                        aria-hidden="true"
                      />
                      <span className="truncate text-xs font-bold text-ink">{quote.ownerName}</span>
                    </div>
                    <p className="mt-1 text-[11px] text-ink-muted">
                      Ask a Sales Manager to reassign this deal.
                    </p>
                  </>
                )}
              </div>
            </div>
          </GlassPanel>
        </div>

        {/* ---------------------------------------------------- upsell */}
        {showUpsell && (
          <GlassPanel
            title="Suggestions"
            description="Ranked by co-purchase strength, promotion and margin."
            icon={Sparkles}
            accent="pink"
            className="xl:sticky xl:top-24 xl:flex xl:max-h-[calc(100vh-7rem)] xl:flex-col xl:self-start"
            bodyClassName="flex min-h-0 flex-col xl:flex-1 xl:overflow-hidden"
          >
            <UpsellPanel
              suggestions={suggestions}
              dismissed={dismissed}
              loading={suggestionsLoading}
              error={suggestionsError}
              currency={quote.currency}
              disabled={!editable}
              onAccept={async (productId) => {
                // Await, and read the name from the suggestion we already have: the
                // action resolves to { ok, quotation }, so `result.line.productName`
                // threw — and without the await it threw on a Promise every time.
                const name =
                  suggestions.find((s) => s.productId === productId)?.productName ?? 'Product';
                const result = await acceptSuggestion(id, productId);
                if (result.ok) {
                  toast.success(`${name} added to the quote`, {
                    description: 'Total, margin and risk updated.',
                  });
                } else {
                  toast.error('Could not add that suggestion', { description: result.error });
                }
              }}
              onDismiss={async (productId) => {
                const r = await dismissSuggestion(id, productId);
                if (!r.ok) notify.report(r, null, 'Could not dismiss that suggestion');
              }}
              onUndoDismiss={(productId) => undoDismiss(id, productId)}
            />
          </GlassPanel>
        )}

        {/* --------------------------------------------------- summary */}
        <div className="xl:sticky xl:top-24 xl:max-h-[calc(100vh-7rem)] xl:self-start xl:overflow-y-auto xl:overscroll-contain">
          <QuoteSummaryRail
            quote={quote}
            totals={totals}
            risk={risk}
            approvalPath={approvalPath}
            editable={editable}
            busy={busy}
            riskLoading={riskLoading}
            riskIsFallback={isFallback}
            preview={preview}
            onSubmit={handleSubmit}
            onSendToCustomer={handleSend}
          />
        </div>
      </div>

      <CustomerRequestsDrawer
        open={requestsOpen}
        onOpenChange={setRequestsOpen}
        quote={quote}
        requests={requests}
        editable={editable}
      />
    </div>
  );
}
