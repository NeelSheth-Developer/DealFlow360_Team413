import { forwardRef, useId } from 'react';
import { cn } from '@/lib/utils';

const FIELD =
  'w-full rounded-xl border border-brand-500/20 bg-white/70 px-3 text-sm text-ink placeholder:text-ink-muted/70 ' +
  'transition-colors focus:border-brand-500/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/25 ' +
  'disabled:cursor-not-allowed disabled:opacity-60';

/** Label + control + hint/error wrapper shared by every field type. */
export function Field({ label, hint, error, required, children, htmlFor, className }) {
  return (
    <div className={cn('space-y-1.5', className)}>
      {label && (
        <label htmlFor={htmlFor} className="block text-xs font-semibold text-ink-soft">
          {label}
          {required && <span className="ml-0.5 text-state-danger">*</span>}
        </label>
      )}
      {children}
      {error ? (
        <p className="text-xs font-medium text-state-danger">{error}</p>
      ) : (
        hint && <p className="text-xs text-ink-muted">{hint}</p>
      )}
    </div>
  );
}

export const Input = forwardRef(function Input(
  { label, hint, error, required, className, wrapperClassName, id, prefix, suffix, ...props },
  ref,
) {
  const autoId = useId();
  const inputId = id ?? autoId;

  const control = (
    <div className="relative flex items-center">
      {prefix && (
        <span className="pointer-events-none absolute left-3 text-sm text-ink-muted">{prefix}</span>
      )}
      <input
        ref={ref}
        id={inputId}
        className={cn(
          FIELD,
          'h-10',
          prefix && 'pl-8',
          suffix && 'pr-9',
          error && 'border-state-danger/60 focus:border-state-danger focus:ring-state-danger/25',
          className,
        )}
        {...props}
      />
      {suffix && (
        <span className="pointer-events-none absolute right-3 text-sm text-ink-muted">{suffix}</span>
      )}
    </div>
  );

  if (!label && !hint && !error) return control;

  return (
    <Field
      label={label}
      hint={hint}
      error={error}
      required={required}
      htmlFor={inputId}
      className={wrapperClassName}
    >
      {control}
    </Field>
  );
});

export const Textarea = forwardRef(function Textarea(
  { label, hint, error, required, className, id, rows = 3, ...props },
  ref,
) {
  const autoId = useId();
  const inputId = id ?? autoId;

  const control = (
    <textarea
      ref={ref}
      id={inputId}
      rows={rows}
      className={cn(
        FIELD,
        'resize-y py-2.5 leading-relaxed',
        error && 'border-state-danger/60 focus:border-state-danger focus:ring-state-danger/25',
        className,
      )}
      {...props}
    />
  );

  if (!label && !hint && !error) return control;

  return (
    <Field label={label} hint={hint} error={error} required={required} htmlFor={inputId}>
      {control}
    </Field>
  );
});

/** Native select styled to match. Radix Select is used where search is needed. */
export const Select = forwardRef(function Select(
  { label, hint, error, required, className, id, options = [], placeholder, children, ...props },
  ref,
) {
  const autoId = useId();
  const inputId = id ?? autoId;

  const control = (
    <select
      ref={ref}
      id={inputId}
      className={cn(
        FIELD,
        'h-10 cursor-pointer appearance-none bg-[length:16px] bg-[right_0.75rem_center] bg-no-repeat pr-9',
        error && 'border-state-danger/60',
        className,
      )}
      style={{
        backgroundImage:
          "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%237c6f93' stroke-width='2.5' stroke-linecap='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")",
      }}
      {...props}
    >
      {placeholder && <option value="">{placeholder}</option>}
      {options.map((opt) => (
        <option key={opt.value} value={opt.value} disabled={opt.disabled}>
          {opt.label}
        </option>
      ))}
      {children}
    </select>
  );

  if (!label && !hint && !error) return control;

  return (
    <Field label={label} hint={hint} error={error} required={required} htmlFor={inputId}>
      {control}
    </Field>
  );
});
