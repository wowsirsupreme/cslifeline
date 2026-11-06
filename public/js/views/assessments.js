// Teacher assessments: build and publish, mark, release results, item analysis.
// Students receive questions without answers; answer keys live in assessment_keys (teacher-only by rule).
// Pending submissions are marked here, in the teacher's browser, unless the scoring Cloud Function is deployed.
import { h, tile, btn, badge, card, cardHead, callout, empty, pageHead, field, input, textarea, select, checkbox, dataTable, modal, confirmDialog, toast, errorToast, download, barRow, fmtPct, fmtDate, rel, n } from '../ui/kit.js';
import { renderQuestion, questionMeta } from '../ui/question-view.js';
import { myClasses, noClasses } from './common.js';
import { allQuestions, indexById, studentName } from '../app/data.js';
import { CHAPTERS, CHAPTER_IDS, chapterTitle } from '../engine/curriculum.js';
import { QUESTION_TYPES, DIFFICULTY_LABELS } from '../engine/questions.js';
import { joinKey, totalMarks } from '../engine/marking.js';
import { toCSV } from '../engine/csv.js';
import { TAXONOMY } from '../engine/taxonomy-data.js';
import { CONFIG } from '../core/config.js';
import { toMs } from '../core/util.js';

const TAX = new Map(TAXONOMY.map(t => [t.id, t]));
const STATUS_TONE = { draft: '', published: 'ok', closed: 'info', archived: '' };
const localDT = (ms) => { if (!ms) return ''; const d = new Date(ms); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };

export async function assessmentsList(ctx) {
  const { store, navigate } = ctx;
  const classes = await myClasses(store);
  if (!classes.length) return h('div', pageHead('Assessments'), noClasses());
  const codes = classes.map(c => c.id);
  const [list, subs] = await Promise.all([store.listAssessments(), store.listSubmissions(codes)]);
  const mine = list.filter(a => (a.class_codes || []).some(c => codes.includes(c)) || a.created_by === store.auth.uid);
  const rows = mine.map(a => {
    const s = subs.filter(x => x.assessment_id === a.id);
    return { a, id: a.id, title: a.title, status: a.status, classes: (a.class_codes || []).join(', '), questions: a.question_count || 0, marks: a.total_marks || 0,
      submitted: s.length, pending: s.filter(x => x.status === 'submitted').length, needs: s.filter(x => x.status === 'needs_marking').length, closes: toMs(a.closes_at), created: toMs(a.created_at) };
  });
  const pendingTotal = rows.reduce((t, r) => t + r.pending + r.needs, 0);
  return h('div', pageHead('Assessments', 'Build, publish and mark assessments. Answer keys are never sent to students.', btn('New assessment', () => navigate('/assessment/new/edit'), { kind: 'primary', ic: 'plus' })),
    pendingTotal ? callout([h('strong', `${pendingTotal} submission${pendingTotal > 1 ? 's' : ''} waiting. `), CONFIG.functionsDeployed && !store.isDemo ? 'The marking service scores new submissions automatically; items that need a teacher are listed under Results.' : 'Open an assessment\'s results to mark them — automatic marking runs in your browser because the marking service is not deployed.'], 'warn') : null,
    card(dataTable(rows, [
      { key: 'title', label: 'Assessment', render: r => h('a', { href: `#/assessment/${r.id}/results` }, h('strong', r.title)) },
      { key: 'status', label: 'Status', render: r => badge(r.status, STATUS_TONE[r.status]) },
      { key: 'classes', label: 'Classes' }, { key: 'questions', label: 'Questions', num: true }, { key: 'marks', label: 'Marks', num: true },
      { key: 'submitted', label: 'Submitted', num: true }, { key: 'pending', label: 'To mark', num: true, render: r => r.pending + r.needs ? badge(String(r.pending + r.needs), 'warn') : '0', sort: r => r.pending + r.needs },
      { key: 'closes', label: 'Closes', render: r => r.closes ? fmtDate(r.closes, true) : '—' },
      { key: 'act', label: '', sortable: false, render: r => h('span.row', btn('Edit', () => navigate(`/assessment/${r.id}/edit`), { sm: true, ic: 'edit' }), btn('Results', () => navigate(`/assessment/${r.id}/results`), { sm: true })) },
    ], { initialSort: { key: 'created', dir: 'desc' }, empty: 'No assessments yet. Create one to collect evidence for misconception detection and early warning.' })));
}

