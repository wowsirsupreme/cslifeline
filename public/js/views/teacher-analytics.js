// Class analytics, class misconception overview, early-warning predictions.
import { h, mount, btn, badge, tile, card, cardHead, callout, empty, pageHead, barRow, heatCell, chart, palette, toast, errorToast, select, field, input, dataTable, fmtPct, fmtDate, rel, n, confirmDialog } from '../ui/kit.js';
import { classContext, riskBadge, statusBadge, noClasses, provenance } from './common.js';
import { loadClassData, classFindings, allQuestions, indexById, latestPredictionByStudent, studentName } from '../app/data.js';
import { accuracy, byChapter, filterResponses, weeklyTrend, itemStats, accuracyDistribution } from '../engine/analytics.js';
import { aggregateClass, STATUS, medianTimes } from '../engine/misconception.js';
import { computeFeatures, predictLogistic, explain, recommendAction, RISK_LABELS, FEATURES, DEFAULT_THRESHOLDS } from '../engine/risk.js';
import { CHAPTERS, CHAPTER_IDS, chapterTitle } from '../engine/curriculum.js';
import { TAXONOMY } from '../engine/taxonomy-data.js';
import { toMs, DAY } from '../engine/stats.js';

const TAX = new Map(TAXONOMY.map(t => [t.id, t]));

