import { useMemo, useState } from 'react';
import { ClipboardList, Download, Search } from 'lucide-react';
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

/** Full platform audit trail. */
export default function AuditLog() {
  const auditLog = useAppStore((s) => s.auditLog);
  const users = useAppStore((s) => s.users);

  const [search, setSearch] = useState('');
  const [entityType, setEntityType] = useState('');
  const [actorId, setActorId] = useState('');

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return auditLog.filter((e) => {
      if (entityType && e.entityType !== entityType) return false;
      if (actorId && e.actorId !== actorId) return false;
      if (term && !`${e.action} ${e.entityId} ${e.actorName} ${e.reason ?? ''}`.toLowerCase().includes(term)) {
        return false;
      }
      return true;
    });
  }, [auditLog, search, entityType, actorId]);

  const withReasons = filtered.filter((e) => e.reason).length;
  const uniqueActors = new Set(filtered.map((e) => e.actorId)).size;

  const handleExport = async () => {
    await exportToXlsx({
      fileName: `dealflow360-audit-${new Date().toISOString().slice(0, 10)}.xlsx`,
      sheets: [
        {
          name: 'Audit log',
          rows: filtered.map((e) => ({
            Timestamp: dateMedium(e.at),
            Entity_Type: e.entityType,
            Entity_Id: e.entityId,
            Action: e.action,
            Actor: e.actorName,
            Role: roleLabel(e.actorRole),
            Reason: e.reason ?? '',
          })),
        },
      ],
    });
    toast.success('Audit log exported');
  };

  return (
    <div>
      <PageHeader
        title="Audit log"
        description="Append-only. Every approval, rejection, edit and configuration change is recorded with who, when and why."
        actions={
          <Button variant="secondary" size="sm" icon={Download} onClick={handleExport}>
            Export XLS
          </Button>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label="Entries"
          value={filtered.length}
          format={(v) => Math.round(v)}
          icon={ClipboardList}
        />
        <StatTile
          label="With a reason"
          value={withReasons}
          format={(v) => Math.round(v)}
          hint="rejections, returns, credits"
          tone="amber"
        />
        <StatTile
          label="Distinct actors"
          value={uniqueActors}
          format={(v) => Math.round(v)}
          tone="indigo"
        />
        <StatTile
          label="Total logged"
          value={auditLog.length}
          format={(v) => Math.round(v)}
          hint="before filtering"
          tone="teal"
        />
      </div>

      <GlassCard className="mb-4 p-3">
        <div className="grid gap-2.5 sm:grid-cols-3">
          <Input
            placeholder="Search actions, entities, reasons…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            prefix={<Search className="h-3.5 w-3.5" />}
            className="pl-9"
            aria-label="Search audit log"
          />
          <Select
            value={entityType}
            onChange={(e) => setEntityType(e.target.value)}
            placeholder="All entity types"
            aria-label="Filter by entity type"
            options={ENTITY_TYPES}
          />
          <Select
            value={actorId}
            onChange={(e) => setActorId(e.target.value)}
            placeholder="All actors"
            aria-label="Filter by actor"
            options={users.map((u) => ({ value: u.id, label: u.name }))}
          />
        </div>
      </GlassCard>

      <GlassPanel title="Activity" icon={ClipboardList}>
        <AuditTrailList entries={filtered} showEntity limit={120} />

        {filtered.length > 120 && (
          <p className="mt-3 text-center text-[11px] text-ink-muted">
            Showing the most recent 120 of {filtered.length} entries. Narrow the filters or export to
            see everything.
          </p>
        )}
      </GlassPanel>
    </div>
  );
}
