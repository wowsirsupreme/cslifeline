// Intervention workflow: identify → review evidence → assign → record observations → re-assess → compare before/after.
import { h, mount, clear, btn, badge, tile, card, cardHead, callout, empty, pageHead, chart, palette, toast, errorToast, select, field, input, textarea, checkbox, dataTable, fmtPct, fmtDate, rel, confirmDialog } from '../ui/kit.js';
import { classContext, statusBadge, noClasses } from './common.js';
import { loadClassData, classFindings, allQuestions, indexById, studentName } from '../app/data.js';
import { evaluateIntervention, effectiveStatus, ACTIVITY_KINDS, OUTCOME_LABELS, INTERVENTION_STATUS, summariseOutcomes, isOnTarget } from '../engine/interventions.js';
import { targetsOf, STATUS } from '../engine/misconception.js';
import { accuracy } from '../engine/analytics.js';
import { CHAPTERS, CHAPTER_IDS, chapterTitle } from '../engine/curriculum.js';
import { TAXONOMY } from '../engine/taxonomy-data.js';
import { toMs, DAY } from '../engine/stats.js';

const TAX = new Map(TAXONOMY.map(t => [t.id, t]));
const STATUS_LABEL = { planned: 'Planned', active: 'In progress', review_due: 'Review due', completed: 'Completed', cancelled: 'Cancelled' };
const toneOf = st => ({ review_due: 'danger', active: 'info', planned: '', completed: 'ok', cancelled: '' }[st] || '');
const outcomeTone = o => ({ improved: 'ok', declined: 'danger', no_clear_change: 'warn', insufficient_evidence: '' }[o] || '');

export async function interventionsList(ctx) {
  const { store, navigate, query } = ctx;
  const cc = await classContext(ctx);
  if (!cc.codes.length) return h('div', pageHead('Interventions'), noClasses());
  const data = await loadClassData(store, cc.codes, { want: ['students', 'interventions', 'outcomes'] });
  const names = Object.fromEntries(data.students.map(s => [s.id, studentName(s)]));
  const all = data.interventions.map(i => ({ ...i, eff: effectiveStatus(i) }));
  const stSel = select([['', 'All statuses'], ...Object.entries(STATUS_LABEL)], query.status || '');
  stSel.addEventListener('change', () => navigate('/interventions' + (stSel.value ? '?status=' + stSel.value : '')));
  const rows = query.status ? all.filter(i => i.eff === query.status) : all;
  const outcomeSummary = summariseOutcomes(data.outcomes.map(o => ({ action_type: o.action_type, outcome: o.evaluation?.outcome })));
  return h('div', pageHead('Interventions', 'Support you have planned or given, and the evidence on whether it helped.', cc.picker, btn('New intervention', () => navigate('/interventions/new'), { kind: 'primary', ic: 'plus' })),
    h('div.grid-tiles', ...Object.keys(STATUS_LABEL).map(k => tile(STATUS_LABEL[k], all.filter(i => i.eff === k).length, '', { attention: k === 'review_due' && all.some(i => i.eff === k) }))),
    card(cardHead('All interventions', stSel), dataTable(rows, [
      { key: 'student', label: 'Student', render: i => names[i.student_uid] || i.student_uid, sort: i => names[i.student_uid] },
      { key: 'target', label: 'Target', render: i => i.target?.label || i.target?.id || '—', sort: i => i.target?.label },
      { key: 'action_type', label: 'Action', render: i => ACTIVITY_KINDS[i.action_type] || i.action_type },
      { key: 'started_at', label: 'Started', render: i => fmtDate(i.started_at), sort: i => toMs(i.started_at) },
      { key: 'review_date', label: 'Review', render: i => fmtDate(i.review_date), sort: i => toMs(i.review_date) },
      { key: 'eff', label: 'Status', render: i => badge(STATUS_LABEL[i.eff], toneOf(i.eff)) },
      { key: 'outcome', label: 'Latest outcome', render: i => i.latest_outcome ? badge(OUTCOME_LABELS[i.latest_outcome.outcome], outcomeTone(i.latest_outcome.outcome)) : '—', sort: i => i.latest_outcome?.outcome },
    ], { onRow: i => navigate('/intervention/' + i.id), empty: 'No interventions yet. Start from a student or a misconception.' })),
    card(cardHead('Outcomes by type of action', h('span.small.muted', 'Descriptive counts of recorded outcomes. These are associations, not proof that one type of action works better.')),
      outcomeSummary.length ? dataTable(outcomeSummary, [{ key: 'activity_kind', label: 'Action', render: o => ACTIVITY_KINDS[o.activity_kind] || o.activity_kind }, { key: 'total', label: 'Recorded', num: true },
        { key: 'improved', label: 'Improved', num: true }, { key: 'no_clear_change', label: 'No clear change', num: true }, { key: 'declined', label: 'Declined', num: true }, { key: 'insufficient_evidence', label: 'Not enough evidence', num: true }], { search: false }) : h('p.muted', 'No outcomes recorded yet.')));
}

