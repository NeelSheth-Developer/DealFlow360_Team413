import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ArrowRight,
  BarChart3,
  Boxes,
  ClipboardCheck,
  CreditCard,
  Gauge,
  LayoutDashboard,
  MessageSquareQuote,
  Package,
  PieChart,
  Repeat,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Truck,
  UserCheck,
  Users,
} from 'lucide-react';
import { GlassCard, SectionHeading } from '@/components/glass/Glass';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { RiskEngineDemo } from '@/components/landing/RiskEngineDemo';
import { StatTile } from '@/components/shared/Indicators';
import { RiskGauge } from '@/components/shared/RiskGauge';
import { money } from '@/lib/format';
import { Logo } from '@/components/shared/Logo';

const FEATURES = [
  {
    icon: ShieldCheck,
    title: 'Multi-tier discount governance',
    body: 'Per-category ceilings, blended risk scoring and approval chains that route themselves. Reps never request approval manually.',
    accent: 'from-brand-500 to-accent-indigo',
  },
  {
    icon: TrendingUp,
    title: 'Live upsell & cross-sell',
    body: 'Ranked suggestions from co-purchase history with margin impact shown before you add. Margin floors block anything destructive.',
    accent: 'from-accent-teal to-brand-400',
  },
  {
    icon: Truck,
    title: 'Multi-warehouse fulfillment',
    body: 'Automatic split across depots to minimise shipments, with manual override and backorder consolidation when stock lands.',
    accent: 'from-accent-indigo to-accent-pink',
  },
  {
    icon: Repeat,
    title: 'Hybrid one-time + recurring',
    body: 'One order, two billing streams. Daily proration, deferred adjustments, credit notes and refunds all handled by rule.',
    accent: 'from-accent-pink to-brand-600',
  },
  {
    icon: Gauge,
    title: 'Deal health & anomaly alerts',
    body: 'Stalled deals, discount outliers against each rep’s own history, delivery slippage and approval bottlenecks.',
    accent: 'from-accent-amber to-accent-pink',
  },
  {
    icon: MessageSquareQuote,
    title: 'Customer portal negotiation',
    body: 'A genuinely separate restricted view. Counter-offers re-enter the approval chain automatically — no email threads.',
    accent: 'from-brand-600 to-accent-teal',
  },
];

/** `hands` says what each step passes to the next — that is the section's point. */
const FLOW = [
  { icon: ClipboardCheck, label: 'Quote', hands: 'Lines, tier pricing, a live risk score' },
  { icon: UserCheck, label: 'Approve', hands: 'A route the score picked, not a person' },
  { icon: Boxes, label: 'Fulfil', hands: 'A warehouse split already computed' },
  { icon: CreditCard, label: 'Bill', hands: 'One-time and recurring, kept apart' },
  {
    icon: MessageSquareQuote,
    label: 'Negotiate',
    hands: 'Counter-offers that re-trigger approval',
  },
  { icon: BarChart3, label: 'Report', hands: 'Every stage change, already logged' },
];

const ROLES = [
  {
    icon: Package,
    role: 'Sales Rep',
    blurb: 'Builds quotes, sees margin and risk live, handles customer replies.',
  },
  {
    icon: UserCheck,
    role: 'Sales Manager',
    blurb: 'Approves discounts, sets ceilings, watches deal health.',
  },
  {
    icon: CreditCard,
    role: 'Finance',
    blurb: 'Second-level sign-off, billing reconciliation, credit notes.',
  },
  {
    icon: MessageSquareQuote,
    role: 'Customer',
    blurb: 'Reviews and negotiates in a restricted portal view.',
  },
  { icon: Users, role: 'Admin', blurb: 'Owns catalog, warehouses, plans and platform analytics.' },
];

export default function Landing() {
  return (
    // `clip` rather than `hidden` — see the note in MarketingLayout: `hidden`
    // would make this a scroll container and kill the sticky nav.
    <div className="overflow-x-clip">
      <LandingNav />
      <Hero />
      <StatStrip />
      <FeatureGrid />
      <HowItWorks />
      <RiskSection />
      <DashboardPreview />
      <RolesBand />
      <CtaBand />
      <LandingFooter />
    </div>
  );
}

