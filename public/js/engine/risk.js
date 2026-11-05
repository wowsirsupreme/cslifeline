// js/engine/risk.js
// At-risk early-warning: feature computation and model inference.
//
// The SAME feature definitions are implemented in Python (ml/cslifeline_ml/features.py)
// and checked for parity by tests/unit/risk.test.mjs + ml/tests/test_features.py using a
// shared fixture. If you change a feature here, change it there too and bump FEATURE_VERSION.
//
// All features use ONLY responses recorded strictly before `asOf` — this is what prevents
// temporal leakage when the model is trained on historical cut-off dates.
// Tab switches / visibility changes are deliberately NOT features (see docs/MACHINE_LEARNING_METHODOLOGY.md).

import { DAY, mean, median, slope, toMs, weekKey } from './stats.js';

export const FEATURE_VERSION = 'fv-1.0';

export const FEATURES = [
  { name: 'acc_all',            label: 'Overall accuracy',                   direction: -1, desc: 'Share of marked responses that are correct, all history before the cut-off.' },
  { name: 'acc_recent',         label: 'Recent accuracy (last 20)',          direction: -1, desc: 'Accuracy over the 20 most recent marked responses.' },
  { name: 'acc_trend',          label: 'Accuracy trend',                     direction: -1, desc: 'Least-squares slope of weekly accuracy over the last 6 weeks with data (change per week).' },
  { name: 'acc_assessment',     label: 'Assessment accuracy',                direction: -1, desc: 'Accuracy on assessment-mode responses (falls back to overall accuracy if none).' },
  { name: 'chapter_min_acc',    label: 'Weakest chapter accuracy',           direction: -1, desc: 'Lowest accuracy among chapters with at least 3 marked responses.' },
  { name: 'chapters_below_50',  label: 'Share of chapters below 50%',        direction: +1, desc: 'Fraction of chapters (≥3 responses) where accuracy is below 50%.' },
  { name: 'diag_error_rate',    label: 'Diagnostic error rate',              direction: +1, desc: 'Share of wrong answers that chose a distractor linked to a known misconception.' },
  { name: 'repeat_error_rate',  label: 'Repeated-error rate',                direction: +1, desc: 'Share of distinct questions answered wrongly two or more times.' },
  { name: 'completion_rate',    label: 'Session completion rate',            direction: -1, desc: 'Completed sessions divided by started sessions.' },
  { name: 'active_days_28',     label: 'Active days (last 28)',              direction: -1, desc: 'Distinct days with at least one response in the 28 days before the cut-off.' },
  { name: 'days_since_active',  label: 'Days since last activity',           direction: +1, desc: 'Days between the last response and the cut-off (capped at 60).' },
  { name: 'rel_time_median',    label: 'Relative response time',             direction: 0,  desc: 'Median of (response time ÷ median time for that question). 1 = typical.' },
  { name: 'hint_rate',          label: 'Hint use rate',                      direction: +1, desc: 'Share of practice responses where a hint was opened.' },
  { name: 'n_responses',        label: 'Responses so far',                   direction: 0,  desc: 'Number of marked responses before the cut-off (data sufficiency).' },
];
export const FEATURE_NAMES = FEATURES.map(f => f.name);

/**
 * @param responses   one student's canonical responses (any order)
 * @param sessions    that student's sessions [{started_at, ended_at|status}]
 * @param asOf        cut-off (ms). Only data strictly before asOf is used.
 * @param ctx         { medianTimeByQuestion: Map, questionsById }
 */
