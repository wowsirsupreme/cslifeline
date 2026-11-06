// CS Lifeline Cloud Functions (optional — requires the Firebase Blaze plan).
// Without them the app still works: teachers score submissions from the dashboard and
// administrators import integration batches through the Integrations screen.
//
//   scoreSubmission   Firestore trigger: scores a new submission with the shared marking code.
//   ingest            HTTPS endpoint for authorised platforms (see docs/API_DOCUMENTATION.md).
//   closeExpired      Hourly: closes published assessments whose closes_at has passed.
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { onRequest } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { defineSecret } from 'firebase-functions/params';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import fs from 'node:fs';
import { scoreSubmissionRecords } from './shared/js/engine/records.js';
import * as events from './shared/js/integration/events.js';
import { handleIngest } from './lib/ingest.js';

initializeApp();
const db = getFirestore();
const WOW_SIR_SECRET = defineSecret('CSL_SECRET_WOW_SIR');
const DBWOW_SECRET = defineSecret('CSL_SECRET_DBWOW');
const dbwowKey = JSON.parse(fs.readFileSync(new URL('./shared/data/integrations/dbwow_quiz_key.json', import.meta.url)));

export const scoreSubmission = onDocumentCreated({ document: 'submissions/{id}', region: 'europe-west1' }, async (event) => {
  const sub = { ...event.data.data(), id: event.params.id };
  const [a, k, student, prev] = await Promise.all([
    db.doc(`assessments/${sub.assessment_id}`).get(), db.doc(`assessment_keys/${sub.assessment_id}`).get(),
    db.doc(`users/${sub.student_uid}`).get(), db.doc(`submission_results/${sub.id}`).get(),
  ]);
  if (!a.exists || !k.exists) { console.error('Missing assessment or key for', sub.id); return; }
  const out = await scoreSubmissionRecords(sub, a.data(), k.data(), { prevResult: prev.exists ? prev.data() : null, student: student.exists ? student.data() : null, actor: 'cloud-function', timestamp: FieldValue.serverTimestamp() });
  const batch = db.batch();
  for (const r of out.responses) batch.set(db.doc(`responses/${r.id}`), r.data);
  batch.set(db.doc(`submission_results/${sub.id}`), out.result);
  batch.set(db.doc(`submissions/${sub.id}`), out.submissionPatch, { merge: true });
  await batch.commit();
});

const store = {
  get: async (col, id) => { const s = await db.doc(`${col}/${id}`).get(); return s.exists ? s.data() : null; },
  set: (col, id, data) => db.doc(`${col}/${id}`).set(data),
  merge: (col, id, data) => db.doc(`${col}/${id}`).set(data, { merge: true }),
};

export const ingest = onRequest({ region: 'europe-west1', secrets: [WOW_SIR_SECRET, DBWOW_SECRET], cors: false, maxInstances: 5 }, async (req, res) => {
  if (req.method !== 'POST') { res.status(405).json({ error: 'POST only' }); return; }
  const secrets = { WOW_SIR: WOW_SIR_SECRET, DBWOW: DBWOW_SECRET };
  const out = await handleIngest({ headers: req.headers, rawBody: req.rawBody.toString('utf8') }, {
    store, shared: { events, dbwowKey },
    getSecret: async (p) => { try { return secrets[p]?.value() || process.env[`CSL_SECRET_${p}`] || null; } catch { return null; } },
  });
  res.status(out.status).json(out.body);
});

export const closeExpired = onSchedule({ schedule: 'every 60 minutes', region: 'europe-west1' }, async () => {
  const now = new Date().toISOString();
  const snap = await db.collection('assessments').where('status', '==', 'published').get();
  const batch = db.batch(); let n = 0;
  snap.forEach(d => { const c = d.data().closes_at; if (c && String(c) < now) { batch.update(d.ref, { status: 'closed', closed_by: 'schedule' }); n++; } });
  if (n) await batch.commit();
});
