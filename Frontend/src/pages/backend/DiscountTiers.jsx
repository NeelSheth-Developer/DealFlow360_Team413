import { useEffect, useState } from 'react';
import { notify } from '@/lib/notify';
import {
  AlertTriangle,
  Award,
  FlaskConical,
  Layers,
  Plus,
  Trash2,
  UserCheck,
  Workflow,
} from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import { PENDING_RISK, scoreLines } from '@/services/riskService';
import { categoryLabel, money, percent, roleLabel, tierLabel } from '@/lib/format';
import { cn, nextId } from '@/lib/utils';
import { GlassCard, GlassPanel } from '@/components/glass/Glass';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button, IconButton } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Input';
import { NumberField } from '@/components/ui/NumberField';
import { Badge } from '@/components/ui/Badge';
import { Table, TBody, TD, TFoot, TH, THead, TR } from '@/components/ui/Table';
import { RiskGauge } from '@/components/shared/RiskGauge';
import { Spinner } from '@/components/ui/Loading';

/**
 * The first score band not already covered by the chain.
 *
 * The server REJECTS an overlapping rule outright (409 INVALID_RANGE), so "Add rule"
 * cannot just ask for a fixed range. It used to hardcode 0–∞, which overlaps essentially
 * any chain that already exists: with a single 25–∞ rule in place the button failed every
 * time with "Score range 0–∞ overlaps existing rule 25–∞", and there was no way to build
 * 0–5 / 5–25 / 25–∞ by adding rules one at a time.
 *
 * Walking the sorted bands and returning the first gap means each click adds a rule that
 * is guaranteed to be accepted — and building that three-band chain is just three clicks.
 *
 * @returns {{minScore, maxScore}|null} null when the chain already covers 0→∞.
 */
function nextFreeBand(chain = []) {
  const sorted = [...chain].sort((a, b) => a.minScore - b.minScore);

  let cursor = 0;
  for (const rule of sorted) {
    // A gap below this rule: take it.
    if (rule.minScore > cursor) return { minScore: cursor, maxScore: rule.minScore };
    cursor = Math.max(cursor, rule.maxScore ?? Infinity);
    if (cursor === Infinity) break;
  }

  // No gap, but the chain stops somewhere finite — extend it to unbounded.
  if (Number.isFinite(cursor)) return { minScore: cursor, maxScore: null };

  // 0→∞ is already covered; every possible band would overlap.
  return null;
}

const APPROVER_OPTIONS = [
  { value: 'none', label: 'Auto-approve (no reviewer)' },
  { value: 'sales_manager', label: 'Sales Manager only' },
  { value: 'sales_manager,finance', label: 'Sales Manager, then Finance' },
];

