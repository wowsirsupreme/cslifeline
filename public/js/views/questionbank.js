// Question bank: browse, create/edit every question type, archive, import (validated, duplicate-aware) and export.
// Import follows DBWOW's rule: nothing is silently discarded — every rejected row is listed with its reason.
import { h, btn, badge, card, cardHead, callout, empty, pageHead, field, input, textarea, select, checkbox, tabs, dataTable, modal, confirmDialog, toast, errorToast, download, filePicker, n } from '../ui/kit.js';
import { renderQuestion, questionMeta } from '../ui/question-view.js';
import { allQuestions, indexById } from '../app/data.js';
import { CHAPTERS, CHAPTER_IDS, chapterTitle } from '../engine/curriculum.js';
import { QUESTION_TYPES, DIFFICULTY_LABELS, normaliseQuestion, validateQuestion, normText } from '../engine/questions.js';
import { prepareImport, templateCSV, textSimilarity, CSV_TEMPLATE_COLUMNS } from '../engine/importer.js';
import { toCSV } from '../engine/csv.js';
import { TAXONOMY } from '../engine/taxonomy-data.js';

const TAX_OPTS = [['', '— none —'], ...TAXONOMY.map(t => [t.id, `${t.id} · ${t.name}`])];
const TAX_IDS = new Set(TAXONOMY.map(t => t.id));

export async function questionBank(ctx) {
  const { store, navigate } = ctx;
  const showArchived = checkbox('Show archived', false);
  const fCh = select([['', 'All chapters'], ...CHAPTER_IDS.map(id => [id, `${id} ${CHAPTERS[id].title}`])], '');
  const fType = select([['', 'All types'], ...Object.entries(QUESTION_TYPES).map(([k, v]) => [k, v.label])], '');
  const fSrc = select([['', 'All sources'], ['builtin', 'Built-in'], ['stored', 'Created or edited by teachers']], '');
  const body = h('div');
  let all = [];
  const draw = async () => {
    all = await allQuestions(store, { includeArchived: showArchived.input.checked });
    const list = all.filter(q => (!fCh.value || q.chapter_id === fCh.value) && (!fType.value || q.type === fType.value) && (!fSrc.value || (fSrc.value === 'builtin' ? q.builtin && !q.stored : q.stored)));
    const byCh = CHAPTER_IDS.map(id => all.filter(q => q.chapter_id === id && q.active !== false).length);
    body.replaceChildren(
      h('p.small.muted', `${n(all.filter(q => q.active !== false).length)} active questions · ${CHAPTER_IDS.map((id, i) => `${id}: ${byCh[i]}`).join(' · ')}`),
      dataTable(list, [
        { key: 'id', label: 'ID', render: q => h('code.small', q.id) },
        { key: 'text', label: 'Question', render: q => h('div', h('div', q.text.slice(0, 120) + (q.text.length > 120 ? '…' : '')), questionMeta(q)), sort: q => q.text },
        { key: 'chapter_id', label: 'Chapter', render: q => q.chapter_id || '—' },
        { key: 'type', label: 'Type', render: q => QUESTION_TYPES[q.type]?.label || q.type },
        { key: 'misconception_tag', label: 'Misconception', render: q => q.misconception_tag ? badge(q.misconception_tag) : '—' },
        { key: 'src', label: 'Source', render: q => h('span', q.stored ? badge(q.builtin ? 'edited' : 'teacher', 'info') : badge('built-in'), q.active === false ? badge('archived', 'warn') : null), sort: q => (q.stored ? 1 : 0) },
      ], { onRow: q => navigate('/question/' + encodeURIComponent(q.id)), pageSize: 20, searchText: q => `${q.id} ${q.text} ${q.topic || ''} ${q.misconception_tag || ''}`.toLowerCase() }));
  };
  [fCh, fType, fSrc, showArchived.input].forEach(x => x.addEventListener('change', draw));
  await draw();
  const exportAll = (fmt) => {
    const list = all.filter(q => q.active !== false);
    if (fmt === 'json') return download('cslifeline_questions.json', JSON.stringify(list.map(({ builtin, stored, ...q }) => q), null, 1), 'application/json');
    download('cslifeline_questions.csv', toCSV(list.map(toCsvRecord), CSV_TEMPLATE_COLUMNS));
  };
  return h('div', pageHead('Question bank', 'Every question carries its chapter, type, difficulty, answer key, explanation and misconception links.',
    btn('New question', () => navigate('/question/new'), { kind: 'primary', ic: 'plus' }), btn('Import', () => navigate('/questions/import'), { ic: 'upload' }),
    btn('Export CSV', () => exportAll('csv'), { ic: 'download' }), btn('Export JSON', () => exportAll('json'), { ic: 'download' })),
  card(h('div.toolbar', fCh, fType, fSrc, showArchived.el), body));
}

