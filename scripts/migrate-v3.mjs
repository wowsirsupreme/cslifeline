#!/usr/bin/env node
// Migrate a CS Lifeline v3 Firestore database to the v4 schema.
//
//   GOOGLE_APPLICATION_CREDENTIALS=service-account.json node scripts/migrate-v3.mjs            # dry run (default): report only
//   ... node scripts/migrate-v3.mjs --apply --trusted-staff uid1,uid2                          # write changes
//   ... --reset-predictable-passwords                                                          # give v3 quick-sign-in accounts new random passwords
//
// Safety: a dry run changes nothing. With --apply, every document is first backed up to
// migrations/backup-<timestamp>/<collection>.json, and documents already at schema 2.0 are skipped,
// so the script can be re-run. Nothing is deleted except v3 predictions, which are moved to
// legacy_predictions (they had label leakage and no model version).
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { migrateUser, migrateResponse, migrateSession, archivePrediction, migrateAssessment, migrateQuestion } from './lib/migrate-v3-transform.mjs';
import { QUESTION_BANK } from '../public/data/question-bank.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const RESET = args.includes('--reset-predictable-passwords');
const trusted = new Set((args[args.indexOf('--trusted-staff') + 1] || '').split(',').filter(x => x && !x.startsWith('--')));

const { initializeApp, applicationDefault } = await import('firebase-admin/app');
const { getFirestore, FieldValue } = await import('firebase-admin/firestore');
const { getAuth } = await import('firebase-admin/auth');
initializeApp({ credential: applicationDefault() });
const db = getFirestore();
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const BACKUP = join(ROOT, 'migrations', `backup-${stamp}`);
const report = { mode: APPLY ? 'apply' : 'dry-run', started: new Date().toISOString(), counts: {}, notes: [] };
const all = async (col) => (await db.collection(col).get()).docs.map(d => ({ id: d.id, ...d.data() }));
const backup = (col, docs) => { if (!APPLY) return; mkdirSync(BACKUP, { recursive: true }); writeFileSync(join(BACKUP, col + '.json'), JSON.stringify(docs, null, 1)); };
let batch = db.batch(), ops = 0;
const write = async (fn) => { if (!APPLY) return; fn(batch); if (++ops >= 400) { await batch.commit(); batch = db.batch(); ops = 0; } };
const count = (k) => { report.counts[k] = (report.counts[k] || 0) + 1; };

const users = await all('users'); backup('users', users);
const userById = Object.fromEntries(users.map(u => [u.id, u]));
const qType = Object.fromEntries(QUESTION_BANK.map(q => [q.id, ({ MCQ: 'mcq', trace_output: 'pseudocode' })[q.type] || q.type]));
const credentials = [];
for (const u of users) {
  const m = migrateUser(u.id, u, { trustedStaff: trusted }); if (m.skip) { count('users.skipped'); continue; }
  count('users.' + m.doc.role); if (m.notes.length) report.notes.push(`users/${u.id}: ${m.notes.join('; ')}`);
  userById[u.id] = { ...u, ...m.doc };
  await write(b => b.set(db.doc(`users/${u.id}`), { ...m.doc, ...Object.fromEntries(m.deleteFields.map(f => [f, FieldValue.delete()])) }, { merge: true }));
  if (RESET && m.doc.legacy_predictable_login && APPLY) {
    const pw = randomBytes(9).toString('base64url');
    await getAuth().updateUser(u.id, { password: pw });
    credentials.push({ uid: u.id, login: u.anonEmail, name: m.doc.display_name, class: m.doc.class_code, new_password: pw });
  }
}
// classes referenced by students
const codes = [...new Set(Object.values(userById).filter(u => u.role === 'student' && u.class_code).map(u => u.class_code))];
for (const c of codes) {
  const ref = db.doc(`classes/${c}`);
  if (!(await ref.get()).exists) { count('classes.created'); await write(b => b.set(ref, { name: c, join_open: false, teacher_uids: [], school_id: null, subject: 'CS-0478', migrated_from: 'v3', created_at: new Date().toISOString() })); }
}
const responses = await all('responses'); backup('responses', responses);
for (const r of responses) {
  const m = migrateResponse(r.id, r, { userById, questionTypeById: qType }); if (m.skip) { count('responses.skipped'); continue; }
  count('responses.migrated'); for (const f of m.flags) count('responses.flag.' + f);
  await write(b => b.set(db.doc(`responses/${r.id}`), { ...m.doc, ...Object.fromEntries(m.deleteFields.map(f => [f, FieldValue.delete()])) }, { merge: true }));
}
const sessions = await all('sessions'); backup('sessions', sessions);
for (const s of sessions) { const m = migrateSession(s.id, s, { userById }); if (m.skip) { count('sessions.skipped'); continue; } count('sessions.migrated'); await write(b => b.set(db.doc(`sessions/${s.id}`), m.doc, { merge: true })); }
const preds = await all('predictions'); backup('predictions', preds);
for (const p of preds) { if (p.model_version && p.prediction_status) { count('predictions.kept'); continue; } const a = archivePrediction(p.id, p); count('predictions.archived'); await write(b => { b.set(db.doc(`${a.col}/${p.id}`), a.doc); b.delete(db.doc(`predictions/${p.id}`)); }); }
const pubs = await all('published_assessments'); backup('published_assessments', pubs);
for (const a of pubs) { const m = migrateAssessment(a.id, a, {}); count('assessments.migrated'); await write(b => { b.set(db.doc(`assessments/v3_${a.id}`), m.assessment); b.set(db.doc(`assessment_keys/v3_${a.id}`), m.key); }); }
const qs = await all('questions'); backup('questions', qs);
for (const q of qs) { const m = migrateQuestion(q.id, q); if (m.skip) { count('questions.skipped'); continue; } count('questions.migrated'); await write(b => b.set(db.doc(`questions/${q.id}`), m.doc)); }
if (APPLY && ops) await batch.commit();
if (APPLY) await db.collection('audit_logs').add({ actor_uid: 'migration-script', actor_role: 'system', action: 'migration.v3_to_v4', target: 'database', details: report.counts, at: new Date().toISOString() });

report.finished = new Date().toISOString();
mkdirSync(join(ROOT, 'migrations'), { recursive: true });
writeFileSync(join(ROOT, 'migrations', `report-${stamp}.json`), JSON.stringify(report, null, 1));
if (credentials.length) {
  const f = join(ROOT, 'migrations', `NEW-PASSWORDS-${stamp}.csv`);
  writeFileSync(f, 'uid,login,name,class,new_password\n' + credentials.map(c => [c.uid, c.login, c.name, c.class, c.new_password].map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n'));
  console.log(`\n${credentials.length} passwords reset. Give each student their new password privately, then DELETE ${f}.`);
}
console.log(JSON.stringify(report.counts, null, 1));
console.log(APPLY ? `Applied. Backup: ${BACKUP}` : 'Dry run only — nothing was changed. Re-run with --apply to migrate.');
