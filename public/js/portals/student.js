// Student portal. Welcoming and simple; never shows risk predictions, teacher labels or other
// students' data. Feedback explains ideas; misconception evidence is turned into "ideas worth
// revisiting", without statuses or strength scores.

import { startPortal } from '../ui/shell.js';
import { h, mount, clear, btn, badge, tile, card, cardHead, callout, empty, pageHead, barRow, chart, palette, modal, confirmDialog, toast, errorToast, select, field, input, tabs, dataTable, fmtPct, fmtDate, rel, icon } from '../ui/kit.js';
import { renderQuestion, feedbackBox, isAnswered, questionMeta } from '../ui/question-view.js';
import { builtInQuestions, allQuestions, indexById, normResponses } from '../app/data.js';
import { CHAPTERS, CHAPTER_IDS, chapterTitle } from '../engine/curriculum.js';
import { markResponse } from '../engine/marking.js';
import { studentSummary, weeklyTrend } from '../engine/analytics.js';
import { detectForStudent, targetsOf } from '../engine/misconception.js';
import { TAXONOMY } from '../engine/taxonomy-data.js';
import { BehaviourCapture } from '../engine/behaviour.js';
import { runPseudocode } from '../engine/pseudocode/interpreter.js';
import { TUTORIALS } from '../../data/tutorials.js';
import { seededShuffle, hash32, shuffle, toMs, fmtDuration } from '../core/util.js';

const TAX = new Map(TAXONOMY.map(t => [t.id, t]));
let practiceState = null; // survives navigation inside the practice route

// Taxonomy descriptions are written for teachers ("The learner believes…"); students see a non-labelling version.
function forStudents(text = '') {
  return String(text).replace(/^The learner /, 'A common mistake: a student ');
}

startPortal({
  portal: 'student', allow: ['student'],
  nav: [
    { items: [{ path: '/', label: 'Home', ic: 'home' }, { path: '/assessments', label: 'Assessments', ic: 'clipboard', badge: async ({ store }) => (await openAssessments(store)).filter(a => !a.submitted).length },
      { path: '/assigned', label: 'Set by your teacher', ic: 'flag', badge: async ({ store }) => (await store.listMyAssignments()).filter(a => a.status !== 'completed').length },
      { path: '/practice', label: 'Practice', ic: 'target' }, { path: '/challenge', label: 'Daily challenge', ic: 'clock' }, { path: '/progress', label: 'My progress', ic: 'chart' }] },
    { group: 'Programming', items: [{ path: '/editor', label: 'Pseudocode editor', ic: 'code' }, { path: '/tutorials', label: 'Tutorials', ic: 'book' }] },
    { group: 'Account', items: [{ path: '/account', label: 'Account and privacy', ic: 'user' }] },
  ],
  routes: [
    { path: '/', view: home }, { path: '/practice', view: practiceStart }, { path: '/practice/run', view: practiceRun },
    { path: '/assessments', view: assessmentsList }, { path: '/assessment/:id', view: assessmentTake }, { path: '/result/:id', view: assessmentResult },
    { path: '/assigned', view: assignedList }, { path: '/challenge', view: challenge }, { path: '/progress', view: progress },
    { path: '/editor', view: editor }, { path: '/tutorials', view: tutorials }, { path: '/account', view: account },
  ],
});

async function myData(store) {
  const [responses, sessions] = await Promise.all([store.listMyResponses().then(normResponses), store.listSessions([['student_uid', '==', store.auth.uid]]).catch(() => [])]);
  return { responses, sessions };
}
async function openAssessments(store) {
  const [list, subs] = await Promise.all([store.listAssessments(), store.listMySubmissions()]);
  const mine = new Map(subs.map(s => [s.assessment_id, s]));
  return list.filter(a => a.status === 'published' || mine.has(a.id)).map(a => ({ ...a, submission: mine.get(a.id) || null, submitted: mine.has(a.id) }));
}

/** Ideas worth revisiting: misconception engine on the student's own answers, phrased as learning advice. */
function revisitIdeas(responses, qIndex) {
  return detectForStudent(responses, qIndex).filter(f => ['demonstrated', 'possible', 'knowledge_gap'].includes(f.status) && f.trend !== 'improving').slice(0, 4)
    .map(f => ({ ...f, entry: TAX.get(f.misconception_id) })).filter(x => x.entry);
}

