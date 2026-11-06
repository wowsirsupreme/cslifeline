// Reports (print / PDF and CSV) and the pseudonymised research export.
// Every report states its data source, filters and generation date, and is limited to the teacher's classes.
import { h, btn, badge, card, callout, pageHead, field, input, select, checkbox, toast, errorToast, download, barRow, chart, palette, fmtPct, fmtDate, n } from '../ui/kit.js';
import { classContext, noClasses } from './common.js';
import { loadClassData, classFindings, latestPredictionByStudent, allQuestions, indexById, studentName } from '../app/data.js';
import { classSummary, studentSummary, accuracy, byChapter } from '../engine/analytics.js';
import { aggregateClass, STATUS } from '../engine/misconception.js';
import { evaluateIntervention, effectiveStatus, OUTCOME_LABELS, ACTIVITY_KINDS } from '../engine/interventions.js';
import { explain, RISK_LABELS } from '../engine/risk.js';
import { CHAPTERS, CHAPTER_IDS, chapterTitle } from '../engine/curriculum.js';
import { toCSV } from '../engine/csv.js';
import { toMs, DAY } from '../core/util.js';

const TYPES = {
  student: 'Individual student report', class: 'Class performance report', chapter: 'Chapter performance report', misconceptions: 'Misconception report',
  atrisk: 'Early-warning (at-risk) report', interventions: 'Intervention report', progress: 'Progress comparison report',
};
const dateInput = (ms) => input(new Date(ms).toISOString().slice(0, 10), { type: 'date' });

export async function reportsView(ctx) {
  const { store } = ctx;
  const cc = await classContext(ctx);
  if (!cc.codes.length) return h('div', pageHead('Reports'), noClasses());
  const type = select(Object.entries(TYPES), ctx.query?.type || 'class');
  const from = dateInput(Date.now() - 90 * DAY), to = dateInput(Date.now());
  const midFrom = dateInput(Date.now() - 90 * DAY), midTo = dateInput(Date.now() - 45 * DAY);
  const chapter = select(CHAPTER_IDS.map(id => [id, `${id} ${CHAPTERS[id].title}`]), 'T08');
  const students = await store.listStudents(cc.codes);
  const student = select(students.map(s => [s.id, `${studentName(s)} (${s.class_code})`]).sort((a, b) => a[1].localeCompare(b[1])), ctx.query?.student || students[0]?.id);
  const includeRisk = checkbox('Include the early-warning indicator (teacher use only — leave unticked for reports shared with families)', false);
  const out = h('div');
  const filt = h('div.form-grid');
  const drawFilters = () => {
    const t = type.value;
    filt.replaceChildren(field('Report', type), field('From', from), field('To', to),
      t === 'chapter' ? field('Chapter', chapter) : null, t === 'student' ? field('Student', student) : null,
      t === 'progress' ? field('Compare with period from', midFrom) : null, t === 'progress' ? field('…to', midTo) : null);
  };
  type.addEventListener('change', drawFilters); drawFilters();

  const generate = async () => {
    out.replaceChildren(h('p.muted', 'Generating…'));
    try {
      const f = { type: type.value, from: new Date(from.value + 'T00:00:00').getTime(), to: new Date(to.value + 'T23:59:59').getTime(), chapter: chapter.value, student: student.value,
        aFrom: new Date(midFrom.value + 'T00:00:00').getTime(), aTo: new Date(midTo.value + 'T23:59:59').getTime(), includeRisk: includeRisk.input.checked };
      if (!(f.to > f.from)) throw new Error('The end date must be after the start date.');
      const res = await buildReport(store, cc.codes, f);
      out.replaceChildren(h('div.no-print.row', { style: { margin: '1rem 0' } }, btn('Print or save as PDF', () => window.print(), { kind: 'primary', ic: 'file' }),
        res.csv ? btn('Download CSV', () => download(`${f.type}_report_${new Date().toISOString().slice(0, 10)}.csv`, toCSV(res.csv)), { ic: 'download' }) : null), res.node);
    } catch (e) { out.replaceChildren(callout(e.message, 'danger')); errorToast(e, 'Report'); }
  };
  return h('div', pageHead('Reports', 'Printable reports with their source, filters and date. Use your browser\'s "Save as PDF" to keep a PDF copy.', cc.picker),
    h('div.card.no-print', filt, includeRisk.el, h('div.card-foot', btn('Generate report', generate, { kind: 'primary' }))), out);
}

