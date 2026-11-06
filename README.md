# CS Lifeline 4.0

CS Lifeline is a learning analytics and early-warning system for Cambridge IGCSE Computer Science (0478). Students practise and sit assessments; teachers see which ideas each student and class misunderstands, which students may need help soon and why, and whether the help they gave was followed by improvement. Administrators manage accounts, classes, the curriculum, models and the data coming from other platforms (WOW Sir, DBWOW).

It is the data-collection and intervention instrument for the MSc study "An AI-Driven Learning Analytics Framework for Detecting Student Misconceptions and Predicting At-Risk Learners in IGCSE Computer Science Education" (University of Ghana).

## Try it without setting anything up

```
node scripts/serve.mjs          # then open http://localhost:8642/?mode=demo
```

The demonstration runs entirely in the browser on synthetic data (two schools, five classes, 92 learners in the current term) and lets you sign in as a student, a teacher or an administrator. Nothing leaves the browser. Every synthetic record, prediction and model is labelled as such on screen.

## What is in this repository

| Folder | Contents |
|---|---|
| `vercel.json`, `netlify.toml` | Hosting configuration (Vercel is primary). |
| `public/` | The web application (static HTML + ES modules, no build step). `index.html` sign-in, `student/`, `teacher/`, `admin/` portals, `js/engine/` pure analytics engines, `js/core/` data layer, `js/views/` pages, `data/` question bank and demo dataset, `templates/` import templates and sample payloads. |
| `firestore.rules`, `firestore.indexes.json`, `storage.rules` | Database security rules (the real access control) and indexes. |
| `functions/` | Optional Cloud Functions (Blaze plan): automatic marking, the signed ingest API for other platforms, closing expired assessments. |
| `ml/` | Python research pipeline: feature parity with the browser, leakage-safe training and evaluation, model registry, predictions, Colab notebook, tests. |
| `scripts/` | Synthetic data generator, v3→v4 migration, first-administrator provisioning, static server, evaluation scripts. |
| `tests/` | Unit tests (Node), Firestore rules tests (emulator), browser end-to-end tests (Playwright), fixtures. |
| `docs/` | Audit, architecture, schema, API, integration, data dictionary, ML methodology and evaluation, security and privacy, deployment, testing, changelog, development log, continuation guide, user guides. |
| `legacy/v3_original/` | The untouched v3 application, kept for reference and migration. |

## Commands

| Command | What it does |
|---|---|
| `npm run serve` | Serve `public/` locally (same routes as the hosted site). |
| `npm test` | Unit tests for engines, marking, interpreter, integration adapters, ingest API, migration (68 tests). |
| `npm run test:e2e` | Browser tests of every page and key workflow in all three portals (49 checks; needs Playwright + Chromium). |
| `npm run test:ml` | Python tests, including exact feature parity between the browser and Python and between the in-browser model and scikit-learn. |
| `npm run test:rules` | Firestore security-rules tests (needs Java and the Firebase emulator; see docs/TESTING_REPORT.md). |
| `npm run data:synthetic` | Regenerate the synthetic cohorts and demo dataset. |
| `npm run ml:train` | Train, compare and evaluate models; register a candidate; write a report. |

## Deploying

See `docs/DEPLOYMENT_GUIDE.md`. In short: deploy the rules and indexes to the existing Firebase project, import the GitHub repository into Vercel (the included `vercel.json` publishes `public/` with the security headers; `netlify.toml` does the same on Netlify), add the Vercel domain to Firebase Authentication's authorised domains, provision the first administrator with `scripts/provision-admin.mjs`, then migrate any v3 data with `scripts/migrate-v3.mjs` (dry run first).

## Status in one paragraph

All three portals, the assessment engine (13 question types), the evidence-based misconception engine, the intervention workflow, reports, the research export, the administration portal, the integration layer with WOW Sir and DBWOW adapters, and the ML pipeline are implemented and tested. The demonstration model is trained on synthetic data and is labelled as a demonstration everywhere; no claim is made about accuracy on real learners until the pipeline is run on real, consented data. The security rules have a test suite that could not be run in the build environment (the emulator download was blocked) and must be run before deployment. Known limitations and remaining external steps are listed in `docs/CONTINUATION_GUIDE.md`.