function suggestQuestions(target, qs, studentResponses, n = 6) {
  const answeredRight = new Set(studentResponses.filter(r => r.correct).map(r => r.question_id));
  const pool = qs.filter(q => q.active !== false && q.type !== 'structured' && (target.type === 'chapter' ? q.chapter_id === target.id : targetsOf(q).has(target.id)));
  return [...pool.filter(q => !answeredRight.has(q.id)), ...pool.filter(q => answeredRight.has(q.id))].slice(0, n).map(q => q.id);
}

export async function interventionNew(ctx) {
  const { store, navigate, query } = ctx;
  const cc = await classContext(ctx);
  if (!cc.codes.length) return h('div', pageHead('New intervention'), noClasses());
  const [data, qs] = await Promise.all([loadClassData(store, cc.codes, { want: ['students', 'responses', 'reviews'] }), allQuestions(store)]);
  const qIndex = indexById(qs);
  const findings = classFindings(data.students, data.responses, qIndex, data.reviews);
  const preselected = new Set([...(query.students ? query.students.split(',') : []), ...(query.student ? [query.student] : [])]);
  const studentBoxes = data.students.map(s => ({ s, cb: checkbox(`${studentName(s)} (${s.class_code})`, preselected.has(s.id)) }));
  const tType = select([['misconception', 'A misconception'], ['chapter', 'A chapter']], query.misconception ? 'misconception' : query.chapter ? 'chapter' : 'misconception');
  const misOpts = TAXONOMY.map(t => [t.id, `${t.name} (${t.chapter_id})`]);
  const tMis = select(misOpts, query.misconception || (preselected.size === 1 ? (findings[[...preselected][0]] || []).find(f => ['demonstrated', 'possible'].includes(f.final_status))?.misconception_id : '') || misOpts[0][0]);
  const tCh = select(CHAPTER_IDS.map(id => [id, `${id} ${CHAPTERS[id].title}`]), query.chapter || 'T08');
  const misField = field('Misconception', tMis), chField = field('Chapter', tCh);
  const syncType = () => { misField.hidden = tType.value !== 'misconception'; chField.hidden = tType.value !== 'chapter'; };
  tType.addEventListener('change', syncType); syncType();
  const action = select(Object.entries(ACTIVITY_KINDS), 'targeted_practice');
  const external = input('', { placeholder: 'e.g. WOW Sir quiz "Loops check", code ABC123' });
  const extField = field('Activity details', external, 'Describe the activity so you can find it later.');
  const nQ = select([['4', '4 questions'], ['6', '6 questions'], ['8', '8 questions'], ['10', '10 questions']], '6');
  const nField = field('Practice set size', nQ, 'Questions are chosen from those that target this misconception or chapter, starting with ones the student has not yet answered correctly.');
  const syncAction = () => { extField.hidden = !['external', 'other', 'reteach', 'conversation'].includes(action.value); nField.hidden = action.value !== 'targeted_practice'; };
  action.addEventListener('change', syncAction); syncAction();
  const review = input(new Date(Date.now() + 14 * DAY).toISOString().slice(0, 10), { type: 'date' });
  const notes = textarea('', { rows: 3, placeholder: 'Plan, success criteria, anything to look for' });
  const err = h('div', { role: 'alert' });
  const save = async () => {
    clear(err);
    const chosen = studentBoxes.filter(x => x.cb.input.checked).map(x => x.s);
    if (!chosen.length) return mount(err, callout('Choose at least one student.', 'warn'));
    if (!review.value) return mount(err, callout('Set a review date.', 'warn'));
    const target = tType.value === 'misconception' ? { type: 'misconception', id: tMis.value, label: TAX.get(tMis.value)?.name || tMis.value } : { type: 'chapter', id: tCh.value, label: chapterTitle(tCh.value) };
    try {
      const ids = [];
      for (const s of chosen) {
        const rs = data.responses.filter(r => r.student_uid === s.id);
        const f = (findings[s.id] || []).find(x => x.misconception_id === target.id);
        const on = rs.filter(r => isOnTarget(r, target, qIndex)); const acc = accuracy(on);
        const evidence = target.type === 'misconception' && f ? { status: f.final_status, engine_status: f.status, evidence_strength: f.evidence_strength, counts: f.counts, reason: f.reason, engine_version: f.engine_version }
          : { accuracy: acc.accuracy, n: acc.n };
        const qids = action.value === 'targeted_practice' ? suggestQuestions(target, qs, rs, Number(nQ.value)) : [];
        if (action.value === 'targeted_practice' && !qids.length) throw new Error(`There are no practice questions for "${target.label}" yet.`);
        ids.push(await store.saveIntervention({ student_uid: s.id, class_code: s.class_code, pseudo_id: s.pseudo_id || null, target, title: `${target.label} — ${studentName(s)}`,
          reason: f ? f.reason : `Accuracy on ${target.label}: ${fmtPct(acc.accuracy)} from ${acc.n} answers`, evidence_snapshot: evidence,
          action_type: action.value, activity_details: external.value || null, practice_question_ids: qids, practice_title: `Practice: ${target.label}`,
          started_at: new Date().toISOString(), review_date: new Date(review.value + 'T09:00:00').toISOString(), status: 'active', notes: notes.value, observations: [], is_synthetic: false }));
      }
      toast(`${ids.length} intervention${ids.length > 1 ? 's' : ''} created`, 'ok');
      navigate(ids.length === 1 ? '/intervention/' + ids[0] : '/interventions');
    } catch (e) { errorToast(e, 'Could not create'); }
  };
  return h('div', pageHead('New intervention', 'Record what you will do, for whom, and when you will check whether it helped.', btn('Cancel', () => history.back(), { kind: 'ghost' })),
    h('div.grid-2',
      card('Students', h('div', { style: { maxHeight: '360px', overflowY: 'auto' } }, ...studentBoxes.map(x => x.cb.el))),
      card('Plan', field('The intervention targets', tType), misField, chField, field('Action', action), nField, extField, field('Review date', review), field('Notes', notes), err,
        h('div.card-foot', btn('Create', save, { kind: 'primary' })))));
}

