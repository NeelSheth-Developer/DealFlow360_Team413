import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Page title block with optional breadcrumbs and right-hand actions. */
export function PageHeader({ title, description, actions, breadcrumbs = [], className, badge }) {
  return (
    <header className={cn('mb-5', className)}>
      {breadcrumbs.length > 0 && (
        <nav aria-label="Breadcrumb" className="mb-2">
          <ol className="flex flex-wrap items-center gap-1 text-xs text-ink-muted">
            {breadcrumbs.map((crumb, i) => (
              <li key={`${crumb.label}-${i}`} className="flex items-center gap-1">
                {crumb.to ? (
                  <Link
                    to={crumb.to}
                    className="rounded font-medium transition-colors hover:text-brand-700"
                  >
                    {crumb.label}
                  </Link>
                ) : (
                  <span className="font-semibold text-ink-soft">{crumb.label}</span>
                )}
                {i < breadcrumbs.length - 1 && (
                  <ChevronRight className="h-3 w-3 shrink-0" aria-hidden="true" />
                )}
              </li>
            ))}
          </ol>
        </nav>
      )}

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-xl font-extrabold tracking-tight text-ink sm:text-2xl">{title}</h1>
            {badge}
          </div>
          {description && (
            <p className="mt-1 max-w-2xl text-sm leading-relaxed text-ink-soft">{description}</p>
          )}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </header>
  );
}
