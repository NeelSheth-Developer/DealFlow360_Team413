import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft, ArrowRight, Sparkles } from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import { roleLabel } from '@/lib/format';
import { GlassCard } from '@/components/glass/Glass';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Input';

const ROLES = ['sales_rep', 'sales_manager', 'finance', 'admin'].map((r) => ({
  value: r,
  label: roleLabel(r),
}));

export default function Signup() {
  const navigate = useNavigate();
  const signup = useAppStore((s) => s.signup);

  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    role: 'sales_rep',
    team: '',
  });
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);

  const setField = (key) => (e) => {
    setForm((f) => ({ ...f, [key]: e.target.value }));
    setErrors((prev) => ({ ...prev, [key]: null }));
  };

  const validate = () => {
    const next = {};
    if (form.name.trim().length < 2) next.name = 'Enter your full name.';
    if (!/^\S+@\S+\.\S+$/.test(form.email)) next.email = 'Enter a valid email address.';
    if (form.password.length < 6) next.password = 'Use at least 6 characters.';
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!validate()) return;

    setBusy(true);
    const result = signup({
      name: form.name.trim(),
      email: form.email.trim(),
      role: form.role,
      team: form.team.trim(),
    });
    setBusy(false);

    if (!result.ok) {
      setErrors({ email: result.error });
      return;
    }

    toast.success(`Account created for ${result.user.name}`, {
      description: `Signed in as ${roleLabel(result.user.role)}.`,
    });
    navigate('/app/dashboard', { replace: true });
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <Link
          to="/"
          className="mb-5 inline-flex items-center gap-1.5 text-xs font-semibold text-ink-soft transition-colors hover:text-brand-700"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
          Back to home
        </Link>

        <GlassCard strong className="p-6">
          <span className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 to-accent-indigo text-white shadow-glass">
            <Sparkles className="h-5 w-5" aria-hidden="true" />
          </span>

          <h1 className="text-xl font-extrabold tracking-tight text-ink">Create your account</h1>
          <p className="mt-1.5 text-sm text-ink-soft">
            New internal users pick a role here. It decides which screens and approvals you get.
          </p>

          <form onSubmit={handleSubmit} className="mt-5 space-y-3.5">
            <Input
              label="Full name"
              required
              autoComplete="name"
              placeholder="Asha Verma"
              value={form.name}
              error={errors.name}
              onChange={setField('name')}
            />
            <Input
              label="Work email"
              type="email"
              required
              autoComplete="email"
              placeholder="asha.verma@dealflow360.com"
              value={form.email}
              error={errors.email}
              onChange={setField('email')}
            />
            <Input
              label="Password"
              type="password"
              required
              autoComplete="new-password"
              placeholder="At least 6 characters"
              value={form.password}
              error={errors.password}
              onChange={setField('password')}
            />
            <Select label="Role" options={ROLES} value={form.role} onChange={setField('role')} />
            <Input
              label="Team"
              placeholder="Enterprise West"
              value={form.team}
              onChange={setField('team')}
              hint="Optional — used to group reporting."
            />

            <Button type="submit" fullWidth size="lg" loading={busy} iconRight={ArrowRight}>
              Create account
            </Button>
          </form>

          <p className="mt-4 text-xs text-ink-muted">
            Already have an account?{' '}
            <Link to="/login" className="font-semibold text-brand-600 hover:underline">
              Sign in
            </Link>
          </p>
        </GlassCard>
      </div>
    </div>
  );
}
