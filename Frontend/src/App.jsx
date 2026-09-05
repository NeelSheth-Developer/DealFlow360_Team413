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
      <Toaster
        position="top-right"
        toastOptions={{
          className: 'glass-strong',
          style: { color: '#1e1033' },
        }}
        closeButton
      />
    </TooltipProvider>
  );
}
