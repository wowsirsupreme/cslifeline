// js/engine/records.js
// Pure builders for stored records. Used by core/store.js (browser) and by
// functions/ (Cloud Functions, via scripts/sync-functions-shared.mjs), so there is
// one definition of what a response document and a scored submission look like.

import { markResponse, joinKey } from './marking.js';
import { clean } from '../core/util.js';

export const SCHEMA_VERSION = '2.0';
const OPTION_TYPES = ['mcq', 'pseudocode', 'debugging', 'code_output', 'truefalse'];

/** Canonical response document (docs/DATABASE_SCHEMA.md#responses). `timestamp` is a server timestamp sentinel or ISO string. */
export function buildResponseDoc({ session_id = null, question, answer, result, behaviour = {}, mode, attempt = 1, assessment_id = null, submission_id = null, student = {}, studentUid, timestamp, isSynthetic = false }) {
  const optionType = Array.isArray(question.options) && question.options.length && OPTION_TYPES.includes(question.type);
  const has = answer !== null && answer !== undefined && answer !== '';
  return clean({
    schema_version: SCHEMA_VERSION, source_platform: 'CS_LIFELINE',
    student_uid: studentUid, pseudo_id: student.pseudo_id || null, class_code: student.class_code || null, school_id: student.school_id || null,
    session_id, submission_id, assessment_id, mode, attempt,
    question_id: question.id, question_type: question.type, chapter_id: question.chapter_id || null, subchapter: question.subchapter || null,
    topic: question.topic || null, paper: question.paper || null, difficulty: question.difficulty || null,
    misconception_tag: question.misconception_tag || null,
    answer: answer === undefined ? null : (typeof answer === 'string' ? answer.slice(0, 20000) : answer),
    chosen: optionType && has ? (question.type === 'truefalse' ? (answer === true || answer === 'true' || answer === 0 ? 0 : 1) : Number(answer)) : null,
    correct: result.correct, score: result.score, max: result.max, needs_manual: !!result.needs_manual,
    misconception_hits: result.misconception_hits || [],
    marking_detail: result.detail || null,
    time_ms: behaviour.time_ms ?? null, first_answer_ms: behaviour.time_to_first_ms ?? null, revisions: behaviour.revisions ?? null,
    hint_used: !!behaviour.hint_used, visibility_interruptions: behaviour.interruptions ?? null, away_ms: behaviour.away_ms ?? null, offline_during: !!behaviour.offline,
    recorded_at: timestamp, client_ts: Date.now(),
    scored_by: result.scored_by || 'client',
    is_synthetic: !!isSynthetic,
  });
}

/**
 * Score a submission. Pure apart from the async interpreter.
 * @returns { responses: [{id, data}], result, submissionPatch }
 */
export async function scoreSubmissionRecords(sub, assessment, keys, { prevResult = null, student = null, actor = 'teacher', timestamp }) {
  const stu = student || { class_code: sub.class_code, pseudo_id: sub.pseudo_id };
  const results = {}; let score = 0, max = 0, pending = 0;
  const responses = [];
  for (const q of assessment.questions) {
    const k = keys.answers?.[q.id] || {};
    const full = joinKey(q, k);
    const ans = sub.answers?.[q.id];
    let r = await markResponse(full, ans);
    const manual = prevResult?.manual_marks?.[q.id];
    if (manual !== undefined && manual !== null) {
      const m = Math.max(0, Math.min(Number(manual), r.max));
      r = { ...r, score: m, correct: m >= r.max ? true : m <= 0 ? false : null, needs_manual: false, detail: { ...(r.detail || {}), manual: true } };
    }
    if (r.needs_manual) pending++;
    score += r.score || 0; max += r.max;
    results[q.id] = clean({ score: r.score, max: r.max, correct: r.correct, needs_manual: r.needs_manual, explanation: k.explanation || '',
      correct_answer: q.type === 'coding' || q.type === 'structured' ? null : (k.answer ?? null) });
    const data = buildResponseDoc({ submission_id: sub.id, assessment_id: sub.assessment_id, question: full, answer: ans, result: { ...r, scored_by: actor },
      behaviour: sub.behaviour?.[q.id] || {}, mode: 'assessment', student: stu, studentUid: sub.student_uid, timestamp: sub.submitted_at || timestamp, isSynthetic: !!sub.is_synthetic });
    responses.push({ id: `${sub.id}__${q.id}__1`, data });
  }
  const released = (assessment.release_feedback || 'on_scoring') === 'on_scoring' || !!prevResult?.released;
  const result = { assessment_id: sub.assessment_id, student_uid: sub.student_uid, class_code: sub.class_code, score, max_score: max, pending_marking: pending,
    results, manual_marks: prevResult?.manual_marks || {}, released, scored_at: timestamp, scored_by: actor };
  return { responses, result, submissionPatch: { status: pending ? 'needs_marking' : 'scored', scored_at: timestamp, scored_by: actor } };
}