/** Discount tiers, category ceilings and the approval chain (spec A3). */
export default function DiscountTiers() {
  const tierCeilings = useAppStore((s) => s.tierCeilings);
  const categoryCeilings = useAppStore((s) => s.categoryCeilings);
  const approvalChain = useAppStore((s) => s.approvalChain);
  const setTierCeiling = useAppStore((s) => s.setTierCeiling);
  const setCategoryCeiling = useAppStore((s) => s.setCategoryCeiling);
  const upsertApprovalRule = useAppStore((s) => s.upsertApprovalRule);
  const deleteApprovalRule = useAppStore((s) => s.deleteApprovalRule);
  const validateApprovalChain = useAppStore((s) => s.validateApprovalChain);

  const issues = validateApprovalChain();

  // -------------------------------------------------------------- sandbox
  const [sandboxTier, setSandboxTier] = useState('gold');
  const [sandboxLines, setSandboxLines] = useState([
    { id: 'sb-1', productName: 'Laptop', category: 'hardware', qty: 1, unitPrice: 1000, discountPct: 10 },
    { id: 'sb-2', productName: 'Setup Service', category: 'service', qty: 1, unitPrice: 2000, discountPct: 18 },
  ]);
  const [scored, setScored] = useState(PENDING_RISK);
  const [scoring, setScoring] = useState(false);

  // Debounced so dragging a slider doesn't fire a request per frame. This calls
  // the same scoring service the app uses, so the sandbox genuinely tests
  // production behaviour rather than a separate local copy of the rules.
  useEffect(() => {
    let cancelled = false;
    setScoring(true);

    const timer = setTimeout(async () => {
      try {
        // The ceiling overrides below are honoured only for admin and sales_manager,
        // which is exactly who can reach this screen — that is what makes the sandbox
        // able to preview an unsaved change.
        const result = await scoreLines({
          lines: sandboxLines,
          // The tier is required by the schema, not decorative: the server picks the
          // stored tier ceiling from it whenever the override below is absent.
          tier: sandboxTier,
          categoryCeilings,
          tierCeiling: tierCeilings[sandboxTier] ?? 0,
          orderDiscountPct: 0,
        });
        if (!cancelled) setScored(result);
      } catch (error) {
        // No local fallback: showing an invented score in the tool people use to
        // reason about the real one would be worse than showing nothing.
        if (!cancelled) {
          setScored({
            ...PENDING_RISK,
            status: 'error',
            error: error.message,
            approvalPath: { approvers: [], ruleId: null, label: 'Score unavailable' },
          });
        }
      } finally {
        if (!cancelled) setScoring(false);
      }
    }, 220);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [sandboxLines, sandboxTier, categoryCeilings, tierCeilings, approvalChain]);

  const sandboxRisk = scored.risk;
  const sandboxPath = scored.approvalPath;

  const updateSandboxLine = (id, patch) =>
    setSandboxLines((lines) => lines.map((l) => (l.id === id ? { ...l, ...patch } : l)));

  return (
    <div>
      <PageHeader
        title="Discount tiers & approval chain"
        description="These settings decide who must review a deal before it can be approved. Every change is audited."
      />

      <div className="grid gap-4 xl:grid-cols-[1fr_400px]">
        <div className="space-y-4">
          {/* ------------------------------------------- tier ceilings */}
          <GlassPanel
            title="Customer tier ceilings"
            description="The headline discount each tier is allowed."
            icon={Award}
            bodyClassName="px-0 py-0 sm:px-0"
          >
            <Table>
              <THead>
                <TR>
                  <TH>Tier</TH>
                  <TH align="right">Max discount</TH>
                  <TH>Effect</TH>
                </TR>
              </THead>
              <TBody>
                {Object.entries(tierCeilings).map(([tier, pct]) => (
                  <TR key={tier}>
                    <TD>
                      <Badge
                        tone={tier === 'gold' ? 'warning' : tier === 'silver' ? 'neutral' : 'neutral'}
                        size="xs"
                      >
                        {tierLabel(tier)}
                      </Badge>
                    </TD>
                    <TD align="right">
                      {/* One PUT per edit, on blur. This used to fire a request per
                          keystroke, so "18" sent 1 then 18 and whichever reply landed
                          last won — which is why a ceiling could read back as 1. */}
                      <NumberField
                        min={0}
                        max={100}
                        className="w-20"
                        aria-label={`${tierLabel(tier)} ceiling`}
                        value={pct}
                        onCommit={async (v) => {
                          const r = await setTierCeiling(tier, v);
                          notify.report(
                            r,
                            { title: `${tierLabel(tier)} ceiling set to ${v}%` },
                            'Could not save the ceiling',
                          );
                        }}
                      />
                    </TD>
                    <TD className="text-[11px] text-ink-muted">
                      Caps every line for {tierLabel(tier)} customers, even where the category allows
                      more.
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </GlassPanel>

          {/* --------------------------------------- category ceilings */}
          <GlassPanel
            title="Category ceilings"
            description="Stricter per-line limits. This is what makes the score 'blended' rather than one flat number."
            icon={Layers}
            accent="indigo"
            bodyClassName="px-0 py-0 sm:px-0"
          >
            <Table>
              <THead>
                <TR>
                  <TH>Category</TH>
                  <TH align="right">Max discount</TH>
                  <TH align="right">Binding for Gold</TH>
                </TR>
              </THead>
              <TBody>
                {Object.entries(categoryCeilings).map(([category, pct]) => {
                  const gold = tierCeilings.gold ?? 100;
                  const binding = Math.min(pct, gold);
                  return (
                    <TR key={category}>
                      <TD className="font-semibold">{categoryLabel(category)}</TD>
                      <TD align="right">
                        <NumberField
                          min={0}
                          max={100}
                          className="w-20"
                          aria-label={`${categoryLabel(category)} ceiling`}
                          value={pct}
                          onCommit={async (v) => {
                            const r = await setCategoryCeiling(category, v);
                            notify.report(
                              r,
                              { title: `${categoryLabel(category)} ceiling set to ${v}%` },
                              'Could not save the ceiling',
                            );
                          }}
                        />
                      </TD>
                      <TD align="right" num className="text-ink-soft">
                        {percent(binding, 0)}
                        <span className="ml-1 text-[10px] text-ink-muted">
                          ({binding === pct ? 'category' : 'tier'})
                        </span>
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>

            <p className="px-4 pb-3 pt-2 text-[11px] leading-relaxed text-ink-muted sm:px-5">
              A Gold customer allowed 15% still can&apos;t take 18% on a Service line, because
              Services cap at {percent(categoryCeilings.service ?? 0, 0)}. That single line is what
              flags the whole quotation.
            </p>
          </GlassPanel>

          {/* ---------------------------------------- approval chain */}
          <GlassPanel
            title="Approval chain"
            description="Which blended score ranges need which approvers."
            icon={Workflow}
            accent="amber"
            actions={
              <Button
                size="sm"
                variant="secondary"
                icon={Plus}
                onClick={async () => {
                  const band = nextFreeBand(approvalChain);
                  if (!band) {
                    notify.info(
                      'The chain already covers every score',
                      'Narrow an existing band first — the server rejects a rule that overlaps one.',
                    );
                    return;
                  }

                  // NO `id`. `upsertApprovalRule` branches on it: with one it PUTs to
                  // /config/approval-chain/:id, so a fabricated id addressed a rule that
                  // does not exist. Omitting it takes the POST/create branch.
                  const r = await upsertApprovalRule({
                    ...band,
                    approvers: ['sales_manager'],
                    singleLineTrip: null,
                    note: '',
                  });
                  notify.report(
                    r,
                    {
                      title: 'Rule added',
                      description: `Covers ${band.minScore}–${band.maxScore ?? '∞'}. Set its approvers below.`,
                    },
                    'Could not add the rule',
                  );
                }}
              >
                Add rule
              </Button>
            }
            bodyClassName="px-0 py-0 sm:px-0"
          >
            {issues.length > 0 && (
              <div className="mx-4 mb-3 mt-3 rounded-xl border border-accent-amber/35 bg-accent-amber/10 p-3 sm:mx-5">
                <p className="flex items-center gap-1.5 text-[11px] font-bold text-accent-amber">
                  <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
                  {issues.length} coverage issue(s)
                </p>
                <ul className="mt-1.5 space-y-0.5">
                  {issues.map((issue, i) => (
                    <li key={i} className="text-[11px] leading-relaxed text-ink-soft">
                      · {issue}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <Table>
              <THead>
                <TR>
                  <TH align="right">Score from</TH>
                  <TH align="right">to</TH>
                  <TH>Approvers</TH>
                  <TH align="right">Single-line trip</TH>
                  <TH align="right" className="w-10" />
                </TR>
              </THead>
              <TBody>
                {approvalChain.map((rule) => (
                  <TR key={rule.id}>
                    <TD align="right">
                      <NumberField
                        step="0.5"
                        min={0}
                        className="w-16"
                        aria-label="Minimum score"
                        value={rule.minScore ?? ''}
                        onCommit={async (v) => {
                          const r = await upsertApprovalRule({ ...rule, minScore: v });
                          if (!r?.ok) notify.report(r, null, 'Could not update the rule');
                        }}
                      />
                    </TD>
                    <TD align="right">
                      <input
                        type="number"
                        step="0.5"
                        aria-label="Maximum score, blank for unbounded"
                        placeholder="∞"
                        onBlur={async (e) => {
                          // Blank is meaningful here — it means unbounded — so this keeps
                          // a raw input and commits on blur rather than using NumberField.
                          const next = e.target.value === '' ? null : Number(e.target.value);
                          if (next === (rule.maxScore ?? null)) return;
                          const r = await upsertApprovalRule({ ...rule, maxScore: next });
                          if (!r?.ok) notify.report(r, null, 'Could not update the rule');
                        }}
                        defaultValue={rule.maxScore ?? ''}
                        className="num h-8 w-16 rounded-lg border border-brand-500/20 bg-white/70 px-2 text-right text-xs font-semibold focus:border-brand-500/50 focus:outline-none focus:ring-2 focus:ring-brand-500/25"
                      />
                    </TD>
                    <TD>
                      <Select
                        className="h-8 text-[11px]"
                        aria-label="Approvers"
                        value={rule.approvers.length === 0 ? 'none' : rule.approvers.join(',')}
                        onChange={async (e) => {
                          const r = await upsertApprovalRule({
                            ...rule,
                            approvers: e.target.value === 'none' ? [] : e.target.value.split(','),
                          });
                          notify.report(
                            r,
                            { title: 'Approval rule updated' },
                            'Could not update the rule',
                          );
                        }}
                        options={APPROVER_OPTIONS}
                      />
                    </TD>
                    <TD align="right">
                      <input
                        type="number"
                        min={0}
                        step="0.5"
                        aria-label="Single line trip point"
                        placeholder="—"
                        onBlur={async (e) => {
                          const next = e.target.value === '' ? null : Number(e.target.value);
                          if (next === (rule.singleLineTrip ?? null)) return;
                          const r = await upsertApprovalRule({ ...rule, singleLineTrip: next });
                          if (!r?.ok) notify.report(r, null, 'Could not update the rule');
                        }}
                        defaultValue={rule.singleLineTrip ?? ''}
                        className="num h-8 w-16 rounded-lg border border-brand-500/20 bg-white/70 px-2 text-right text-xs font-semibold focus:border-brand-500/50 focus:outline-none focus:ring-2 focus:ring-brand-500/25"
                      />
                    </TD>
                    <TD align="right">
                      <IconButton
                        icon={Trash2}
                        label="Remove rule"
                        size="xs"
                        variant="ghost"
                        className="text-state-danger hover:bg-state-danger/10"
                        onClick={async () => {
                          // 409 CHAIN_NOT_CONFIGURED when this is the last rule — the
                          // server refuses, and that has to reach the screen.
                          const r = await deleteApprovalRule(rule.id);
                          notify.report(
                            r,
                            { title: 'Rule removed' },
                            'Could not remove the rule',
                          );
                        }}
                      />
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>

            <p className="px-4 pb-3 pt-2 text-[11px] leading-relaxed text-ink-muted sm:px-5">
              <span className="font-semibold text-ink">Single-line trip</span> force-escalates when any
              one line is that many points over its own ceiling, even if the value-weighted blend
              looks mild. When two rules both match, whichever demands more approvers wins — routing
              never goes down.
            </p>
          </GlassPanel>
        </div>

        {/* ------------------------------------------------------ sandbox */}
        <div className="xl:sticky xl:top-24 xl:self-start">
          <GlassPanel
            title="Risk sandbox"
            description="Sends sample lines through the same scoring service the app uses."
            icon={FlaskConical}
            accent="teal"
            actions={
              scoring ? (
                <Spinner size="sm" className="text-brand-500" />
              ) : (
                <Badge tone={scored.source === 'server' ? 'success' : 'neutral'} size="xs">
                  {scored.source === 'server'
                    ? 'server'
                    : scored.source === 'fallback'
                      ? 'fallback'
                      : 'local'}
                </Badge>
              )
            }
          >
            <Select
              label="Customer tier"
              value={sandboxTier}
              onChange={(e) => setSandboxTier(e.target.value)}
              options={Object.keys(tierCeilings).map((t) => ({
                value: t,
                label: `${tierLabel(t)} (${tierCeilings[t]}%)`,
              }))}
            />

            <ul className="mt-3 space-y-2.5">
              {sandboxLines.map((line) => (
                <li key={line.id} className="rounded-xl bg-white/55 p-2.5">
                  <div className="flex items-center gap-2">
                    <Input
                      aria-label="Line name"
                      className="h-8 flex-1 text-[11px]"
                      value={line.productName}
                      onChange={(e) => updateSandboxLine(line.id, { productName: e.target.value })}
                    />
                    <IconButton
                      icon={Trash2}
                      label="Remove sandbox line"
                      size="xs"
                      variant="ghost"
                      className="text-state-danger"
                      onClick={() =>
                        setSandboxLines((lines) => lines.filter((l) => l.id !== line.id))
                      }
                    />
                  </div>

                  <div className="mt-2 grid grid-cols-3 gap-1.5">
                    <Select
                      aria-label="Category"
                      className="h-8 text-[11px]"
                      value={line.category}
                      onChange={(e) => updateSandboxLine(line.id, { category: e.target.value })}
                      options={Object.keys(categoryCeilings).map((c) => ({
                        value: c,
                        label: categoryLabel(c),
                      }))}
                    />
                    {/* Clamped to the risk schema's own bounds (unitPrice >= 0), so the
                        sandbox cannot send a body the scorer will reject. */}
                    <Input
                      aria-label="Line value"
                      type="number"
                      min={0}
                      className="h-8 text-[11px]"
                      value={line.unitPrice}
                      onChange={(e) =>
                        updateSandboxLine(line.id, {
                          unitPrice: Math.max(0, Number(e.target.value) || 0),
                        })
                      }
                    />
                    <Input
                      aria-label="Discount percent"
                      type="number"
                      min={0}
                      max={100}
                      className="h-8 text-[11px]"
                      suffix="%"
                      value={line.discountPct}
                      onChange={(e) =>
                        updateSandboxLine(line.id, {
                          discountPct: Math.min(100, Math.max(0, Number(e.target.value) || 0)),
                        })
                      }
                    />
                  </div>
                </li>
              ))}
            </ul>

            <Button
              variant="secondary"
              size="sm"
              icon={Plus}
              fullWidth
              className="mt-2.5"
              onClick={() =>
                setSandboxLines((lines) => [
                  ...lines,
                  {
                    id: nextId('sb'),
                    productName: 'New line',
                    category: 'hardware',
                    qty: 1,
                    unitPrice: 50000,
                    discountPct: 10,
                  },
                ])
              }
            >
              Add line
            </Button>

            {/* -------------------------------------------- breakdown */}
            <div className="mt-4 border-t border-brand-500/12 pt-4">
              <RiskGauge score={sandboxRisk.score} label={sandboxPath.label} className="mx-auto" />

              <Table dense className="mt-3">
                <THead>
                  <TR>
                    <TH>Line</TH>
                    <TH align="right">Given</TH>
                    <TH align="right">Allowed</TH>
                    <TH align="right">Over</TH>
                  </TR>
                </THead>
                <TBody>
                  {sandboxRisk.lineBreakdown.map((row) => (
                    <TR key={row.lineId} className={cn(row.isViolation && 'bg-state-danger/6')}>
                      <TD className="max-w-[110px] truncate text-[11px] font-semibold">
                        {row.productName}
                      </TD>
                      <TD align="right" num className="text-[11px]">
                        {percent(row.givenPct, 0)}
                      </TD>
                      <TD align="right" num className="text-[11px] text-ink-muted">
                        {percent(row.ceilingPct, 0)}
                      </TD>
                      <TD
                        align="right"
                        num
                        className={cn(
                          'text-[11px] font-bold',
                          row.isViolation ? 'text-state-danger' : 'text-state-success',
                        )}
                      >
                        {row.overBy > 0 ? `+${row.overBy.toFixed(1)}` : '—'}
                      </TD>
                    </TR>
                  ))}
                </TBody>
                <TFoot>
                  <TR>
                    <TD colSpan={3} className="text-[11px] font-bold">
                      Blended score
                    </TD>
                    <TD align="right" num className="text-xs font-extrabold text-brand-700">
                      {sandboxRisk.score.toFixed(2)}
                    </TD>
                  </TR>
                </TFoot>
              </Table>

              <div
                className={cn(
                  'mt-3 rounded-xl border p-3',
                  sandboxPath.approvers.length === 0
                    ? 'border-state-success/30 bg-state-success/10'
                    : sandboxPath.approvers.length === 1
                      ? 'border-accent-amber/35 bg-accent-amber/12'
                      : 'border-state-danger/30 bg-state-danger/10',
                )}
              >
                <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-ink-muted">
                  <UserCheck className="h-3 w-3" aria-hidden="true" />
                  Resolved route
                </p>
                <p className="mt-1 text-sm font-extrabold text-ink">{sandboxPath.label}</p>
                <p className="mt-1 text-[11px] leading-relaxed text-ink-soft">
                  {sandboxPath.approvers.length === 0
                    ? 'Auto-approves — no reviewer needed.'
                    : sandboxPath.approvers.map(roleLabel).join(' → ')}
                </p>
                <p className="mt-1.5 text-[10px] text-ink-muted">
                  Order value {money(sandboxRisk.totalValue)} · worst single line{' '}
                  {sandboxRisk.worstSingleOverage.toFixed(1)} pts over
                </p>
              </div>
            </div>
          </GlassPanel>

          <GlassCard className="mt-4 p-4">
            <p className="text-xs font-bold text-ink">Why value-weighting matters</p>
            <p className="mt-1.5 text-[11px] leading-relaxed text-ink-soft">
              Try setting several lines 2–3 points over their ceilings. No single line looks alarming,
              but the blended score climbs because the overages are summed against order value — which
              is exactly the pattern a flat per-line check would miss.
            </p>
          </GlassCard>
        </div>
      </div>
    </div>
  );
}
