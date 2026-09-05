import { useEffect, useRef, useState } from 'react';
import { MessageSquare, Send } from 'lucide-react';
import { relativeTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/Button';

/**
 * Per-line conversation between the customer and the sales team.
 *
 * Stays usable while the quotation is under internal review — a customer with a
 * question should never be blocked from asking it. Only a closed quotation makes
 * this read-only.
 */
export function ChatThread({ line, canMessage, onSend, autoFocus = false }) {
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const endRef = useRef(null);
  const inputRef = useRef(null);

  const comments = line.comments ?? [];

  // Keep the newest message in view as the conversation grows.
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'nearest' });
  }, [comments.length]);

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  const submit = async () => {
    const message = draft.trim();
    if (!message) return;

    setSending(true);
    const result = await onSend(message);
    setSending(false);

    // Only clear on success, so a rejected message isn't silently lost.
    if (result?.ok !== false) setDraft('');
  };

  const handleKeyDown = (e) => {
    // Enter sends, Shift+Enter makes a new line.
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <div className="rounded-xl border border-brand-500/15 bg-white/45 p-3">
      <p className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-ink-muted">
        <MessageSquare className="h-3 w-3" aria-hidden="true" />
        Conversation
        {comments.length > 0 && (
          <span className="rounded-full bg-brand-500/14 px-1.5 text-[10px] text-brand-700">
            {comments.length}
          </span>
        )}
      </p>

      {comments.length === 0 ? (
        <p className="py-2 text-xs italic text-ink-muted">
          No messages on this line yet. Ask us anything — pricing, specification, delivery.
        </p>
      ) : (
        <ul className="max-h-64 space-y-2 overflow-y-auto pr-1">
          {comments.map((c) => (
            <li
              key={c.id}
              className={cn(
                'max-w-[85%] rounded-xl px-3 py-2',
                c.side === 'customer'
                  ? 'ml-auto bg-accent-teal/14'
                  : 'border border-brand-500/12 bg-white/80',
              )}
            >
              <p className="text-[11px] font-bold text-ink">
                {c.side === 'customer' ? 'You' : c.author}
                <span className="ml-2 font-normal text-ink-muted">{relativeTime(c.at)}</span>
              </p>
              <p className="mt-0.5 whitespace-pre-wrap text-xs leading-relaxed text-ink-soft">
                {c.message}
              </p>
            </li>
          ))}
          <li ref={endRef} aria-hidden="true" />
        </ul>
      )}

      {canMessage ? (
        <div className="mt-3 flex flex-col gap-2 border-t border-brand-500/12 pt-3 sm:flex-row">
          <label htmlFor={`chat-${line.id}`} className="sr-only">
            Message about {line.productName}
          </label>
          <textarea
            ref={inputRef}
            id={`chat-${line.id}`}
            rows={2}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about this line, or request a change…"
            className="flex-1 resize-y rounded-xl border border-brand-500/20 bg-white/70 px-3 py-2 text-sm text-ink placeholder:text-ink-muted/70 focus:border-brand-500/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/25"
          />
          <Button
            icon={Send}
            onClick={submit}
            loading={sending}
            disabled={!draft.trim()}
            className="shrink-0 self-end"
          >
            Send
          </Button>
        </div>
      ) : (
        <p className="mt-3 border-t border-brand-500/12 pt-3 text-[11px] text-ink-muted">
          This quotation is closed, so messaging is disabled.
        </p>
      )}

      {canMessage && (
        <p className="mt-1.5 text-[10px] text-ink-muted">
          Press Enter to send, Shift + Enter for a new line.
        </p>
      )}
    </div>
  );
}
