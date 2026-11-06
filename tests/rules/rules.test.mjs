// Firestore security rules tests. Requires the Firestore emulator (Java):
//   npm run test:rules
// These tests could NOT be executed in the build environment (the emulator download is
// blocked there); see docs/TESTING_REPORT.md. Run them before deploying the rules.
import test, { before, after, beforeEach } from 'node:test';
import fs from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, getDocs, collection, query, where, addDoc, deleteDoc } from 'firebase/firestore';

let env;
const RULES = fs.readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8');

before(async () => { env = await initializeTestEnvironment({ projectId: 'demo-cslifeline', firestore: { rules: RULES, host: '127.0.0.1', port: 8080 } }); });
after(async () => { await env?.cleanup(); });
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'classes/10A'), { name: '10A', join_open: true, teacher_uids: ['t1'] });
    await setDoc(doc(db, 'classes/10B'), { name: '10B', join_open: false, teacher_uids: ['t2'] });
    await setDoc(doc(db, 'users/admin'), { role: 'admin', status: 'active', display_name: 'Admin' });
    await setDoc(doc(db, 'users/t1'), { role: 'teacher', status: 'active', class_codes: ['10A'], display_name: 'T1' });
    await setDoc(doc(db, 'users/t2'), { role: 'teacher', status: 'active', class_codes: ['10B'], display_name: 'T2' });
    await setDoc(doc(db, 'users/s1'), { role: 'student', status: 'active', class_code: '10A', pseudo_id: 'L-AAAAAAAAAA', display_name: 'S1' });
    await setDoc(doc(db, 'users/s2'), { role: 'student', status: 'active', class_code: '10B', pseudo_id: 'L-BBBBBBBBBB', display_name: 'S2' });
    await setDoc(doc(db, 'responses/r1'), { student_uid: 's1', class_code: '10A', question_id: 'q', correct: true, mode: 'practice' });
    await setDoc(doc(db, 'predictions/p1'), { student_uid: 's1', class_code: '10A', model_version: 'm', prediction_status: 'demonstration' });
    await setDoc(doc(db, 'assessments/a1'), { created_by: 't1', class_codes: ['10A'], status: 'published', questions: [] });
    await setDoc(doc(db, 'assessment_keys/a1'), { created_by: 't1', class_codes: ['10A'], answers: {} });
    await setDoc(doc(db, 'submission_results/a1__s1'), { student_uid: 's1', class_code: '10A', released: false, score: 3 });
  });
});
const as = (uid) => env.authenticatedContext(uid).firestore();
const profile = (extra) => ({ display_name: 'New', email: 'n@x.org', role: 'student', status: 'active', class_code: '10A', pseudo_id: 'L-CCCCCCCCCC', is_synthetic: false, ...extra });

