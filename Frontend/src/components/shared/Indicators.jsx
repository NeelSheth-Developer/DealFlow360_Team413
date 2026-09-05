import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Award, Clock, TrendingDown, TrendingUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { money, relativeTime, stageLabel, tierLabel } from '@/lib/format';
import { stageMeta } from '@/lib/stageMachine';
import { RawBadge } from '@/components/ui/Badge';

// ------------------------------------------------------------- PulseOnChange

/**
 * Wraps a live value and pulses whenever it changes — used on the order total,
 * margin and risk score so accepting an upsell has visible feedback.
 */
export function PulseOnChange({ value, children, className, tone = 'auto' }) {
  const previous = useRef(value);
  const [direction, setDirection] = useState(null);
  const [pulseKey, setPulseKey] = useState(0);

  useEffect(() => {
    if (previous.current !== value) {
      const numeric = typeof value === 'number' && typeof previous.current === 'number';
      setDirection(numeric ? (value > previous.current ? 'up' : 'down') : 'change');
      setPulseKey((k) => k + 1);
      previous.current = value;
    }
  }, [value]);

  const flash =
    tone === 'none' || direction === null
      ? ''
      : tone === 'auto'
        ? direction === 'up'
          ? 'text-state-success'
          : direction === 'down'
            ? 'text-accent-amber'
            : ''
        : tone;

  return (
    <motion.span
      key={pulseKey}
      initial={pulseKey === 0 ? false : { scale: 1.07 }}
      animate={{ scale: 1 }}
      transition={{ duration: 0.35, ease: 'easeOut' }}
      className={cn('inline-block', className)}
    >
      <span className={cn('transition-colors duration-700', flash)}>{children}</span>
    </motion.span>
  );
}

// -------------------------------------------------------------------- Badges

export function StageBadge({ stage, className, size = 'sm' }) {
  const meta = stageMeta(stage);
  return (
    <RawBadge
      dot
      dotClass={meta.dot}
      className={cn(meta.bg, meta.tone, size === 'xs' && 'px-1.5 text-[10px]', className)}
    >
      {stageLabel(stage)}
    </RawBadge>
  );
}

const TIER_STYLES = {
  bronze: 'bg-amber-700/12 text-amber-800',
  silver: 'bg-slate-400/18 text-slate-600',
  gold: 'bg-accent-amber/18 text-amber-700',
};

export function TierBadge({ tier, className, showIcon = true }) {
  return (
    <RawBadge
      icon={showIcon ? Award : null}
      className={cn(TIER_STYLES[tier] ?? TIER_STYLES.bronze, className)}
    >
      {tierLabel(tier)}
    </RawBadge>
  );
}

/** Idle-time badge whose intensity scales with staleness. */
export function StaleBadge({ days, threshold, className }) {
  if (days <= threshold) return null;
  const ratio = days / threshold;
  const tone =
    ratio >= 3
      ? 'bg-state-danger/14 text-state-danger'
      : ratio >= 2
        ? 'bg-accent-amber/16 text-accent-amber'
        : 'bg-state-info/12 text-state-info';

  return (
    <RawBadge icon={Clock} className={cn(tone, className)}>
      {days}d idle
    </RawBadge>
  );
}

// ---------------------------------------------------------------- MoneyText

export function MoneyText({ amount, currency = 'INR', className, decimals = 0, signed = false }) {
  const positive = amount >= 0;
  return (
    <span className={cn('num', className)}>
      {signed && positive && '+'}
      {money(amount, currency, decimals)}
    </span>
  );
}

/** Signed delta with an arrow — used for margin impact on upsell cards. */
export function DeltaText({ value, currency = null, suffix = '', className, invert = false }) {
  const positive = value >= 0;
  const good = invert ? !positive : positive;
  const Icon = positive ? TrendingUp : TrendingDown;

  return (
    <span
      className={cn(
        'num inline-flex items-center gap-1 font-bold',
        good ? 'text-state-success' : 'text-state-danger',
        className,
      )}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {positive ? '+' : '−'}
      {currency ? money(Math.abs(value), currency) : Math.abs(value).toFixed(1)}
      {suffix}
    </span>
  );
}

// ------------------------------------------------------------- RelativeTime

export function RelativeTime({ value, className, prefix = '' }) {
  return (
    <time dateTime={value} title={new Date(value).toLocaleString()} className={cn('text-xs', className)}>
      {prefix}
      {relativeTime(value)}
    </time>
  );
}

// ----------------------------------------------------------------- StatTile

/** KPI tile with a count-up animation on mount. */
export function StatTile({
  label,
  value,
  format = (v) => v,
  hint,
  icon: Icon,
  tone = 'brand',
  className,
  animate = true,
}) {
  const [display, setDisplay] = useState(animate ? 0 : value);

  useEffect(() => {
    if (!animate || typeof value !== 'number') {
      setDisplay(value);
      return undefined;
    }
    const duration = 620;
    const start = performance.now();
    let frame;

    const tick = (now) => {
      const progress = Math.min(1, (now - start) / duration);
      // easeOutCubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(value * eased);
      if (progress < 1) frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, animate]);

  const tones = {
    brand: 'text-brand-600 bg-brand-500/12',
    indigo: 'text-accent-indigo bg-accent-indigo/12',
    teal: 'text-accent-teal bg-accent-teal/12',
    pink: 'text-accent-pink bg-accent-pink/12',
    amber: 'text-accent-amber bg-accent-amber/14',
    danger: 'text-state-danger bg-state-danger/12',
    success: 'text-state-success bg-state-success/12',
  };

  return (
    <div className={cn('glass glass-hover p-4', className)}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted">{label}</p>
        {Icon && (
          <span
            className={cn(
              'inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg',
              tones[tone],
            )}
          >
            <Icon className="h-3.5 w-3.5" aria-hidden="true" />
          </span>
        )}
      </div>
      <p className="num mt-2 text-2xl font-extrabold leading-none tracking-tight text-ink">
        {format(display)}
      </p>
      {hint && <p className="mt-1.5 text-[11px] text-ink-muted">{hint}</p>}
    </div>
  );
}
