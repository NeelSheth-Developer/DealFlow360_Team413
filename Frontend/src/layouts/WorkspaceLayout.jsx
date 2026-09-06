import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { toast } from 'sonner';
import {
  Bell,
  ChevronDown,
  Kanban,
  KeyRound,
  LayoutDashboard,
  LogOut,
  PieChart,
  RefreshCw,
  Settings,
  UserCheck,
  X,
} from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import { selectMyNotifications } from '@/store/selectors';
import { cn } from '@/lib/utils';
import { relativeTime, roleLabel } from '@/lib/format';
import { Button, IconButton } from '@/components/ui/Button';
import { Avatar, Popover } from '@/components/ui/Misc';
import { ConfirmDialog } from '@/components/shared/Dialogs';
import { ChangePasswordDialog } from '@/components/auth/ChangePasswordDialog';
import { GradientBlobBackground } from '@/components/glass/Glass';
import { ConsolidationWatcher } from '@/components/quotation/ConsolidationWatcher';
import { ConnectionBanner } from '@/components/shared/ConnectionBanner';
import { Logo } from '@/components/shared/Logo';

/**
 * `roles: null` means everyone. Approvals is gated to the roles that can act on a step
 * (§12.5 answers a sales_rep with 403), so linking it for a rep would offer them a
 * screen the router bounces to /403.
 */
const NAV = [
  { to: '/app/quotations', label: 'Quotations', icon: LayoutDashboard, roles: null },
  { to: '/app/pipeline', label: 'Pipeline', icon: Kanban, roles: null },
  {
    to: '/app/approvals',
    label: 'Approvals',
    icon: UserCheck,
    roles: ['admin', 'sales_manager', 'finance'],
    badge: 'approvals',
  },
  { to: '/app/dashboard', label: 'Deal Health', icon: PieChart, roles: null },
  /*
    Reports is manager/finance/admin only — GET /reports/summary and
    GET /reports/products both answer a sales_rep with 403, so the screen could only ever
    show them an error. Hidden rather than left to fail.
  */
  {
    to: '/app/reports',
    label: 'Reports',
    icon: PieChart,
    roles: ['admin', 'sales_manager', 'finance'],
  },
];

