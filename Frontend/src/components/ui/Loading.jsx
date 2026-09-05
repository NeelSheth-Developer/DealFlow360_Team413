import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/Misc';

/**
 * The app's loading vocabulary, in one place.
 *
 * There used to be four hand-rolled circular spinners — a bordered `<span>` in
 * Quotations, Pipeline and Guards, a `Loader2` in Button, another in QuoteSummaryRail —
 * each with its own diameter, border width and colour. They read as four different
 * products. `Spinner` is now the only circular progress in the app and every one of
 * those sites renders it.
 *
 * WHICH ONE TO USE:
 *
 *   Spinner        an inline circular progress. Use INSIDE something that already has
 *                  its own layout — a button, a panel header, next to a label.
 *   LoadingBlock   a centred spinner plus a line of text. Use when a region has no
 *                  shape of its own to preserve.
 *   Skeleton*      use when the shape IS known — a list of rows, a table, a row of KPI
 *                  tiles. A skeleton that matches the real layout means the page does
 *                  not jump when the data lands, and it reads as "this is arriving"
 *                  rather than "something is happening somewhere".
 *
 * The rule of thumb: a spinner says *wait*, a skeleton says *what for*. Prefer the
 * skeleton wherever the final layout is predictable.
 */

const SPINNER_SIZE = {
  xs: 'h-3 w-3 border',
  sm: 'h-3.5 w-3.5 border-2',
  md: 'h-4 w-4 border-2',
  lg: 'h-6 w-6 border-2',
  xl: 'h-8 w-8 border-[3px]',
};

/**
 * One circular progress indicator, everywhere.
 *
 * A bordered span rather than an icon, so the arc inherits `currentColor` and the same
 * element works on a white panel and inside a gradient button without a second variant —
 * set the colour with a text class (`text-brand-600`) or let it inherit.
 *
 * TRANSPARENT TRACK, TWO COLOURED SEGMENTS. The obvious spelling for a faint track is
 * `border-current/25`, and it silently produces nothing: Tailwind cannot apply an opacity
 * modifier to `currentColor`, because there are no rgb channels to rewrite. The class is
 * dropped at build time, the border falls back to the default grey, and the "arc" becomes
 * a solid ring that looks static while it spins. A half-ring built from two transparent
 * and two coloured sides needs no opacity, compiles anywhere, and reads correctly on
 * every background this app uses.
 *
 * `role="status"` is attached only when there is a label to announce — an unlabelled
 * spinner beside visible text would make a screen reader say it twice.
 */
export function Spinner({ size = 'md', className, label = null }) {
  return (
    <span
      className={cn(
        'inline-block shrink-0 animate-spin rounded-full',
        'border-transparent border-t-current border-r-current',
        SPINNER_SIZE[size] ?? SPINNER_SIZE.md,
        className,
      )}
      role={label ? 'status' : undefined}
      aria-label={label ?? undefined}
      aria-hidden={label ? undefined : 'true'}
    />
  );
}

/** Centred spinner with a caption. The generic "no known shape" fallback. */
export function LoadingBlock({ label = 'Loading…', className, size = 'md' }) {
  return (
    <div className={cn('flex items-center justify-center gap-3 px-4 py-14', className)}>
      <Spinner size={size} className="text-brand-600" />
      <p className="text-xs font-semibold text-ink-soft" role="status">
        {label}
      </p>
    </div>
  );
}

/**
 * A stack of rows, shaped like a feed entry: icon, two lines of text, a short meta line.
 *
 * Used by the alert feed and any other list of cards, so a pending fetch keeps the
 * panel's height instead of collapsing it to a single line of text and pushing
 * everything below it up the page.
 */
export function SkeletonFeed({ rows = 4, className }) {
  return (
    <ul className={cn('divide-y divide-brand-500/10', className)} aria-hidden="true">
      {Array.from({ length: rows }).map((_, i) => (
        <li key={i} className="flex items-start gap-3 px-4 py-3.5 sm:px-5">
          <Skeleton className="h-8 w-8 shrink-0 rounded-xl" />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex items-center gap-2">
              <Skeleton className="h-3.5 w-20 rounded-full" />
              <Skeleton className="h-3 w-14" />
              <Skeleton className="ml-auto h-3 w-12" />
            </div>
            {/* Widths vary so the block reads as text rather than as a grid. */}
            <Skeleton className={cn('h-4', i % 2 ? 'w-2/3' : 'w-1/2')} />
            <Skeleton className="h-3 w-4/5" />
            <div className="flex gap-2 pt-1">
              <Skeleton className="h-7 w-16 rounded-lg" />
              <Skeleton className="h-7 w-20 rounded-lg" />
              <Skeleton className="h-7 w-16 rounded-lg" />
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Table body placeholder. `columns` keeps the column count so nothing reflows. */
export function SkeletonTable({ rows = 6, columns = 5, className }) {
  return (
    <div className={cn('divide-y divide-brand-500/10', className)} aria-hidden="true">
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex items-center gap-4 px-4 py-3 sm:px-5">
          {Array.from({ length: columns }).map((__, c) => (
            <Skeleton
              key={c}
              className={cn('h-4', c === 0 ? 'w-20 shrink-0' : 'flex-1')}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

/** A row of KPI tiles, matching the real tile's height so the header does not jump. */
export function SkeletonTiles({ count = 4, className }) {
  return (
    <div className={cn('grid gap-3', className)} aria-hidden="true">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="glass rounded-2xl p-4">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="mt-2.5 h-7 w-20" />
          <Skeleton className="mt-2 h-3 w-28" />
        </div>
      ))}
    </div>
  );
}

/** Generic stack of cards — the portal list, the pipeline column, a settings panel. */
export function SkeletonCards({ rows = 3, height = 'h-24', className }) {
  return (
    <div className={cn('space-y-2.5', className)} aria-hidden="true">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className={height} />
      ))}
    </div>
  );
}
