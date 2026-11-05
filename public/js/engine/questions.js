// js/engine/questions.js
// Canonical question model (schema v2), normalisation of legacy/external formats,
// validation, and deterministic scoring for every supported question type.
// Pure module — no DOM, no Firebase.

import { CHAPTERS } from './curriculum.js';
import { LEGACY_TAG_MAP } from './taxonomy-data.js';

export const QUESTION_TYPES = {
  mcq:         { label: 'Multiple choice',          auto: true },
  multi:       { label: 'Multiple select',          auto: true },
  truefalse:   { label: 'True / false',             auto: true },
  short:       { label: 'Short answer',             auto: true },   // auto against accepted answers
  gap:         { label: 'Fill in the gap',          auto: true },
  matching:    { label: 'Matching',                 auto: true },
  ordering:    { label: 'Ordering',                 auto: true },
  trace_table: { label: 'Trace table',              auto: true },
  code_output: { label: 'Code output',              auto: true },
  pseudocode:  { label: 'Pseudocode interpretation', auto: true },  // mcq or short answer about given code
  debugging:   { label: 'Debugging',                auto: true },   // identify line / corrected statement
  structured:  { label: 'Structured (multi-part)',  auto: false },  // keyword-assisted, teacher confirms
  coding:      { label: 'Coding',                   auto: 'tests' }, // auto only when test cases exist
};

export const DIFFICULTY_LABELS = { 1: 'Foundation', 2: 'Core', 3: 'Extended' };