// ── Home ────────────────────────────────────────────────────────────────
async function home({ store, navigate }) {
  const qs = builtInQuestions(); const qIndex = indexById(await allQuestions(store));
  const [{ responses, sessions }, assess, assigned] = await Promise.all([myData(store), openAssessments(store), store.listMyAssignments().catch(() => [])]);
  const s = studentSummary(responses, sessions);
  const ideas = revisitIdeas(responses, qIndex);
  const due = assess.filter(a => !a.submitted);
  const todo = assigned.filter(a => a.status !== 'completed');
  return h('div', pageHead(`Hello, ${store.me.display_name.split(' ')[0]}`, `Class ${store.me.class_code}`),
    h('div.grid-tiles', tile('Questions answered', s.marked), tile('Accuracy', fmtPct(s.accuracy), s.marked ? `from ${s.marked} marked answers` : 'answer a few questions to see this'),
      tile('Active days', s.active_days_28, 'in the last 4 weeks'), tile('Chapters practised', Object.values(s.chapters).filter(c => c.n).length, `of ${CHAPTER_IDS.length}`)),
    h('div.grid-2',
      card(cardHead('To do'), due.length || todo.length ? h('div.stack',
        ...due.map(a => h('div.row.between', h('div', h('strong', a.title), h('div.small.muted', `${a.question_count} questions${a.time_limit_min ? ` · ${a.time_limit_min} minutes` : ''}${a.closes_at ? ` · closes ${fmtDate(a.closes_at, true)}` : ''}`)), btn('Start', () => navigate('/assessment/' + a.id), { kind: 'primary', sm: true }))),
        ...todo.map(a => h('div.row.between', h('div', h('strong', a.title || 'Practice from your teacher'), h('div.small.muted', `${a.question_ids?.length || 0} questions${a.due_at ? ` · by ${fmtDate(a.due_at)}` : ''}`)), btn('Practise', () => startPractice(navigate, { ids: a.question_ids, mode: 'intervention', assignment: a, title: a.title }), { sm: true }))))
        : empty('Nothing waiting', 'No assessments or practice sets are waiting for you.', btn('Practise anything', () => navigate('/practice'), { kind: 'primary' }), 'check')),
      card(cardHead('Ideas worth revisiting'), ideas.length ? h('div.stack', h('p.small.muted', 'Based on your recent answers. Short practice on these will help most.'),
        ...ideas.map(x => h('div', { style: { borderTop: '1px solid var(--line)', paddingTop: '.6rem' } }, h('strong', x.entry.name), h('p.small', { style: { margin: '.2rem 0 .4rem' } }, forStudents(x.entry.description)),
          btn('Practise this idea', () => startPractice(navigate, { misconception: x.misconception_id, title: x.entry.name }), { sm: true, ic: 'target' }))))
        : empty('Keep going', s.marked < 10 ? 'Answer a few more questions and suggestions will appear here.' : 'Nothing stands out right now. Try a chapter you have not practised yet.', null, 'target'))),
    card(cardHead('Chapters', btn('Practise', () => navigate('/practice'), { sm: true })), ...['P1', 'P2'].map(p => h('div', h('h3', { style: { marginTop: '.5rem' } }, p === 'P1' ? 'Paper 1 — Computer systems' : 'Paper 2 — Algorithms, programming and logic'),
      ...CHAPTER_IDS.filter(id => CHAPTERS[id].paper === p).map(id => barRow(CHAPTERS[id].title, s.chapters[id].accuracy, s.chapters[id].n ? `${fmtPct(s.chapters[id].accuracy)} (${s.chapters[id].n})` : '—'))))));
}

// ── Practice ────────────────────────────────────────────────────────────
function startPractice(navigate, opts) { practiceState = { opts, built: false }; navigate('/practice/run'); }

async function practiceStart({ store, navigate }) {
  const qs = (await allQuestions(store)).filter(q => q.visibility === 'practice' || q.builtin);
  const ch = select([['', 'All chapters'], ...CHAPTER_IDS.map(id => [id, `${id} ${CHAPTERS[id].title}`])], '');
  const n = select([['5', '5 questions'], ['10', '10 questions'], ['15', '15 questions']], '10');
  const diff = select([['', 'Any difficulty'], ['1', 'Foundation'], ['2', 'Core'], ['3', 'Extended']], '');
  const counts = Object.fromEntries(CHAPTER_IDS.map(id => [id, qs.filter(q => q.chapter_id === id).length]));
  return h('div', pageHead('Practice', 'Hints and explanations are available. Practice never counts as an assessment.'),
    card('Choose what to practise', h('div.form-grid', field('Chapter', ch), field('Number of questions', n), field('Difficulty', diff)),
      h('div.card-foot', btn('Start practice', () => startPractice(navigate, { chapter: ch.value || null, n: Number(n.value), difficulty: diff.value ? Number(diff.value) : null, title: ch.value ? chapterTitle(ch.value) : 'Mixed practice' }), { kind: 'primary', ic: 'play' }))),
    card('Chapters', h('div.grid-2', ...['P1', 'P2'].map(p => h('div.stack', ...CHAPTER_IDS.filter(id => CHAPTERS[id].paper === p).map(id => h('div.row.between', h('span', `${id} ${CHAPTERS[id].title}`),
      h('span.row', h('span.small.muted', `${counts[id]} questions`), btn('Practise', () => startPractice(navigate, { chapter: id, n: 10, title: CHAPTERS[id].title }), { sm: true, disabled: !counts[id] })))))))));
}

function pickQuestions(pool, opts) {
  let list = pool.filter(q => q.active !== false && q.type !== 'structured');
  if (opts.ids) { const idx = indexById(pool); return opts.ids.map(id => idx.get(id)).filter(Boolean); }
  if (opts.misconception) list = list.filter(q => targetsOf(q).has(opts.misconception));
  if (opts.chapter) list = list.filter(q => q.chapter_id === opts.chapter);
  if (opts.difficulty) list = list.filter(q => q.difficulty === opts.difficulty);
  const out = []; const groups = new Set();
  for (const q of opts.seed ? seededShuffle(list, opts.seed) : shuffle(list)) {
    if (q.group_id) { if (groups.has(q.group_id)) continue; groups.add(q.group_id); out.push(...list.filter(x => x.group_id === q.group_id)); }
    else out.push(q);
    if (out.length >= (opts.n || 10)) break;
  }
  return out.slice(0, Math.max(opts.n || 10, out.length));
}

