import { motion } from 'framer-motion';
import { AlertTriangle, CheckCircle2, ShieldAlert } from 'lucide-react';
import { formatScore, riskBand, riskBandMeta } from '@/lib/riskEngine';
import { cn } from '@/lib/utils';

const MAX_SCORE = 15;

/**
 * Semicircular blended-risk gauge. The number is the value-weighted average
 * overage in discount points across the order.
 */
export function RiskGauge({ score = 0, label, size = 'md', showLabel = true, className }) {
  const meta = riskBandMeta(score);
  const band = riskBand(score);
  const pct = Math.min(1, score / MAX_SCORE);

  const dims = {
    sm: { w: 120, h: 68, r: 46, stroke: 8, text: 'text-lg' },
    md: { w: 168, h: 92, r: 64, stroke: 10, text: 'text-2xl' },
    lg: { w: 220, h: 120, r: 86, stroke: 12, text: 'text-3xl' },
  }[size];

  const { w, h, r, stroke } = dims;
  const cx = w / 2;
  const cy = h - 6;
  const circumference = Math.PI * r;

  const Icon = band === 'low' ? CheckCircle2 : band === 'medium' ? AlertTriangle : ShieldAlert;

  return (
    <div className={cn('flex flex-col items-center', className)}>
      <div className="relative" style={{ width: w, height: h }}>
        <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="img" aria-label={`Blended risk score ${formatScore(score)} points, ${meta.label}`}>
          <defs>
            <linearGradient id={`riskgrad-${band}`} x1="0" y1="0" x2="1" y2="0">
              {band === 'low' && (
                <>
                  <stop offset="0%" stopColor="#22c55e" />
                  <stop offset="100%" stopColor="#14b8a6" />
                </>
              )}
              {band === 'medium' && (
                <>
                  <stop offset="0%" stopColor="#f59e0b" />
                  <stop offset="100%" stopColor="#ec4899" />
                </>
              )}
              {band === 'high' && (
                <>
                  <stop offset="0%" stopColor="#ef4444" />
                  <stop offset="100%" stopColor="#7c3aed" />
                </>
              )}
            </linearGradient>
          </defs>

          {/* track */}
          <path
            d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
            fill="none"
            stroke="rgba(139,92,246,0.14)"
            strokeWidth={stroke}
            strokeLinecap="round"
          />

          {/* value */}
          <motion.path
            d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
            fill="none"
            stroke={`url(#riskgrad-${band})`}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={circumference}
            initial={false}
            animate={{ strokeDashoffset: circumference * (1 - pct) }}
            transition={{ type: 'spring', stiffness: 120, damping: 20 }}
          />
        </svg>

        <div className="absolute inset-x-0 bottom-0 flex flex-col items-center">
          <motion.span
            key={score}
            initial={{ scale: 1.12 }}
            animate={{ scale: 1 }}
            transition={{ duration: 0.28 }}
            className={cn('num font-extrabold leading-none', dims.text, meta.tone)}
          >
            {formatScore(score)}
          </motion.span>
          <span className="text-[10px] font-semibold uppercase tracking-wider text-ink-muted">
            pts over
          </span>
        </div>
      </div>

      {showLabel && (
        <span
          className={cn(
            'mt-1.5 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold',
            meta.bg,
            meta.tone,
          )}
        >
          <Icon className="h-3.5 w-3.5" aria-hidden="true" />
          {label ?? meta.label}
        </span>
      )}
    </div>
  );
}

/** Compact inline risk chip for tables and cards. */
export function RiskBadge({ score = 0, showScore = true, className }) {
  const meta = riskBandMeta(score);
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-bold',
        meta.bg,
        meta.tone,
        className,
      )}
      title={meta.label}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full', meta.dot)} />
      {showScore ? formatScore(score) : meta.label}
    </span>
  );
}
