import { toast } from 'sonner';
import { Building2, Info, Lock, ShieldCheck, Users as UsersIcon } from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import { dateShort, roleLabel, tierLabel } from '@/lib/format';
import { GlassCard, GlassPanel } from '@/components/glass/Glass';
import { PageHeader } from '@/components/shared/PageHeader';
import { Badge } from '@/components/ui/Badge';
import { Avatar } from '@/components/ui/Misc';
import { Select } from '@/components/ui/Input';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/Table';
import { TierBadge } from '@/components/shared/Indicators';

const TIERS = ['bronze', 'silver', 'gold'].map((t) => ({ value: t, label: tierLabel(t) }));

/**
 * Read-only account directory.
 *
 * Accounts are created ONLY by self-signup — staff at /signup, customers at
 * /customer/signup. No role, including Admin, can create or edit an account for
 * someone else. The single exception is a customer's pricing tier, which is a
 * commercial setting rather than account data, and is restricted to Sales
 * Manager and Admin.
 */
export default function Directory() {
  const users = useAppStore((s) => s.users);
  const customers = useAppStore((s) => s.customers);
  const quotations = useAppStore((s) => s.quotations);
  const setCustomerTier = useAppStore((s) => s.setCustomerTier);
  const canEditTier = useAppStore((s) => s.hasRole('admin', 'sales_manager'));

  const handleTierChange = (customerId, tier) => {
    const result = setCustomerTier(customerId, tier);
    if (result.ok) {
      toast.success(`${result.customer.name} moved to ${tierLabel(tier)}`, {
        description: 'Future quotations will use that price list and discount ceiling.',
      });
    } else {
      toast.error(result.error);
    }
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Account directory"
        description="Who has access, and on what commercial terms."
      />

      {/* ---------------------------------------------------- policy note */}
      <GlassCard className="border-l-4 border-l-brand-500 p-4">
        <div className="flex items-start gap-3">
          <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-500/12 text-brand-600">
            <Lock className="h-4 w-4" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-bold text-ink">Accounts are self-registered only</p>
            <p className="mt-1 text-xs leading-relaxed text-ink-soft">
              This directory is read-only by design. Nobody — including an Admin — can create,
              rename or delete another person&apos;s account. Staff register at{' '}
              <code className="rounded bg-white/70 px-1 py-0.5 text-[11px]">/signup</code> and
              customers at{' '}
              <code className="rounded bg-white/70 px-1 py-0.5 text-[11px]">/customer/signup</code>,
              each in its own identity space. That keeps every account traceable to a real person who
              consented to it, and removes the whole class of privilege-escalation problems that comes
              with admin-provisioned users.
            </p>
          </div>
        </div>
      </GlassCard>

      {/* --------------------------------------------------------- staff */}
      <GlassPanel
        title={`Internal staff (${users.length})`}
        description="Roles decide which screens and approval steps a person can act on."
        icon={UsersIcon}
        bodyClassName="px-0 py-0 sm:px-0"
      >
        <Table>
          <THead>
            <TR>
              <TH>Name</TH>
              <TH>Email</TH>
              <TH>Role</TH>
              <TH>Team</TH>
              <TH align="center">Owned quotes</TH>
              <TH align="center">Can settle payments</TH>
            </TR>
          </THead>
          <TBody>
            {users.map((user) => {
              const settles = ['finance', 'admin'].includes(user.role);
              return (
                <TR key={user.id}>
                  <TD>
                    <div className="flex items-center gap-2">
                      <Avatar name={user.name} gradient={user.avatarColor} size="sm" />
                      <span className="text-xs font-bold text-ink">{user.name}</span>
                    </div>
                  </TD>
                  <TD className="text-xs text-ink-soft">{user.email}</TD>
                  <TD>
                    <Badge
                      tone={
                        user.role === 'admin'
                          ? 'brand'
                          : user.role === 'sales_manager'
                            ? 'pink'
                            : user.role === 'finance'
                              ? 'warning'
                              : 'indigo'
                      }
                      size="xs"
                    >
                      {roleLabel(user.role)}
                    </Badge>
                  </TD>
                  <TD className="text-xs text-ink-soft">{user.team}</TD>
                  <TD align="center" num className="text-ink-soft">
                    {quotations.filter((q) => q.ownerId === user.id).length}
                  </TD>
                  <TD align="center">
                    {settles ? (
                      <Badge tone="success" size="xs" icon={ShieldCheck}>
                        Yes
                      </Badge>
                    ) : (
                      <span className="text-[11px] text-ink-muted">No</span>
                    )}
                  </TD>
                </TR>
              );
            })}
          </TBody>
        </Table>
      </GlassPanel>

      {/* ----------------------------------------------------- customers */}
      <GlassPanel
        title={`Customers (${customers.length})`}
        description="Registered customer organisations and the price list applied to each."
        icon={Building2}
        accent="teal"
        bodyClassName="px-0 py-0 sm:px-0"
      >
        <Table>
          <THead>
            <TR>
              <TH>Company</TH>
              <TH>Primary contact</TH>
              <TH>Pricing tier</TH>
              <TH align="center">Currency</TH>
              <TH align="center">Account status</TH>
              <TH align="center">Quotations</TH>
            </TR>
          </THead>
          <TBody>
            {customers.map((customer) => (
              <TR key={customer.id}>
                <TD>
                  <p className="text-xs font-bold text-ink">{customer.name}</p>
                  <p className="text-[10px] text-ink-muted">{customer.industry || '—'}</p>
                </TD>
                <TD>
                  <p className="text-xs text-ink-soft">{customer.contactName}</p>
                  <p className="text-[10px] text-ink-muted">{customer.email}</p>
                </TD>
                <TD>
                  {canEditTier ? (
                    <Select
                      className="h-8 w-28 text-[11px]"
                      aria-label={`Pricing tier for ${customer.name}`}
                      value={customer.tier}
                      onChange={(e) => handleTierChange(customer.id, e.target.value)}
                      options={TIERS}
                    />
                  ) : (
                    <TierBadge tier={customer.tier} showIcon={false} />
                  )}
                </TD>
                <TD align="center">
                  <Badge tone="neutral" size="xs">
                    {customer.currency}
                  </Badge>
                </TD>
                <TD align="center">
                  {customer.password ? (
                    <Badge tone="success" size="xs">
                      Registered
                    </Badge>
                  ) : (
                    <Badge tone="warning" size="xs">
                      Not claimed
                    </Badge>
                  )}
                  {customer.registeredAt && (
                    <p className="mt-0.5 text-[10px] text-ink-muted">
                      {dateShort(customer.registeredAt)}
                    </p>
                  )}
                </TD>
                <TD align="center" num className="text-ink-soft">
                  {quotations.filter((q) => q.customerId === customer.id).length}
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>

        <div className="flex items-start gap-2.5 px-4 pb-4 pt-3 sm:px-5">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-muted" aria-hidden="true" />
          <p className="text-[11px] leading-relaxed text-ink-muted">
            <span className="font-semibold text-ink">Not claimed</span> means the organisation exists
            commercially and can be quoted, but nobody has registered a login yet. They claim it by
            signing up with that email address. Pricing tier is the one commercial setting a Sales
            Manager or Admin controls, because it decides the price list and the discount ceiling
            every line is measured against — it is never self-selected at signup.
          </p>
        </div>
      </GlassPanel>
    </div>
  );
}
