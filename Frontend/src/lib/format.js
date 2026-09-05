import { differenceInDays, differenceInHours, differenceInMinutes, format, parseISO } from 'date-fns';

const CURRENCY_SYMBOL = { INR: '₹', USD: '$', EUR: '€', GBP: '£' };

export function currencySymbol(currency = 'INR') {
  return CURRENCY_SYMBOL[currency] || `${currency} `;
}

/** Money with thousands separators and no decimals (the common case for B2B totals). */
export function money(amount, currency = 'INR', decimals = 0) {
  const n = Number(amount) || 0;
  const sign = n < 0 ? '-' : '';
  const abs = Math.abs(n);
  const formatted = abs.toLocaleString('en-IN', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  return `${sign}${currencySymbol(currency)}${formatted}`;
}

/** Money keeping paise/cents — used on proration and refund amounts. */
export function moneyPrecise(amount, currency = 'INR') {
  return money(amount, currency, 2);
}

export function percent(value, decimals = 1) {
  const n = Number(value) || 0;
  return `${n.toFixed(decimals)}%`;
}

export function points(value, decimals = 2) {
  const n = Number(value) || 0;
  return `${n.toFixed(decimals)} pts`;
}

export function compactNumber(value) {
  const n = Number(value) || 0;
  if (Math.abs(n) >= 10000000) return `${(n / 10000000).toFixed(1)}Cr`;
  if (Math.abs(n) >= 100000) return `${(n / 100000).toFixed(1)}L`;
  if (Math.abs(n) >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}

/** Compact money for chart axes and tight KPI tiles. */
export function moneyCompact(amount, currency = 'INR') {
  return `${currencySymbol(currency)}${compactNumber(amount)}`;
}

function toDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  try {
    return typeof value === 'string' && value.includes('T') ? parseISO(value) : new Date(value);
  } catch {
    return null;
  }
}

export function dateShort(value) {
  const d = toDate(value);
  return d ? format(d, 'dd MMM yyyy') : '—';
}

export function dateMedium(value) {
  const d = toDate(value);
  return d ? format(d, 'dd MMM yyyy, HH:mm') : '—';
}

export function dateDay(value) {
  const d = toDate(value);
  return d ? format(d, 'dd MMM') : '—';
}

export function dateMonth(value) {
  const d = toDate(value);
  return d ? format(d, 'MMM yyyy') : '—';
}

export function dateInput(value) {
  const d = toDate(value);
  return d ? format(d, 'yyyy-MM-dd') : '';
}

/** "3 days ago" / "in 5 days" style relative label. */
export function relativeTime(value) {
  const d = toDate(value);
  if (!d) return '—';
  const now = new Date();
  const mins = differenceInMinutes(now, d);
  const future = mins < 0;
  const absMins = Math.abs(mins);

  if (absMins < 1) return 'just now';
  if (absMins < 60) return future ? `in ${absMins}m` : `${absMins}m ago`;

  const hrs = Math.abs(differenceInHours(now, d));
  if (hrs < 24) return future ? `in ${hrs}h` : `${hrs}h ago`;

  const days = Math.abs(differenceInDays(now, d));
  if (days < 31) return future ? `in ${days}d` : `${days}d ago`;

  return dateShort(d);
}

export function daysBetween(from, to = new Date()) {
  const a = toDate(from);
  const b = toDate(to);
  if (!a || !b) return 0;
  return differenceInDays(b, a);
}

export function stageLabel(stage) {
  const map = {
    draft: 'Draft',
    sent: 'Sent',
    under_negotiation: 'Under Negotiation',
    pending_approval: 'Pending Approval',
    approved: 'Approved',
    fulfillment: 'Fulfillment',
    billed: 'Billed',
    confirmed: 'Confirmed',
    lost: 'Lost',
  };
  return map[stage] || stage;
}

export function roleLabel(role) {
  const map = {
    sales_rep: 'Sales Rep',
    sales_manager: 'Sales Manager',
    finance: 'Finance',
    admin: 'Admin',
    customer: 'Customer',
  };
  return map[role] || role;
}

export function categoryLabel(category) {
  const map = {
    hardware: 'Hardware',
    service: 'Service',
    subscription: 'Subscription',
    accessories: 'Accessories',
  };
  return map[category] || category;
}

export function cadenceLabel(cadence) {
  const map = { monthly: 'Monthly', quarterly: 'Quarterly', yearly: 'Yearly' };
  return map[cadence] || cadence;
}

export function cadenceAdverb(cadence) {
  const map = { monthly: 'every month', quarterly: 'every quarter', yearly: 'every year' };
  return map[cadence] || cadence;
}

export function tierLabel(tier) {
  const map = { bronze: 'Bronze', silver: 'Silver', gold: 'Gold' };
  return map[tier] || tier;
}

export function paymentMethodLabel(method) {
  const map = {
    card: 'Card',
    bank_transfer: 'Bank Transfer',
    cheque: 'Cheque',
    upi: 'UPI',
    other: 'Other',
  };
  return map[method] || method;
}

export function prorationRuleLabel(rule) {
  const map = {
    daily_prorate: 'Daily prorate',
    full_period: 'Full period (no proration)',
    next_cycle_adjust: 'Adjust next cycle',
  };
  return map[rule] || rule;
}

export function cancellationRuleLabel(rule) {
  const map = {
    refund_unused: 'Refund unused days',
    no_refund: 'No refund',
    credit_note_only: 'Credit note only',
  };
  return map[rule] || rule;
}

export function invoiceStatusLabel(status) {
  const map = {
    draft: 'Draft',
    sent: 'Sent',
    partially_paid: 'Partially Paid',
    paid: 'Paid',
  };
  return map[status] || status;
}
