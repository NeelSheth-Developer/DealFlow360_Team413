import { useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import {
  Copy,
  ExternalLink,
  MessageSquare,
  Package,
  ShoppingCart,
  Sparkles,
  StickyNote,
} from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import {
  selectCatalogForQuote,
  selectCustomerRequests,
  selectDismissedSuggestions,
  selectSuggestions,
} from '@/store/selectors';
import { quoteTotals } from '@/lib/pricing';
import { isEditable } from '@/lib/stageMachine';
import { copyToClipboard, cn } from '@/lib/utils';
import { dateShort } from '@/lib/format';
import { GlassCard, GlassPanel } from '@/components/glass/Glass';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/Button';
import { Input, Textarea } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { StageBadge, TierBadge } from '@/components/shared/Indicators';
import { QuoteNav } from '@/components/quotation/QuoteNav';
import { CatalogPanel } from '@/components/quotation/CatalogPanel';
import { OrderLinesTable } from '@/components/quotation/OrderLinesTable';
import { UpsellPanel } from '@/components/quotation/UpsellPanel';
import { QuoteSummaryRail } from '@/components/quotation/QuoteSummaryRail';
import { CustomerRequestsDrawer } from '@/components/quotation/CustomerRequestsDrawer';

/** Quotation builder (spec B3) with the inline upsell panel (spec B5). */
export default function QuotationBuilder() {
  const { id } = useParams();
  const navigate = useNavigate();

  const quote = useAppStore((s) => s.quotations.find((q) => q.id === id));
  const plans = useAppStore((s) => s.subscriptionPlans);
  const tierCeilings = useAppStore((s) => s.tierCeilings);
  const categoryCeilings = useAppStore((s) => s.categoryCeilings);

  const catalog = useAppStore((s) => (quote ? selectCatalogForQuote(s, id) : []));
  const suggestions = useAppStore((s) => (quote ? selectSuggestions(s, id) : []));
  const dismissed = useAppStore((s) => (quote ? selectDismissedSuggestions(s, id) : []));
  const requests = useAppStore((s) =>
    quote ? selectCustomerRequests(s, id) : { threads: [], unansweredCount: 0, counter: null },
  );
  const invoice = useAppStore((s) => s.invoices.find((i) => i.quotationId === id));

  const addLine = useAppStore((s) => s.addLine);
  const updateLine = useAppStore((s) => s.updateLine);
  const removeLine = useAppStore((s) => s.removeLine);
  const setOrderDiscount = useAppStore((s) => s.setOrderDiscount);
  const setQuoteMeta = useAppStore((s) => s.setQuoteMeta);
  const submitForApproval = useAppStore((s) => s.submitForApproval);
  const sendToCustomer = useAppStore((s) => s.sendToCustomer);
  const acceptSuggestion = useAppStore((s) => s.acceptSuggestion);
  const dismissSuggestion = useAppStore((s) => s.dismissSuggestion);
  const undoDismiss = useAppStore((s) => s.undoDismiss);
  const riskFor = useAppStore((s) => s.riskFor);
  const approvalPathFor = useAppStore((s) => s.approvalPathFor);

  const [showUpsell, setShowUpsell] = useState(true);
  const [requestsOpen, setRequestsOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!quote) return <Navigate to="/404" replace />;

  const editable = isEditable(quote.stage);
  const totals = quoteTotals(quote);
  const risk = riskFor(id);
  const approvalPath = approvalPathFor(id);

  const ceilingFor = (category) => {
    const categoryCeiling = categoryCeilings[category] ?? 100;
    const tierCeiling = tierCeilings[quote.tier] ?? 100;
    return {
      ceiling: Math.min(categoryCeiling, tierCeiling),
      binding: categoryCeiling <= tierCeiling ? 'category' : 'tier',
    };
  };

  const handleAdd = (productId, planId) => {
    if (!editable) {
      toast.error('This quotation is locked', {
        description: `Lines can only be edited in Draft or Under Negotiation. Currently ${quote.stage.replace(/_/g, ' ')}.`,
      });
      return;
    }
    const line = addLine(id, productId, 1, planId);
    if (line) toast.success(`${line.productName} added`);
  };

  const handleSubmit = async () => {
    setBusy(true);
    const result = submitForApproval(id);
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
      toast.success(`Sent for ${result.path.label.toLowerCase()}`, {
        description: `Blended risk ${result.risk.score.toFixed(2)} pts · ${result.risk.violationCount} line(s) over ceiling.`,
      });
      navigate(`/app/quotations/${id}/approval`);
    }
  };

  const handleSend = () => {
    const result = sendToCustomer(id);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    const url = `${window.location.origin}/portal/${result.token}`;
    copyToClipboard(url);
    toast.success('Portal link copied to clipboard', {
      description: 'Share it with the customer, or open it in a new tab to preview.',
      action: {
        label: 'Open',
        onClick: () => window.open(`/portal/${result.token}`, '_blank', 'noopener'),
      },
    });
  };

  const handlePreview = () => {
    window.open(`/portal/${quote.portalToken}`, '_blank', 'noopener');
  };

  return (
    <div>
      <PageHeader
        title={quote.customerName}
        description={`Quotation ${quote.id} · created ${dateShort(quote.createdAt)} · valid until ${dateShort(quote.validUntil)}`}
        breadcrumbs={[{ label: 'Quotations', to: '/app/quotations' }, { label: quote.id }]}
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
          showUpsell
            ? 'xl:grid-cols-[280px_minmax(0,1fr)_300px_320px]'
            : 'xl:grid-cols-[300px_minmax(0,1fr)_340px]',
        )}
      >
        {/* --------------------------------------------------- catalog */}
        <GlassPanel
          title="Catalog"
          icon={Package}
          className="xl:sticky xl:top-24 xl:max-h-[calc(100vh-8rem)]"
          bodyClassName="flex flex-col xl:max-h-[calc(100vh-12rem)]"
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
          <GlassPanel
            title="Order lines"
            description={`${quote.lines.length} line(s) · ${totals.oneTimeCount} one-time, ${totals.recurringCount} recurring`}
            icon={ShoppingCart}
            bodyClassName="px-0 py-0 sm:px-0"
          >
            <OrderLinesTable
              quote={quote}
              plans={plans}
              ceilingFor={ceilingFor}
              editable={editable}
              onQtyChange={(lineId, qty) => updateLine(id, lineId, { qty })}
              onDiscountChange={(lineId, discountPct) =>
                updateLine(id, lineId, { discountPct: Math.max(0, Math.min(100, discountPct)) })
              }
              onPriceChange={(lineId, unitPrice) => updateLine(id, lineId, { unitPrice })}
              onRemove={(lineId) => removeLine(id, lineId)}
            />
          </GlassPanel>

          {/* ------------------------------------ order-level controls */}
          <GlassPanel title="Order-level terms" icon={StickyNote} accent="indigo">
            <div className="grid gap-3.5 sm:grid-cols-2">
              <Input
                label="Order discount"
                type="number"
                min={0}
                max={100}
                suffix="%"
                disabled={!editable}
                value={quote.orderDiscountPct}
                onChange={(e) => setOrderDiscount(id, Number(e.target.value))}
                hint="Applied on top of line discounts. Included in the risk score."
              />
              <Input
                label="Promised delivery date"
                type="date"
                disabled={!editable}
                value={quote.promisedDeliveryDate ?? ''}
                onChange={(e) => setQuoteMeta(id, { promisedDeliveryDate: e.target.value })}
                hint="Delivery slippage alerts compare against this."
              />
              <Textarea
                label="Internal notes"
                rows={3}
                disabled={!editable}
                value={quote.internalNotes}
                placeholder="Context for approvers — never shown to the customer."
                onChange={(e) => setQuoteMeta(id, { internalNotes: e.target.value })}
              />
              <Textarea
                label="Customer-visible terms"
                rows={3}
                disabled={!editable}
                value={quote.customerTerms}
                placeholder="Shown on the portal and the invoice PDF."
                onChange={(e) => setQuoteMeta(id, { customerTerms: e.target.value })}
              />
            </div>

            {quote.negotiationStatus !== 'none' && (
              <div className="mt-3.5 flex flex-wrap items-center gap-2 border-t border-brand-500/12 pt-3.5">
                <span className="text-[11px] font-semibold text-ink-muted">Portal link:</span>
                <code className="num rounded-lg bg-white/70 px-2 py-1 text-[11px] text-brand-700">
                  /portal/{quote.portalToken}
                </code>
                <Button
                  size="xs"
                  variant="ghost"
                  icon={Copy}
                  onClick={() => {
                    copyToClipboard(`${window.location.origin}/portal/${quote.portalToken}`);
                    toast.success('Link copied');
                  }}
                >
                  Copy
                </Button>
                <Button size="xs" variant="ghost" icon={ExternalLink} onClick={handlePreview}>
                  Open
                </Button>
              </div>
            )}
          </GlassPanel>
        </div>

        {/* ---------------------------------------------------- upsell */}
        {showUpsell && (
          <GlassPanel
            title="Suggestions"
            description="Ranked by co-purchase strength, promotion and margin."
            icon={Sparkles}
            accent="pink"
            className="xl:sticky xl:top-24 xl:max-h-[calc(100vh-8rem)]"
            bodyClassName="flex flex-col xl:max-h-[calc(100vh-13rem)]"
          >
            <UpsellPanel
              suggestions={suggestions}
              dismissed={dismissed}
              currency={quote.currency}
              disabled={!editable}
              onAccept={(productId) => {
                const result = acceptSuggestion(id, productId);
                if (result.ok) {
                  toast.success(`${result.line.productName} added to the quote`, {
                    description: 'Total, margin and risk updated.',
                  });
                }
              }}
              onDismiss={(productId) => dismissSuggestion(id, productId)}
              onUndoDismiss={(productId) => undoDismiss(id, productId)}
            />
          </GlassPanel>
        )}

        {/* --------------------------------------------------- summary */}
        <div className="xl:sticky xl:top-24 xl:self-start">
          <QuoteSummaryRail
            quote={quote}
            totals={totals}
            risk={risk}
            approvalPath={approvalPath}
            editable={editable}
            busy={busy}
            onSubmit={handleSubmit}
            onSaveDraft={() =>
              toast.success('Draft saved', {
                description: 'Everything you change is saved as you go in this build.',
              })
            }
            onPreviewAsCustomer={handlePreview}
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