async function practiceRun({ store, navigate }) {
  if (!practiceState) { navigate('/practice'); return h('div'); }
  const st = practiceState;
  if (!st.built) {
    const pool = await allQuestions(store);
    st.questions = pickQuestions(pool, st.opts); st.i = 0; st.results = []; st.built = true;
    if (!st.questions.length) { practiceState = null; return h('div', pageHead(st.opts.title || 'Practice'), empty('No questions available', 'There are no questions for this choice yet.', btn('Back', () => navigate('/practice')))); }
    st.mode = st.opts.mode || (st.opts.challenge ? 'challenge' : 'practice');
    st.sessionId = await store.startSession({ mode: st.mode, chapter_id: st.opts.chapter || null, question_count: st.questions.length });
  }
  const wrap = h('div');
  const capture = new BehaviourCapture({ captureInterruptions: store.settings.capture_interruptions !== false });
  const draw = () => {
    capture.reset();
    if (st.i >= st.questions.length) return finish();
    const q = st.questions[st.i];
    let value; let done = false;
    const view = renderQuestion(q, { onChange: (v) => { value = v; capture.answerChanged(v); submit.disabled = !isAnswered(q, v); }, number: st.i + 1 });
    const fb = h('div');
    const hintBtn = q.hint && st.mode !== 'challenge' ? btn('Show hint', () => { capture.hintOpened(); hintBtn.replaceWith(callout(['Hint: ', q.hint])); }, { kind: 'ghost', sm: true }) : null;
    const next = btn(st.i === st.questions.length - 1 ? 'Finish' : 'Next question', () => { st.i++; draw(); }, { kind: 'primary' }); next.hidden = true;
    const submit = btn('Check answer', async () => {
      if (done) return; done = true; submit.disabled = true;
      const result = await markResponse(q, value);
      st.results.push({ q, result });
      view.lock(result);
      mount(fb, feedbackBox(q, result));
      submit.hidden = true; next.hidden = false; hintBtn && (hintBtn.hidden = true); next.focus();
      try { await store.saveResponse(store.buildResponse({ session_id: st.sessionId, question: q, answer: value, result, behaviour: capture.snapshot(), mode: st.mode })); }
      catch (e) { console.warn('Response queued:', e.message); }
    }, { kind: 'primary' });
    submit.disabled = true;
    const pct = Math.round(st.i / st.questions.length * 100);
    mount(wrap, pageHead(st.opts.title || 'Practice', `Question ${st.i + 1} of ${st.questions.length}`, btn('Stop', async () => { if (await confirmDialog('Stop practice?', 'Answers you have already checked are saved.', { confirmLabel: 'Stop' })) finish(); }, { kind: 'ghost' })),
      h('div.progressbar', { role: 'progressbar', 'aria-valuenow': pct, 'aria-valuemin': 0, 'aria-valuemax': 100, style: { marginBottom: '1rem' } }, h('div', { style: { width: pct + '%' } })),
      h('div.card', view.el, fb, h('div.card-foot', hintBtn, submit, next)));
  };
  const finish = async () => {
    capture.destroy();
    const marked = st.results.filter(r => r.result.correct !== null || r.result.score !== null);
    const score = marked.reduce((a, r) => a + (r.result.score || 0), 0), max = marked.reduce((a, r) => a + r.result.max, 0);
    await store.endSession(st.sessionId, { answered: st.results.length, correct: st.results.filter(r => r.result.correct === true).length, score, max_score: max, challenge_key: st.opts.challengeKey || null }).catch(() => {});
    if (st.opts.assignment && st.results.length) await store.completeAssignment(st.opts.assignment.id).catch(() => {});
    const title = st.opts.title || 'Practice'; practiceState = null;
    mount(wrap, pageHead(title + ' — finished'), card(cardHead('Your result'),
      h('p', { style: { fontSize: '1.2rem' } }, `You scored ${Math.round(score * 10) / 10} out of ${max} (${fmtPct(max ? score / max : null)}).`),
      h('div.table-wrap', h('table', h('thead', h('tr', h('th', '#'), h('th', 'Question'), h('th', 'Result'))), h('tbody', ...st.results.map((r, i) => h('tr', h('td', i + 1), h('td', r.q.text.slice(0, 90)),
        h('td', r.result.needs_manual ? badge('Teacher will mark') : r.result.correct ? badge('Correct', 'ok') : r.result.correct === null ? badge(`${r.result.score}/${r.result.max}`, 'warn') : badge('Not yet', 'warn'))))))),
      h('div.card-foot', btn('Practise again', () => navigate('/practice')), btn('Home', () => navigate('/'), { kind: 'primary' }))));
  };
  draw();
  return wrap;
}

