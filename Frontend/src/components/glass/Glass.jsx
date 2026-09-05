import { cn } from '@/lib/utils';

/** Standard frosted card. `hover` adds the lift interaction. */
export function GlassCard({ children, className, strong = false, hover = false, as: Tag = 'div', ...props }) {
  return (
    <Tag
      className={cn(strong ? 'glass-strong' : 'glass', hover && 'glass-hover', className)}
      {...props}
    >
      {children}
    </Tag>
  );
}

/** Card with a titled header row. */
export function GlassPanel({
  title,
  description,
  actions,
  children,
  className,
  bodyClassName,
  strong = false,
  icon: Icon = null,
  accent = 'brand',
}) {
  const accents = {
    brand: 'text-brand-600 bg-brand-500/12',
    indigo: 'text-accent-indigo bg-accent-indigo/12',
    pink: 'text-accent-pink bg-accent-pink/12',
    teal: 'text-accent-teal bg-accent-teal/12',
    amber: 'text-accent-amber bg-accent-amber/14',
    danger: 'text-state-danger bg-state-danger/12',
  };

  return (
    <section className={cn(strong ? 'glass-strong' : 'glass', 'overflow-hidden', className)}>
      {(title || actions) && (
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-brand-500/12 px-4 py-3 sm:px-5">
          <div className="flex min-w-0 items-center gap-2.5">
            {Icon && (
              <span
                className={cn(
                  'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl',
                  accents[accent],
                )}
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
              </span>
            )}
            <div className="min-w-0">
              {title && (
                <h2 className="truncate text-sm font-bold tracking-tight text-ink">{title}</h2>
              )}
              {description && <p className="mt-0.5 text-xs text-ink-muted">{description}</p>}
            </div>
          </div>
          {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={cn('px-4 py-4 sm:px-5', bodyClassName)}>{children}</div>
    </section>
  );
}

/** Animated gradient blobs sitting behind every layout. */
export function GradientBlobBackground({ variant = 'default' }) {
  const layouts = {
    default: [
      { cls: 'blob--violet', style: { width: 420, height: 420, top: -120, left: -100 } },
      { cls: 'blob--pink', style: { width: 380, height: 380, top: '30%', right: -140 } },
      { cls: 'blob--indigo', style: { width: 340, height: 340, bottom: -120, left: '25%' } },
    ],
    hero: [
      { cls: 'blob--violet', style: { width: 560, height: 560, top: -160, left: -140 } },
      { cls: 'blob--pink', style: { width: 520, height: 520, top: -80, right: -180 } },
      { cls: 'blob--indigo', style: { width: 460, height: 460, top: '55%', left: '35%' } },
    ],
    subtle: [
      { cls: 'blob--violet', style: { width: 320, height: 320, top: -80, right: -80, opacity: 0.3 } },
      { cls: 'blob--pink', style: { width: 280, height: 280, bottom: -80, left: -60, opacity: 0.28 } },
    ],
  };

  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 overflow-hidden">
      {layouts[variant].map((blob, i) => (
        <span key={i} className={cn('blob', blob.cls)} style={blob.style} />
      ))}
    </div>
  );
}

/** Section heading used on the landing page and page headers. */
export function SectionHeading({ eyebrow, title, description, center = false, className }) {
  return (
    <div className={cn('max-w-2xl', center && 'mx-auto text-center', className)}>
      {eyebrow && (
        <span className="mb-2 inline-block rounded-full bg-brand-500/12 px-3 py-1 text-[11px] font-bold uppercase tracking-widest text-brand-700">
          {eyebrow}
        </span>
      )}
      <h2 className="text-2xl font-extrabold tracking-tight text-ink sm:text-3xl">{title}</h2>
      {description && (
        <p className="mt-3 text-sm leading-relaxed text-ink-soft sm:text-base">{description}</p>
      )}
    </div>
  );
}
