// Teacher dashboard, student list and individual student analytics.
import { h, mount, clear, btn, badge, tile, card, cardHead, callout, empty, pageHead, barRow, chart, palette, modal, toast, errorToast, select, field, textarea, tabs, dataTable, fmtPct, fmtDate, rel, n } from '../ui/kit.js';
import { classContext, riskBadge, statusBadge, noClasses, provenance } from './common.js';
import { loadClassData, classFindings, attentionList, allQuestions, indexById, latestPredictionByStudent, studentName } from '../app/data.js';
import { classSummary, studentSummary, weeklyTrend, accuracy } from '../engine/analytics.js';
import { aggregateClass, STATUS } from '../engine/misconception.js';
import { explain, recommendAction, RISK_LABELS, FEATURES } from '../engine/risk.js';
import { effectiveStatus, OUTCOME_LABELS } from '../engine/interventions.js';
import { CHAPTERS, CHAPTER_IDS, chapterTitle } from '../engine/curriculum.js';
import { TAXONOMY } from '../engine/taxonomy-data.js';
import { toMs, DAY, median } from '../engine/stats.js';

const TAX = new Map(TAXONOMY.map(t => [t.id, t]));

export async function dashboard(ctx) {
  const { store, navigate } = ctx;
  const cc = await classContext(ctx);
  if (!cc.codes.length) return h('div', pageHead('Dashboard'), noClasses());
  const [data, qs] = await Promise.all([loadClassData(store, cc.codes, { want: ['students', 'responses', 'sessions', 'assessments', 'submissions', 'predictions', 'interventions', 'reviews'] }), allQuestions(store)]);
  const qIndex = indexById(qs);
  const sum = classSummary(data.students.map(s => ({ ...s, uid: s.id })), data.responses, { sessions: data.sessions, assessments: data.assessments, submissions: data.submissions });
  const findings = classFindings(data.students, data.responses, qIndex, data.reviews);
  const attention = attentionList(data.students, data.responses, findings, data.predictions, data.interventions);
  const mis = aggregateClass(findings).filter(m => m.counts.demonstrated + m.counts.possible > 0).slice(0, 6);
  const latestA = [...data.assessments].filter(a => a.status !== 'draft').sort((a, b) => (toMs(b.created_at) || 0) - (toMs(a.created_at) || 0))[0];
  const part = latestA ? sum.participation.find(p => p.assessment_id === latestA.id) : null;
  const ivs = data.interventions.map(i => ({ ...i, eff: effectiveStatus(i) }));
  const ivCount = (st) => ivs.filter(i => i.eff === st).length;
  const [c1, c2] = palette();
  const names = Object.fromEntries(data.students.map(s => [s.id, studentName(s)]));
  const now = new Date();
  const refresh = btn('Refresh', () => navigate(location.hash.replace(/^#/, '') || '/'), { sm: true, ic: 'clock', title: 'Load the latest records' });
  return h('div', pageHead('Class overview', `${cc.current === 'ALL' ? 'All your classes' : cc.current} · updated ${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`, cc.picker, refresh), provenance(data),
    h('div.grid-tiles',
      tile('Students', n(sum.total_students), `${sum.students_with_data} with answers`),
      tile('Active', n(sum.active_students), `answered in the last ${sum.active_window_days} days`),
      tile('Participation', part ? `${part.submitted}/${part.total}` : '—', latestA ? `latest assessment: ${latestA.title}` : 'no assessment published yet'),
      tile('Class accuracy', fmtPct(sum.class_accuracy), `${n(sum.responses)} responses`),
      tile('Need attention', n(attention.length), 'see reasons below', { attention: attention.length > 0 }),
      tile('Interventions', `${ivCount('active') + ivCount('planned')} open`, `${ivCount('review_due')} review due · ${ivCount('completed')} completed`, { attention: ivCount('review_due') > 0 })),
    h('div.grid-2',
      card(cardHead('Students requiring attention', btn('All students', () => navigate('/students'), { sm: true })), attention.length ? h('div.stack', ...attention.slice(0, 8).map(a => h('div', { style: { borderTop: '1px solid var(--line)', paddingTop: '.55rem' } },
        h('div.row.between', h('a', { href: `#/student/${a.student.id}` }, h('strong', studentName(a.student))), h('span.row', riskBadge(a.prediction))),
        h('ul', { style: { margin: '.3rem 0 0', paddingLeft: '1.1rem' } }, ...a.reasons.map(r => h('li.small', r.text, ' ', h('span.muted', `(${r.source})`)))))),
        attention.length > 8 ? h('p.small.muted', `and ${attention.length - 8} more`) : null) : empty('No one flagged', 'No student currently meets any attention rule, misconception or risk threshold.', null, 'check')),
      card(cardHead('Most frequent misconceptions', btn('Details', () => navigate('/misconceptions'), { sm: true })), mis.length ? misBars(mis)
        : empty('Not enough evidence yet', 'Misconceptions appear only after repeated, consistent errors — never from one wrong answer.', null, 'brain'))),
    h('div.grid-2',
      card('Chapter-level difficulties', sum.difficult_chapters.length ? h('div', ...sum.difficult_chapters.map(c => barRow(c.title, c.accuracy, `${fmtPct(c.accuracy)} (${c.n})`))) : h('p.muted', 'Chapters appear once they have at least 5 marked answers.')),
      card('Performance trend', sum.trend.series.length >= 2 ? chart('line', { labels: sum.trend.series.map(w => w.week), datasets: [
        { label: 'Accuracy %', data: sum.trend.series.map(w => Math.round(w.accuracy * 100)), borderColor: c1, backgroundColor: c1, yAxisID: 'y', tension: .25 },
        { label: 'Answers', data: sum.trend.series.map(w => w.n), borderColor: c2, backgroundColor: c2, yAxisID: 'y2', type: 'bar' }] },
        { scales: { y: { min: 0, max: 100, position: 'left' }, y2: { position: 'right', grid: { display: false }, beginAtZero: true } } }, { label: 'Weekly class accuracy' }) : h('p.muted', 'The trend appears after two weeks of data.'))),
    card(cardHead('Recent assessment activity', btn('Assessments', () => navigate('/assessments'), { sm: true })), dataTable([...data.submissions].sort((a, b) => (toMs(b.submitted_at) || 0) - (toMs(a.submitted_at) || 0)).slice(0, 40), [
      { key: 'student_uid', label: 'Student', render: s => h('a', { href: `#/student/${s.student_uid}` }, names[s.student_uid] || s.student_uid), sort: s => names[s.student_uid] },
      { key: 'assessment_id', label: 'Assessment', render: s => data.assessments.find(a => a.id === s.assessment_id)?.title || s.assessment_id },
      { key: 'status', label: 'Status', render: s => badge(s.status, s.status === 'scored' ? 'ok' : s.status === 'needs_marking' ? 'warn' : 'info') },
      { key: 'submitted_at', label: 'Submitted', render: s => rel(toMs(s.submitted_at)), sort: s => toMs(s.submitted_at) },
    ], { search: false, pageSize: 8, empty: 'No submissions yet.' })));
}

// v3 topic radar: accuracy per chapter that has marked answers (needs three or more).
function topicRadar(sum) {
  const ids = CHAPTER_IDS.filter(id => sum.chapters[id]?.n);
  if (ids.length < 3) return card('Topic radar', h('p.muted', 'The radar appears once the student has marked answers in at least three chapters.'));
  const [c1] = palette();
  const ink = getComputedStyle(document.documentElement).getPropertyValue('--ink-2').trim(), grid = getComputedStyle(document.documentElement).getPropertyValue('--line').trim();
  return card('Topic radar', chart('radar', { labels: ids, datasets: [{ label: 'Accuracy %', data: ids.map(id => Math.round(sum.chapters[id].accuracy * 100)), borderColor: c1, backgroundColor: c1 + '33', pointBackgroundColor: c1, pointRadius: 3, borderWidth: 2 }] },
    { plugins: { legend: { display: false }, tooltip: { callbacks: { title: (it) => `${it[0].label} ${CHAPTERS[it[0].label].title}`, label: (it) => `${it.raw}% (${sum.chapters[it.label].n} answers)` } } },
      scales: { r: { min: 0, max: 100, ticks: { stepSize: 25, color: ink, backdropColor: 'transparent', font: { size: 10 } }, grid: { color: grid }, angleLines: { color: grid }, pointLabels: { color: ink, font: { size: 11, weight: '600' } } } } },
    { label: 'Accuracy by chapter, radar chart', height: 300 }),
    h('p.small.muted', 'Only chapters with marked answers are shown. Hover a point for the chapter name and the number of answers.'));
}

// Accuracy by chapter, split by Paper 1 (theory) and Paper 2 (problem solving and programming).
function chapterPapers(sum) {
  const body = h('div');
  const show = (paper) => mount(body, ...CHAPTER_IDS.filter(id => CHAPTERS[id].paper === paper).map(id => barRow(`${id} ${CHAPTERS[id].title}`, sum.chapters[id].accuracy, sum.chapters[id].n ? `${fmtPct(sum.chapters[id].accuracy)} (${sum.chapters[id].n})` : '—')));
  const seg = h('div.seg.seg-sm', { role: 'tablist', 'aria-label': 'Paper' });
  for (const [id, label] of [['P1', 'Paper 1'], ['P2', 'Paper 2']]) seg.appendChild(h('button', { type: 'button', role: 'tab', class: 'seg-btn', 'data-id': id, 'aria-selected': String(id === 'P1'),
    on: { click: () => { [...seg.children].forEach(b => b.setAttribute('aria-selected', String(b.dataset.id === id))); show(id); } } }, label));
  show('P1');
  return card(cardHead('Accuracy by chapter', seg), body);
}

// v3 bar list: uppercase name, thin bar, count. The most frequent is crimson, the rest amber.
function misBars(mis) {
  const total = (m) => m.counts.demonstrated + m.counts.possible;
  const max = Math.max(...mis.map(total), 1);
  return h('div.mis-bars', ...mis.map((m, i) => h('a.mis-bar', { href: `#/misconceptions?m=${m.misconception_id}`, title: `${m.counts.demonstrated} demonstrated · ${m.counts.possible} possible · ${m.counts.knowledge_gap || 0} knowledge gap — ${chapterTitle(m.chapter_id)}` },
    h('div.mis-top', h('span.mis-name', m.name), h('span.mis-n', `${total(m)} ${total(m) === 1 ? 'student' : 'students'}`)),
    h('div.mis-track', h('div', { class: 'mis-fill ' + (i === 0 ? 'crimson' : 'amber'), style: { width: `${Math.round(total(m) / max * 100)}%` } })),
    h('div.small.muted', `${m.counts.demonstrated} demonstrated · ${m.counts.possible} possible · ${chapterTitle(m.chapter_id)}`))),
    h('p.small.muted', { style: { marginTop: '.6rem' } }, 'Counts are students, not answers. A flag needs repeated, consistent errors.'));
}

export async function studentsList(ctx) {
  const { store, navigate } = ctx;
  const cc = await classContext(ctx);
  if (!cc.codes.length) return h('div', pageHead('Students'), noClasses());
  const [data, qs] = await Promise.all([loadClassData(store, cc.codes, { want: ['students', 'responses', 'predictions', 'interventions', 'reviews'] }), allQuestions(store)]);
  const findings = classFindings(data.students, data.responses, indexById(qs), data.reviews);
  const pred = latestPredictionByStudent(data.predictions);
  const flagged = new Set(attentionList(data.students, data.responses, findings, data.predictions, data.interventions).map(a => a.student.id));
  const rows = data.students.map(s => {
    const rs = data.responses.filter(r => r.student_uid === s.id); const acc = accuracy(rs);
    const f = findings[s.id] || [];
    return { s, id: s.id, name: studentName(s), class_code: s.class_code, n: acc.n, acc: acc.accuracy, last: rs.reduce((m, r) => Math.max(m, r.recorded_at || 0), 0) || null,
      dem: f.filter(x => x.final_status === 'demonstrated').length, pos: f.filter(x => x.final_status === 'possible').length, pred: pred[s.id] || null,
      open: data.interventions.filter(i => i.student_uid === s.id && !['completed', 'cancelled'].includes(i.status)).length, flagged: flagged.has(s.id), status: s.status };
  });
  const only = h('input', { type: 'checkbox' });
  const tbl = dataTable(rows, [
    { key: 'name', label: 'Student', render: r => h('span', h('strong', r.name), r.status === 'suspended' ? badge('suspended', 'warn') : null, r.flagged ? h('span', ' ', badge('attention', 'danger')) : null) },
    ...(cc.codes.length > 1 ? [{ key: 'class_code', label: 'Class' }] : []),
    { key: 'n', label: 'Answers', num: true }, { key: 'acc', label: 'Accuracy', num: true, render: r => fmtPct(r.acc) },
    { key: 'last', label: 'Last active', render: r => rel(r.last), sort: r => r.last || 0 },
    { key: 'dem', label: 'Misconceptions', render: r => r.dem || r.pos ? h('span', r.dem ? badge(`${r.dem} demonstrated`, 'danger') : null, ' ', r.pos ? badge(`${r.pos} possible`, 'warn') : null) : '—', sort: r => r.dem * 10 + r.pos },
    { key: 'pred', label: 'Early warning', render: r => riskBadge(r.pred), sort: r => r.pred?.risk_probability ?? -1 },
    { key: 'open', label: 'Open interventions', num: true },
  ], { onRow: r => navigate('/student/' + r.id), initialSort: { key: 'name', dir: 'asc' }, empty: 'No students have joined these classes yet. Share the class code or create roster accounts.' });
  only.addEventListener('change', () => tbl.update(only.checked ? rows.filter(r => r.flagged) : rows));
  return h('div', pageHead('Students', 'Select a student for question-level detail, misconceptions, predictions and interventions.', cc.picker), provenance(data),
    h('div.toolbar', h('label.check', only, h('span', 'Show only students requiring attention'))), tbl);
}

export async function studentDetail(ctx) {
  const { store, params, navigate } = ctx;
  const s = await store.getUser(params.uid);
  if (!s) return h('div', pageHead('Student'), callout('Student not found or not in your classes.', 'warn'));
  const data = await loadClassData(store, [s.class_code], { want: ['responses', 'sessions', 'predictions', 'interventions', 'reviews', 'submissions'] });
  const qs = await allQuestions(store, { includeArchived: true }); const qIndex = indexById(qs);
  const rs = data.responses.filter(r => r.student_uid === s.id).sort((a, b) => b.recorded_at - a.recorded_at);
  const sessions = data.sessions.filter(x => x.student_uid === s.id);
  const sum = studentSummary(rs, sessions);
  const findings = classFindings([s], rs, qIndex, data.reviews)[s.id] || [];
  const preds = data.predictions.filter(p => p.student_uid === s.id).sort((a, b) => (toMs(b.predicted_at) || 0) - (toMs(a.predicted_at) || 0));
  const ivs = data.interventions.filter(i => i.student_uid === s.id);
  const body = h('div');
  const [c1] = palette();
  const views = {
    overview: () => h('div', h('div.grid-tiles.student-stats', tile('Marked answers', n(sum.marked)), tile('Accuracy', fmtPct(sum.accuracy), sum.accuracy_ci?.lo != null ? `95% CI ${fmtPct(sum.accuracy_ci.lo)}–${fmtPct(sum.accuracy_ci.hi)}` : ''),
        tile('Assessment accuracy', fmtPct(sum.assessment_accuracy), `${sum.assessment_n} answers`), tile('Active days (28)', sum.active_days_28), tile('Sessions completed', `${sum.sessions_completed}/${sum.sessions_started}`), tile('Awaiting marking', sum.awaiting_marking)),
      h('div.grid-2', topicRadar(sum), chapterPapers(sum)),
      card('Accuracy by week', sum.trend.series.length ? chart('line', { labels: sum.trend.series.map(w => w.week), datasets: [{ label: 'Accuracy %', data: sum.trend.series.map(w => Math.round(w.accuracy * 100)), borderColor: c1, backgroundColor: c1, tension: .25 }] }, { scales: { y: { min: 0, max: 100 } } }, { label: 'Weekly accuracy' }) : h('p.muted', 'No data yet.'),
          sum.trend.slope_per_week != null ? h('p.small.muted', `Trend: ${sum.trend.slope_per_week >= 0 ? '+' : ''}${(sum.trend.slope_per_week * 100).toFixed(1)} points per week (least-squares over weekly accuracy).`) : null)),
    responses: () => {
      const wrongTwice = Object.entries(rs.filter(r => r.correct === false).reduce((m, r) => { m[r.question_id] = (m[r.question_id] || 0) + 1; return m; }, {})).filter(([, c]) => c >= 2);
      const repeatedChoice = Object.entries(rs.filter(r => r.correct === false && r.chosen != null).reduce((m, r) => { const k = r.question_id + '|' + r.chosen; m[k] = (m[k] || 0) + 1; return m; }, {})).filter(([, c]) => c >= 2);
      return h('div', (wrongTwice.length || repeatedChoice.length) ? card('Repeated incorrect patterns', h('ul', ...wrongTwice.map(([q, c]) => h('li', `Answered wrongly ${c} times: `, h('em', (qIndex.get(q)?.text || q).slice(0, 100)))),
          ...repeatedChoice.map(([k, c]) => { const [q, opt] = k.split('|'); const qq = qIndex.get(q); return h('li', `Chose the same wrong option ${c} times — "${qq?.options?.[opt] ?? opt}"${qq?.option_misconceptions?.[opt] ? ` (linked to ${TAX.get(qq.option_misconceptions[opt])?.name})` : ''}`); }))) : null,
        card('Question-level responses', dataTable(rs, [
          { key: 'recorded_at', label: 'When', render: r => fmtDate(r.recorded_at, true), sort: r => r.recorded_at },
          { key: 'q', label: 'Question', render: r => h('span', { title: qIndex.get(r.question_id)?.text || '' }, (qIndex.get(r.question_id)?.text || r.question_id).slice(0, 70)), sort: r => r.question_id },
          { key: 'chapter_id', label: 'Chapter' }, { key: 'mode', label: 'Mode' },
          { key: 'answer', label: 'Answer given', render: r => { const q = qIndex.get(r.question_id); if (r.chosen != null && q?.options) return q.options[r.chosen] ?? String(r.chosen); return typeof r.answer === 'string' ? r.answer.slice(0, 60) : r.answer == null ? '—' : JSON.stringify(r.answer).slice(0, 60); } },
          { key: 'correct', label: 'Result', render: r => r.correct === true ? badge('correct', 'ok') : r.correct === false ? badge('wrong', 'danger') : r.needs_manual ? badge('to mark', 'warn') : badge(`${r.score}/${r.max}`, 'warn'), sort: r => (r.correct === true ? 2 : r.correct === false ? 0 : 1) },
          { key: 'time_ms', label: 'Time', num: true, render: r => r.time_ms ? Math.round(r.time_ms / 1000) + 's' : '—' },
          { key: 'revisions', label: 'Changes', num: true }, { key: 'hint_used', label: 'Hint', render: r => r.hint_used ? 'yes' : '' },
        ], { pageSize: 20 })));
    },
    misconceptions: () => card(cardHead('Misconceptions', h('span.small.muted', 'Engine ' + (findings[0]?.engine_version || 'mce-1.0'))), findings.length ? dataTable(findings, [
      { key: 'name', label: 'Misconception', render: f => h('span', h('strong', f.name), h('div.small.muted', chapterTitle(f.chapter_id))) },
      { key: 'final_status', label: 'Status', render: f => h('span', statusBadge(f.final_status), f.final_source === 'teacher' ? h('div.small.muted', `reviewed (engine said: ${STATUS[f.status].label})`) : null), sort: f => STATUS[f.final_status].rank },
      { key: 'evidence_strength', label: 'Evidence', render: f => `${f.strength_label} (${f.evidence_strength.toFixed(2)})`, sort: f => f.evidence_strength },
      { key: 'counts', label: 'Errors / opportunities', render: f => `${f.counts.errors} / ${f.counts.opportunities} · ${f.counts.diagnostic_hits} diagnostic`, sort: f => f.counts.errors },
      { key: 'trend', label: 'Trend' },
      { key: 'reason', label: 'Why', render: f => h('span.small', f.reason) },
      { key: 'act', label: '', sortable: false, render: f => h('span.row', btn('Evidence', () => evidenceModal(f, qIndex), { sm: true }), btn('Review', () => reviewModal(store, s, f, () => ctx.navigate(location.hash.slice(1))), { sm: true })) },
    ], { search: false, pageSize: 30 }) : empty('No misconceptions found', 'There are no repeated error patterns in this student\'s answers.', null, 'brain')),
    prediction: () => predictionPanel(preds, findings),
    interventions: () => card(cardHead('Interventions', btn('New intervention', () => navigate(`/interventions/new?student=${s.id}`), { kind: 'primary', sm: true, ic: 'plus' })), ivs.length ? dataTable(ivs, [
      { key: 'title', label: 'Intervention', render: i => h('a', { href: `#/intervention/${i.id}` }, i.title || i.target?.label || 'Intervention') },
      { key: 'status', label: 'Status', render: i => badge(effectiveStatus(i)), sort: i => effectiveStatus(i) },
      { key: 'review_date', label: 'Review', render: i => fmtDate(i.review_date), sort: i => toMs(i.review_date) },
      { key: 'outcome', label: 'Latest outcome', render: i => i.latest_outcome ? badge(OUTCOME_LABELS[i.latest_outcome.outcome]) : '—' },
    ], { search: false }) : empty('No interventions', 'Record an intervention to track whether support improves understanding.', null, 'target')),
    behaviour: () => {
      const t = rs.filter(r => r.time_ms > 0);
      return card('Learning behaviour', callout('These measures describe how the student works. They are context for a conversation, not evidence of effort or honesty. Page interruptions happen when a phone locks, a notification opens or an accessibility tool is used.', 'info'),
        h('div.grid-tiles', { style: { marginTop: '1rem' } }, tile('Median time per answer', t.length ? Math.round(median(t.map(r => r.time_ms)) / 1000) + 's' : '—'), tile('Answers changed', rs.length ? fmtPct(rs.filter(r => r.revisions > 0).length / rs.length) : '—', 'of answers had at least one change'),
          tile('Hints opened', rs.filter(r => r.mode === 'practice').length ? fmtPct(rs.filter(r => r.hint_used).length / rs.filter(r => r.mode === 'practice').length) : '—', 'of practice answers'),
          tile('Answers with a page interruption', rs.length ? fmtPct(rs.filter(r => r.visibility_interruptions > 0).length / rs.length) : '—', 'context only')));
    },
  };
  const pred0 = preds[0];
  return h('div', pageHead(studentName(s), `Class ${s.class_code} · research ID ${s.pseudo_id || '—'} · consent: ${s.consent?.research_use || 'not recorded'}`,
      riskBadge(pred0), btn('New intervention', () => navigate(`/interventions/new?student=${s.id}`), { kind: 'primary', ic: 'plus' }), btn('Back', () => navigate('/students'), { kind: 'ghost' })),
    tabs([{ id: 'overview', label: 'Overview' }, { id: 'responses', label: 'Responses' }, { id: 'misconceptions', label: `Misconceptions (${findings.filter(f => ['demonstrated', 'possible'].includes(f.final_status)).length})` }, { id: 'prediction', label: 'Early warning' }, { id: 'interventions', label: `Interventions (${ivs.length})` }, { id: 'behaviour', label: 'Behaviour' }],
      (id) => mount(body, views[id]())), body);
}

function evidenceModal(f, qIndex) {
  modal({ title: f.name, wide: true, body: h('div', h('p', f.reason), TAX.get(f.misconception_id) ? callout([h('strong', 'About this misconception. '), TAX.get(f.misconception_id).description]) : null,
    h('div.table-wrap', { style: { marginTop: '1rem' } }, h('table', h('thead', h('tr', h('th', 'When'), h('th', 'Question'), h('th', 'Result'), h('th', 'Chose a diagnostic distractor'))),
      h('tbody', ...f.evidence.map(e => h('tr', h('td', fmtDate(e.recorded_at, true)), h('td', (qIndex.get(e.question_id)?.text || e.question_id).slice(0, 90)), h('td', e.correct ? badge('correct', 'ok') : badge('wrong', 'danger')), h('td', e.diagnostic_hit ? 'yes' : '')))))),
    TAX.get(f.misconception_id)?.strategies?.length ? h('div', { style: { marginTop: '1rem' } }, h('h3', 'Suggested teaching strategies'), h('ul', ...TAX.get(f.misconception_id).strategies.map(x => h('li', x)))) : null) });
}

function reviewModal(store, s, f, done) {
  const st = select(Object.entries(STATUS).map(([k, v]) => [k, v.label]).concat([['not_misconception', 'Not a misconception (engine was wrong)']]), f.final_status);
  const note = textarea(f.review?.note || '', { rows: 3, placeholder: 'What did you observe? (kept with the label for research)' });
  modal({ title: `Review: ${f.name}`, body: h('div', h('p.small', `Engine classification: ${STATUS[f.status].label}, evidence ${f.strength_label} (${f.evidence_strength.toFixed(2)}). Your review is stored separately and never overwrites the engine output.`), field('Your classification', st), field('Note', note)),
    actions: [{ label: 'Cancel' }, { label: 'Save review', kind: 'primary', onClick: async () => {
      try { await store.saveReview({ student_uid: s.id, class_code: s.class_code, misconception_id: f.misconception_id, decision: st.value, note: note.value, automated_status: f.status, automated_strength: f.evidence_strength }); toast('Review saved', 'ok'); done(); }
      catch (e) { errorToast(e); return false; }
    } }] });
}

export function predictionPanel(preds, findings = []) {
  if (!preds.length) return card('Early warning', empty('No prediction for this student', 'Predictions appear when an administrator registers a model and a teacher scores the class from Early warning, or when the research pipeline imports predictions. Nothing is estimated in their absence.', null, 'alert'));
  const p = preds[0];
  const ex = p.explanation || explain(p.contributions || []);
  return h('div', card(cardHead('Latest prediction', riskBadge(p)),
      p.prediction_status !== 'validated' ? callout('This prediction comes from a demonstration model trained on synthetic data. It shows how the early-warning feature works; it is not a validated judgement about this student.', 'demo') : callout('An early-warning indicator, not a diagnosis. Use it to decide whom to talk to first.', 'info'),
      h('div.grid-tiles', { style: { marginTop: '1rem' } }, tile('Risk category', RISK_LABELS[p.risk_category] || p.risk_category), tile('Probability', fmtPct(p.risk_probability)), tile('Model', p.model_version), tile('Predicted', fmtDate(p.predicted_at, true))),
      h('h3', 'Main contributing factors'), ex.length ? h('ul', ...ex.map(e => h('li', e.text, ' ', h('span.small.muted', `(+${e.contribution.toFixed(2)} log-odds)`)))) : h('p.muted', 'No factor increased the risk estimate.'),
      h('h3', 'Suggested action'), h('p', p.recommended_action || recommendAction(p.risk_category, ex, findings))),
    preds.length > 1 ? card('Prediction history', dataTable(preds, [{ key: 'predicted_at', label: 'Date', render: x => fmtDate(x.predicted_at, true), sort: x => toMs(x.predicted_at) }, { key: 'risk_category', label: 'Category' }, { key: 'risk_probability', label: 'Probability', render: x => fmtPct(x.risk_probability), num: true }, { key: 'model_version', label: 'Model' }, { key: 'prediction_status', label: 'Status' }], { search: false })) : null);
}
export { FEATURES };
