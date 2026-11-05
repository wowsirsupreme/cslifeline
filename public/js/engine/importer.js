// js/engine/importer.js
// Question import pipeline: parse → normalise → validate → duplicate check → report.
// Nothing is silently discarded: every input row ends up in exactly one of
// `ready`, `duplicates` (need teacher confirmation) or `rejected` (with reasons).

import { parseCSVObjects } from './csv.js';
import { normaliseQuestion, validateQuestion, normText } from './questions.js';
import { TAXONOMY } from './taxonomy-data.js';

const TAX_IDS = new Set(TAXONOMY.map(t => t.id));

// CS Lifeline CSV template columns. The WOW Sir template
// (id,topicKey,type,text,optionA–D,answer,explanation,difficulty,points,chapter,imageUrl) is also accepted.
export const CSV_TEMPLATE_COLUMNS = ['id', 'type', 'chapter_id', 'subchapter', 'topic', 'learning_objective', 'grade', 'difficulty', 'marks',
  'text', 'code', 'optionA', 'optionB', 'optionC', 'optionD', 'optionE', 'answer', 'explanation', 'hint', 'misconception_tag',
  'option_misconceptions', 'image_url', 'image_alt', 'group_id', 'stimulus', 'items', 'left', 'right', 'columns', 'active'];