export async function classAnalytics(ctx) {
  const { store, query } = ctx;
  const cc = await classContext(ctx);
  if (!cc.codes.length) return h('div', pageHead('Class analytics'), noClasses());
  const [data, qs] = await Promise.all([loadClassData(store, cc.codes, { want: ['students', 'responses', 'assessments'] }), allQuestions(store, { includeArchived: true })]);
  const qIndex = indexById(qs);
  const f = { chapter_id: query.chapter || '', assessment_id: query.assessment || '', mode: query.mode || '', from: query.from ? Date.parse(query.from) : null, to: query.to ? Date.parse(query.to) + DAY - 1 : null };
  const rs = filterResponses(data.responses, { chapter_id: f.chapter_id || undefined, assessment_id: f.assessment_id || undefined, mode: f.mode || undefined, from: f.from, to: f.to });
  const chSel = select([['', 'All chapters'], ...CHAPTER_IDS.map(id => [id, `${id} ${CHAPTERS[id].title}`])], f.chapter_id);
  const aSel = select([['', 'All assessments and practice'], ...data.assessments.map(a => [a.id, a.title])], f.assessment_id);
  const mSel = select([['', 'All modes'], ['practice', 'Practice'], ['assessment', 'Assessment'], ['challenge', 'Challenge'], ['intervention', 'Intervention practice']], f.mode);
  const from = input(query.from || '', { type: 'date' }), to = input(query.to || '', { type: 'date' });
  const apply = () => { const p = new URLSearchParams(); if (chSel.value) p.set('chapter', chSel.value); if (aSel.value) p.set('assessment', aSel.value); if (mSel.value) p.set('mode', mSel.value); if (from.value) p.set('from', from.value); if (to.value) p.set('to', to.value); ctx.navigate('/analytics' + (p.toString() ? '?' + p : '')); };
  const perStudent = data.students.map(s => ({ uid: s.id, ...accuracy(rs.filter(r => r.student_uid === s.id)) }));
  const dist = accuracyDistribution(perStudent.filter(p => p.n >= 5));
  const items = itemStats(rs, qIndex).filter(i => i.n >= 3);
  const [c1, c2, c3, c4, c5, c6] = palette();
  const classRows = cc.codes.map(code => { const st = data.students.filter(s => s.class_code === code); const r = rs.filter(x => x.class_code === code); const a = accuracy(r);
    return { code, students: st.length, responses: r.length, acc: a.accuracy, n: a.n, active: new Set(r.filter(x => x.recorded_at >= Date.now() - 14 * DAY).map(x => x.student_uid)).size, chapters: byChapter(r) }; });
  const topicRows = f.chapter_id ? Object.entries(rs.reduce((m, r) => { const t = qIndex.get(r.question_id)?.topic || r.topic || 'Other'; (m[t] ||= []).push(r); return m; }, {})).map(([t, list]) => ({ topic: t, ...accuracy(list) })) : [];
  return h('div', pageHead('Class analytics', 'Compare classes, chapters, topics, assessments and periods.', cc.picker), provenance({ ...data, responses: rs }, rs.length !== data.responses.length ? `(filtered from ${data.responses.length})` : ''),
    h('div.card', h('div.form-grid', field('Chapter', chSel), field('Assessment', aSel), field('Mode', mSel), field('From', from), field('To', to)), h('div.row', btn('Apply filters', apply, { kind: 'primary' }), btn('Clear', () => ctx.navigate('/analytics'), { kind: 'ghost' }))),
    h('div', { style: { height: '1rem' } }),
    cc.codes.length > 1 ? card('Class comparison', dataTable(classRows, [{ key: 'code', label: 'Class' }, { key: 'students', label: 'Students', num: true }, { key: 'active', label: 'Active (14 d)', num: true }, { key: 'responses', label: 'Responses', num: true }, { key: 'acc', label: 'Accuracy', num: true, render: r => fmtPct(r.acc) }], { search: false })) : null,
    card('Chapter × class accuracy', h('div.table-wrap', h('table', h('thead', h('tr', h('th', 'Chapter'), ...classRows.map(c => h('th.num', c.code)))),
      h('tbody', ...CHAPTER_IDS.map(id => h('tr', h('td', `${id} ${CHAPTERS[id].title}`), ...classRows.map(c => h('td.num', heatCell(c.chapters[id].n ? c.chapters[id].accuracy : null, c.chapters[id].n))))))))),
    h('div.grid-2',
      card('Distribution of student accuracy', dist.some(b => b.count) ? chart('bar', { labels: dist.map(b => `${b.from}–${b.to}%`), datasets: [{ label: 'Students (≥5 answers)', data: dist.map(b => b.count), backgroundColor: c1 }] }, { plugins: { legend: { display: false } } }, { label: 'Histogram of student accuracy' }) : h('p.muted', 'Not enough data.')),
      card('Accuracy over time by class', (() => { const ds = classRows.map((c, i) => { const t = weeklyTrend(rs.filter(r => r.class_code === c.code)); return { label: c.code, series: t.series }; });
        const weeks = [...new Set(ds.flatMap(d => d.series.map(s => s.week)))].sort();
        return weeks.length >= 2 ? chart('line', { labels: weeks, datasets: ds.map((d, i) => ({ label: d.label, data: weeks.map(w => { const s = d.series.find(x => x.week === w); return s ? Math.round(s.accuracy * 100) : null; }), borderColor: [c1, c2, c3, c4, c5, c6][i % 6], backgroundColor: [c1, c2, c3, c4, c5, c6][i % 6], spanGaps: true, tension: .25 })) }, { scales: { y: { min: 0, max: 100 } } }, { label: 'Weekly accuracy by class' }) : h('p.muted', 'Needs at least two weeks of data.'); })())),
    f.chapter_id ? card(`Topics in ${chapterTitle(f.chapter_id)}`, topicRows.length ? h('div', ...topicRows.sort((a, b) => a.accuracy - b.accuracy).map(t => barRow(t.topic, t.accuracy, `${fmtPct(t.accuracy)} (${t.n})`))) : h('p.muted', 'No data.')) : null,
    card(cardHead('Item analysis', h('span.small.muted', 'Facility = share correct. Low facility with one dominant wrong option often signals a misconception.')), dataTable(items, [
      { key: 'text', label: 'Question', render: i => h('span', { title: i.question_id }, i.text) },
      { key: 'chapter_id', label: 'Chapter' }, { key: 'n', label: 'Answers', num: true },
      { key: 'facility', label: 'Facility', num: true, render: i => heatCell(i.facility, i.n) },
      { key: 'top', label: 'Most chosen wrong option', render: i => { const q = qIndex.get(i.question_id); const wrong = Object.entries(i.choices).filter(([k]) => Number(k) !== q?.answer).sort((a, b) => b[1] - a[1])[0]; if (!wrong || !q?.options) return '—'; const mid = q.option_misconceptions?.[wrong[0]];
        return h('span', `"${String(q.options[wrong[0]]).slice(0, 40)}" × ${wrong[1]}`, mid ? h('div.small.muted', TAX.get(mid)?.name || mid) : null); }, sortable: false },
    ], { pageSize: 15, initialSort: { key: 'facility', dir: 'asc' } })));
}

