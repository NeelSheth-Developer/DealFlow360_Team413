import { NavLink } from 'react-router-dom';
import { CreditCard, FileText, Receipt, ShoppingCart, Truck, UserCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Tooltip } from '@/components/ui/Misc';

/**
 * Tab strip across the five quotation screens. Tabs unlock progressively and a
 * disabled tab explains its own prerequisite rather than just being dead.
 */
export function QuoteNav({ quote, hasInvoice }) {
  const hasSubscriptions = quote.lines.some((l) => l.isSubscription);
  const approvalStarted = quote.approvalSteps.length > 0 || quote.stage === 'pending_approval';
  const pastApproval = ['approved', 'fulfillment', 'billed', 'confirmed'].includes(quote.stage);
  const hasShippable = quote.lines.some((l) => !l.isSubscription && l.category !== 'service');

  const tabs = [
    {
      to: `/app/quotations/${quote.id}`,
      label: 'Builder',
      icon: ShoppingCart,
      end: true,
      enabled: true,
    },
    {
      to: `/app/quotations/${quote.id}/approval`,
      label: 'Approval',
      icon: UserCheck,
      enabled: approvalStarted || pastApproval || quote.stage === 'lost',
      reason: 'Submit the quotation for approval first.',
    },
    {
      to: `/app/quotations/${quote.id}/fulfillment`,
      label: 'Fulfillment',
      icon: Truck,
      enabled: pastApproval && hasShippable,
      reason: hasShippable
        ? 'Available once the quotation is approved.'
        : 'No shippable lines on this quotation.',
    },
    {
      to: `/app/quotations/${quote.id}/billing`,
      label: 'Billing',
      icon: CreditCard,
      enabled: hasSubscriptions || pastApproval,
      reason: 'Add a subscription line, or get the quotation approved.',
    },
    {
      to: `/app/quotations/${quote.id}/invoice`,
      label: 'Invoice',
      icon: Receipt,
      enabled: Boolean(hasInvoice) || ['fulfillment', 'billed', 'confirmed'].includes(quote.stage),
      reason: 'An invoice is created once the order reaches fulfillment.',
    },
  ];

  return (
    <nav
      aria-label="Quotation sections"
      className="glass mb-5 flex items-center gap-1 overflow-x-auto p-1.5"
    >
      {tabs.map((tab) =>
        tab.enabled ? (
          <NavLink
            key={tab.to}
            to={tab.to}
            end={tab.end}
            className={({ isActive }) =>
              cn(
                'inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition-all',
                isActive
                  ? 'bg-gradient-to-r from-brand-500 to-accent-indigo text-white shadow-glass'
                  : 'text-ink-soft hover:bg-brand-500/10 hover:text-brand-700',
              )
            }
          >
            <tab.icon className="h-3.5 w-3.5" aria-hidden="true" />
            {tab.label}
          </NavLink>
        ) : (
          <Tooltip key={tab.to} content={tab.reason}>
            <span className="inline-flex shrink-0 cursor-not-allowed items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold text-ink-muted/60">
              <tab.icon className="h-3.5 w-3.5" aria-hidden="true" />
              {tab.label}
            </span>
          </Tooltip>
        ),
      )}

      <span className="ml-auto hidden shrink-0 items-center gap-1.5 pr-2 text-[11px] text-ink-muted sm:flex">
        <FileText className="h-3 w-3" aria-hidden="true" />
        {quote.id}
      </span>
    </nav>
  );
}