// ── Assessments ─────────────────────────────────────────────────────────
async function assessmentsList({ store, navigate }) {
  const list = await openAssessments(store);
  const results = Object.fromEntries(await Promise.all(list.filter(a => a.submitted).map(async a => [a.id, await store.getMyResult(a.submission.id)])));
  return h('div', pageHead('Assessments', 'Assessments set by your teacher. Answers are saved on this device as you go, so a lost connection does not lose your work.'),
    list.length ? dataTable(list, [
      { key: 'title', label: 'Assessment', render: a => h('strong', a.title) },
      { key: 'question_count', label: 'Questions', num: true },
      { key: 'time_limit_min', label: 'Time', render: a => a.time_limit_min ? `${a.time_limit_min} min` : 'Untimed' },
      { key: 'closes_at', label: 'Closes', render: a => a.closes_at ? fmtDate(a.closes_at, true) : '—', sort: a => toMs(a.closes_at) },
      { key: 'status', label: 'Status', render: a => a.submitted ? (results[a.id] ? badge(`Result: ${results[a.id].score}/${results[a.id].max_score}`, 'ok') : badge('Submitted', 'info')) : store.loadDraft(a.id) ? badge('In progress', 'warn') : badge('Not started') },
      { key: 'go', label: '', sortable: false, render: a => a.submitted ? (results[a.id] ? btn('View result', () => navigate('/result/' + a.submission.id), { sm: true }) : h('span.small.muted', 'Awaiting results')) : btn(store.loadDraft(a.id) ? 'Continue' : 'Start', () => navigate('/assessment/' + a.id), { kind: 'primary', sm: true }) },
    ], { search: false }) : card('No assessments', empty('Nothing has been set yet', 'When your teacher publishes an assessment for your class it will appear here.', null, 'clipboard')));
}

async function assessmentTake({ store, params, navigate }) {
  const a = await store.getAssessment(params.id);
  if (!a || a.status !== 'published') return h('div', pageHead('Assessment'), callout('This assessment is not open.', 'warn'), btn('Back', () => navigate('/assessments')));
  const subs = await store.listMySubmissions();
  if (subs.some(s => s.assessment_id === a.id)) return h('div', pageHead(a.title), callout('You have already submitted this assessment.', 'info'), btn('Back', () => navigate('/assessments')));
  if (a.closes_at && toMs(a.closes_at) < Date.now()) return h('div', pageHead(a.title), callout('This assessment has closed.', 'warn'), btn('Back', () => navigate('/assessments')));
  let draft = store.loadDraft(a.id);
  const wrap = h('div');
  if (!draft) {
    mount(wrap, pageHead(a.title, `${a.question_count} questions · ${a.total_marks} marks${a.time_limit_min ? ` · ${a.time_limit_min} minutes` : ''}`),
      card('Before you start', a.instructions ? h('p', { style: { whiteSpace: 'pre-wrap' } }, a.instructions) : null,
        h('ul', h('li', 'Hints are not available in assessments.'), h('li', 'Your answers are saved on this device as you go.'), a.time_limit_min ? h('li', 'The timer starts when you press Start and keeps running if you leave the page.') : null,
          h('li', 'If you lose your connection, keep going — your submission will be sent when you are back online.')),
        h('div.card-foot', btn('Back', () => navigate('/assessments'), { kind: 'ghost' }), btn('Start', () => { draft = { started_at: Date.now(), answers: {}, behaviour: {} }; store.saveDraft(a.id, draft); run(); }, { kind: 'primary', ic: 'play' }))));
  } else run();
  let timer = null;
  function run() {
    let cur = 0; const qs = a.questions;
    const capture = new BehaviourCapture({ captureInterruptions: store.settings.capture_interruptions !== false });
    const nav = h('div.qnav', { 'aria-label': 'Questions' });
    const tm = h('span.timer'); const body = h('div');
    const deadline = a.time_limit_min ? draft.started_at + a.time_limit_min * 60000 : null;
    const closeAt = toMs(a.closes_at);
    const end = [deadline, closeAt].filter(Boolean).reduce((m, x) => Math.min(m, x), Infinity);
    const tick = () => {
      if (end === Infinity) { tm.textContent = 'Untimed'; return; }
      const left = end - Date.now();
      if (left <= 0) { clearInterval(timer); tm.textContent = '0:00'; submit(true); return; }
      tm.textContent = fmtDuration(left).replace('m ', ':').replace('s', ''); tm.classList.toggle('low', left < 120000);
    };
    const saveBehaviour = () => { const b = capture.snapshot(); const prev = draft.behaviour[qs[cur].id] || {}; draft.behaviour[qs[cur].id] = { time_ms: (prev.time_ms || 0) + b.time_ms, revisions: (prev.revisions || 0) + b.revisions, interruptions: (prev.interruptions || 0) + (b.interruptions || 0), time_to_first_ms: prev.time_to_first_ms ?? b.time_to_first_ms, offline: prev.offline || b.offline }; store.saveDraft(a.id, draft); };
    const go = (i) => { saveBehaviour(); cur = i; draw(); };
    const draw = () => {
      capture.reset();
      const q = qs[cur];
      clear(nav); qs.forEach((x, i) => nav.appendChild(h('button', { type: 'button', class: (isAnswered(x, draft.answers[x.id]) ? 'answered ' : '') + (i === cur ? 'current' : ''), 'aria-label': `Question ${i + 1}${isAnswered(x, draft.answers[x.id]) ? ', answered' : ''}`, on: { click: () => go(i) } }, String(i + 1))));
      const view = renderQuestion(q, { value: draft.answers[q.id], number: cur + 1, onChange: (v) => { capture.answerChanged(v); draft.answers[q.id] = v; store.saveDraft(a.id, draft); nav.children[cur]?.classList.toggle('answered', isAnswered(q, v)); } });
      mount(body, h('div.card', view.el, h('div.card-foot', btn('Previous', () => go(cur - 1), { disabled: cur === 0 }), cur < qs.length - 1 ? btn('Next', () => go(cur + 1), { kind: 'primary' }) : btn('Review and submit', () => submit(false), { kind: 'primary' }))));
    };
    const submit = async (forced) => {
      saveBehaviour();
      const unanswered = qs.filter(q => !isAnswered(q, draft.answers[q.id])).length;
      if (!forced && !(await confirmDialog('Submit assessment?', unanswered ? `${unanswered} question${unanswered > 1 ? 's are' : ' is'} unanswered. You cannot change your answers after submitting.` : 'You cannot change your answers after submitting.', { confirmLabel: 'Submit' }))) return;
      clearInterval(timer); capture.destroy();
      try {
        const id = await store.submitAssessment(a, { answers: draft.answers, behaviour: draft.behaviour, started_at: draft.started_at, forced });
        const queued = store.pendingCount() > 0;
        mount(wrap, pageHead(a.title), card('Submitted', callout(queued ? 'Your answers are saved on this device and will be sent automatically as soon as you are back online. Do not clear your browser data until the "waiting to send" badge disappears.' : 'Your answers have been received.', queued ? 'warn' : 'ok'),
          h('p', a.release_feedback === 'manual' ? 'Your teacher will release results when everyone has finished.' : 'Results will appear under Assessments once they are marked.'),
          h('div.card-foot', btn('Back to assessments', () => navigate('/assessments'), { kind: 'primary' }))));
        void id;
      } catch (e) { errorToast(e, 'Submission'); }
    };
    mount(wrap, h('div.page-head', h('div', h('h1', a.title), h('p', `${qs.length} questions · ${a.total_marks} marks`)), h('div.page-actions', h('span.badge', icon('clock'), tm))),
      h('div.card', { style: { marginBottom: '1rem' } }, nav), body);
    draw(); tick(); timer = setInterval(tick, 1000);
    window.addEventListener('hashchange', () => { clearInterval(timer); capture.destroy(); }, { once: true });
  }
  return wrap;
}

