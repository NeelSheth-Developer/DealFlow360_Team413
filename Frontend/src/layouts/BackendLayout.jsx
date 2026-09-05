import { NavLink, Outlet } from 'react-router-dom';
import {
  ArrowLeft,
  ClipboardList,
  Package,
  Percent,
  Repeat,
  Sparkles,
  Users,
  Warehouse,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/Button';
import { useNavigate } from 'react-router-dom';

const SECTIONS = [
  {
    label: 'Catalog',
    items: [
      { to: '/app/backend/products', label: 'Products & price lists', icon: Package, ref: 'A2' },
    ],
  },
  {
    label: 'Governance',
    items: [
      { to: '/app/backend/discount-tiers', label: 'Discount tiers & approvals', icon: Percent, ref: 'A3' },
    ],
  },
  {
    label: 'Operations',
    items: [
      { to: '/app/backend/warehouses', label: 'Warehouses & stock', icon: Warehouse, ref: 'A4' },
      { to: '/app/backend/subscriptions', label: 'Subscription plans', icon: Repeat, ref: 'A5' },
      { to: '/app/backend/upsell-rules', label: 'Upsell & cross-sell', icon: Sparkles, ref: 'A6' },
    ],
  },
  {
    label: 'Platform',
    items: [
      { to: '/app/backend/users', label: 'Users & roles', icon: Users, ref: '' },
      { to: '/app/backend/audit-log', label: 'Audit log', icon: ClipboardList, ref: '' },
    ],
  },
];

/** Nested shell adding the configuration sidebar inside the workspace. */
export default function BackendLayout() {
  const navigate = useNavigate();

  return (
    <div className="flex flex-col gap-5 lg:flex-row">
      <aside className="lg:w-64 lg:shrink-0">
        <div className="glass sticky top-24 p-3">
          <div className="mb-3 px-1.5">
            <p className="text-[11px] font-bold uppercase tracking-widest text-brand-600">
              Back-end
            </p>
            <p className="mt-0.5 text-xs text-ink-muted">
              Configuration that drives the whole workflow.
            </p>
          </div>

          <nav aria-label="Backend configuration" className="space-y-3">
            {SECTIONS.map((section) => (
              <div key={section.label}>
                <p className="px-1.5 pb-1 text-[10px] font-bold uppercase tracking-wider text-ink-muted">
                  {section.label}
                </p>
                <ul className="space-y-0.5">
                  {section.items.map((item) => (
                    <li key={item.to}>
                      <NavLink
                        to={item.to}
                        className={({ isActive }) =>
                          cn(
                            'flex items-center gap-2 rounded-lg px-2 py-2 text-xs font-semibold transition-colors',
                            isActive
                              ? 'bg-gradient-to-r from-brand-500/16 to-accent-indigo/10 text-brand-700'
                              : 'text-ink-soft hover:bg-brand-500/8 hover:text-brand-700',
                          )
                        }
                      >
                        <item.icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                        <span className="min-w-0 flex-1 truncate">{item.label}</span>
                        {item.ref && (
                          <span className="shrink-0 rounded bg-ink/6 px-1 text-[9px] font-bold text-ink-muted">
                            {item.ref}
                          </span>
                        )}
                      </NavLink>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>

          <div className="mt-4 border-t border-brand-500/12 pt-3">
            <Button
              variant="ghost"
              size="sm"
              icon={ArrowLeft}
              fullWidth
              onClick={() => navigate('/app/quotations')}
            >
              Back to workspace
            </Button>
          </div>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <Outlet />
      </div>
    </div>
  );
}
