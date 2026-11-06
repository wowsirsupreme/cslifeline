// js/engine/marking.js
// One marking entry point used everywhere a response is scored:
//   - student practice (client, formative)
//   - assessment submissions scored from the teacher dashboard (Spark plan)
//   - the scoreSubmission Cloud Function (Blaze plan)
//   - the demonstration backend
// so that every path produces identical results.

import { scoreAnswer } from './questions.js';
import { runTests } from './pseudocode/interpreter.js';

/** @returns {Promise<{score, max, correct, needs_manual, detail, misconception_hits}>} */
export async function markResponse(q, response) {
  if (q.type === 'coding') {
    const max = q.marks || 1;
    const code = typeof response === 'string' ? response : '';
    if (!code.trim()) return { score: 0, max, correct: false, needs_manual: false, detail: { unanswered: true }, misconception_hits: [], unanswered: true };
    if (!q.tests?.length) return { score: null, max, correct: null, needs_manual: true, detail: { reason: 'no tests' }, misconception_hits: [] };
    const t = await runTests(code, q.tests);
    const fraction = t.total ? t.passed / t.total : 0;
    // Tests give a provisional mark; full marks are only automatic when every test passes.
    return {
      score: Math.round(max * fraction * 100) / 100, max,
      correct: fraction === 1 ? true : fraction === 0 ? false : null,
      needs_manual: false,
      detail: { tests_passed: t.passed, tests_total: t.total, results: t.results.map(r => ({ pass: r.pass, why: r.why })) },
      misconception_hits: [],
    };
  }
  return scoreAnswer(q, response);
}

export function totalMarks(questions) {
  return questions.reduce((a, q) => a + (Number(q.marks) > 0 ? Number(q.marks) : 1), 0);
}

/** Fields that make up a question's answer key (stored in teacher-only documents). */
export const KEY_FIELDS = ['answer', 'option_misconceptions', 'answer_misconceptions', 'explanation', 'solution', 'tests', 'case_sensitive', 'numeric_tolerance'];

export function splitKey(q) {
  const key = {}; for (const k of KEY_FIELDS) if (q[k] !== undefined) key[k] = q[k];
  if (Array.isArray(q.parts)) key.parts = q.parts.map(p => ({ keywords: p.keywords || [], mark_scheme: p.mark_scheme || '', marks: p.marks }));
  return key;
}
export function joinKey(pub, key) {
  const q = { ...pub, ...key };
  if (Array.isArray(pub.parts) && Array.isArray(key?.parts)) q.parts = pub.parts.map((p, i) => ({ ...p, ...(key.parts[i] || {}) }));
  return q;
}
