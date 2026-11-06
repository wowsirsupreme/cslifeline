// js/engine/misconception.js
// Evidence-based misconception detection.
//
// A misconception is NEVER inferred from a single wrong answer. For each
// (student, misconception) pair the engine gathers every *opportunity*
// (a response to a question that targets the misconception, either through
// the question's misconception_tag or through a diagnostic distractor), and
// classifies the evidence into one of five statuses:
//
//   demonstrated           repeated, consistent errors including diagnostic distractor choices
//   possible               repeated errors, but evidence not yet strong or consistent enough
//   knowledge_gap          repeated errors that do NOT match the misconception's distractors
//   isolated_error         a single slip among otherwise correct answers
//   insufficient_evidence  errors exist but too few opportunities to judge
//
// Evidence strength is the posterior probability that the learner's error
// rate on this misconception exceeds 50 % (Beta(1,1) prior), adjusted by how
// consistently their errors match the misconception's diagnostic distractors.
//
// Pure module. Engine version is stored with every persisted result.

import { TAXONOMY } from './taxonomy-data.js';

export const ENGINE_VERSION = 'mce-1.0';

export const STATUS = {
  demonstrated: { label: 'Demonstrated misconception', rank: 5, tone: 'danger' },
  possible: { label: 'Possible misconception', rank: 4, tone: 'warning' },
  knowledge_gap: { label: 'Knowledge gap', rank: 3, tone: 'info' },
  isolated_error: { label: 'Isolated error', rank: 2, tone: 'muted' },
  insufficient_evidence: { label: 'Insufficient evidence', rank: 1, tone: 'muted' },
  not_misconception: { label: 'Not a misconception (teacher review)', rank: 0, tone: 'muted' }, // only ever set by a teacher review
};

const DEFAULT_EVIDENCE = { min_opportunities: 3, min_errors: 2, min_distinct_questions: 2 };

/** P(theta > 0.5) for theta ~ Beta(a, b) with integer a, b >= 1.
 *  Uses I_x(a,b) = P(Binomial(a+b-1, x) >= a). */
export function probAboveHalf(a, b) {
  const n = a + b - 1;
  // P(Bin(n, .5) <= a-1)
  let cum = 0, c = 1; // C(n,0)
  const half = Math.pow(0.5, n);
  for (let k = 0; k <= a - 1; k++) {
    if (k > 0) c = c * (n - k + 1) / k;
    cum += c * half;
  }
  return Math.min(1, Math.max(0, cum));
}

export function strengthLabel(s) {
  return s >= 0.8 ? 'strong' : s >= 0.5 ? 'moderate' : 'weak';
}

/** Which misconceptions does a question give an opportunity to show?
 *  Returns Map(misconceptionId -> { primary: bool, diagnosticOptions: Set<int> }). */
export function targetsOf(q) {
  const m = new Map();
  if (!q) return m;
  if (q.misconception_tag) m.set(q.misconception_tag, { primary: true, diagnosticOptions: new Set() });
  for (const [opt, mid] of Object.entries(q.option_misconceptions || {})) {
    if (!m.has(mid)) m.set(mid, { primary: false, diagnosticOptions: new Set() });
    m.get(mid).diagnosticOptions.add(Number(opt));
  }
  return m;
}

/**
 * Detect misconceptions for one student.
 * @param {Array} responses  canonical responses for ONE student:
 *        { question_id, correct (bool|null), chosen (option index or null), misconception_hits: [ids],
 *          recorded_at (ms), session_id, time_ms, difficulty }
 *        Responses with correct === null (awaiting manual marking) are ignored.
 * @param {Map|Object} questionsById
 * @param {Object} opts { taxonomy, medianTimeByQuestion: Map }
 * @returns Array of findings sorted by severity, then strength.
 */
