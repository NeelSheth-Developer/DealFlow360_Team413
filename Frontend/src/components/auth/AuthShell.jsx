import { Link } from 'react-router-dom';
import { ArrowLeft, ShieldCheck } from 'lucide-react';
import { GlassCard } from '@/components/glass/Glass';
import { Logo } from '@/components/shared/Logo';

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

        <div className={hasAside ? 'grid items-stretch gap-4 lg:grid-cols-[1fr_0.9fr]' : ''}>
          <GlassCard strong className="p-7">
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

/**
 * Two gradients, both inside the brand palette.
 *
 * The customer surface used to run teal -> blue (#14b8a6 -> #3b82f6), which shares no hue
 * with the violet/indigo/pink the rest of the product is built from — it read as a
 * different app rather than a different audience. Keeping the two spaces visually
 * distinct is right; doing it by leaving the palette is not. `customer` now leans on the
 * warm end of the same ramp, so the two are unmistakably related and still tell apart at
 * a glance.
 */
const TONES = {
  brand: 'from-brand-700 via-brand-500 to-accent-indigo',
  customer: 'from-accent-indigo via-brand-500 to-accent-pink',
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
      } p-7 shadow-glass-strong`}
    >
      {/*
        Depth, in three layers: two soft blooms and a fine grid.

        The panel was a flat gradient behind a bullet list, which is why it read as
        basic — there was nothing between the background and the text. The blooms give
        it dimension and the grid gives the eye a surface to sit on, both at low enough
        opacity that the type still clears AA on every stop of the gradient.
      */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full bg-white/20 blur-3xl"
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-28 -left-16 h-64 w-64 rounded-full bg-white/12 blur-3xl"
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-[0.14]"
        style={{
          backgroundImage:
            'linear-gradient(rgba(255,255,255,.55) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.55) 1px, transparent 1px)',
          backgroundSize: '34px 34px',
          maskImage: 'radial-gradient(ellipse at 30% 0%, #000 35%, transparent 78%)',
          WebkitMaskImage: 'radial-gradient(ellipse at 30% 0%, #000 35%, transparent 78%)',
        }}
      />

      <div className="relative flex h-full flex-col">
        <div className="flex items-center gap-2.5">
          {/* On the gradient aside the mark carries a soft ring so its own violet does
              not disappear into the panel behind it. */}
          <Logo size="sm" className="ring-1 ring-white/40" />
          <span className="text-xs font-extrabold tracking-tight text-white">{eyebrow}</span>
        </div>

        <h2 className="mt-6 text-[22px] font-extrabold leading-[1.15] tracking-tight text-white">
          {title}
        </h2>
        {description && (
          <p className="mt-3 max-w-[34ch] text-[13px] leading-relaxed text-white/85">
            {description}
          </p>
        )}

        {/*
          Each capability is its own translucent card rather than a bullet.
          A row of text against a gradient has no edges, so the list ran together; a
          surface per item gives each one a boundary and lets the icon sit in a tile of
          its own without inventing a second colour.
        */}
        {items.length > 0 && (
          <ul className="mt-7 space-y-2.5">
            {items.map((item) => (
              <li
                key={item.title}
                className="flex items-start gap-3 rounded-xl border border-white/15 bg-white/10 p-3 backdrop-blur-sm transition-colors hover:border-white/25 hover:bg-white/15"
              >
                <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/22 text-white ring-1 ring-white/25">
                  <item.icon className="h-4 w-4" aria-hidden="true" />
                </span>
                <span className="min-w-0 pt-0.5">
                  <span className="block text-[12.5px] font-bold leading-snug text-white">
                    {item.title}
                  </span>
                  <span className="mt-1 block text-[11.5px] leading-relaxed text-white/75">
                    {item.blurb}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}

        {/* `mt-auto` pins this to the bottom so the panel reads as full-height rather
            than top-weighted with dead space underneath. */}
        {note && (
          <p className="mt-auto flex items-start gap-2 border-t border-white/20 pt-5 text-[11px] leading-relaxed text-white/70">
            <ShieldCheck className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>{note}</span>
          </p>
        )}
      </div>
    </section>
  );
}
