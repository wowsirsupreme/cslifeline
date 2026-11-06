import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { normaliseIncoming, validateEvent, processBatch, fromWowSirSession, fromDbwowProgress, linkLearners, fromCSLifelineResponse, mapWowSirTopic } from '../../public/js/integration/events.js';
import { DemoBackend, matches } from '../../public/js/core/backend-demo.js';
import { CHAPTERS } from '../../public/js/engine/curriculum.js';

const fx = f => JSON.parse(fs.readFileSync(new URL('../fixtures/' + f, import.meta.url)));
const key = JSON.parse(fs.readFileSync(new URL('../../public/data/integrations/dbwow_quiz_key.json', import.meta.url)));
const chapterLookup = name => { const n = String(name).toLowerCase(); const hit = Object.entries(CHAPTERS).find(([, c]) => c.title.toLowerCase().includes(n)); return hit ? hit[0] : null; };

test('the sample event from the project brief is accepted after normalisation', () => {
  const e = normaliseIncoming(fx('brief_event.json'), { chapterLookup });
  assert.deepEqual(validateEvent(e), []);
  assert.equal(e.correct, false); assert.equal(e.duration_ms, 35000); assert.equal(e.chapter_id, 'T08'); assert.equal(e.source_learner_id, 'ANON-001'); assert.equal(e.subject, 'CS-0478');
});
test('validation rejects personal data, bad types and unknown event types', () => {
  const e = normaliseIncoming({ ...fx('brief_event.json'), email: 'x@y.z', event_type: 'clicked' });
  const errs = validateEvent(e);
  assert.ok(errs.some(x => /email/.test(x))); assert.ok(errs.some(x => /event_type/.test(x)));
});
test('batches are de-duplicated by event_id and rejections carry reasons', () => {
  const ok = fx('brief_event.json');
  const r = processBatch([ok, ok, { event_id: 'E2' }], { existingIds: new Set(), chapterLookup });
  assert.equal(r.accepted.length, 1); assert.equal(r.duplicates, 1); assert.equal(r.rejected.length, 1); assert.ok(r.rejected[0].errors.length);
  const again = processBatch([ok], { existingIds: new Set([r.accepted[0].event_id]) });
  assert.equal(again.duplicates, 1);
});
test('WOW Sir adapter: session-scoped learners, non-CS topics rejected, names kept out of events', () => {
  const r = fromWowSirSession(fx('wowsir_session_export.json'));
  assert.equal(r.events.length, 4);           // p1: 2 CS answers, p2: 2
  assert.equal(r.rejected.length, 1);          // Grade 6 Excel question
  for (const e of r.events) { assert.deepEqual(validateEvent(e), []); assert.match(e.source_learner_id, /^sess_demo_01:p[12]$/); assert.equal(e.learner_id, null); assert.ok(!JSON.stringify(e).includes('Ama')); }
  assert.deepEqual(r.nameHints.map(h => h.name), ['Ama B', 'Kojo']);
  assert.equal(r.events.find(e => e.source_learner_id.endsWith('p1') && e.question_id === 'WOWSIR:wq2').context.interruptions, 1);
  assert.equal(mapWowSirTopic('gr10-sql'), 'T14'); assert.equal(mapWowSirTopic('gr5-ch2-storage'), null);
  const ids = r.events.map(e => e.event_id); assert.equal(new Set(ids).size, ids.length);
  assert.deepEqual(fromWowSirSession(fx('wowsir_session_export.json')).events.map(e => e.event_id), ids, 'event IDs are deterministic');
});
test('DBWOW: Access-only topics (forms, reports) are rejected as outside the syllabus', () => {
  const r = fromDbwowProgress({ uid: 'x', exported_at: '2026-11-01T00:00:00Z', progress: { quizzes: { 'forms:0': 0, 'pk:0': 0 } } }, key);
  assert.equal(r.events.length, 1); assert.match(r.rejected[0].reason, /outside the 0478 syllabus/);
});
test('DBWOW adapter scores quiz answers against the extracted key; unknown items rejected', () => {
  const r = fromDbwowProgress(fx('dbwow_progress_export.json'), key);
  const q = r.events.filter(e => e.event_type === 'question_answered');
  assert.equal(q.length, 3); assert.equal(r.rejected.length, 1);
  assert.equal(q.find(e => e.question_id === 'DBWOW:pk:0').correct, key.topics.pk.quiz[0].answer === 1);
  const pk = q.find(e => e.question_id === 'DBWOW:pk:0');
  assert.deepEqual(pk.misconception_tags, pk.correct ? [] : ['MC-DB-01'], 'misconception tags only attach to wrong answers');
  assert.equal(r.events.filter(e => e.event_type === 'practical_step_verified').length, 1);
  for (const e of r.events) { assert.deepEqual(validateEvent(e), []); assert.equal(e.time_precision, 'snapshot'); }
});
test('identity linking only uses verified mappings', () => {
  const r = fromWowSirSession(fx('wowsir_session_export.json'));
  const linked = linkLearners(r.events, [
    { source_platform: 'WOW_SIR', source_learner_id: 'sess_demo_01:p1', pseudo_id: 'L-AAAA', status: 'verified' },
    { source_platform: 'WOW_SIR', source_learner_id: 'sess_demo_01:p2', pseudo_id: 'L-BBBB', status: 'rejected' },
  ]);
  assert.ok(linked.filter(e => e.source_learner_id.endsWith('p1')).every(e => e.learner_id === 'L-AAAA' && e.linkage === 'linked'));
  assert.ok(linked.filter(e => e.source_learner_id.endsWith('p2')).every(e => e.learner_id === null && e.linkage === 'unlinked'));
});
test('CS Lifeline responses map to valid events', () => {
  const e = fromCSLifelineResponse({ id: 'r1', student_uid: 'u', pseudo_id: 'L-1', class_code: 'C', question_id: 'Q', chapter_id: 'T01', correct: true, recorded_at: '2026-10-01T10:00:00Z', time_ms: 1200, misconception_tag: 'MC-BIN-01' });
  assert.deepEqual(validateEvent(e), []); assert.equal(e.learner_id, 'L-1'); assert.equal(e.duration_ms, 1200); assert.deepEqual(e.misconception_tags, ['MC-BIN-01']);
});

