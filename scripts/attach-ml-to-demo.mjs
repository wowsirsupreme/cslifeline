#!/usr/bin/env node
// Put the registered production model and its predictions for the current synthetic cohort into the
// demonstration dataset, exactly as an administrator would via Administration → Models.
// Usage: node scripts/attach-ml-to-demo.mjs
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const demoPath = join(ROOT, 'public/data/demo/demo_dataset.json');
const reg = JSON.parse(readFileSync(join(ROOT, 'ml/models/registry.json'), 'utf8'));
const prod = reg.models.find(m => m.status === 'production');
if (!prod) { console.error('No production model in ml/models/registry.json — run: python -m cslifeline_ml promote <version> --reason "..."'); process.exit(1); }
const entry = JSON.parse(readFileSync(join(ROOT, prod.path, 'registry_entry.json'), 'utf8'));
const predFile = join(ROOT, 'ml/reports', `predictions_C_${entry.model_version}.json`);
if (!existsSync(predFile)) { console.error('Missing', predFile, '— run: python -m cslifeline_ml predict --model', entry.model_version); process.exit(1); }
const preds = JSON.parse(readFileSync(predFile, 'utf8')).predictions;
const demo = JSON.parse(readFileSync(demoPath, 'utf8'));

// Registry document as stored in Firestore model_registry/{version} (heavy per-model tables trimmed).
const { metrics, ...rest } = entry;
const doc = { id: entry.model_version, ...rest, metrics: { test: metrics.test, cv: metrics.cv, subgroups: metrics.subgroups, errors: metrics.errors,
  ablation: { pr_auc_gain_of_behaviour_and_engagement: metrics.ablation.pr_auc_gain_of_behaviour_and_engagement },
  cross_platform: { combined_minus_cslifeline: metrics.cross_platform.combined_minus_cslifeline }, test_all_models: Object.fromEntries(Object.entries(metrics.test_all_models).map(([k, v]) => [k, { pr_auc: v.pr_auc, roc_auc: v.roc_auc, brier: v.brier, recall: v.recall, precision: v.precision }])) },
  registered_at: entry.training.trained_at, is_synthetic: true };
demo.collections.model_registry = [doc];
const day = String(preds[0]?.predicted_at || '').slice(0, 10);
demo.collections.predictions = preds.map(p => ({ id: `${p.student_uid}__${p.model_version}__${day}`, ...p, imported_at: p.predicted_at, imported_by: 'syn_admin', is_synthetic: true }));
writeFileSync(demoPath, JSON.stringify(demo));
console.log(`Attached ${entry.model_version} (${entry.status}) and ${preds.length} predictions to the demonstration dataset.`);