export function computeFeatures(responses, sessions = [], asOf = Date.now(), ctx = {}) {
  const rs = responses.map(r => ({ ...r, _t: toMs(r.recorded_at) }))
    .filter(r => r._t !== null && r._t < asOf && (r.correct === true || r.correct === false))
    .sort((a, b) => a._t - b._t);
  const n = rs.length;
  const acc = xs => xs.length ? xs.filter(r => r.correct).length / xs.length : null;

  const accAll = acc(rs);
  const accRecent = acc(rs.slice(-20));
  // weekly trend over last 6 weeks with data
  const weeks = new Map();
  rs.forEach(r => { const k = weekKey(r._t); if (!weeks.has(k)) weeks.set(k, []); weeks.get(k).push(r); });
  const wk = [...weeks.keys()].sort().slice(-6);
  const trend = wk.length >= 3 ? slope(wk.map((_, i) => i), wk.map(k => acc(weeks.get(k)))) : 0;
  const assess = rs.filter(r => r.mode === 'assessment');
  const accAssess = assess.length ? acc(assess) : accAll;
  const chap = new Map();
  rs.forEach(r => { if (!r.chapter_id) return; if (!chap.has(r.chapter_id)) chap.set(r.chapter_id, []); chap.get(r.chapter_id).push(r); });
  const chapAcc = [...chap.values()].filter(v => v.length >= 3).map(acc);
  const wrong = rs.filter(r => !r.correct);
  const diag = wrong.length ? wrong.filter(r => (r.misconception_hits || []).length > 0).length / wrong.length : 0;
  const wrongByQ = new Map(); wrong.forEach(r => wrongByQ.set(r.question_id, (wrongByQ.get(r.question_id) || 0) + 1));
  const distinctQ = new Set(rs.map(r => r.question_id)).size;
  const repeat = distinctQ ? [...wrongByQ.values()].filter(c => c >= 2).length / distinctQ : 0;
  const ss = sessions.map(s => ({ ...s, _t: toMs(s.started_at) })).filter(s => s._t !== null && s._t < asOf);
  const completion = ss.length ? ss.filter(s => s.status === 'completed' || (s.ended_at && toMs(s.ended_at) < asOf)).length / ss.length : null;
  const days = new Set(rs.filter(r => r._t >= asOf - 28 * DAY).map(r => new Date(r._t).toISOString().slice(0, 10))).size;
  const last = n ? rs[n - 1]._t : null;
  const sinceActive = last === null ? 60 : Math.min(60, (asOf - last) / DAY);
  const med = ctx.medianTimeByQuestion;
  const rel = med ? median(rs.filter(r => r.time_ms > 0 && med.get(r.question_id)).map(r => r.time_ms / med.get(r.question_id))) : null;
  const practice = rs.filter(r => r.mode === 'practice' || !r.mode);
  const hint = practice.length ? practice.filter(r => r.hint_used).length / practice.length : 0;

  return {
    acc_all: accAll, acc_recent: accRecent, acc_trend: trend ?? 0, acc_assessment: accAssess,
    chapter_min_acc: chapAcc.length ? Math.min(...chapAcc) : accAll,
    chapters_below_50: chapAcc.length ? chapAcc.filter(a => a < 0.5).length / chapAcc.length : 0,
    diag_error_rate: diag, repeat_error_rate: repeat,
    completion_rate: completion, active_days_28: days, days_since_active: sinceActive,
    rel_time_median: rel, hint_rate: hint, n_responses: n,
  };
}

// ── Risk categories ───────────────────────────────────────────────────────
export const DEFAULT_THRESHOLDS = { moderate: 0.35, high: 0.6 }; // overridden by the registered model / admin config

export function categorise(p, thresholds = DEFAULT_THRESHOLDS) {
  if (p === null || p === undefined || !Number.isFinite(p)) return 'unknown';
  return p >= thresholds.high ? 'high' : p >= thresholds.moderate ? 'moderate' : 'low';
}
export const RISK_LABELS = { low: 'Low', moderate: 'Moderate', high: 'High', unknown: 'Not enough data' };

/**
 * Logistic-regression inference with exact per-feature contributions (in log-odds).
 * model = { model_id, version, model_type:'logistic', features:[names], means:[...], scales:[...], coef:[...],
 *           intercept, thresholds:{moderate,high}, status:'demonstration'|'validated', min_responses }
 */
