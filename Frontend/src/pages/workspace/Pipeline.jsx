import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { toast } from 'sonner';
import { Kanban, List, Plus, Search } from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import { selectPipelineColumns } from '@/store/selectors';
import { useAllRisks } from '@/hooks/useRisk';
import { stageMeta } from '@/lib/stageMachine';
import { money, stageLabel } from '@/lib/format';
import { cn } from '@/lib/utils';
import { GlassCard } from '@/components/glass/Glass';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Input';
import { SegmentedControl } from '@/components/ui/Tabs';
import { Avatar } from '@/components/ui/Misc';
import { RiskBadge } from '@/components/shared/RiskGauge';
import { StaleBadge, TierBadge } from '@/components/shared/Indicators';

/** Kanban pipeline (spec B2) with business-rule-validated drag and drop. */
export default function Pipeline() {
  const navigate = useNavigate();
  const users = useAppStore((s) => s.users);
  const moveStage = useAppStore((s) => s.moveStage);
  const stallThreshold = useAppStore((s) => s.dashboardConfig.stallThresholdDays);

  useAllRisks();

  const [search, setSearch] = useState('');
  const [ownerId, setOwnerId] = useState('');
  const [activeId, setActiveId] = useState(null);

  const filters = useMemo(() => ({ search, ownerId: ownerId || null }), [search, ownerId]);
  const columns = useAppStore((s) => selectPipelineColumns(s, filters));

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const activeCard = useMemo(() => {
    if (!activeId) return null;
    for (const col of columns) {
      const found = col.cards.find((c) => c.id === activeId);
      if (found) return found;
    }
    return null;
  }, [activeId, columns]);

  const handleDragEnd = (event) => {
    setActiveId(null);
    const { active, over } = event;
    if (!over) return;

    const quoteId = active.id;
    const toStage = over.id;
    const card = columns.flatMap((c) => c.cards).find((c) => c.id === quoteId);
    if (!card || card.stage === toStage) return;

    const result = moveStage(quoteId, toStage);
    if (result.ok) {
      toast.success(`${quoteId} moved to ${stageLabel(toStage)}`);
    } else {
      // Blocked moves explain themselves rather than silently snapping back.
      toast.error('That move is not allowed', { description: result.error });
    }
  };

  const totalValue = columns.reduce((sum, c) => sum + c.value, 0);
  const totalCount = columns.reduce((sum, c) => sum + c.count, 0);

  return (
    <div>
      <PageHeader
        title="Pipeline"
        description={`${totalCount} deal(s) · ${money(totalValue)} across all stages. Drag a card to change its stage.`}
        actions={
          <>
            <SegmentedControl
              value="kanban"
              onChange={(v) => v === 'list' && navigate('/app/quotations')}
              options={[
                { value: 'list', label: 'List', icon: List },
                { value: 'kanban', label: 'Kanban', icon: Kanban },
              ]}
            />
            <Link to="/app/quotations/new">
              <Button icon={Plus}>New Quotation</Button>
            </Link>
          </>
        }
      />

      <GlassCard className="mb-4 p-3">
        <div className="grid gap-2.5 sm:grid-cols-2 lg:max-w-xl">
          <Input
            placeholder="Search deals…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            prefix={<Search className="h-3.5 w-3.5" />}
            className="pl-9"
            aria-label="Search deals"
          />
          <Select
            value={ownerId}
            onChange={(e) => setOwnerId(e.target.value)}
            placeholder="All reps"
            aria-label="Filter by rep"
            options={users
              .filter((u) => u.role === 'sales_rep')
              .map((u) => ({ value: u.id, label: u.name }))}
          />
        </div>
      </GlassCard>

      <DndContext
        sensors={sensors}
        onDragStart={(e) => setActiveId(e.active.id)}
        onDragCancel={() => setActiveId(null)}
        onDragEnd={handleDragEnd}
      >
        <div className="flex gap-3 overflow-x-auto pb-4">
          {columns.map((column) => (
            <Column key={column.stage} column={column} threshold={stallThreshold} />
          ))}
        </div>

        <DragOverlay dropAnimation={{ duration: 180 }}>
          {activeCard && (
            <div className="rotate-2 scale-105">
              <Card card={activeCard} threshold={stallThreshold} dragging />
            </div>
          )}
        </DragOverlay>
      </DndContext>
    </div>
  );
}

function Column({ column, threshold }) {
  const { setNodeRef, isOver } = useDroppable({ id: column.stage });
  const meta = stageMeta(column.stage);

  return (
    <div className="flex w-72 shrink-0 flex-col">
      <div className="mb-2 flex items-center justify-between gap-2 px-1">
        <div className="flex items-center gap-2">
          <span className={cn('h-2 w-2 rounded-full', meta.dot)} />
          <span className="text-xs font-bold text-ink">{stageLabel(column.stage)}</span>
          <span className="rounded-full bg-ink/8 px-1.5 text-[10px] font-bold text-ink-muted">
            {column.count}
          </span>
        </div>
        <span className="num text-[11px] font-semibold text-ink-muted">
          {money(column.value)}
        </span>
      </div>

      <div
        ref={setNodeRef}
        className={cn(
          'flex min-h-[420px] flex-1 flex-col gap-2 rounded-glass border border-dashed p-2 transition-colors',
          isOver ? 'border-brand-500/50 bg-brand-500/8' : 'border-brand-500/15 bg-white/30',
        )}
      >
        {column.cards.length === 0 ? (
          <p className="px-2 py-6 text-center text-[11px] text-ink-muted">Nothing here</p>
        ) : (
          column.cards.map((card) => <DraggableCard key={card.id} card={card} threshold={threshold} />)
        )}
      </div>
    </div>
  );
}

function DraggableCard({ card, threshold }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: card.id });

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={cn('touch-none', isDragging && 'opacity-30')}
    >
      <Card card={card} threshold={threshold} />
    </div>
  );
}

function Card({ card, threshold, dragging = false }) {
  const meta = stageMeta(card.stage);

  return (
    <Link
      to={`/app/quotations/${card.id}`}
      onClick={(e) => dragging && e.preventDefault()}
      className={cn(
        'block rounded-xl border border-brand-500/15 bg-white/75 p-3 transition-all',
        !dragging && 'hover:-translate-y-0.5 hover:border-brand-500/40 hover:shadow-glass',
        dragging && 'shadow-glass-hover',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="num text-[11px] font-bold text-brand-700">{card.id}</span>
        <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', meta.dot)} />
      </div>

      <p className="mt-1 truncate text-sm font-bold text-ink">{card.customerName}</p>

      <p className="num mt-1 text-base font-extrabold text-ink">
        {money(card.totals.grandTotal, card.currency)}
      </p>

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <TierBadge tier={card.tier} showIcon={false} />
        <RiskBadge score={card.risk.score} />
        <StaleBadge days={card.idleDays} threshold={threshold} />
      </div>

      <div className="mt-2.5 flex items-center justify-between gap-2 border-t border-brand-500/10 pt-2">
        <div className="flex items-center gap-1.5">
          <Avatar name={card.ownerName} size="xs" />
          <span className="truncate text-[11px] text-ink-muted">{card.ownerName}</span>
        </div>
        <span className="shrink-0 text-[10px] text-ink-muted">{card.lines.length} lines</span>
      </div>
    </Link>
  );
}
