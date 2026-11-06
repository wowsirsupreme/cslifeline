#!/usr/bin/env node
// scripts/synthetic/generate.mjs — synthetic learning data for CS Lifeline.
//
// EVERY record produced here is synthetic (is_synthetic: true, uids prefixed syn_).
// It exists to test the software end to end and to exercise the machine-learning
// pipeline. Results obtained on it say nothing about real learners and must never be
// reported as evidence of predictive accuracy.
//
// Answers are generated in the app's canonical answer format and then MARKED BY THE
// APP'S OWN ENGINE (engine/marking.js), and response documents are built with
// engine/records.js — so the demo, the dashboards and the ML pipeline all see exactly
// the records the real application would store. WOW Sir and DBWOW activity is produced
// in those platforms' NATIVE export formats and converted by the real adapters
// (integration/events.js).
//
// Generative model (per learner)
//   ability        theta ~ N(0, 1)
//   engagement     e ~ Beta(2.2, 1.6): practice frequency and assessment completion
//   misconceptions k ~ Poisson(1.2 + 0.8·max(0, −theta)) taxonomy entries are "held";
//                  a held misconception makes a linked distractor likely (p = 0.6) on any
//                  question that probes it, and fades slowly with practice
//   learning       effective ability grows with practice volume, engagement and time
//   behaviour      response time, hints, revisions; page interruptions are generated
//                  INDEPENDENTLY of correctness (they are context, never evidence)
//   interventions  a teacher targets a held misconception; with p = 0.6 it is resolved
//
// Cohorts
//   H1  Sep–Dec 2025, 4 schools — historical: model training
//   H2  Jan–Apr 2026, 4 schools — historical: temporal hold-out test
//   C   7 Sep 2026 → 5 Nov 2026, 2 schools — current term (demonstration + live prediction)
//
// Usage: node scripts/synthetic/generate.mjs [--seed 2026]