export async function assessmentEdit(ctx) {
  const { store, navigate, params } = ctx;
  const isNew = params.id === 'new';
  const [classes, bank, existing, keys] = await Promise.all([myClasses(store), allQuestions(store), isNew ? null : store.getAssessment(params.id), isNew ? null : store.getKeys(params.id).catch(() => null)]);
  if (!classes.length) return h('div', pageHead('Assessment'), noClasses());
  if (!isNew && !existing) return h('div', pageHead('Assessment not found'), callout('This assessment does not exist or you do not have access to it.', 'warn'));
  const qIndex = indexById(bank);
  // Rebuild full questions from the stored (stripped) copy + teacher-only keys; fall back to the bank.
  let chosen = isNew ? [] : (existing.questions || []).map(q => keys?.answers?.[q.id] ? joinKey(q, keys.answers[q.id]) : (qIndex.get(q.id) || q));
  const locked = !isNew && existing.status !== 'draft';

  const title = input(existing?.title || '', { maxlength: 120, placeholder: 'e.g. Week 10 check: iteration' });
  const instr = textarea(existing?.instructions || '', { rows: 2, placeholder: 'Shown to students before they start' });
  const opens = input(localDT(toMs(existing?.opens_at) || Date.now()), { type: 'datetime-local' });
  const closes = input(localDT(toMs(existing?.closes_at) || Date.now() + 7 * 864e5), { type: 'datetime-local' });
  const limit = input(String(existing?.time_limit_min ?? 30), { type: 'number', min: 0, max: 300 });
  const release = select([['on_scoring', 'Show students their results as soon as they are marked'], ['manual', 'I will release results myself']], existing?.release_feedback || store.settings.release_feedback_default || 'on_scoring');
  const shuffle = checkbox('Shuffle question order for each student', existing?.shuffle_questions ?? false);
  const classBoxes = classes.map(c => ({ c, cb: checkbox(`${c.name || c.id} (${c.id})`, existing ? (existing.class_codes || []).includes(c.id) : classes.length === 1) }));

  // Question picker
  const fCh = select([['', 'All chapters'], ...CHAPTER_IDS.map(id => [id, `${id} ${CHAPTERS[id].title}`])], '');
  const fType = select([['', 'All types'], ...Object.entries(QUESTION_TYPES).map(([k, v]) => [k, v.label])], '');
  const fDiff = select([['', 'Any difficulty'], ...Object.entries(DIFFICULTY_LABELS)], '');
  const fText = input('', { type: 'search', placeholder: 'Search question text' });
  const pickWrap = h('div'); const chosenWrap = h('div'); const summary = h('p.small.muted');
  const drawPick = () => {
    const ids = new Set(chosen.map(q => q.id));
    const t = fText.value.trim().toLowerCase();
    const list = bank.filter(q => !ids.has(q.id) && (!fCh.value || q.chapter_id === fCh.value) && (!fType.value || q.type === fType.value) && (!fDiff.value || String(q.difficulty) === fDiff.value) && (!t || q.text.toLowerCase().includes(t)));
    pickWrap.replaceChildren(dataTable(list, [
      { key: 'text', label: 'Question', render: q => h('div', h('div', q.text.slice(0, 140) + (q.text.length > 140 ? '…' : '')), questionMeta(q)) },
      { key: 'add', label: '', sortable: false, render: q => btn('Add', () => { chosen.push(q); drawChosen(); drawPick(); }, { sm: true, ic: 'plus', disabled: locked }) },
    ], { pageSize: 8, search: false, empty: 'No questions match these filters.' }));
  };
  const drawChosen = () => {
    summary.textContent = `${chosen.length} question${chosen.length === 1 ? '' : 's'} · ${totalMarks(chosen)} marks · ${chosen.filter(q => !QUESTION_TYPES[q.type]?.auto || (q.type === 'coding' && !q.tests?.length)).length} need teacher marking`;
    chosenWrap.replaceChildren(chosen.length ? h('ol', { style: { paddingLeft: '1.2rem', margin: 0 } }, ...chosen.map((q, i) => h('li', { style: { marginBottom: '.5rem' } },
      h('div.row.between', h('span', q.text.slice(0, 110) + (q.text.length > 110 ? '…' : '')),
        locked ? null : h('span.row', btn('↑', () => { if (i) { [chosen[i - 1], chosen[i]] = [chosen[i], chosen[i - 1]]; drawChosen(); } }, { sm: true, title: 'Move up' }),
          btn('↓', () => { if (i < chosen.length - 1) { [chosen[i + 1], chosen[i]] = [chosen[i], chosen[i + 1]]; drawChosen(); } }, { sm: true, title: 'Move down' }),
          btn('Preview', () => modal({ title: q.id, body: renderQuestion(q, { disabled: true }), wide: true }), { sm: true }),
          btn('Remove', () => { chosen.splice(i, 1); drawChosen(); drawPick(); }, { sm: true, kind: 'ghost' }))), questionMeta(q)))) : empty('No questions yet', 'Add questions from the bank below, or add a random set from a chapter.', null, 'layers'));
  };
  [fCh, fType, fDiff].forEach(x => x.addEventListener('change', drawPick)); fText.addEventListener('input', drawPick);
  const randN = input('5', { type: 'number', min: 1, max: 30, style: { width: '5rem' } });
  const addRandom = btn('Add random from chapter', () => {
    if (!fCh.value) return toast('Choose a chapter first', 'warn');
    const ids = new Set(chosen.map(q => q.id));
    const pool = bank.filter(q => q.chapter_id === fCh.value && !ids.has(q.id) && q.type !== 'structured');
    for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
    chosen.push(...pool.slice(0, Number(randN.value) || 5)); drawChosen(); drawPick();
  }, { sm: true, disabled: locked });
  drawPick(); drawChosen();

  const err = h('div.err', { role: 'alert' });
  async function save(status) {
    err.textContent = '';
    const cls = classBoxes.filter(x => x.cb.input.checked).map(x => x.c.id);
    const o = new Date(opens.value).getTime(), c = new Date(closes.value).getTime();
    const problems = [];
    if (!title.value.trim()) problems.push('Give the assessment a title.');
    if (!cls.length) problems.push('Choose at least one class.');
    if (!chosen.length) problems.push('Add at least one question.');
    if (!Number.isFinite(o) || !Number.isFinite(c) || c <= o) problems.push('The closing time must be after the opening time.');
    if (problems.length) { err.textContent = problems.join(' '); return; }
    if (status === 'published' && !(await confirmDialog('Publish to students?', `Students in ${cls.join(', ')} will see "${title.value.trim()}" from ${new Date(o).toLocaleString()}. Questions cannot be changed after publishing (you can still change dates and close it).`, { confirmLabel: 'Publish' }))) return;
    try {
      const a = { ...(isNew ? {} : { id: existing.id, created_by: existing.created_by, created_at: existing.created_at }), title: title.value.trim(), instructions: instr.value.trim(), class_codes: cls,
        opens_at: new Date(o).toISOString(), closes_at: new Date(c).toISOString(), time_limit_min: Math.max(0, Number(limit.value) || 0), release_feedback: release.value,
        shuffle_questions: shuffle.input.checked, status, question_ids: chosen.map(q => q.id), is_synthetic: false };
      const id = await store.saveAssessment(a, chosen);
      if (status === 'published') for (const s of await store.listStudents(cls)) store.notify(s.id, 'assessment_published', `New assessment: ${a.title}`, `/student/#/assessment/${id}`);
      toast(status === 'published' ? 'Published' : 'Saved as draft', 'ok');
      navigate(status === 'published' ? `/assessment/${id}/results` : `/assessment/${id}/edit`);
    } catch (e) { errorToast(e, 'Could not save'); }
  }
  return h('div', pageHead(isNew ? 'New assessment' : `Edit: ${existing.title}`, locked ? 'This assessment is published: you can change its dates and settings; its questions are fixed so every student answers the same paper.' : 'Choose questions, classes and timing. Students never receive the answer key.',
    btn('Back', () => navigate('/assessments'), { kind: 'ghost' })),
  h('div.grid-2',
    card('Details', field('Title', title), field('Instructions', instr), h('div.form-grid', field('Opens', opens), field('Closes', closes), field('Time limit (minutes, 0 = none)', limit)),
      field('Results', release), shuffle.el),
    card('Classes', ...classBoxes.map(x => x.cb.el), h('p.small.muted', 'Only classes you teach are listed.'))),
  card(cardHead('Questions', summary), chosenWrap),
  locked ? null : card(cardHead('Add from the question bank', h('span.row', randN, addRandom)), h('div.toolbar', fCh, fType, fDiff, fText), pickWrap),
  h('div.card-foot', err, isNew || existing.status === 'draft' ? btn('Save draft', () => save('draft')) : null,
    btn(locked ? 'Save changes' : 'Publish', () => save(locked ? existing.status : 'published'), { kind: 'primary' }),
    !isNew && existing.status === 'published' ? btn('Close now', async () => { if (await confirmDialog('Close this assessment?', 'Students will no longer be able to start or submit it.', { confirmLabel: 'Close' })) { await store.setAssessmentStatus(existing.id, 'closed'); toast('Closed', 'ok'); navigate(`/assessment/${existing.id}/results`); } }, { kind: 'ghost' }) : null));
}

