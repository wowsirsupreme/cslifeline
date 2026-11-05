// Application data layer.
//
// Every page talks to the database only through this module. It hides which backend
// is in use (Firebase or demonstration), applies the shared schema, writes audit
// entries for administrative actions, and protects responses against connection
// loss with an outbox. The security rules (firestore.rules) are the real access
// control; the role checks here only give clearer error messages.

import { CONFIG, resolveMode } from './config.js';
import { DemoBackend } from './backend-demo.js';
import { randomId, newPseudoId, toMs, uniq, clean } from './util.js';
import { stripAnswerKey } from '../engine/questions.js';
import { markResponse, totalMarks, splitKey, joinKey } from '../engine/marking.js';
import { DEFAULT_THRESHOLDS } from '../engine/risk.js';

const OUTBOX_KEY = 'csl.outbox.v1';
const DEFAULT_SETTINGS = {
  risk_thresholds: DEFAULT_THRESHOLDS,
  capture_interruptions: true,
  retention_days: 730,
  research_export_requires_consent: true,
  allow_student_self_registration: true,
  release_feedback_default: 'on_scoring',
};

class Store {
  constructor() { this.backend = null; this.auth = null; this.me = null; this.settings = { ...DEFAULT_SETTINGS }; this._outboxBusy = false; this.onOutboxChange = null; }

  get mode() { return this.backend?.mode || resolveMode(); }
  get isDemo() { return this.mode === 'demo'; }

