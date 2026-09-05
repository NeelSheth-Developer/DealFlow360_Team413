import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import {
  CalendarClock,
  CheckCircle2,
  Info,
  Lock,
  MessageSquare,
  Percent,
  Repeat,
  Send,
  ShieldCheck,
} from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import { PORTAL_STATUS_META } from '@/lib/portalView';
import { cadenceAdverb, dateShort, money, percent, relativeTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import { GlassCard, GlassPanel } from '@/components/glass/Glass';
import { Button, IconButton } from '@/components/ui/Button';
import { Input, Textarea } from '@/components/ui/Input';
import { Badge, RawBadge } from '@/components/ui/Badge';
import { ConfirmDialog } from '@/components/shared/Dialogs';

/**
 * Customer-facing negotiation screen (spec B8).
 *
 * Every value rendered here comes from `portalGetQuote`, which returns a
 * `toPortalView` projection. Internal fields (cost, margin, risk score,
 * ceilings, rep notes, approval steps) are absent from that object entirely —
 * they are not merely hidden with CSS.
 */
export default function PortalNegotiation() {
  const { token } = useParams();
  const navigate = useNavigate();

  const view = useAppStore((s) => s.portalGetQuote(token));
  const portalAddComment = useAppStore((s) => s.portalAddComment);
  const portalSubmitRequest = useAppStore((s) => s.portalSubmitRequest);
  const portalConfirm = useAppStore((s) => s.portalConfirm);

  const [openThread, setOpenThread] = useState(null);
  const [draftComment, setDraftComment] = useState('');
  const [counterPct, setCounterPct] = useState('');
  const [justification, setJustification] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!view) return null;

  const status = PORTAL_STATUS_META[view.status] ?? PORTAL_STATUS_META.sent;
  const locked = view.isLocked;

  const handleComment = (lineId) => {
    if (!draftComment.trim()) return;
    portalAddComment(token, lineId, draftComment);
    setDraftComment('');
    toast.success('Comment sent', { description: 'Your account contact has been notified.' });
  };

  const handleSubmitRequest = () => {
    if (!counterPct && !justification.trim()) {
      toast.error('Add a discount request or a note first.');
      return;
    }
    setBusy(true);
    const result = portalSubmitRequest(token, {
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

  const handleConfirm = () => {
    setBusy(true);
    const result = portalConfirm(token);
    setBusy(false);
    setConfirmOpen(false);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }

    if (result.reapproval) {
      toast.info('Sent for internal review', {
        description: 'Your agreed terms need a further sign-off. We will confirm shortly.',
      });
    } else {
      navigate(`/portal/${token}/confirmed`);
    }
  };

  return (
    <div className="space-y-5">
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
            </div>
          </div>

          <RawBadge className={cn('px-3 py-1.5 text-xs', status.bg, status.tone)} dot dotClass="bg-current">
            {status.label}
          </RawBadge>
        </div>

        {view.lockReason && (
          <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-brand-500/20 bg-brand-500/8 p-3">
            <Lock className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" aria-hidden="true" />
            <p className="text-xs leading-relaxed text-ink-soft">{view.lockReason}</p>
          </div>
        )}
      </GlassCard>

      {/* -------------------------------------------------------- lines */}
      <GlassPanel
        title="What's included"
        description="Tap the comment icon on any line to ask a question or request a change."
        icon={ShieldCheck}
      >
        <ul className="space-y-2.5">
          {view.lines.map((line) => {
            const threadOpen = openThread === line.id;
            return (
              <li
                key={line.id}
                className={cn(
                  'rounded-xl border bg-white/55 p-3.5 transition-colors',
                  line.isRecurring ? 'border-l-4 border-l-accent-indigo' : 'border-brand-500/12',
                  threadOpen && 'border-brand-500/40',
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
                    </div>
                    {line.description && (
                      <p className="mt-1 text-xs leading-relaxed text-ink-soft">{line.description}</p>
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

                  <div className="flex items-center gap-2">
                    <span className="num text-sm font-extrabold text-ink">
                      {money(line.lineTotal, view.currency)}
                    </span>
                    <IconButton
                      icon={MessageSquare}
                      label={`Comment on ${line.productName}`}
                      size="sm"
                      variant={line.comments.length ? 'subtle' : 'ghost'}
                      onClick={() => {
                        setOpenThread(threadOpen ? null : line.id);
                        setDraftComment('');
                      }}
                    />
                  </div>
                </div>

                {/* ------------------------------------ comment thread */}
                {(threadOpen || line.comments.length > 0) && (
                  <div className="mt-3 border-t border-brand-500/12 pt-3">
                    {line.comments.length > 0 && (
                      <ul className="mb-3 space-y-2">
                        {line.comments.map((c) => (
                          <li
                            key={c.id}
                            className={cn(
                              'max-w-[85%] rounded-xl px-3 py-2',
                              c.side === 'customer'
                                ? 'ml-auto bg-brand-500/12'
                                : 'bg-white/70 border border-brand-500/12',
                            )}
                          >
                            <p className="text-[11px] font-bold text-ink">
                              {c.side === 'customer' ? 'You' : c.author}
                              <span className="ml-2 font-normal text-ink-muted">
                                {relativeTime(c.at)}
                              </span>
                            </p>
                            <p className="mt-0.5 text-xs leading-relaxed text-ink-soft">{c.message}</p>
                          </li>
                        ))}
                      </ul>
                    )}

                    {threadOpen && !locked && (
                      <div className="flex flex-col gap-2 sm:flex-row">
                        <Textarea
                          rows={2}
                          placeholder="Ask about this line, or request a change…"
                          value={draftComment}
                          onChange={(e) => setDraftComment(e.target.value)}
                          className="flex-1"
                        />
                        <Button
                          icon={Send}
                          onClick={() => handleComment(line.id)}
                          disabled={!draftComment.trim()}
                          className="shrink-0 self-end"
                        >
                          Send
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>

        {/* ------------------------------------------------- totals */}
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
      {!locked && (
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
              <p className="text-xs leading-relaxed text-ink-soft">
                You previously requested{' '}
                <span className="font-bold text-ink">{view.counterDiscountPct}%</span>. Submitting
                again will replace that request.
              </p>
            </div>
          )}
        </GlassPanel>
      )}

      {/* ------------------------------------------------------ actions */}
      <GlassCard strong className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm font-bold text-ink">Ready to move forward?</p>
            <p className="mt-0.5 text-xs leading-relaxed text-ink-soft">
              {locked
                ? 'No action is needed from you right now.'
                : 'Confirming accepts the terms above. If they need internal sign-off, we handle that automatically.'}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              icon={Send}
              disabled={locked || busy}
              onClick={handleSubmitRequest}
              loading={busy}
            >
              Submit Request
            </Button>
            <Button
              size="md"
              icon={CheckCircle2}
              disabled={locked || busy}
              onClick={() => setConfirmOpen(true)}
            >
              Confirm Quotation
            </Button>
          </div>
        </div>
      </GlassCard>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Confirm this quotation?"
        description={`${money(view.totals.grandTotal, view.currency)} across ${view.lines.length} line(s).`}
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
              If the agreed terms need an additional internal approval, this will move to review
              automatically and we&apos;ll confirm as soon as it clears — you won&apos;t need to do
              anything else.
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
