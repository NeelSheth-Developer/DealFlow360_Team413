import { cn } from '@/lib/utils';

/**
 * Thin styled wrappers around a plain table. Sorting/filtering is handled by
 * the calling screen (or TanStack Table where it earns its keep) — this just
 * keeps every table in the app looking identical.
 */
export function Table({ children, className, dense = false }) {
  return (
    <div className="w-full overflow-x-auto">
      <table className={cn('table-glass', dense && 'text-xs', className)}>{children}</table>
    </div>
  );
}

export function THead({ children, className }) {
  return <thead className={className}>{children}</thead>;
}

export function TBody({ children, className }) {
  return <tbody className={className}>{children}</tbody>;
}

export function TR({ children, className, ...props }) {
  return (
    <tr className={className} {...props}>
      {children}
    </tr>
  );
}

export function TH({ children, className, align = 'left', ...props }) {
  return (
    <th
      scope="col"
      className={cn(
        align === 'right' && 'text-right',
        align === 'center' && 'text-center',
        className,
      )}
      {...props}
    >
      {children}
    </th>
  );
}

export function TD({ children, className, align = 'left', num = false, ...props }) {
  return (
    <td
      className={cn(
        align === 'right' && 'text-right',
        align === 'center' && 'text-center',
        num && 'num font-medium',
        className,
      )}
      {...props}
    >
      {children}
    </td>
  );
}

export function TFoot({ children, className }) {
  return (
    <tfoot className={cn('border-t-2 border-brand-500/20 bg-brand-50/60 font-semibold', className)}>
      {children}
    </tfoot>
  );
}