function toCsvRecord(q) {
  const letters = 'ABCDE';
  const r = { id: q.id, type: q.type, chapter_id: q.chapter_id, subchapter: q.subchapter, topic: q.topic, learning_objective: q.learning_objective, grade: q.grade, difficulty: q.difficulty, marks: q.marks,
    text: q.text, code: q.code, explanation: q.explanation, hint: q.hint, misconception_tag: q.misconception_tag, image_url: q.image_url, image_alt: q.image_alt, group_id: q.group_id, stimulus: q.stimulus, active: q.active !== false };
  (q.options || []).slice(0, 5).forEach((o, i) => { r['option' + letters[i]] = o; });
  if (['mcq', 'pseudocode', 'debugging', 'code_output'].includes(q.type) && q.options?.length) r.answer = letters[q.answer] ?? q.answer;
  else if (q.type === 'multi') r.answer = (q.answer || []).map(i => letters[i]).join('|');
  else if (q.type === 'truefalse') r.answer = String(q.answer);
  else if (q.type === 'gap') r.answer = (q.answer || []).map(g => g.join('|')).join(';');
  else if (Array.isArray(q.answer)) r.answer = q.answer.every(x => !Array.isArray(x)) ? q.answer.join('|') : JSON.stringify(q.answer);
  r.option_misconceptions = Object.entries(q.option_misconceptions || {}).map(([k, v]) => `${k}:${v}`).join(';');
  r.items = (q.items || []).join('|'); r.left = (q.left || []).join('|'); r.right = (q.right || []).join('|'); r.columns = (q.columns || []).join('|');
  return r;
}

