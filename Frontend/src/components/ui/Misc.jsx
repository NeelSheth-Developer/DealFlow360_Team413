import * as RadixSwitch from '@radix-ui/react-switch';
import * as RadixSlider from '@radix-ui/react-slider';
import * as RadixTooltip from '@radix-ui/react-tooltip';
import * as RadixPopover from '@radix-ui/react-popover';
import { Minus, Plus } from 'lucide-react';
import { cn, initials } from '@/lib/utils';
import { IconButton } from './Button';

// ------------------------------------------------------------------- Switch

export function Switch({ checked, onCheckedChange, label, hint, id, disabled }) {
  return (
    <div className="flex items-start gap-3">
      <RadixSwitch.Root
        id={id}
        checked={checked}
        onCheckedChange={onCheckedChange}
        disabled={disabled}
        className={cn(
          'relative h-5 w-9 shrink-0 rounded-full border border-brand-500/20 transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2',
          'data-[state=checked]:border-transparent data-[state=checked]:bg-brand-500 data-[state=unchecked]:bg-ink/15',
          disabled && 'cursor-not-allowed opacity-50',
        )}
      >
        <RadixSwitch.Thumb className="block h-4 w-4 translate-x-0.5 rounded-full bg-white shadow transition-transform data-[state=checked]:translate-x-[1.15rem]" />
      </RadixSwitch.Root>
      {(label || hint) && (
        <div className="min-w-0">
          {label && (
            <label htmlFor={id} className="cursor-pointer text-xs font-semibold text-ink">
              {label}
            </label>
          )}
          {hint && <p className="text-xs text-ink-muted">{hint}</p>}
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------- Slider

export function Slider({ value, onValueChange, min = 0, max = 100, step = 1, label, valueLabel, id }) {
  return (
    <div className="space-y-2">
      {(label || valueLabel) && (
        <div className="flex items-center justify-between">
          {label && (
            <label htmlFor={id} className="text-xs font-semibold text-ink-soft">
              {label}
            </label>
          )}
          {valueLabel && <span className="num text-xs font-bold text-brand-700">{valueLabel}</span>}
        </div>
      )}
      <RadixSlider.Root
        id={id}
        value={[value]}
        onValueChange={(v) => onValueChange(v[0])}
        min={min}
        max={max}
        step={step}
        className="relative flex h-5 w-full touch-none select-none items-center"
      >
        <RadixSlider.Track className="relative h-1.5 w-full grow rounded-full bg-brand-500/15">
          <RadixSlider.Range className="absolute h-full rounded-full bg-gradient-to-r from-brand-500 to-accent-indigo" />
        </RadixSlider.Track>
        <RadixSlider.Thumb
          aria-label={label ?? 'Value'}
          className="block h-4 w-4 rounded-full border-2 border-brand-500 bg-white shadow transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
        />
      </RadixSlider.Root>
    </div>
  );
}

// ------------------------------------------------------------------ Tooltip

export function TooltipProvider({ children }) {
  return (
    <RadixTooltip.Provider delayDuration={220} skipDelayDuration={120}>
      {children}
    </RadixTooltip.Provider>
  );
}

export function Tooltip({ children, content, side = 'top' }) {
  if (!content) return children;
  return (
    <RadixTooltip.Root>
      <RadixTooltip.Trigger asChild>{children}</RadixTooltip.Trigger>
      <RadixTooltip.Portal>
        <RadixTooltip.Content
          side={side}
          sideOffset={6}
          className="z-[60] max-w-xs rounded-lg bg-ink px-2.5 py-1.5 text-xs font-medium leading-relaxed text-white shadow-lg"
        >
          {content}
          <RadixTooltip.Arrow className="fill-ink" />
        </RadixTooltip.Content>
      </RadixTooltip.Portal>
    </RadixTooltip.Root>
  );
}

// ------------------------------------------------------------------ Popover

export function Popover({ trigger, children, align = 'end', className, side = 'bottom' }) {
  return (
    <RadixPopover.Root>
      <RadixPopover.Trigger asChild>{trigger}</RadixPopover.Trigger>
      <RadixPopover.Portal>
        <RadixPopover.Content
          align={align}
          side={side}
          sideOffset={8}
          className={cn(
            'glass-strong z-[60] w-80 p-4 focus-visible:outline-none',
            'data-[state=open]:animate-slideUp',
            className,
          )}
        >
          {children}
        </RadixPopover.Content>
      </RadixPopover.Portal>
    </RadixPopover.Root>
  );
}

// -------------------------------------------------------------- QtyStepper

export function QtyStepper({ value, onChange, min = 1, max = 9999, disabled = false, size = 'sm' }) {
  const btn = size === 'xs' ? 'xs' : 'sm';
  return (
    <div className="inline-flex items-center gap-1">
      <IconButton
        icon={Minus}
        label="Decrease quantity"
        size={btn}
        variant="secondary"
        disabled={disabled || value <= min}
        onClick={() => onChange(Math.max(min, value - 1))}
      />
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        disabled={disabled}
        aria-label="Quantity"
        onChange={(e) => {
          const next = Number(e.target.value);
          if (Number.isNaN(next)) return;
          onChange(Math.max(min, Math.min(max, next)));
        }}
        className="num h-8 w-14 rounded-lg border border-brand-500/20 bg-white/70 text-center text-sm font-semibold text-ink focus:border-brand-500/50 focus:outline-none focus:ring-2 focus:ring-brand-500/25 disabled:opacity-60"
      />
      <IconButton
        icon={Plus}
        label="Increase quantity"
        size={btn}
        variant="secondary"
        disabled={disabled || value >= max}
        onClick={() => onChange(Math.min(max, value + 1))}
      />
    </div>
  );
}

// ------------------------------------------------------------------ Avatar

export function Avatar({ name, gradient = 'from-brand-500 to-accent-indigo', size = 'md', className }) {
  const box = {
    xs: 'h-6 w-6 text-[10px]',
    sm: 'h-8 w-8 text-xs',
    md: 'h-9 w-9 text-xs',
    lg: 'h-12 w-12 text-sm',
  }[size];

  return (
    <span
      aria-hidden="true"
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br font-bold text-white shadow-sm',
        gradient,
        box,
        className,
      )}
    >
      {initials(name)}
    </span>
  );
}

// -------------------------------------------------------------- Progress

export function ProgressBar({ value, max = 100, tone = 'brand', className, gradient = null }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  const tones = {
    brand: 'bg-gradient-to-r from-brand-500 to-accent-indigo',
    success: 'bg-state-success',
    warning: 'bg-accent-amber',
    danger: 'bg-state-danger',
  };
  return (
    <div
      className={cn('h-1.5 w-full overflow-hidden rounded-full bg-brand-500/12', className)}
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className={cn('h-full rounded-full transition-all duration-500', !gradient && tones[tone])}
        style={gradient ? { width: `${pct}%`, background: gradient } : { width: `${pct}%` }}
      />
    </div>
  );
}

// ------------------------------------------------------------ EmptyState

export function EmptyState({ icon: Icon, title, description, action, className }) {
  return (
    <div className={cn('flex flex-col items-center justify-center px-6 py-12 text-center', className)}>
      {Icon && (
        <span className="mb-3 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-500/10 text-brand-600">
          <Icon className="h-6 w-6" aria-hidden="true" />
        </span>
      )}
      <p className="text-sm font-bold text-ink">{title}</p>
      {description && <p className="mt-1 max-w-sm text-xs text-ink-muted">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

// --------------------------------------------------------------- Skeleton

export function Skeleton({ className }) {
  return (
    <div className={cn('relative overflow-hidden rounded-lg bg-brand-500/10', className)}>
      <div className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-white/60 to-transparent" />
    </div>
  );
}