export function detectForStudent(responses, questionsById, opts = {}) {
  const taxonomy = opts.taxonomy || TAXONOMY;
  const tx = new Map(taxonomy.map(t => [t.id, t]));
  const getQ = id => (questionsById instanceof Map ? questionsById.get(id) : questionsById[id]);
  const medianTime = opts.medianTimeByQuestion || new Map();

  const byMis = new Map();
  const sorted = [...responses].filter(r => r.correct === true || r.correct === false)
    .sort((a, b) => (a.recorded_at || 0) - (b.recorded_at || 0));

  for (const r of sorted) {
    const q = getQ(r.question_id);
    const targets = targetsOf(q);
    // Responses can also carry hits computed at scoring time (e.g. from accepted-answer maps)
    for (const hit of r.misconception_hits || []) if (!targets.has(hit)) targets.set(hit, { primary: false, diagnosticOptions: new Set(), viaHit: true });
    for (const [mid, info] of targets) {
      if (!byMis.has(mid)) byMis.set(mid, []);
      const diagnosticAvailable = info.diagnosticOptions.size > 0 || !!info.viaHit;
      const diagnosticHit = !r.correct && ((r.chosen !== null && r.chosen !== undefined && info.diagnosticOptions.has(Number(r.chosen))) || (r.misconception_hits || []).includes(mid));
      const med = medianTime.get(r.question_id);
      const rapid = !r.correct && med && r.time_ms != null && r.time_ms < 0.25 * med;
      byMis.get(mid).push({
        question_id: r.question_id, session_id: r.session_id, recorded_at: r.recorded_at || 0,
        correct: !!r.correct, diagnostic_available: diagnosticAvailable, diagnostic_hit: diagnosticHit,
        difficulty: q?.difficulty ?? r.difficulty ?? 2, rapid: !!rapid, response_id: r.id || null,
      });
    }
  }

  const findings = [];
  for (const [mid, ops] of byMis) {
    const f = classify(mid, ops, tx.get(mid));
    if (f) findings.push(f);
  }
  return findings.sort((a, b) => STATUS[b.status].rank - STATUS[a.status].rank || b.evidence_strength - a.evidence_strength);
}

/** Classify one (student, misconception) evidence set. Returns null when there is no concern (no errors). */
export function classify(mid, ops, entry) {
  const ev = { ...DEFAULT_EVIDENCE, ...(entry?.evidence || {}) };
  const n = ops.length;
  const errors = ops.filter(o => !o.correct);
  const nErr = errors.length;
  if (nErr === 0) return null;
  const nCorrect = n - nErr;
  const diagHits = errors.filter(o => o.diagnostic_hit).length;
  const diagAvailOnErrors = errors.filter(o => o.diagnostic_available).length;
  const distinctErrQ = new Set(errors.map(o => o.question_id)).size;
  const distinctSessions = new Set(errors.map(o => o.session_id).filter(Boolean)).size;
  const errorRate = nErr / n;
  const pAbove = probAboveHalf(1 + nErr, 1 + nCorrect);
  const consistency = diagAvailOnErrors ? diagHits / diagAvailOnErrors : null;
  const diagFactor = consistency === null ? 0.75 : 0.6 + 0.4 * consistency;
  const strength = Math.round(pAbove * diagFactor * 1000) / 1000;

  // Trend: look at the two most recent opportunities
  const last2 = ops.slice(-2);
  let trend = 'unclear';
  if (n >= 3) {
    if (last2.every(o => o.correct) && nErr >= 1) trend = 'improving';
    else if (last2.some(o => !o.correct)) trend = 'persisting';
  }

  let status, reason;
  const slipLike = nErr === 1 && (errors[0].rapid || ops.some(o => o.correct && o.difficulty > errors[0].difficulty));
  if (n < 2) {
    status = 'insufficient_evidence';
    reason = 'Only one opportunity to show this misconception so far.';
  } else if (nErr === 1 && nCorrect >= 2) {
    status = 'isolated_error';
    reason = slipLike
      ? 'One error among otherwise correct answers; the error looks like a slip (fast response or harder items answered correctly).'
      : 'One error among otherwise correct answers.';
  } else if (nErr >= ev.min_errors && n >= ev.min_opportunities && distinctErrQ >= ev.min_distinct_questions
             && diagHits >= Math.max(2, ev.min_errors) && (consistency ?? 0) >= 0.5 && errorRate >= 0.5 && pAbove >= 0.8) {
    status = 'demonstrated';
    reason = `${diagHits} diagnostic distractor choices across ${distinctErrQ} different questions; error rate ${Math.round(errorRate * 100)}%.`;
  } else if (nErr >= 2 && diagAvailOnErrors >= 2 && diagHits === 0) {
    status = 'knowledge_gap';
    reason = 'Repeated errors, but none match the answers this misconception typically produces — more likely a gap in knowledge than this specific wrong belief.';
  } else if (nErr >= 2 && (diagHits >= 1 || distinctErrQ >= 2) && errorRate >= 0.4) {
    status = 'possible';
    reason = diagHits
      ? `${nErr} errors including ${diagHits} diagnostic distractor choice${diagHits > 1 ? 's' : ''}; more evidence needed to confirm.`
      : `${nErr} errors across ${distinctErrQ} questions, but the items have no diagnostic distractors, so this could also be a knowledge gap.`;
  } else {
    status = 'insufficient_evidence';
    reason = `${nErr} error${nErr > 1 ? 's' : ''} in ${n} opportunities — not enough to distinguish a misconception from other causes.`;
  }

  return {
    misconception_id: mid,
    name: entry?.name || mid,
    chapter_id: entry?.chapter_id || null,
    status,
    evidence_strength: strength,
    strength_label: strengthLabel(strength),
    reason,
    trend,
    counts: { opportunities: n, errors: nErr, correct: nCorrect, diagnostic_hits: diagHits, distinct_questions_wrong: distinctErrQ, sessions_with_errors: distinctSessions },
    error_rate: Math.round(errorRate * 1000) / 1000,
    evidence: ops.map(o => ({ question_id: o.question_id, response_id: o.response_id, correct: o.correct, diagnostic_hit: o.diagnostic_hit, recorded_at: o.recorded_at })),
    first_seen: ops[0].recorded_at || null,
    last_seen: ops[n - 1].recorded_at || null,
    engine_version: ENGINE_VERSION,
    in_taxonomy: !!entry,
  };
}