test('demo backend: query operators, merge, overlay and reset', async () => {
  globalThis.localStorage = { _s: {}, getItem(k) { return this._s[k] ?? null; }, setItem(k, v) { this._s[k] = String(v); }, removeItem(k) { delete this._s[k]; } };
  const b = new DemoBackend({ dataset: { meta: { synthetic: true }, collections: { users: [{ id: 'u1', role: 'student', class_code: 'A', tags: ['x'], n: 3 }, { id: 'u2', role: 'teacher', class_codes: ['A'], n: 7 }] } } });
  await b.load();
  assert.equal((await b.query('users', [['role', '==', 'student']])).length, 1);
  assert.equal((await b.query('users', [['class_codes', 'array-contains', 'A']])).length, 1);
  assert.equal((await b.query('users', [['n', '>=', 3], ['n', '<', 7]])).length, 1);
  assert.equal((await b.query('users', [['role', 'in', ['student', 'teacher']]], { orderBy: 'n', direction: 'desc' }))[0].id, 'u2');
  await b.set('users', 'u1', { consent: { research_use: 'granted' } }, { merge: true });
  const u = await b.get('users', 'u1'); assert.equal(u.class_code, 'A'); assert.equal(u.consent.research_use, 'granted');
  await b.remove('users', 'u2'); assert.equal(await b.get('users', 'u2'), null);
  const b2 = new DemoBackend({ dataset: { collections: { users: [{ id: 'u1', role: 'student' }, { id: 'u2', role: 'teacher' }] } } });
  await b2.load(); assert.equal(await b2.get('users', 'u2'), null, 'overlay persisted across instances');
  b2.resetDemo(); const b3 = new DemoBackend({ dataset: { collections: { users: [{ id: 'u2', role: 'teacher' }] } } }); await b3.load();
  assert.ok(await b3.get('users', 'u2'), 'reset restores the base dataset');
  assert.equal(matches({ a: { b: 2 } }, [['a.b', '==', 2]]), true);
});

test('default chapter lookup: the brief\'s example maps to T08; unknown names are not guessed', async () => {
  const { normaliseIncoming, defaultChapterLookup } = await import('../../public/js/integration/events.js');
  const e = normaliseIncoming(JSON.parse((await import('node:fs')).readFileSync(new URL('../fixtures/brief_event.json', import.meta.url), 'utf8')));
  assert.equal(e.chapter_id, 'T08');
  assert.equal(e.source_learner_id, 'ANON-001');
  assert.equal(defaultChapterLookup('Data Representation'), 'T01');
  assert.equal(defaultChapterLookup('Programming', 'Arrays'), 'T09');
  assert.equal(defaultChapterLookup('Scratch animation'), null);
});
