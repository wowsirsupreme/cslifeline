// Pure transforms from CS Lifeline v3 records to the v4 schema (docs/DATABASE_SCHEMA.md).
// No I/O here, so every rule is unit-tested (tests/unit/migrate.test.mjs).
//
// Decisions (see docs/TECHNICAL_AUDIT.md):
//  * Roles are NOT trusted: v3 granted 'teacher' to anyone who opened /teacher/. A v3 teacher/admin
//    becomes 'teacher_pending' unless their uid is in the trusted list supplied by the operator.
//  * v3 "quick sign-in" accounts used predictable passwords; they are flagged so an administrator
//    can reset them (scripts/migrate-v3.mjs --reset-predictable-passwords).
//  * v3 recorded every coding attempt as correct, and question P1_T1_004 had a wrong answer key.
//    Those responses cannot be re-marked (v3 did not store the answer), so correctness is set to
//    null with a legacy flag rather than silently kept.
//  * Derived behavioural labels (signal_avoidance etc.) are dropped; raw measures are kept.
import { normaliseQuestion, stripAnswerKey } from '../../public/js/engine/questions.js';
import { LEGACY_TAG_MAP } from '../../public/js/engine/taxonomy-data.js';
import { CHAPTERS } from '../../public/js/engine/curriculum.js';
import { splitKey, totalMarks } from '../../public/js/engine/marking.js';

const ABC = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
/** Deterministic research ID from the uid, so re-running the migration gives the same ID. */
export function pseudoIdFor(uid) {
  let h1 = 0x811c9dc5, h2 = 0x01000193;
  for (let i = 0; i < uid.length; i++) { h1 = Math.imul(h1 ^ uid.charCodeAt(i), 0x01000193) >>> 0; h2 = Math.imul(h2 ^ uid.charCodeAt(i), 0x811c9dc5) >>> 0; }
  let s = '', x = h1, y = h2;
  for (let i = 0; i < 10; i++) { const v = i < 5 ? x : y; s += ABC[(v >>> ((i % 5) * 6)) & 31]; }
  return 'L-' + s;
}
const isTs = (v) => v && (typeof v === 'object') && ('seconds' in v || typeof v.toDate === 'function');
const iso = (v) => { if (!v) return null; if (typeof v === 'string') return v; if (isTs(v)) return new Date((v.seconds ?? v.toDate().getTime() / 1000) * 1000).toISOString(); if (v instanceof Date) return v.toISOString(); return null; };
const code = (c) => String(c || '').trim().toUpperCase().replace(/[^A-Z0-9-]/g, '-').slice(0, 20) || null;

export function migrateUser(uid, u, { trustedStaff = new Set() } = {}) {
  if (u.schema_version === '2.0') return { skip: true };
  const roleIn = u.role;
  let role = roleIn, status = u.status || 'active', notes = [];
  if (roleIn === 'teacher' || roleIn === 'admin') {
    if (!trustedStaff.has(uid)) { role = 'teacher_pending'; status = 'pending'; notes.push(`v3 role "${roleIn}" was self-assigned; needs administrator approval`); }
  } else if (roleIn !== 'student') { role = 'teacher_pending'; status = 'pending'; notes.push(`unknown v3 role "${roleIn}"`); }
  const out = {
    display_name: String(u.displayName || u.display_name || '').slice(0, 60) || 'Learner', email: u.email || '', role, status,
    created_at: iso(u.createdAt) || null, last_seen: iso(u.lastSeen) || null, schema_version: '2.0', migrated_from: 'v3', is_synthetic: false,
  };
  if (role === 'student') { out.class_code = code(u.classCode || u.class_code); out.pseudo_id = u.pseudo_id || pseudoIdFor(uid); out.consent = { research_use: 'not_recorded' }; out.school_id = null; }
  else out.class_codes = [];
  if (u.anonEmail) { out.legacy_predictable_login = true; notes.push('v3 quick sign-in account with a predictable password — reset required'); }
  if (u.shadowBanned) { out.status = 'suspended'; notes.push('v3 hidden "shadow ban" converted to a visible suspension'); }
  if (notes.length) out.migration_notes = notes;
  return { doc: out, notes, deleteFields: ['displayName', 'classCode', 'createdAt', 'lastSeen', 'shadowBanned', 'anonEmail'] };
}