import { writeFileSync, mkdirSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { QUESTION_BANK } from '../../public/data/question-bank.js';
import { normaliseQuestion, stripAnswerKey } from '../../public/js/engine/questions.js';
import { markResponse, splitKey, totalMarks } from '../../public/js/engine/marking.js';
import { buildResponseDoc } from '../../public/js/engine/records.js';
import { targetsOf } from '../../public/js/engine/misconception.js';
import { TAXONOMY } from '../../public/js/engine/taxonomy-data.js';
import { CHAPTERS, EXTERNAL_TOPIC_MAP } from '../../public/js/engine/curriculum.js';
import { fromWowSirSession, fromDbwowProgress, processBatch, linkLearners } from '../../public/js/integration/events.js';
import { clean } from '../../public/js/core/util.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2);
const SEED = Number(args[args.indexOf('--seed') + 1]) || 2026;
const DAY = 86400000, WEEK = 7 * DAY;

// ── Deterministic randomness ─────────────────────────────────────────────────
function mulberry32(a) { return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const rnd = mulberry32(SEED);
const randint = (a, b) => a + Math.floor(rnd() * (b - a + 1));
const choice = (arr) => arr[Math.floor(rnd() * arr.length)];
const sample = (arr, k) => { const a = [...arr]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a.slice(0, k); };
function normal(mu = 0, sd = 1) { let u = 0, v = 0; while (u === 0) u = rnd(); while (v === 0) v = rnd(); return mu + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
function gamma(k) { // Marsaglia–Tsang
  if (k < 1) return gamma(k + 1) * Math.pow(rnd(), 1 / k);
  const d = k - 1 / 3, c = 1 / Math.sqrt(9 * d);
  for (;;) { let x, v; do { x = normal(); v = 1 + c * x; } while (v <= 0); v = v ** 3; const u = rnd(); if (u < 1 - 0.0331 * x ** 4 || Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v; }
}
const beta = (a, b) => { const x = gamma(a), y = gamma(b); return x / (x + y); };
function poisson(lam) { const L = Math.exp(-lam); let k = 0, p = 1; do { k++; p *= rnd(); } while (p > L); return k - 1; }
const sigmoid = (x) => 1 / (1 + Math.exp(-x));
const idAbc = 'abcdefghijkmnpqrstuvwxyz23456789';
const newId = (prefix, n = 10) => prefix + Array.from({ length: n }, () => idAbc[Math.floor(rnd() * idAbc.length)]).join('');
const iso = (ms) => new Date(ms).toISOString();

// ── Reference data from the application itself ───────────────────────────────
const QUESTIONS = QUESTION_BANK.map(q => ({ ...normaliseQuestion(q, { source: q.source }), visibility: 'practice' }));
const Q_BY_CH = new Map();
for (const q of QUESTIONS) { if (!Q_BY_CH.has(q.chapter_id)) Q_BY_CH.set(q.chapter_id, []); Q_BY_CH.get(q.chapter_id).push(q); }
const TAX_IDS = TAXONOMY.map(t => t.id);
const CHAPTER_ORDER = ['T01', 'T08', 'T07', 'T02', 'T09', 'T03', 'T13', 'T04', 'T10', 'T05', 'T12', 'T06', 'T11', 'T14'];
const CHAPTER_DIFF = { T01: 0.0, T02: -0.1, T03: -0.2, T04: -0.1, T05: -0.3, T06: -0.3, T07: 0.2, T08: 0.3, T09: 0.4, T10: 0.5, T11: 0.4, T12: 0.3, T13: 0.1, T14: 0.0 };
// A WOW Sir topic key for each chapter (inverse of the adapter's mapping).
const WOW_TOPIC = {};
for (const [k, ch] of Object.entries(EXTERNAL_TOPIC_MAP.WOW_SIR)) if (!WOW_TOPIC[ch]) WOW_TOPIC[ch] = k;
const DBWOW_KEY = JSON.parse(await (await import('node:fs/promises')).readFile(join(ROOT, 'public/data/integrations/dbwow_quiz_key.json'), 'utf8'));

const FIRST = ['Ama', 'Kofi', 'Esi', 'Kwame', 'Akosua', 'Yaw', 'Efua', 'Kojo', 'Abena', 'Kwabena', 'Adwoa', 'Fiifi', 'Naa', 'Nii', 'Dede', 'Selorm', 'Elikem', 'Mawuli', 'Afia', 'Kwesi',
  'Maya', 'Daniel', 'Grace', 'Samuel', 'Ruth', 'David', 'Sarah', 'Joel', 'Leah', 'Isaac', 'Zara', 'Tunde', 'Chidi', 'Amara', 'Musa', 'Fatima', 'Ibrahim', 'Aisha', 'Omar', 'Lina', 'Noah', 'Ella'];
const LAST_INITIAL = 'ABCDEFGHJKLMNOPQRSTUVWY';
const SCHOOLS = { 'SCH-NB': 'Northbridge Academy (synthetic)', 'SCH-RV': 'Riverside College (synthetic)', 'SCH-HL': 'Hillcrest School (synthetic)', 'SCH-LK': 'Lakeview International (synthetic)' };

// ── Learner model ────────────────────────────────────────────────────────────
let uidCounter = 0;
function makeLearner(school, classCode, grade, cohort) {
  uidCounter++;
  const theta = normal(), engagement = beta(2.2, 1.6);
  const L = { uid: `syn_${cohort.toLowerCase()}_${String(uidCounter).padStart(4, '0')}`, pseudo_id: 'L-' + newId('', 10).toUpperCase(), name: `${choice(FIRST)} ${choice(LAST_INITIAL.split(''))}.`,
    school_id: school, class_code: classCode, grade, cohort, theta, engagement, held: {}, practice_count: 0 };
  for (const m of sample(TAX_IDS, Math.min(poisson(1.2 + 0.8 * Math.max(0, -theta)), TAX_IDS.length))) L.held[m] = true;
  L.held_initial = Object.keys(L.held);
  L.uses_wowsir = rnd() < 0.6;
  L.uses_dbwow = grade >= 10 && rnd() < 0.45;
  L.wowsir_verified = L.uses_wowsir && rnd() < 0.7;
  L.dbwow_verified = L.uses_dbwow && rnd() < 0.8;
  return L;
}

const probes = (q) => [...targetsOf(q).keys()];

/** Produce a canonical answer for question q from learner L, then mark it with the app's engine. */
async function answer(L, q, week, mode) {
  const diff = { 1: -0.8, 2: 0.0, 3: 0.8 }[q.difficulty] ?? 0;
  const eff = L.theta + 0.03 * L.practice_count * (0.5 + L.engagement) + 0.04 * week;
  const pCorrect = sigmoid(1.3 * (eff - diff - (CHAPTER_DIFF[q.chapter_id] || 0)) + 0.6);
  const active = probes(q).filter(m => L.held[m]);
  let correct, tag = null;
  if (active.length && rnd() < 0.6) { correct = false; tag = active[0]; }
  else { correct = rnd() < pCorrect; if (correct && q.difficulty === 1 && rnd() < 0.04) correct = false; }
  const optMis = q.option_misconceptions || {};
  let ans = null;
  const opts = q.options || [];
  switch (q.type) {
    case 'mcq': case 'pseudocode': case 'debugging': case 'code_output':
      if (opts.length) {
        if (correct) ans = q.answer;
        else {
          const linked = Object.entries(optMis).filter(([, t]) => t === tag).map(([i]) => Number(i));
          const others = opts.map((_, i) => i).filter(i => i !== q.answer);
          ans = linked.length ? choice(linked) : choice(others);
        }
      } else {
        const wrongTagged = Object.entries(q.answer_misconceptions || {}).filter(([, t]) => !tag || t === tag).map(([a]) => a);
        ans = correct ? q.answer[0] : (wrongTagged.length && rnd() < 0.7 ? choice(wrongTagged) : choice(['0', '1', '?', 'error', '12']));
      }
      break;
    case 'truefalse': {
      if (correct) ans = q.answer;
      else ans = !q.answer;
      break;
    }
    case 'multi': ans = correct ? [...q.answer] : [q.answer[0], choice(opts.map((_, i) => i).filter(i => !q.answer.includes(i)))].sort(); break;
    case 'short': ans = correct ? q.answer[0] : choice(['?', 'not sure', '0']); break;
    case 'gap': ans = q.answer.map(g => (correct || rnd() < 0.5 ? g[0] : '?')); if (!correct && ans.every((a, i) => a === q.answer[i][0])) ans[0] = '?'; break;
    case 'matching': ans = q.answer.map(p => (correct || rnd() < 0.4 ? p : (p + 1) % q.right.length)); if (!correct && ans.every((a, i) => a === q.answer[i])) ans[0] = (ans[0] + 1) % q.right.length; break;
    case 'ordering': ans = [...q.answer]; if (!correct) { const i = randint(0, ans.length - 2); [ans[i], ans[i + 1]] = [ans[i + 1], ans[i]]; } break;
    case 'trace_table': ans = q.answer.map(r => [...r]); if (!correct) { const r = randint(0, ans.length - 1); ans[r] = ans[r].map(() => '?'); } break;
    case 'coding': ans = correct ? (q.solution || '') : ((q.starter || '') + '\n// unfinished'); break;
    default: ans = 'Synthetic structured answer';
  }
  const result = await markResponse(q, ans);
  const baseMs = ({ 1: 18000, 2: 32000, 3: 55000 }[q.difficulty] || 30000) * (['coding', 'trace_table', 'structured'].includes(q.type) ? 1.6 : 1);
  const time_ms = Math.round(baseMs * Math.exp(normal(0, 0.45)) * (result.correct === false ? 1.15 : 1));
  const interruptions = rnd() < 0.08 ? 1 : 0; // independent of correctness: context only
  const behaviour = { time_ms, time_to_first_ms: Math.round(time_ms * (0.25 + 0.55 * rnd())), revisions: poisson(0.25 + (eff < 0 ? 0.4 : 0)),
    hint_used: mode === 'practice' && rnd() < (eff < 0 ? 0.25 : 0.1), interruptions, away_ms: interruptions ? Math.round(2000 + rnd() * 38000) : 0, offline: rnd() < 0.01 };
  return { ans, result, behaviour, tag };
}

function responseDoc(L, q, a, { session_id = null, submission_id = null, assessment_id = null, mode, at }) {
  const d = buildResponseDoc({ session_id, submission_id, assessment_id, question: q, answer: a.ans, result: { ...a.result, scored_by: mode === 'assessment' ? 'synthetic-server' : 'client' },
    behaviour: a.behaviour, mode, student: L, studentUid: L.uid, timestamp: iso(at), isSynthetic: true });
  d.client_ts = at;
  const id = `${session_id || submission_id}__${q.id}__1`;
  return { id, ...d };
}

// ── One term for one cohort ──────────────────────────────────────────────────
async function runCohort(cohort, start, weeksObserved, classesBySchool, sizeRange, now = null) {
  const out = { classes: [], learners: [], sessions: [], responses: [], assessments: [], keys: [], submissions: [], results: [], interventions: [], wowsir_exports: [], dbwow_exports: [] };
  for (const [sch, list] of Object.entries(classesBySchool)) {
    for (const [code, grade] of list) {
      const cc = cohort === 'C' ? code : `${cohort}-${code}`;
      out.classes.push({ id: cc, name: `Grade ${grade} Computer Science ${code.split('-').pop()}`, school_id: sch, grade, subject: 'CS-0478', cohort, is_synthetic: true });
      for (let i = randint(...sizeRange); i > 0; i--) out.learners.push(makeLearner(sch, cc, grade, cohort));
    }
  }
  // Assessments: week 4 unit quiz, week 8 mid-term test, week 12 end-of-term examination.
  const plan = [[4, 'Unit quiz', 8, CHAPTER_ORDER.slice(0, 4)], [8, 'Mid-term test', 10, CHAPTER_ORDER.slice(0, 8)], [12, 'End-of-term examination', 14, CHAPTER_ORDER]];
  const asmByClass = new Map();
  for (const cl of out.classes) {
    for (const [wk, title, nq, chs] of plan) {
      const pool = chs.flatMap(c => Q_BY_CH.get(c) || []).filter(q => q.type !== 'structured');
      const qs = sample(pool, Math.min(nq, pool.length));
      const id = `asm_${cl.id}_w${wk}`.toLowerCase().replace(/-/g, '_');
      const opens = start + (wk - 1) * WEEK + 2 * DAY;
      if (!asmByClass.has(cl.id)) asmByClass.set(cl.id, []);
      asmByClass.get(cl.id).push({ wk, id, qs, opens });
      const isFuture = now && opens > now;
      out.assessments.push({ id, title, class_codes: [cl.id], week: wk, status: isFuture ? 'draft' : (now && opens + 5 * DAY > now ? 'published' : 'closed'),
        opens_at: iso(opens), closes_at: iso(opens + 5 * DAY), time_limit_min: nq * 2 + 5, instructions: 'Answer every question. You can move between questions before you submit.',
        questions: qs.map(q => { const s = stripAnswerKey(q); delete s.hint; return clean(s); }), question_ids: qs.map(q => q.id), question_count: qs.length, total_marks: totalMarks(qs),
        release_feedback: 'on_scoring', is_synthetic: true, created_at: iso(opens - 3 * DAY) });
      const answers = {}; for (const q of qs) answers[q.id] = clean({ ...splitKey(q), marks: q.marks || 1, misconception_tag: q.misconception_tag || null });
      out.keys.push({ id, answers, class_codes: [cl.id], is_synthetic: true });
    }
  }

  for (const L of out.learners) {
    let sessN = 0;
    for (let week = 1; week <= Math.min(12, weeksObserved); week++) {
      const covered = CHAPTER_ORDER.slice(0, Math.min(CHAPTER_ORDER.length, 2 + week));
      // practice sessions
      for (let s = poisson(0.3 + 1.6 * L.engagement); s > 0; s--) {
        const at0 = start + (week - 1) * WEEK + randint(0, 6) * DAY + randint(14, 20) * 3600000 + randint(0, 59) * 60000;
        if (now && at0 > now) continue;
        const ch = rnd() < 0.7 ? choice(covered.slice(-4)) : choice(covered);
        const pool = (Q_BY_CH.get(ch) || []).filter(q => q.type !== 'structured');
        if (!pool.length) continue;
        const qs = sample(pool, Math.min(pool.length, randint(4, 8)));
        const sid = `ses_${L.uid}_${sessN++}`;
        let t = at0, nCorrect = 0;
        // ~6% of sessions are abandoned part-way (engagement-dependent)
        const abandonAt = rnd() < 0.12 * (1 - L.engagement) ? randint(1, qs.length - 1) : null;
        let answered = 0;
        for (const q of qs) {
          if (abandonAt !== null && answered >= abandonAt) break;
          const a = await answer(L, q, week, 'practice');
          t += a.behaviour.time_ms + 4000;
          out.responses.push(responseDoc(L, q, a, { session_id: sid, mode: 'practice', at: t }));
          if (a.result.correct) nCorrect++;
          answered++;
          for (const m of probes(q)) if (L.held[m] && rnd() < 0.05 * (0.5 + L.engagement)) L.held[m] = false;
        }
        L.practice_count++;
        out.sessions.push({ id: sid, student_uid: L.uid, class_code: L.class_code, pseudo_id: L.pseudo_id, mode: 'practice', chapter_id: ch, question_count: qs.length, answered,
          correct_count: nCorrect, status: abandonAt === null ? 'completed' : 'in_progress', started_at: iso(at0), ...(abandonAt === null ? { ended_at: iso(t) } : {}), last_activity_at: iso(t), is_synthetic: true });
      }
      // WOW Sir live quiz in class (separate platform; guest players identified per session only)
      if (L.uses_wowsir && rnd() < 0.55) {
        const at = start + (week - 1) * WEEK + randint(0, 4) * DAY + 10 * 3600000;
        if (!(now && at > now)) {
          const key = `wow_${L.class_code}_${week}`.toLowerCase();
          let exp = out.wowsir_exports.find(e => e.meta.id === key);
          if (!exp) {
            const qs = Array.from({ length: 6 }, (_, i) => { const ch = choice(covered); const q = choice((Q_BY_CH.get(ch) || []).filter(x => x.type === 'mcq')) || choice(Q_BY_CH.get('T01')); return { q, ch, i }; });
            exp = { meta: { id: key, quizId: `quiz_${key}`, quizTitle: `Week ${week} live quiz`, teacherId: 'syn_wowsir_teacher', code: newId('', 6).toUpperCase(), status: 'ended', startedAt: at, totalQ: qs.length },
              questions: qs.map(({ q, ch }, i) => ({ id: `wq_${key}_${i}`, topicKey: WOW_TOPIC[ch] || 'gr9-data-rep', type: 'mcq', text: q.text, options: q.options, answer: String(q.answer), _q: q })), players: {} };
            out.wowsir_exports.push(exp);
          }
          const pid = 'p_' + L.uid.slice(-4) + '_' + week;
          const answers = {};
          for (let i = 0; i < exp.questions.length; i++) {
            const a = await answer(L, exp.questions[i]._q, week, 'live');
            answers[i] = { choice: String(a.ans), correct: a.result.correct === true, timeMs: Math.round(a.behaviour.time_ms / 2) };
          }
          exp.players[pid] = { id: pid, name: L.name, avatarId: randint(0, 11), score: 0, correct: Object.values(answers).filter(x => x.correct).length, total: exp.questions.length,
            tabSwitches: 0, answers, _uid: L.uid };
        }
      }
      // assessments
      for (const { wk, id, qs, opens } of asmByClass.get(L.class_code) || []) {
        if (wk !== week) continue;
        const subAt = opens + randint(0, 4) * DAY + randint(8, 20) * 3600000;
        if (now && subAt > now) continue;
        if (rnd() > 0.55 + 0.45 * L.engagement) continue; // did not sit it
        const subId = `${id}__${L.uid}`;
        const answers = {}, beh = {}, results = {};
        let score = 0, max = 0;
        for (const q of qs) {
          const a = await answer(L, q, week, 'assessment');
          answers[q.id] = a.ans; beh[q.id] = a.behaviour;
          score += a.result.score || 0; max += a.result.max;
          results[q.id] = clean({ score: a.result.score, max: a.result.max, correct: a.result.correct, needs_manual: a.result.needs_manual, explanation: q.explanation || '', correct_answer: q.type === 'coding' ? null : q.answer });
          out.responses.push(responseDoc(L, q, a, { submission_id: subId, assessment_id: id, mode: 'assessment', at: subAt }));
        }
        out.submissions.push({ id: subId, assessment_id: id, student_uid: L.uid, pseudo_id: L.pseudo_id, class_code: L.class_code, school_id: L.school_id, answers, behaviour: beh,
          started_at: iso(subAt - 25 * 60000), submitted_at: iso(subAt), status: 'scored', scored_at: iso(subAt + 5 * 60000), scored_by: 'synthetic-server', question_ids: qs.map(q => q.id), max_score: max, forced: false, is_synthetic: true, week: wk });
        out.results.push({ id: subId, assessment_id: id, student_uid: L.uid, class_code: L.class_code, score: Math.round(score * 100) / 100, max_score: max, pending_marking: 0, results, manual_marks: {},
          released: true, scored_at: iso(subAt + 5 * 60000), scored_by: 'synthetic-server', is_synthetic: true });
      }
      // a teacher intervention between weeks 5 and 7
      if ([5, 6, 7].includes(week) && rnd() < 0.18) {
        const held = Object.keys(L.held).filter(m => L.held[m]);
        if (held.length) {
          const m = choice(held); const tax = TAXONOMY.find(x => x.id === m);
          const at = start + (week - 1) * WEEK + randint(0, 4) * DAY + 9 * 3600000;
          if (!(now && at > now)) {
            const resolved = rnd() < 0.6;
            if (resolved) { L.held[m] = false; L.theta += 0.1; }
            out.interventions.push({ id: `int_${L.uid}_${week}`, student_uid: L.uid, pseudo_id: L.pseudo_id, class_code: L.class_code, target: { type: 'misconception', id: m, label: tax?.name || m },
              title: `${tax?.name || m} — ${L.name}`, reason: 'Repeated answers matching this misconception (synthetic scenario).', action_type: choice(['targeted_practice', 'reteach', 'conversation', 'external']),
              started_at: iso(at), created_at: iso(at), review_date: iso(at + 14 * DAY), status: now && at + 14 * DAY < now ? 'completed' : 'active', observations: [],
              teacher_uid: L.school_id === 'SCH-RV' ? 'syn_teacher_rv' : 'syn_teacher_nb', resolved_in_simulation: resolved, is_synthetic: true });
          }
        }
      }
    }
    // DBWOW Learning Centre progress snapshot (Databases topic), in DBWOW's own format
    // DBWOW stores no answer times, so a scheduled sync takes a progress snapshot every 4 weeks;
    // an answer's time is "first seen in a snapshot" (time_precision 'snapshot').
    if (L.uses_dbwow) {
      const answered = []; // [week, key, choice]
      const topics = Object.entries(DBWOW_KEY.topics);
      for (const [tid, t] of sample(topics, randint(3, 8))) {
        const wk = randint(1, 12);
        t.quiz.forEach((item, k) => {
          const p = sigmoid(1.2 * (L.theta + 0.04 * wk) + 0.5);
          answered.push([wk, `${tid}:${k}`, rnd() < p ? item.answer : choice(item.options.map((_, i) => i).filter(i => i !== item.answer))]);
        });
      }
      const nSteps = randint(0, 9);
      for (const snapWeek of [4, 8, 12]) {
        const snapAt = start + snapWeek * WEEK - DAY;
        if (snapWeek > weeksObserved || (now && snapAt > now)) break;
        const quizzes = Object.fromEntries(answered.filter(a => a[0] <= snapWeek).map(a => [a[1], a[2]]));
        const steps = {}; for (let i = 0; i < Math.round(nSteps * snapWeek / 12); i++) steps[`schooldb:${i}`] = true;
        out.dbwow_exports.push({ uid: `dbw_${L.uid.slice(-6)}`, exported_at: iso(snapAt), progress: JSON.stringify({ quizzes, steps, achievements: {}, events: {} }), _uid: L.uid });
      }
    }
    L.held_final = Object.keys(L.held).filter(m => L.held[m]);
  }
  return out;
}

/** Run each platform export through the real adapters; build the identity map from verified links only. */
function integrate(cohortOut) {
  const raw = [], identity = [];
  for (const exp of cohortOut.wowsir_exports) {
    const clean_ = { meta: exp.meta, questions: exp.questions.map(({ _q, ...q }) => q), players: Object.fromEntries(Object.entries(exp.players).map(([k, { _uid, ...p }]) => [k, p])) };
    const { events } = fromWowSirSession(clean_, { isSynthetic: true });
    raw.push(...events);
    for (const [pid, p] of Object.entries(exp.players)) {
      const L = cohortOut.learners.find(x => x.uid === p._uid);
      identity.push({ source_platform: 'WOW_SIR', source_learner_id: `${exp.meta.id}:${pid}`, student_uid: L.uid, pseudo_id: L.pseudo_id, class_code: L.class_code,
        status: L.wowsir_verified ? 'verified' : 'unverified', evidence: L.wowsir_verified ? 'Teacher confirmed in class register (synthetic)' : 'Name match only — not linked', is_synthetic: true });
    }
  }
  const seenDb = new Set();
  for (const exp of cohortOut.dbwow_exports) { // chronological per learner: processBatch keeps the first (earliest) copy of each answer
    const { _uid, ...e } = exp;
    raw.push(...fromDbwowProgress(e, DBWOW_KEY, { isSynthetic: true }).events);
    if (seenDb.has(e.uid)) continue; seenDb.add(e.uid);
    const L = cohortOut.learners.find(x => x.uid === _uid);
    identity.push({ source_platform: 'DBWOW', source_learner_id: `dbwow:${e.uid}`, student_uid: L.uid, pseudo_id: L.pseudo_id, class_code: L.class_code,
      status: L.dbwow_verified ? 'verified' : 'unverified', evidence: L.dbwow_verified ? 'Learner confirmed account link at school (synthetic)' : 'Unconfirmed', is_synthetic: true });
  }
  const { accepted, rejected, duplicates } = processBatch(raw);
  const linked = linkLearners(accepted, identity);
  return { events: linked, rejected, duplicates, identity };
}

// ── CSV helpers ──────────────────────────────────────────────────────────────
const csvCell = (v) => { if (v === null || v === undefined) return ''; const s = Array.isArray(v) ? v.join(';') : typeof v === 'object' ? JSON.stringify(v) : String(v); return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
function toCSV(rows, cols) { return cols.join(',') + '\n' + rows.map(r => cols.map(c => csvCell(r[c])).join(',')).join('\n') + '\n'; }
function writeGz(path, text) { writeFileSync(path, gzipSync(Buffer.from(text, 'utf8'), { level: 9 })); }

// ── Main ─────────────────────────────────────────────────────────────────────
const histClasses = {
  'SCH-NB': [['NB-9A', 9], ['NB-10A', 10], ['NB-10B', 10], ['NB-11A', 11]], 'SCH-RV': [['RV-9B', 9], ['RV-10C', 10], ['RV-11A', 11]],
  'SCH-HL': [['HL-9A', 9], ['HL-10A', 10], ['HL-11B', 11]], 'SCH-LK': [['LK-10A', 10], ['LK-10B', 10], ['LK-11A', 11]],
};
const CURRENT_START = Date.UTC(2026, 8, 7), CURRENT_NOW = Date.UTC(2026, 10, 5, 12);
const weeksNow = Math.floor((CURRENT_NOW - CURRENT_START) / WEEK) + 1;
console.log('Generating synthetic cohorts (seed', SEED + ')…');
const H1 = await runCohort('H1', Date.UTC(2025, 8, 8), 12, histClasses, [18, 26]);
const H2 = await runCohort('H2', Date.UTC(2026, 0, 12), 12, histClasses, [18, 26]);
const C = await runCohort('C', CURRENT_START, weeksNow, { 'SCH-NB': [['NB-9A', 9], ['NB-10A', 10], ['NB-10B', 10]], 'SCH-RV': [['RV-9B', 9], ['RV-11A', 11]] }, [16, 20], CURRENT_NOW);
const cohorts = { H1, H2, C };
const integ = Object.fromEntries(Object.entries(cohorts).map(([k, v]) => [k, integrate(v)]));

// 1) ML training files (all cohorts)
const OUT = join(ROOT, 'ml/data/synthetic'); mkdirSync(OUT, { recursive: true });
const learnersRows = Object.entries(cohorts).flatMap(([k, c]) => c.learners.map(L => ({ uid: L.uid, pseudo_id: L.pseudo_id, cohort: k, school_id: L.school_id, class_code: L.class_code, grade: L.grade,
  uses_wowsir: L.uses_wowsir, uses_dbwow: L.uses_dbwow, wowsir_verified: L.wowsir_verified, dbwow_verified: L.dbwow_verified, is_synthetic: true })));
writeFileSync(join(OUT, 'learners.csv'), toCSV(learnersRows, Object.keys(learnersRows[0])));
const truthRows = Object.entries(cohorts).flatMap(([k, c]) => c.learners.map(L => ({ uid: L.uid, cohort: k, theta: L.theta.toFixed(4), engagement: L.engagement.toFixed(4), held_initial: L.held_initial, held_final: L.held_final })));
writeFileSync(join(OUT, 'ground_truth.csv'), toCSV(truthRows, Object.keys(truthRows[0])));
const RESP_COLS = ['id', 'cohort', 'student_uid', 'pseudo_id', 'class_code', 'school_id', 'session_id', 'submission_id', 'assessment_id', 'mode', 'question_id', 'question_type', 'chapter_id', 'difficulty',
  'misconception_tag', 'misconception_hits', 'chosen', 'correct', 'score', 'max', 'needs_manual', 'time_ms', 'first_answer_ms', 'revisions', 'hint_used', 'visibility_interruptions', 'away_ms', 'recorded_at', 'is_synthetic'];
writeGz(join(OUT, 'responses.csv.gz'), toCSV(Object.entries(cohorts).flatMap(([k, c]) => c.responses.map(r => ({ ...r, cohort: k }))), RESP_COLS));
const SES_COLS = ['id', 'cohort', 'student_uid', 'class_code', 'mode', 'chapter_id', 'question_count', 'answered', 'correct_count', 'status', 'started_at', 'ended_at', 'is_synthetic'];
writeGz(join(OUT, 'sessions.csv.gz'), toCSV(Object.entries(cohorts).flatMap(([k, c]) => c.sessions.map(s => ({ ...s, cohort: k }))), SES_COLS));
const EV_COLS = ['event_id', 'cohort', 'source_platform', 'source_learner_id', 'learner_id', 'linkage', 'event_type', 'chapter_id', 'question_id', 'correct', 'duration_ms', 'misconception_tags', 'time_precision', 'occurred_at', 'is_synthetic'];
writeGz(join(OUT, 'learning_events.csv.gz'), toCSV(Object.entries(integ).flatMap(([k, x]) => x.events.map(e => ({ ...e, cohort: k }))), EV_COLS));
const idRows = Object.entries(integ).flatMap(([k, x]) => x.identity.map(i => ({ ...i, cohort: k })));
writeFileSync(join(OUT, 'identity_map.csv'), toCSV(idRows, ['cohort', 'source_platform', 'source_learner_id', 'student_uid', 'pseudo_id', 'class_code', 'status', 'evidence', 'is_synthetic']));
const ivRows = Object.entries(cohorts).flatMap(([k, c]) => c.interventions.map(i => ({ ...i, cohort: k, target_id: i.target.id })));
writeFileSync(join(OUT, 'interventions.csv'), toCSV(ivRows, ['id', 'cohort', 'student_uid', 'class_code', 'target_id', 'action_type', 'started_at', 'review_date', 'status', 'resolved_in_simulation', 'is_synthetic']));
writeFileSync(join(OUT, 'README.md'), `# Synthetic data (generated — do not edit)

Produced by \`node scripts/synthetic/generate.mjs --seed ${SEED}\` on ${new Date().toISOString().slice(0, 10)}.
EVERY row is synthetic (uids start with \`syn_\`, \`is_synthetic = true\`). It exists to test software and
exercise the ML pipeline. Metrics computed on it are NOT evidence about real learners.

| File | Rows | Content |
|---|---|---|
| learners.csv | ${learnersRows.length} | one row per synthetic learner, cohort H1 / H2 / C |
| ground_truth.csv | ${truthRows.length} | simulated latent ability, engagement and held misconceptions (for evaluating the misconception engine — never a model feature) |
| responses.csv.gz | ${Object.values(cohorts).reduce((a, c) => a + c.responses.length, 0)} | canonical response records, marked by the application's marking engine |
| sessions.csv.gz | ${Object.values(cohorts).reduce((a, c) => a + c.sessions.length, 0)} | practice sessions |
| learning_events.csv.gz | ${Object.values(integ).reduce((a, x) => a + x.events.length, 0)} | WOW Sir and DBWOW activity converted by the real adapters (\`linkage\` shows whether the learner link is verified) |
| identity_map.csv | ${idRows.length} | cross-platform identity links (only \`verified\` links are used) |
| interventions.csv | ${ivRows.length} | simulated teacher interventions |

See docs/DATA_DICTIONARY.md for every column.
`);

// 2) Demonstration dataset (current cohort only)
const nowIso = iso(CURRENT_NOW);
const T = { nb: 'syn_teacher_nb', rv: 'syn_teacher_rv', admin: 'syn_admin', pending: 'syn_teacher_pending' };
const classes = C.classes.map(c => ({ ...c, teacher_uids: [c.school_id === 'SCH-RV' ? T.rv : T.nb], join_open: true, created_at: iso(CURRENT_START - 7 * DAY) }));
// pick three demo student logins in NB-10A: strongest, weakest, and median by simulated ability
const nb10 = C.learners.filter(L => L.class_code === 'NB-10A').sort((a, b) => a.theta - b.theta);
const demoStudents = new Set([nb10[0]?.uid, nb10[Math.floor(nb10.length / 2)]?.uid, nb10[nb10.length - 1]?.uid].filter(Boolean));
const users = [
  { id: T.admin, role: 'admin', status: 'active', display_name: 'Platform Administrator (demo)', email: 'admin@demo.cslifeline.app', school_id: null, demo_login: true, is_synthetic: true, created_at: iso(CURRENT_START - 30 * DAY) },
  { id: T.nb, role: 'teacher', status: 'active', display_name: 'Ms Adjoa Mensah (demo teacher)', email: 'teacher@demo.cslifeline.app', school_id: 'SCH-NB', class_codes: classes.filter(c => c.school_id === 'SCH-NB').map(c => c.id), demo_login: true, is_synthetic: true, created_at: iso(CURRENT_START - 20 * DAY) },
  { id: T.rv, role: 'teacher', status: 'active', display_name: 'Mr Kwesi Boateng (demo teacher)', email: 'teacher2@demo.cslifeline.app', school_id: 'SCH-RV', class_codes: classes.filter(c => c.school_id === 'SCH-RV').map(c => c.id), demo_login: true, is_synthetic: true, created_at: iso(CURRENT_START - 20 * DAY) },
  { id: T.pending, role: 'teacher_pending', status: 'pending', display_name: 'New Teacher (awaiting approval)', email: 'newteacher@demo.cslifeline.app', school_id: null, class_codes: [], is_synthetic: true, created_at: iso(CURRENT_NOW - 2 * DAY) },
  ...C.learners.map(L => ({ id: L.uid, role: 'student', status: 'active', display_name: L.name, email: demoStudents.has(L.uid) ? `${L.name.split(' ')[0].toLowerCase()}.${L.uid.slice(-4)}@demo.cslifeline.app` : '',
    class_code: L.class_code, school_id: L.school_id, grade: L.grade, pseudo_id: L.pseudo_id, consent: { research_use: rnd() < 0.8 ? 'granted' : 'not_recorded' }, demo_login: demoStudents.has(L.uid) || undefined,
    is_synthetic: true, created_at: iso(CURRENT_START + randint(0, 6) * DAY), last_seen: C.responses.filter(r => r.student_uid === L.uid).map(r => r.recorded_at).sort().pop() || null })),
].map(clean);
// An assessment that is open now, so a demo student can take one.
const openQs = sample(['T08', 'T09', 'T10'].flatMap(c => Q_BY_CH.get(c) || []).filter(q => ['mcq', 'truefalse', 'code_output', 'trace_table', 'multi', 'coding'].includes(q.type)), 8);
const openAsm = { id: 'asm_nb_10a_week9_check', title: 'Week 9 check: arrays and loops', class_codes: ['NB-10A', 'NB-10B'], status: 'published', opens_at: iso(CURRENT_NOW - DAY), closes_at: iso(CURRENT_NOW + 9 * DAY),
  time_limit_min: 25, instructions: 'Eight questions on programming, arrays and file handling. Your answers save on this device as you go.', questions: openQs.map(q => { const s = stripAnswerKey(q); delete s.hint; return clean(s); }),
  question_ids: openQs.map(q => q.id), question_count: openQs.length, total_marks: totalMarks(openQs), release_feedback: 'on_scoring', created_by: T.nb, created_at: iso(CURRENT_NOW - 2 * DAY), is_synthetic: true };
const openKey = { id: openAsm.id, answers: Object.fromEntries(openQs.map(q => [q.id, clean({ ...splitKey(q), marks: q.marks || 1, misconception_tag: q.misconception_tag || null })])), class_codes: openAsm.class_codes, created_by: T.nb, is_synthetic: true };
const assessments = [...C.assessments.map(a => ({ ...a, created_by: a.class_codes[0].startsWith('RV') ? T.rv : T.nb })), openAsm];
const keys = [...C.keys.map(k => ({ ...k, created_by: k.class_codes[0].startsWith('RV') ? T.rv : T.nb })), openKey];
const integC = integ.C;
const integrations = [
  { id: 'WOW_SIR', name: 'WOW Sir', adapter: 'wowsir-session', status: 'test_data', connection: 'Batch import of session exports (synthetic in this demonstration). Not connected to the live WOW Sir database.',
    schema_version: '1.0', records_received: integC.events.filter(e => e.source_platform === 'WOW_SIR').length, records_accepted: integC.events.filter(e => e.source_platform === 'WOW_SIR').length, records_rejected: 0, duplicates: 0, last_import_at: nowIso, is_synthetic: true },
  { id: 'DBWOW', name: 'DBWOW', adapter: 'dbwow-progress', status: 'test_data', connection: 'Batch import of Learning Centre progress exports (synthetic in this demonstration). Not connected to the live DBWOW database.',
    schema_version: '1.0', records_received: integC.events.filter(e => e.source_platform === 'DBWOW').length + integC.rejected.length, records_accepted: integC.events.filter(e => e.source_platform === 'DBWOW').length, records_rejected: integC.rejected.length,
    duplicates: integC.duplicates, last_errors: integC.rejected.slice(0, 10), last_import_at: nowIso, is_synthetic: true },
];
const identity = integC.identity.map(i => ({ ...i, id: `${i.source_platform}__${i.source_learner_id}`.replace(/[/]/g, '_'), verified_by: i.status === 'verified' ? T.nb : null, verified_at: i.status === 'verified' ? nowIso : null }));
const notifications = C.interventions.filter(i => i.action_type === 'targeted_practice').map(i => ({ id: `ntf_${i.id}`, to_uid: i.student_uid, type: 'practice_assigned', text: 'Your teacher has set you a practice set.', read: false, created_at: i.created_at, from_uid: i.teacher_uid, is_synthetic: true }));
const assignments = C.interventions.filter(i => i.action_type === 'targeted_practice').map(i => {
  const qids = sample((Q_BY_CH.get(TAXONOMY.find(t => t.id === i.target.id)?.chapter_id) || QUESTIONS).filter(q => q.type !== 'structured' && q.type !== 'coding').map(q => q.id), 5);
  return { id: 'pa_' + i.id, student_uid: i.student_uid, class_code: i.class_code, intervention_id: i.id, title: `Practice: ${i.target.label}`, question_ids: qids, due_at: i.review_date, status: rnd() < 0.5 ? 'completed' : 'assigned', created_by: i.teacher_uid, created_at: i.created_at, is_synthetic: true };
});
for (const i of C.interventions) if (i.action_type === 'targeted_practice') i.practice_question_ids = assignments.find(a => a.intervention_id === i.id)?.question_ids || [];
const audit = [
  { id: 'aud_0001', actor_uid: T.admin, actor_role: 'admin', action: 'user.update', target: 'users/' + T.nb, details: { changes: { role: { from: 'teacher_pending', to: 'teacher' } }, reason: 'Approved as Northbridge CS teacher (synthetic)' }, at: iso(CURRENT_START - 19 * DAY) },
  { id: 'aud_0002', actor_uid: T.admin, actor_role: 'admin', action: 'user.update', target: 'users/' + T.rv, details: { changes: { role: { from: 'teacher_pending', to: 'teacher' } }, reason: 'Approved as Riverside CS teacher (synthetic)' }, at: iso(CURRENT_START - 19 * DAY) },
  ...classes.map((c, i) => ({ id: 'aud_c' + i, actor_uid: T.admin, actor_role: 'admin', action: 'class.save', target: 'classes/' + c.id, details: { name: c.name, join_open: true }, at: c.created_at })),
  { id: 'aud_0003', actor_uid: T.admin, actor_role: 'admin', action: 'integration.import', target: 'platform_integrations/WOW_SIR', details: { accepted: integrations[0].records_accepted, rejected: 0 }, at: nowIso },
];

const dataset = {
  meta: { generator: 'scripts/synthetic/generate.mjs', seed: SEED, generated_at: new Date().toISOString(), as_of: nowIso, schema_version: '2.0',
    note: 'Every record is synthetic. Timestamps are shifted at load time so that "as_of" is the moment the demonstration is opened.' },
  collections: {
    schools: Object.entries(SCHOOLS).filter(([id]) => ['SCH-NB', 'SCH-RV'].includes(id)).map(([id, name]) => ({ id, name, country: 'Ghana', is_synthetic: true })),
    classes, users,
    settings: [{ id: 'platform', risk_thresholds: { moderate: 0.35, high: 0.6 }, capture_interruptions: true, retention_days: 730, research_export_requires_consent: true, allow_student_self_registration: true, release_feedback_default: 'on_scoring' }],
    sessions: C.sessions, responses: C.responses.map(r => clean(r)), assessments, assessment_keys: keys, submissions: C.submissions, submission_results: C.results,
    interventions: C.interventions.map(({ resolved_in_simulation, ...i }) => i), practice_assignments: assignments, notifications,
    misconception_reviews: [], predictions: [], model_registry: [],
    platform_integrations: integrations, learning_events: integC.events.map(e => ({ ...e, id: e.event_id })), learner_identity_map: identity, audit_logs: audit,
  },
};
const DEMO = join(ROOT, 'public/data/demo'); mkdirSync(DEMO, { recursive: true });
writeFileSync(join(DEMO, 'demo_dataset.json'), JSON.stringify(dataset));

// 3) Reference exports for the Python pipeline (generated from the app's own modules)
const REF = join(ROOT, 'ml/data/reference'); mkdirSync(REF, { recursive: true });
writeFileSync(join(REF, 'question_bank.json'), JSON.stringify(QUESTIONS, null, 1));
writeFileSync(join(REF, 'taxonomy.json'), JSON.stringify({ entries: TAXONOMY }, null, 1));
writeFileSync(join(REF, 'curriculum.json'), JSON.stringify({ chapters: CHAPTERS }, null, 1));

const sum = (k) => Object.fromEntries(Object.entries(cohorts).map(([c, v]) => [c, v[k].length]));
console.log('learners', sum('learners'), '\nresponses', sum('responses'), '\nsubmissions', sum('submissions'), '\ninterventions', sum('interventions'));
console.log('events', Object.fromEntries(Object.entries(integ).map(([k, x]) => [k, x.events.length])), 'rejected', Object.fromEntries(Object.entries(integ).map(([k, x]) => [k, x.rejected.length])));
console.log('demo dataset', (JSON.stringify(dataset).length / 1e6).toFixed(2), 'MB');
