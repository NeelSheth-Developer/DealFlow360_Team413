import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft, ArrowRight, CreditCard, Package, Settings, Sparkles, UserCheck } from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import { roleQuickPick } from '@/data';
import { roleLabel } from '@/lib/format';
import { GlassCard } from '@/components/glass/Glass';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Avatar } from '@/components/ui/Misc';

const ROLE_ICON = {
  sales_rep: Package,
  sales_manager: UserCheck,
  finance: CreditCard,
  admin: Settings,
};

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const login = useAppStore((s) => s.login);
  const loginAsUser = useAppStore((s) => s.loginAsUser);
  const users = useAppStore((s) => s.users);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const destination = location.state?.from ?? '/app/dashboard';

  const handleSubmit = (e) => {
    e.preventDefault();
    setBusy(true);
    const result = login(email);
    setBusy(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }
    toast.success(`Welcome back, ${result.user.name}`, { description: roleLabel(result.user.role) });
    navigate(destination, { replace: true });
  };

  const quickPick = (userId) => {
    const result = loginAsUser(userId);
    if (result.ok) {
      toast.success(`Signed in as ${result.user.name}`, { description: roleLabel(result.user.role) });
      navigate(destination, { replace: true });
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-4xl">
        <Link
          to="/"
          className="mb-5 inline-flex items-center gap-1.5 text-xs font-semibold text-ink-soft transition-colors hover:text-brand-700"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
          Back to home
        </Link>

        <div className="grid gap-5 lg:grid-cols-[1fr_1.1fr]">
          {/* ------------------------------------------------ credentials */}
          <GlassCard strong className="p-6">
            <span className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 to-accent-indigo text-white shadow-glass">
              <Sparkles className="h-5 w-5" aria-hidden="true" />
            </span>

            <h1 className="text-xl font-extrabold tracking-tight text-ink">Sign in to DealFlow360</h1>
            <p className="mt-1.5 text-sm text-ink-soft">
              Use a seeded account below, or sign in with an email from the directory.
            </p>

            <form onSubmit={handleSubmit} className="mt-5 space-y-3.5">
              <Input
                label="Work email"
                type="email"
                required
                autoComplete="email"
                placeholder="priya.sharma@dealflow360.com"
                value={email}
                error={error}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setError(null);
                }}
              />
              <Input
                label="Password"
                type="password"
                autoComplete="current-password"
                placeholder="Any password works in this demo"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                hint="No auth server in this build — the password field is cosmetic."
              />

              <Button type="submit" fullWidth size="lg" loading={busy} iconRight={ArrowRight}>
                Sign in
              </Button>
            </form>

            <p className="mt-4 text-xs text-ink-muted">
              Need an account?{' '}
              <Link to="/signup" className="font-semibold text-brand-600 hover:underline">
                Sign up
              </Link>
            </p>

            <div className="mt-4 border-t border-brand-500/12 pt-4">
              <p className="text-xs text-ink-muted">
                Are you a customer reviewing a quotation?{' '}
                <Link to="/portal/login" className="font-semibold text-brand-600 hover:underline">
                  Use the portal
                </Link>
              </p>
            </div>
          </GlassCard>

          {/* -------------------------------------------------- role picks */}
          <GlassCard className="p-6">
            <h2 className="text-sm font-bold tracking-tight text-ink">
              Or jump straight in as a role
            </h2>
            <p className="mt-1 text-xs leading-relaxed text-ink-soft">
              This is the fast path for a demo. You can switch role at any time from the user menu
              once inside — useful for walking an approval chain on one machine.
            </p>

            <div className="mt-4 space-y-2">
              {roleQuickPick.map((pick) => {
                const user = users.find((u) => u.id === pick.userId);
                const Icon = ROLE_ICON[pick.role];
                if (!user) return null;

                return (
                  <button
                    key={pick.role}
                    type="button"
                    onClick={() => quickPick(pick.userId)}
                    className="group flex w-full items-center gap-3 rounded-xl border border-brand-500/15 bg-white/55 p-3 text-left transition-all hover:-translate-y-0.5 hover:border-brand-500/40 hover:shadow-glass focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                  >
                    <Avatar name={user.name} gradient={user.avatarColor} size="md" />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        <Icon className="h-3.5 w-3.5 shrink-0 text-brand-600" aria-hidden="true" />
                        <span className="text-xs font-bold text-ink">{pick.label}</span>
                      </span>
                      <span className="mt-0.5 block truncate text-[11px] text-ink-muted">
                        {user.name} · {pick.blurb}
                      </span>
                    </span>
                    <ArrowRight
                      className="h-4 w-4 shrink-0 text-ink-muted transition-transform group-hover:translate-x-0.5 group-hover:text-brand-600"
                      aria-hidden="true"
                    />
                  </button>
                );
              })}
            </div>

            <div className="mt-4 rounded-xl bg-brand-500/8 p-3">
              <p className="text-[11px] font-bold text-brand-700">Suggested demo path</p>
              <p className="mt-1 text-[11px] leading-relaxed text-ink-soft">
                Start as <span className="font-semibold">Sales Rep</span> and open Q-1042 (Acme Corp)
                — it already has a service line 8 points over its ceiling, so the approval button
                relabels itself.
              </p>
            </div>
          </GlassCard>
        </div>
      </div>
    </div>
  );
}
