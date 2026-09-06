import { useMemo, useState } from 'react';
import { Check, ChevronDown, Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Popover } from '@/components/ui/Misc';

/**
 * Searchable multi-select for filters that must survive a growing dataset.
 *
 * WHAT IT REPLACES. The reporting filters rendered one chip per option, inline and
 * always visible. With three seeded reps that reads fine; with thirty it is a wall of
 * buttons that pushes the actual report below the fold, and with three hundred it is
 * unusable — you cannot find a name by scanning, and there is no way to search. The
 * number of chips was a function of how many people work there, which is not something
 * a filter layout should be sensitive to.
 *
 * A trigger that states the current selection, opening a searchable, scrollable list,
 * costs one line of vertical space regardless of how many options exist.
 *
 * SELECTED OPTIONS SORT TO THE TOP once the popover opens, so deselecting something does
 * not mean hunting for it again in a long list.
 */
export function MultiSelect({
  label,
  options = [],
  value = [],
  onChange,
  placeholder = 'All',
  searchPlaceholder = 'Search…',
  emptyLabel = 'Nothing to choose from',
  className,
}) {
  const [term, setTerm] = useState('');

  const selected = useMemo(() => new Set(value), [value]);

  const visible = useMemo(() => {
    const q = term.trim().toLowerCase();
    const matched = q
      ? options.filter((o) => o.label.toLowerCase().includes(q))
      : options.slice();

    // Chosen first, then alphabetical — so the current selection is always reachable
    // without scrolling, however long the list is.
    return matched.sort((a, b) => {
      const sa = selected.has(a.value) ? 0 : 1;
      const sb = selected.has(b.value) ? 0 : 1;
      return sa !== sb ? sa - sb : a.label.localeCompare(b.label);
    });
  }, [options, term, selected]);

  const toggle = (v) =>
    onChange(selected.has(v) ? value.filter((x) => x !== v) : [...value, v]);

  const summary =
    value.length === 0
      ? placeholder
      : value.length === 1
        ? (options.find((o) => o.value === value[0])?.label ?? '1 selected')
        : `${value.length} selected`;

  return (
    <div className={className}>
      {label && <p className="mb-1.5 text-[11px] font-semibold text-ink-soft">{label}</p>}

      <Popover
        align="start"
        className="w-64 p-0"
        trigger={
          <button
            type="button"
            className={cn(
              'flex h-9 w-full items-center gap-2 rounded-lg border border-brand-500/20 bg-white/70 px-2.5',
              'text-left text-xs font-semibold transition-colors hover:border-brand-500/40',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/25',
              value.length > 0 ? 'text-ink' : 'text-ink-muted',
            )}
          >
            <span className="min-w-0 flex-1 truncate">{summary}</span>
            {value.length > 0 && (
              <span
                role="button"
                tabIndex={0}
                aria-label={`Clear ${label ?? 'selection'}`}
                onClick={(e) => {
                  // Stop the popover opening when the intent was only to clear.
                  e.stopPropagation();
                  onChange([]);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.stopPropagation();
                    e.preventDefault();
                    onChange([]);
                  }
                }}
                className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-brand-500/15 text-brand-700 hover:bg-brand-500/25"
              >
                <X className="h-2.5 w-2.5" aria-hidden="true" />
              </span>
            )}
            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-ink-muted" aria-hidden="true" />
          </button>
        }
      >
        <div className="border-b border-brand-500/12 p-2">
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-muted"
              aria-hidden="true"
            />
            <input
              autoFocus
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              placeholder={searchPlaceholder}
              aria-label={searchPlaceholder}
              className="h-8 w-full rounded-lg border border-brand-500/20 bg-white/80 pl-8 pr-2 text-xs text-ink placeholder:text-ink-muted focus:border-brand-500/50 focus:outline-none focus:ring-2 focus:ring-brand-500/25"
            />
          </div>
        </div>

        <div className="max-h-56 overflow-y-auto overscroll-contain p-1">
          {visible.length === 0 ? (
            <p className="px-2.5 py-6 text-center text-[11px] text-ink-muted">
              {options.length === 0 ? emptyLabel : 'No match'}
            </p>
          ) : (
            visible.map((o) => {
              const on = selected.has(o.value);
              return (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => toggle(o.value)}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs transition-colors',
                    on ? 'bg-brand-500/12 font-semibold text-brand-700' : 'text-ink-soft hover:bg-brand-500/8',
                  )}
                >
                  <span
                    className={cn(
                      'inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border',
                      on ? 'border-brand-500 bg-brand-500 text-white' : 'border-brand-500/30',
                    )}
                  >
                    {on && <Check className="h-2.5 w-2.5" aria-hidden="true" />}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{o.label}</span>
                  {o.hint && <span className="shrink-0 text-[10px] text-ink-muted">{o.hint}</span>}
                </button>
              );
            })
          )}
        </div>
      </Popover>
    </div>
  );
}
