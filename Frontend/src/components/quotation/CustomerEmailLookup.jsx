import { useState } from 'react';
import {
  AlertCircle,
  Building2,
  CheckCircle2,
  FileText,
  Mail,
  RotateCcw,
  Search,
  ShieldAlert,
  UserCircle2,
} from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import { findCustomerByEmail } from '@/services/customersService';
import { percent, tierLabel } from '@/lib/format';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { TierBadge } from '@/components/shared/Indicators';

/**
 * Find the customer for a new quotation by email address.
 *
 * Resolved through `GET /customers?q=` (API-REFERENCE §4.1) and confirmed to be an
 * exact match client-side — a partial search on an address could otherwise return a
 * different row that merely contains it. There is no by-email route.
 *
 * The record is handed straight to the caller. It is NOT written into the store: the
 * server owns customers, `POST /quotations` takes the customer's uuid, and there is no
 * local directory to keep in sync any more.
 *
 * @param onResolved (customer|null) => void
 */
export function CustomerEmailLookup({ onResolved }) {
  const tierCeilings = useAppStore((s) => s.tierCeilings);

  const [email, setEmail] = useState('');
  const [customer, setCustomer] = useState(null);
  const [error, setError] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const [busy, setBusy] = useState(false);

  // A sales_rep gets 403 on /config/discount, so the ceilings are legitimately
  // unknown here rather than zero. Never render 0% for "not allowed to read".
  const ceiling = customer ? tierCeilings?.[customer.tier] : undefined;
  const knowsCeiling = typeof ceiling === 'number';

  const reset = () => {
    setCustomer(null);
    setError(null);
    setNotFound(false);
    onResolved?.(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const address = email.trim().toLowerCase();

    if (!/^\S+@\S+\.\S+$/.test(address)) {
      setError('Enter a valid email address.');
      return;
    }

    setBusy(true);
    setError(null);
    setNotFound(false);
    setCustomer(null);
    onResolved?.(null);

    try {
      const found = await findCustomerByEmail(address);

      if (!found) {
        setNotFound(true);
        return;
      }

      setCustomer(found);
      onResolved?.(found);
    } catch (err) {
      setError(
        err?.code === 'NETWORK_ERROR' || err?.code === 'TIMEOUT'
          ? 'Cannot reach the server. Check your connection and try again.'
          : (err?.message ?? 'Could not look that customer up.'),
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <form onSubmit={handleSubmit} className="space-y-3">
        <Input
          label="Customer email"
          type="email"
          required
          autoComplete="off"
          autoFocus
          placeholder="buyer@company.com"
          value={email}
          error={error}
          prefix={<Mail className="h-3.5 w-3.5" />}
          className="pl-9"
          onChange={(e) => {
            setEmail(e.target.value);
            setError(null);
            setNotFound(false);
          }}
          hint="The address the customer registered with, or their DF- reference."
        />

        <div className="flex flex-wrap gap-2">
          <Button type="submit" icon={Search} loading={busy}>
            Find customer
          </Button>
          {(customer || notFound) && (
            <Button type="button" variant="ghost" icon={RotateCcw} onClick={reset}>
              Clear
            </Button>
          )}
        </div>
      </form>

      {/* ------------------------------------------------------- not found */}
      {notFound && (
        <div
          role="status"
          className="mt-4 flex items-start gap-2.5 rounded-xl border border-accent-amber/35 bg-accent-amber/12 p-3"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-accent-amber" aria-hidden="true" />
          <div className="min-w-0">
            <p className="text-xs font-bold text-ink">No customer with that email</p>
            <p className="mt-1 text-[11px] leading-relaxed text-ink-soft">
              Check the spelling, or ask them to register first — customers create their own
              accounts, and a quotation can only be raised against an existing one.
            </p>
          </div>
        </div>
      )}

      {/* -------------------------------------------------------- resolved */}
      {customer && (
        <div className="mt-4 rounded-xl border border-state-success/30 bg-state-success/8 p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-start gap-2.5">
              <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/70 text-brand-600">
                <Building2 className="h-4 w-4" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 text-sm font-bold text-ink">
                  <CheckCircle2
                    className="h-3.5 w-3.5 shrink-0 text-state-success"
                    aria-hidden="true"
                  />
                  <span className="truncate">{customer.name}</span>
                </p>
                <p className="mt-0.5 truncate text-[11px] text-ink-muted">{customer.email}</p>
              </div>
            </div>
            <TierBadge tier={customer.tier} />
          </div>

          <dl className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Field label="Contact" value={customer.contactName || '—'} />
            <Field label="Reference" value={customer.customerId || '—'} />
            <Field label="Currency" value={customer.currency} />
            <Field
              label="Tier ceiling"
              value={knowsCeiling ? percent(ceiling, 0) : 'Not visible'}
              emphasis={knowsCeiling}
            />
          </dl>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            {typeof customer.quotationCount === 'number' && (
              <Badge tone="neutral" size="xs" icon={FileText}>
                {customer.quotationCount} existing quotation(s)
              </Badge>
            )}
            {customer.hasAccount === false && (
              <Badge tone="warning" size="xs" icon={ShieldAlert}>
                No portal login yet
              </Badge>
            )}
          </div>

          <p className="mt-3 flex items-start gap-1.5 text-[11px] leading-relaxed text-ink-soft">
            <UserCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand-600" aria-hidden="true" />
            <span>
              {tierLabel(customer.tier)} pricing is applied to every line automatically.
              {customer.hasAccount === false &&
                ' They will need to register before they can review it online.'}
            </span>
          </p>
        </div>
      )}

      {/* ----------------------------------------------------------- empty */}
      {!customer && !notFound && (
        <div className="mt-4 rounded-xl bg-white/50 p-4">
          <p className="text-[11px] leading-relaxed text-ink-muted">
            Enter the customer&apos;s email to load their organisation, pricing tier and currency.
            Their tier decides the price list applied to every line and the discount ceiling each
            line is measured against.
          </p>
        </div>
      )}
    </div>
  );
}

function Field({ label, value, emphasis = false }) {
  return (
    <div className="rounded-lg bg-white/60 px-2.5 py-2">
      <dt className="text-[10px] font-semibold uppercase tracking-wider text-ink-muted">{label}</dt>
      <dd
        className={
          emphasis
            ? 'num mt-0.5 truncate text-xs font-extrabold text-brand-700'
            : 'mt-0.5 truncate text-xs font-bold text-ink'
        }
      >
        {value}
      </dd>
    </div>
  );
}
