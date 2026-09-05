import { currentPendingStep } from './riskEngine';
import { stageLabel } from './format';

/**
 * The single source of truth for quotation stage movement. Every button, every
 * Kanban drag and the customer portal confirm all route through canTransition,
 * which is what stops the app developing inconsistent paths between screens.
 */

export const STAGES = [
  'draft',
  'sent',
  'under_negotiation',
  'pending_approval',
  'approved',
  'fulfillment',
  'billed',
  'confirmed',
  'lost',
];

/** Columns shown on the Kanban board, in order. */
export const PIPELINE_COLUMNS = [
  'draft',
  'pending_approval',
  'approved',
  'fulfillment',
  'billed',
  'confirmed',
  'lost',
];

export const TRANSITIONS = {
  draft: ['pending_approval', 'approved', 'sent', 'lost'],
  sent: ['under_negotiation', 'confirmed', 'pending_approval', 'draft', 'lost'],
  under_negotiation: ['draft', 'pending_approval', 'confirmed', 'lost'],
  pending_approval: ['approved', 'draft', 'lost'],
  approved: ['fulfillment', 'sent', 'lost'],
  fulfillment: ['billed', 'lost'],
  billed: ['confirmed', 'lost'],
  confirmed: [],
  lost: ['draft'],
};

/**
 * @returns {{ok: boolean, reason: string|null}}
 */
export function canTransition(from, to, quotation = null) {
  if (from === to) return { ok: true, reason: null };

  if (!STAGES.includes(to)) {
    return { ok: false, reason: `"${to}" is not a valid stage.` };
  }

  const allowed = TRANSITIONS[from] ?? [];
  if (!allowed.includes(to)) {
    return {
      ok: false,
      reason: `Can't move ${stageLabel(from)} → ${stageLabel(to)}. Allowed from here: ${
        allowed.length ? allowed.map(stageLabel).join(', ') : 'nothing (this stage is final)'
      }.`,
    };
  }

  if (!quotation) return { ok: true, reason: null };

  // Business-rule gates beyond the raw graph.
  if (to === 'approved' && from === 'pending_approval') {
    const pending = currentPendingStep(quotation);
    if (pending) {
      return {
        ok: false,
        reason: `Still waiting on ${stageLabel(pending.role)} approval. Approve the step instead of moving the card.`,
      };
    }
  }

  if (to === 'fulfillment' && !quotation.lines?.some((l) => !l.isSubscription && l.category !== 'service')) {
    return {
      ok: false,
      reason: 'Nothing to fulfil — this quotation has no shippable lines.',
    };
  }

  if (to === 'billed' && from === 'fulfillment' && !quotation.lines?.length) {
    return { ok: false, reason: 'Add at least one line before billing.' };
  }

  if (to === 'confirmed' && from === 'billed') {
    // Confirmation from billed is driven by full payment.
    return { ok: true, reason: null };
  }

  return { ok: true, reason: null };
}

export const STAGE_META = {
  draft: { label: 'Draft', tone: 'text-ink-soft', bg: 'bg-ink/8', dot: 'bg-ink-muted' },
  sent: { label: 'Sent', tone: 'text-state-info', bg: 'bg-state-info/12', dot: 'bg-state-info' },
  under_negotiation: {
    label: 'Under Negotiation',
    tone: 'text-accent-amber',
    bg: 'bg-accent-amber/14',
    dot: 'bg-accent-amber',
  },
  pending_approval: {
    label: 'Pending Approval',
    tone: 'text-brand-700',
    bg: 'bg-brand-500/14',
    dot: 'bg-brand-500',
  },
  approved: {
    label: 'Approved',
    tone: 'text-accent-teal',
    bg: 'bg-accent-teal/14',
    dot: 'bg-accent-teal',
  },
  fulfillment: {
    label: 'Fulfillment',
    tone: 'text-accent-indigo',
    bg: 'bg-accent-indigo/14',
    dot: 'bg-accent-indigo',
  },
  billed: { label: 'Billed', tone: 'text-accent-pink', bg: 'bg-accent-pink/14', dot: 'bg-accent-pink' },
  confirmed: {
    label: 'Confirmed',
    tone: 'text-state-success',
    bg: 'bg-state-success/14',
    dot: 'bg-state-success',
  },
  lost: { label: 'Lost', tone: 'text-state-danger', bg: 'bg-state-danger/12', dot: 'bg-state-danger' },
};

export function stageMeta(stage) {
  return STAGE_META[stage] ?? STAGE_META.draft;
}

/** Stages that count as an open, working deal (used by anomaly detection). */
export const OPEN_STAGES = ['draft', 'sent', 'under_negotiation', 'pending_approval'];

/** Stages where the rep can still edit lines. */
export const EDITABLE_STAGES = ['draft', 'under_negotiation'];

export function isEditable(stage) {
  return EDITABLE_STAGES.includes(stage);
}

/** Approval funnel ordering for reports. */
export const FUNNEL_ORDER = [
  'draft',
  'pending_approval',
  'approved',
  'fulfillment',
  'billed',
  'confirmed',
];