async function buildReport(store, codes, f) {
  const [data, qs] = await Promise.all([loadClassData(store, codes, { want: ['students', 'responses', 'sessions', 'assessments', 'submissions', 'predictions', 'interventions', 'reviews', 'outcomes'] }), allQuestions(store)]);
  const qIndex = indexById(qs);
  const inRange = (r) => r.recorded_at >= f.from && r.recorded_at <= f.to;
  const resp = data.responses.filter(inRange);
  const names = Object.fromEntries(data.students.map(s => [s.id, studentName(s)]));
  const synthetic = data.students.some(s => s.is_synthetic);
  const header = (title, extra = '') => h('div', h('h1', title), h('p.small', `Classes: ${codes.join(', ')} · Period: ${fmtDate(f.from)} – ${fmtDate(f.to)}${extra ? ' · ' + extra : ''} · Generated ${new Date().toLocaleString()} by ${store.me.display_name || store.auth.email}`),
    h('p.small.muted', `Source: ${resp.length.toLocaleString()} marked and unmarked responses recorded in CS Lifeline in this period. Accuracy = correct ÷ automatically or teacher-marked answers.`),
    synthetic ? callout('This report contains SYNTHETIC demonstration records. It does not describe real learners.', 'demo') : null);
  const wrap = (...c) => h('div.card.report', ...c);
  const chTable = (rs) => { const by = byChapter(rs); return Object.values(by).filter(c => c.n > 0); };

  switch (f.type) {
    case 'student': {
      const s = data.students.find(x => x.id === f.student); if (!s) throw new Error('Choose a student.');
      const rs = resp.filter(r => r.student_uid === s.id);
      const sum = studentSummary(rs, data.sessions.filter(x => x.student_uid === s.id), f.to);
      const findings = (classFindings([s], data.responses.filter(r => r.student_uid === s.id && r.recorded_at <= f.to), qIndex, data.reviews)[s.id] || []).filter(x => ['demonstrated', 'possible', 'knowledge_gap'].includes(x.final_status));
      const subs = data.submissions.filter(x => x.student_uid === s.id && toMs(x.submitted_at) >= f.from && toMs(x.submitted_at) <= f.to);
      const ivs = data.interventions.filter(i => i.student_uid === s.id);
      const pred = latestPredictionByStudent(data.predictions)[s.id];
      const ch = chTable(rs);
      return { node: wrap(header(`Student report: ${names[s.id]}`, `Class ${s.class_code}`),
        h('div.grid-tiles', tileR('Answers', n(sum.responses)), tileR('Accuracy', fmtPct(sum.accuracy)), tileR('Assessment accuracy', fmtPct(sum.assessment_accuracy)), tileR('Active days (last 28)', n(sum.active_days_28))),
        h('h2', 'Chapters'), ch.length ? h('div', ...ch.map(c => barRow(`${c.chapter_id} ${c.title}`, c.accuracy, `${fmtPct(c.accuracy)} of ${c.n}`))) : h('p.muted', 'No marked answers in this period.'),
        h('h2', 'Understanding to work on'), findings.length ? h('table', h('thead', h('tr', h('th', 'Idea'), h('th', 'Status'), h('th', 'Evidence'))), h('tbody', ...findings.map(x => h('tr', h('td', x.name), h('td', STATUS[x.final_status]?.label || x.final_status), h('td.small', x.reason || ''))))) : h('p.muted', 'No misconception is supported by enough evidence.'),
        h('h2', 'Assessments'), subs.length ? h('table', h('thead', h('tr', h('th', 'Assessment'), h('th', 'Submitted'), h('th', 'Status'))), h('tbody', ...subs.map(x => h('tr', h('td', data.assessments.find(a => a.id === x.assessment_id)?.title || x.assessment_id), h('td', fmtDate(x.submitted_at)), h('td', x.status))))) : h('p.muted', 'None in this period.'),
        h('h2', 'Support given'), ivs.length ? h('ul', ...ivs.map(i => h('li', `${i.title || i.target?.label} — ${ACTIVITY_KINDS[i.action_type] || i.action_type}, ${effectiveStatus(i)}${i.latest_outcome ? ': ' + OUTCOME_LABELS[i.latest_outcome.outcome] : ''}`))) : h('p.muted', 'No interventions recorded.'),
        f.includeRisk ? h('div', h('h2', 'Early-warning indicator (teacher use only)'), pred ? h('p', `${RISK_LABELS[pred.risk_category]}${pred.risk_probability != null ? ` (${fmtPct(pred.risk_probability)})` : ''} — model ${pred.model_version}, ${fmtDate(pred.predicted_at)}${pred.prediction_status !== 'validated' ? ' — DEMONSTRATION model, not validated' : ''}. ${(pred.explanation || explain(pred.contributions || [])).map(e => e.text).join(' ')}`) : h('p.muted', 'No prediction.'), h('p.small.muted', 'An early-warning indicator is a prompt for a conversation, not a judgement of ability.')) : null),
        csv: ch.map(c => ({ student: names[s.id], chapter: c.chapter_id, title: c.title, answers: c.n, correct: c.correct, accuracy: c.accuracy })) };
    }
    case 'class': {
      const sum = classSummary(data.students.map(s => ({ ...s, uid: s.id })), resp, { sessions: data.sessions, assessments: data.assessments, submissions: data.submissions, now: f.to });
      const per = data.students.map(s => { const a = accuracy(resp.filter(r => r.student_uid === s.id)); return { student: names[s.id], class: s.class_code, answers: a.n, accuracy: a.accuracy }; });
      const ch = chTable(resp);
      const [c1] = palette();
      return { node: wrap(header('Class performance report'),
        h('div.grid-tiles', tileR('Students', n(sum.total_students)), tileR('With answers', n(sum.students_with_data)), tileR('Class accuracy', fmtPct(sum.class_accuracy)), tileR('Responses', n(sum.responses))),
        h('h2', 'Accuracy by chapter'), ...ch.map(c => barRow(`${c.chapter_id} ${c.title}`, c.accuracy, `${fmtPct(c.accuracy)} (${c.n})`)),
        h('h2', 'Distribution of student accuracy'), chart('bar', { labels: ['<30%', '30–49%', '50–69%', '70–84%', '85%+'], datasets: [{ label: 'Students', data: [[0, .3], [.3, .5], [.5, .7], [.7, .85], [.85, 1.01]].map(([lo, hi]) => per.filter(p => p.accuracy != null && p.accuracy >= lo && p.accuracy < hi).length), backgroundColor: c1 }] }, { plugins: { legend: { display: false } } }, { sm: true, label: 'Distribution of student accuracy' }),
        h('h2', 'Assessment participation'), sum.participation.length ? h('table', h('thead', h('tr', h('th', 'Assessment'), h('th.num', 'Submitted'), h('th.num', 'Rate'))), h('tbody', ...sum.participation.map(p => h('tr', h('td', p.title), h('td.num', `${p.submitted}/${p.total}`), h('td.num', fmtPct(p.rate)))))) : h('p.muted', 'No assessments.'),
        h('h2', 'Students'), h('table', h('thead', h('tr', h('th', 'Student'), h('th', 'Class'), h('th.num', 'Answers'), h('th.num', 'Accuracy'))), h('tbody', ...per.sort((a, b) => a.student.localeCompare(b.student)).map(p => h('tr', h('td', p.student), h('td', p.class), h('td.num', p.answers), h('td.num', fmtPct(p.accuracy))))))),
        csv: per };
    }
    case 'chapter': {
      const rs = resp.filter(r => r.chapter_id === f.chapter);
      const per = data.students.map(s => { const a = accuracy(rs.filter(r => r.student_uid === s.id)); return { student: names[s.id], class: s.class_code, answers: a.n, accuracy: a.accuracy }; }).filter(p => p.answers);
      const topics = {}; for (const r of rs) { const t = r.topic || qIndex.get(r.question_id)?.topic || 'Other'; (topics[t] ||= []).push(r); }
      const mis = aggregateClass(classFindings(data.students, data.responses.filter(r => r.recorded_at <= f.to), qIndex, data.reviews)).filter(m => m.chapter_id === f.chapter && m.counts.demonstrated + m.counts.possible > 0);
      return { node: wrap(header(`Chapter report: ${f.chapter} ${chapterTitle(f.chapter)}`), h('p', `Class accuracy on this chapter: ${fmtPct(accuracy(rs).accuracy)} from ${n(accuracy(rs).n)} marked answers by ${per.length} students.`),
        h('h2', 'By topic'), ...Object.entries(topics).map(([t, x]) => { const a = accuracy(x); return barRow(t, a.accuracy, `${fmtPct(a.accuracy)} (${a.n})`); }),
        h('h2', 'Misconceptions in this chapter'), mis.length ? h('table', h('thead', h('tr', h('th', 'Misconception'), h('th.num', 'Demonstrated'), h('th.num', 'Possible'))), h('tbody', ...mis.map(m => h('tr', h('td', m.name), h('td.num', m.counts.demonstrated), h('td.num', m.counts.possible))))) : h('p.muted', 'None with sufficient evidence.'),
        h('h2', 'Students'), h('table', h('thead', h('tr', h('th', 'Student'), h('th.num', 'Answers'), h('th.num', 'Accuracy'))), h('tbody', ...per.sort((a, b) => (a.accuracy ?? 0) - (b.accuracy ?? 0)).map(p => h('tr', h('td', p.student), h('td.num', p.answers), h('td.num', fmtPct(p.accuracy))))))),
        csv: per.map(p => ({ ...p, chapter: f.chapter })) };
    }
    case 'misconceptions': {
      const findings = classFindings(data.students, data.responses.filter(r => r.recorded_at <= f.to), qIndex, data.reviews);
      const agg = aggregateClass(findings).filter(m => m.counts.demonstrated + m.counts.possible + m.counts.knowledge_gap > 0);
      const csv = agg.flatMap(m => Object.entries(m.students).filter(([, st]) => ['demonstrated', 'possible', 'knowledge_gap'].includes(st)).map(([uid, st]) => ({ misconception_id: m.misconception_id, misconception: m.name, chapter: m.chapter_id, student: names[uid], status: st })));
      return { node: wrap(header('Misconception report'), h('p.small', 'A misconception is reported as demonstrated only after repeated, consistent errors on related questions — never from a single wrong answer. Teacher reviews override automated classifications.'),
        agg.length ? h('table', h('thead', h('tr', h('th', 'Misconception'), h('th', 'Chapter'), h('th.num', 'Demonstrated'), h('th.num', 'Possible'), h('th.num', 'Knowledge gap'), h('th', 'Students (demonstrated)'))),
          h('tbody', ...agg.map(m => h('tr', h('td', m.name), h('td', m.chapter_id), h('td.num', m.counts.demonstrated), h('td.num', m.counts.possible), h('td.num', m.counts.knowledge_gap),
            h('td.small', Object.entries(m.students).filter(([, st]) => st === 'demonstrated').map(([u]) => names[u]).join(', ')))))) : h('p.muted', 'No misconception has enough evidence yet.')), csv };
    }
    case 'atrisk': {
      const latest = latestPredictionByStudent(data.predictions);
      const rows = data.students.map(s => ({ s, p: latest[s.id] })).filter(x => x.p && ['high', 'moderate'].includes(x.p.risk_category)).sort((a, b) => (b.p.risk_probability ?? 0) - (a.p.risk_probability ?? 0));
      const anyDemo = rows.some(r => r.p.prediction_status !== 'validated');
      return { node: wrap(header('Early-warning report (teacher use only)'),
        callout(['Predictions estimate the chance that a student\'s assessment accuracy in the next four weeks falls below 50%. They are prompts for a conversation, not grades or diagnoses, and are never shown to students.', anyDemo ? h('strong', ' Some predictions come from a DEMONSTRATION model trained on synthetic data and must not be acted on as evidence.') : ''], anyDemo ? 'warn' : 'info'),
        rows.length ? h('table', h('thead', h('tr', h('th', 'Student'), h('th', 'Indicator'), h('th', 'Main reasons'), h('th', 'Suggested action'), h('th', 'Model / date'))),
          h('tbody', ...rows.map(({ s, p }) => h('tr', h('td', names[s.id]), h('td', `${RISK_LABELS[p.risk_category]} ${p.risk_probability != null ? fmtPct(p.risk_probability) : ''}`),
            h('td.small', (p.explanation || explain(p.contributions || [])).map(e => e.text).join(' ')), h('td.small', p.recommended_action || '—'), h('td.small', `${p.model_version}${p.prediction_status !== 'validated' ? ' (demo)' : ''} · ${fmtDate(p.predicted_at)}`))))) : h('p.muted', 'No student is currently flagged moderate or high.')),
        csv: rows.map(({ s, p }) => ({ student: names[s.id], class: s.class_code, category: p.risk_category, probability: p.risk_probability, model_version: p.model_version, prediction_status: p.prediction_status, predicted_at: p.predicted_at })) };
    }
    case 'interventions': {
      const ivs = data.interventions.filter(i => { const t = toMs(i.started_at || i.created_at); return t >= f.from && t <= f.to; });
      const rows = ivs.map(i => { const ev = evaluateIntervention(i, data.responses.filter(r => r.student_uid === i.student_uid), { questionsById: qIndex, now: f.to });
        return { student: names[i.student_uid] || i.student_uid, target: i.target?.label || i.title, action: ACTIVITY_KINDS[i.action_type] || i.action_type, status: effectiveStatus(i), started: fmtDate(i.started_at),
          before: ev.pre.accuracy, before_n: ev.pre.n, after: ev.post.accuracy, after_n: ev.post.n, outcome: OUTCOME_LABELS[ev.outcome] || ev.outcome }; });
      const counts = Object.fromEntries(Object.keys(OUTCOME_LABELS).map(k => [OUTCOME_LABELS[k], rows.filter(r => r.outcome === OUTCOME_LABELS[k]).length]));
      return { node: wrap(header('Intervention report'), h('p.small', 'Before = marked answers on the target in the 6 weeks before the intervention started; after = answers since. Completing an activity is not counted as improvement. Before/after differences show association, not cause.'),
        h('p', Object.entries(counts).map(([k, v]) => `${k}: ${v}`).join(' · ')),
        rows.length ? h('table', h('thead', h('tr', h('th', 'Student'), h('th', 'Target'), h('th', 'Action'), h('th', 'Status'), h('th.num', 'Before'), h('th.num', 'After'), h('th', 'Evidence'))),
          h('tbody', ...rows.map(r => h('tr', h('td', r.student), h('td', r.target), h('td.small', r.action), h('td', r.status), h('td.num', `${fmtPct(r.before)} (${r.before_n})`), h('td.num', `${fmtPct(r.after)} (${r.after_n})`), h('td', r.outcome))))) : h('p.muted', 'No interventions started in this period.')),
        csv: rows };
    }
    case 'progress': {
      if (!(f.aTo > f.aFrom)) throw new Error('The comparison period end must be after its start.');
      const inA = (r) => r.recorded_at >= f.aFrom && r.recorded_at <= f.aTo;
      const rows = data.students.map(s => { const a = accuracy(data.responses.filter(r => r.student_uid === s.id && inA(r))); const b = accuracy(resp.filter(r => r.student_uid === s.id));
        return { student: names[s.id], class: s.class_code, earlier: a.accuracy, earlier_n: a.n, later: b.accuracy, later_n: b.n, change: a.accuracy != null && b.accuracy != null ? b.accuracy - a.accuracy : null }; }).filter(r => r.earlier_n || r.later_n);
      return { node: wrap(header('Progress comparison report', `Earlier period ${fmtDate(f.aFrom)} – ${fmtDate(f.aTo)}`), h('p.small', 'Accuracy depends on which questions were attempted; compare periods that covered similar chapters. Changes based on fewer than 10 answers are unreliable.'),
        h('table', h('thead', h('tr', h('th', 'Student'), h('th.num', 'Earlier'), h('th.num', 'Later'), h('th.num', 'Change'))), h('tbody', ...rows.sort((a, b) => (a.change ?? 0) - (b.change ?? 0)).map(r => h('tr', h('td', r.student), h('td.num', `${fmtPct(r.earlier)} (${r.earlier_n})`), h('td.num', `${fmtPct(r.later)} (${r.later_n})`),
          h('td.num', r.change == null ? '—' : h('span', { style: { color: r.change < 0 ? 'var(--danger)' : 'var(--ok)' } }, `${r.change > 0 ? '+' : ''}${Math.round(r.change * 100)} pts${Math.min(r.earlier_n, r.later_n) < 10 ? ' *' : ''}`))))))),
        csv: rows };
    }
    default: throw new Error('Unknown report type');
  }
}
const tileR = (label, value) => h('div.tile', h('div.label', label), h('div.value', value));