/* ------------------------------------------------------------------- nav */

function LandingNav() {
  return (
    <header className="glass-nav sticky top-0 z-40">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link to="/" className="flex items-center gap-2.5">
          <Logo size="md" />
          <span className="text-sm font-extrabold tracking-tight text-ink">DealFlow360</span>
        </Link>

        <nav aria-label="Sections" className="hidden items-center gap-1 md:flex">
          {[
            ['Features', '#features'],
            ['How it works', '#how'],
            ['Risk engine', '#risk'],
            ['Dashboard', '#dashboard'],
          ].map(([label, href]) => (
            <a
              key={href}
              href={href}
              className="rounded-lg px-3 py-2 text-xs font-semibold text-ink-soft transition-colors hover:text-brand-700"
            >
              {label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <Link to="/customer/login" className="hidden sm:block">
            <Button variant="ghost" size="sm">
              Customer Portal
            </Button>
          </Link>
          <Link to="/login">
            <Button size="sm" iconRight={ArrowRight}>
              Sign in
            </Button>
          </Link>
        </div>
      </div>
    </header>
  );
}

/* ------------------------------------------------------------------ hero */

function Hero() {
  return (
    <section className="mx-auto max-w-7xl px-4 pb-16 pt-14 sm:px-6 sm:pt-20">
      <div className="grid items-center gap-10 lg:grid-cols-2">
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <Badge tone="brand" size="md" icon={Sparkles} className="mb-4">
            Self-governing sales operations
          </Badge>

          <h1 className="text-4xl font-extrabold leading-[1.08] tracking-tight text-ink sm:text-5xl lg:text-6xl">
            The sales engine that <span className="text-gradient">governs itself</span>
          </h1>

          <p className="mt-5 max-w-xl text-base leading-relaxed text-ink-soft sm:text-lg">
            Quote-to-cash for real B2B conditions: multi-tier discount approvals that route
            themselves, stock split across warehouses in real time, subscriptions and hardware
            reconciled on one order, and a customer portal where deals actually get negotiated.
          </p>

          <div className="mt-7 flex flex-wrap items-center gap-3">
            <Link to="/login">
              <Button size="lg" iconRight={ArrowRight}>
                Start free
              </Button>
            </Link>
            <a href="#how">
              <Button size="lg" variant="secondary">
                Watch the flow
              </Button>
            </a>
          </div>

          <p className="mt-4 text-xs text-ink-muted">
            Seeded demo data included · No setup required · Pick any role to explore
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.55, delay: 0.12 }}
          className="relative"
        >
          <HeroQuoteCard />
        </motion.div>
      </div>
    </section>
  );
}

function HeroQuoteCard() {
  return (
    <GlassCard strong className="relative p-5">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold text-ink-muted">Quotation Q-1042</p>
          <p className="text-lg font-extrabold tracking-tight text-ink">Acme Corp</p>
        </div>
        <Badge tone="warning">Gold</Badge>
      </div>

      <div className="space-y-2">
        <HeroLine name="Laptop Pro 14" qty="× 8" amount={615296} discount="12%" ok />
        <HeroLine name="Onboarding Setup Service" qty="× 1" amount={15088} discount="18%" />
      </div>

      <div className="border-brand-500/12 mt-4 flex items-end justify-between gap-4 border-t pt-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted">
            Order total
          </p>
          <p className="num text-2xl font-extrabold tracking-tight text-ink">
            {money(743853, 'INR')}
          </p>
          <p className="mt-1 text-[11px] font-semibold text-state-success">Margin 26.4%</p>
        </div>
        <RiskGauge score={0.19} size="sm" showLabel={false} />
      </div>

      <div className="bg-accent-amber/12 mt-4 rounded-xl border border-accent-amber/35 px-3 py-2.5">
        <p className="text-xs font-bold text-accent-amber">Routes to Sales Manager</p>
        <p className="mt-0.5 text-[11px] leading-relaxed text-ink-soft">
          Setup Service is 8 pts over its 10% ceiling — one line flags the whole quote.
        </p>
      </div>
    </GlassCard>
  );
}

function HeroLine({ name, qty, amount, discount, ok = false }) {
  return (
    <div className="flex items-center gap-3 rounded-xl bg-white/50 px-3 py-2">
      <span
        className={`h-1.5 w-1.5 shrink-0 rounded-full ${ok ? 'bg-state-success' : 'bg-state-danger'}`}
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-bold text-ink">{name}</p>
        <p className="text-[11px] text-ink-muted">
          {qty} · {discount} discount
        </p>
      </div>
      <span className="num shrink-0 text-xs font-bold text-ink">{money(amount, 'INR')}</span>
    </div>
  );
}

/* ------------------------------------------------------------- stat strip */

function StatStrip() {
  const stats = [
    {
      label: 'Fewer manual approvals',
      value: 62,
      format: (v) => `${Math.round(v)}%`,
      icon: ShieldCheck,
      tone: 'brand',
    },
    {
      label: 'Upsell attach rate',
      value: 3.2,
      format: (v) => `${v.toFixed(1)}×`,
      icon: TrendingUp,
      tone: 'teal',
    },
    {
      label: 'Warehouses auto-split',
      value: 3,
      format: (v) => Math.round(v),
      icon: Truck,
      tone: 'indigo',
    },
    {
      label: 'Email threads needed',
      value: 0,
      format: () => '0',
      icon: MessageSquareQuote,
      tone: 'pink',
    },
  ];

  return (
    <section className="mx-auto max-w-7xl px-4 pb-16 sm:px-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map((s) => (
          <StatTile key={s.label} {...s} />
        ))}
      </div>
    </section>
  );
}