// ── Normalisation helpers ────────────────────────────────────────────────
export function normText(s) {
  return String(s ?? '')
    .normalize('NFKC')
    .replace(/[‘’]/g, "'").replace(/[“”]/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}
function normAnswer(s, caseSensitive = false) {
  const t = normText(s).replace(/\s*([,;:()])\s*/g, '$1');
  return caseSensitive ? t : t.toLowerCase();
}
function asNumber(s) {
  const t = String(s ?? '').trim().replace(/,/g, '');
  return t !== '' && Number.isFinite(Number(t)) ? Number(t) : null;
}

/** Convert any supported input shape to a canonical v2 question.
 *  Accepts: v2 objects, v3 CS Lifeline objects (type 'MCQ'/'trace_output'/'coding', `correct` index),
 *  WOW Sir objects/CSV rows (type 'mcq', `answer` as string index, optionA–D, topicKey). */
export function normaliseQuestion(raw, { source = raw?.source || 'manual' } = {}) {
  const q = { ...raw };
  // WOW Sir CSV columns optionA..optionD → options[]
  if (!Array.isArray(q.options) && ['optionA', 'optionB', 'optionC', 'optionD', 'optionE'].some(k => q[k] !== undefined)) {
    q.options = ['optionA', 'optionB', 'optionC', 'optionD', 'optionE'].map(k => q[k]).filter(v => v !== undefined && v !== '');
  }
  let type = String(q.type || 'mcq').trim();
  const lower = type.toLowerCase();
  const typeMap = { mcq: 'mcq', 'multiple choice': 'mcq', trace_output: 'pseudocode', truefalse: 'truefalse', 'true/false': 'truefalse',
    shortanswer: 'short', short_answer: 'short', fillinblank: 'gap', fill_in_the_gap: 'gap', multiselect: 'multi', multiple_select: 'multi',
    image: 'mcq', tracetable: 'trace_table', codeoutput: 'code_output' };
  type = typeMap[lower] || lower;

  const out = {
    id: String(q.id || '').trim(),
    schema_version: 2,
    subject: q.subject_id || (String(q.subject || '').includes('0478') || !q.subject ? 'CS-0478' : q.subject),
    grade: q.grade != null && q.grade !== '' ? Number(q.grade) : null,
    paper: q.paper || CHAPTERS[q.chapter_id]?.paper || null,
    chapter_id: q.chapter_id || null,
    subchapter: q.subchapter || null,
    topic: q.topic || q.chapterTitle || null,
    learning_objective: q.learning_objective || q.learningObjective || null,
    difficulty: normDifficulty(q.difficulty),
    cognitive_level: q.cognitive_level || q.cognitiveLevel || null,
    type,
    text: String(q.text ?? '').replace(/\r\n/g, '\n'),
    code: q.code || null,
    image_url: q.image_url || q.imageUrl || null,
    image_alt: q.image_alt || null,
    group_id: q.group_id || null,
    stimulus: q.stimulus || null,
    options: Array.isArray(q.options) ? q.options.map(o => String(o)) : [],
    answer: null,
    explanation: q.explanation || '',
    hint: q.hint || '',
    misconception_tag: q.misconception_tag && LEGACY_TAG_MAP[q.misconception_tag] ? LEGACY_TAG_MAP[q.misconception_tag] : (q.misconception_tag || null),
    legacy_tag: q.misconception_tag && LEGACY_TAG_MAP[q.misconception_tag] ? q.misconception_tag : (q.legacy_tag || null),
    option_misconceptions: q.option_misconceptions || {},
    marks: Number(q.marks ?? q.points ?? defaultMarks(type)) || 1,
    active: q.active !== false,
    source,
    external_ref: q.external_ref || (q.topicKey ? { platform: 'WOW_SIR', topicKey: q.topicKey } : null),
    starter: q.starter || null,
    solution: q.solution || null,
    tests: Array.isArray(q.tests) ? q.tests : [],
    parts: Array.isArray(q.parts) ? q.parts : [],
    items: Array.isArray(q.items) ? q.items.map(String) : [],
    left: Array.isArray(q.left) ? q.left.map(String) : [],
    right: Array.isArray(q.right) ? q.right.map(String) : [],
    columns: Array.isArray(q.columns) ? q.columns.map(String) : [],
  };

  // Answer key by type and by input dialect
  const a = q.answer !== undefined ? q.answer : q.correct;
  switch (type) {
    case 'mcq':
    case 'pseudocode':
    case 'debugging':
    case 'code_output':
      if (out.options.length) out.answer = a === null || a === undefined || a === '' ? null : resolveOptionIndex(a, out.options);
      else out.answer = toAcceptList(a, q.accept);
      break;
    case 'multi':
      out.answer = (Array.isArray(a) ? a : String(a ?? '').split(/[|;,]/)).map(x => resolveOptionIndex(x, out.options)).filter(x => x !== null).sort((x, y) => x - y);
      break;
    case 'truefalse': {
      if (!out.options.length) out.options = ['True', 'False'];
      const s = String(a).trim().toLowerCase();
      out.answer = s === 'true' || s === '0' && out.options[0] === 'True' || a === true ? true : s === 'false' || s === '1' || a === false ? false : null;
      break;
    }
    case 'short':
      out.answer = toAcceptList(a, q.accept);
      out.case_sensitive = !!q.case_sensitive;
      out.numeric_tolerance = q.numeric_tolerance != null ? Number(q.numeric_tolerance) : null;
      break;
    case 'gap':
      out.answer = Array.isArray(a) && Array.isArray(a[0]) ? a.map(g => g.map(String))
        : Array.isArray(a) ? a.map(g => String(g).split('|'))
        : String(a ?? '').split(';').map(g => g.split('|').map(s => s.trim()));
      break;
    case 'matching':
      // answer: array where answer[i] = index in `right` matching left[i]
      out.answer = Array.isArray(a) ? a.map(Number) : String(a ?? '').split(/[|;,]/).map(Number);
      break;
    case 'ordering':
      out.answer = Array.isArray(a) ? a.map(Number) : String(a ?? '').split(/[|;,]/).map(Number);
      break;
    case 'trace_table':
      out.answer = Array.isArray(a) ? a.map(r => r.map(c => (c === null || c === undefined ? '' : String(c)))) : [];
      break;
    case 'structured':
      out.answer = null; // per-part mark schemes live in `parts`
      break;
    case 'coding':
      out.answer = null; // marked by tests or by the teacher
      break;
    default:
      out.answer = a ?? null;
  }
  return out;
}

function normDifficulty(d) {
  if (d === undefined || d === null || d === '') return 2;
  const m = { easy: 1, medium: 2, hard: 3, foundation: 1, core: 2, extended: 3 };
  if (typeof d === 'string' && m[d.toLowerCase()]) return m[d.toLowerCase()];
  const n = Number(d);
  return n >= 1 && n <= 3 ? Math.round(n) : 2;
}
function defaultMarks(type) { return { coding: 4, structured: 4, trace_table: 3, matching: 2, ordering: 2 }[type] || 1; }
function resolveOptionIndex(a, options) {
  if (a === null || a === undefined || a === '') return null;
  if (typeof a === 'number') return Number.isInteger(a) ? a : null;
  const s = String(a).trim();
  if (/^\d+$/.test(s)) return Number(s);
  if (/^[A-Ea-e]$/.test(s)) return s.toUpperCase().charCodeAt(0) - 65;
  const idx = options.findIndex(o => normAnswer(o) === normAnswer(s));
  return idx >= 0 ? idx : null;
}
function toAcceptList(a, accept) {
  if (Array.isArray(accept) && accept.length) return accept.map(String);
  if (Array.isArray(a)) return a.map(String);
  if (a === null || a === undefined) return [];
  return String(a).split('|').map(s => s.trim()).filter(Boolean);
}

// ── Validation ───────────────────────────────────────────────────────────
/** Returns { ok, errors[], warnings[] } for a canonical question. */
export function validateQuestion(q, { taxonomyIds = null } = {}) {
  const errors = [], warnings = [];
  if (!q.id) errors.push('Missing id');
  else if (!/^[A-Za-z0-9_\-.]{2,80}$/.test(q.id)) errors.push('id may contain only letters, digits, _ - . (2–80 characters)');
  if (!QUESTION_TYPES[q.type]) errors.push(`Unknown type "${q.type}"`);
  if (!normText(q.text)) errors.push('Missing question text');
  if (q.chapter_id && !CHAPTERS[q.chapter_id]) errors.push(`Unknown chapter_id "${q.chapter_id}"`);
  if (!q.chapter_id) warnings.push('No chapter_id — question will not appear in chapter analytics');
  const nOpt = q.options?.length || 0;
  const optionTypes = ['mcq', 'multi', 'truefalse'];
  const needsOptions = optionTypes.includes(q.type) || (['pseudocode', 'debugging', 'code_output'].includes(q.type) && nOpt > 0);
  if (needsOptions) {
    if (nOpt < 2) errors.push('Needs at least 2 options');
    if (new Set(q.options.map(o => normAnswer(o))).size !== nOpt) errors.push('Options must be distinct');
    if (q.options.some(o => !normText(o))) errors.push('Empty option');
  }
  switch (q.type) {
    case 'mcq': case 'pseudocode': case 'debugging': case 'code_output':
      if (nOpt) { if (!Number.isInteger(q.answer) || q.answer < 0 || q.answer >= nOpt) errors.push('Answer must be the index of one option'); }
      else if (!Array.isArray(q.answer) || !q.answer.length) errors.push('Provide at least one accepted answer');
      break;
    case 'multi':
      if (!Array.isArray(q.answer) || !q.answer.length) errors.push('Multiple-select needs at least one correct option');
      else if (q.answer.some(i => i < 0 || i >= nOpt)) errors.push('Answer index out of range');
      break;
    case 'truefalse':
      if (typeof q.answer !== 'boolean') errors.push('Answer must be true or false');
      break;
    case 'short':
      if (!Array.isArray(q.answer) || !q.answer.length) errors.push('Provide at least one accepted answer');
      break;
    case 'gap': {
      const gaps = (q.text.match(/_{3,}|\{\{\d+\}\}/g) || []).length;
      if (!gaps) errors.push('Gap-fill text needs gaps written as ___ or {{1}}');
      if (!Array.isArray(q.answer) || q.answer.length !== gaps) errors.push(`Answer must list accepted values for each of the ${gaps} gaps`);
      break;
    }
    case 'matching':
      if (q.left.length < 2 || q.right.length < 2) errors.push('Matching needs at least 2 left and 2 right items');
      if (!Array.isArray(q.answer) || q.answer.length !== q.left.length || q.answer.some(i => !(i >= 0 && i < q.right.length))) errors.push('Answer must give a right-hand index for every left-hand item');
      break;
    case 'ordering': {
      const n = q.items.length;
      if (n < 2) errors.push('Ordering needs at least 2 items');
      const s = [...(q.answer || [])].sort((a, b) => a - b);
      if (s.length !== n || s.some((v, i) => v !== i)) errors.push('Answer must be a permutation of item indices');
      break;
    }
    case 'trace_table':
      if (!q.columns.length) errors.push('Trace table needs column headings');
      if (!q.answer.length || q.answer.some(r => r.length !== q.columns.length)) errors.push('Every answer row must have one cell per column');
      break;
    case 'structured':
      if (!q.parts.length) errors.push('Structured questions need at least one part');
      q.parts.forEach((p, i) => { if (!p.prompt) errors.push(`Part ${i + 1} has no prompt`); if (!(p.marks > 0)) errors.push(`Part ${i + 1} has no marks`); });
      break;
    case 'coding':
      if (!q.tests.length) warnings.push('No test cases — coding answers will need manual marking');
      q.tests.forEach((t, i) => { if (t.expected_output === undefined && !t.expect_contains?.length && !t.expect_in_order?.length) errors.push(`Test ${i + 1} needs expected_output, expect_contains or expect_in_order`); });
      break;
  }
  if (q.misconception_tag && taxonomyIds && !taxonomyIds.has(q.misconception_tag)) warnings.push(`misconception_tag "${q.misconception_tag}" is not in the taxonomy`);
  for (const [k, v] of Object.entries(q.option_misconceptions || {})) {
    if (!(Number(k) >= 0 && Number(k) < nOpt)) errors.push(`option_misconceptions key ${k} is not an option index`);
    if (Number(k) === q.answer) errors.push('The correct option cannot be mapped to a misconception');
    if (taxonomyIds && !taxonomyIds.has(v)) warnings.push(`option_misconceptions value "${v}" is not in the taxonomy`);
  }
  if (!(q.marks > 0)) errors.push('Marks must be a positive number');
  if (q.image_url && !/^(https:\/\/|data:image\/|\/)/.test(q.image_url)) errors.push('image_url must be https://, a site path, or a data:image URL');
  if (q.image_url && !q.image_alt) warnings.push('Image has no alt text (accessibility)');
  return { ok: errors.length === 0, errors, warnings };
}

/** Whether the question can be auto-marked for a given answer. */
export function isAutoMarkable(q) {
  if (q.type === 'structured') return false;
  if (q.type === 'coding') return q.tests.length > 0;
  return true;
}

// ── Scoring ──────────────────────────────────────────────────────────────
/** Score a response. Returns
 *  { score, max, correct: true|false|null, needs_manual, detail, misconception_hits: [ids] }
 *  `correct` is true only for full marks, false for zero, null for partial credit or manual marking.
 *  Coding questions return needs_manual=true here; use scoreCoding() for test-based marking. */
export function scoreAnswer(q, response) {
  const max = q.marks || 1;
  const res = (fraction, detail = {}, hits = []) => {
    const score = Math.round(max * fraction * 100) / 100;
    return { score, max, correct: fraction === 1 ? true : fraction === 0 ? false : null, needs_manual: false, detail, misconception_hits: hits };
  };
  const unanswered = response === undefined || response === null || response === '' || (Array.isArray(response) && response.length === 0);
  if (q.type === 'structured' || q.type === 'coding') {
    return { score: null, max, correct: null, needs_manual: true, detail: { reason: unanswered ? 'unanswered' : 'manual' }, misconception_hits: [] };
  }
  if (unanswered) return { ...res(0, { unanswered: true }), unanswered: true };

  switch (q.type) {
    case 'mcq': case 'pseudocode': case 'debugging': case 'code_output': {
      if (q.options.length) {
        const i = Number(response);
        const hit = i !== q.answer && q.option_misconceptions?.[i] ? [q.option_misconceptions[i]] : [];
        return res(i === q.answer ? 1 : 0, { chosen: i }, hit);
      }
      return scoreAccepted(q, response, res);
    }
    case 'truefalse': {
      const v = response === true || String(response).toLowerCase() === 'true' || response === 0 || response === '0';
      const hit = v !== q.answer && q.option_misconceptions?.[v ? 0 : 1] ? [q.option_misconceptions[v ? 0 : 1]] : [];
      return res(v === q.answer ? 1 : 0, { chosen: v }, hit);
    }
    case 'multi': {
      // Partial credit: (correct picks − wrong picks) / |key|, floored at 0. All-or-nothing `correct` flag.
      const chosen = new Set((Array.isArray(response) ? response : [response]).map(Number));
      const key = new Set(q.answer);
      let right = 0, wrong = 0; const hits = [];
      chosen.forEach(i => { if (key.has(i)) right++; else { wrong++; if (q.option_misconceptions?.[i]) hits.push(q.option_misconceptions[i]); } });
      const full = right === key.size && wrong === 0;
      const f = Math.max(0, (right - wrong) / key.size);
      return res(full ? 1 : Math.min(f, 0.99), { right, wrong }, hits);
    }
    case 'short':
      return scoreAccepted(q, response, res);
    case 'gap': {
      const arr = Array.isArray(response) ? response : [response];
      let ok = 0;
      const per = q.answer.map((acc, i) => { const g = acc.some(x => normAnswer(x) === normAnswer(arr[i])); if (g) ok++; return g; });
      return res(ok / q.answer.length, { per_gap: per });
    }
    case 'matching': {
      const arr = Array.isArray(response) ? response.map(Number) : [];
      let ok = 0; q.answer.forEach((r, i) => { if (arr[i] === r) ok++; });
      return res(ok / q.answer.length, { matched: ok });
    }
    case 'ordering': {
      // Credit = fraction of adjacent pairs in correct relative order (Kendall-style, robust to one misplaced item)
      const arr = Array.isArray(response) ? response.map(Number) : [];
      if (arr.length !== q.answer.length) return res(0, { reason: 'incomplete' });
      if (arr.every((v, i) => v === q.answer[i])) return res(1);
      const pos = new Map(q.answer.map((v, i) => [v, i]));
      let good = 0; for (let i = 0; i < arr.length - 1; i++) if (pos.get(arr[i]) < pos.get(arr[i + 1])) good++;
      return res(Math.min(0.99, good / (arr.length - 1)), { ordered_pairs: good });
    }
    case 'trace_table': {
      const rows = Array.isArray(response) ? response : [];
      let ok = 0, total = 0;
      q.answer.forEach((row, r) => row.forEach((cell, c) => {
        total++;
        const given = rows[r]?.[c] ?? '';
        if (normAnswer(given) === normAnswer(cell)) ok++;
      }));
      return res(total ? ok / total : 0, { cells_correct: ok, cells_total: total });
    }
    default:
      return { score: null, max, correct: null, needs_manual: true, detail: { reason: 'unsupported type' }, misconception_hits: [] };
  }
}

function scoreAccepted(q, response, res) {
  const given = normAnswer(response, q.case_sensitive);
  const accepted = (q.answer || []).map(a => normAnswer(a, q.case_sensitive));
  if (accepted.includes(given)) return res(1, { matched: given });
  // whitespace-insensitive comparison for code output
  if (['code_output', 'pseudocode'].includes(q.type) && accepted.some(a => a.replace(/\s/g, '') === given.replace(/\s/g, ''))) return res(1, { matched: given, note: 'whitespace' });
  if (q.numeric_tolerance != null) {
    const g = asNumber(response);
    if (g !== null && (q.answer || []).some(a => asNumber(a) !== null && Math.abs(asNumber(a) - g) <= q.numeric_tolerance)) return res(1, { numeric: g });
  }
  const hit = q.answer_misconceptions && q.answer_misconceptions[given] ? [q.answer_misconceptions[given]] : [];
  return res(0, { given }, hit);
}

/** Keyword-assisted suggestion for one structured part (teacher confirms). */
export function suggestStructuredPartMarks(part, text) {
  const t = normAnswer(text);
  const kws = (part.keywords || []).map(k => normAnswer(k));
  const found = kws.filter(k => k && t.includes(k));
  return { suggested: Math.min(part.marks, found.length), found, max: part.marks };
}

/** Answer key removed — for documents students are allowed to read. */
export function stripAnswerKey(q) {
  const { answer, explanation, solution, tests, option_misconceptions, answer_misconceptions, case_sensitive, numeric_tolerance, ...safe } = q;
  if (Array.isArray(safe.parts)) safe.parts = safe.parts.map(({ keywords, mark_scheme, ...p }) => p);
  return { ...safe, tests_count: Array.isArray(tests) ? tests.length : 0 };
}
