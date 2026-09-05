import { useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import {
  AlertTriangle,
  ArrowLeft,
  CalendarClock,
  CheckCircle2,
  CircleDot,
  Info,
  MessageSquare,
  Percent,
  Repeat,
  Send,
  ShieldCheck,
} from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import { useCustomerQuote } from '@/hooks/useCustomerQuotes';
import { CUSTOMER_STATUS_META } from '@/lib/customerView';
import { cadenceAdverb, dateShort, money, percent } from '@/lib/format';
import { cn } from '@/lib/utils';
import { GlassCard, GlassPanel } from '@/components/glass/Glass';
import { Button } from '@/components/ui/Button';
import { Input, Textarea } from '@/components/ui/Input';
import { Badge, RawBadge } from '@/components/ui/Badge';
import { ConfirmDialog } from '@/components/shared/Dialogs';
import { ChatThread } from '@/components/customer/ChatThread';

const NOTE_TONE = {
  info: 'border-state-info/30 bg-state-info/10 text-state-info',
  warning: 'border-accent-amber/35 bg-accent-amber/12 text-accent-amber',
  success: 'border-state-success/30 bg-state-success/10 text-state-success',
  danger: 'border-state-danger/30 bg-state-danger/10 text-state-danger',
};

/**
 * Customer negotiation screen.
 *
 * Everything rendered comes from a `toCustomerView` projection scoped to the
 * signed-in customer — cost prices, margins, risk scores, ceilings, rep notes and
 * approval detail are absent from that object entirely.
 */
export default function CustomerQuotationDetail() {
  const { id } = useParams();
  const navigate = useNavigate();

  const view = useCustomerQuote(id);
  const customerAddComment = useAppStore((s) => s.customerAddComment);
  const customerSubmitRequest = useAppStore((s) => s.customerSubmitRequest);
  const customerConfirm = useAppStore((s) => s.customerConfirm);

  const [openThread, setOpenThread] = useState(null);
  const [counterPct, setCounterPct] = useState('');
  const [justification, setJustification] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  // Not this customer's quotation, or not shared with them yet.
  if (!view) return <Navigate to="/customer/quotations" replace />;

  const status = CUSTOMER_STATUS_META[view.stage] ?? CUSTOMER_STATUS_META.sent;

  const handleSend = (lineId) => async (message) => {
    const result = customerAddComment(id, lineId, message);
    if (result.ok) {
      toast.success('Message sent', { description: 'Your account manager has been notified.' });
    } else {
      toast.error(result.error);
    }
    return result;
  };

  const handleSubmitRequest = () => {
    if (!counterPct && !justification.trim()) {
      toast.error('Add a discount request or a note first.');
      return;
    }
    setBusy(true);
    const result = customerSubmitRequest(id, {
      counterDiscountPct: counterPct === '' ? null : Number(counterPct),
      justification: justification.trim(),
    });
    setBusy(false);

    if (result.ok) {
      setCounterPct('');
      setJustification('');
      toast.success('Request submitted', {
        description: 'We will review your terms and respond shortly.',
      });
    } else {
      toast.error(result.error);
    }
  };

  const handleConfirm = async () => {
    setBusy(true);
    const result = await customerConfirm(id);
    setBusy(false);
    setConfirmOpen(false);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }

    if (result.reapproval) {
      toast.info('Sent for internal approval', {
        description: 'Your agreed terms need a further sign-off. We will confirm shortly.',
        duration: 7000,
      });
    } else {
      navigate(`/customer/quotations/${id}/confirmed`);
    }
  };

  return (
    <div className="space-y-5">
      <Link
        to="/customer/quotations"
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-ink-soft transition-colors hover:text-brand-700"
      >
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
        All quotations
      </Link>

      {/* ------------------------------------------------------- header */}
      <GlassCard strong className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs font-semibold text-ink-muted">Quotation {view.reference}</p>
            <h1 className="mt-0.5 text-2xl font-extrabold tracking-tight text-ink">
              {view.customerName}
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-ink-muted">
              <span className="inline-flex items-center gap-1.5">
                <CalendarClock className="h-3.5 w-3.5" aria-hidden="true" />
                Valid until {dateShort(view.validUntil)}
              </span>
              {view.promisedDeliveryDate && (
                <span>Target delivery {dateShort(view.promisedDeliveryDate)}</span>
              )}
              {view.messageCount > 0 && (
                <span className="inline-flex items-center gap-1.5">
                  <MessageSquare className="h-3.5 w-3.5" aria-hidden="true" />
                  {view.messageCount} message{view.messageCount === 1 ? '' : 's'}
                </span>
              )}
            </div>
          </div>

          <RawBadge
            className={cn('px-3 py-1.5 text-xs', status.bg, status.tone)}
            dot
            dotClass="bg-current"
          >
            {status.label}
          </RawBadge>
        </div>

        {view.statusNote && (
          <div
            className={cn(
              'mt-4 flex items-start gap-2.5 rounded-xl border p-3',
              NOTE_TONE[view.statusNote.tone],
            )}
          >
            {view.statusNote.tone === 'warning' ? (
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            ) : (
              <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            )}
            <p className="text-xs leading-relaxed text-ink-soft">{view.statusNote.text}</p>
          </div>
        )}
      </GlassCard>

      {/* -------------------------------------------------------- lines */}
      <GlassPanel
        title="What's included"
        description="Use the Ask a question button on any line to start a conversation with us."
        icon={ShieldCheck}
        accent="teal"
      >
        <ul className="space-y-2.5">
          {view.lines.map((line) => {
            const threadOpen = openThread === line.id;
            const lastComment = line.comments[line.comments.length - 1];
            const awaitingYou = lastComment?.side === 'seller';

            return (
              <li
                key={line.id}
                className={cn(
                  'rounded-xl border bg-white/55 p-3.5 transition-colors',
                  line.isRecurring ? 'border-l-4 border-l-accent-indigo' : 'border-brand-500/12',
                  threadOpen && 'border-accent-teal/45 bg-white/70',
                )}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-bold text-ink">{line.productName}</p>
                      {line.isRecurring && (
                        <Badge tone="indigo" size="xs" icon={Repeat}>
                          Billed {cadenceAdverb(line.cadence)}
                        </Badge>
                      )}
                      {awaitingYou && (
                        <Badge tone="pink" size="xs" icon={CircleDot}>
                          New reply
                        </Badge>
                      )}
                    </div>
                    {line.description && (
                      <p className="mt-1 text-xs leading-relaxed text-ink-soft">
                        {line.description}
                      </p>
                    )}
                    <p className="mt-1.5 text-xs text-ink-muted">
                      {line.qty} × {money(line.unitPrice, view.currency)} per {line.unit}
                      {line.savingsAmount > 0 && (
                        <span className="ml-2 font-semibold text-state-success">
                          You save {money(line.savingsAmount, view.currency)}
                        </span>
                      )}
                    </p>
                  </div>

                  <div className="flex flex-col items-end gap-2">
                    <span className="num text-sm font-extrabold text-ink">
                      {money(line.lineTotal, view.currency)}
                    </span>

                    {/* Explicit labelled control — an unlabelled icon was too
                        easy to miss, which is what made chat feel broken. */}
                    <Button
                      size="xs"
                      variant={threadOpen ? 'subtle' : line.comments.length ? 'secondary' : 'ghost'}
                      icon={MessageSquare}
                      onClick={() => setOpenThread(threadOpen ? null : line.id)}
                      aria-expanded={threadOpen}
                    >
                      {threadOpen
                        ? 'Hide'
                        : line.comments.length
                          ? `Messages (${line.comments.length})`
                          : 'Ask a question'}
                    </Button>
                  </div>
                </div>

                {threadOpen && (
                  <div className="mt-3">
                    <ChatThread
                      line={line}
                      canMessage={view.canMessage}
                      onSend={handleSend(line.id)}
                      autoFocus
                    />
                  </div>
                )}
              </li>
            );
          })}
        </ul>

        <dl className="mt-4 space-y-1.5 border-t border-brand-500/12 pt-4">
          <Row label="Subtotal" value={money(view.totals.subtotal, view.currency)} />
          {view.totals.savings > 0 && (
            <Row
              label="Your savings"
              value={`− ${money(view.totals.savings, view.currency)}`}
              tone="text-state-success"
            />
          )}
          <Row label="Tax" value={money(view.totals.tax, view.currency)} />
          <div className="flex items-baseline justify-between border-t border-brand-500/12 pt-2.5">
            <dt className="text-sm font-bold text-ink">Total</dt>
            <dd className="num text-xl font-extrabold text-ink">
              {money(view.totals.grandTotal, view.currency)}
            </dd>
          </div>
          {view.totals.recurringTotal > 0 && (
            <p className="pt-1 text-[11px] leading-relaxed text-ink-muted">
              Includes {money(view.totals.recurringTotal, view.currency)} of recurring charges billed
              on their own schedule, plus {money(view.totals.oneTimeTotal, view.currency)} charged
              once.
            </p>
          )}
        </dl>
      </GlassPanel>

      {/* --------------------------------------------- counter discount */}
      {view.canProposeTerms && (
        <GlassPanel
          title="Propose different terms"
          description="Tell us what would work and we'll review it internally."
          icon={Percent}
          accent="amber"
        >
          <div className="grid gap-3 sm:grid-cols-[180px_1fr]">
            <Input
              label="Discount you'd like"
              type="number"
              min={0}
              max={60}
              suffix="%"
              placeholder="25"
              value={counterPct}
              onChange={(e) => setCounterPct(e.target.value)}
              hint={`Currently ${percent(view.totals.effectiveDiscountPct)}`}
            />
            <Textarea
              label="Anything we should know?"
              rows={3}
              placeholder="e.g. We're comparing three vendors and need to close this week."
              value={justification}
              onChange={(e) => setJustification(e.target.value)}
            />
          </div>

          {view.counterDiscountPct != null && (
            <div className="mt-3 flex items-start gap-2.5 rounded-xl bg-accent-amber/10 p-3">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-accent-amber" aria-hidden="true" />
              <div className="min-w-0">
                <p className="text-xs leading-relaxed text-ink-soft">
                  You previously requested{' '}
                  <span className="font-bold text-ink">{view.counterDiscountPct}%</span>. Submitting
                  again replaces that request.
                </p>
                {view.counterJustification && (
                  <p className="mt-1 text-[11px] italic leading-relaxed text-ink-muted">
                    “{view.counterJustification}”
                  </p>
                )}
              </div>
            </div>
          )}
        </GlassPanel>
      )}

      {/* ------------------------------------------------------ actions */}
      <GlassCard strong className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm font-bold text-ink">
              {view.canConfirm ? 'Ready to move forward?' : 'Nothing to action right now'}
            </p>
            <p className="mt-0.5 max-w-lg text-xs leading-relaxed text-ink-soft">
              {view.canConfirm
                ? 'Confirming accepts the terms above. If they need internal sign-off we handle that automatically — you won’t need to do anything else.'
                : view.isDecided
                  ? 'Terms are agreed. Your account manager will be in touch with next steps.'
                  : 'Your request is with our team. You can keep messaging on any line while you wait.'}
            </p>
          </div>

          {view.canConfirm && (
            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                icon={Send}
                disabled={busy}
                onClick={handleSubmitRequest}
              >
                Submit Request
              </Button>
              <Button icon={CheckCircle2} disabled={busy} onClick={() => setConfirmOpen(true)}>
                Confirm Quotation
              </Button>
            </div>
          )}
        </div>
      </GlassCard>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Confirm this quotation?"
        description={`${money(view.totals.grandTotal, view.currency)} across ${view.lineCount} line(s).`}
        confirmLabel="Yes, confirm"
        loading={busy}
        onConfirm={handleConfirm}
      >
        <div className="space-y-3">
          <p className="text-sm leading-relaxed text-ink-soft">
            You&apos;re accepting the pricing and terms shown on this page.
          </p>
          <div className="flex items-start gap-2.5 rounded-xl bg-brand-500/8 p-3">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" aria-hidden="true" />
            <p className="text-xs leading-relaxed text-ink-soft">
              If the agreed terms need an additional internal approval, this moves to review
              automatically and we&apos;ll confirm as soon as it clears.
            </p>
          </div>
        </div>
      </ConfirmDialog>
    </div>
  );
}

function Row({ label, value, tone }) {
  return (
    <div className="flex items-baseline justify-between">
      <dt className="text-xs text-ink-soft">{label}</dt>
      <dd className={cn('num text-xs font-semibold text-ink', tone)}>{value}</dd>
    </div>
  );
}
