# System architecture

## Overview

```
 Browser (static site on Vercel)                           Firebase project (cslifeline-94bf7)
 ┌───────────────────────────────────────────────┐          ┌─────────────────────────────────────┐
 │ index.html  student/  teacher/  admin/        │          │ Authentication (email, Google)      │
 │   portals/*.js  →  views/*.js  (pages)        │          │ Cloud Firestore  ← firestore.rules  │
 │   ui/kit.js, shell.js, question-view.js       │  HTTPS   │ Storage (question images, optional) │
 │   app/data.js        (loads what a page needs)│ ───────▶ │ Cloud Functions (optional, Blaze):  │
 │   core/store.js      (single data layer)      │          │   scoreSubmission, ingest,          │
 │     ├ backend-firebase.js  (production)       │          │   closeExpired                      │
 │     └ backend-demo.js      (synthetic, local) │          └─────────────────────────────────────┘
 │   engine/*.js  (pure: marking, misconceptions,│                          ▲
 │     analytics, risk, interventions, importer) │                          │ signed POST /ingest
 │   integration/events.js (canonical events)    │          ┌─────────────────────────────────────┐
 └───────────────────────────────────────────────┘          │ WOW Sir, DBWOW, future platforms    │
                    ▲  registry_entry.json,                 │ (unchanged; adapters translate)     │
                    │  predictions.json                     └─────────────────────────────────────┘
 ┌───────────────────────────────────────────────┐
 │ ml/cslifeline_ml (Python / Colab)             │
 │  features.py ≡ engine/risk.js (parity-tested) │
 │  dataset → pipeline → registry → predictions  │
 └───────────────────────────────────────────────┘
```

## Design decisions

| Decision | Reason |
|---|---|
| Keep plain HTML, CSS and ES modules; no framework, no build step. | The v3 routes keep working and the site deploys as plain static files (Vercel, or Netlify); there is nothing to compile, so a teacher-developer can edit and redeploy. Modules give the separation that v3's 1,800-line inline scripts lacked. |
| One data layer (`core/store.js`) with two interchangeable backends. | Pages never call Firebase directly. The demonstration backend (pattern taken from DBWOW's test backend) lets the whole product be explored with synthetic data, and lets the browser tests run without a server. |
| Pure engines in `public/js/engine/`. | The same marking, record-building and integration code runs in the browser, in Node tests, in Cloud Functions (copied by `scripts/sync-functions-shared.mjs`) and in the synthetic-data generator. One definition of a response record ends the v3 read/write mismatch. |
| Security in `firestore.rules`, not in the interface. | Every role check in the UI is a convenience; the rules enforce roles, class isolation, answer-key secrecy, release of results, immutability of outcomes and audit logs. |
| Cloud Functions optional. | They need the paid Blaze plan. Without them, teachers' browsers mark submissions with keys only teachers can read, and administrators import platform data in the Integrations page. |
| Python for training, browser for scoring logistic models. | Research needs Python and Colab. A logistic model is exported as coefficients so teachers can score their class in the app; any other model's predictions are imported from Python. Feature code exists twice and is parity-tested to 1e-9. |
| Canonical event schema for other platforms. | WOW Sir and DBWOW stay independent; adapters translate their native records. A failure in one platform cannot affect the others. |

## Module map (browser)

| Module | Responsibility |
|---|---|
| `core/config.js` | Firebase web config, mode (firebase/demo), feature flags (`functionsDeployed`, `googleSignIn`). |
| `core/store.js` | All reads and writes; audit entries; outbox for responses and submissions (works offline, idempotent IDs); role-aware queries. |
| `core/backend-firebase.js` / `backend-demo.js` | Generic get/set/query/batch/auth over Firestore or over an in-memory synthetic dataset with a localStorage overlay. |
| `engine/questions.js`, `marking.js`, `pseudocode/interpreter.js` | Canonical question model (13 types), validation, deterministic scoring, Cambridge pseudocode interpreter for code questions. |
| `engine/records.js` | Builders for response and scored-submission records (shared with Functions). |
| `engine/misconception.js`, `taxonomy-data.js` | Evidence-based misconception detection (mce-1.1) and the 68-entry taxonomy. |
| `engine/analytics.js`, `stats.js` | Accuracy, chapter breakdowns, trends, class summaries, Wilson intervals. |
| `engine/risk.js` | Risk features (fv-1.1), logistic inference with exact contributions, explanations, suggested actions. |
| `engine/interventions.js` | Before/after evaluation of interventions on target evidence (association, not causation). |
| `engine/importer.js`, `csv.js` | Validated, duplicate-aware question import; CSV with formula-injection protection. |
| `engine/curriculum.js` | 0478 chapters T01–T14, topics, external topic mapping. |
| `integration/events.js` | Canonical event schema, validation, WOW Sir / DBWOW / CS Lifeline adapters, duplicate detection, identity linking. |
| `ui/kit.js`, `shell.js`, `question-view.js` | Components (tables, modals, forms, charts, toasts), portal shell and routing, question rendering for every type. |
| `views/*.js`, `portals/*.js` | Pages for each role. |

## Data flow for one answer

1. Student answers in `portals/student.js`; `engine/marking.js` marks it (practice only; assessments are marked later).
2. `store.buildResponse` builds the canonical record (always with `class_code`, `school_id`, `pseudo_id`).
3. The record goes to the outbox in localStorage, then to Firestore with a deterministic ID; a lost connection only delays it.
4. Teacher pages load class records through `app/data.js` and compute findings with the engines; nothing on a dashboard is stored or hard-coded.
5. The research export and the Python pipeline compute the same features from the same records.

## Routes

| Path | Page |
|---|---|
| `/` | Sign-in, registration, demonstration entry (`?mode=demo`, `?tab=register&class=CODE`). |
| `/student/#/…` | home, practice, assessments, assigned practice, daily challenge, progress, pseudocode editor, tutorials, account. |
| `/teacher/#/…` | dashboard, students, student/:uid, analytics, misconceptions, early-warning, interventions, assessments, question bank, roster, reports, research export. |
| `/admin/#/…` | overview, users, schools and classes, curriculum, settings, models, integrations, audit log, data and privacy. |
| `/privacy.html` | Plain-language data notice. |
