// js/app/data.js — loads and prepares the records a page needs, in one place.
// Every number shown in a dashboard is computed from what these functions return.

import { QUESTION_BANK } from '../../data/question-bank.js';
import { normaliseQuestion } from '../engine/questions.js';
import { detectForStudent, applyReviews, medianTimes } from '../engine/misconception.js';
import { accuracy } from '../engine/analytics.js';
import { effectiveStatus } from '../engine/interventions.js';
import { toMs, DAY } from '../core/util.js';

let builtIn = null;
export function builtInQuestions() {
  if (!builtIn) builtIn = QUESTION_BANK.map(q => ({ ...normaliseQuestion(q, { source: q.source }), visibility: 'practice', builtin: true }));
  return builtIn;
}

/** Built-in bank + questions stored in the database. A stored question with the same id overrides the built-in one. */
export async function allQuestions(store, { includeArchived = false } = {}) {
  let stored = [];
  try { stored = (await store.listQuestions({ includeArchived })).map(q => ({ ...normaliseQuestion(q, { source: q.source }), ...pick(q, ['visibility', 'status', 'created_by', 'updated_at', 'teacher_modified']), active: q.active !== false, stored: true })); }
  catch (e) { console.warn('Stored questions unavailable:', e.message); }
  const byId = new Map(builtInQuestions().map(q => [q.id, q]));
  for (const q of stored) byId.set(q.id, { ...q, builtin: byId.has(q.id) });
  let list = [...byId.values()];
  if (!includeArchived) list = list.filter(q => q.active !== false);
  return list;
}
function pick(o, keys) { const r = {}; for (const k of keys) if (o[k] !== undefined) r[k] = o[k]; return r; }
export const indexById = (list) => new Map(list.map(q => [q.id, q]));

export function normResponses(list) {
  return list.map(r => ({ ...r, recorded_at: toMs(r.recorded_at) ?? toMs(r.client_ts) ?? 0 }));
}

/** Everything a teacher view needs for a set of classes. Loaded in parallel; failures are reported, not hidden. */
export async function loadClassData(store, classCodes, { want = ['students', 'responses', 'sessions', 'assessments', 'submissions', 'predictions', 'interventions', 'reviews'] } = {}) {
  const codes = [].concat(classCodes || []).filter(Boolean);
  const jobs = {
    students: () => store.listStudents(codes),
    responses: () => store.listResponses(codes).then(normResponses),
    sessions: () => store.listSessions([['class_code', 'in', codes]]),
    assessments: () => store.listAssessments(),
    submissions: () => store.listSubmissions(codes),
    results: () => store.listResults(codes),
    predictions: () => store.listPredictions(codes),
    interventions: () => store.listInterventions(codes),
    reviews: () => store.listReviews(codes),
    outcomes: () => store.listOutcomes(codes),
    assignments: () => store.listAssignments(codes),
  };
  const out = { codes, errors: {} };
  await Promise.all(want.map(async k => {
    try { out[k] = codes.length ? await jobs[k]() : []; }
    catch (e) { out[k] = []; out.errors[k] = e.message; console.warn('load', k, e); }
  }));
  if (out.assessments) out.assessments = out.assessments.filter(a => (a.class_codes || []).some(c => codes.includes(c)));
  return out;
}

export function reviewsByStudent(reviews = []) {
  const m = {};
  for (const r of reviews) (m[r.student_uid] ||= {})[r.misconception_id] = { status: r.decision, note: r.note, reviewer_uid: r.reviewer_uid, reviewed_at: r.reviewed_at };
  return m;
}

/** Misconception findings for each student (engine output + teacher reviews applied). */
export function classFindings(students, responses, qIndex, reviews = []) {
  const med = medianTimes(responses);
  const rv = reviewsByStudent(reviews);
  const out = {};
  for (const s of students) {
    const rs = responses.filter(r => r.student_uid === s.id);
    out[s.id] = applyReviews(detectForStudent(rs, qIndex, { medianTimeByQuestion: med }), rv[s.id] || {});
  }
  return out;
}

export function latestPredictionByStudent(predictions = []) {
  const m = {};
  for (const p of predictions) { const t = toMs(p.predicted_at) || 0; if (!m[p.student_uid] || t > (toMs(m[p.student_uid].predicted_at) || 0)) m[p.student_uid] = p; }
  return m;
}

/**
 * Students requiring attention, each with the reasons that put them on the list.
 * Sources are kept separate so a teacher can see which come from a model and which from rules.
 */
export function attentionList(students, responses, findings, predictions, interventions = [], now = Date.now()) {
  const pred = latestPredictionByStudent(predictions);
  const out = [];
  for (const s of students) {
    const rs = responses.filter(r => r.student_uid === s.id);
    const reasons = [];
    const dem = (findings[s.id] || []).filter(f => f.final_status === 'demonstrated');
    if (dem.length) reasons.push({ source: 'misconception engine', text: `${dem.length} demonstrated misconception${dem.length > 1 ? 's' : ''}: ${dem.slice(0, 2).map(f => f.name).join('; ')}` });
    const p = pred[s.id];
    if (p && ['high', 'moderate'].includes(p.risk_category)) reasons.push({ source: `model ${p.model_version} (${p.prediction_status})`, text: `${p.risk_category === 'high' ? 'High' : 'Moderate'} early-warning risk (${Math.round(p.risk_probability * 100)}%)` });
    const acc = accuracy(rs.filter(r => toMs(r.recorded_at) >= now - 28 * DAY));
    if (acc.n >= 15 && acc.accuracy < 0.5) reasons.push({ source: 'rule: accuracy < 50% over 28 days (n ≥ 15)', text: `Recent accuracy ${Math.round(acc.accuracy * 100)}% over ${acc.n} answers` });
    const last = rs.reduce((m, r) => Math.max(m, toMs(r.recorded_at) || 0), 0);
    if (rs.length && last < now - 14 * DAY) reasons.push({ source: 'rule: no activity for 14 days', text: `No activity for ${Math.floor((now - last) / DAY)} days` });
    const due = interventions.filter(i => i.student_uid === s.id && effectiveStatus(i, now) === 'review_due');
    if (due.length) reasons.push({ source: 'intervention', text: `${due.length} intervention review${due.length > 1 ? 's' : ''} due` });
    if (reasons.length) out.push({ student: s, reasons, prediction: p || null, demonstrated: dem });
  }
  return out.sort((a, b) => b.reasons.length - a.reasons.length);
}

export function studentName(s) { return s?.display_name || s?.email || s?.id || 'Unknown'; }
