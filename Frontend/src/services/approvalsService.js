/**
 * Approvals — API-REFERENCE §12 (5 endpoints).
 *
 *   POST /quotations/:id/submit-approval  owner, manager, admin · EMPTY body
 *   POST /quotations/:id/approve          the step's role (admin may unblock)
 *   POST /quotations/:id/reject           the step's role · reason min 10 chars
 *   POST /quotations/:id/return           the step's role · reason min 10 chars
 *   GET  /approvals/queue                 manager, finance, admin
 *
 * FOUR INVARIANTS, each because breaking it is how discount governance gets quietly
 * defeated:
 *
 * 1. A rep never chooses the route. `submit-approval` re-scores from live line data
 *    and resolves the chain from stored config. The body is empty precisely so there
 *    is nothing for the client to influence — do not add fields to it.
 * 2. Steps are strictly ordered. Only the first step still `pending` is actionable, so
 *    Finance cannot sign off before the Sales Manager.
 * 3. A return CLEARS THE CHAIN ENTIRELY. A resubmission re-scores from scratch, so a
 *    worse quotation cannot ride an approval given for a better one.
 * 4. Scores are never cached across a submission.
 */

import { api } from './apiClient';

export const MIN_REASON_LENGTH = 10;

/**
 * Submit for approval. The server decides everything.
 *
 * @returns {Promise<{quotation, autoApproved, risk, approvers, label}>}
 *   `autoApproved: true` means every line sat inside its ceiling and the stage went
 *   straight to `approved` — audited as a SYSTEM action, not the submitter's, because
 *   the server made that call.
 *
 * 409 EMPTY_QUOTATION with no lines; 409 STAGE_LOCKED from a stage that does not permit
 * submission.
 */
export function submitForApproval(quotationId) {
  return api.post(`/quotations/${encodeURIComponent(quotationId)}/submit-approval`);
}

/**
 * Approve the current step.
 *
 * @returns {Promise<{quotation, complete, nextRole}>} `complete: true` with
 *   `nextRole: null` means the chain finished and the stage moved to `approved`.
 *
 * 409 NOT_PENDING when nothing awaits approval; 403 WRONG_APPROVER when the caller's
 * role does not match the current step. An admin may unblock any step so a one-operator
 * deployment is never deadlocked — that is audited as an admin acting in another role's
 * place.
 */
export function approveStep(quotationId, comment) {
  const body = {};
  if (comment) body.comment = comment;
  return api.post(`/quotations/${encodeURIComponent(quotationId)}/approve`, body);
}

/**
 * Reject. Reason required, minimum 10 characters — a rep told only "rejected" has to
 * guess what to change.
 *
 * stage → lost, the acting step → rejected, every later step → skipped. Notifies and
 * emails the owning rep with the reason.
 */
export function rejectQuotation(quotationId, reason) {
  assertReason(reason);
  return api.post(`/quotations/${encodeURIComponent(quotationId)}/reject`, { reason });
}

/**
 * Return for revision. Same 10-character minimum.
 *
 * stage → draft, and the approval chain is DELETED rather than marked returned. That is
 * what enforces invariant 3 — there is no partial approval left for a resubmission to
 * inherit.
 */
export function returnQuotation(quotationId, reason) {
  assertReason(reason);
  return api.post(`/quotations/${encodeURIComponent(quotationId)}/return`, { reason });
}

function assertReason(reason) {
  if (String(reason ?? '').trim().length < MIN_REASON_LENGTH) {
    throw new Error(
      `Please write at least ${MIN_REASON_LENGTH} characters so the rep knows what to change.`,
    );
  }
}

/**
 * My approval queue.
 *
 * Only quotations whose CURRENT step matches the caller's role. A finance user does not
 * see one still sitting with the manager — they cannot act on it, and it would read as a
 * backlog they are failing to clear.
 *
 * @returns {Promise<Array>} [{ quotation, step: { role, stepOrder, waitingSince }, risk }]
 */
export async function fetchApprovalQueue() {
  const data = await api.get('/approvals/queue');
  return Array.isArray(data) ? data : [];
}
