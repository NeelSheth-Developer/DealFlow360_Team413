import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { KeyRound } from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import { Dialog } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

/**
 * Change password for a signed-in user. POST /auth/change-password.
 *
 * The endpoint existed in the API with no UI anywhere. It sends the current
 * refreshToken so THIS session survives and every other one is revoked, which is
 * what the "N other session(s) signed out" toast reports.
 */
export function ChangePasswordDialog({ open, onOpenChange }) {
  const changePassword = useAppStore((s) => s.changePassword);

  const [form, setForm] = useState({ current: '', next: '', confirm: '' });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  // Never leave a typed password sitting in state after the dialog closes.
  useEffect(() => {
    if (open) {
      setForm({ current: '', next: '', confirm: '' });
      setError(null);
      setBusy(false);
    }
  }, [open]);

  const setField = (key) => (e) => {
    setForm((f) => ({ ...f, [key]: e.target.value }));
    setError(null);
  };

  const submit = async () => {
    if (form.next.length < 8) {
      setError('Use at least 8 characters.');
      return;
    }
    if (form.next !== form.confirm) {
      setError('New passwords do not match.');
      return;
    }
    if (form.next === form.current) {
      setError('Your new password must be different from the current one.');
      return;
    }

    setBusy(true);
    const result = await changePassword({
      currentPassword: form.current,
      newPassword: form.next,
    });
    setBusy(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    toast.success('Password updated', {
      description:
        result.sessionsRevoked > 0
          ? `${result.sessionsRevoked} other session(s) were signed out.`
          : 'This session stays signed in.',
    });
    onOpenChange(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Change password"
      description="Other devices will be signed out. This one stays signed in."
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} loading={busy} icon={KeyRound}>
            Update password
          </Button>
        </>
      }
    >
      <div className="space-y-3.5">
        <Input
          label="Current password"
          type="password"
          required
          autoComplete="current-password"
          value={form.current}
          onChange={setField('current')}
        />
        <Input
          label="New password"
          type="password"
          required
          autoComplete="new-password"
          placeholder="At least 8 characters"
          value={form.next}
          onChange={setField('next')}
        />
        <Input
          label="Confirm new password"
          type="password"
          required
          autoComplete="new-password"
          value={form.confirm}
          error={error}
          onChange={setField('confirm')}
        />
      </div>
    </Dialog>
  );
}
