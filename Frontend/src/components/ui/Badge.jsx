import { cn } from '@/lib/utils';

const TONES = {
  neutral: 'bg-ink/8 text-ink-soft',
  brand: 'bg-brand-500/14 text-brand-700',
  success: 'bg-state-success/14 text-state-success',
  warning: 'bg-accent-amber/16 text-accent-amber',
  danger: 'bg-state-danger/12 text-state-danger',
  info: 'bg-state-info/12 text-state-info',
  teal: 'bg-accent-teal/14 text-accent-teal',
  pink: 'bg-accent-pink/14 text-accent-pink',
  indigo: 'bg-accent-indigo/14 text-accent-indigo',
};

const SIZES = {
  xs: 'px-1.5 py-0.5 text-[10px]',
  sm: 'px-2 py-0.5 text-xs',
  md: 'px-2.5 py-1 text-xs',
};

export function Badge({
  children,
  tone = 'neutral',
  size = 'sm',
  className,
  icon: Icon = null,
  dot = false,
  dotClass = '',
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 whitespace-nowrap rounded-full font-semibold',
        TONES[tone] ?? TONES.neutral,
        SIZES[size],
        className,
      )}
    >
      {dot && <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', dotClass || 'bg-current')} />}
      {Icon && <Icon className="h-3 w-3 shrink-0" aria-hidden="true" />}
      {children}
    </span>
  );
}

/** Free-form badge that takes raw colour classes, for meta-driven tones. */
export function RawBadge({ children, className, icon: Icon = null, dot = false, dotClass = '' }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold',
        className,
      )}
    >
      {dot && <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', dotClass)} />}
      {Icon && <Icon className="h-3 w-3 shrink-0" aria-hidden="true" />}
      {children}
    </span>
  );
}
