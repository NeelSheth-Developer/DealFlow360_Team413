import { Link } from 'react-router-dom';
import { Compass, ShieldX } from 'lucide-react';
import { GlassCard, GradientBlobBackground } from '@/components/glass/Glass';
import { Button } from '@/components/ui/Button';

function Shell({ icon: Icon, tone, title, description, children }) {
  return (
    <div className="relative flex min-h-screen items-center justify-center px-4">
      <GradientBlobBackground variant="subtle" />
      <GlassCard strong className="relative z-10 max-w-md p-8 text-center">
        <span
          className={`mx-auto mb-4 inline-flex h-12 w-12 items-center justify-center rounded-2xl ${tone}`}
        >
          <Icon className="h-6 w-6" aria-hidden="true" />
        </span>
        <h1 className="text-lg font-extrabold tracking-tight text-ink">{title}</h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-soft">{description}</p>
        <div className="mt-5 flex flex-wrap justify-center gap-2">{children}</div>
      </GlassCard>
    </div>
  );
}

export function Forbidden() {
  return (
    <Shell
      icon={ShieldX}
      tone="bg-state-danger/12 text-state-danger"
      title="You don't have access to that"
      description="The back-end configuration area is limited to Admin, Sales Manager and Finance roles. Switch role from the user menu if you're demoing."
    >
      <Button as={Link} variant="secondary" onClick={() => window.history.back()}>
        Go back
      </Button>
      <Link to="/app/dashboard">
        <Button>Open dashboard</Button>
      </Link>
    </Shell>
  );
}

export function NotFound() {
  return (
    <Shell
      icon={Compass}
      tone="bg-brand-500/12 text-brand-600"
      title="Page not found"
      description="That route doesn't exist. If you followed a quotation link, it may have been superseded by a newer version."
    >
      <Link to="/">
        <Button variant="secondary">Home</Button>
      </Link>
      <Link to="/app/quotations">
        <Button>Go to quotations</Button>
      </Link>
    </Shell>
  );
}
