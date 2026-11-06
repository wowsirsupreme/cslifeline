#!/usr/bin/env node
// Builds tests/fixtures/feature_parity.json: real synthetic learners' records plus the features and
// logistic predictions computed by the BROWSER code (risk.js). ml/tests/test_parity.py recomputes them
// in Python and fails on any difference, so the in-app model and the research pipeline cannot drift.
import { readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { computeFeatures, predictLogistic } from '../public/js/engine/risk.js';
import { medianTimes } from '../public/js/engine/misconception.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
function readCsvGz(p) {
  const text = gunzipSync(readFileSync(p)).toString('utf8');
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; }
    else if (c === '"') q = true; else if (c === ',') { row.push(cell); cell = ''; } else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; } else cell += c;
  }
  const [h, ...rest] = rows; return rest.map(r => Object.fromEntries(h.map((k, i) => [k, r[i]])));
}
const parse = (r) => ({ ...r, correct: r.correct === 'true' ? true : r.correct === 'false' ? false : null, time_ms: r.time_ms === '' ? null : Number(r.time_ms),
  hint_used: r.hint_used === 'true', misconception_hits: r.misconception_hits ? r.misconception_hits.split(';') : [], mode: r.mode || null });
const resp = readCsvGz(join(ROOT, 'ml/data/synthetic/responses.csv.gz')).filter(r => r.cohort === 'H2').map(parse);
const sess = readCsvGz(join(ROOT, 'ml/data/synthetic/sessions.csv.gz')).filter(s => s.cohort === 'H2').map(s => ({ ...s, ended_at: s.ended_at || null }));
const uids = [...new Set(resp.map(r => r.student_uid))].slice(0, 12);
const asOf = Date.parse('2026-03-09T00:00:00Z'); // week 8 cut-off of cohort H2
const med = medianTimes(resp.filter(r => Date.parse(r.recorded_at) < asOf));
const reg = JSON.parse(readFileSync(join(ROOT, 'ml/models/registry.json'), 'utf8'));
const prod = reg.models.find(m => m.status === 'production');
const entry = prod ? JSON.parse(readFileSync(join(ROOT, prod.path, 'registry_entry.json'), 'utf8')) : null;
const cases = uids.map(uid => {
  const rs = resp.filter(r => r.student_uid === uid), ss = sess.filter(s => s.student_uid === uid);
  const features = computeFeatures(rs, ss, asOf, { medianTimeByQuestion: med });
  const pred = entry?.artefact ? predictLogistic(entry.artefact, features) : null;
  return { uid, responses: rs, sessions: ss, features, js_probability: pred?.risk_probability ?? null };
});
writeFileSync(join(ROOT, 'tests/fixtures/feature_parity.json'), JSON.stringify({ as_of: asOf, model_version: entry?.model_version || null,
  median_times: Object.fromEntries(med), cases }));
console.log(`feature_parity.json: ${cases.length} learners, model ${entry?.model_version || 'none'}`);
