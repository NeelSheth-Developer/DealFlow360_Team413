import { useEffect, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import {
  Download,
  FileText,
  Info,
  Lock,
  Receipt,
  Repeat,
  ScrollText,
  Send,
  ShieldCheck,
  Wallet,
} from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import { selectBillingView, selectInvoiceForQuote } from '@/store/selectors';
import { INVOICE_STEPS, invoiceStepIndex } from '@/lib/billingEngine';
import { getInvoicePdf } from '@/services/invoicesService';
import { openPdfResult } from '@/lib/openPdf';
import { dateShort, invoiceStatusLabel, money, paymentMethodLabel, roleLabel } from '@/lib/format';
import { cn } from '@/lib/utils';
import { GlassCard, GlassPanel } from '@/components/glass/Glass';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/Button';
import { Input, Select, Textarea } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/Misc';
import { Table, TBody, TD, TFoot, TH, THead, TR } from '@/components/ui/Table';
import { StepProgress } from '@/components/shared/StepProgress';
import { StageBadge } from '@/components/shared/Indicators';
import { QuoteNav } from '@/components/quotation/QuoteNav';
import { QuoteLoading } from '@/components/quotation/QuoteLoading';
import { useQuotation } from '@/hooks/useQuotation';

const METHODS = ['bank_transfer', 'card', 'upi', 'cheque', 'other'].map((m) => ({
  value: m,
  label: paymentMethodLabel(m),
}));

/** Invoice and payment screen (spec B10). */
export default function QuotationInvoice() {
  const { id } = useParams();

  const { quote, resolving, missing } = useQuotation(id);
  const invoice = useAppStore((s) => (quote ? selectInvoiceForQuote(s, id) : null));
  const billing = useAppStore((s) => (quote ? selectBillingView(s, id) : null));
  const buildBilling = useAppStore((s) => s.buildBilling);
  const loadBilling = useAppStore((s) => s.loadBilling);
  const sendInvoice = useAppStore((s) => s.sendInvoice);
  const recordPayment = useAppStore((s) => s.recordPayment);
  const createCreditNote = useAppStore((s) => s.createCreditNote);

  const [form, setForm] = useState({
    amount: '',
    method: 'bank_transfer',
    reference: '',
    date: new Date().toISOString().slice(0, 10),
    notes: '',
  });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  // Settling money is restricted to Finance and Admin.
  const canSettle = useAppStore((s) => s.canRecordPayments());
  const currentUser = useAppStore((s) => s.currentUser);

  // The invoice and its payment ledger are server payloads. `amountPaid`,
  // `balanceRemaining` and `status` are derived there on every read, so this fetch is
  // also what keeps the balance honest after a payment.
  useEffect(() => {
    loadBilling(id);
  }, [id, loadBilling]);

  if (resolving && !quote) return <QuoteLoading />;
  if (missing || !quote) return <Navigate to="/404" replace />;

  if (!invoice) {
    return (
      <div>
        <PageHeader
          title={`Invoice — ${quote.customerName}`}
          breadcrumbs={[
            { label: 'Quotations', to: '/app/quotations' },
            { label: quote.reference ?? quote.id, to: `/app/quotations/${quote.id}` },
            { label: 'Invoice' },
          ]}
        />
        <QuoteNav quote={quote} hasInvoice={false} />
        <GlassPanel title="No invoice yet" icon={Receipt}>
          <EmptyState
            icon={Receipt}
            title="This order hasn't been invoiced"
            description="An invoice is generated once the order reaches fulfillment. You can create it now if the order is ready."
            action={
              <Button
                onClick={async () => {
                  const result = await buildBilling(id);
                  if (result.ok) toast.success('Invoice drafted');
                  else toast.error('Could not draft the invoice', { description: result.error });
                }}
              >
                Generate invoice
              </Button>
            }
          />
        </GlassPanel>
      </div>
    );
  }

  const stepIndex = invoiceStepIndex(invoice.status);
  const steps = INVOICE_STEPS.map((status, i) => ({
    key: status,
    label: invoiceStatusLabel(status),
    sublabel:
      status === 'draft'
        ? dateShort(invoice.issueDate)
        : status === 'sent'
          ? `due ${dateShort(invoice.dueDate)}`
          : status === 'partially_paid'
            ? invoice.amountPaid > 0 && invoice.balanceRemaining > 0
              ? money(invoice.amountPaid, invoice.currency)
              : ''
            : invoice.balanceRemaining <= 0
              ? 'settled'
              : '',
    state: i < stepIndex ? 'done' : i === stepIndex ? (invoice.status === 'paid' ? 'done' : 'current') : 'todo',
  }));

  const handleRecord = async () => {
    setBusy(true);
    const result = await recordPayment(invoice.id, {
      amount: Number(form.amount),
      method: form.method,
      reference: form.reference,
      date: form.date,
      notes: form.notes,
    });
    setBusy(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    // A replayed idempotency key means the original payment came back unchanged. Say so,
    // or a retry looks like it silently did nothing.
    if (result.replayed) {
      toast.info('That payment was already recorded', {
        description: 'The original entry is shown — nothing was charged twice.',
      });
    }

    setError(null);
    setForm((f) => ({ ...f, amount: '', reference: '', notes: '' }));

    if (result.status === 'paid') {
      toast.success('Invoice fully paid', {
        description: 'The order is now confirmed and the deal closed.',
      });
    } else {
      toast.success('Payment recorded', {
        description: `${money(result.balances.balanceRemaining, invoice.currency)} still outstanding.`,
      });
    }
  };

  let runningBalance = invoice.total;

  return (
    <div>
      <PageHeader
        title={`Invoice ${invoice.id}`}
        description={`${quote.customerName} · issued ${dateShort(invoice.issueDate)} · due ${dateShort(invoice.dueDate)}`}
        breadcrumbs={[
          { label: 'Quotations', to: '/app/quotations' },
          { label: quote.reference ?? quote.id, to: `/app/quotations/${quote.id}` },
          { label: 'Invoice' },
        ]}
        badge={
          <div className="flex flex-wrap items-center gap-2">
            <StageBadge stage={quote.stage} />
            <Badge
              tone={
                invoice.status === 'paid'
                  ? 'success'
                  : invoice.status === 'partially_paid'
                    ? 'warning'
                    : invoice.status === 'sent'
                      ? 'info'
                      : 'neutral'
              }
            >
              {invoiceStatusLabel(invoice.status)}
            </Badge>
          </div>
        }
        actions={
          <>
            {invoice.status === 'draft' && canSettle && (
              <Button
                size="sm"
                icon={Send}
                onClick={async () => {
                  const result = await sendInvoice(invoice.id);
                  if (result.ok) toast.success('Invoice sent to the customer');
                  else toast.error(result.error);
                }}
              >
                Send Invoice
              </Button>
            )}
            <Button
              size="sm"
              variant="secondary"
              icon={Download}
              onClick={async () => {
                /*
                 * The server renders this, not the browser. A locally generated PDF is
                 * built from whatever this tab happens to have cached, so two people
                 * could send the customer documents that disagree — and the document the
                 * customer receives has to be the one the invoice record describes.
                 */
                try {
                  openPdfResult(await getInvoicePdf(invoice.id));
                } catch (err) {
                  toast.error('Could not generate the PDF', { description: err.message });
                }
              }}
            >
              Download PDF
            </Button>
          </>
        }
      />

      <QuoteNav quote={quote} hasInvoice />

      {/* -------------------------------------------------- status stepper */}
      <GlassPanel title="Invoice status" icon={Receipt} className="mb-4">
        <StepProgress steps={steps} />
      </GlassPanel>

      <div className="grid gap-4 xl:grid-cols-[1.5fr_1fr]">
        <div className="space-y-4">
          {/* ------------------------------------------------ line items */}
          <GlassPanel
            title="One-time charges on this invoice"
            description="Recurring lines bill separately on their own schedule."
            icon={FileText}
            bodyClassName="px-0 py-0 sm:px-0"
          >
            <Table>
              <THead>
                <TR>
                  <TH>Product</TH>
                  <TH align="center">Qty</TH>
                  <TH align="right">Unit price</TH>
                  <TH align="right">Discount</TH>
                  <TH align="right">Total</TH>
                </TR>
              </THead>
              <TBody>
                {invoice.lines.map((line) => (
                  <TR key={line.lineId}>
                    <TD className="font-semibold">{line.productName}</TD>
                    <TD align="center" num>
                      {line.qty}
                    </TD>
                    <TD align="right" num>
                      {money(line.unitPrice, invoice.currency)}
                    </TD>
                    <TD align="right" num className="text-ink-soft">
                      {line.discountPct}%
                    </TD>
                    <TD align="right" num className="font-bold">
                      {money(line.total, invoice.currency)}
                    </TD>
                  </TR>
                ))}
              </TBody>
              <TFoot>
                <TR>
                  <TD colSpan={4} className="text-xs">
                    Subtotal
                  </TD>
                  <TD align="right" num className="text-xs">
                    {money(invoice.subtotal, invoice.currency)}
                  </TD>
                </TR>
                <TR>
                  <TD colSpan={4} className="text-xs">
                    Tax
                  </TD>
                  <TD align="right" num className="text-xs">
                    {money(invoice.tax, invoice.currency)}
                  </TD>
                </TR>
                <TR>
                  <TD colSpan={4} className="text-sm font-extrabold">
                    Total due
                  </TD>
                  <TD align="right" num className="text-base font-extrabold">
                    {money(invoice.total, invoice.currency)}
                  </TD>
                </TR>
              </TFoot>
            </Table>
          </GlassPanel>

          {/* ------------------------------------- hybrid billing callout */}
          {billing && billing.recurringRows.length > 0 && (
            <GlassCard className="border-l-4 border-l-accent-indigo p-4">
              <div className="flex items-start gap-2.5">
                <Repeat className="mt-0.5 h-4 w-4 shrink-0 text-accent-indigo" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold text-ink">
                    This invoice covers one-time charges only
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-ink-soft">
                    {billing.recurringRows.filter((r) => !r.cancelled).length} recurring line(s)
                    totalling {money(billing.recurringPerCycleTotal, invoice.currency)} per cycle are
                    billed on their own schedule.
                  </p>
                  <Link to={`/app/quotations/${id}/billing`}>
                    <Button size="xs" variant="secondary" className="mt-2.5">
                      View billing schedule
                    </Button>
                  </Link>
                </div>
              </div>
            </GlassCard>
          )}

          {/* --------------------------------------- payment history */}
          <GlassPanel
            title="Payment history"
            icon={ScrollText}
            bodyClassName="px-0 py-0 sm:px-0"
          >
            {invoice.payments.length === 0 ? (
              <EmptyState
                icon={Wallet}
                title="No payments recorded"
                description="Record the first payment using the form on the right."
              />
            ) : (
              <Table>
                <THead>
                  <TR>
                    <TH>Date</TH>
                    <TH align="right">Amount</TH>
                    <TH>Method</TH>
                    <TH>Reference</TH>
                    <TH>Recorded by</TH>
                    <TH align="right">Balance after</TH>
                  </TR>
                </THead>
                <TBody>
                  {invoice.payments.map((p) => {
                    runningBalance -= p.amount;
                    return (
                      <TR key={p.id}>
                        <TD className="text-xs">{dateShort(p.date)}</TD>
                        <TD align="right" num className="font-bold text-state-success">
                          {money(p.amount, invoice.currency)}
                        </TD>
                        <TD>
                          <Badge tone="neutral" size="xs">
                            {paymentMethodLabel(p.method)}
                          </Badge>
                        </TD>
                        <TD className="num text-xs text-ink-soft">{p.reference || '—'}</TD>
                        <TD className="text-xs text-ink-soft">{p.recordedByName}</TD>
                        <TD align="right" num className="text-xs">
                          {money(Math.max(0, runningBalance), invoice.currency)}
                        </TD>
                      </TR>
                    );
                  })}
                </TBody>
              </Table>
            )}
          </GlassPanel>
        </div>

        {/* ------------------------------------------------- right column */}
        <div className="space-y-4">
          <GlassCard strong className="p-5">
            <dl className="space-y-2">
              <div className="flex items-baseline justify-between">
                <dt className="text-xs text-ink-soft">Total due</dt>
                <dd className="num text-sm font-bold text-ink">
                  {money(invoice.total, invoice.currency)}
                </dd>
              </div>
              <div className="flex items-baseline justify-between">
                <dt className="text-xs text-ink-soft">Amount paid</dt>
                <dd className="num text-sm font-bold text-state-success">
                  {money(invoice.amountPaid, invoice.currency)}
                </dd>
              </div>
              <div className="flex items-baseline justify-between border-t border-brand-500/15 pt-2.5">
                <dt className="text-sm font-bold text-ink">Balance remaining</dt>
                <dd
                  className={cn(
                    'num text-2xl font-extrabold tracking-tight',
                    invoice.balanceRemaining > 0 ? 'text-state-danger' : 'text-state-success',
                  )}
                >
                  {money(invoice.balanceRemaining, invoice.currency)}
                </dd>
              </div>
            </dl>

            <div className="mt-3 rounded-xl bg-white/60 p-2.5">
              <p className="text-[11px] text-ink-muted">
                Bill to <span className="font-semibold text-ink">{invoice.customerName}</span> ·
                order <span className="num font-semibold text-brand-700">{invoice.quotationId}</span>
              </p>
            </div>
          </GlassCard>

          {/* -------------------------------------- record payment form */}
          <GlassPanel
            title="Record a payment"
            icon={Wallet}
            accent="teal"
            actions={
              canSettle ? (
                <Badge tone="success" size="xs" icon={ShieldCheck}>
                  Authorised
                </Badge>
              ) : (
                <Badge tone="neutral" size="xs" icon={Lock}>
                  Finance only
                </Badge>
              )
            }
          >
            {!canSettle ? (
              <div className="space-y-3">
                <div className="flex items-start gap-2.5 rounded-xl border border-brand-500/20 bg-brand-500/8 p-3">
                  <Lock className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" aria-hidden="true" />
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-ink">
                      {roleLabel(currentUser?.role)} cannot confirm payments
                    </p>
                    <p className="mt-1 text-xs leading-relaxed text-ink-soft">
                      Only Finance or an Admin may mark money as received. Whoever sold the deal is
                      deliberately not the person who confirms the cash arrived — that separation is
                      what makes the payment record trustworthy.
                    </p>
                  </div>
                </div>

                <div className="rounded-xl bg-white/60 p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted">
                    Outstanding balance
                  </p>
                  <p className="num mt-1 text-xl font-extrabold text-state-danger">
                    {money(invoice.balanceRemaining, invoice.currency)}
                  </p>
                  <p className="mt-1.5 text-[11px] leading-relaxed text-ink-muted">
                    Switch to the Finance role from the user menu to record a payment during a demo.
                  </p>
                </div>
              </div>
            ) : invoice.balanceRemaining <= 0 ? (
              <div className="flex items-start gap-2.5 rounded-xl bg-state-success/10 p-3">
                <Info className="mt-0.5 h-4 w-4 shrink-0 text-state-success" aria-hidden="true" />
                <p className="text-xs leading-relaxed text-ink-soft">
                  This invoice is fully settled. The order has been marked confirmed.
                </p>
              </div>
            ) : invoice.status === 'draft' ? (
              <div className="flex items-start gap-2.5 rounded-xl bg-accent-amber/10 p-3">
                <Info className="mt-0.5 h-4 w-4 shrink-0 text-accent-amber" aria-hidden="true" />
                <p className="text-xs leading-relaxed text-ink-soft">
                  Issue the invoice first. A payment can only be recorded against a sent invoice.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                <Input
                  label="Amount"
                  type="number"
                  min={0}
                  step="0.01"
                  required
                  prefix="₹"
                  className="pl-8"
                  placeholder={String(invoice.balanceRemaining)}
                  value={form.amount}
                  error={error}
                  onChange={(e) => {
                    setForm((f) => ({ ...f, amount: e.target.value }));
                    setError(null);
                  }}
                  hint={`Outstanding: ${money(invoice.balanceRemaining, invoice.currency)}`}
                />

                <Button
                  variant="ghost"
                  size="xs"
                  onClick={() => setForm((f) => ({ ...f, amount: String(invoice.balanceRemaining) }))}
                >
                  Pay full balance
                </Button>

                <Select
                  label="Method"
                  options={METHODS}
                  value={form.method}
                  onChange={(e) => setForm((f) => ({ ...f, method: e.target.value }))}
                />

                <Input
                  label="Reference / transaction id"
                  placeholder="NEFT-88213004"
                  value={form.reference}
                  onChange={(e) => setForm((f) => ({ ...f, reference: e.target.value }))}
                />

                <Input
                  label="Payment date"
                  type="date"
                  value={form.date}
                  onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                />

                <Textarea
                  label="Notes"
                  rows={2}
                  placeholder="Optional"
                  value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                />

                <Button
                  fullWidth
                  size="lg"
                  icon={Wallet}
                  loading={busy}
                  disabled={!form.amount || Number(form.amount) <= 0}
                  onClick={handleRecord}
                >
                  Record Payment
                </Button>

                <p className="text-[11px] leading-relaxed text-ink-muted">
                  Recording a payment advances the status stepper. Settling the balance in full moves
                  the order to Confirmed.
                </p>
              </div>
            )}
          </GlassPanel>

          {canSettle && (
            <GlassCard className="p-4">
              <Button
                variant="secondary"
                fullWidth
                size="sm"
                icon={ScrollText}
                onClick={async () => {
                  await createCreditNote(id, {
                    amount: Math.round(invoice.total * 0.05),
                    type: 'credit_note',
                    reason: 'Goodwill credit issued from the invoice screen.',
                  });
                  toast.success('Credit note created', {
                    description: 'Visible in the billing screen ledger and the audit trail.',
                  });
                }}
              >
                Create Credit Note
              </Button>
            </GlassCard>
          )}
        </div>
      </div>
    </div>
  );
}