// ── Editor ──────────────────────────────────────────────────────────────────
export async function questionEdit(ctx) {
  const { store, navigate, params } = ctx;
  const id = decodeURIComponent(params.id);
  const isNew = id === 'new';
  const bank = await allQuestions(store, { includeArchived: true });
  const orig = isNew ? null : bank.find(q => q.id === id);
  if (!isNew && !orig) return h('div', pageHead('Question not found'), callout(`No question has the ID ${id}.`, 'warn'));
  let copy = null;
  if (isNew) { try { copy = JSON.parse(sessionStorage.getItem('csl.qcopy') || 'null'); sessionStorage.removeItem('csl.qcopy'); } catch { /* ignore */ } }
  const q0 = orig ? structuredClone(orig) : copy ? { ...copy, id: '' } : normaliseQuestion({ id: '', type: 'mcq', chapter_id: 'T01', options: ['', '', '', ''], answer: 0, difficulty: 2, marks: 1 });

  const f = {
    id: input(isNew ? '' : q0.id, { disabled: !isNew, placeholder: 'e.g. T08_LOOP_07' }),
    type: select(Object.entries(QUESTION_TYPES).map(([k, v]) => [k, v.label]), q0.type),
    chapter: select(CHAPTER_IDS.map(i => [i, `${i} ${CHAPTERS[i].title}`]), q0.chapter_id || 'T01'),
    subchapter: input(q0.subchapter || ''), topic: input(q0.topic || ''), lo: input(q0.learning_objective || ''),
    grade: select([['', '—'], ['9', '9'], ['10', '10'], ['11', '11']], q0.grade ?? ''),
    difficulty: select(Object.entries(DIFFICULTY_LABELS), q0.difficulty || 2), marks: input(String(q0.marks || 1), { type: 'number', min: 1, max: 20 }),
    text: textarea(q0.text, { rows: 3 }), code: textarea(q0.code || '', { rows: 4, class: 'mono', placeholder: 'Pseudocode shown with the question (optional)' }),
    explanation: textarea(q0.explanation || '', { rows: 2 }), hint: textarea(q0.hint || '', { rows: 2 }),
    mis: select(TAX_OPTS, q0.misconception_tag || ''), image: input(q0.image_url || '', { placeholder: 'https://… or upload' }), imageAlt: input(q0.image_alt || '', { placeholder: 'Describe the image for screen-reader users' }),
    group: input(q0.group_id || '', { placeholder: 'Same ID for questions that share one diagram or passage' }), stimulus: textarea(q0.stimulus || '', { rows: 2, placeholder: 'Shared context shown above every question in the group' }),
  };
  const answerBox = h('div'); const preview = h('div'); const errBox = h('div');
  let opts = [...(q0.options || [])]; let key = structuredClone(q0.answer); let optMis = { ...(q0.option_misconceptions || {}) };
  let advanced = { items: q0.items, left: q0.left, right: q0.right, columns: q0.columns, parts: q0.parts, tests: q0.tests, starter: q0.starter, solution: q0.solution, answer: q0.answer, answer_misconceptions: q0.answer_misconceptions || {} };

  const build = () => {
    const t = f.type.value;
    const base = { id: (isNew ? f.id.value.trim() : q0.id), type: t, chapter_id: f.chapter.value, subchapter: f.subchapter.value.trim() || null, topic: f.topic.value.trim() || null,
      learning_objective: f.lo.value.trim() || null, grade: f.grade.value ? Number(f.grade.value) : null, difficulty: Number(f.difficulty.value), marks: Number(f.marks.value) || 1,
      text: f.text.value, code: f.code.value.trim() || null, explanation: f.explanation.value.trim(), hint: f.hint.value.trim(), misconception_tag: f.mis.value || null,
      image_url: f.image.value.trim() || null, image_alt: f.imageAlt.value.trim() || null, group_id: f.group.value.trim() || null, stimulus: f.stimulus.value.trim() || null, source: orig?.source || 'teacher' };
    if (['mcq', 'multi', 'truefalse'].includes(t) || (['pseudocode', 'debugging', 'code_output'].includes(t) && opts.length)) {
      return { ...base, options: t === 'truefalse' ? ['True', 'False'] : opts.map(o => o.trim()), answer: key, option_misconceptions: Object.fromEntries(Object.entries(optMis).filter(([, v]) => v)) };
    }
    if (['short', 'pseudocode', 'debugging', 'code_output'].includes(t)) return { ...base, options: [], answer: Array.isArray(key) ? key : [], answer_misconceptions: advanced.answer_misconceptions };
    return { ...base, ...advanced, answer: advanced.answer };
  };
  const refresh = () => {
    let q; try { q = normaliseQuestion(build(), { source: 'teacher' }); } catch (e) { errBox.replaceChildren(callout(e.message, 'danger')); return null; }
    const v = validateQuestion(q, { taxonomyIds: TAX_IDS });
    errBox.replaceChildren(v.errors.length ? callout(['Fix before saving: ', v.errors.join('; ')], 'danger') : v.warnings.length ? callout(v.warnings.join('; '), 'warn') : callout('Valid.', 'ok'));
    try { preview.replaceChildren(renderQuestion(q, { disabled: false })); } catch (e) { preview.replaceChildren(callout('Preview unavailable: ' + e.message, 'warn')); }
    return v.ok ? q : null;
  };

  const drawAnswer = () => {
    const t = f.type.value;
    answerBox.replaceChildren();
    const optionTyped = ['mcq', 'multi'].includes(t) || (['pseudocode', 'debugging', 'code_output'].includes(t) && opts.length);
    if (t === 'truefalse') {
      if (typeof key !== 'boolean') key = true;
      const s = select([['true', 'True'], ['false', 'False']], String(key)); s.addEventListener('change', () => { key = s.value === 'true'; refresh(); });
      const m0 = select(TAX_OPTS, optMis[0] || ''), m1 = select(TAX_OPTS, optMis[1] || '');
      m0.addEventListener('change', () => { optMis[0] = m0.value; refresh(); }); m1.addEventListener('change', () => { optMis[1] = m1.value; refresh(); });
      answerBox.append(field('Correct answer', s), h('div.form-grid', field('If a student answers True wrongly, it suggests…', m0), field('If a student answers False wrongly, it suggests…', m1)));
    } else if (optionTyped) {
      if (t === 'multi' && !Array.isArray(key)) key = [];
      if (t !== 'multi' && !Number.isInteger(key)) key = 0;
      const list = h('div.stack');
      opts.forEach((o, i) => {
        const inp = input(o, { placeholder: `Option ${'ABCDE'[i]}` }); inp.addEventListener('input', () => { opts[i] = inp.value; refresh(); });
        const mark = h('input', { type: t === 'multi' ? 'checkbox' : 'radio', name: 'qkey', 'aria-label': `Option ${'ABCDE'[i]} is correct` });
        mark.checked = t === 'multi' ? key.includes(i) : key === i;
        mark.addEventListener('change', () => { key = t === 'multi' ? opts.map((_, j) => j).filter(j => list.querySelectorAll('input[name=qkey]')[j].checked) : i; refresh(); });
        const ms = select(TAX_OPTS, optMis[i] || '', { 'aria-label': `Misconception suggested by option ${'ABCDE'[i]}` }); ms.addEventListener('change', () => { optMis[i] = ms.value; refresh(); });
        list.appendChild(h('div.row', { style: { alignItems: 'center' } }, mark, h('strong', 'ABCDE'[i]), inp, ms,
          opts.length > 2 ? btn('Remove', () => { opts.splice(i, 1); const nm = {}; Object.entries(optMis).forEach(([k, v]) => { const kk = Number(k); if (kk < i) nm[kk] = v; else if (kk > i) nm[kk - 1] = v; }); optMis = nm;
            key = t === 'multi' ? key.filter(j => j !== i).map(j => (j > i ? j - 1 : j)) : (key === i ? 0 : key > i ? key - 1 : key); drawAnswer(); refresh(); }, { sm: true, kind: 'ghost' }) : null));
      });
      answerBox.append(h('p.small.muted', 'Tick the correct option(s). For each wrong option you can record which misconception choosing it suggests — this is what makes a distractor diagnostic.'), list,
        opts.length < 5 ? btn('Add option', () => { opts.push(''); drawAnswer(); refresh(); }, { sm: true, ic: 'plus' }) : null,
        ['pseudocode', 'debugging', 'code_output'].includes(t) ? btn('Use typed answers instead of options', () => { opts = []; key = []; drawAnswer(); refresh(); }, { sm: true, kind: 'ghost' }) : null);
    } else if (['short', 'pseudocode', 'debugging', 'code_output'].includes(t)) {
      if (!Array.isArray(key)) key = [];
      const acc = textarea(key.join('\n'), { rows: 3, placeholder: 'One accepted answer per line' }); acc.addEventListener('input', () => { key = acc.value.split('\n').map(s => s.trim()).filter(Boolean); refresh(); });
      const wm = textarea(Object.entries(advanced.answer_misconceptions || {}).map(([a, m]) => `${a} => ${m}`).join('\n'), { rows: 2, placeholder: 'Optional: wrong answer => misconception ID, e.g. 10 => MC-LOOP-01' });
      wm.addEventListener('input', () => { advanced.answer_misconceptions = Object.fromEntries(wm.value.split('\n').map(l => l.split('=>').map(s => s.trim())).filter(p => p.length === 2 && p[0] && p[1]).map(([a, m]) => [normText(a).toLowerCase(), m])); refresh(); });
      answerBox.append(field('Accepted answers', acc, 'Marking ignores case and extra spaces. Code output also ignores whitespace differences.'), field('Diagnostic wrong answers', wm),
        t !== 'short' ? btn('Use options instead', () => { opts = ['', '', '', '']; key = 0; drawAnswer(); refresh(); }, { sm: true, kind: 'ghost' }) : null);
    } else {
      const help = {
        gap: 'answer: one list of accepted answers per gap, e.g. [["INTEGER"], ["0","zero"]]. Write each gap in the text as ___.',
        matching: 'left: items on the left; right: items on the right; answer[i] = index in right that matches left[i].',
        ordering: 'items: the steps in any order; answer: the item indexes in the correct order.',
        trace_table: 'columns: column headings; answer: the expected rows, e.g. [["1","0"],["2","1"]].',
        structured: 'parts: [{ "label": "(a)", "marks": 2, "keywords": ["…"], "mark_scheme": "…" }]. Marked by the teacher with keyword suggestions.',
        coding: 'starter, solution and tests: [{ "input": ["5"], "expected": "120" }]. Answers are marked by running the tests; with no tests the teacher marks.',
      }[t] || '';
      const fields = { gap: ['answer'], matching: ['left', 'right', 'answer'], ordering: ['items', 'answer'], trace_table: ['columns', 'answer'], structured: ['parts'], coding: ['starter', 'solution', 'tests'] }[t] || ['answer'];
      const ta = textarea(JSON.stringify(Object.fromEntries(fields.map(k => [k, advanced[k] ?? (k === 'starter' || k === 'solution' ? '' : [])])), null, 1), { rows: 10, class: 'mono' });
      const jerr = h('div.err', { role: 'alert' });
      ta.addEventListener('input', () => { try { const o = JSON.parse(ta.value); advanced = { ...advanced, ...o }; jerr.textContent = ''; refresh(); } catch (e) { jerr.textContent = 'Not valid JSON yet: ' + e.message; } });
      answerBox.append(h('p.small.muted', help), field('Answer key and structure (JSON)', ta), jerr);
    }
  };
  f.type.addEventListener('change', () => { const t = f.type.value; if (['mcq', 'multi'].includes(t) && opts.length < 2) opts = ['', '', '', '']; drawAnswer(); refresh(); });
  Object.values(f).forEach(el => el.addEventListener('input', refresh));
  ['chapter', 'grade', 'difficulty', 'mis'].forEach(k => f[k].addEventListener('change', refresh));
  drawAnswer(); refresh();

  const upload = filePicker('image/*', () => {}, 'Upload image');
  upload.querySelector('input').addEventListener('change', async (e) => { const file = e.target.files?.[0]; if (!file) return; if (file.size > 2e6) return toast('Images must be under 2 MB', 'warn'); try { f.image.value = await store.uploadImage(file); toast('Image uploaded', 'ok'); refresh(); } catch (er) { errorToast(er, 'Upload'); } });

  async function save() {
    const q = refresh();
    if (!q) return toast('Fix the errors shown first.', 'warn');
    if (isNew && bank.some(x => x.id === q.id)) return toast(`The ID ${q.id} is already used.`, 'warn');
    const near = bank.filter(x => x.id !== q.id && x.active !== false).map(x => ({ x, s: textSimilarity(q.text, x.text) })).filter(m => m.s >= 0.85).sort((a, b) => b.s - a.s)[0];
    if (near && !(await confirmDialog('Possible duplicate', `This question is ${Math.round(near.s * 100)}% similar to ${near.x.id}: "${near.x.text.slice(0, 160)}". Save anyway?`, { confirmLabel: 'Save anyway' }))) return;
    try {
      const { builtin, stored, ...data } = q;
      await store.saveQuestion({ ...data, visibility: orig?.visibility || 'practice', active: orig?.active !== false });
      toast('Saved', 'ok'); navigate('/question/' + encodeURIComponent(q.id));
    } catch (e) { errorToast(e, 'Could not save'); }
  }
  const archived = orig && orig.active === false;
  return h('div', pageHead(isNew ? 'New question' : `Question ${q0.id}`, orig?.builtin && !orig?.stored ? 'Built-in question. Saving creates your school\'s edited copy; the original stays in the app.' : '',
    btn('Back', () => navigate('/questions'), { kind: 'ghost' }),
    !isNew ? btn('Duplicate', () => { const { builtin, stored, ...c } = orig; try { sessionStorage.setItem('csl.qcopy', JSON.stringify(c)); } catch { /* ignore */ } toast('Copy opened — give it a new ID and save.', 'info'); navigate('/question/new'); }, { ic: 'copy' }) : null,
    !isNew && orig.stored ? btn(archived ? 'Restore' : 'Archive', async () => { if (archived || await confirmDialog('Archive this question?', 'It will no longer be offered for practice or new assessments. Past responses keep pointing to it.', { confirmLabel: 'Archive' })) { await store.archiveQuestion(q0.id, !archived); toast(archived ? 'Restored' : 'Archived', 'ok'); navigate('/questions'); } }, { ic: 'archive' }) : null),
  h('div.grid-2',
    h('div.stack',
      card('Classification', h('div.form-grid', field('ID', f.id, 'Letters, digits, _ - .'), field('Type', f.type), field('Chapter', f.chapter), field('Subchapter', f.subchapter), field('Topic', f.topic), field('Grade', f.grade), field('Difficulty', f.difficulty), field('Marks', f.marks)),
        field('Learning objective', f.lo), field('Main misconception this question probes', f.mis)),
      card('Question', field('Question text', f.text), field('Code (optional)', f.code), h('div.form-grid', field('Image', f.image), h('div.field', h('label', ' '), upload)), field('Image description', f.imageAlt),
        field('Group ID', f.group), field('Shared context', f.stimulus)),
      card('Answer key', answerBox),
      card('Feedback', field('Explanation (shown after answering)', f.explanation), field('Hint (practice only)', f.hint))),
    h('div.stack', card('Preview', h('p.small.muted', 'How a student will see it. Try answering — nothing is saved.'), preview), card('Check', errBox),
      h('div.card-foot', btn('Save question', save, { kind: 'primary' })))));
}