export async function assessmentResults(ctx) {
  const { store, navigate, params } = ctx;
  const [a, keys] = await Promise.all([store.getAssessment(params.id), store.getKeys(params.id).catch(() => null)]);
  if (!a) return h('div', pageHead('Assessment not found'), callout('This assessment does not exist or you do not have access to it.', 'warn'));
  const codes = a.class_codes || [];
  let [subs, results, students] = await Promise.all([store.listSubmissions(codes), store.listResults(codes), store.listStudents(codes)]);
  subs = subs.filter(s => s.assessment_id === a.id); results = results.filter(r => r.assessment_id === a.id);
  const names = Object.fromEntries(students.map(s => [s.id, studentName(s)]));

  // Mark anything still waiting (idempotent: response IDs are deterministic).
  const waiting = subs.filter(s => s.status === 'submitted');
  let markedNow = 0;
  if (waiting.length && keys && !(CONFIG.functionsDeployed && !store.isDemo)) {
    for (const s of waiting) { try { await store.scoreSubmission(s, a, keys, { actor: 'teacher' }); markedNow++; } catch (e) { console.warn('marking failed', s.id, e); } }
    [subs, results] = await Promise.all([store.listSubmissions(codes), store.listResults(codes)]);
    subs = subs.filter(s => s.assessment_id === a.id); results = results.filter(r => r.assessment_id === a.id);
  }
  const resBy = Object.fromEntries(results.map(r => [r.id, r]));
  const qs = a.questions || [];
  const fullQ = qs.map(q => (keys?.answers?.[q.id] ? joinKey(q, keys.answers[q.id]) : q));

  const rows = subs.map(s => { const r = resBy[s.id]; return { s, r, id: s.id, name: names[s.student_uid] || s.student_uid, class_code: s.class_code, score: r?.score ?? null, max: r?.max_score ?? a.total_marks, pct: r && r.max_score ? r.score / r.max_score : null,
    pending: r?.pending_marking || 0, released: !!r?.released, status: s.status, submitted: toMs(s.submitted_at), forced: !!s.forced }; });
  const notSubmitted = students.filter(st => !subs.some(s => s.student_uid === st.id));
  const scored = rows.filter(r => r.pct !== null);
  const avg = scored.length ? scored.reduce((t, r) => t + r.pct, 0) / scored.length : null;

  // Item analysis from the per-question results
  const items = fullQ.map((q, i) => {
    const per = results.map(r => r.results?.[q.id]).filter(Boolean);
    const marked = per.filter(x => x.correct === true || x.correct === false);
    const wrongChoices = {};
    for (const s of subs) { const ans = s.answers?.[q.id]; const rr = resBy[s.id]?.results?.[q.id]; if (rr && rr.correct === false && ans !== undefined && ans !== null && typeof ans !== 'object') wrongChoices[ans] = (wrongChoices[ans] || 0) + 1; }
    const top = Object.entries(wrongChoices).sort((x, y) => y[1] - x[1])[0];
    const mis = top && q.option_misconceptions?.[top[0]] ? TAX.get(q.option_misconceptions[top[0]])?.name : null;
    return { i: i + 1, q, n: marked.length, facility: marked.length ? marked.filter(x => x.correct).length / marked.length : null, needs: per.filter(x => x.needs_manual).length,
      top: top ? `${Array.isArray(q.options) && q.options[top[0]] !== undefined ? `"${String(q.options[top[0]]).slice(0, 40)}"` : top[0]} (${top[1]})` : '—', mis };
  });

  const markModal = (row) => {
    const r = resBy[row.id]; const s = row.s;
    const manualQs = fullQ.filter(q => r?.results?.[q.id]?.needs_manual || r?.manual_marks?.[q.id] !== undefined || q.type === 'coding' || q.type === 'structured');
    if (!manualQs.length) return toast('Nothing in this submission needs a teacher\'s mark.', 'info');
    const inputs = manualQs.map(q => ({ q, inp: input(String(r?.manual_marks?.[q.id] ?? r?.results?.[q.id]?.score ?? ''), { type: 'number', min: 0, max: q.marks || 1, step: 0.5, style: { width: '6rem' } }) }));
    modal({ title: `Mark: ${row.name}`, wide: true, body: h('div.stack', ...inputs.map(({ q, inp }) => h('div.card', h('p', h('strong', q.text.slice(0, 300))),
      q.type === 'coding' ? h('pre.q-code', String(s.answers?.[q.id] ?? '(no answer)')) : h('div.q-stimulus', typeof s.answers?.[q.id] === 'object' ? JSON.stringify(s.answers?.[q.id], null, 1) : String(s.answers?.[q.id] ?? '(no answer)')),
      r?.results?.[q.id]?.score != null && !r?.results?.[q.id]?.needs_manual ? h('p.small.muted', `Provisional automatic mark: ${r.results[q.id].score}/${q.marks || 1}`) : null,
      (q.parts || []).length ? h('ul.small', ...q.parts.map(p => h('li', `${p.label || ''} ${p.marks} mark(s): ${(p.keywords || []).join(', ') || p.mark_scheme || ''}`))) : null,
      field(`Marks (out of ${q.marks || 1})`, inp)))),
    actions: [{ label: 'Cancel' }, { label: 'Save marks', kind: 'primary', onClick: async () => {
      try {
        for (const { q, inp } of inputs) if (inp.value !== '') await store.setManualMark(row.id, q.id, Math.max(0, Math.min(Number(inp.value), q.marks || 1)));
        if (keys) await store.scoreSubmission(await store.getSubmission(row.id), a, keys, { actor: 'teacher' });
        toast('Marks saved', 'ok'); navigate(`/assessment/${a.id}/results`);
      } catch (e) { errorToast(e); return false; }
    } }] });
  };

  const unreleased = rows.filter(r => r.r && !r.released && !r.pending).map(r => r.id);
  return h('div', pageHead(a.title, `${a.status} · ${codes.join(', ')} · ${a.question_count} questions · ${a.total_marks} marks · closes ${a.closes_at ? fmtDate(a.closes_at, true) : '—'}`,
    btn('Edit', () => navigate(`/assessment/${a.id}/edit`), { ic: 'edit' }),
    btn('Download CSV', () => download(`${a.title.replace(/\W+/g, '_')}_results.csv`, toCSV(rows.map(r => ({ student: r.name, class: r.class_code, score: r.score, max: r.max, percent: r.pct == null ? '' : Math.round(r.pct * 100), status: r.status, released: r.released, submitted: r.submitted ? new Date(r.submitted).toISOString() : '' })))), { ic: 'download' })),
  markedNow ? callout(`${markedNow} new submission${markedNow > 1 ? 's were' : ' was'} marked just now using the answer key held in your account.`, 'ok') : null,
  !keys ? callout('The answer key for this assessment could not be read, so new submissions cannot be marked from this account.', 'danger') : null,
  h('div.grid-tiles', tile('Submitted', `${subs.length}/${students.length}`, `${notSubmitted.length} not yet`),
    tile('Average', fmtPct(avg), `${scored.length} fully marked`),
    tile('Need your marking', n(rows.filter(r => r.pending).length), 'coding / structured answers', { attention: rows.some(r => r.pending) }),
    tile('Not released', n(unreleased.length), a.release_feedback === 'manual' ? 'you release results' : 'released when marked')),
  card(cardHead('Submissions', unreleased.length ? btn(`Release ${unreleased.length} result${unreleased.length > 1 ? 's' : ''}`, async () => { await store.releaseResults(unreleased); toast('Results released', 'ok'); navigate(`/assessment/${a.id}/results`); }, { sm: true, kind: 'primary' }) : null),
    dataTable(rows, [
      { key: 'name', label: 'Student', render: r => h('a', { href: `#/student/${r.s.student_uid}` }, r.name) },
      ...(codes.length > 1 ? [{ key: 'class_code', label: 'Class' }] : []),
      { key: 'score', label: 'Score', num: true, render: r => r.score == null ? '—' : `${r.score}/${r.max}` }, { key: 'pct', label: '%', num: true, render: r => fmtPct(r.pct) },
      { key: 'status', label: 'Status', render: r => h('span', badge(r.status === 'needs_marking' ? 'needs marking' : r.status, r.status === 'scored' ? 'ok' : 'warn'), r.forced ? badge('time ran out', 'info') : null) },
      { key: 'released', label: 'Student sees result', render: r => r.released ? badge('yes', 'ok') : badge('no') },
      { key: 'submitted', label: 'Submitted', render: r => rel(r.submitted) },
      { key: 'mark', label: '', sortable: false, render: r => btn(r.pending ? 'Mark' : 'Review marks', () => markModal(r), { sm: true, kind: r.pending ? 'primary' : '' }) },
    ], { initialSort: { key: 'name', dir: 'asc' }, empty: 'No submissions yet.' }),
    notSubmitted.length ? h('p.small.muted', { style: { marginTop: '.6rem' } }, `Not submitted: ${notSubmitted.map(studentName).join(', ')}`) : null),
  card('Item analysis', h('p.small.muted', 'Facility = share of marked answers that were correct. The most common wrong answer is linked to a misconception when that option is diagnostic.'),
    dataTable(items, [
      { key: 'i', label: '#', num: true }, { key: 'q', label: 'Question', render: x => h('span', x.q.text.slice(0, 90) + (x.q.text.length > 90 ? '…' : ''), h('div.small.muted', `${chapterTitle(x.q.chapter_id)} · ${QUESTION_TYPES[x.q.type]?.label || x.q.type}`)), sort: x => x.q.text },
      { key: 'facility', label: 'Facility', render: x => x.facility == null ? '—' : barRow('', x.facility, `${fmtPct(x.facility)} of ${x.n}`), sort: x => x.facility ?? -1 },
      { key: 'top', label: 'Most common wrong answer', render: x => h('span', x.top, x.mis ? h('div.small', badge(x.mis, 'warn')) : null) },
      { key: 'needs', label: 'To mark', num: true },
    ], { search: false, pageSize: 50 })));
}