export async function misconceptionsView(ctx) {
  const { store, query, navigate } = ctx;
  const cc = await classContext(ctx);
  if (!cc.codes.length) return h('div', pageHead('Misconceptions'), noClasses());
  const [data, qs] = await Promise.all([loadClassData(store, cc.codes, { want: ['students', 'responses', 'reviews'] }), allQuestions(store, { includeArchived: true })]);
  const findings = classFindings(data.students, data.responses, indexById(qs), data.reviews);
  const agg = aggregateClass(findings);
  const names = Object.fromEntries(data.students.map(s => [s.id, studentName(s)]));
  const sel = query.m ? agg.find(a => a.misconception_id === query.m) : null;
  const queue = Object.entries(findings).flatMap(([uid, fs]) => fs.filter(f => ['demonstrated', 'possible'].includes(f.status) && f.final_source === 'engine').map(f => ({ uid, ...f })));
  if (sel) {
    const t = TAX.get(sel.misconception_id) || {};
    const byStatus = (st) => Object.entries(sel.students).filter(([, s]) => s === st).map(([uid]) => uid);
    return h('div', pageHead(sel.name, `${chapterTitle(sel.chapter_id)} · ${sel.misconception_id}`, btn('All misconceptions', () => navigate('/misconceptions'), { kind: 'ghost' })),
      h('div.grid-2',
        card('What the learner believes', h('p', t.description), h('h3', 'Observable indicators'), h('ul', ...(t.indicators || []).map(x => h('li', x))), h('h3', 'Possible causes'), h('ul', ...(t.causes || []).map(x => h('li', x))),
          t.related?.length ? h('p.small', 'Related: ', ...t.related.map((r, i) => h('span', i ? ', ' : '', h('a', { href: `#/misconceptions?m=${r}` }, TAX.get(r)?.name || r)))) : null),
        card('Corrective teaching strategies', h('ul', ...(t.strategies || []).map(x => h('li', x))), h('h3', 'Question patterns that reveal it'), h('ul', ...(t.question_patterns || []).map(x => h('li', x))))),
      card(cardHead('Students', byStatus('demonstrated').length ? btn('Plan an intervention', () => navigate(`/interventions/new?misconception=${sel.misconception_id}&students=${byStatus('demonstrated').join(',')}`), { kind: 'primary', sm: true, ic: 'target' }) : null),
        h('div.grid-3', ...['demonstrated', 'possible', 'knowledge_gap'].map(st => h('div', h('h3', STATUS[st].label + ` (${byStatus(st).length})`), byStatus(st).length ? h('ul', ...byStatus(st).map(uid => h('li', h('a', { href: `#/student/${uid}` }, names[uid] || uid)))) : h('p.muted', 'None'))))));
  }
  return h('div', pageHead('Misconceptions', 'Evidence-based: a misconception is only reported after repeated, consistent errors. Teachers can review and correct every classification.', cc.picker), provenance(data),
    card('Across the class', agg.length ? dataTable(agg, [
      { key: 'name', label: 'Misconception', render: a => h('span', h('a', { href: `#/misconceptions?m=${a.misconception_id}` }, a.name), h('div.small.muted', chapterTitle(a.chapter_id))) },
      { key: 'demonstrated', label: 'Demonstrated', num: true, render: a => a.counts.demonstrated, sort: a => a.counts.demonstrated },
      { key: 'possible', label: 'Possible', num: true, render: a => a.counts.possible, sort: a => a.counts.possible },
      { key: 'knowledge_gap', label: 'Knowledge gap', num: true, render: a => a.counts.knowledge_gap, sort: a => a.counts.knowledge_gap },
      { key: 'isolated', label: 'Isolated / insufficient', num: true, render: a => a.counts.isolated_error + a.counts.insufficient_evidence, sort: a => a.counts.isolated_error + a.counts.insufficient_evidence },
      { key: 'diag', label: 'Diagnostic choices', num: true, render: a => a.diagnostic_hits, sort: a => a.diagnostic_hits },
    ], { initialSort: { key: 'demonstrated', dir: 'desc' } }) : empty('No error patterns yet', 'As students answer more questions, patterns appear here.', null, 'brain')),
    card(cardHead(`Review queue (${queue.length})`, h('span.small.muted', 'Engine findings not yet reviewed by a teacher')), queue.length ? dataTable(queue, [
      { key: 'uid', label: 'Student', render: q => h('a', { href: `#/student/${q.uid}` }, names[q.uid] || q.uid), sort: q => names[q.uid] },
      { key: 'name', label: 'Misconception' }, { key: 'status', label: 'Engine status', render: q => statusBadge(q.status) },
      { key: 'evidence_strength', label: 'Evidence', render: q => `${q.strength_label} (${q.evidence_strength.toFixed(2)})`, sort: q => q.evidence_strength },
    ], { pageSize: 10, initialSort: { key: 'evidence_strength', dir: 'desc' } }) : h('p.muted', 'Nothing waiting for review.')));
}

