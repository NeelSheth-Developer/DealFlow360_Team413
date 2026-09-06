import { useEffect } from 'react';
import { Toaster } from 'sonner';
import { useAppStore } from '@/store/useAppStore';
import { TooltipProvider } from '@/components/ui/Misc';
import AppRoutes from './routes';

export default function App() {
  const boot = useAppStore((s) => s.boot);
  const isBooted = useAppStore((s) => s.isBooted);

  // Rebuilds fulfillment plans, billing schedules and alerts against today's
  // date. Done at boot rather than baked into the seed so backorder ETAs and
  // stall counters are always accurate.
  useEffect(() => {
    if (!isBooted) boot();
  }, [boot, isBooted]);

  return (
    <TooltipProvider>
      <AppRoutes />
      {/*
        A toast has to say WHICH way it went before it is read.

        `className: 'glass-strong'` was applied to every type, so a success and a failure
        were the same frosted panel with the same ink — the only difference was the words.
        `classNames` styles each variant separately: a coloured left edge, a tinted ground
        and a matching icon, so the outcome is legible at a glance and a red toast is
        never mistaken for a green one.

        `richColors` is deliberately NOT used — it would override these with sonner's own
        palette, which does not match the app's tokens.
      */}
      <Toaster
        position="top-right"
        duration={4500}
        closeButton
        toastOptions={{
          classNames: {
            toast:
              'glass-strong !rounded-xl !border-l-4 !shadow-glass !gap-3 !items-start !px-4 !py-3',
            title: '!text-[13px] !font-bold !leading-snug',
            description: '!text-[11.5px] !leading-relaxed !text-ink-soft !mt-0.5',
            success: '!border-l-state-success !bg-state-success/10 !text-ink',
            error: '!border-l-state-danger !bg-state-danger/10 !text-ink',
            warning: '!border-l-accent-amber !bg-accent-amber/12 !text-ink',
            info: '!border-l-state-info !bg-state-info/10 !text-ink',
            icon: '!mt-0.5 !self-start',
          },
        }}
      />
    </TooltipProvider>
  );
}