export function predictLogistic(model, features) {
  if (!model || model.model_type !== 'logistic') throw new Error('predictLogistic requires a logistic model artefact');
  if ((features.n_responses ?? 0) < (model.min_responses ?? 10)) {
    return { risk_probability: null, risk_category: 'unknown', reason: `Fewer than ${model.min_responses ?? 10} marked responses`, contributions: [], imputed: [] };
  }
  let z = model.intercept; const contributions = []; const imputed = [];
  model.features.forEach((name, i) => {
    let x = features[name];
    if (x === null || x === undefined || !Number.isFinite(x)) { x = model.means[i]; imputed.push(name); }
    const zx = (x - model.means[i]) / (model.scales[i] || 1);
    const c = model.coef[i] * zx;
    z += c;
    contributions.push({ feature: name, value: features[name] ?? null, contribution: c });
  });
  const p = 1 / (1 + Math.exp(-z));
  contributions.sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution));
  return { risk_probability: p, risk_category: categorise(p, model.thresholds), contributions, imputed, logit: z };
}

const FEATURE_TEXT = Object.fromEntries(FEATURES.map(f => [f.name, f.label]));

/** Plain-language explanation of the top contributing factors (only those raising risk). */
export function explain(contributions, k = 3) {
  return contributions.filter(c => c.contribution > 0).slice(0, k).map(c => ({
    feature: c.feature, label: FEATURE_TEXT[c.feature] || c.feature, value: c.value, contribution: c.contribution,
    text: describeFactor(c.feature, c.value),
  }));
}

function fmtPct(v) { return v === null || v === undefined ? 'n/a' : `${Math.round(v * 100)}%`; }
export function describeFactor(name, v) {
  switch (name) {
    case 'acc_all': return `Overall accuracy is ${fmtPct(v)}.`;
    case 'acc_recent': return `Accuracy on the last 20 answers is ${fmtPct(v)}.`;
    case 'acc_trend': return v < 0 ? `Accuracy has been falling (about ${Math.abs(Math.round(v * 100))} points per week).` : 'Accuracy trend is flat or rising.';
    case 'acc_assessment': return `Accuracy in assessments is ${fmtPct(v)}.`;
    case 'chapter_min_acc': return `Weakest chapter accuracy is ${fmtPct(v)}.`;
    case 'chapters_below_50': return `${fmtPct(v)} of attempted chapters are below 50%.`;
    case 'diag_error_rate': return `${fmtPct(v)} of wrong answers match known misconception patterns.`;
    case 'repeat_error_rate': return `${fmtPct(v)} of questions were answered wrongly more than once.`;
    case 'completion_rate': return `Completes ${fmtPct(v)} of started sessions.`;
    case 'active_days_28': return `Active on ${v ?? 0} of the last 28 days.`;
    case 'days_since_active': return `Last active ${Math.round(v ?? 0)} days ago.`;
    case 'rel_time_median': return `Typical response time is ${v ? v.toFixed(1) : 'n/a'}× the class median.`;
    case 'hint_rate': return `Opens hints on ${fmtPct(v)} of practice questions.`;
    default: return `${name}: ${v}`;
  }
}

/** Suggested teacher action derived from the explanation and current misconception findings. */
export function recommendAction(category, explanation, findings = []) {
  if (category === 'unknown') return 'Not enough data yet. Encourage regular practice so a reliable picture can form.';
  const top = findings.find(f => (f.final_status || f.status) === 'demonstrated') || findings.find(f => (f.final_status || f.status) === 'possible');
  const feats = new Set(explanation.map(e => e.feature));
  const parts = [];
  if (top) parts.push(`Review the evidence for "${top.name}" and assign a targeted activity on it.`);
  if (feats.has('active_days_28') || feats.has('days_since_active') || feats.has('completion_rate')) parts.push('Check in about engagement — low recent activity or unfinished sessions.');
  if (feats.has('acc_trend')) parts.push('Recent decline: compare the last two assessments to find where it started.');
  if (feats.has('chapter_min_acc') || feats.has('chapters_below_50')) parts.push('Plan a short re-teach of the weakest chapter.');
  if (!parts.length) parts.push(category === 'low' ? 'No action needed beyond normal monitoring.' : 'Discuss recent work with the learner and set a short follow-up assessment.');
  return parts.join(' ');
}