export default function WorkspaceLayout() {
  const navigate = useNavigate();
  const currentUser = useAppStore((s) => s.currentUser);
  const isReloading = useAppStore((s) => s.isReloading);
  const reloadData = useAppStore((s) => s.reloadData);

  const logout = useAppStore((s) => s.logout);

  const canAccessBackend = useAppStore((s) => s.canAccessBackend);

  /**
   * The queue is polled alongside notifications so the count in the nav is close to the
   * truth. A step arrives here because somebody else submitted a quotation, so nothing
   * on this side knows when one lands.
   */
  const approvalQueue = useAppStore((s) => s.approvalQueue);
  const loadApprovalQueue = useAppStore((s) => s.loadApprovalQueue);
  const hasRole = useAppStore((s) => s.hasRole);
  const canApprove = hasRole('admin', 'sales_manager', 'finance');
  const badgeCounts = { approvals: approvalQueue?.length ?? 0 };

  const visibleNav = NAV.filter((item) => !item.roles || hasRole(...item.roles));

  const notifications = useAppStore(selectMyNotifications);
  const loadNotifications = useAppStore((s) => s.loadNotifications);
  const markNotificationRead = useAppStore((s) => s.markNotificationRead);
  const markAllNotificationsRead = useAppStore((s) => s.markAllNotificationsRead);
  const notificationRoute = useAppStore((s) => s.notificationRoute);

  const [closeOpen, setCloseOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);

  /**
   * Notifications are raised by the server as a side effect of someone else's action —
   * an approval request, a customer comment, an escalation — so nothing on this side
   * knows when one arrives. A 60-second poll is the honest way to keep the badge close
   * to the truth without a socket; `boot()` does the first fetch.
   */
  useEffect(() => {
    if (!currentUser) return undefined;
    const timer = setInterval(() => loadNotifications(), 60_000);
    return () => clearInterval(timer);
  }, [currentUser, loadNotifications]);

  useEffect(() => {
    if (!currentUser || !canApprove) return undefined;
    loadApprovalQueue();
    const timer = setInterval(() => loadApprovalQueue(), 60_000);
    return () => clearInterval(timer);
  }, [currentUser, canApprove, loadApprovalQueue]);

  const handleReload = async () => {
    const result = await reloadData();
    toast.success('Data reloaded', {
      description: `Re-read from the server. ${result.alerts} active alert(s).`,
    });
  };

  return (
    <div className="relative min-h-screen">
      <GradientBlobBackground variant="default" />

      {/* --------------------------------------------------------- top nav */}
      <ConnectionBanner />

      <header className="glass-nav sticky top-0 z-40">
        <div className="mx-auto flex h-16 max-w-[1600px] items-center gap-3 px-4 sm:px-6">
          <Link to="/app/dashboard" className="flex shrink-0 items-center gap-2.5">
            <Logo size="md" />
            <span className="hidden text-sm font-extrabold tracking-tight text-ink sm:block">
              DealFlow360
            </span>
          </Link>

          <nav aria-label="Workspace" className="ml-2 hidden items-center gap-1 lg:flex">
            {visibleNav.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  cn(
                    'relative rounded-lg px-3 py-2 text-xs font-semibold transition-colors',
                    isActive ? 'text-brand-700' : 'text-ink-soft hover:text-brand-700',
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    {item.label}
                    {item.badge && badgeCounts[item.badge] > 0 && (
                      <span className="ml-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-accent-pink px-1 text-[10px] font-bold text-white">
                        {badgeCounts[item.badge] > 9 ? '9+' : badgeCounts[item.badge]}
                      </span>
                    )}
                    {isActive && (
                      <span className="absolute inset-x-2 -bottom-0.5 h-0.5 rounded-full bg-gradient-to-r from-brand-500 to-accent-pink" />
                    )}
                  </>
                )}
              </NavLink>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-1.5">
            <Button
              variant="ghost"
              size="sm"
              icon={RefreshCw}
              loading={isReloading}
              onClick={handleReload}
              className="hidden sm:inline-flex"
            >
              Reload Data
            </Button>

            {canAccessBackend() && (
              <Button
                variant="secondary"
                size="sm"
                icon={Settings}
                onClick={() => navigate('/app/backend/products')}
                className="hidden md:inline-flex"
              >
                Go to Back-end
              </Button>
            )}

            {/* ------------------------------------------- notifications */}
            <Popover
              trigger={
                <button
                  type="button"
                  aria-label={`Notifications, ${notifications.unread} unread`}
                  className="relative inline-flex h-10 w-10 items-center justify-center rounded-xl text-ink-soft transition-colors hover:bg-brand-500/10 hover:text-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                >
                  <Bell className="h-4 w-4" aria-hidden="true" />
                  {notifications.unread > 0 && (
                    <span className="absolute right-1.5 top-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-accent-pink px-1 text-[10px] font-bold text-white">
                      {notifications.unread > 9 ? '9+' : notifications.unread}
                    </span>
                  )}
                </button>
              }
              className="w-96 p-0"
            >
              <div className="flex items-center justify-between border-b border-brand-500/12 px-4 py-3">
                <p className="text-sm font-bold text-ink">Notifications</p>
                {notifications.unread > 0 && (
                  <button
                    type="button"
                    onClick={markAllNotificationsRead}
                    className="text-[11px] font-semibold text-brand-600 hover:underline"
                  >
                    Mark all read
                  </button>
                )}
              </div>

              <div className="max-h-80 overflow-y-auto">
                {notifications.items.length === 0 ? (
                  <p className="px-4 py-8 text-center text-xs text-ink-muted">
                    Nothing here yet. Approval requests and customer replies land here.
                  </p>
                ) : (
                  <ul className="divide-y divide-brand-500/10">
                    {notifications.items.slice(0, 12).map((n) => (
                      <li key={n.id}>
                        <button
                          type="button"
                          onClick={() => {
                            markNotificationRead(n.id);
                            // The row carries `view` + `entityId`, never a URL, so the
                            // route is resolved on this side.
                            navigate(notificationRoute(n));
                          }}
                          className={cn(
                            'flex w-full flex-col items-start gap-0.5 px-4 py-3 text-left transition-colors hover:bg-brand-500/6',
                            !n.read && 'bg-brand-500/8',
                          )}
                        >
                          <span className="flex w-full items-center gap-2">
                            {!n.read && (
                              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent-pink" />
                            )}
                            <span className="min-w-0 flex-1 truncate text-xs font-bold text-ink">
                              {n.title}
                            </span>
                            <span className="shrink-0 text-[10px] text-ink-muted">
                              {relativeTime(n.at)}
                            </span>
                          </span>
                          {n.body && (
                            <span className="line-clamp-2 text-[11px] leading-relaxed text-ink-soft">
                              {n.body}
                            </span>
                          )}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </Popover>

            {/* ------------------------------------------------ user menu */}
            <DropdownMenu.Root>
              <DropdownMenu.Trigger asChild>
                <button
                  type="button"
                  className="flex items-center gap-2 rounded-xl px-1.5 py-1 transition-colors hover:bg-brand-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                >
                  <Avatar name={currentUser?.name ?? '?'} gradient={currentUser?.avatarColor} size="sm" />
                  <span className="hidden text-left leading-tight sm:block">
                    <span className="block text-xs font-bold text-ink">{currentUser?.name}</span>
                    <span className="block text-[10px] text-ink-muted">
                      {roleLabel(currentUser?.role)}
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
                    <p className="text-xs font-bold text-ink">{currentUser?.name}</p>
                    <p className="text-[11px] text-ink-muted">{currentUser?.email}</p>
                    <p className="mt-1 text-[11px] font-semibold text-brand-600">
                      {roleLabel(currentUser?.role)} · {currentUser?.team}
                    </p>
                  </div>

                  <DropdownMenu.Separator className="my-1 h-px bg-brand-500/12" />

                  {/*
                    The "Demo: switch role" list and "Reset demo data" both used
                    to live here. Neither can exist against a real backend: a
                    user cannot elevate their own role, and there is no seeded
                    data to reset. Roles are changed by an admin from
                    Users & roles (PATCH /users/:id).
                  */}
                  <DropdownMenu.Item
                    onSelect={() => setPasswordOpen(true)}
                    className="flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs font-medium text-ink-soft outline-none transition-colors data-[highlighted]:bg-brand-500/12 data-[highlighted]:text-brand-700"
                  >
                    <KeyRound className="h-3.5 w-3.5" aria-hidden="true" />
                    Change password
                  </DropdownMenu.Item>

                  <DropdownMenu.Item
                    onSelect={async () => {
                      await logout();
                      navigate('/');
                    }}
                    className="flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs font-medium text-state-danger outline-none transition-colors data-[highlighted]:bg-state-danger/10"
                  >
                    <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
                    Sign out
                  </DropdownMenu.Item>
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>

            <IconButton
              icon={X}
              label="Close workspace"
              size="md"
              onClick={() => setCloseOpen(true)}
            />
          </div>
        </div>

        {/* mobile nav row */}
        <nav
          aria-label="Workspace mobile"
          className="flex items-center gap-1 overflow-x-auto border-t border-brand-500/10 px-4 py-1.5 lg:hidden"
        >
          {visibleNav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                cn(
                  'shrink-0 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold transition-colors',
                  isActive ? 'bg-brand-500/12 text-brand-700' : 'text-ink-soft',
                )
              }
            >
              {item.label}
              {item.badge && badgeCounts[item.badge] > 0 && ` (${badgeCounts[item.badge]})`}
            </NavLink>
          ))}
          {canAccessBackend() && (
            <NavLink
              to="/app/backend/products"
              className={({ isActive }) =>
                cn(
                  'shrink-0 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold transition-colors',
                  isActive ? 'bg-brand-500/12 text-brand-700' : 'text-ink-soft',
                )
              }
            >
              Back-end
            </NavLink>
          )}
        </nav>
      </header>

      <main className="relative z-10 mx-auto max-w-[1600px] px-4 py-6 sm:px-6">
        <Outlet />
      </main>

      {/* Watches for stock arrivals that let an open backorder consolidate. */}
      <ConsolidationWatcher />

      <ConfirmDialog
        open={closeOpen}
        onOpenChange={setCloseOpen}
        title="Close workspace?"
        description="You'll be signed out of this working session and returned to the home page."
        confirmLabel="Close workspace"
        variant="danger"
        onConfirm={async () => {
          setCloseOpen(false);
          await logout();
          navigate('/');
        }}
      >
        <p className="text-sm leading-relaxed text-ink-soft">
          You&apos;ll be signed out and your session revoked. Signing back in picks up exactly where
          you left off.
        </p>
      </ConfirmDialog>

      <ChangePasswordDialog open={passwordOpen} onOpenChange={setPasswordOpen} />
    </div>
  );
}
