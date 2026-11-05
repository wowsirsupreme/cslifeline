// js/engine/interventions.js
// Intervention outcome evaluation.
//
// An intervention is judged ONLY on assessment evidence about its target
// (a misconception or a chapter), comparing responses before the intervention
// started with responses after it. Completing the assigned activity is recorded
// but never counted as improvement by itself. The result is an association,
// not a causal effect: the wording returned here says so.

import { wilson, toMs, DAY } from './stats.js';
import { targetsOf } from './misconception.js';

export const ENGINE_VERSION = 'ivx-1.0';

export const INTERVENTION_STATUS = ['planned', 'active', 'review_due', 'completed', 'cancelled'];
export const ACTIVITY_KINDS = {
  targeted_practice: 'Targeted practice set (assigned in CS Lifeline)',
  follow_up_assessment: 'Follow-up assessment',
  reteach: 'Re-teaching / small-group session',
  conversation: 'One-to-one conversation',
  external: 'Activity on another platform (e.g. WOW Sir)',
  other: 'Other',
};

export const OUTCOME_LABELS = {
  improved: 'Improvement observed',
  no_clear_change: 'No clear change',
  declined: 'Decline observed',
  insufficient_evidence: 'Not enough evidence yet',
};

/** Does a response provide evidence about the intervention target? */
export function isOnTarget(r, target, questionsById) {
  if (!target) return false;
  if (target.type === 'chapter') return r.chapter_id === target.id;
  if (target.type === 'misconception') {
    const q = questionsById instanceof Map ? questionsById.get(r.question_id) : questionsById?.[r.question_id];
    return targetsOf(q).has(target.id) || (r.misconception_hits || []).includes(target.id);
  }
  return false;
}

/** Newcombe (hybrid Wilson) 95% CI for the difference of two proportions p2 - p1. */
export function diffCI(k1, n1, k2, n2) {
  const a = wilson(k1, n1), b = wilson(k2, n2);
  if (a.p === null || b.p === null) return { diff: null, lo: null, hi: null };
  const d = b.p - a.p;
  const lo = d - Math.sqrt((b.p - b.lo) ** 2 + (a.hi - a.p) ** 2);
  const hi = d + Math.sqrt((b.hi - b.p) ** 2 + (a.p - a.lo) ** 2);
  return { diff: d, lo, hi };
}

/**
 * @param intervention { started_at, target:{type,id}, activity_completed_at? }
 * @param responses    the student's canonical responses
 * @param opts         { questionsById, preWindowDays = 42, minEach = 3, now }
 */
export function evaluateIntervention(intervention, responses, opts = {}) {
  const { questionsById = new Map(), preWindowDays = 42, minEach = 3, now = Date.now() } = opts;
  const start = toMs(intervention.started_at || intervention.created_at);
  const on = responses.filter(r => (r.correct === true || r.correct === false) && isOnTarget(r, intervention.target, questionsById));
  const pre = on.filter(r => { const t = toMs(r.recorded_at); return t < start && t >= start - preWindowDays * DAY; });
  const post = on.filter(r => { const t = toMs(r.recorded_at); return t >= start && t <= now; });
  const k1 = pre.filter(r => r.correct).length, k2 = post.filter(r => r.correct).length;
  const ci = diffCI(k1, pre.length, k2, post.length);
  let outcome;
  if (pre.length < minEach || post.length < minEach) outcome = 'insufficient_evidence';
  else if (ci.diff >= 0.15 && ci.lo > 0) outcome = 'improved';
  else if (ci.diff <= -0.15 && ci.hi < 0) outcome = 'declined';
  else outcome = 'no_clear_change';

  const summary = outcome === 'insufficient_evidence'
    ? `Needs at least ${minEach} marked answers on the target both before and after the intervention (currently ${pre.length} before, ${post.length} after).`
    : `Accuracy on the target was ${Math.round(k1 / pre.length * 100)}% (${k1}/${pre.length}) before and ${Math.round(k2 / post.length * 100)}% (${k2}/${post.length}) after. ` +
      `Difference ${ci.diff >= 0 ? '+' : ''}${Math.round(ci.diff * 100)} points (95% CI ${Math.round(ci.lo * 100)} to ${Math.round(ci.hi * 100)}). ` +
      'This is an association observed after the intervention, not proof that the intervention caused it.';

  return {
    outcome, outcome_label: OUTCOME_LABELS[outcome], summary,
    pre: { n: pre.length, correct: k1, accuracy: pre.length ? k1 / pre.length : null },
    post: { n: post.length, correct: k2, accuracy: post.length ? k2 / post.length : null },
    difference: ci.diff, ci_low: ci.lo, ci_high: ci.hi,
    activity_completed: !!intervention.activity_completed_at,
    evidence_response_ids: { pre: pre.map(r => r.id).filter(Boolean), post: post.map(r => r.id).filter(Boolean) },
    evaluated_at: now, engine_version: ENGINE_VERSION,
  };
}

/** Status housekeeping: an active intervention whose review date has passed becomes review_due. */
export function effectiveStatus(iv, now = Date.now()) {
  if (iv.status === 'active' || iv.status === 'planned') {
    const rd = toMs(iv.review_date);
    if (rd && rd <= now) return 'review_due';
  }
  return iv.status;
}

/** Aggregate outcomes by activity kind and by target — descriptive, for the intervention report. */
export function summariseOutcomes(evaluated) {
  const by = {};
  for (const e of evaluated) {
    const k = e.action_type || e.activity_kind || 'other';
    by[k] ??= { activity_kind: k, total: 0, improved: 0, no_clear_change: 0, declined: 0, insufficient_evidence: 0 };
    by[k].total++; by[k][e.outcome]++;
  }
  return Object.values(by);
}
