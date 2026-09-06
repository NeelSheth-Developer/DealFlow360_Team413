import { forwardRef } from 'react';
import { cn } from '@/lib/utils';
import { Spinner } from '@/components/ui/Loading';

const VARIANTS = {
  primary: 'btn-gradient shadow-glass hover:shadow-glass-hover',
  secondary:
    'bg-white/70 text-ink border border-brand-500/20 hover:bg-white hover:border-brand-500/40',
  ghost: 'text-ink-soft hover:bg-brand-500/10 hover:text-brand-700',
  outline: 'border border-brand-500/35 text-brand-700 hover:bg-brand-500/10',
  danger: 'bg-state-danger text-white hover:bg-state-danger/90',
  success: 'bg-state-success text-white hover:bg-state-success/90',
  warning: 'bg-accent-amber text-white hover:bg-accent-amber/90',
  subtle: 'bg-brand-500/12 text-brand-700 hover:bg-brand-500/20',
};

const SIZES = {
  xs: 'h-7 px-2.5 text-xs gap-1',
  sm: 'h-8 px-3 text-xs gap-1.5',
  md: 'h-10 px-4 text-sm gap-2',
  lg: 'h-12 px-6 text-base gap-2.5',
};

/** The single button used across the app. `as` lets it render a Link. */
export const Button = forwardRef(function Button(
  {
    variant = 'primary',
    size = 'md',
    className,
    children,
    loading = false,
    disabled = false,
    icon: Icon = null,
    iconRight: IconRight = null,
    fullWidth = false,
    type = 'button',
    ...props
  },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      className={cn(
        'inline-flex items-center justify-center rounded-xl font-semibold transition-all',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2',
        'disabled:cursor-not-allowed disabled:opacity-50',
        VARIANTS[variant],
        SIZES[size],
        fullWidth && 'w-full',
        className,
      )}
      {...props}
    >
      {loading ? (
        <Spinner size="md" />
      ) : (
        Icon && <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
      )}
      {children}
      {IconRight && !loading && <IconRight className="h-4 w-4 shrink-0" aria-hidden="true" />}
    </button>
  );
});

/** Icon-only button. `label` is required and becomes the accessible name. */
export const IconButton = forwardRef(function IconButton(
  { icon: Icon, label, variant = 'ghost', size = 'md', className, ...props },
  ref,
) {
  const box = { xs: 'h-7 w-7', sm: 'h-8 w-8', md: 'h-10 w-10', lg: 'h-12 w-12' }[size];
  const iconSize = { xs: 'h-3.5 w-3.5', sm: 'h-4 w-4', md: 'h-4 w-4', lg: 'h-5 w-5' }[size];

  return (
    <button
      ref={ref}
      type="button"
      aria-label={label}
      title={label}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-xl transition-all',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2',
        'disabled:cursor-not-allowed disabled:opacity-50',
        VARIANTS[variant],
        box,
        className,
      )}
      {...props}
    >
      <Icon className={iconSize} aria-hidden="true" />
    </button>
  );
});
