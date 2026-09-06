import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

/**
 * A numeric input that COMMITS ON BLUR, not on every keystroke.
 *
 * WHY THIS EXISTS. Several config screens wired a raw `<input type="number">` straight to
 * a store action, so `onChange` fired a request per character. Typing "1200" sent four
 * PUTs — 1, then 12, then 120, then 1200 — and the value that stuck was whichever
 * response landed last, not the one typed. That is why a saved price or ceiling could
 * read back as `1` or `120`, and it looked exactly like "the backend ignored my change".
 *
 * Holding a local draft and committing once on blur (or Enter) makes the request count
 * one per edit, removes the race entirely, and lets the field be cleared mid-typing
 * without sending `0` to the server.
 *
 * IT ALSO GUARDS THE FLOOR. `min` is enforced on commit rather than trusted from the
 * browser: `type="number"` lets a user paste or type "-50" and only blocks it on native
 * form submit, which these fields never do. Money and percentages have no meaningful
 * negative here, so the value is clamped and the field shows what was actually sent.
 *
 * `onCommit` receives the clamped number and is only called when the value really
 * changed, so re-blurring a field nobody touched costs nothing.
 */
export function NumberField({
  value,
  onCommit,
  min = 0,
  max = Number.MAX_SAFE_INTEGER,
  step = 'any',
  disabled = false,
  className,
  'aria-label': ariaLabel,
  ...props
}) {
  const [draft, setDraft] = useState(String(value ?? ''));
  const committed = useRef(value);

  // Follow the prop when it changes from outside (a server response, a reset), but never
  // while the field is being typed in — that would fight the user mid-edit.
  useEffect(() => {
    if (committed.current !== value) {
      committed.current = value;
      setDraft(String(value ?? ''));
    }
  }, [value]);

  const commit = () => {
    const raw = draft.trim();
    // An empty field means "unchanged", not "zero" — clearing it to retype should not
    // send 0 to the server on the way past.
    if (raw === '') {
      setDraft(String(committed.current ?? ''));
      return;
    }

    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) {
      setDraft(String(committed.current ?? ''));
      return;
    }

    const clamped = Math.min(max, Math.max(min, parsed));
    setDraft(String(clamped));

    if (clamped === committed.current) return;
    committed.current = clamped;
    onCommit?.(clamped);
  };

  return (
    <input
      type="number"
      inputMode="decimal"
      min={min}
      max={max}
      step={step}
      disabled={disabled}
      aria-label={ariaLabel}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          e.currentTarget.blur();
        }
        if (e.key === 'Escape') {
          setDraft(String(committed.current ?? ''));
          e.currentTarget.blur();
        }
      }}
      className={cn(
        'num h-9 rounded-lg border border-brand-500/20 bg-white/70 px-2.5 text-right text-xs font-semibold text-ink',
        'transition-colors focus:border-brand-500/50 focus:outline-none focus:ring-2 focus:ring-brand-500/25',
        'disabled:cursor-not-allowed disabled:opacity-60',
        className,
      )}
      {...props}
    />
  );
}