/** Apply teacher reviews. Reviews are kept separately; the automated finding is never overwritten.
 *  review: { status, note, reviewer_uid, reviewed_at } keyed by misconception_id. */
export function applyReviews(findings, reviewsById = {}) {
  return findings.map(f => {
    const r = reviewsById[f.misconception_id];
    return r ? { ...f, review: r, final_status: r.status, final_source: 'teacher' } : { ...f, final_status: f.status, final_source: 'engine' };
  });
}

/** Class-level aggregation: for each misconception, how many students fall into each status. */
export function aggregateClass(findingsByStudent) {
  const agg = new Map();
  for (const [uid, findings] of Object.entries(findingsByStudent)) {
    for (const f of findings) {
      const st = f.final_status || f.status;
      if (!agg.has(f.misconception_id)) agg.set(f.misconception_id, { misconception_id: f.misconception_id, name: f.name, chapter_id: f.chapter_id, students: {}, counts: Object.fromEntries(Object.keys(STATUS).map(k => [k, 0])), diagnostic_hits: 0 });
      const a = agg.get(f.misconception_id);
      a.counts[st]++;
      a.students[uid] = st;
      a.diagnostic_hits += f.counts.diagnostic_hits;
    }
  }
  return [...agg.values()].sort((x, y) => (y.counts.demonstrated * 3 + y.counts.possible * 2 + y.counts.knowledge_gap) - (x.counts.demonstrated * 3 + x.counts.possible * 2 + x.counts.knowledge_gap));
}

/** Median response time per question across a population, for slip detection. */
export function medianTimes(responses) {
  const by = new Map();
  for (const r of responses) if (r.time_ms > 0) { if (!by.has(r.question_id)) by.set(r.question_id, []); by.get(r.question_id).push(r.time_ms); }
  const out = new Map();
  for (const [k, v] of by) { v.sort((a, b) => a - b); out.set(k, v[Math.floor(v.length / 2)]); }
  return out;
}