const QTYPE = { MCQ: 'mcq', mcq: 'mcq', trace_output: 'pseudocode', coding: 'coding' };
export function migrateResponse(id, r, { userById = {}, questionTypeById = {} } = {}) {
  if (r.schema_version === '2.0') return { skip: true };
  const u = userById[r.student_uid] || {};
  const cc = code(r.class_code || u.classCode || u.class_code);
  const qtype = questionTypeById[r.question_id] || QTYPE[r.type] || null;
  let correct = typeof r.correct === 'boolean' ? r.correct : null;
  const flags = [];
  if (qtype === 'coding') { correct = null; flags.push('v3_coding_autocorrect'); }
  if (r.question_id === 'P1_T1_004') { correct = null; flags.push('v3_wrong_key_P1_T1_004'); }
  const tag = r.misconception_tag && LEGACY_TAG_MAP[r.misconception_tag] ? LEGACY_TAG_MAP[r.misconception_tag] : (r.misconception_tag || null);
  const doc = {
    schema_version: '2.0', source_platform: 'CS_LIFELINE', student_uid: r.student_uid, pseudo_id: u.pseudo_id || pseudoIdFor(r.student_uid || id),
    class_code: cc, school_id: null, session_id: r.session_id || null, submission_id: null, assessment_id: null, mode: r.mode || 'practice', attempt: 1,
    question_id: r.question_id, question_type: qtype, chapter_id: r.chapter_id || null, paper: r.paper || CHAPTERS[r.chapter_id]?.paper || null,
    misconception_tag: tag, legacy_tag: r.misconception_tag || null, answer: null, chosen: null,
    correct, score: correct === true ? 1 : correct === false ? 0 : null, max: 1, needs_manual: qtype === 'coding', misconception_hits: [],
    time_ms: r.total_time_ms ?? null, first_answer_ms: r.hesitation_ms ?? null, revisions: r.revision_count ?? null, hint_used: !!r.hint_used,
    visibility_interruptions: r.tab_switch_count ?? null, away_ms: r.away_time_ms ?? null, offline_during: false,
    recorded_at: iso(r.recorded_at), scored_by: 'v3-client', is_synthetic: false, migrated_from: 'v3', legacy_flags: flags,
  };
  return { doc, flags, deleteFields: ['signal_avoidance', 'signal_uncertainty', 'signal_false_mastery', 'returned_after_switch', 'changed_answer_after_switch', 'was_correct_at_any_point', 'total_time_ms', 'net_think_time_ms', 'hesitation_ms', 'revision_count', 'tab_switch_count', 'away_time_ms'] };
}

export function migrateSession(id, s, { userById = {} } = {}) {
  if (s.schema_version === '2.0') return { skip: true };
  const u = userById[s.student_uid] || {};
  return { doc: { schema_version: '2.0', student_uid: s.student_uid, class_code: code(s.class_code || u.classCode), pseudo_id: u.pseudo_id || pseudoIdFor(s.student_uid || id),
    mode: s.mode || 'practice', chapter_id: null, question_count: s.question_count ?? null, correct_count: s.correct_count ?? null, status: s.ended_at ? 'completed' : 'in_progress',
    started_at: iso(s.started_at), ended_at: iso(s.ended_at), migrated_from: 'v3', is_synthetic: false } };
}

/** v3 predictions came from a notebook with target leakage: they are archived, never shown as predictions. */
export function archivePrediction(id, p) {
  return { col: 'legacy_predictions', doc: { ...p, archived_reason: 'v3 notebook prediction (label leakage, no model version) — not valid as an early-warning indicator', migrated_from: 'v3' } };
}

/** v3 published_assessments embedded answer keys; split into a student-safe assessment and a teacher-only key. */
export function migrateAssessment(id, a, { createdBy }) {
  const qs = (a.questions || []).map(q => normaliseQuestion({ ...q, id: q.id || q.question_id }, { source: 'v3-assessment' }));
  const answers = {}; for (const q of qs) answers[q.id] = { ...splitKey(q), marks: q.marks || 1, misconception_tag: q.misconception_tag || null };
  const cc = code(a.class_code);
  return {
    assessment: { title: a.title || 'Untitled assessment', class_codes: cc ? [cc] : [], status: a.status === 'active' ? 'published' : 'closed', opens_at: iso(a.created_at) || null, closes_at: iso(a.deadline),
      time_limit_min: a.duration_min || a.time_limit || 0, questions: qs.map(q => { const s = stripAnswerKey(q); delete s.hint; return s; }), question_ids: qs.map(q => q.id), question_count: qs.length,
      total_marks: totalMarks(qs), release_feedback: 'on_scoring', created_by: createdBy || a.created_by || a.teacher_uid || null, migrated_from: 'v3', is_synthetic: false },
    key: { answers, class_codes: cc ? [cc] : [], created_by: createdBy || a.created_by || a.teacher_uid || null },
  };
}

export function migrateQuestion(id, q) {
  if (q.schema_version === 2 || q.schema_version === '2.0') return { skip: true };
  const n = normaliseQuestion({ ...q, id: q.id || id }, { source: q.source || 'v3-firestore' });
  return { doc: { ...n, visibility: 'practice', active: q.active !== false, migrated_from: 'v3' } };
}
