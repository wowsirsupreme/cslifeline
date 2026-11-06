import test from 'node:test';
import assert from 'node:assert/strict';
import { migrateUser, migrateResponse, migrateSession, migrateAssessment, pseudoIdFor } from '../../scripts/lib/migrate-v3-transform.mjs';

test('v3 self-assigned teacher becomes pending unless trusted', () => {
  assert.equal(migrateUser('t', { role: 'teacher', displayName: 'T' }).doc.role, 'teacher_pending');
  assert.equal(migrateUser('t', { role: 'teacher', displayName: 'T' }, { trustedStaff: new Set(['t']) }).doc.role, 'teacher');
  assert.equal(migrateUser('a', { role: 'admin' }).doc.role, 'teacher_pending');
});
test('v3 student: camelCase fields mapped, research ID stable, predictable login flagged, shadow ban made visible', () => {
  const m = migrateUser('u1', { role: 'student', displayName: 'Ama', classCode: '10b', anonEmail: '10b__ama@cslifeline.student', shadowBanned: true });
  assert.equal(m.doc.class_code, '10B'); assert.equal(m.doc.display_name, 'Ama');
  assert.match(m.doc.pseudo_id, /^L-[A-Z0-9]{10}$/); assert.equal(m.doc.pseudo_id, pseudoIdFor('u1'));
  assert.equal(m.doc.legacy_predictable_login, true); assert.equal(m.doc.status, 'suspended');
});
test('v3 response gains class_code; coding auto-correct and the wrong P1_T1_004 key are neutralised', () => {
  const users = { u1: { classCode: '10A' } };
  const r = migrateResponse('r', { student_uid: 'u1', question_id: 'P2_T8_001', correct: true, chapter_id: 'T08', misconception_tag: 'ASSIGN_EQUALITY_CONFUSION', total_time_ms: 5000, tab_switch_count: 2, signal_avoidance: true }, { userById: users }).doc;
  assert.equal(r.class_code, '10A'); assert.equal(r.correct, true); assert.equal(r.time_ms, 5000); assert.equal(r.visibility_interruptions, 2);
  assert.ok(!('signal_avoidance' in r));
  const c = migrateResponse('r2', { student_uid: 'u1', question_id: 'X', correct: true }, { userById: users, questionTypeById: { X: 'coding' } });
  assert.equal(c.doc.correct, null); assert.deepEqual(c.flags, ['v3_coding_autocorrect']);
  assert.equal(migrateResponse('r3', { student_uid: 'u1', question_id: 'P1_T1_004', correct: false }, { userById: users }).doc.correct, null);
  assert.equal(migrateResponse('r4', { schema_version: '2.0' }).skip, true);
});
test('v3 session status derives from ended_at', () => {
  assert.equal(migrateSession('s', { student_uid: 'u', ended_at: '2026-01-01T00:00:00Z' }).doc.status, 'completed');
  assert.equal(migrateSession('s', { student_uid: 'u', ended_at: null }).doc.status, 'in_progress');
});
test('v3 published assessment: answer keys split out of the student copy', () => {
  const m = migrateAssessment('a', { title: 'Quiz', class_code: '10a', status: 'active', questions: [{ id: 'q1', type: 'MCQ', text: 'x?', options: ['a', 'b'], correct: 1, chapter_id: 'T01' }] }, { createdBy: 't' });
  assert.equal(m.assessment.class_codes[0], '10A');
  assert.ok(!('answer' in m.assessment.questions[0]));
  assert.equal(m.key.answers.q1.answer, 1);
});
