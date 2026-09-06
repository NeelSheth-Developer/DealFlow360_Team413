import * as RadixDialog from '@radix-ui/react-dialog';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { IconButton } from './Button';

const WIDTHS = {
  sm: 'max-w-md',
  md: 'max-w-2xl',
  lg: 'max-w-4xl',
  xl: 'max-w-6xl',
};

/**
 * Glass modal built on Radix so focus trapping, escape handling and aria wiring
 * come for free.
 */
export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  size = 'md',
  className,
}) {
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <AnimatePresence>
        {open && (
          <RadixDialog.Portal forceMount>
            <RadixDialog.Overlay asChild forceMount>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.16 }}
                className="fixed inset-0 z-50 bg-ink/25 backdrop-blur-sm"
              />
            </RadixDialog.Overlay>

            {/*
              Centering is done by this flex wrapper, NOT by `-translate-x-1/2
              -translate-y-1/2` on the card. framer-motion writes an inline
              `transform` for `scale`/`y`, and an inline style always beats a
              Tailwind class — so a translate-based centering would be silently
              erased the moment the open animation ran, leaving the card's
              top-left corner sitting at the viewport centre (i.e. offset down
              and to the right). Flexbox owns position, framer-motion owns
              transform, and the two no longer fight over one CSS property.

              `pointer-events-none` on the wrapper is required: the wrapper is
              the Radix Content node and now covers the whole screen, so without
              it every backdrop click would count as "inside" and
              click-outside-to-dismiss would stop working.
            */}
            <RadixDialog.Content asChild forceMount>
              <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center p-4">
                <motion.div
                  initial={{ opacity: 0, scale: 0.96, y: 12 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.97, y: 8 }}
                  transition={{ type: 'spring', stiffness: 320, damping: 28 }}
                  className={cn(
                    'glass-strong pointer-events-auto flex max-h-[90vh] w-full flex-col overflow-hidden',
                    WIDTHS[size],
                    className,
                  )}
                >
                  <div className="flex items-start justify-between gap-4 border-b border-brand-500/12 px-5 py-4">
                    <div className="min-w-0">
                      <RadixDialog.Title className="text-base font-bold tracking-tight text-ink">
                        {title}
                      </RadixDialog.Title>
                      {description && (
                        <RadixDialog.Description className="mt-0.5 text-xs text-ink-muted">
                          {description}
                        </RadixDialog.Description>
                      )}
                    </div>
                    <RadixDialog.Close asChild>
                      <IconButton icon={X} label="Close dialog" size="sm" />
                    </RadixDialog.Close>
                  </div>

                  <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>

                  {footer && (
                    <div className="flex flex-wrap items-center justify-end gap-2 border-t border-brand-500/12 bg-white/40 px-5 py-3.5">
                      {footer}
                    </div>
                  )}
                </motion.div>
              </div>
            </RadixDialog.Content>
          </RadixDialog.Portal>
        )}
      </AnimatePresence>
    </RadixDialog.Root>
  );
}

/** Right-hand slide-over, used for product editors and long forms. */
export function Drawer({ open, onOpenChange, title, description, children, footer, className }) {
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <AnimatePresence>
        {open && (
          <RadixDialog.Portal forceMount>
            <RadixDialog.Overlay asChild forceMount>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.16 }}
                className="fixed inset-0 z-50 bg-ink/25 backdrop-blur-sm"
              />
            </RadixDialog.Overlay>

            <RadixDialog.Content asChild forceMount>
              <motion.div
                initial={{ x: '100%' }}
                animate={{ x: 0 }}
                exit={{ x: '100%' }}
                transition={{ type: 'spring', stiffness: 300, damping: 32 }}
                className={cn(
                  'glass-strong fixed right-0 top-0 z-50 flex h-full w-full max-w-xl flex-col rounded-l-glass rounded-r-none border-r-0',
                  className,
                )}
              >
                <div className="flex items-start justify-between gap-4 border-b border-brand-500/12 px-5 py-4">
                  <div className="min-w-0">
                    <RadixDialog.Title className="text-base font-bold tracking-tight text-ink">
                      {title}
                    </RadixDialog.Title>
                    {description && (
                      <RadixDialog.Description className="mt-0.5 text-xs text-ink-muted">
                        {description}
                      </RadixDialog.Description>
                    )}
                  </div>
                  <RadixDialog.Close asChild>
                    <IconButton icon={X} label="Close panel" size="sm" />
                  </RadixDialog.Close>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>

                {footer && (
                  <div className="flex flex-wrap items-center justify-end gap-2 border-t border-brand-500/12 bg-white/40 px-5 py-3.5">
                    {footer}
                  </div>
                )}
              </motion.div>
            </RadixDialog.Content>
          </RadixDialog.Portal>
        )}
      </AnimatePresence>
    </RadixDialog.Root>
  );
}