async function assessmentResult({ store, params, navigate }) {
  const res = await store.getMyResult(params.id);
  const sub = await store.getSubmission(params.id).catch(() => null);
  if (!res) return h('div', pageHead('Result'), callout('Results for this assessment have not been released yet.', 'info'), btn('Back', () => navigate('/assessments')));
  const a = await store.getAssessment(res.assessment_id);
  return h('div', pageHead(a?.title || 'Result', `Score ${res.score} of ${res.max_score} (${fmtPct(res.max_score ? res.score / res.max_score : null)})`, btn('Back', () => navigate('/assessments'))),
    res.pending_marking ? callout(`${res.pending_marking} answer${res.pending_marking > 1 ? 's are' : ' is'} still being marked by your teacher.`, 'info') : null,
    ...(a?.questions || []).map((q, i) => {
      const r = res.results?.[q.id] || {};
      const view = renderQuestion(q, { value: sub?.answers?.[q.id], number: i + 1, disabled: true });
      view.lock(r, { answer: r.correct_answer });
      return h('div.card', view.el, feedbackBox(q, { ...r, misconception_hits: [] }, { key: { answer: r.correct_answer, explanation: r.explanation } }));
    }));
}

async function assignedList({ store, navigate }) {
  const list = (await store.listMyAssignments()).sort((x, y) => (toMs(y.created_at) || 0) - (toMs(x.created_at) || 0));
  return h('div', pageHead('Set by your teacher', 'Short practice sets your teacher has chosen for you.'),
    list.length ? dataTable(list, [
      { key: 'title', label: 'Practice set', render: a => a.title || 'Practice set' },
      { key: 'n', label: 'Questions', num: true, render: a => a.question_ids?.length || 0 },
      { key: 'due_at', label: 'By', render: a => a.due_at ? fmtDate(a.due_at) : '—', sort: a => toMs(a.due_at) },
      { key: 'status', label: 'Status', render: a => a.status === 'completed' ? badge('Done', 'ok') : badge('To do', 'warn') },
      { key: 'go', label: '', sortable: false, render: a => btn(a.status === 'completed' ? 'Practise again' : 'Start', () => startPractice(navigate, { ids: a.question_ids, mode: 'intervention', assignment: a, title: a.title }), { sm: true, kind: a.status === 'completed' ? '' : 'primary' }) },
    ], { search: false }) : card('Nothing set', empty('No practice sets', 'Your teacher has not set you any practice yet.', btn('Practise anything', () => navigate('/practice')), 'flag')));
}

