import { Outlet } from 'react-router-dom';
import { ShieldCheck, Sparkles } from 'lucide-react';
import { GradientBlobBackground } from '@/components/glass/Glass';

/**
 * Customer-facing shell.
 *
 * Deliberately imports NOTHING from the workspace: no internal nav, no sidebar,
 * no workspace components. That isolation is the mechanism behind the spec's
 * requirement that the negotiation view be a real, separate, restricted view
 * rather than an internal screen with a different label.
 */
export default function PortalLayout() {
  return (
    <div className="relative min-h-screen">
      <GradientBlobBackground variant="subtle" />

      <header className="glass-nav sticky top-0 z-40">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between gap-4 px-4 sm:px-6">
          <div className="flex items-center gap-2.5">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-accent-indigo text-white shadow-glass">
              <Sparkles className="h-4.5 w-4.5" aria-hidden="true" />
            </span>
            <div className="leading-tight">
              <p className="text-sm font-extrabold tracking-tight text-ink">DealFlow360</p>
              <p className="text-[11px] text-ink-muted">Customer quotation portal</p>
            </div>
          </div>

          <span className="hidden items-center gap-1.5 rounded-full bg-state-success/12 px-2.5 py-1 text-[11px] font-semibold text-state-success sm:inline-flex">
            <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
            Secure link
          </span>
        </div>
      </header>

      <main className="relative z-10 mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
        <Outlet />
      </main>

      <footer className="relative z-10 mx-auto max-w-5xl px-4 pb-8 sm:px-6">
        <div className="border-t border-brand-500/12 pt-5 text-center">
          <p className="text-[11px] leading-relaxed text-ink-muted">
            This quotation is confidential and intended only for the named recipient. Questions? Reply
            to the email that contained this link.
          </p>
          <p className="mt-1.5 text-[11px] text-ink-muted">
            Powered by <span className="font-semibold text-brand-600">DealFlow360</span>
          </p>
        </div>
      </footer>
    </div>
  );
}