/* ----------------------------------------------------------- feature grid */

function FeatureGrid() {
  return (
    <section id="features" className="mx-auto max-w-7xl scroll-mt-20 px-4 py-16 sm:px-6">
      <SectionHeading
        center
        eyebrow="What's inside"
        title="Six problems most sales tools quietly ignore"
        description="Every one of these is implemented as real business logic — not a screen that looks the part."
      />

      <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map((feature, i) => (
          <motion.div
            key={feature.title}
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-60px' }}
            transition={{ duration: 0.4, delay: i * 0.06 }}
          >
            <GlassCard hover className="h-full p-5">
              <span
                className={`mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br ${feature.accent} text-white shadow-glass`}
              >
                <feature.icon className="h-5 w-5" aria-hidden="true" />
              </span>
              <h3 className="text-sm font-bold tracking-tight text-ink">{feature.title}</h3>
              <p className="mt-1.5 text-xs leading-relaxed text-ink-soft">{feature.body}</p>
            </GlassCard>
          </motion.div>
        ))}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------ how it works */

function HowItWorks() {
  return (
    <section id="how" className="mx-auto max-w-7xl scroll-mt-20 px-4 py-16 sm:px-6">
      <SectionHeading
        center
        eyebrow="End to end"
        title="One continuous flow, not six disconnected screens"
        description="Each step hands real state to the next. Approve a quote and the warehouse split is already computed."
      />

      {/*
        One continuous rail with the steps sitting on it, rather than six
        separate pills joined by short dashes. The section claims the flow is
        continuous, so the graphic should not look like six disconnected chips.
        The rail is a single element behind the row; each step carries its own
        number and a one-line description of what it hands to the next step.
      */}
      <div className="relative mt-12">
        <span
          aria-hidden="true"
          className="absolute left-0 right-0 top-5 hidden h-1 rounded-full bg-gradient-to-r from-brand-500/25 via-accent-indigo/30 to-accent-pink/25 lg:block"
        />

        <ol className="relative grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-6 lg:gap-x-2">
          {FLOW.map((step, i) => (
            <motion.li
              key={step.label}
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-40px' }}
              transition={{ duration: 0.35, delay: i * 0.09 }}
              className="flex flex-col items-center text-center"
            >
              <span className="relative inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 to-accent-indigo text-white shadow-glass ring-4 ring-surface-base">
                <step.icon className="h-4 w-4" aria-hidden="true" />
                <span className="num absolute -bottom-1.5 -right-1.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-white text-[10px] font-extrabold text-brand-700 shadow-sm">
                  {i + 1}
                </span>
              </span>

              <p className="mt-3 text-xs font-bold text-ink">{step.label}</p>
              <p className="mt-1 text-[11px] leading-snug text-ink-muted">{step.hands}</p>
            </motion.li>
          ))}
        </ol>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------- risk demo */

function RiskSection() {
  return (
    <section id="risk" className="mx-auto max-w-7xl scroll-mt-20 px-4 py-16 sm:px-6">
      <SectionHeading
        center
        eyebrow="The differentiator"
        title="Why one line can flag an entire quotation"
        description="A Gold customer is allowed 15%. But Services only permit 10% — so an 18% service discount breaks its own limit even though the headline tier number looks fine. Try it."
      />

      <div className="mt-10">
        <RiskEngineDemo />
      </div>

      <div className="mx-auto mt-6 max-w-3xl">
        <GlassCard className="p-5">
          <h3 className="text-sm font-bold text-ink">Why “blended”?</h3>
          <p className="mt-1.5 text-xs leading-relaxed text-ink-soft">
            Sometimes no single line looks alarming, but many are each a little over — 2 points
            here, 3 there. Individually they pass a spot check. Added up across the order, the rep
            has quietly given away real margin. The blended score is value-weighted across every
            line, so small violations spread thin can&apos;t slip through. A separate single-line
            trip point catches the opposite case: one badly-over line in an otherwise clean order.
          </p>
        </GlassCard>
      </div>
    </section>
  );
}

/* -------------------------------------------------------- dashboard preview */

function DashboardPreview() {
  const alerts = [
    {
      severity: 'high',
      title: 'Delta Logistics — no activity for 11 days',
      detail: 'Draft · threshold is 5 days',
    },
    {
      severity: 'medium',
      title: '20.2% discount vs Kiran’s 9.2% average',
      detail: '2.2× this rep’s 90-day average',
    },
    {
      severity: 'high',
      title: 'Waiting on Sales Manager for 4 days',
      detail: 'Beta Industries · SLA is 24h',
    },
    {
      severity: 'medium',
      title: 'Delivery slipping 4 days on Gemini Healthcare',
      detail: '2 units on backorder',
    },
  ];

  const tones = {
    high: 'bg-state-danger',
    medium: 'bg-accent-amber',
    low: 'bg-state-info',
  };

  return (
    <section id="dashboard" className="mx-auto max-w-7xl scroll-mt-20 px-4 py-16 sm:px-6">
      <SectionHeading
        center
        eyebrow="Deal health"
        title="Managers find out before momentum is gone"
        description="Anomalies are computed against each rep's own rolling history, not a global threshold — so the signal survives having reps with different selling styles."
      />

      <div className="mt-10">
        <GlassCard strong className="p-5">
          <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
            <div>
              <div className="mb-3 flex items-center gap-2">
                <LayoutDashboard className="h-4 w-4 text-brand-600" aria-hidden="true" />
                <p className="text-sm font-bold text-ink">Live alert feed</p>
              </div>
              <ul className="space-y-2">
                {alerts.map((a) => (
                  <li
                    key={a.title}
                    className="flex items-start gap-2.5 rounded-xl bg-white/55 px-3 py-2.5"
                  >
                    <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${tones[a.severity]}`} />
                    <div className="min-w-0">
                      <p className="truncate text-xs font-bold text-ink">{a.title}</p>
                      <p className="text-[11px] text-ink-muted">{a.detail}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>

            <div className="grid grid-cols-2 gap-3 lg:grid-cols-1">
              <MiniStat icon={PieChart} label="Active deals" value="8" hint="₹32.4L in play" />
              <MiniStat icon={Gauge} label="Open anomalies" value="6" hint="2 high severity" />
            </div>
          </div>
        </GlassCard>
      </div>
    </section>
  );
}

function MiniStat({ icon: Icon, label, value, hint }) {
  return (
    <div className="rounded-xl bg-white/55 p-4">
      <div className="flex items-center gap-2">
        <Icon className="h-3.5 w-3.5 text-brand-600" aria-hidden="true" />
        <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted">{label}</p>
      </div>
      <p className="num mt-1.5 text-2xl font-extrabold text-ink">{value}</p>
      <p className="text-[11px] text-ink-muted">{hint}</p>
    </div>
  );
}

/* ------------------------------------------------------------- roles band */

function RolesBand() {
  return (
    <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
      <SectionHeading
        center
        eyebrow="Built for five people"
        title="Everyone gets the view they need"
      />

      <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {ROLES.map((r) => (
          <GlassCard key={r.role} hover className="p-4">
            <span className="bg-brand-500/12 mb-2.5 inline-flex h-9 w-9 items-center justify-center rounded-xl text-brand-600">
              <r.icon className="h-4 w-4" aria-hidden="true" />
            </span>
            <p className="text-xs font-bold text-ink">{r.role}</p>
            <p className="mt-1 text-[11px] leading-relaxed text-ink-soft">{r.blurb}</p>
          </GlassCard>
        ))}
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------- cta band */

function CtaBand() {
  return (
    <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
      <div className="relative overflow-hidden rounded-glass bg-gradient-to-br from-brand-600 via-brand-500 to-accent-pink p-8 shadow-glass-strong sm:p-12">
        <div
          aria-hidden="true"
          className="absolute -right-16 -top-16 h-64 w-64 rounded-full bg-white/15 blur-3xl"
        />
        <div className="relative max-w-2xl">
          <h2 className="text-2xl font-extrabold tracking-tight text-white sm:text-3xl">
            Walk a full quote-to-cash flow in five minutes
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-white/90 sm:text-base">
            Everything is seeded and ready — a Gold customer with a discount that breaks a service
            ceiling, stock that forces a two-warehouse split, and a customer waiting in the portal
            with a counter-offer.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link to="/login">
              <Button
                size="lg"
                variant="secondary"
                className="border-transparent bg-white text-brand-700 hover:bg-white/90"
                iconRight={ArrowRight}
              >
                Get started
              </Button>
            </Link>
            <Link to="/customer/login">
              <Button
                size="lg"
                variant="outline"
                className="border-white/60 text-white hover:bg-white/15"
              >
                Open customer portal demo
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ footer */

function LandingFooter() {
  return (
    <footer className="mx-auto max-w-7xl px-4 pb-10 sm:px-6">
      <div className="border-t border-brand-500/15 pt-8">
        <div className="flex flex-wrap items-start justify-between gap-8">
          <div className="max-w-xs">
            <div className="flex items-center gap-2.5">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-accent-indigo text-white">
                <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
              </span>
              <span className="text-sm font-extrabold tracking-tight text-ink">DealFlow360</span>
            </div>
            <p className="mt-2.5 text-xs leading-relaxed text-ink-muted">
              An intelligent, self-governing sales operations platform. Built as a hackathon
              reference implementation.
            </p>
          </div>

          <div className="flex flex-wrap gap-10">
            <FooterCol
              title="Product"
              links={[
                ['Features', '#features'],
                ['How it works', '#how'],
                ['Risk engine', '#risk'],
                ['Dashboard', '#dashboard'],
              ]}
            />
            <div>
              <p className="mb-2.5 text-[11px] font-bold uppercase tracking-wider text-ink-muted">
                Sign in
              </p>
              <ul className="space-y-1.5">
                <li>
                  <Link
                    to="/login"
                    className="text-xs font-medium text-ink-soft hover:text-brand-700"
                  >
                    Sales team login
                  </Link>
                </li>
                <li>
                  <Link
                    to="/customer/login"
                    className="text-xs font-medium text-ink-soft hover:text-brand-700"
                  >
                    Customer portal login
                  </Link>
                </li>
                <li>
                  <Link
                    to="/signup"
                    className="text-xs font-medium text-ink-soft hover:text-brand-700"
                  >
                    Create an account
                  </Link>
                </li>
              </ul>
            </div>
          </div>
        </div>

        <p className="mt-8 text-[11px] text-ink-muted">
          © {new Date().getFullYear()} DealFlow360. Demo build — data lives in your browser
          session.
        </p>
      </div>
    </footer>
  );
}

function FooterCol({ title, links }) {
  return (
    <div>
      <p className="mb-2.5 text-[11px] font-bold uppercase tracking-wider text-ink-muted">
        {title}
      </p>
      <ul className="space-y-1.5">
        {links.map(([label, href]) => (
          <li key={href}>
            <a href={href} className="text-xs font-medium text-ink-soft hover:text-brand-700">
              {label}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
