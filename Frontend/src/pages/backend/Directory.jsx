import { useEffect } from 'react';
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

const ACTIVE_OPTIONS = [
  { value: 'true', label: 'Active' },
  { value: 'false', label: 'Disabled' },
];

/**
 * Account directory.
 *
 * ACCOUNTS ARE CREATED ONLY BY SELF-SIGNUP — staff at /signup, customers at
 * /customer/signup. There is no POST /users and no DELETE, so nobody provisions or
 * removes an account for somebody else and every account traces to a person who proved
 * their own email address.
 *
 * What CAN be changed is narrow and split by who it affects:
 *   · role and active     admin only — they change what a person can do
 *   · teamId              admin or sales manager — territory, grants nothing
 *   · customer tier       admin or sales manager — commercial, not account data
 *
 * The role picker is fed by GET /roles rather than a local list, so it cannot offer a
 * role that PATCH /users/:id would reject. `admin` is absent from that list because it
 * is not assignable through the API at all.
 */
export default function Directory() {
  const users = useAppStore((s) => s.users);
  const teams = useAppStore((s) => s.teams);
  const roles = useAppStore((s) => s.roles);
  const customers = useAppStore((s) => s.customers);
  const currentUser = useAppStore((s) => s.currentUser);

  const loadUsers = useAppStore((s) => s.loadUsers);
  const loadTeams = useAppStore((s) => s.loadTeams);
  const loadRoles = useAppStore((s) => s.loadRoles);
  const loadCustomers = useAppStore((s) => s.loadCustomers);
  const updateUser = useAppStore((s) => s.updateUser);
  const setCustomerTier = useAppStore((s) => s.setCustomerTier);

  const isAdmin = useAppStore((s) => s.hasRole('admin'));
  const canEditTier = useAppStore((s) => s.hasRole('admin', 'sales_manager'));
  const canEditTeam = canEditTier;

  useEffect(() => {
    loadUsers();
    loadTeams();
    loadRoles();
    loadCustomers();
  }, [loadUsers, loadTeams, loadRoles, loadCustomers]);

  const roleOptions = roles
    .filter((r) => r.assignable)
    .map((r) => ({ value: r.key, label: r.label }));

  const teamOptions = [
    { value: '', label: 'Unassigned' },
    ...teams.map((t) => ({ value: t.id, label: t.name })),
  ];

  const handleUserPatch = async (user, patch, describe) => {
    const result = await updateUser(user.id, patch);
    if (result.ok) {
      toast.success(describe(result.user));
    } else {
      // LAST_ADMIN and the two self-edit guards arrive here. The server's message
      // explains which one, so it is shown verbatim rather than re-worded.
      toast.error(result.error);
    }
  };

  const handleTierChange = async (customer, tier) => {
    const result = await setCustomerTier(customer.id, tier);
    if (result.ok) {
      toast.success(`${customer.name} moved to ${tierLabel(tier)}`, {
        description: 'Future quotations start from that price list and ceiling.',
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
            <p className="text-sm font-bold text-ink">Accounts are self-registered</p>
            <p className="mt-1 text-xs leading-relaxed text-ink-soft">
              Nobody creates or deletes an account here. Staff register at{' '}
              <code className="rounded bg-white/70 px-1 py-0.5 text-[11px]">/signup</code> and
              customers at{' '}
              <code className="rounded bg-white/70 px-1 py-0.5 text-[11px]">/customer/signup</code>,
              each in its own identity space, so every account traces to someone who proved their
              own email address and chose their own password. An Admin can change a role, disable an
              account or move somebody between teams; a Sales Manager can do the team part only.
              The Admin role itself cannot be granted through the app.
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
              <TH align="center">Status</TH>
              <TH align="center">Can settle payments</TH>
            </TR>
          </THead>
          <TBody>
            {users.map((user) => {
              const settles = ['finance', 'admin'].includes(user.role);
              const isSelf = currentUser?.id === user.id;
              // An admin cannot change their own role or disable themselves — the server
              // rejects both, so the controls are not offered.
              const roleEditable = isAdmin && !isSelf && user.role !== 'admin';

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
                    {roleEditable && roleOptions.length > 0 ? (
                      <Select
                        className="h-8 w-36 text-[11px]"
                        aria-label={`Role for ${user.name}`}
                        value={user.role}
                        onChange={(e) =>
                          handleUserPatch(user, { role: e.target.value }, (u) =>
                            `${u.name} is now ${roleLabel(u.role)}`,
                          )
                        }
                        options={roleOptions}
                      />
                    ) : (
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
                    )}
                  </TD>
                  <TD>
                    {canEditTeam ? (
                      <Select
                        className="h-8 w-40 text-[11px]"
                        aria-label={`Team for ${user.name}`}
                        value={user.teamId ?? ''}
                        onChange={(e) =>
                          handleUserPatch(
                            user,
                            { teamId: e.target.value || null },
                            (u) => `${u.name} moved to ${u.team ?? 'Unassigned'}`,
                          )
                        }
                        options={teamOptions}
                      />
                    ) : (
                      <span className="text-xs text-ink-soft">{user.team ?? 'Unassigned'}</span>
                    )}
                  </TD>
                  {/* The server's own count across every quotation, not a count of the
                      page this browser happens to have loaded. */}
                  <TD align="center" num className="text-ink-soft">
                    {user.ownedQuotationCount ?? 0}
                  </TD>
                  <TD align="center">
                    {isAdmin && !isSelf ? (
                      <Select
                        className="h-8 w-28 text-[11px]"
                        aria-label={`Status for ${user.name}`}
                        value={String(user.active !== false)}
                        onChange={(e) =>
                          handleUserPatch(
                            user,
                            { active: e.target.value === 'true' },
                            (u) => `${u.name} ${u.active ? 'reactivated' : 'disabled'}`,
                          )
                        }
                        options={ACTIVE_OPTIONS}
                      />
                    ) : user.active === false ? (
                      <Badge tone="danger" size="xs">
                        Disabled
                      </Badge>
                    ) : (
                      <Badge tone="success" size="xs">
                        Active
                      </Badge>
                    )}
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

        {users.length === 0 && (
          <p className="px-4 py-8 text-center text-xs text-ink-muted sm:px-5">
            No staff accounts loaded yet.
          </p>
        )}
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
              <TH>Reference</TH>
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
                {/* The single public identifier: short enough to read down a phone and
                    revealing no sequence, count or tier. */}
                <TD>
                  <span className="num text-[11px] font-semibold text-accent-teal">
                    {customer.customerId ?? '—'}
                  </span>
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
                      onChange={(e) => handleTierChange(customer, e.target.value)}
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
                  {/* `hasAccount` is a boolean derived from whether the address was
                      verified. No endpoint ever returns credential material. */}
                  {customer.hasAccount ? (
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
                  {customer.quotationCount ?? 0}
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>

        {customers.length === 0 && (
          <p className="px-4 py-8 text-center text-xs text-ink-muted sm:px-5">
            No customer organisations loaded yet.
          </p>
        )}

        <div className="flex items-start gap-2.5 px-4 pb-4 pt-3 sm:px-5">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-muted" aria-hidden="true" />
          <p className="text-[11px] leading-relaxed text-ink-muted">
            <span className="font-semibold text-ink">Not claimed</span> means the organisation exists
            commercially and can be quoted, but nobody has registered a login yet. They claim it by
            signing up with that email address. Pricing tier is the one mutation allowed on a
            customer record, because it decides the price list and one half of the discount ceiling
            every line is measured against — it is never self-selected at signup.
          </p>
        </div>
      </GlassPanel>
    </div>
  );
}