// ── Challenge (v3 daily/weekly challenge, without the public class leaderboard) ──
async function challenge({ store, navigate }) {
  const today = new Date().toISOString().slice(0, 10);
  const wk = (() => { const d = new Date(); const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())); const day = t.getUTCDay() || 7; t.setUTCDate(t.getUTCDate() + 4 - day); const y = new Date(Date.UTC(t.getUTCFullYear(), 0, 1)); return `${t.getUTCFullYear()}-W${String(Math.ceil(((t - y) / 864e5 + 1) / 7)).padStart(2, '0')}`; })();
  const sessions = (await store.listSessions([['student_uid', '==', store.auth.uid]]).catch(() => [])).filter(s => s.mode === 'challenge' && s.challenge_key);
  const best = (key) => sessions.filter(s => s.challenge_key === key).reduce((m, s) => Math.max(m, s.max_score ? s.score / s.max_score : 0), null);
  const start = (key, n, title) => startPractice(navigate, { challenge: true, challengeKey: key, n, seed: hash32(key + store.me.class_code), title });
  const days = sessions.map(s => s.challenge_key).filter(k => /^\d{4}-\d{2}-\d{2}$/.test(k));
  return h('div', pageHead('Challenges', 'The same questions for everyone in your class today. No hints. Your scores are private to you and your teacher.'),
    h('div.grid-2',
      card(cardHead('Daily challenge'), h('p', '5 mixed questions, new every day.'), best(today) !== null ? h('p', 'Your best today: ', h('strong', fmtPct(best(today)))) : null, btn(best(today) !== null ? 'Try again' : 'Start', () => start(today, 5, 'Daily challenge'), { kind: 'primary', ic: 'play' })),
      card(cardHead('Weekly challenge'), h('p', '10 questions across both papers, new every week.'), best(wk) !== null ? h('p', 'Your best this week: ', h('strong', fmtPct(best(wk)))) : null, btn(best(wk) !== null ? 'Try again' : 'Start', () => start(wk, 10, 'Weekly challenge'), { kind: 'primary', ic: 'play' }))),
    card('Days completed', days.length ? h('p', `You have completed ${new Set(days).size} daily challenge${new Set(days).size === 1 ? '' : 's'}.`) : h('p.muted', 'Complete your first daily challenge to start a record.')));
}

// ── Progress ────────────────────────────────────────────────────────────
async function progress({ store }) {
  const qIndex = indexById(await allQuestions(store));
  const { responses, sessions } = await myData(store);
  const s = studentSummary(responses, sessions);
  const tr = weeklyTrend(responses);
  const ideas = revisitIdeas(responses, qIndex);
  const hist = [...responses].sort((a, b) => b.recorded_at - a.recorded_at);
  const [c1] = palette();
  return h('div', pageHead('My progress', 'Only your own answers are shown here.'),
    h('div.grid-tiles', tile('Accuracy', fmtPct(s.accuracy), `${s.marked} marked answers`), tile('Assessment accuracy', fmtPct(s.assessment_accuracy), `${s.assessment_n} answers`), tile('Sessions completed', s.sessions_completed), tile('Awaiting marking', s.awaiting_marking)),
    h('div.grid-2',
      card('Accuracy by week', tr.series.length ? chart('line', { labels: tr.series.map(w => w.week), datasets: [{ label: 'Accuracy %', data: tr.series.map(w => Math.round(w.accuracy * 100)), borderColor: c1, backgroundColor: c1, tension: .25 }] }, { scales: { y: { min: 0, max: 100 } } }, { label: 'Weekly accuracy' }) : empty('No data yet', 'Your weekly progress will appear here.')),
      card('Ideas worth revisiting', ideas.length ? h('div.stack', ...ideas.map(x => h('div', h('strong', x.entry.name), h('p.small', forStudents(x.entry.description)), h('p.small.muted', 'Try this: ' + (x.entry.strategies?.[0] || ''))))) : h('p.muted', 'Nothing stands out at the moment.'))),
    card('Chapters', ...CHAPTER_IDS.map(id => barRow(`${id} ${CHAPTERS[id].title}`, s.chapters[id].accuracy, s.chapters[id].n ? `${fmtPct(s.chapters[id].accuracy)} (${s.chapters[id].n})` : '—'))),
    card('History', dataTable(hist, [
      { key: 'recorded_at', label: 'When', render: r => rel(r.recorded_at), sort: r => r.recorded_at },
      { key: 'chapter_id', label: 'Chapter', render: r => chapterTitle(r.chapter_id) },
      { key: 'q', label: 'Question', render: r => (qIndex.get(r.question_id)?.text || r.question_id).slice(0, 80), sort: r => r.question_id },
      { key: 'mode', label: 'Type', render: r => r.mode },
      { key: 'correct', label: 'Result', render: r => r.correct === true ? badge('Correct', 'ok') : r.correct === false ? badge('Not yet', 'warn') : badge('Awaiting marking'), sort: r => r.correct === true ? 1 : 0 },
    ], { pageSize: 15 })));
}

