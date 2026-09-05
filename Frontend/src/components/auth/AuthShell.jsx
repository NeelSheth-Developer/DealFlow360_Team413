import { Link } from 'react-router-dom';
import { ArrowLeft, Sparkles } from 'lucide-react';
import { GlassCard } from '@/components/glass/Glass';

/**
 * Shared two-column layout for every auth screen.
 *
 * The two columns are `items-stretch` so the aside matches the form's height
 * whatever that height is — sign-in is short, signup is tall, and the panel fills
 * either without a gap. That is why the aside carries real content rather than a
 * couple of lines: an under-filled panel next to a tall form looks broken.
 *
 * Collapses to a single stacked column below `lg`, and to a narrow card when no
 * `aside` is supplied.
 */
export function AuthShell({ backTo = '/', backLabel = 'Back to home', aside, children }) {
  const hasAside = Boolean(aside);

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className={hasAside ? 'w-full max-w-5xl' : 'w-full max-w-md'}>
        <Link
          to={backTo}
          className="mb-4 inline-flex items-center gap-1.5 text-xs font-semibold text-ink-soft transition-colors hover:text-brand-700"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
          {backLabel}
        </Link>

        <div
          className={
            hasAside ? 'grid items-stretch gap-4 lg:grid-cols-[1fr_0.9fr]' : ''
          }
        >
          <GlassCard strong className="p-6">
            {children}
          </GlassCard>

          {/*
            Ordered after the form in the DOM so keyboard and screen-reader users
            reach the inputs first. It is supporting context, not a control.
          */}
          {hasAside && aside}
        </div>
      </div>
    </div>
  );
}

const TONES = {
  brand: 'from-brand-600 via-brand-500 to-accent-indigo',
  teal: 'from-accent-teal via-state-info to-brand-500',
};

/**
 * The right-hand brand panel: what the platform does, beside the form.
 *
 * Rendered as a filled gradient rather than glass so it reads as the product's
 * voice and not another input surface. White-on-gradient clears AA contrast at
 * these weights.
 *
 * @param eyebrow small product mark above the headline
 * @param title   the headline
 * @param description one or two sentences
 * @param items   [{ icon, title, blurb }] — the capability list
 * @param note    footnote pinned to the bottom of the panel
 * @param tone    'brand' (staff) | 'teal' (customer)
 */
export function AuthAside({
  eyebrow = 'DealFlow360',
  title,
  description,
  items = [],
  note,
  tone = 'brand',
}) {
  return (
    <section
      className={`relative flex h-full flex-col overflow-hidden rounded-glass bg-gradient-to-br ${
        TONES[tone] ?? TONES.brand
      } p-6 shadow-glass-strong`}
    >
      {/* Soft depth, matching the blob language used across the app. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-white/15 blur-2xl"
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-24 -left-12 h-56 w-56 rounded-full bg-white/10 blur-2xl"
      />

      <div className="relative flex h-full flex-col">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-white/20 text-white">
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
          </span>
          <span className="text-xs font-extrabold tracking-tight text-white">{eyebrow}</span>
        </div>

        <h2 className="mt-4 text-lg font-extrabold leading-snug tracking-tight text-white">
          {title}
        </h2>
        {description && (
          <p className="mt-2 text-xs leading-relaxed text-white/80">{description}</p>
        )}

        {items.length > 0 && (
          <ul className="mt-5 space-y-3">
            {items.map((item) => (
              <li key={item.title} className="flex items-start gap-2.5">
                <span className="mt-px inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-white/20 text-white">
                  <item.icon className="h-3 w-3" aria-hidden="true" />
                </span>
                <span className="min-w-0">
                  <span className="block text-[11px] font-bold leading-snug text-white">
                    {item.title}
                  </span>
                  <span className="mt-0.5 block text-[11px] leading-snug text-white/70">
                    {item.blurb}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}

        {/* `mt-auto` pins this to the bottom so the panel reads as full-height
            rather than top-weighted with dead space underneath. */}
        {note && (
          <p className="mt-auto border-t border-white/20 pt-4 text-[11px] leading-relaxed text-white/75">
            {note}
          </p>
        )}
      </div>
    </section>
  );
}
