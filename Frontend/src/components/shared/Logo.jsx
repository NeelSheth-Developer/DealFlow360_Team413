import { cn } from '@/lib/utils';

/**
 * The DealFlow360 brand mark.
 *
 * Every logo position used to render a `Sparkles` glyph on a gradient tile — a
 * placeholder, and one that had to be kept in sync by hand across the marketing header,
 * both app shells, four auth screens and the sign-in aside. This is the real artwork, in
 * one component.
 *
 * IT IS THE FAVICON FILE ITSELF. `/favicon-32x32.png` already ships in `public/`, is
 * already referenced by `index.html`, and is already fetched on every page load — so
 * reusing it costs no extra request and guarantees the tab icon and the in-app mark can
 * never drift apart. The artwork is a rounded square on its own gradient, so the wrapper
 * only supplies the corner radius and clips to it; adding another gradient behind it
 * would show as a fringe.
 *
 * WHY A FIXED PIXEL SOURCE IS FINE HERE. The mark is never rendered above 56px, and the
 * source is 32px at 1x. On a 2x display the browser upscales it, so `size="xl"` reaches
 * for the 192px asset instead — same image, no visible softness at the larger sizes.
 */
const SIZES = {
  xs: { box: 'h-6 w-6', radius: 'rounded-md' },
  sm: { box: 'h-7 w-7', radius: 'rounded-lg' },
  md: { box: 'h-9 w-9', radius: 'rounded-xl' },
  lg: { box: 'h-11 w-11', radius: 'rounded-2xl' },
  xl: { box: 'h-14 w-14', radius: 'rounded-2xl' },
};

/** Above this the 32px source would visibly soften, so the 192px asset is used. */
const LARGE_SIZES = new Set(['xl']);

export function Logo({ size = 'md', className, alt = 'DealFlow360' }) {
  const { box, radius } = SIZES[size] ?? SIZES.md;

  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center overflow-hidden shadow-glass',
        box,
        radius,
        className,
      )}
    >
      <img
        src={LARGE_SIZES.has(size) ? '/android-chrome-192x192.png' : '/favicon-32x32.png'}
        alt={alt}
        width={64}
        height={64}
        // `block` kills the inline-image baseline gap that would otherwise leave a
        // sliver of background showing along the bottom edge of the rounded tile.
        className="block h-full w-full object-cover"
        draggable={false}
      />
    </span>
  );
}