  async init() {
    if (this.backend) return this;
    const mode = resolveMode();
    if (mode === 'demo') { this.backend = new DemoBackend(); await this.backend.load(); }
    else { const { FirebaseBackend } = await import('./backend-firebase.js'); this.backend = new FirebaseBackend(); await this.backend.init(); }
    this.auth = await this.backend.authReady();
    if (this.auth) {
      try { this.me = await this.backend.get('users', this.auth.uid); } catch (e) { console.warn('Profile read failed:', e.message); this.me = null; }
    }
    try { const s = await this.backend.get('settings', 'platform'); if (s) this.settings = { ...DEFAULT_SETTINGS, ...s }; } catch { /* students may not read settings in some configurations */ }
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => this.flushOutbox());
      setTimeout(() => this.flushOutbox(), 500);
    }
    return this;
  }

  // ── Authentication and registration ─────────────────────────────────────
  async signInEmail(email, password) { this.auth = await this.backend.signInEmail(email, password); return this._loadMe(); }
  async signInDemo(uid) { this.auth = await this.backend.signInDemo(uid); return this._loadMe(); }
  demoAccounts() { return this.backend.demoAccounts ? this.backend.demoAccounts() : []; }
  async signInGoogle() { this.auth = await this.backend.signInGoogle(); return this._loadMe(); }
  async signOut() { await this.backend.signOut(); this.auth = null; this.me = null; }
  resetPassword(email) { return this.backend.sendReset(email); }
  async _loadMe() { this.me = this.auth ? await this.backend.get('users', this.auth.uid) : null; if (this.me) this.touch(); return this.me; }

  /** Check a class join code before registering. Returns the class or throws a clear error. */
  async checkJoinCode(code) {
    const c = await this.backend.get('classes', String(code || '').trim().toUpperCase());
    if (!c) throw new Error('No class uses that code. Check it with your teacher.');
    if (!c.join_open) throw new Error('That class is not accepting new students at the moment. Ask your teacher to open it.');
    return c;
  }

  /** Create the profile for a newly authenticated user. Roles are never self-assigned beyond student / pending teacher. */
  async createProfile({ intent, displayName, classCode }) {
    if (!this.auth) throw new Error('Sign in first');
    const existing = await this.backend.get('users', this.auth.uid);
    if (existing) { this.me = existing; return existing; }
    const base = { display_name: String(displayName || this.auth.displayName || '').trim().slice(0, 60) || 'Learner', email: this.auth.email || '', created_at: this.backend.serverTime(), last_seen: this.backend.serverTime(), is_synthetic: false };
    let doc;
    if (intent === 'student') {
      const cls = await this.checkJoinCode(classCode);
      doc = { ...base, role: 'student', status: 'active', class_code: cls.id, school_id: cls.school_id || null, grade: cls.grade || null, pseudo_id: newPseudoId(), consent: { research_use: 'not_recorded' } };
    } else if (intent === 'teacher') {
      doc = { ...base, role: 'teacher_pending', status: 'pending', class_codes: [], school_id: null };
    } else throw new Error('Unknown registration type');
    await this.backend.set('users', this.auth.uid, doc);
    this.me = { ...doc, id: this.auth.uid };
    return this.me;
  }

  async signUpEmail({ email, password, displayName, intent, classCode }) {
    if (intent === 'student') await this.checkJoinCode(classCode); // fail before creating an auth account
    this.auth = await this.backend.signUpEmail(email, password, displayName);
    return this.createProfile({ intent, displayName, classCode });
  }

  touch() { if (this.auth && this.me) this.backend.set('users', this.auth.uid, { last_seen: this.backend.serverTime() }, { merge: true }).catch(() => {}); }

  // ── Audit log (append-only) ─────────────────────────────────────────────
  async audit(action, target, details = {}) {
    try {
      await this.backend.add('audit_logs', { actor_uid: this.auth?.uid || null, actor_role: this.me?.role || null, action, target, details: clean(details), at: this.backend.serverTime() });
    } catch (e) { console.warn('Audit write failed:', e.message); }
  }
  listAudit(limit = 300) { return this.backend.query('audit_logs', [], { orderBy: 'at', direction: 'desc', limit }); }

  // ── Settings ────────────────────────────────────────────────────────────
  async saveSettings(patch) {
    await this.backend.set('settings', 'platform', { ...patch, updated_at: this.backend.serverTime(), updated_by: this.auth.uid }, { merge: true });
    this.settings = { ...this.settings, ...patch };
    await this.audit('settings.update', 'settings/platform', patch);
  }

  // ── Users ───────────────────────────────────────────────────────────────
  getUser(uid) { return this.backend.get('users', uid); }
  listUsers(where = []) { return this.backend.query('users', where); }
  listStudents(classCodes) {
    const codes = [].concat(classCodes || []).filter(Boolean);
    if (!codes.length) return Promise.resolve([]);
    return this.backend.query('users', [['role', '==', 'student'], ['class_code', 'in', codes]]);
  }
  async adminUpdateUser(uid, patch, reason = '') {
    const before = await this.backend.get('users', uid);
    await this.backend.set('users', uid, { ...patch, updated_at: this.backend.serverTime(), updated_by: this.auth.uid }, { merge: true });
    const changes = {};
    for (const k of Object.keys(patch)) changes[k] = { from: before?.[k] ?? null, to: patch[k] };
    await this.audit('user.update', 'users/' + uid, { changes, reason });
    // Keep the class document's teacher list in step with the user's classes.
    if (patch.class_codes && (patch.role || before?.role) === 'teacher') {
      const prev = new Set(before?.class_codes || []), next = new Set(patch.class_codes);
      for (const code of uniq([...prev, ...next])) {
        const cls = await this.backend.get('classes', code); if (!cls) continue;
        const t = new Set(cls.teacher_uids || []);
        if (next.has(code)) t.add(uid); else t.delete(uid);
        await this.backend.set('classes', code, { teacher_uids: [...t] }, { merge: true });
      }
    }
  }

  // ── Schools and classes ─────────────────────────────────────────────────
  listSchools() { return this.backend.query('schools'); }
  async saveSchool(s) { const id = s.id || randomId('sch_', 8); await this.backend.set('schools', id, { ...s, id: undefined, updated_at: this.backend.serverTime() }, { merge: true }); await this.audit('school.save', 'schools/' + id, { name: s.name }); return id; }
  listClasses() {
    if (this.me?.role === 'admin') return this.backend.query('classes');
    if (this.me?.role === 'teacher') return this.backend.query('classes', [['teacher_uids', 'array-contains', this.auth.uid]]);
    return this.me?.class_code ? this.backend.get('classes', this.me.class_code).then(c => c ? [c] : []) : Promise.resolve([]);
  }
  getClass(code) { return this.backend.get('classes', code); }
  async saveClass(c) {
    const id = String(c.id || '').trim().toUpperCase();
    if (!/^[A-Z0-9-]{3,20}$/.test(id)) throw new Error('Class code must be 3–20 letters, digits or hyphens');
    const { id: _drop, ...data } = c;
    await this.backend.set('classes', id, { ...data, updated_at: this.backend.serverTime() }, { merge: true });
    await this.audit('class.save', 'classes/' + id, { name: c.name, join_open: c.join_open });
    return id;
  }
  myClassCodes() { return this.me?.role === 'student' ? [this.me.class_code] : (this.me?.class_codes || []); }

  // ── Curriculum overrides ────────────────────────────────────────────────
  listCurriculum() { return this.backend.query('curriculum'); }
  async saveCurriculum(ch) { await this.backend.set('curriculum', ch.id, { ...ch, updated_at: this.backend.serverTime() }, { merge: true }); await this.audit('curriculum.save', 'curriculum/' + ch.id, { title: ch.title }); }

  // ── Questions ───────────────────────────────────────────────────────────
  listQuestions({ includeArchived = false } = {}) {
    if (this.me?.role === 'student') return this.backend.query('questions', [['visibility', '==', 'practice'], ['active', '==', true]]);
    return this.backend.query('questions', includeArchived ? [] : [['active', '==', true]]);
  }
  async saveQuestion(q) {
    const id = q.id || ('Q-' + randomId('', 10).toUpperCase());
    const { id: _x, ...data } = q;
    const prev = q.id ? await this.backend.get('questions', id) : null;
    await this.backend.set('questions', id, { ...data, updated_at: this.backend.serverTime(), updated_by: this.auth.uid, ...(prev ? { teacher_modified: true } : { created_at: this.backend.serverTime(), created_by: this.auth.uid }) }, { merge: true });
    await this.audit(prev ? 'question.update' : 'question.create', 'questions/' + id, { chapter_id: q.chapter_id, type: q.type });
    return id;
  }
  async archiveQuestion(id, archived = true) {
    await this.backend.set('questions', id, { active: !archived, status: archived ? 'archived' : 'active', updated_at: this.backend.serverTime() }, { merge: true });
    await this.audit(archived ? 'question.archive' : 'question.restore', 'questions/' + id);
  }
  async importQuestions(list, source = 'import') {
    const ops = list.map(q => ({ type: 'set', col: 'questions', id: q.id || ('Q-' + randomId('', 10).toUpperCase()), data: { ...q, id: undefined, source, created_at: this.backend.serverTime(), created_by: this.auth.uid } }));
    await this.backend.batch(ops.map(o => ({ ...o, data: clean(o.data) })));
    await this.audit('question.import', 'questions', { count: ops.length, source });
    return ops.map(o => o.id);
  }
  listGroups() { return this.backend.query('question_groups'); }
  async saveGroup(g) { const id = g.id || randomId('grp_', 8); await this.backend.set('question_groups', id, { ...g, id: undefined }, { merge: true }); return id; }

  // ── Assessments ─────────────────────────────────────────────────────────
  listAssessments() {
    if (this.me?.role === 'student') return this.backend.query('assessments', [['class_codes', 'array-contains', this.me.class_code]]).then(a => a.filter(x => x.status !== 'draft'));
    if (this.me?.role === 'admin') return this.backend.query('assessments');
    return this.backend.query('assessments', [['created_by', '==', this.auth.uid]]);
  }
  getAssessment(id) { return this.backend.get('assessments', id); }
  getKeys(id) { return this.backend.get('assessment_keys', id); }

  /** Save an assessment. Students receive questions without answers; keys go to a teacher-only document. */
  async saveAssessment(a, fullQuestions) {
    const id = a.id || randomId('asm_', 12);
    const pub = fullQuestions.map(q => { const s = stripAnswerKey(q); delete s.hint; return clean(s); });
    const keys = {};
    for (const q of fullQuestions) keys[q.id] = clean({ ...splitKey(q), marks: q.marks || 1, misconception_tag: q.misconception_tag || null });
    const doc = { ...a, id: undefined, questions: pub, question_count: pub.length, total_marks: totalMarks(fullQuestions), created_by: a.created_by || this.auth.uid, updated_at: this.backend.serverTime() };
    if (!a.id) doc.created_at = this.backend.serverTime();
    await this.backend.set('assessment_keys', id, { answers: keys, created_by: doc.created_by, class_codes: a.class_codes || [] });
    await this.backend.set('assessments', id, clean(doc), { merge: true });
    await this.audit(a.id ? 'assessment.update' : 'assessment.create', 'assessments/' + id, { title: a.title, status: a.status, questions: pub.length });
    return id;
  }
  async setAssessmentStatus(id, status) { await this.backend.set('assessments', id, { status, updated_at: this.backend.serverTime() }, { merge: true }); await this.audit('assessment.status', 'assessments/' + id, { status }); }

  // ── Practice sessions ───────────────────────────────────────────────────
  async startSession({ mode, chapter_id = null, assessment_id = null, question_count = 0 }) {
    const id = randomId('ses_', 14);
    const doc = { student_uid: this.auth.uid, class_code: this.me.class_code, pseudo_id: this.me.pseudo_id, mode, chapter_id, assessment_id, question_count, status: 'in_progress', started_at: this.backend.serverTime(), last_activity_at: this.backend.serverTime(), client_started_at: Date.now() };
    try { await this.backend.set('sessions', id, doc); } catch (e) { console.warn('Session start not saved yet:', e.message); this._queue('sessions', id, doc); }
    return id;
  }
  async endSession(id, stats) {
    const patch = { ...stats, status: 'completed', ended_at: this.backend.serverTime() };
    try { await this.backend.set('sessions', id, patch, { merge: true }); } catch { this._queue('sessions', id, patch, true); }
  }
  listSessions(where) { return this.backend.query('sessions', where); }

  // ── Responses (with outbox) ─────────────────────────────────────────────
  /** Build a response document in the shared schema (fixes v3 finding 3.1: class_code is always present). */
  buildResponse({ session_id, question, answer, result, behaviour = {}, mode, attempt = 1, assessment_id = null, submission_id = null, student = this.me, studentUid = this.auth?.uid }) {
    const optionType = Array.isArray(question.options) && question.options.length && ['mcq', 'pseudocode', 'debugging', 'code_output', 'truefalse'].includes(question.type);
    return clean({
      schema_version: CONFIG.schemaVersion, source_platform: 'CS_LIFELINE',
      student_uid: studentUid, pseudo_id: student?.pseudo_id || null, class_code: student?.class_code || null, school_id: student?.school_id || null,
      session_id: session_id || null, submission_id, assessment_id, mode, attempt,
      question_id: question.id, question_type: question.type, chapter_id: question.chapter_id || null, subchapter: question.subchapter || null,
      topic: question.topic || null, paper: question.paper || null, difficulty: question.difficulty || null,
      misconception_tag: question.misconception_tag || null,
      answer: answer === undefined ? null : (typeof answer === 'string' ? answer.slice(0, 20000) : answer),
      chosen: optionType && answer !== null && answer !== undefined && answer !== '' ? (question.type === 'truefalse' ? (answer === true || answer === 'true' || answer === 0 ? 0 : 1) : Number(answer)) : null,
      correct: result.correct, score: result.score, max: result.max, needs_manual: !!result.needs_manual,
      misconception_hits: result.misconception_hits || [],
      marking_detail: result.detail || null,
      time_ms: behaviour.time_ms ?? null, first_answer_ms: behaviour.time_to_first_ms ?? null, revisions: behaviour.revisions ?? null,
      hint_used: !!behaviour.hint_used, visibility_interruptions: behaviour.interruptions ?? null, away_ms: behaviour.away_ms ?? null, offline_during: !!behaviour.offline,
      recorded_at: this.backend.serverTime(), client_ts: Date.now(),
      scored_by: result.scored_by || 'client',
      is_synthetic: false,
    });
  }

  async saveResponse(doc) {
    const id = `${doc.session_id || doc.submission_id}__${doc.question_id}__${doc.attempt || 1}`;
    this._queue('responses', id, doc);
    await this.flushOutbox();
    return id;
  }

  _readOutbox() { try { return JSON.parse(localStorage.getItem(OUTBOX_KEY) || '[]'); } catch { return []; } }
  _writeOutbox(list) { try { localStorage.setItem(OUTBOX_KEY, JSON.stringify(list)); } catch { /* storage full */ } this.onOutboxChange && this.onOutboxChange(list.length); }
  _queue(col, id, data, merge = false) {
    const list = this._readOutbox().filter(x => !(x.col === col && x.id === id && !merge));
    // Server timestamps cannot be serialised; they are re-created when sent.
    const serial = JSON.parse(JSON.stringify(data, (k, v) => (v && typeof v === 'object' && v._methodName) ? { __serverTime: true } : v));
    list.push({ col, id, data: serial, merge, queued_at: Date.now() });
    this._writeOutbox(list);
  }
  pendingCount() { return this._readOutbox().length; }

  async flushOutbox() {
    if (this._outboxBusy || !this.backend || !this.auth) return;
    this._outboxBusy = true;
    try {
      let list = this._readOutbox();
      for (const item of [...list]) {
        const data = JSON.parse(JSON.stringify(item.data), (k, v) => (v && v.__serverTime) ? this.backend.serverTime() : v);
        try {
          await Promise.race([this.backend.set(item.col, item.id, data, { merge: item.merge }), new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 8000))]);
          list = list.filter(x => x !== item);
        } catch (e) {
          // A retried create of a document that already reached the server is rejected
          // by the rules (responses cannot be overwritten). Treat an existing document as delivered.
          if (/permission|PERMISSION_DENIED/i.test(e.message || e.code || '')) {
            try { if (await this.backend.get(item.col, item.id)) { list = list.filter(x => x !== item); continue; } } catch { /* keep */ }
          }
          if (e.message === 'timeout' || /offline|unavailable/i.test(e.message)) break;
          console.warn('Outbox item failed:', item.col, item.id, e.message);
        }
      }
      this._writeOutbox(list);
    } finally { this._outboxBusy = false; }
  }

  listMyResponses() { return this.backend.query('responses', [['student_uid', '==', this.auth.uid]]); }
  listResponsesForStudent(uid, classCode) { return this.backend.query('responses', classCode ? [['class_code', '==', classCode], ['student_uid', '==', uid]] : [['student_uid', '==', uid]]); }
  listResponses(classCodes) {
    const codes = [].concat(classCodes || []).filter(Boolean);
    if (!codes.length) return Promise.resolve([]);
    return this.backend.query('responses', [['class_code', 'in', codes]]);
  }

  // ── Assessment submissions ──────────────────────────────────────────────
  draftKey(assessmentId) { return `csl.draft.${this.auth?.uid}.${assessmentId}`; }
  saveDraft(assessmentId, draft) { try { localStorage.setItem(this.draftKey(assessmentId), JSON.stringify({ ...draft, saved_at: Date.now() })); } catch { /* ignore */ } }
  loadDraft(assessmentId) { try { return JSON.parse(localStorage.getItem(this.draftKey(assessmentId)) || 'null'); } catch { return null; } }
  clearDraft(assessmentId) { try { localStorage.removeItem(this.draftKey(assessmentId)); } catch { /* ignore */ } }

  async submitAssessment(assessment, { answers, behaviour, started_at, forced = false }) {
    const id = `${assessment.id}__${this.auth.uid}`;
    const doc = {
      assessment_id: assessment.id, student_uid: this.auth.uid, pseudo_id: this.me.pseudo_id, class_code: this.me.class_code, school_id: this.me.school_id || null,
      answers, behaviour, started_at, submitted_at: this.backend.serverTime(), client_submitted_at: Date.now(), forced, status: 'submitted',
      question_ids: assessment.questions.map(q => q.id), max_score: assessment.total_marks,
    };
    this._queue('submissions', id, doc);
    await this.flushOutbox();
    // Demonstration mode has no server: score immediately, exactly as the Cloud Function would.
    if (this.isDemo) {
      const [a, keys] = await Promise.all([this.backend.get('assessments', assessment.id), this.backend.get('assessment_keys', assessment.id)]);
      const sub = await this.backend.get('submissions', id);
      if (a && keys && sub) await this.scoreSubmission(sub, a, keys, { actor: 'demo-server' });
    }
    this.clearDraft(assessment.id);
    return id;
  }

  getSubmission(id) { return this.backend.get('submissions', id); }
  listMySubmissions() { return this.backend.query('submissions', [['student_uid', '==', this.auth.uid]]); }
  listSubmissions(classCodes) { const codes = [].concat(classCodes || []).filter(Boolean); return codes.length ? this.backend.query('submissions', [['class_code', 'in', codes]]) : Promise.resolve([]); }

  /**
   * Score a submission and write one response per question. Used by the teacher
   * dashboard (when Cloud Functions are not deployed), by the demonstration backend,
   * and mirrored by functions/index.js. Idempotent: response IDs are deterministic.
   */
  async scoreSubmission(sub, assessment, keys, { actor = 'teacher' } = {}) {
    const student = await this.backend.get('users', sub.student_uid) || { class_code: sub.class_code, pseudo_id: sub.pseudo_id };
    const results = {}; let score = 0, max = 0, pending = 0;
    const docs = [];
    for (const q of assessment.questions) {
      const k = keys.answers?.[q.id] || {};
      const full = joinKey(q, k);
      const ans = sub.answers?.[q.id];
      let r = await markResponse(full, ans);
      const manual = sub.manual_marks?.[q.id];
      if (manual !== undefined && manual !== null) r = { ...r, score: Math.min(Number(manual), r.max), correct: Number(manual) >= r.max ? true : Number(manual) <= 0 ? false : null, needs_manual: false, detail: { ...(r.detail || {}), manual: true } };
      if (r.needs_manual) pending++;
      score += r.score || 0; max += r.max;
      results[q.id] = clean({ score: r.score, max: r.max, correct: r.correct, needs_manual: r.needs_manual, explanation: k.explanation || '', correct_answer: q.type === 'coding' || q.type === 'structured' ? null : (k.answer ?? null) });
      const doc = this.buildResponse({ session_id: null, submission_id: sub.id, assessment_id: sub.assessment_id, question: full, answer: ans, result: { ...r, scored_by: actor }, behaviour: sub.behaviour?.[q.id] || {}, mode: 'assessment', student, studentUid: sub.student_uid });
      doc.recorded_at = sub.submitted_at || this.backend.serverTime();
      docs.push({ type: 'set', col: 'responses', id: `${sub.id}__${q.id}__1`, data: doc });
    }
    await this.backend.batch(docs);
    const release = (assessment.release_feedback || 'on_scoring') === 'on_scoring';
    await this.backend.set('submissions', sub.id, { status: pending ? 'needs_marking' : 'scored', score, max_score: max, pending_marking: pending, results, feedback_released: release || !!sub.feedback_released, scored_at: this.backend.serverTime(), scored_by: actor }, { merge: true });
    return { score, max, pending };
  }

  async setManualMark(subId, qid, marks) {
    await this.backend.set('submissions', subId, { manual_marks: { [qid]: Number(marks) } }, { merge: true });
    await this.audit('submission.manual_mark', 'submissions/' + subId, { question_id: qid, marks });
  }

  // ── Misconception reviews (teacher-validated labels, separate from automated output) ─
  listReviews(classCodes) { const c = [].concat(classCodes || []).filter(Boolean); return c.length ? this.backend.query('misconception_reviews', [['class_code', 'in', c]]) : Promise.resolve([]); }
  async saveReview({ student_uid, class_code, misconception_id, decision, note, automated_status, automated_strength }) {
    const id = `${student_uid}__${misconception_id}`;
    await this.backend.set('misconception_reviews', id, { student_uid, class_code, misconception_id, decision, note: note || '', automated_status, automated_strength, reviewer_uid: this.auth.uid, reviewed_at: this.backend.serverTime() });
    await this.audit('misconception.review', 'misconception_reviews/' + id, { decision, automated_status });
  }

  // ── Predictions ─────────────────────────────────────────────────────────
  listPredictions(classCodes) { const c = [].concat(classCodes || []).filter(Boolean); return c.length ? this.backend.query('predictions', [['class_code', 'in', c]]) : Promise.resolve([]); }
  listAllPredictions() { return this.backend.query('predictions'); }
  async importPredictions(list, meta) {
    const ops = list.map(p => ({ type: 'set', col: 'predictions', id: `${p.student_uid}__${p.model_version}__${String(p.predicted_at).slice(0, 10)}`, data: { ...p, imported_at: this.backend.serverTime(), imported_by: this.auth.uid } }));
    await this.backend.batch(ops);
    await this.audit('predictions.import', 'predictions', { count: ops.length, ...meta });
    return ops.length;
  }

  // ── Interventions and assigned practice ────────────────────────────────
  listInterventions(classCodes) { const c = [].concat(classCodes || []).filter(Boolean); return c.length ? this.backend.query('interventions', [['class_code', 'in', c]]) : Promise.resolve([]); }
  async saveIntervention(i) {
    const id = i.id || randomId('int_', 12);
    const { id: _x, ...data } = i;
    const isNew = !i.id;
    await this.backend.set('interventions', id, clean({ ...data, teacher_uid: data.teacher_uid || this.auth.uid, updated_at: this.backend.serverTime(), ...(isNew ? { created_at: this.backend.serverTime() } : {}) }), { merge: true });
    if (isNew && i.action_type === 'targeted_practice' && i.practice_question_ids?.length) {
      await this.backend.set('practice_assignments', 'pa_' + id, { student_uid: i.student_uid, class_code: i.class_code, intervention_id: id, title: i.practice_title || 'Practice set from your teacher', question_ids: i.practice_question_ids, due_at: i.review_date, status: 'assigned', created_by: this.auth.uid, created_at: this.backend.serverTime() });
      await this.notify(i.student_uid, 'practice_assigned', 'Your teacher has set you a practice set.');
    }
    await this.audit(isNew ? 'intervention.create' : 'intervention.update', 'interventions/' + id, { status: i.status, action_type: i.action_type });
    return id;
  }
  listMyAssignments() { return this.backend.query('practice_assignments', [['student_uid', '==', this.auth.uid]]); }
  completeAssignment(id) { return this.backend.set('practice_assignments', id, { status: 'completed', completed_at: this.backend.serverTime() }, { merge: true }); }
  listAssignments(classCodes) { const c = [].concat(classCodes || []).filter(Boolean); return c.length ? this.backend.query('practice_assignments', [['class_code', 'in', c]]) : Promise.resolve([]); }

  // ── Notifications ───────────────────────────────────────────────────────
  async notify(toUid, type, text, link = null) { try { await this.backend.add('notifications', { to_uid: toUid, type, text, link, read: false, created_at: this.backend.serverTime(), from_uid: this.auth?.uid || null }); } catch (e) { console.warn('notify failed', e.message); } }
  listMyNotifications() { return this.backend.query('notifications', [['to_uid', '==', this.auth.uid]]); }
  markNotificationRead(id) { return this.backend.set('notifications', id, { read: true }, { merge: true }); }

  // ── Model registry ──────────────────────────────────────────────────────
  listModels() { return this.backend.query('model_registry'); }
  async saveModel(m) { await this.backend.set('model_registry', m.model_version, { ...m, registered_at: m.registered_at || this.backend.serverTime() }, { merge: true }); await this.audit('model.register', 'model_registry/' + m.model_version, { status: m.status }); }
  async promoteModel(version, reason) {
    const models = await this.listModels();
    const ops = [];
    for (const m of models) if (m.status === 'production' && m.id !== version) ops.push({ type: 'set', col: 'model_registry', id: m.id, data: { status: 'archived', archived_at: this.backend.serverTime() }, merge: true });
    ops.push({ type: 'set', col: 'model_registry', id: version, data: { status: 'production', promoted_at: this.backend.serverTime(), promoted_by: this.auth.uid, promotion_reason: reason }, merge: true });
    await this.backend.batch(ops);
    await this.audit('model.promote', 'model_registry/' + version, { reason, previous: models.filter(m => m.status === 'production').map(m => m.id) });
  }

  // ── Integrations, events and identity ──────────────────────────────────
  listIntegrations() { return this.backend.query('platform_integrations'); }
  async saveIntegration(p) { await this.backend.set('platform_integrations', p.id, { ...p, id: undefined, updated_at: this.backend.serverTime() }, { merge: true }); await this.audit('integration.save', 'platform_integrations/' + p.id, { status: p.status }); }
  listEvents(where = []) { return this.backend.query('learning_events', where); }
  async storeBatch({ platform, raw, accepted, rejected, duplicates, batchMeta }) {
    const batchId = randomId('batch_', 10);
    const ops = [{ type: 'set', col: 'raw_source_records', id: batchId, data: { source_platform: platform, received_at: this.backend.serverTime(), received_by: this.auth.uid, record_count: Array.isArray(raw) ? raw.length : 1, payload: JSON.stringify(raw).slice(0, 900000), ...batchMeta } }];
    for (const e of accepted) ops.push({ type: 'set', col: 'learning_events', id: e.event_id, data: { ...e, provenance: { ...(e.provenance || {}), batch_id: batchId }, received_at: this.backend.serverTime() } });
    await this.backend.batch(ops);
    const prev = (await this.backend.get('platform_integrations', platform)) || {};
    await this.backend.set('platform_integrations', platform, {
      last_import_at: this.backend.serverTime(), records_received: (prev.records_received || 0) + accepted.length + rejected.length + duplicates,
      records_accepted: (prev.records_accepted || 0) + accepted.length, records_rejected: (prev.records_rejected || 0) + rejected.length, duplicates: (prev.duplicates || 0) + duplicates,
      last_errors: rejected.slice(0, 20).map(r => ({ ...r, errors: r.errors || [r.reason] })), schema_version: '1.0',
    }, { merge: true });
    await this.audit('integration.import', 'platform_integrations/' + platform, { batch_id: batchId, accepted: accepted.length, rejected: rejected.length, duplicates });
    return batchId;
  }
  listIdentityMap() { return this.backend.query('learner_identity_map'); }
  async saveIdentityLink({ source_platform, source_learner_id, student_uid, pseudo_id, status, evidence }) {
    const id = `${source_platform}__${source_learner_id}`.replace(/[/]/g, '_');
    await this.backend.set('learner_identity_map', id, { source_platform, source_learner_id, student_uid, pseudo_id, status, evidence: evidence || '', verified_by: this.auth.uid, verified_at: this.backend.serverTime() });
    await this.audit('identity.' + status, 'learner_identity_map/' + id, { source_platform, evidence });
  }

  // ── Consent and data rights ────────────────────────────────────────────
  async setConsent(uid, research_use, note) {
    await this.backend.set('users', uid, { consent: { research_use, recorded_by: this.auth.uid, recorded_at: this.backend.serverTime(), note: note || '' } }, { merge: true });
    await this.audit('consent.update', 'users/' + uid, { research_use });
  }
  /** Delete a learner's learning records (data erasure request). The account itself is removed in Firebase Authentication. */
  async eraseStudentData(uid, reason) {
    const cols = ['responses', 'sessions', 'submissions', 'predictions', 'interventions', 'misconception_reviews', 'practice_assignments', 'notifications'];
    const ops = [];
    for (const col of cols) {
      const field = col === 'notifications' ? 'to_uid' : 'student_uid';
      for (const d of await this.backend.query(col, [[field, '==', uid]])) ops.push({ type: 'delete', col, id: d.id });
    }
    for (const d of await this.backend.query('learner_identity_map', [['student_uid', '==', uid]])) ops.push({ type: 'delete', col: 'learner_identity_map', id: d.id });
    await this.backend.batch(ops);
    await this.backend.set('users', uid, { status: 'erased', display_name: 'Erased learner', email: '', erased_at: this.backend.serverTime() }, { merge: true });
    await this.audit('data.erase', 'users/' + uid, { records_deleted: ops.length, reason });
    return ops.length;
  }

  uploadImage(file) { return this.backend.uploadFile(`question-images/${this.auth.uid}/${Date.now()}_${file.name.replace(/[^\w.-]/g, '_')}`, file); }
}

export const store = new Store();
export { toMs };