// ── Editor and tutorials ────────────────────────────────────────────────
const TEMPLATES = {
  'Hello and input': 'DECLARE Name : STRING\nOUTPUT "What is your name?"\nINPUT Name\nOUTPUT "Hello, ", Name',
  'Totalling and average': 'DECLARE Total, Num : REAL\nDECLARE Count : INTEGER\nTotal ← 0\nFOR Count ← 1 TO 5\n   INPUT Num\n   Total ← Total + Num\nNEXT Count\nOUTPUT "Total: ", Total\nOUTPUT "Average: ", Total / 5',
  'Linear search': 'DECLARE Names : ARRAY[1:5] OF STRING\nDECLARE Target : STRING\nDECLARE Found : BOOLEAN\nDECLARE I : INTEGER\nNames[1] ← "Ama"\nNames[2] ← "Kofi"\nNames[3] ← "Esi"\nNames[4] ← "Yaw"\nNames[5] ← "Efua"\nINPUT Target\nFound ← FALSE\nI ← 1\nWHILE I <= 5 AND NOT Found DO\n   IF Names[I] = Target THEN\n      Found ← TRUE\n   ELSE\n      I ← I + 1\n   ENDIF\nENDWHILE\nIF Found THEN\n   OUTPUT Target, " found at position ", I\nELSE\n   OUTPUT Target, " not found"\nENDIF',
  'Bubble sort': 'DECLARE A : ARRAY[1:5] OF INTEGER\nDECLARE Temp, I, J : INTEGER\nA[1] ← 64\nA[2] ← 34\nA[3] ← 25\nA[4] ← 12\nA[5] ← 11\nFOR I ← 1 TO 4\n   FOR J ← 1 TO 5 - I\n      IF A[J] > A[J + 1] THEN\n         Temp ← A[J]\n         A[J] ← A[J + 1]\n         A[J + 1] ← Temp\n      ENDIF\n   NEXT J\nNEXT I\nFOR I ← 1 TO 5\n   OUTPUT A[I]\nNEXT I',
  'Binary search': 'DECLARE A : ARRAY[1:7] OF INTEGER\nDECLARE Target, Low, High, Mid : INTEGER\nDECLARE Found : BOOLEAN\nFOR Low ← 1 TO 7\n   A[Low] ← Low * 10\nNEXT Low\nINPUT Target\nLow ← 1\nHigh ← 7\nFound ← FALSE\nWHILE Low <= High AND NOT Found DO\n   Mid ← (Low + High) DIV 2\n   IF A[Mid] = Target THEN\n      Found ← TRUE\n   ELSE\n      IF A[Mid] < Target THEN\n         Low ← Mid + 1\n      ELSE\n         High ← Mid - 1\n      ENDIF\n   ENDIF\nENDWHILE\nOUTPUT Found',
  'Function and procedure': 'FUNCTION Maximum(A : INTEGER, B : INTEGER) RETURNS INTEGER\n   IF A > B THEN\n      RETURN A\n   ELSE\n      RETURN B\n   ENDIF\nENDFUNCTION\n\nPROCEDURE Show(Label : STRING, Value : INTEGER)\n   OUTPUT Label, ": ", Value\nENDPROCEDURE\n\nCALL Show("Larger", Maximum(12, 7))',
  '2D array': 'DECLARE Table : ARRAY[1:3, 1:3] OF INTEGER\nDECLARE Row, Col : INTEGER\nFOR Row ← 1 TO 3\n   FOR Col ← 1 TO 3\n      Table[Row, Col] ← Row * Col\n   NEXT Col\nNEXT Row\nOUTPUT Table[2, 3]',
  'File handling': 'OPENFILE "data.txt" FOR WRITE\nWRITEFILE "data.txt", "Line one"\nWRITEFILE "data.txt", "Line two"\nCLOSEFILE "data.txt"\nDECLARE Line : STRING\nOPENFILE "data.txt" FOR READ\nWHILE NOT EOF("data.txt")\n   READFILE "data.txt", Line\n   OUTPUT Line\nENDWHILE\nCLOSEFILE "data.txt"',
};
let editorCode = null;

function inputDialog(name) {
  return new Promise(resolve => {
    let done = false;
    const i = input('', { 'aria-label': `Value for ${name}` });
    const m = modal({ title: `INPUT ${name}`, body: h('form', { on: { submit: (e) => { e.preventDefault(); done = true; resolve(i.value); m.close(); } } }, field(`Enter a value for ${name}`, i)),
      actions: [{ label: 'Enter', kind: 'primary', onClick: () => { done = true; resolve(i.value); } }], onClose: () => { if (!done) resolve(null); } });
  });
}

