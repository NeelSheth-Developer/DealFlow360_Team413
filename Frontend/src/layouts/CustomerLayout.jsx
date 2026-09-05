import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { ChevronDown, FileText, LogOut, ShieldCheck, Sparkles } from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import { cn } from '@/lib/utils';
import { tierLabel } from '@/lib/format';
import { Avatar } from '@/components/ui/Misc';
import { GradientBlobBackground } from '@/components/glass/Glass';

/**
 * Customer-facing shell for signed-in customers.
 *
 * Deliberately imports NOTHING from the internal workspace: no staff nav, no
 * sidebar, no workspace components. That isolation is the mechanism behind the
 * requirement that the customer experience be a genuinely separate restricted
 * area rather than an internal screen with different labels.
 */
export default function CustomerLayout() {
  const navigate = useNavigate();
  const customer = useAppStore((s) => s.currentCustomer());
  const customerLogout = useAppStore((s) => s.customerLogout);

  return (
    <div className="relative min-h-screen">
      <GradientBlobBackground variant="subtle" />

      <header className="glass-nav sticky top-0 z-40">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between gap-4 px-4 sm:px-6">
          <Link to="/customer/quotations" className="flex items-center gap-2.5">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-accent-teal to-state-info text-white shadow-glass">
              <Sparkles className="h-4 w-4" aria-hidden="true" />
            </span>
            <span className="leading-tight">
              <span className="block text-sm font-extrabold tracking-tight text-ink">
                DealFlow360
              </span>
              <span className="block text-[11px] text-ink-muted">Customer area</span>
            </span>
          </Link>

          <nav aria-label="Customer" className="ml-auto hidden items-center gap-1 sm:flex">
            <NavLink
              to="/customer/quotations"
              className={({ isActive }) =>
                cn(
                  'inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition-colors',
                  isActive ? 'bg-accent-teal/14 text-accent-teal' : 'text-ink-soft hover:text-brand-700',
                )
              }
            >
              <FileText className="h-3.5 w-3.5" aria-hidden="true" />
              My quotations
            </NavLink>
          </nav>

          {customer && (
            <DropdownMenu.Root>
              <DropdownMenu.Trigger asChild>
                <button
                  type="button"
                  className="flex items-center gap-2 rounded-xl px-1.5 py-1 transition-colors hover:bg-brand-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                >
                  <Avatar
                    name={customer.contactName || customer.name}
                    gradient="from-accent-teal to-state-info"
                    size="sm"
                  />
                  <span className="hidden text-left leading-tight sm:block">
                    <span className="block text-xs font-bold text-ink">{customer.name}</span>
                    <span className="block text-[10px] text-ink-muted">
                      {tierLabel(customer.tier)} account
                    </span>
                  </span>
                  <ChevronDown className="h-3.5 w-3.5 text-ink-muted" aria-hidden="true" />
                </button>
              </DropdownMenu.Trigger>

              <DropdownMenu.Portal>
                <DropdownMenu.Content
                  align="end"
                  sideOffset={8}
                  className="glass-strong z-[60] w-64 p-1.5"
                >
                  <div className="px-2.5 py-2">
                    <p className="text-xs font-bold text-ink">{customer.contactName}</p>
                    <p className="text-[11px] text-ink-muted">{customer.email}</p>
                    <p className="mt-1 text-[11px] font-semibold text-accent-teal">
                      {customer.name} · {tierLabel(customer.tier)}
                    </p>
                  </div>

                  <DropdownMenu.Separator className="my-1 h-px bg-brand-500/12" />

                  <DropdownMenu.Item
                    onSelect={() => {
                      customerLogout();
                      navigate('/customer/login');
                    }}
                    className="flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs font-medium text-state-danger outline-none transition-colors data-[highlighted]:bg-state-danger/10"
                  >
                    <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
                    Sign out
                  </DropdownMenu.Item>
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>
          )}
        </div>
      </header>

      <main className="relative z-10 mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
        <Outlet />
      </main>

      <footer className="relative z-10 mx-auto max-w-5xl px-4 pb-8 sm:px-6">
        <div className="border-t border-brand-500/12 pt-5 text-center">
          <p className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-state-success">
            <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
            You are signed in to a private account
          </p>
          <p className="mt-1.5 text-[11px] leading-relaxed text-ink-muted">
            Quotations shown here are confidential and visible only to your organisation.
          </p>
        </div>
      </footer>
    </div>
  );
}