// ── Research export (pseudonymised) ─────────────────────────────────────────
export async function researchExport(ctx) {
  const { store } = ctx;
  const cc = await classContext(ctx);
  if (!cc.codes.length) return h('div', pageHead('Research export'), noClasses());
  const requireConsent = store.settings.research_export_requires_consent !== false;
  const students = await store.listStudents(cc.codes);
  const eligible = students.filter(s => !requireConsent || s.consent?.research_use === 'granted');
  const exportNow = async () => {
    try {
      const data = await loadClassData(store, cc.codes, { want: ['students', 'responses', 'sessions', 'submissions', 'interventions', 'outcomes', 'predictions'] });
      const ok = new Map(eligible.map(s => [s.id, s.pseudo_id]));
      const pid = (uid) => ok.get(uid);
      const learners = eligible.map(s => ({ uid: s.pseudo_id, pseudo_id: s.pseudo_id, school_id: s.school_id || '', class_code: s.class_code, grade: s.grade ?? '', is_synthetic: !!s.is_synthetic }));
      const responses = data.responses.filter(r => ok.has(r.student_uid)).map(r => ({ id: r.id, student_uid: pid(r.student_uid), pseudo_id: pid(r.student_uid), class_code: r.class_code, school_id: r.school_id || '', session_id: r.session_id || '', submission_id: r.submission_id ? r.submission_id.replace(r.student_uid, pid(r.student_uid)) : '',
        assessment_id: r.assessment_id || '', mode: r.mode, question_id: r.question_id, question_type: r.question_type, chapter_id: r.chapter_id, difficulty: r.difficulty, misconception_tag: r.misconception_tag || '', misconception_hits: (r.misconception_hits || []).join(';'),
        chosen: r.chosen ?? '', correct: r.correct === true ? 'true' : r.correct === false ? 'false' : '', score: r.score ?? '', max: r.max ?? '', needs_manual: !!r.needs_manual, time_ms: r.time_ms ?? '', first_answer_ms: r.first_answer_ms ?? '', revisions: r.revisions ?? '',
        hint_used: !!r.hint_used, visibility_interruptions: r.visibility_interruptions ?? '', recorded_at: new Date(r.recorded_at).toISOString(), is_synthetic: !!r.is_synthetic }));
      const sessions = data.sessions.filter(s => ok.has(s.student_uid)).map(s => ({ id: s.id, student_uid: pid(s.student_uid), class_code: s.class_code, mode: s.mode, chapter_id: s.chapter_id || '', question_count: s.question_count ?? '', status: s.status, started_at: s.started_at ? new Date(toMs(s.started_at)).toISOString() : '', ended_at: s.ended_at ? new Date(toMs(s.ended_at)).toISOString() : '', is_synthetic: !!s.is_synthetic }));
      const interventions = data.interventions.filter(i => ok.has(i.student_uid)).map(i => ({ id: i.id, student_uid: pid(i.student_uid), class_code: i.class_code, target_type: i.target?.type, target_id: i.target?.id, action_type: i.action_type, status: effectiveStatus(i), started_at: i.started_at, review_date: i.review_date, latest_outcome: i.latest_outcome?.outcome || '' }));
      const predictions = data.predictions.filter(p => ok.has(p.student_uid)).map(p => ({ student_uid: pid(p.student_uid), model_version: p.model_version, prediction_status: p.prediction_status, risk_category: p.risk_category, risk_probability: p.risk_probability ?? '', predicted_at: p.predicted_at }));
      const stamp = new Date().toISOString().slice(0, 10);
      const files = { learners, responses, sessions, interventions, predictions };
      for (const [k, rows] of Object.entries(files)) download(`${k}.csv`, toCSV(rows));
      download('README.txt', `CS Lifeline research export, ${stamp}\nClasses: ${cc.codes.join(', ')}\nLearners: ${learners.length} (${requireConsent ? 'research consent recorded as granted' : 'consent not required by platform setting'})\n` +
        `Identifiers are pseudonymous research IDs (L-XXXXXXXXXX). Names, emails, account IDs and free-text answers are not included.\nColumns are defined in docs/DATA_DICTIONARY.md. Load with: python -m cslifeline_ml train --data <this folder>\n` +
        (learners.some(l => l.is_synthetic) ? 'WARNING: this export contains SYNTHETIC records.\n' : ''));
      await store.audit('research.export', 'classes/' + cc.codes.join(','), { learners: learners.length, responses: responses.length, consent_required: requireConsent });
      toast(`Exported ${learners.length} learners and ${responses.length} responses (6 files)`, 'ok');
    } catch (e) { errorToast(e, 'Export'); }
  };
  return h('div', pageHead('Research export', 'Pseudonymised data for independent analysis in Python, pandas or Google Colab.', cc.picker),
    card('What is exported', h('ul', h('li', 'learners.csv, responses.csv, sessions.csv, interventions.csv, predictions.csv and a README.'),
      h('li', 'Learners are identified only by their research ID. Names, emails, account IDs and typed answers are removed.'),
      h('li', requireConsent ? `Only learners whose research consent is recorded as permitted are included: ${eligible.length} of ${students.length}.` : `The platform does not require recorded consent for exports; all ${students.length} learners are included. Confirm your ethics approval allows this.`),
      h('li', 'Each export is recorded in the audit log.')),
      eligible.length ? null : callout('No learner in these classes has research consent recorded. Record consent in Classes and roster first.', 'warn'),
      h('div.card-foot', btn('Download export', exportNow, { kind: 'primary', ic: 'download', disabled: !eligible.length }))));
}
