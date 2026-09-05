import { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Textarea } from '@/components/ui/Input';

/** Yes/no confirmation. */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  onConfirm,
  variant = 'primary',
  loading = false,
  children,
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            {cancelLabel}
          </Button>
          <Button variant={variant} onClick={onConfirm} loading={loading}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      {children ?? (
        <p className="text-sm leading-relaxed text-ink-soft">
          This action will be recorded in the audit trail.
        </p>
      )}
    </Dialog>
  );
}

/**
 * Action that requires a written reason. Used for reject, return-for-revision
 * and mark-as-lost — the spec requires a reason on all of them.
 */
export function ReasonDialog({
  open,
  onOpenChange,
  title,
  description,
  label = 'Reason',
  placeholder,
  confirmLabel = 'Submit',
  variant = 'danger',
  minLength = 10,
  onConfirm,
}) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setReason('');
      setError(null);
      setBusy(false);
    }
  }, [open]);

  const submit = async () => {
    if (reason.trim().length < minLength) {
      setError(`Please write at least ${minLength} characters so the audit trail is useful.`);
      return;
    }
    setBusy(true);
    const result = await onConfirm(reason.trim());
    setBusy(false);
    if (result?.ok === false) {
      setError(result.error ?? 'Something went wrong.');
      return;
    }
    onOpenChange(false);
  };

  const remaining = minLength - reason.trim().length;

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant={variant} onClick={submit} loading={busy}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="flex items-start gap-2.5 rounded-xl bg-accent-amber/10 p-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-accent-amber" aria-hidden="true" />
          <p className="text-xs leading-relaxed text-ink-soft">
            This reason is stored permanently on the quotation&apos;s audit trail and shown to the
            rep who submitted it.
          </p>
        </div>

        <Textarea
          label={label}
          required
          rows={4}
          autoFocus
          placeholder={placeholder}
          value={reason}
          error={error}
          onChange={(e) => {
            setReason(e.target.value);
            setError(null);
          }}
          hint={remaining > 0 ? `${remaining} more character(s) needed` : 'Looks good'}
        />
      </div>
    </Dialog>
  );
}
