# Testing report

Run on 6 November 2026 in the build environment (Linux, Node 22, Python 3.13, Chromium via Playwright).

| Suite | Command | Result |
|---|---|---|
| Unit tests (Node) | `npm test` | **68 / 68 pass** |
| Python tests (features, leakage, labels, thresholds, JS↔Python parity) | `npm run test:ml` | **7 / 7 pass** |
| Browser end-to-end (demonstration backend) | `npm run test:e2e` | **49 / 49 pass** |
| Firestore security rules (emulator) | `npm run test:rules` | **Not run** — see below |
| Colab notebook executed headlessly (`jupyter nbconvert --execute`) | — | runs top to bottom; results identical to the CLI |

## Unit tests (`tests/unit/`)

* `engines.test.mjs` — question normalisation for v3, WOW Sir and canonical formats; validation; scoring of every question type including partial credit; misconception classification (demonstrated, knowledge gap, isolated error, ignoring unmarked answers, teacher review override, discriminating distractors, learner baseline); intervention evaluation (evidence needed before and after; reported as an association with a confidence interval); risk features and logistic inference; analytics; importer duplicate detection; CSV formula-injection protection.
* `interpreter.test.mjs` — the Cambridge pseudocode interpreter on the 12-program reference suite that v3's interpreter failed (multi-variable DECLARE, functions, WHILE/REPEAT, CASE, procedures, nested loops, bubble sort, 2-D arrays, REAL division) and the test runner used for coding questions.
* `integration.test.mjs` — the brief's short-form event, canonical validation, rejection of personal data and unknown event types, WOW Sir and DBWOW adapters on fixtures in their real shapes, duplicate detection, identity linking only for verified links, default chapter lookup.
* `ingest.test.mjs` — signed API: bad signature, stale timestamp, unauthorised platform, platform spoofing, duplicates, raw storage.
* `migrate.test.mjs` — v3→v4 transforms: untrusted roles, predictable logins, shadow ban → suspension, class_code added, coding auto-correct and wrong key neutralised, answer keys split out of assessments.

## Browser end-to-end (`tests/e2e/run.mjs`)

Every route of every portal is opened and must render without an error page, a JavaScript error or a console error. Workflows checked:

* Student: home, practice with feedback, all pages; **progress page contains no risk or prediction wording**; takes and submits the open assessment (stored in the outbox and database).
* Teacher: every page; generates all seven report types; scores the class with the in-browser model (predictions saved); creates and validates a question; in the same browser, sees the student's submission marked, with assessment responses carrying `class_code`.
* Administrator: every page; approves the pending teacher with a reason and the audit entry is written.
* Access in the UI: a student opening `/teacher/` and a teacher opening `/admin/` are redirected.
* Phone width (390 px): no horizontal scrolling on the teacher dashboard, students, early-warning and student home pages (found and fixed a 135 px overflow of the top bar).

Screenshots: `tests/e2e/out/`.

## Security-rules tests: not executed here

`tests/rules/rules.test.mjs` has 14 scenarios (role self-assignment, joining closed classes, role/class changes, admin-only provisioning, student access to predictions/keys/other students, class isolation for reads and queries, student write constraints, submission constraints, release of results, append-only audit, suspended teachers, interventions/outcomes immutability, admin-only models/integrations/events, teacher consent/suspension limits). The Firestore emulator could not be downloaded in the build environment (its download host is blocked there), so **the rules have not been executed against these tests**. Run `npm run test:rules` on a machine with Java before deploying the rules. The browser tests use the demonstration backend, which does not apply the rules.

## Other verification

* Every dashboard figure is computed from loaded records; pages state their source ("Computed from N responses by M students in …") and flag synthetic records.
* Every named import between modules resolves (static check), every module parses.
* The demonstration dataset was produced by marking every synthetic answer with the application's own engine; 16.7 k WOW Sir and DBWOW events passed through the real adapters with no rejections.
* Feature parity JS ↔ Python: exact on 12 real synthetic learners; logistic probability browser ↔ scikit-learn equal to 1e-9.

## Not tested

* The production Firebase backend end to end (no credentials in the build environment): sign-up, Google sign-in, password reset, offline replay against Firestore, Storage uploads.
* Cloud Functions deployment (Blaze plan).
* Real-device testing on tablets and older phones; screen-reader testing beyond semantic markup and keyboard focus handling.
* Load: classes of a few hundred learners load in under a second in the demo; very large schools have not been tested.
