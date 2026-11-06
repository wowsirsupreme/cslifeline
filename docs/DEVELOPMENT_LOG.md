# Development log

Work happened in one long-running session across two days; an interruption on 5 November meant the second day began by recovering the state from the repository's checkpoints.

## 5 November 2026 — checkpoint 1 (earlier part of the session)

* Read every file of CS Lifeline v3, DBWOW and WOW Sir (and the WOW Sir pseudocode interpreter); wrote `docs/TECHNICAL_AUDIT.md` (12 security findings, functional defects, question-bank errors, behavioural-analytics and ML problems).
* Ran both interpreters against a 12-program reference suite; decided to write a new interpreter.
* Built the pure engines (questions, marking, misconception taxonomy and engine, analytics, risk, interventions, importer, curriculum), the data layer with Firebase and demonstration backends, the 214-question bank, the integration adapters and the first unit tests (61 passing).
* Wrote `firestore.rules`, storage rules, indexes, the Cloud Functions (marking, ingest, closing) and the student portal plus some teacher views; the rules tests were written but could not run (emulator download blocked).
* Session interrupted before the remaining views, ML pipeline, data, tests and docs were done.

## 6 November 2026

| Time (UTC) | Work | Files | Result |
|---|---|---|---|
| 03:22 | Re-read the brief; found the existing checkpoint; re-audited v3 and both repositories to confirm the audit; preserved v3 untouched under `legacy/`; committed uncommitted earlier work. | `legacy/`, git | checkpoint 2 |
| 03:30 | Found the Python generator had drifted from the app (old answer format, 167 vs 214 questions) and wrote no files. Ported it to Node so every synthetic answer is marked by the app's own engine; WOW Sir and DBWOW activity produced in native formats and passed through the real adapters. | `scripts/synthetic/generate.mjs` | 676 learners, 72 k responses, 16.7 k events, 0 rejected |
| 03:31 | Demo backend shifts timestamps so the demo stays current. | `core/backend-demo.js` | |
| 03:32 | Found session completion used final status (leaks the future) — fixed in both implementations (fv-1.1). | `engine/risk.js`, `features.py` | |
| 03:33–03:40 | Python pipeline: features (parity with JS), leakage-safe tables, six models, grouped + temporal validation, thresholds, calibration, subgroups, ablation, cross-platform experiments, registry, predictions, report. | `ml/cslifeline_ml/*` | runs in 15 s |
| 03:40 | DBWOW snapshot timing made explicit (periodic snapshots, first-seen time). | generator | DBWOW features usable before cut-offs |
| 03:42 | Promoted the synthetic model as a demonstration; predicted the current cohort; attached to demo. Parity tests: features identical; browser logistic = sklearn to 1e-9. | `scripts/attach-ml-to-demo.mjs`, `ml/tests/` | 7 Python tests pass |
| 03:45–04:05 | Missing teacher views (assessments, question bank, roster, reports, research export) and the whole administrator portal. | `views/*.js`, `portals/admin.js` | all imports resolve |
| 04:05–04:15 | Browser e2e suite (49 checks). First run 46/49: two test-script issues, one real defect (top bar overflowed 135 px on phones; grid children not shrinking). Fixed CSS; 49/49. | `tests/e2e/run.mjs`, `css/app.css`, `ui/shell.js` | 49/49 |
| 04:15–04:25 | Migration (pure transforms + script, unit-tested), first-admin provisioning, extended rules tests, Netlify config with strict CSP, templates, privacy notice, 404. Root-level dev dependencies replace a stray `tools/` folder. | `scripts/`, `netlify.toml`, `public/` | 66 unit tests |
| 04:25 | The brief's example event mapped to no chapter: added a default chapter lookup (unknown names still map to nothing). | `integration/events.js` | example → T08 |
| 04:30 | Colab notebook; executed headlessly. Found that re-running training would reset a promoted model to "candidate"; fixed. | `ml/notebooks/`, `pipeline.py` | identical results |
| 04:35 | Evaluated the misconception engine against simulated ground truth: "demonstrated" precision 16 %. Engine 1.1: distractors must discriminate; errors must exceed the learner's baseline. Tuned on H1, reported on H2: precision 27 %, never from a single error. Added an editor warning for non-discriminating distractors. | `engine/misconception.js`, `scripts/evaluate-misconceptions.mjs` | 68 unit tests |
| 04:40 | Storage rules: refuse SVG uploads. Documentation. Final test run, packaging. | `storage.rules`, `docs/` | |

## Problems found and resolved this session

1. Synthetic generator incompatible with the app's schema → rewritten on the app's engine.
2. Feature leakage through session status → fixed, version bumped.
3. DBWOW data unusable at cut-offs (single end-of-term snapshot) → periodic snapshots with first-seen times.
4. Phone layout overflow → fixed and covered by a test.
5. Example event chapter not mapped → default lookup.
6. Registry re-run demoted production → status preserved.
7. Misconception engine over-flagging → engine 1.1 with measured improvement.
8. Roster join link used a parameter the sign-in page did not read → fixed.
9. Demo invitation overstated the dataset → corrected.

## Outstanding

See `CONTINUATION_GUIDE.md`.
