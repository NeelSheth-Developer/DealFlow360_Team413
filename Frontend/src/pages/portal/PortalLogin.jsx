import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Link2, Mail, MailCheck } from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import { GlassCard } from '@/components/glass/Glass';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';

/**
 * Customer portal entry. Deliberately simpler and visually distinct from the
 * internal login — no role pickers, no references to internal screens.
 *
 * Since no email can actually be sent in this build, the "magic link sent" state
 * lists the seeded portal links as clickable buttons. That keeps the flow honest
 * rather than pretending an email went out.
 */
export default function PortalLogin() {
  const navigate = useNavigate();
  const demoLinks = useAppStore((s) => s.portalDemoLinks());
  const quoteExists = useAppStore((s) => s.portalQuoteExists);

  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [pastedToken, setPastedToken] = useState('');
  const [pasteError, setPasteError] = useState(null);

  const handleSend = (e) => {
    e.preventDefault();
    if (!/^\S+@\S+\.\S+$/.test(email)) return;
    setSent(true);
  };

  const handlePaste = (e) => {
    e.preventDefault();
    // Accept a full URL or a bare token.
    const token = pastedToken.trim().split('/').filter(Boolean).pop() ?? '';
    if (!token || !quoteExists(token)) {
      setPasteError('That link or code does not match an active quotation.');
      return;
    }
    navigate(`/portal/${token}`);
  };

  return (
    <div className="mx-auto max-w-lg">
      <Link
        to="/"
        className="mb-5 inline-flex items-center gap-1.5 text-xs font-semibold text-ink-soft transition-colors hover:text-brand-700"
      >
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
        Back to home
      </Link>

      {!sent ? (
        <GlassCard strong className="p-6">
          <span className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-accent-teal to-state-info text-white shadow-glass">
            <Mail className="h-5 w-5" aria-hidden="true" />
          </span>

          <h1 className="text-xl font-extrabold tracking-tight text-ink">
            View your quotation
          </h1>
          <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">
            Enter the email address your quotation was sent to and we&apos;ll send a secure sign-in
            link. No password needed.
          </p>

          <form onSubmit={handleSend} className="mt-5 space-y-3.5">
            <Input
              label="Email address"
              type="email"
              required
              autoComplete="email"
              placeholder="you@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <Button type="submit" fullWidth size="lg" iconRight={ArrowRight}>
              Send me a link
            </Button>
          </form>

          <div className="mt-5 border-t border-brand-500/12 pt-4">
            <form onSubmit={handlePaste} className="space-y-2.5">
              <Input
                label="Already have a link?"
                placeholder="Paste your quotation link or code"
                value={pastedToken}
                error={pasteError}
                onChange={(e) => {
                  setPastedToken(e.target.value);
                  setPasteError(null);
                }}
              />
              <Button type="submit" variant="secondary" fullWidth icon={Link2}>
                Open quotation
              </Button>
            </form>
          </div>
        </GlassCard>
      ) : (
        <GlassCard strong className="p-6">
          <span className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-state-success to-accent-teal text-white shadow-glass">
            <MailCheck className="h-5 w-5" aria-hidden="true" />
          </span>

          <h1 className="text-xl font-extrabold tracking-tight text-ink">Check your inbox</h1>
          <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">
            If <span className="font-semibold text-ink">{email}</span> has an active quotation,
            a sign-in link is on its way.
          </p>

          <div className="mt-5 rounded-xl border border-accent-amber/30 bg-accent-amber/10 p-3.5">
            <p className="text-xs font-bold text-accent-amber">Demo build — no email is sent</p>
            <p className="mt-1 text-[11px] leading-relaxed text-ink-soft">
              Pick one of the live seeded quotations below to open the portal exactly as that
              customer would see it.
            </p>
          </div>

          <ul className="mt-4 space-y-2">
            {demoLinks.map((item) => (
              <li key={item.token}>
                <Link
                  to={`/portal/${item.token}`}
                  className="group flex items-center gap-3 rounded-xl border border-brand-500/15 bg-white/55 p-3 transition-all hover:-translate-y-0.5 hover:border-brand-500/40 hover:shadow-glass"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-bold text-ink">
                      {item.customerName}
                    </span>
                    <span className="mt-0.5 block text-[11px] text-ink-muted">{item.reference}</span>
                  </span>
                  {item.status === 'under_negotiation' && (
                    <Badge tone="warning" size="xs">
                      Negotiating
                    </Badge>
                  )}
                  <ArrowRight
                    className="h-4 w-4 shrink-0 text-ink-muted transition-transform group-hover:translate-x-0.5 group-hover:text-brand-600"
                    aria-hidden="true"
                  />
                </Link>
              </li>
            ))}
          </ul>

          <Button variant="ghost" fullWidth className="mt-4" onClick={() => setSent(false)}>
            Use a different email
          </Button>
        </GlassCard>
      )}
    </div>
  );
}