export async function earlyWarning(ctx) {
  const { store, navigate } = ctx;
  const cc = await classContext(ctx);
  if (!cc.codes.length) return h('div', pageHead('Early warning'), noClasses());
  const [data, models] = await Promise.all([loadClassData(store, cc.codes, { want: ['students', 'responses', 'sessions', 'predictions', 'reviews'] }), store.listModels().catch(() => [])]);
  const prod = models.find(m => m.status === 'production');
  const latest = latestPredictionByStudent(data.predictions);
  const names = Object.fromEntries(data.students.map(s => [s.id, studentName(s)]));
  const rows = data.students.map(s => ({ s, id: s.id, name: names[s.id], p: latest[s.id] || null }));
  const scoreBtn = prod ? btn(`Score with ${prod.model_version}`, async () => {
    if (!(await confirmDialog('Score this class?', `Every student in ${cc.codes.join(', ')} will get a new prediction from ${prod.model_version} (${prod.validated_on_real_data ? 'validated' : 'DEMONSTRATION — trained on synthetic data'}). Predictions are stored with the model version and date.`, { confirmLabel: 'Score' }))) return;
    try {
      const med = medianTimes(data.responses); const now = Date.now();
      const art = prod.artefact; if (!art || art.model_type !== 'logistic') throw new Error('The production model has no in-browser logistic artefact. Import predictions from the Python pipeline instead (Administration → Models).');
      const list = data.students.map(s => {
        const feats = computeFeatures(data.responses.filter(r => r.student_uid === s.id), data.sessions.filter(x => x.student_uid === s.id), now, { medianTimeByQuestion: med });
        const r = predictLogistic(art, feats); const ex = explain(r.contributions);
        return { student_uid: s.id, pseudo_id: s.pseudo_id || null, class_code: s.class_code, risk_probability: r.risk_probability, risk_category: r.risk_category, features: feats, feature_version: art.feature_version,
          contributions: r.contributions.slice(0, 8), explanation: ex, recommended_action: recommendAction(r.risk_category, ex), imputed: r.imputed, thresholds: art.thresholds, reason: r.reason || null };
      });
      const nSaved = await store.savePredictions(list, prod); toast(`${nSaved} predictions saved`, 'ok'); navigate('/early-warning');
    } catch (e) { errorToast(e, 'Scoring'); }
  }, { kind: 'primary', ic: 'play' }) : null;
  const dist = ['high', 'moderate', 'low', 'unknown'].map(k => rows.filter(r => r.p?.risk_category === k).length);
  return h('div', pageHead('Early warning', 'Predictions are early-warning indicators to help you decide whom to talk to first. They are never shown to students.', cc.picker, scoreBtn), provenance(data),
    prod ? (prod.validated_on_real_data ? callout(`Production model ${prod.model_version} (${prod.model_name || prod.model_type}). Thresholds: moderate ≥ ${prod.artefact?.thresholds?.moderate ?? DEFAULT_THRESHOLDS.moderate}, high ≥ ${prod.artefact?.thresholds?.high ?? DEFAULT_THRESHOLDS.high}.`, 'info')
      : callout([h('strong', 'Demonstration model. '), `${prod.model_version} was trained on synthetic data. Its predictions demonstrate the workflow only. Measured evaluation on synthetic data: ${prod.metrics?.test?.pr_auc != null ? 'PR-AUC ' + prod.metrics.test.pr_auc.toFixed(2) + ', recall ' + (prod.metrics.test.recall ?? 0).toFixed(2) : 'see the model registry'}. These numbers say nothing about real learners.`], 'demo'))
      : callout('No production model is registered, so no predictions are made. An administrator can register a model from the research pipeline (Administration → Models). Until then the dashboard uses only transparent rules (shown with their source), never estimated risk.', 'warn'),
    h('div.grid-tiles', { style: { marginTop: '1rem' } }, tile('High', dist[0], 'students', { attention: dist[0] > 0 }), tile('Moderate', dist[1], 'students'), tile('Low', dist[2], 'students'), tile('No prediction / not enough data', dist[3] + rows.filter(r => !r.p).length, 'students')),
    card('Students', dataTable(rows, [
      { key: 'name', label: 'Student', render: r => h('a', { href: `#/student/${r.id}` }, r.name) },
      { key: 'p', label: 'Risk', render: r => riskBadge(r.p), sort: r => r.p?.risk_probability ?? -1 },
      { key: 'factor', label: 'Main factor', render: r => r.p ? ((r.p.explanation || explain(r.p.contributions || []))[0]?.text || '—') : '—', sortable: false },
      { key: 'model', label: 'Model', render: r => r.p?.model_version || '—' },
      { key: 'when', label: 'Predicted', render: r => r.p ? rel(toMs(r.p.predicted_at)) : '—', sort: r => toMs(r.p?.predicted_at) || 0 },
    ], { initialSort: { key: 'p', dir: 'desc' } })),
    card('How to read these predictions', h('ul',
      h('li', 'The probability is the model\'s estimate that the student\'s assessment accuracy in the next four weeks will fall below 50%. It is not a grade or a judgement of ability.'),
      h('li', 'False positives (flagged students who would have been fine) and false negatives (students the model misses) both happen. A conversation with the student is the next step, not a label.'),
      h('li', 'Behavioural signals such as page interruptions are deliberately not used as predictors.'),
      h('li', 'Each prediction stores its model version, date and the features used, so it can be audited later.'))));
}
export { FEATURES, RISK_LABELS };