async function editor({ query }) {
  const start = editorCode || TEMPLATES['Hello and input'];
  const host = h('div.editor-wrap'); const out = h('div.console', { 'aria-live': 'polite', role: 'log' }, 'Press Run to see the output.');
  const traceBox = h('div');
  let cm = null; const ta = h('textarea', { class: 'code', rows: 16, spellcheck: 'false', 'aria-label': 'Pseudocode' }); ta.value = start;
  const getCode = () => cm ? cm.getValue() : ta.value;
  const setCode = (c) => { editorCode = c; cm ? cm.setValue(c) : (ta.value = c); };
  const showTrace = { checked: false };
  const traceCb = h('input', { type: 'checkbox', on: { change: (e) => { showTrace.checked = e.target.checked; } } });
  const run = async () => {
    editorCode = getCode(); clear(out); clear(traceBox); out.textContent = 'Running…';
    const r = await runPseudocode(editorCode, { input: async (n) => { const v = await inputDialog(n); if (v === null) throw new Error('Input cancelled'); out.append(h('div.muted', `> ${v}`)); return v; }, onOutput: () => {}, trace: true });
    clear(out);
    r.output.forEach(l => out.appendChild(h('div', l)));
    if (r.error) out.appendChild(h('div.err', `${r.error.phase === 'syntax' ? 'Syntax error' : 'Error'}${r.error.line ? ' on line ' + r.error.line : ''}: ${r.error.message}`));
    else if (!r.output.length) out.appendChild(h('div.muted', '(The program finished without any OUTPUT.)'));
    if (showTrace.checked && r.trace?.length) {
      const names = [...new Set(r.trace.map(t => t.name))];
      traceBox.appendChild(card('Trace table', h('div.table-wrap', h('table', h('thead', h('tr', h('th', 'Line'), ...names.map(n => h('th', n)))), h('tbody', ...r.trace.slice(0, 300).map(t => h('tr', h('td', t.line), ...names.map(n => h('td.mono', n === t.name ? t.value : '')))))))));
    }
  };
  const tpl = select([['', 'Load an example…'], ...Object.keys(TEMPLATES).map(k => [k, k])], '');
  tpl.addEventListener('change', () => { if (tpl.value) setCode(TEMPLATES[tpl.value]); tpl.value = ''; });
  host.appendChild(ta);
  setTimeout(() => { if (window.CodeMirror && host.isConnected) { cm = window.CodeMirror.fromTextArea(ta, { lineNumbers: true, indentUnit: 3, tabSize: 3, lineWrapping: true, extraKeys: { Tab: (c) => c.replaceSelection('   '), 'Ctrl-Enter': run, 'Cmd-Enter': run } }); cm.on('change', () => { editorCode = cm.getValue(); }); } }, 30);
  return h('div', pageHead('Pseudocode editor', 'Write and run Cambridge pseudocode. Ctrl + Enter runs the program.'),
    h('div.card', h('div.toolbar', btn('Run', run, { kind: 'primary', ic: 'play' }), tpl, h('label.check', traceCb, h('span', 'Show trace table')),
      btn('Insert ←', () => { cm ? cm.replaceSelection('←') : ta.setRangeText('←', ta.selectionStart, ta.selectionEnd, 'end'); }, { sm: true, title: 'Insert the assignment arrow' })), host, h('h3', { style: { marginTop: '1rem' } }, 'Output'), out),
    traceBox);
}

async function tutorials({ navigate }) {
  return h('div', pageHead('Tutorials', 'Paper 2 programming, step by step. Open any example in the editor to run it.'),
    ...TUTORIALS.map(u => card(cardHead(u.title, badge(u.examWeight || '', 'info')), h('p.ink2', u.summary),
      ...u.lessons.map(l => h('details', { style: { borderTop: '1px solid var(--line)', padding: '.6rem 0' } }, h('summary', { style: { cursor: 'pointer', fontWeight: 600 } }, l.title),
        h('pre', { style: { margin: '.6rem 0', fontFamily: 'var(--font)' } }, l.concept),
        l.snippet ? h('pre.q-code', l.snippet) : null,
        l.task ? callout(['Task: ', l.task]) : null,
        h('div.row', { style: { marginTop: '.5rem' } }, l.snippet ? btn('Open example in editor', () => { editorCode = l.snippet; navigate('/editor'); }, { sm: true, ic: 'code' }) : null,
          l.solution ? btn('Open solution in editor', () => { editorCode = l.solution; navigate('/editor'); }, { sm: true, kind: 'ghost' }) : null))))));
}

async function account({ store }) {
  const name = input(store.me.display_name, { maxlength: 60 });
  return h('div', pageHead('Account and privacy'),
    card('Your details', field('Name shown to your teacher', name), h('p.small.muted', `Class ${store.me.class_code}. To change class, ask your teacher.`),
      h('div.card-foot', btn('Save', async () => { try { await store.backend.set('users', store.auth.uid, { display_name: name.value.trim().slice(0, 60) }, { merge: true }); toast('Saved', 'ok'); } catch (e) { errorToast(e); } }, { kind: 'primary' }))),
    card('What CS Lifeline records about you', h('ul',
      h('li', 'Your answers, whether they were correct, and how long you spent on each question.'),
      h('li', 'How many times you changed an answer and whether you opened a hint.'),
      h('li', 'Whether the page was hidden while you answered (for example, your phone locked). This is only context; it is never treated as cheating.'),
      h('li', 'Nothing about other apps, websites, your location or your device.')),
      h('p', 'Your teacher uses this to see which ideas the class finds difficult and to plan help. Research use requires permission from your school and, where needed, your parent or guardian. Records used for research never include your name or email.'),
      h('p', h('a', { href: '/privacy.html' }, 'Read the full privacy notice'))));
}
