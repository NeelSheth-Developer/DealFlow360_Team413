import { useState } from 'react';
import { toast } from 'sonner';
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
import { computeBlendedRisk, resolveApprovalPath } from '@/lib/riskEngine';
import { categoryLabel, money, percent, roleLabel, tierLabel } from '@/lib/format';
import { cn, nextId } from '@/lib/utils';
import { GlassCard, GlassPanel } from '@/components/glass/Glass';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button, IconButton } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { Table, TBody, TD, TFoot, TH, THead, TR } from '@/components/ui/Table';
import { RiskGauge } from '@/components/shared/RiskGauge';

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
    { id: 'sb-1', productName: 'Laptop Pro 14', category: 'hardware', qty: 1, unitPrice: 100000, discountPct: 12 },
    { id: 'sb-2', productName: 'Setup Service', category: 'service', qty: 1, unitPrice: 20000, discountPct: 18 },
  ]);

  const sandboxRisk = computeBlendedRisk(
    sandboxLines,
    categoryCeilings,
    tierCeilings[sandboxTier] ?? 0,
    0,
  );
  const sandboxPath = resolveApprovalPath(sandboxRisk, approvalChain);

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
                      <input
                        type="number"
                        min={0}
                        max={100}
                        aria-label={`${tierLabel(tier)} ceiling`}
                        value={pct}
                        onChange={(e) => setTierCeiling(tier, Number(e.target.value))}
                        className="num h-8 w-20 rounded-lg border border-brand-500/20 bg-white/70 px-2 text-right text-xs font-bold text-ink focus:border-brand-500/50 focus:outline-none focus:ring-2 focus:ring-brand-500/25"
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
                        <input
                          type="number"
                          min={0}
                          max={100}
                          aria-label={`${categoryLabel(category)} ceiling`}
                          value={pct}
                          onChange={(e) => setCategoryCeiling(category, Number(e.target.value))}
                          className="num h-8 w-20 rounded-lg border border-brand-500/20 bg-white/70 px-2 text-right text-xs font-bold text-ink focus:border-brand-500/50 focus:outline-none focus:ring-2 focus:ring-brand-500/25"
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
                onClick={() =>
                  upsertApprovalRule({
                    id: nextId('ar'),
                    minScore: 0,
                    maxScore: null,
                    approvers: ['sales_manager'],
                    singleLineTrip: null,
                    note: '',
                  })
                }
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
                      <input
                        type="number"
                        step="0.5"
                        aria-label="Minimum score"
                        value={rule.minScore}
                        onChange={(e) =>
                          upsertApprovalRule({ ...rule, minScore: Number(e.target.value) })
                        }
                        className="num h-8 w-16 rounded-lg border border-brand-500/20 bg-white/70 px-2 text-right text-xs font-semibold focus:border-brand-500/50 focus:outline-none focus:ring-2 focus:ring-brand-500/25"
                      />
                    </TD>
                    <TD align="right">
                      <input
                        type="number"
                        step="0.5"
                        aria-label="Maximum score, blank for unbounded"
                        placeholder="∞"
                        value={rule.maxScore ?? ''}
                        onChange={(e) =>
                          upsertApprovalRule({
                            ...rule,
                            maxScore: e.target.value === '' ? null : Number(e.target.value),
                          })
                        }
                        className="num h-8 w-16 rounded-lg border border-brand-500/20 bg-white/70 px-2 text-right text-xs font-semibold focus:border-brand-500/50 focus:outline-none focus:ring-2 focus:ring-brand-500/25"
                      />
                    </TD>
                    <TD>
                      <Select
                        className="h-8 text-[11px]"
                        aria-label="Approvers"
                        value={rule.approvers.length === 0 ? 'none' : rule.approvers.join(',')}
                        onChange={(e) =>
                          upsertApprovalRule({
                            ...rule,
                            approvers: e.target.value === 'none' ? [] : e.target.value.split(','),
                          })
                        }
                        options={APPROVER_OPTIONS}
                      />
                    </TD>
                    <TD align="right">
                      <input
                        type="number"
                        step="0.5"
                        aria-label="Single line trip point"
                        placeholder="—"
                        value={rule.singleLineTrip ?? ''}
                        onChange={(e) =>
                          upsertApprovalRule({
                            ...rule,
                            singleLineTrip: e.target.value === '' ? null : Number(e.target.value),
                          })
                        }
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
                        onClick={() => {
                          deleteApprovalRule(rule.id);
                          toast.success('Rule removed');
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
            description="Test the live scoring function against sample lines."
            icon={FlaskConical}
            accent="teal"
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
                    <Input
                      aria-label="Line value"
                      type="number"
                      className="h-8 text-[11px]"
                      value={line.unitPrice}
                      onChange={(e) => updateSandboxLine(line.id, { unitPrice: Number(e.target.value) })}
                    />
                    <Input
                      aria-label="Discount percent"
                      type="number"
                      className="h-8 text-[11px]"
                      suffix="%"
                      value={line.discountPct}
                      onChange={(e) =>
                        updateSandboxLine(line.id, { discountPct: Number(e.target.value) })
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