/** Similarity of two question texts in [0,1]: max of word-Jaccard and character-trigram Dice. */
export function textSimilarity(a, b) {
  const na = canonicalText(a), nb = canonicalText(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  const wa = new Set(na.split(' ')), wb = new Set(nb.split(' '));
  const inter = [...wa].filter(w => wb.has(w)).length;
  const jac = inter / (wa.size + wb.size - inter);
  const tri = s => { const t = new Map(); const p = `  ${s} `; for (let i = 0; i < p.length - 2; i++) { const g = p.slice(i, i + 3); t.set(g, (t.get(g) || 0) + 1); } return t; };
  const ta = tri(na), tb = tri(nb);
  let common = 0, ca = 0, cb = 0;
  ta.forEach((v, k) => { ca += v; if (tb.has(k)) common += Math.min(v, tb.get(k)); });
  tb.forEach(v => { cb += v; });
  const dice = (2 * common) / (ca + cb);
  return Math.max(jac, dice);
}
export function canonicalText(s) {
  return normText(s).toLowerCase().replace(/[^\p{L}\p{N}\s←<>=+\-*/]/gu, ' ').replace(/\s+/g, ' ').replace(/\s*([←<>=+\-*/])\s*/g, '$1').trim();
}

/** Fingerprint used for exact-duplicate detection: text + sorted options. */
export function fingerprint(q) {
  return canonicalText(q.text) + '||' + (q.options || []).map(canonicalText).sort().join('|') + '||' + (q.code ? canonicalText(q.code) : '');
}

function splitList(v) { return v === undefined || v === '' ? undefined : String(v).split('|').map(s => s.trim()); }

/** Convert a CSV record to a raw question object. */
export function csvRecordToRaw(r) {
  const raw = { ...r };
  delete raw.__row;
  if (r.chapter && !r.chapter_id && /^T\d{2}$/.test(r.chapter)) raw.chapter_id = r.chapter;
  if (r.points && !r.marks) raw.marks = r.points;
  if (r.imageUrl && !r.image_url) raw.image_url = r.imageUrl;
  for (const k of ['items', 'left', 'right', 'columns']) if (r[k] !== undefined) raw[k] = splitList(r[k]);
  if (r.option_misconceptions) {
    // format: "0:MC-BIN-01;2:MC-BIN-02"
    raw.option_misconceptions = Object.fromEntries(String(r.option_misconceptions).split(';').filter(Boolean).map(p => p.split(':').map(s => s.trim())));
  }
  if (r.active !== undefined && r.active !== '') raw.active = !/^(false|0|no)$/i.test(r.active);
  if (r.answer && /^\[/.test(String(r.answer).trim())) { try { raw.answer = JSON.parse(r.answer); } catch { /* keep string */ } }
  for (const k of Object.keys(raw)) if (raw[k] === '') delete raw[k];
  return raw;
}

/**
 * @param input   { csvText } or { json: Array }
 * @param existing current question bank (canonical) for duplicate checks
 * @param opts    { similarityThreshold = 0.85, source }
 * @returns { ready:[q], duplicates:[{q, match, similarity, kind}], rejected:[{row, id, errors}], warnings:[{row,id,warnings}] }
 */
export function prepareImport(input, existing = [], { similarityThreshold = 0.85, source = 'imported' } = {}) {
  let rawRows;
  if (input.csvText !== undefined) {
    const { headers, records } = parseCSVObjects(input.csvText);
    if (!headers.includes('text') || !headers.includes('id')) {
      return { ready: [], duplicates: [], rejected: [{ row: 1, id: null, errors: ['CSV header must include at least "id" and "text" columns. Download the template for the full list.'] }], warnings: [] };
    }
    rawRows = records.map(r => ({ row: r.__row, raw: csvRecordToRaw(r) }));
  } else if (Array.isArray(input.json)) {
    rawRows = input.json.map((raw, i) => ({ row: i + 1, raw }));
  } else {
    throw new Error('prepareImport needs csvText or json');
  }

  const ready = [], duplicates = [], rejected = [], warnings = [];
  const existingById = new Map(existing.map(q => [q.id, q]));
  const existingFp = new Map(existing.map(q => [fingerprint(q), q]));
  const batchFp = new Map(); const batchIds = new Set();

  for (const { row, raw } of rawRows) {
    let q;
    try { q = normaliseQuestion(raw, { source }); } catch (e) { rejected.push({ row, id: raw?.id ?? null, errors: [e.message] }); continue; }
    const v = validateQuestion(q, { taxonomyIds: TAX_IDS });
    if (!v.ok) { rejected.push({ row, id: q.id || null, errors: v.errors }); continue; }
    if (v.warnings.length) warnings.push({ row, id: q.id, warnings: v.warnings });
    if (batchIds.has(q.id)) { rejected.push({ row, id: q.id, errors: ['Duplicate id within this file'] }); continue; }
    batchIds.add(q.id);
    const fp = fingerprint(q);
    if (batchFp.has(fp)) { rejected.push({ row, id: q.id, errors: [`Same question text and options as row ${batchFp.get(fp)} in this file`] }); continue; }
    batchFp.set(fp, row);
    if (existingById.has(q.id)) { duplicates.push({ row, q, match: existingById.get(q.id), similarity: textSimilarity(q.text, existingById.get(q.id).text), kind: 'same_id' }); continue; }
    if (existingFp.has(fp)) { duplicates.push({ row, q, match: existingFp.get(fp), similarity: 1, kind: 'identical' }); continue; }
    let best = null, bestSim = 0;
    for (const e of existing) {
      if (e.chapter_id && q.chapter_id && e.chapter_id !== q.chapter_id) continue;
      const s = textSimilarity(q.text, e.text);
      if (s > bestSim) { bestSim = s; best = e; }
    }
    if (best && bestSim >= similarityThreshold) { duplicates.push({ row, q, match: best, similarity: bestSim, kind: 'similar' }); continue; }
    ready.push(q);
  }
  return { ready, duplicates, rejected, warnings };
}

export function templateCSV() {
  const example = {
    id: 'T01_BIN_EX1', type: 'mcq', chapter_id: 'T01', subchapter: '1.1', topic: 'Number systems', learning_objective: 'Convert between binary and denary',
    grade: 10, difficulty: 1, marks: 1, text: 'What is the denary value of the binary number 00110101?', code: '',
    optionA: '43', optionB: '53', optionC: '63', optionD: '106', optionE: '', answer: 'B',
    explanation: '32 + 16 + 4 + 1 = 53.', hint: 'Write the place values 128 64 32 16 8 4 2 1 above the bits.',
    misconception_tag: 'MC-BIN-01', option_misconceptions: '0:MC-BIN-01;3:MC-BIN-04', image_url: '', image_alt: '', group_id: '', stimulus: '',
    items: '', left: '', right: '', columns: '', active: 'true',
  };
  const esc = v => /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v);
  return CSV_TEMPLATE_COLUMNS.join(',') + '\r\n' + CSV_TEMPLATE_COLUMNS.map(c => esc(example[c] ?? '')).join(',') + '\r\n';
}
