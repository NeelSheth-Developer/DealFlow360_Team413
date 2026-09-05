import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, FileText, Package, Repeat } from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import { cadenceAdverb, dateShort, money } from '@/lib/format';
import { GlassCard, GlassPanel } from '@/components/glass/Glass';
import { Button } from '@/components/ui/Button';

/** Post-confirmation success screen for the customer. */
export default function PortalConfirmed() {
  const { token } = useParams();
  const view = useAppStore((s) => s.portalGetQuote(token));

  if (!view) return null;

  const recurring = view.lines.filter((l) => l.isRecurring);
  const oneTime = view.lines.filter((l) => !l.isRecurring);

  return (
    <div className="space-y-5">
      <GlassCard strong className="p-8 text-center">
        <span className="mx-auto mb-4 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-state-success to-accent-teal text-white shadow-glass">
          <CheckCircle2 className="h-7 w-7" aria-hidden="true" />
        </span>

        <h1 className="text-2xl font-extrabold tracking-tight text-ink">Quotation confirmed</h1>
        <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-ink-soft">
          Thank you. {view.reference} is confirmed and moving into fulfillment. Your account contact
          will follow up with delivery details.
        </p>

        <div className="mx-auto mt-5 max-w-xs rounded-xl bg-white/60 p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted">
            Order reference
          </p>
          <p className="num mt-1 text-lg font-extrabold text-ink">{view.reference}</p>
          <p className="num mt-2 text-2xl font-extrabold text-ink">
            {money(view.totals.grandTotal, view.currency)}
          </p>
        </div>
      </GlassCard>

      <GlassPanel title="What happens next" icon={Package}>
        <ol className="space-y-3">
          <NextStep
            index={1}
            icon={Package}
            title="Fulfillment is being arranged"
            body={
              oneTime.length
                ? `${oneTime.length} item(s) will be allocated across our warehouse network to minimise shipments. You'll get tracking details once dispatched.`
                : 'Your services will be scheduled with our delivery team.'
            }
          />
          <NextStep
            index={2}
            icon={FileText}
            title="Invoice for one-time charges"
            body={
              oneTime.length
                ? `An invoice for ${money(view.totals.oneTimeTotal, view.currency)} will be issued with 15-day payment terms.`
                : 'No one-time charges on this order.'
            }
          />
          {recurring.length > 0 && (
            <NextStep
              index={3}
              icon={Repeat}
              title="Subscription billing starts separately"
              body={`${recurring.length} recurring line(s) totalling ${money(view.totals.recurringTotal, view.currency)} will bill ${cadenceAdverb(recurring[0].cadence)}, on their own schedule from ${dateShort(view.promisedDeliveryDate ?? view.validUntil)}.`}
            />
          )}
        </ol>
      </GlassPanel>

      <div className="flex justify-center">
        <Link to={`/portal/${token}`}>
          <Button variant="secondary" icon={ArrowLeft}>
            View quotation details
          </Button>
        </Link>
      </div>
    </div>
  );
}

function NextStep({ index, icon: Icon, title, body }) {
  return (
    <li className="flex gap-3">
      <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-brand-500/12 text-brand-600">
        <Icon className="h-4 w-4" aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <p className="text-xs font-bold text-ink">
          {index}. {title}
        </p>
        <p className="mt-0.5 text-xs leading-relaxed text-ink-soft">{body}</p>
      </div>
    </li>
  );
}
