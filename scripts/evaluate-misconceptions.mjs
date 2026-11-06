#!/usr/bin/env node
// Evaluates the misconception engine (engine/misconception.js) against the SIMULATED ground truth in
// ml/data/synthetic/ground_truth.csv. Synthetic learners are generated with known held misconceptions,
// so precision and recall of the engine's classifications can be measured. Results describe behaviour
// on synthetic data only. Writes ml/reports/misconception_engine_evaluation.md.
import { readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { QUESTION_BANK } from '../public/data/question-bank.js';
import { normaliseQuestion } from '../public/js/engine/questions.js';
import { detectForStudent, medianTimes, ENGINE_VERSION } from '../public/js/engine/misconception.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
function parseCsv(text) {
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) { const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; }
    else if (c === '"') q = true; else if (c === ',') { row.push(cell); cell = ''; } else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; } else cell += c; }
  const [h, ...rest] = rows; return rest.map(r => Object.fromEntries(h.map((k, i) => [k, r[i]])));
}
const COHORT = process.argv[2] || 'H2';
const resp = parseCsv(gunzipSync(readFileSync(join(ROOT, 'ml/data/synthetic/responses.csv.gz'))).toString()).filter(r => r.cohort === COHORT)
  .map(r => ({ ...r, correct: r.correct === 'true' ? true : r.correct === 'false' ? false : null, chosen: r.chosen === '' ? null : Number(r.chosen), time_ms: r.time_ms === '' ? null : Number(r.time_ms),
    recorded_at: Date.parse(r.recorded_at), misconception_hits: r.misconception_hits ? r.misconception_hits.split(';') : [], difficulty: Number(r.difficulty) || 2 }));
const truth = parseCsv(readFileSync(join(ROOT, 'ml/data/synthetic/ground_truth.csv'), 'utf8')).filter(t => t.cohort === COHORT);
const qById = new Map(QUESTION_BANK.map(q => normaliseQuestion(q)).map(q => [q.id, q]));
const med = medianTimes(resp);
const by = new Map(); for (const r of resp) { if (!by.has(r.student_uid)) by.set(r.student_uid, []); by.get(r.student_uid).push(r); }

const levels = { demonstrated: ['demonstrated'], 'demonstrated or possible': ['demonstrated', 'possible'] };
const tally = Object.fromEntries(Object.keys(levels).map(k => [k, { tp: 0, fp: 0, fn: 0 }]));
let singleErrorFlags = 0, learners = 0, heldPairs = 0;
const statusCounts = {};
for (const t of truth) {
  const held = new Set((t.held_initial || '').split(';').filter(Boolean));
  const rs = by.get(t.uid) || [];
  if (!rs.length) continue;
  learners++; heldPairs += held.size;
  // Only misconceptions the learner had a chance to show (answered at least one probing question) can be detected.
  const findings = detectForStudent(rs, qById, { medianTimeByQuestion: med });
  for (const f of findings) {
    statusCounts[f.status] = (statusCounts[f.status] || 0) + 1;
    if (f.status === 'demonstrated' && f.counts.errors < 2) singleErrorFlags++;
  }
  const probed = new Set(findings.map(f => f.misconception_id));
  for (const [name, sts] of Object.entries(levels)) {
    const flagged = new Set(findings.filter(f => sts.includes(f.status)).map(f => f.misconception_id));
    for (const m of flagged) held.has(m) ? tally[name].tp++ : tally[name].fp++;
    for (const m of held) if (probed.has(m) && !flagged.has(m)) tally[name].fn++;
  }
}
const pct = (x) => (x * 100).toFixed(1) + '%';
const lines = [`# Misconception engine evaluation (${ENGINE_VERSION}) — synthetic cohort ${COHORT}`, '',
  '> Synthetic learners are generated with known misconceptions, so the engine can be checked against ground truth. These figures describe behaviour on simulated data and are not evidence about real classrooms.', '',
  `Learners: ${learners}. Simulated learner–misconception pairs: ${heldPairs}. Responses: ${resp.length}.`, '',
  'Ground truth = misconceptions the simulated learner held at the start of term. A held misconception counts as missed only if the learner answered at least one question probing it. Some held misconceptions are resolved during the term by practice or intervention, so a "false positive" can be a misconception that was genuinely shown and later resolved.', '',
  '| Classified as | True positives | False positives | Missed | Precision | Recall |', '|---|---|---|---|---|---|'];
for (const [name, t] of Object.entries(tally)) lines.push(`| ${name} | ${t.tp} | ${t.fp} | ${t.fn} | ${pct(t.tp / Math.max(1, t.tp + t.fp))} | ${pct(t.tp / Math.max(1, t.tp + t.fn))} |`);
lines.push('', `Status counts across all learner–misconception pairs with evidence: ${Object.entries(statusCounts).map(([k, v]) => `${k} ${v}`).join(', ')}.`, '',
  `"Demonstrated" findings supported by fewer than two wrong answers: ${singleErrorFlags} (the engine requires repeated evidence; this must be 0).`, '');
writeFileSync(join(ROOT, 'ml/reports/misconception_engine_evaluation.md'), lines.join('\n'));
console.log(lines.join('\n'));
