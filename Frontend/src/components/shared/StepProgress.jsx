import { Check, X } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Horizontal step indicator. Shared deliberately between the approval chain
 * (B4) and the invoice lifecycle (B10) — the wireframe uses the same visual for
 * both, so it is built once.
 *
 * @param {{key:string,label:string,sublabel?:string,state?:'done'|'current'|'todo'|'failed'|'skipped'}[]} steps
 */
export function StepProgress({ steps, className, size = 'md' }) {
  const dot = size === 'sm' ? 'h-6 w-6 text-[10px]' : 'h-8 w-8 text-xs';

  return (
    <ol className={cn('flex w-full items-start', className)}>
      {steps.map((step, i) => {
        const state = step.state ?? 'todo';
        const isLast = i === steps.length - 1;

        const dotClass = {
          done: 'bg-gradient-to-br from-brand-500 to-accent-indigo text-white border-transparent',
          current: 'bg-accent-amber text-white border-transparent ring-4 ring-accent-amber/20',
          todo: 'bg-white/70 text-ink-muted border-brand-500/25',
          failed: 'bg-state-danger text-white border-transparent',
          skipped: 'bg-ink/10 text-ink-muted border-transparent',
        }[state];

        const lineClass = {
          done: 'bg-gradient-to-r from-brand-500 to-accent-indigo',
          current: 'bg-gradient-to-r from-accent-amber to-brand-500/20',
          todo: 'bg-brand-500/15',
          failed: 'bg-state-danger/30',
          skipped: 'bg-ink/10',
        }[state];

        return (
          <li key={step.key} className={cn('flex min-w-0 flex-1 flex-col', isLast && 'flex-none')}>
            <div className="flex items-center">
              <span
                className={cn(
                  'inline-flex shrink-0 items-center justify-center rounded-full border-2 font-bold transition-all',
                  dot,
                  dotClass,
                )}
              >
                {state === 'done' ? (
                  <Check className="h-3.5 w-3.5" aria-hidden="true" />
                ) : state === 'failed' ? (
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                ) : (
                  i + 1
                )}
              </span>
              {!isLast && <span className={cn('mx-1.5 h-0.5 flex-1 rounded-full', lineClass)} />}
            </div>

            <div className={cn('mt-1.5 pr-3', isLast && 'pr-0')}>
              <p
                className={cn(
                  'truncate text-xs font-bold',
                  state === 'done' && 'text-brand-700',
                  state === 'current' && 'text-accent-amber',
                  state === 'todo' && 'text-ink-muted',
                  state === 'failed' && 'text-state-danger',
                  state === 'skipped' && 'text-ink-muted line-through',
                )}
              >
                {step.label}
              </p>
              {step.sublabel && (
                <p className="mt-0.5 truncate text-[11px] text-ink-muted">{step.sublabel}</p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
