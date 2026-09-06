import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, ClipboardList, Download, Search } from 'lucide-react';
import { toast } from 'sonner';
import { useAppStore } from '@/store/useAppStore';
import { exportToXlsx } from '@/lib/exporters';
import { dateMedium, roleLabel } from '@/lib/format';
import { GlassCard, GlassPanel } from '@/components/glass/Glass';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Input';
import { AuditTrailList } from '@/components/shared/AuditTrailList';
import { StatTile } from '@/components/shared/Indicators';

const ENTITY_TYPES = [
  { value: 'quotation', label: 'Quotations' },
  { value: 'invoice', label: 'Invoices' },
  { value: 'config', label: 'Configuration' },
  { value: 'product', label: 'Products' },
  { value: 'warehouse', label: 'Warehouses' },
  { value: 'subscription_plan', label: 'Subscription plans' },
  { value: 'upsell_rule', label: 'Upsell rules' },
  { value: 'customer', label: 'Customers' },
  { value: 'user', label: 'Users' },
  { value: 'price_list', label: 'Price lists' },
];

const ACTOR_ROLES = [
  { value: 'sales_rep', label: 'Sales Rep' },
  { value: 'sales_manager', label: 'Sales Manager' },
  { value: 'finance', label: 'Finance / Operations' },
  { value: 'admin', label: 'Admin' },
  { value: 'customer', label: 'Customer (portal)' },
  { value: 'system', label: 'System (auto-approve)' },
];

const PAGE_SIZE = 100;

/**
 * Full platform audit trail.
 *
 * EVERY FILTER IS SERVER-SIDE. The log runs to hundreds of thousands of rows and the
 * client only ever holds one page, so searching a local array would search the page
 * rather than the log — and would quietly report "3 entries" when the real answer was
 * three thousand.
 *
 * `actorRole` is a filter here as well as `actorId`, because the interesting question is
 * usually "what did finance do" rather than "what did this one person do", and because
 * `customer` and `system` are real actor roles that no user picker would contain.
 */
export default function AuditLog() {
  const entries = useAppStore((s) => s.auditLog);
  const meta = useAppStore((s) => s.auditMeta);
  const loading = useAppStore((s) => s.auditLoading);
  const users = useAppStore((s) => s.users);
  const loadAuditLog = useAppStore((s) => s.loadAuditLog);
  const loadUsers = useAppStore((s) => s.loadUsers);

  const [search, setSearch] = useState('');
  const [entityType, setEntityType] = useState('');
  const [actorId, setActorId] = useState('');
  const [actorRole, setActorRole] = useState('');
  const [page, setPage] = useState(1);

  useEffect(() => {
    if (users.length === 0) loadUsers();
  }, [users.length, loadUsers]);

  // Typing is debounced so each keystroke does not become a request against a very
  // large table. 350ms is long enough to finish a word and short enough to feel live.
  useEffect(() => {
    const timer = setTimeout(() => {
      loadAuditLog({ search, entityType, actorId, actorRole, page, pageSize: PAGE_SIZE });
    }, 350);
    return () => clearTimeout(timer);
  }, [loadAuditLog, search, entityType, actorId, actorRole, page]);

  // Any filter change invalidates the page number — page 4 of the old result set is not
  // page 4 of the new one.
  const changeFilter = (setter) => (value) => {
    setter(value);
    setPage(1);
  };

  const total = meta?.total ?? entries.length;
  const totalPages = meta?.totalPages ?? 1;
  const withReasons = entries.filter((e) => e.reason).length;
  const uniqueActors = new Set(entries.map((e) => e.actorId)).size;

  const handleExport = async () => {
    await exportToXlsx({
      fileName: `dealflow360-audit-${new Date().toISOString().slice(0, 10)}.xlsx`,
      sheets: [
        {
          name: 'Audit log',
          rows: entries.map((e) => ({
            Timestamp: dateMedium(e.at),
            Entity_Type: e.entityType,
            Entity_Ref: e.entityRef ?? e.entityId,
            Action: e.action,
            Actor: e.actorName,
            Role: roleLabel(e.actorRole),
            Reason: e.reason ?? '',
          })),
        },
      ],
    });
    toast.success('Audit log exported', {
      description: `${entries.length} row(s) from the current page.`,
    });
  };

  return (
    <div>
      <PageHeader
        title="Audit log"
        description="Append-only. Every approval, rejection, edit and configuration change is recorded with who, when and why."
        actions={
          <Button
            variant="secondary"
            size="sm"
            icon={Download}
            onClick={handleExport}
            disabled={entries.length === 0}
          >
            Export XLS
          </Button>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label="Matching entries"
          value={total}
          format={(v) => Math.round(v)}
          hint="across every page"
          icon={ClipboardList}
        />
        <StatTile
          label="With a reason"
          value={withReasons}
          format={(v) => Math.round(v)}
          hint="on this page"
          tone="amber"
        />
        <StatTile
          label="Distinct actors"
          value={uniqueActors}
          format={(v) => Math.round(v)}
          hint="on this page"
          tone="indigo"
        />
        <StatTile
          label="Page"
          value={page}
          format={(v) => `${Math.round(v)} of ${totalPages}`}
          tone="teal"
        />
      </div>

      <GlassCard className="mb-4 p-3">
        <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
          <Input
            placeholder="Search actions, references, reasons…"
            value={search}
            onChange={(e) => changeFilter(setSearch)(e.target.value)}
            prefix={<Search className="h-3.5 w-3.5" />}
            className="pl-9"
            aria-label="Search audit log"
          />
          <Select
            value={entityType}
            onChange={(e) => changeFilter(setEntityType)(e.target.value)}
            placeholder="All entity types"
            aria-label="Filter by entity type"
            options={ENTITY_TYPES}
          />
          <Select
            value={actorRole}
            onChange={(e) => changeFilter(setActorRole)(e.target.value)}
            placeholder="All actor roles"
            aria-label="Filter by actor role"
            options={ACTOR_ROLES}
          />
          <Select
            value={actorId}
            onChange={(e) => changeFilter(setActorId)(e.target.value)}
            placeholder="All actors"
            aria-label="Filter by actor"
            options={users.map((u) => ({ value: u.id, label: u.name }))}
          />
        </div>
      </GlassCard>

      <GlassPanel title="Activity" icon={ClipboardList}>
        {loading && entries.length === 0 ? (
          <p className="py-10 text-center text-xs text-ink-muted">Reading the trail…</p>
        ) : (
          <AuditTrailList entries={entries} showEntity limit={PAGE_SIZE} />
        )}

        {totalPages > 1 && (
          <div className="mt-4 flex items-center justify-between border-t border-brand-500/12 pt-3">
            <Button
              size="xs"
              variant="ghost"
              icon={ChevronLeft}
              disabled={page <= 1 || loading}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Newer
            </Button>
            <span className="text-[11px] text-ink-muted">
              Page {page} of {totalPages} · {total} entr{total === 1 ? 'y' : 'ies'}
            </span>
            <Button
              size="xs"
              variant="ghost"
              icon={ChevronRight}
              disabled={page >= totalPages || loading}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              Older
            </Button>
          </div>
        )}
      </GlassPanel>
    </div>
  );
}