export async function interventionDetail(ctx) {
  const { store, params, navigate } = ctx;
  const ivList = await store.listInterventions(store.me.role === 'admin' ? (await store.listClasses()).map(c => c.id) : store.myClassCodes());
  const iv = ivList.find(i => i.id === params.id);
  if (!iv) return h('div', pageHead('Intervention'), callout('Intervention not found.', 'warn'));
  const [student, data, qs] = await Promise.all([store.getUser(iv.student_uid), loadClassData(store, [iv.class_code], { want: ['responses', 'assignments', 'outcomes'] }), allQuestions(store, { includeArchived: true })]);
  const qIndex = indexById(qs);
  const rs = data.responses.filter(r => r.student_uid === iv.student_uid);
  const assignment = data.assignments.find(a => a.intervention_id === iv.id);
  const ivFull = { ...iv, activity_completed_at: iv.activity_completed_at || assignment?.completed_at || null };
  const ev = evaluateIntervention(ivFull, rs, { questionsById: qIndex });
  const outcomes = data.outcomes.filter(o => o.intervention_id === iv.id).sort((a, b) => (toMs(b.recorded_at) || 0) - (toMs(a.recorded_at) || 0));
  const eff = effectiveStatus(iv);
  const [c1, c2] = palette();
  const obs = textarea('', { rows: 2, placeholder: 'What did you observe?' });
  const statusSel = select(INTERVENTION_STATUS.filter(s => s !== 'review_due').map(s => [s, STATUS_LABEL[s]]), iv.status);
  const reviewDate = input(iv.review_date ? String(iv.review_date).slice(0, 10) : '', { type: 'date' });
  const outNote = textarea('', { rows: 2, placeholder: 'Your interpretation (optional)' });
  const closeCb = checkbox('Mark the intervention completed', false);
  const reload = () => navigate('/intervention/' + iv.id);
  return h('div', pageHead(iv.title || 'Intervention', `${studentName(student)} · ${iv.class_code} · started ${fmtDate(iv.started_at)}`, badge(STATUS_LABEL[eff], toneOf(eff)), btn('All interventions', () => navigate('/interventions'), { kind: 'ghost' })),
    h('div.grid-2',
      card('Plan and evidence at the start', h('p', h('strong', 'Target: '), iv.target?.label, ` (${iv.target?.type})`), h('p', h('strong', 'Action: '), ACTIVITY_KINDS[iv.action_type] || iv.action_type, iv.activity_details ? ` — ${iv.activity_details}` : ''),
        h('p', h('strong', 'Reason: '), iv.reason || '—'), iv.evidence_snapshot?.status ? h('p', h('strong', 'Misconception status when created: '), statusBadge(iv.evidence_snapshot.status), ` evidence ${Number(iv.evidence_snapshot.evidence_strength || 0).toFixed(2)}`) : null,
        iv.notes ? h('p', h('strong', 'Notes: '), iv.notes) : null,
        iv.practice_question_ids?.length ? h('p', h('strong', 'Practice set: '), `${iv.practice_question_ids.length} questions · `, assignment ? (assignment.status === 'completed' ? badge(`completed ${fmtDate(assignment.completed_at)}`, 'ok') : badge('not completed yet', 'warn')) : badge('no assignment found')) : null,
        h('div.form-grid', { style: { marginTop: '.5rem' } }, field('Status', statusSel), field('Review date', reviewDate)),
        h('div.card-foot', btn('Save changes', async () => { try { await store.saveIntervention({ id: iv.id, class_code: iv.class_code, status: statusSel.value, review_date: reviewDate.value ? new Date(reviewDate.value + 'T09:00:00').toISOString() : iv.review_date, ...(statusSel.value === 'completed' ? { completed_at: new Date().toISOString() } : {}) }); toast('Saved', 'ok'); reload(); } catch (e) { errorToast(e); } }, { kind: 'primary', sm: true }))),
      card('Before and after', callout('Compares marked answers on the target in the 6 weeks before the intervention started with answers since. Completing the activity is not counted as improvement — only assessment evidence is.', 'info'),
        h('div.grid-tiles', { style: { marginTop: '1rem' } }, tile('Before', fmtPct(ev.pre.accuracy), `${ev.pre.correct}/${ev.pre.n} correct`), tile('After', fmtPct(ev.post.accuracy), `${ev.post.correct}/${ev.post.n} correct`), tile('Evidence', ev.outcome_label)),
        ev.pre.n && ev.post.n ? chart('bar', { labels: ['Before', 'After'], datasets: [{ label: 'Accuracy %', data: [Math.round(ev.pre.accuracy * 100), Math.round(ev.post.accuracy * 100)], backgroundColor: [c2, c1] }] }, { plugins: { legend: { display: false } }, scales: { y: { min: 0, max: 100 } } }, { sm: true, label: 'Accuracy before and after' }) : null,
        h('p.small', ev.summary),
        h('div.field', h('label', 'Record this evaluation as the outcome'), outNote), closeCb.el,
        h('div.card-foot', btn('Record outcome', async () => { try { await store.recordOutcome(iv, ev, { note: outNote.value, close: closeCb.input.checked }); toast('Outcome recorded', 'ok'); reload(); } catch (e) { errorToast(e); } }, { kind: 'primary', sm: true })))),
    card('Observations', (iv.observations || []).length ? h('ul', ...[...iv.observations].reverse().map(o => h('li', h('strong', fmtDate(o.at, true) + ': '), o.text))) : h('p.muted', 'No observations recorded yet.'),
      h('div.field', obs), btn('Add observation', async () => { if (!obs.value.trim()) return; try { await store.saveIntervention({ id: iv.id, class_code: iv.class_code, observations: [...(iv.observations || []), { at: new Date().toISOString(), text: obs.value.trim(), by: store.auth.uid }] }); reload(); } catch (e) { errorToast(e); } }, { sm: true })),
    card('Recorded outcomes', outcomes.length ? dataTable(outcomes, [{ key: 'recorded_at', label: 'Recorded', render: o => fmtDate(o.recorded_at, true), sort: o => toMs(o.recorded_at) },
      { key: 'outcome', label: 'Outcome', render: o => badge(OUTCOME_LABELS[o.evaluation?.outcome], outcomeTone(o.evaluation?.outcome)) }, { key: 'summary', label: 'Evidence', render: o => h('span.small', o.evaluation?.summary) }, { key: 'note', label: 'Teacher note' }], { search: false }) : h('p.muted', 'No outcome recorded yet. Record one at the review date.')));
}
