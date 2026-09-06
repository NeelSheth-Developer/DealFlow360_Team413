import { useId, useMemo, useState } from 'react';
import { Check, Eye, EyeOff, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/Input';
import { PASSWORD_RULES } from '@/lib/passwordPolicy';

/**
 * A password input with a reveal toggle.
 *
 * Every password field in the app was `type="password"` with no way to see what had been
 * typed, which is the single most common cause of a "wrong password" that is really a
 * typo — and it matters most on the fields that are hardest to get right: a new password,
 * and its confirmation.
 *
 * The toggle is a `button` inside the field rather than a checkbox beside it, and it
 * announces its own state, so it is reachable by keyboard and readable by a screen reader
 * without a visible label.
 */
export function PasswordField({
  label,
  value,
  onChange,
  error,
  hint,
  placeholder,
  autoComplete = 'current-password',
  required,
  id,
  disabled,
  className,
  ...props
}) {
  const [revealed, setRevealed] = useState(false);
  const autoId = useId();
  const inputId = id ?? autoId;

  return (
    <div className={cn('relative', className)}>
      <Input
        id={inputId}
        label={label}
        type={revealed ? 'text' : 'password'}
        value={value}
        onChange={onChange}
        error={error}
        hint={hint}
        placeholder={placeholder}
        autoComplete={autoComplete}
        required={required}
        disabled={disabled}
        className="pr-10"
        {...props}
      />

      {/*
        Positioned against the field itself, not the wrapper: `Input` renders a label
        above and a hint below, so anchoring to the bottom would drift with the hint.
        `top-[2.05rem]` lines up with the control under the label.
      */}
      <button
        type="button"
        tabIndex={disabled ? -1 : 0}
        aria-label={revealed ? 'Hide password' : 'Show password'}
        aria-pressed={revealed}
        onClick={() => setRevealed((v) => !v)}
        disabled={disabled}
        className={cn(
          'absolute right-2.5 flex h-7 w-7 items-center justify-center rounded-lg',
          'text-ink-muted transition-colors hover:bg-brand-500/10 hover:text-brand-700',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500',
          'disabled:cursor-not-allowed disabled:opacity-50',
          label ? 'top-[1.85rem]' : 'top-1.5',
        )}
      >
        {revealed ? (
          <EyeOff className="h-4 w-4" aria-hidden="true" />
        ) : (
          <Eye className="h-4 w-4" aria-hidden="true" />
        )}
      </button>
    </div>
  );
}

/**
 * Live rule checklist — green tick when met, red cross when not.
 *
 * HIDDEN UNTIL TYPING STARTS. Showing five red crosses against an untouched field reads
 * as five errors the user has already made, when they have simply not begun. It appears
 * on the first keystroke and settles to all-green.
 *
 * The advisory rules are marked "recommended" so nobody is left hunting for a symbol to
 * satisfy a rule that will not actually block them.
 */
export function PasswordChecklist({ value = '', className, showWhenEmpty = false }) {
  const results = useMemo(() => PASSWORD_RULES.map((r) => ({ ...r, met: r.test(value) })), [value]);
  const met = results.filter((r) => r.met).length;

  if (!value && !showWhenEmpty) return null;

  const tone = met <= 2 ? 'bg-state-danger' : met <= 4 ? 'bg-accent-amber' : 'bg-state-success';

  return (
    <div className={cn('rounded-xl bg-white/60 p-2.5', className)}>
      <div className="mb-2 flex items-center gap-2">
        <div className="bg-brand-500/12 h-1 flex-1 overflow-hidden rounded-full">
          <div
            className={cn('h-full rounded-full transition-all duration-300', tone)}
            style={{ width: `${(met / PASSWORD_RULES.length) * 100}%` }}
          />
        </div>
        <span className="shrink-0 text-[10px] font-bold uppercase tracking-wider text-ink-muted">
          {met <= 2 ? 'Weak' : met <= 4 ? 'Fair' : 'Strong'}
        </span>
      </div>

      <ul className="grid gap-1 sm:grid-cols-2">
        {results.map((r) => (
          <li
            key={r.id}
            className={cn(
              'flex items-center gap-1.5 text-[11px] font-medium transition-colors',
              r.met ? 'text-state-success' : 'text-state-danger',
            )}
          >
            <span
              className={cn(
                'inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full',
                r.met ? 'bg-state-success/15' : 'bg-state-danger/12',
              )}
            >
              {r.met ? (
                <Check className="h-2.5 w-2.5" aria-hidden="true" />
              ) : (
                <X className="h-2.5 w-2.5" aria-hidden="true" />
              )}
            </span>
            <span className="min-w-0 truncate">
              {r.label}
              {!r.required && <span className="text-ink-muted"> · recommended</span>}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
