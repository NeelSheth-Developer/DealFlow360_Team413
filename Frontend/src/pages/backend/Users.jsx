import { useState } from 'react';
import { toast } from 'sonner';
import { Building2, Pencil, Plus, Users as UsersIcon } from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import { roleLabel, tierLabel } from '@/lib/format';
import { GlassPanel } from '@/components/glass/Glass';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button, IconButton } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { Dialog } from '@/components/ui/Dialog';
import { Avatar } from '@/components/ui/Misc';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/Table';
import { TierBadge } from '@/components/shared/Indicators';

const ROLES = ['sales_rep', 'sales_manager', 'finance', 'admin'].map((r) => ({
  value: r,
  label: roleLabel(r),
}));

const TIERS = ['bronze', 'silver', 'gold'].map((t) => ({ value: t, label: tierLabel(t) }));
const CURRENCIES = [
  { value: 'INR', label: 'INR' },
  { value: 'USD', label: 'USD' },
];

const EMPTY_USER = { name: '', email: '', role: 'sales_rep', team: '' };
const EMPTY_CUSTOMER = {
  name: '',
  tier: 'bronze',
  contactName: '',
  email: '',
  currency: 'INR',
  industry: '',
};

/** User, role and customer directory management. */
export default function UsersPage() {
  const users = useAppStore((s) => s.users);
  const customers = useAppStore((s) => s.customers);
  const quotations = useAppStore((s) => s.quotations);
  const upsertUser = useAppStore((s) => s.upsertUser);
  const upsertCustomer = useAppStore((s) => s.upsertCustomer);

  const [userEditing, setUserEditing] = useState(null);
  const [userForm, setUserForm] = useState(EMPTY_USER);
  const [customerEditing, setCustomerEditing] = useState(null);
  const [customerForm, setCustomerForm] = useState(EMPTY_CUSTOMER);

  const openUser = (user) => {
    setUserEditing(user ?? 'new');
    setUserForm(user ? { ...user } : EMPTY_USER);
  };

  const openCustomer = (customer) => {
    setCustomerEditing(customer ?? 'new');
    setCustomerForm(customer ? { ...customer } : EMPTY_CUSTOMER);
  };

  const saveUser = () => {
    if (!userForm.name?.trim() || !userForm.email?.trim()) {
      toast.error('Name and email are required.');
      return;
    }
    upsertUser(userEditing === 'new' ? { ...userForm, id: undefined } : userForm);
    setUserEditing(null);
    toast.success(userEditing === 'new' ? 'User created' : 'User updated');
  };

  const saveCustomer = () => {
    if (!customerForm.name?.trim()) {
      toast.error('Customer name is required.');
      return;
    }
    upsertCustomer(customerEditing === 'new' ? { ...customerForm, id: undefined } : customerForm);
    setCustomerEditing(null);
    toast.success(customerEditing === 'new' ? 'Customer created' : 'Customer updated');
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Users & customers"
        description="Roles decide which screens and approval steps a person can act on."
      />

      {/* --------------------------------------------------------- users */}
      <GlassPanel
        title={`Internal users (${users.length})`}
        icon={UsersIcon}
        actions={
          <Button size="sm" icon={Plus} onClick={() => openUser(null)}>
            New User
          </Button>
        }
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
              <TH align="right">Actions</TH>
            </TR>
          </THead>
          <TBody>
            {users.map((user) => (
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
                <TD align="right">
                  <IconButton
                    icon={Pencil}
                    label={`Edit ${user.name}`}
                    size="xs"
                    onClick={() => openUser(user)}
                  />
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </GlassPanel>

      {/* ----------------------------------------------------- customers */}
      <GlassPanel
        title={`Customers (${customers.length})`}
        icon={Building2}
        accent="teal"
        actions={
          <Button size="sm" variant="secondary" icon={Plus} onClick={() => openCustomer(null)}>
            New Customer
          </Button>
        }
        bodyClassName="px-0 py-0 sm:px-0"
      >
        <Table>
          <THead>
            <TR>
              <TH>Company</TH>
              <TH>Contact</TH>
              <TH>Tier</TH>
              <TH align="center">Currency</TH>
              <TH>Industry</TH>
              <TH align="center">Quotations</TH>
              <TH align="right">Actions</TH>
            </TR>
          </THead>
          <TBody>
            {customers.map((customer) => (
              <TR key={customer.id}>
                <TD className="text-xs font-bold text-ink">{customer.name}</TD>
                <TD>
                  <p className="text-xs text-ink-soft">{customer.contactName}</p>
                  <p className="text-[10px] text-ink-muted">{customer.email}</p>
                </TD>
                <TD>
                  <TierBadge tier={customer.tier} showIcon={false} />
                </TD>
                <TD align="center">
                  <Badge tone="neutral" size="xs">
                    {customer.currency}
                  </Badge>
                </TD>
                <TD className="text-xs text-ink-soft">{customer.industry}</TD>
                <TD align="center" num className="text-ink-soft">
                  {quotations.filter((q) => q.customerId === customer.id).length}
                </TD>
                <TD align="right">
                  <IconButton
                    icon={Pencil}
                    label={`Edit ${customer.name}`}
                    size="xs"
                    onClick={() => openCustomer(customer)}
                  />
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </GlassPanel>

      {/* --------------------------------------------------- user dialog */}
      <Dialog
        open={Boolean(userEditing)}
        onOpenChange={(open) => !open && setUserEditing(null)}
        title={userEditing === 'new' ? 'New user' : userForm.name}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setUserEditing(null)}>
              Cancel
            </Button>
            <Button onClick={saveUser}>{userEditing === 'new' ? 'Create user' : 'Save'}</Button>
          </>
        }
      >
        <div className="space-y-3.5">
          <Input
            label="Full name"
            required
            value={userForm.name}
            onChange={(e) => setUserForm((f) => ({ ...f, name: e.target.value }))}
          />
          <Input
            label="Email"
            type="email"
            required
            value={userForm.email}
            onChange={(e) => setUserForm((f) => ({ ...f, email: e.target.value }))}
          />
          <Select
            label="Role"
            options={ROLES}
            value={userForm.role}
            onChange={(e) => setUserForm((f) => ({ ...f, role: e.target.value }))}
            hint="Sales Manager and Finance can act on approval steps."
          />
          <Input
            label="Team"
            value={userForm.team}
            onChange={(e) => setUserForm((f) => ({ ...f, team: e.target.value }))}
          />
        </div>
      </Dialog>

      {/* ----------------------------------------------- customer dialog */}
      <Dialog
        open={Boolean(customerEditing)}
        onOpenChange={(open) => !open && setCustomerEditing(null)}
        title={customerEditing === 'new' ? 'New customer' : customerForm.name}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setCustomerEditing(null)}>
              Cancel
            </Button>
            <Button onClick={saveCustomer}>
              {customerEditing === 'new' ? 'Create customer' : 'Save'}
            </Button>
          </>
        }
      >
        <div className="space-y-3.5">
          <Input
            label="Company name"
            required
            value={customerForm.name}
            onChange={(e) => setCustomerForm((f) => ({ ...f, name: e.target.value }))}
          />
          <Select
            label="Tier"
            options={TIERS}
            value={customerForm.tier}
            onChange={(e) => setCustomerForm((f) => ({ ...f, tier: e.target.value }))}
            hint="Decides the price list applied and the headline discount ceiling."
          />
          <Input
            label="Contact name"
            value={customerForm.contactName}
            onChange={(e) => setCustomerForm((f) => ({ ...f, contactName: e.target.value }))}
          />
          <Input
            label="Contact email"
            type="email"
            value={customerForm.email}
            onChange={(e) => setCustomerForm((f) => ({ ...f, email: e.target.value }))}
          />
          <Select
            label="Currency"
            options={CURRENCIES}
            value={customerForm.currency}
            onChange={(e) => setCustomerForm((f) => ({ ...f, currency: e.target.value }))}
          />
          <Input
            label="Industry"
            value={customerForm.industry}
            onChange={(e) => setCustomerForm((f) => ({ ...f, industry: e.target.value }))}
          />
        </div>
      </Dialog>
    </div>
  );
}
