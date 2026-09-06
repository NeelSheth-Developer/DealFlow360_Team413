import { History, MessageSquare } from 'lucide-react';
import { dateMedium, roleLabel } from '@/lib/format';
import { cn } from '@/lib/utils';
import { Avatar } from '@/components/ui/Misc';
import { EmptyState } from '@/components/ui/Misc';

const ROLE_GRADIENT = {
  sales_rep: 'from-brand-500 to-accent-indigo',
  sales_manager: 'from-brand-600 to-accent-pink',
  finance: 'from-accent-amber to-accent-pink',
  admin: 'from-brand-700 to-brand-400',
  customer: 'from-accent-teal to-state-info',
  system: 'from-ink-muted to-ink-soft',
};

/**
 * Immutable, chronological audit trail. Read-only by design — entries are never
 * editable from the UI.
 */
export function AuditTrailList({ entries = [], className, limit = null, showEntity = false }) {
  const items = limit ? entries.slice(0, limit) : entries;

  if (!items.length) {
    return (
      <EmptyState
        icon={History}
        title="Nothing logged yet"
        description="Approvals, edits and rejections will appear here with who did what and when."
      />
    );
  }

  return (
    <ol className={cn('space-y-3', className)}>
      {items.map((entry) => (
        <li key={entry.id} className="flex gap-3">
          <div className="flex flex-col items-center">
            <Avatar
              name={entry.actorName}
              size="sm"
              gradient={ROLE_GRADIENT[entry.actorRole] ?? ROLE_GRADIENT.system}
            />
            <span className="mt-1 w-px flex-1 bg-brand-500/15" aria-hidden="true" />
          </div>

          <div className="min-w-0 flex-1 pb-1">
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <span className="text-xs font-bold text-ink">{entry.actorName}</span>
              <span className="text-[11px] font-medium text-ink-muted">
                {roleLabel(entry.actorRole)}
              </span>
              <time
                dateTime={entry.at}
                className="ml-auto shrink-0 text-[11px] tabular-nums text-ink-muted"
              >
                {dateMedium(entry.at)}
              </time>
            </div>

            <p className="mt-0.5 text-sm leading-snug text-ink-soft">{entry.action}</p>

            {showEntity && (
              // `entityRef` is the human reference ("Q-1038"); `entityId` is the uuid.
              // They are different fields, and only the first means anything on screen.
              <p className="mt-0.5 text-[11px] font-medium text-brand-600">
                {entry.entityType} · {entry.entityRef ?? entry.entityId}
              </p>
            )}

            {entry.reason && (
              <div className="mt-1.5 flex items-start gap-2 rounded-lg bg-brand-500/8 px-2.5 py-2">
                <MessageSquare
                  className="mt-0.5 h-3 w-3 shrink-0 text-brand-600"
                  aria-hidden="true"
                />
                <p className="text-xs italic leading-relaxed text-ink-soft">{entry.reason}</p>
              </div>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}