// ── Import ──────────────────────────────────────────────────────────────────
export async function questionImport(ctx) {
  const { store, navigate } = ctx;
  const out = h('div');
  const bank = await allQuestions(store, { includeArchived: true });
  const run = (text, file) => {
    let prep;
    try {
      const isJson = /\.json$/i.test(file?.name || '') || /^\s*[[{]/.test(text);
      prep = isJson ? prepareImport({ json: [].concat(JSON.parse(text)) }, bank) : prepareImport({ csvText: text }, bank);
    } catch (e) { out.replaceChildren(callout(['The file could not be read: ', e.message], 'danger')); return; }
    const dupChoice = new Map(prep.duplicates.map(d => [d.row, d.kind === 'same_id' ? 'skip' : 'skip']));
    const view = h('div');
    const draw = (tab) => {
      if (tab === 'ready') view.replaceChildren(dataTable(prep.ready, [{ key: 'id', label: 'ID' }, { key: 'text', label: 'Question', render: q => q.text.slice(0, 120) }, { key: 'chapter_id', label: 'Chapter' }, { key: 'type', label: 'Type' }], { pageSize: 10, empty: 'No new questions in this file.' }));
      if (tab === 'dups') view.replaceChildren(prep.duplicates.length ? dataTable(prep.duplicates, [
        { key: 'row', label: 'Row', num: true }, { key: 'q', label: 'In file', render: d => h('div', h('code.small', d.q.id), ' ', d.q.text.slice(0, 90)) },
        { key: 'match', label: 'Already in bank', render: d => h('div', h('code.small', d.match.id), ' ', d.match.text.slice(0, 90)) },
        { key: 'similarity', label: 'Match', render: d => badge(d.kind === 'same_id' ? 'same ID' : `${Math.round(d.similarity * 100)}% similar`, 'warn') },
        { key: 'act', label: 'Action', sortable: false, render: d => { const s = select(d.kind === 'same_id' ? [['skip', 'Skip'], ['replace', 'Replace existing']] : [['skip', 'Skip'], ['import', 'Import as a new question']], dupChoice.get(d.row)); s.addEventListener('change', () => dupChoice.set(d.row, s.value)); return s; } },
      ], { pageSize: 10, search: false }) : empty('No duplicates found', 'Questions are compared by ID, by identical text and options, and by text similarity of 85% or more within the same chapter.', null, 'check'));
      if (tab === 'rej') view.replaceChildren(prep.rejected.length ? h('div', dataTable(prep.rejected, [{ key: 'row', label: 'Row', num: true }, { key: 'id', label: 'ID' }, { key: 'errors', label: 'Reason', render: r => r.errors.join('; ') }], { pageSize: 15, search: false }),
        btn('Download rejected rows', () => download('rejected_rows.csv', toCSV(prep.rejected.map(r => ({ row: r.row, id: r.id, reason: r.errors.join('; ') })))), { sm: true, ic: 'download' })) : empty('Nothing rejected', '', null, 'check'));
      if (tab === 'warn') view.replaceChildren(prep.warnings.length ? dataTable(prep.warnings, [{ key: 'row', label: 'Row', num: true }, { key: 'id', label: 'ID' }, { key: 'warnings', label: 'Warning', render: r => r.warnings.join('; ') }], { pageSize: 15, search: false }) : empty('No warnings', '', null, 'check'));
    };
    const total = prep.ready.length + prep.duplicates.length + prep.rejected.length;
    out.replaceChildren(card(cardHead(`Checked ${total} row${total === 1 ? '' : 's'} from ${file?.name || 'file'}`),
      h('div.grid-tiles', h('div.tile', h('div.label', 'Ready'), h('div.value', String(prep.ready.length))), h('div.tile', h('div.label', 'Possible duplicates'), h('div.value', String(prep.duplicates.length))),
        h('div.tile', { class: prep.rejected.length ? 'tile attention' : 'tile' }, h('div.label', 'Rejected'), h('div.value', String(prep.rejected.length))), h('div.tile', h('div.label', 'Warnings'), h('div.value', String(prep.warnings.length)))),
      tabs([{ id: 'ready', label: `Ready (${prep.ready.length})` }, { id: 'dups', label: `Duplicates (${prep.duplicates.length})` }, { id: 'rej', label: `Rejected (${prep.rejected.length})` }, { id: 'warn', label: `Warnings (${prep.warnings.length})` }], draw), view,
      h('div.card-foot', btn('Import', async () => {
        const chosenDups = prep.duplicates.filter(d => dupChoice.get(d.row) !== 'skip');
        const list = [...prep.ready, ...chosenDups.map(d => (dupChoice.get(d.row) === 'import' ? { ...d.q, id: d.q.id + '_' + Math.random().toString(36).slice(2, 6).toUpperCase() } : d.q))];
        if (!list.length) return toast('Nothing selected to import.', 'warn');
        if (!(await confirmDialog('Import questions?', `${list.length} question${list.length > 1 ? 's' : ''} will be added to the bank${chosenDups.some(d => dupChoice.get(d.row) === 'replace') ? ' (some replacing existing ones)' : ''}. ${prep.rejected.length} rejected row(s) will not be imported.`, { confirmLabel: 'Import' }))) return;
        try { await store.importQuestions(list.map(q => ({ ...q, visibility: 'practice', active: true })), 'import'); toast(`${list.length} imported`, 'ok'); navigate('/questions'); } catch (e) { errorToast(e, 'Import failed'); }
      }, { kind: 'primary', ic: 'upload' }))));
  };
  const jsonTemplate = JSON.stringify([
    { id: 'T08_EX_01', type: 'mcq', chapter_id: 'T08', topic: 'Iteration', difficulty: 2, marks: 1, text: 'How many times does FOR I ← 1 TO 4 repeat?', options: ['3', '4', '5', '1'], answer: 1, explanation: 'The loop runs for I = 1, 2, 3 and 4.', misconception_tag: null, option_misconceptions: {} },
    { id: 'T01_EX_02', type: 'truefalse', chapter_id: 'T01', text: 'A nibble is 4 bits.', answer: true, explanation: 'Half a byte.' },
    { id: 'T08_EX_03', type: 'code_output', chapter_id: 'T08', text: 'What is output?', code: 'X ← 3\nOUTPUT X * 2', answer: ['6'] },
  ], null, 2);
  return h('div', pageHead('Import questions', 'CSV (CS Lifeline or WOW Sir format) or JSON. Every row is validated before anything is saved.', btn('Back', () => navigate('/questions'), { kind: 'ghost' })),
    card('1. Get a template', h('p', 'Columns are explained in docs/DATA_DICTIONARY.md. WOW Sir CSV exports (optionA–D, topicKey) are accepted as they are.'),
      h('div.row', btn('CSV template', () => download('cslifeline_questions_template.csv', templateCSV()), { ic: 'download' }), btn('JSON template', () => download('cslifeline_questions_template.json', jsonTemplate, 'application/json'), { ic: 'download' }))),
    card('2. Choose your file', filePicker('.csv,.json,text/csv,application/json', run, 'Choose CSV or JSON file')), out);
}
