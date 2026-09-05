import * as RadixTabs from '@radix-ui/react-tabs';
import { cn } from '@/lib/utils';

export function Tabs({ value, onValueChange, children, className, defaultValue }) {
  return (
    <RadixTabs.Root
      value={value}
      defaultValue={defaultValue}
      onValueChange={onValueChange}
      className={className}
    >
      {children}
    </RadixTabs.Root>
  );
}

export function TabsList({ children, className }) {
  return (
    <RadixTabs.List
      className={cn(
        'inline-flex items-center gap-1 rounded-xl border border-brand-500/15 bg-white/50 p-1',
        className,
      )}
    >
      {children}
    </RadixTabs.List>
  );
}

export function TabsTrigger({ value, children, className, icon: Icon = null, count = null }) {
  return (
    <RadixTabs.Trigger
      value={value}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-ink-soft transition-all',
        'hover:text-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500',
        'data-[state=active]:bg-gradient-to-r data-[state=active]:from-brand-500 data-[state=active]:to-accent-indigo data-[state=active]:text-white data-[state=active]:shadow-glass',
        className,
      )}
    >
      {Icon && <Icon className="h-3.5 w-3.5" aria-hidden="true" />}
      {children}
      {count != null && (
        <span className="rounded-full bg-current/15 px-1.5 text-[10px] font-bold">{count}</span>
      )}
    </RadixTabs.Trigger>
  );
}

export function TabsContent({ value, children, className }) {
  return (
    <RadixTabs.Content value={value} className={cn('mt-4 focus-visible:outline-none', className)}>
      {children}
    </RadixTabs.Content>
  );
}

/** Two-or-three-option toggle, e.g. List / Kanban. */
export function SegmentedControl({ value, onChange, options, className, size = 'md' }) {
  const pad = size === 'sm' ? 'px-2.5 py-1 text-[11px]' : 'px-3 py-1.5 text-xs';
  return (
    <div
      role="tablist"
      aria-label="View mode"
      className={cn(
        'inline-flex items-center gap-1 rounded-xl border border-brand-500/15 bg-white/50 p-1',
        className,
      )}
    >
      {options.map((opt) => {
        const active = opt.value === value;
        const Icon = opt.icon;
        return (
          <button
            key={opt.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(opt.value)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-lg font-semibold transition-all',
              pad,
              active
                ? 'bg-gradient-to-r from-brand-500 to-accent-indigo text-white shadow-glass'
                : 'text-ink-soft hover:text-brand-700',
            )}
          >
            {Icon && <Icon className="h-3.5 w-3.5" aria-hidden="true" />}
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