test('S1/S2: a new user cannot make themselves teacher or admin', async () => {
  await assertFails(setDoc(doc(as('new'), 'users/new'), profile({ role: 'teacher' })));
  await assertFails(setDoc(doc(as('new'), 'users/new'), profile({ role: 'admin' })));
  await assertSucceeds(setDoc(doc(as('new'), 'users/new'), profile()));
  await assertSucceeds(setDoc(doc(as('new2'), 'users/new2'), { display_name: 'Teacher', email: 'x@y.z', role: 'teacher_pending', status: 'pending', class_codes: [] }));
});
test('students can join only open classes and cannot change their own role or class', async () => {
  await assertFails(setDoc(doc(as('new'), 'users/new'), profile({ class_code: '10B' })));
  await assertFails(updateDoc(doc(as('s1'), 'users/s1'), { role: 'teacher' }));
  await assertFails(updateDoc(doc(as('s1'), 'users/s1'), { class_code: '10B' }));
  await assertSucceeds(updateDoc(doc(as('s1'), 'users/s1'), { display_name: 'Ama' }));
});
test('only admins provision roles', async () => {
  await assertFails(updateDoc(doc(as('t1'), 'users/s1'), { role: 'teacher' }));
  await assertSucceeds(updateDoc(doc(as('admin'), 'users/s1'), { role: 'teacher', class_codes: ['10A'] }));
});
test('students never read predictions, answer keys, or other students’ data', async () => {
  await assertFails(getDoc(doc(as('s1'), 'predictions/p1')));
  await assertFails(getDoc(doc(as('s1'), 'assessment_keys/a1')));
  await assertFails(getDoc(doc(as('s2'), 'responses/r1')));
  await assertSucceeds(getDoc(doc(as('s1'), 'responses/r1')));
  await assertSucceeds(getDoc(doc(as('s1'), 'assessments/a1')));
});
test('teachers are isolated to their own classes', async () => {
  await assertSucceeds(getDoc(doc(as('t1'), 'responses/r1')));
  await assertFails(getDoc(doc(as('t2'), 'responses/r1')));
  await assertSucceeds(getDocs(query(collection(as('t1'), 'responses'), where('class_code', 'in', ['10A']))));
  await assertFails(getDocs(query(collection(as('t2'), 'responses'), where('class_code', 'in', ['10A']))));
  await assertFails(getDoc(doc(as('t2'), 'assessment_keys/a1')));
});
test('students write only their own practice responses; assessment responses are staff-only', async () => {
  const base = { student_uid: 's1', class_code: '10A', question_id: 'q', correct: true, mode: 'practice', scored_by: 'client', is_synthetic: false };
  await assertSucceeds(setDoc(doc(as('s1'), 'responses/x1'), base));
  await assertFails(setDoc(doc(as('s1'), 'responses/x2'), { ...base, student_uid: 's2' }));
  await assertFails(setDoc(doc(as('s1'), 'responses/x3'), { ...base, mode: 'assessment' }));
  await assertFails(setDoc(doc(as('s1'), 'responses/r1'), base), 'no overwriting');
});
test('submissions: one per student, only to a published assessment of their class, no self-scoring', async () => {
  const sub = { assessment_id: 'a1', student_uid: 's1', class_code: '10A', status: 'submitted', answers: {} };
  await assertFails(setDoc(doc(as('s1'), 'submissions/a1__s1'), { ...sub, score: 10 }));
  await assertSucceeds(setDoc(doc(as('s1'), 'submissions/a1__s1'), sub));
  await assertFails(setDoc(doc(as('s1'), 'submissions/a1__s1'), sub), 'second submission');
  await assertFails(setDoc(doc(as('s2'), 'submissions/a1__s2'), { ...sub, student_uid: 's2', class_code: '10B' }));
});
test('results are hidden from the student until released', async () => {
  await assertFails(getDoc(doc(as('s1'), 'submission_results/a1__s1')));
  await env.withSecurityRulesDisabled(ctx => updateDoc(doc(ctx.firestore(), 'submission_results/a1__s1'), { released: true }));
  await assertSucceeds(getDoc(doc(as('s1'), 'submission_results/a1__s1')));
});
test('audit logs are append-only and admin-readable', async () => {
  const ref = await assertSucceeds(addDoc(collection(as('t1'), 'audit_logs'), { actor_uid: 't1', action: 'x' }));
  await assertFails(addDoc(collection(as('t1'), 'audit_logs'), { actor_uid: 'someone-else', action: 'x' }));
  await assertFails(updateDoc(doc(as('t1'), 'audit_logs', ref.id), { action: 'y' }));
  await assertFails(deleteDoc(doc(as('admin'), 'audit_logs', ref.id)));
  await assertFails(getDoc(doc(as('t1'), 'audit_logs', ref.id)));
  await assertSucceeds(getDoc(doc(as('admin'), 'audit_logs', ref.id)));
});
test('suspended teachers lose access', async () => {
  await env.withSecurityRulesDisabled(ctx => updateDoc(doc(ctx.firestore(), 'users/t1'), { status: 'suspended' }));
  await assertFails(getDoc(doc(as('t1'), 'responses/r1')));
});
test('interventions, outcomes and predictions: staff of the class only; outcomes are immutable', async () => {
  const iv = { student_uid: 's1', class_code: '10A', target: { type: 'chapter', id: 'T08' }, status: 'active' };
  await assertSucceeds(setDoc(doc(as('t1'), 'interventions/i1'), iv));
  await assertFails(setDoc(doc(as('t2'), 'interventions/i2'), iv));
  await assertFails(getDoc(doc(as('s1'), 'interventions/i1')));
  const out = { intervention_id: 'i1', student_uid: 's1', class_code: '10A', recorded_by: 't1', evaluation: { outcome: 'improved' } };
  await assertSucceeds(setDoc(doc(as('t1'), 'intervention_outcomes/o1'), out));
  await assertFails(updateDoc(doc(as('t1'), 'intervention_outcomes/o1'), { 'evaluation.outcome': 'declined' }));
  await assertFails(getDoc(doc(as('t2'), 'predictions/p1')));
});
test('model registry, integrations and learning events are administrator-only', async () => {
  await assertFails(setDoc(doc(as('t1'), 'model_registry/m1'), { status: 'production' }));
  await assertSucceeds(setDoc(doc(as('admin'), 'model_registry/m1'), { status: 'candidate' }));
  await assertFails(getDoc(doc(as('t1'), 'learning_events/e1')));
  await assertFails(setDoc(doc(as('t1'), 'platform_integrations/WOW_SIR'), { authorisation: { status: 'approved' } }));
  await assertSucceeds(getDoc(doc(as('t1'), 'model_registry/m1')));
  await assertFails(getDoc(doc(as('s1'), 'model_registry/m1')));
});
test('teachers may record consent or suspend, but never change a student\'s role or class', async () => {
  await assertSucceeds(updateDoc(doc(as('t1'), 'users/s1'), { consent: { research_use: 'granted' } }));
  await assertSucceeds(updateDoc(doc(as('t1'), 'users/s1'), { status: 'suspended' }));
  await assertFails(updateDoc(doc(as('t1'), 'users/s1'), { class_code: '10B' }));
  await assertFails(updateDoc(doc(as('t2'), 'users/s1'), { consent: { research_use: 'granted' } }));
});
