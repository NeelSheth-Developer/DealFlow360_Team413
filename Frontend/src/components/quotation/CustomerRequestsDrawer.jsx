import { useState } from 'react';
import { notify, toast } from '@/lib/notify';
import { Percent, Send, Sparkles } from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import { percent, relativeTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import { Drawer } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { Textarea } from '@/components/ui/Input';
import { EmptyState } from '@/components/ui/Misc';
import { MessageSquare } from 'lucide-react';

/** Rep-side view of portal negotiation activity. */
export function CustomerRequestsDrawer({ open, onOpenChange, quote, requests, editable }) {
  const replyToComment = useAppStore((s) => s.replyToComment);
  const applyCounterDiscount = useAppStore((s) => s.applyCounterDiscount);

  const [drafts, setDrafts] = useState({});

  const handleReply = async (lineId) => {
    const message = drafts[lineId];
    if (!message?.trim()) return;

    // Awaited, and the draft is only cleared once the server has it — losing a typed
    // reply to a failed request is worse than leaving it on screen to retry.
    const result = await replyToComment(quote.id, lineId, message);
    if (!result.ok) {
      notify.report(result, null, 'Could not send the reply');
      return;
    }
    setDrafts((d) => ({ ...d, [lineId]: '' }));
    notify.success('Reply sent', 'It is visible in the customer portal now.');
  };

  const handleApplyCounter = async () => {
    const result = await applyCounterDiscount(quote.id);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    // `applyCounterDiscount` resolves to { ok, risk } — there is no `path` on it, so
    // `result.path.label` threw exactly where the rep needed to see the new routing.
    toast.success(`Applied ${quote.counterDiscountPct}% to every line`, {
      description: `Blended risk is now ${Number(result.risk?.score ?? 0).toFixed(2)} pts.`,
    });
    onOpenChange(false);
  };

  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      title="Customer requests"
      description={`Negotiation activity from the portal on ${quote.reference ?? quote.id}.`}
    >
      <div className="space-y-4">
        {/* ------------------------------------------- counter discount */}
        {requests.counter && (
          <div className="rounded-xl border border-accent-amber/35 bg-accent-amber/10 p-4">
            <div className="flex items-start gap-2.5">
              <Percent className="mt-0.5 h-4 w-4 shrink-0 text-accent-amber" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-ink">
                  Counter-offer: {percent(requests.counter.pct, 0)}
                </p>
                {requests.counter.justification && (
                  <p className="mt-1 text-xs italic leading-relaxed text-ink-soft">
                    “{requests.counter.justification}”
                  </p>
                )}
              </div>
            </div>

            {editable && (
              <div className="mt-3">
                <Button size="sm" icon={Sparkles} fullWidth onClick={handleApplyCounter}>
                  Apply {percent(requests.counter.pct, 0)} to all lines & re-score
                </Button>
                <p className="mt-1.5 text-[11px] leading-relaxed text-ink-muted">
                  This overwrites each line&apos;s discount, then recomputes the blended risk. If it
                  crosses a threshold the quotation will need approval again.
                </p>
              </div>
            )}
          </div>
        )}

        {/* ------------------------------------------------- threads */}
        {requests.threads.length === 0 ? (
          <EmptyState
            icon={MessageSquare}
            title="No line-level questions"
            description="Comments the customer leaves in the portal will appear here."
          />
        ) : (
          <ul className="space-y-3">
            {requests.threads.map((thread) => (
              <li key={thread.lineId} className="rounded-xl border border-brand-500/12 bg-white/55 p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate text-xs font-bold text-ink">{thread.productName}</p>
                  {thread.lastFromCustomer && (
                    <span className="shrink-0 rounded-full bg-accent-pink/14 px-2 py-0.5 text-[10px] font-bold text-accent-pink">
                      Needs reply
                    </span>
                  )}
                </div>

                <ul className="mt-2.5 space-y-2">
                  {thread.comments.map((c) => (
                    <li
                      key={c.id}
                      className={cn(
                        'max-w-[88%] rounded-xl px-3 py-2',
                        c.role === 'customer'
                          ? 'bg-accent-teal/10'
                          : 'ml-auto bg-brand-500/10',
                      )}
                    >
                      <p className="text-[11px] font-bold text-ink">
                        {c.author}
                        <span className="ml-2 font-normal text-ink-muted">
                          {relativeTime(c.at)}
                        </span>
                      </p>
                      <p className="mt-0.5 text-xs leading-relaxed text-ink-soft">{c.message}</p>
                    </li>
                  ))}
                </ul>

                <div className="mt-2.5 flex flex-col gap-2 border-t border-brand-500/10 pt-2.5 sm:flex-row">
                  <Textarea
                    rows={2}
                    placeholder="Reply to the customer…"
                    value={drafts[thread.lineId] ?? ''}
                    onChange={(e) =>
                      setDrafts((d) => ({ ...d, [thread.lineId]: e.target.value }))
                    }
                    className="flex-1"
                  />
                  <Button
                    size="sm"
                    icon={Send}
                    className="shrink-0 self-end"
                    disabled={!drafts[thread.lineId]?.trim()}
                    onClick={() => handleReply(thread.lineId)}
                  >
                    Reply
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Drawer>
  );
}
