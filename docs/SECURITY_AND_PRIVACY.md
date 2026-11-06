# Security and privacy

CS Lifeline processes records about school-age learners. Security is enforced by the Firestore and Storage rules on the server; the interface only mirrors them.

## 1. Authentication and roles

* Sign-in with email/password or Google (Firebase Authentication). No predictable or derived passwords (v3 finding S4). Learners without email get a random 12-character access code shown once to the teacher and never stored.
* Roles live in `users/{uid}.role`. A new user can create their own profile only as `student` (joining a class whose `join_open` is true, with a well-formed research ID) or `teacher_pending`. Only an administrator can grant `teacher` or `admin`; the first administrator is provisioned with `scripts/provision-admin.mjs` using a service account (S1–S3).
* Suspended, pending or erased accounts lose access to data (rules check `status == 'active'`). v3's hidden "shadow ban", which silently discarded a learner's work, is replaced by a visible suspension (S9).
* A missing profile never grants a role; the page sends the user to finish registration (S2, S6).

## 2. Authorisation (what the rules enforce)

| Data | Student | Teacher | Administrator |
|---|---|---|---|
| Own profile | read; change name only | — | all |
| Students' profiles | — | own classes; may change status and consent only | all |
| Responses, sessions | own | own classes | all |
| Assessments | published, own class, **without answers** | own | all |
| Answer keys | never | own / own classes | all |
| Results | own, **only after release** | own classes | all |
| Predictions, interventions, outcomes, misconception reviews | never | own classes; outcomes immutable | all |
| Model registry | — | read | write |
| Integrations, raw records, learning events | — | — | only |
| Identity map | — | own classes | all |
| Audit log | append own | append own | read; nobody edits or deletes |

Teachers are isolated to the classes in their `class_codes` (S8); a student can only write practice responses for themselves, in their own class, marked as client-scored and not synthetic (S7); a submission's ID is fixed to `<assessment>__<student>`, it must target a published assessment of the student's class, and it may not contain a score (S5).

The rules suite (`tests/rules/rules.test.mjs`, 14 scenarios) covers each of these. **It must be run with the emulator before the rules are deployed** (it could not be run in the build environment; see TESTING_REPORT.md).

## 3. Web security

* Strict Content-Security-Policy (`netlify.toml`): scripts only from the site itself and the Firebase SDK host; no inline scripts; `frame-ancestors 'none'`; `object-src 'none'`; HSTS; restrictive Permissions-Policy.
* All text is inserted with `textContent` (the UI kit); the only `innerHTML` use is for the fixed icon set (fixes S12).
* CSV exports prefix cells starting with `= + - @` to prevent spreadsheet formula injection.
* Image uploads: staff only, under their own folder, ≤ 3 MB, PNG/JPEG/GIF/WebP only (SVG refused because it can carry script).
* The Firebase web API key in `config.js` identifies the project and is not a secret; protection comes from the rules.
* Integration API: per-platform HMAC-SHA256 signatures, 5-minute replay window, constant-time comparison, administrator-recorded authorisation required, raw payloads stored before processing.

## 4. Data protection by design

| Principle | Implementation |
|---|---|
| Purpose limitation | Data is used to support learning and, with approval and consent, for the MSc study. The privacy notice (`/privacy.html`) states this in plain language. |
| Data minimisation | No device identifiers, location, other-app activity or contacts. Page visibility is recorded as a count (can be switched off in Settings) and is never a predictor or evidence of cheating. |
| Pseudonymisation | Every learner has a research ID (`L-` + 10 characters). Research exports and model training use only research IDs; names, emails, account IDs and free-text answers are removed. Pseudonymised data is still personal data and is handled as such. |
| Consent / authorisation | Research consent is recorded per learner by the school (granted, refused, withdrawn, not recorded) with a reference to the paper record; exports include only `granted` learners by default. Cross-platform sharing requires a recorded data-sharing authorisation per platform. |
| No stigmatisation | Students never see risk categories or predictions; their pages talk about "ideas worth revisiting". Teachers are told on every early-warning page that indicators are prompts, not judgements. |
| No unverified linkage | Accounts on different platforms are linked only after a teacher or administrator verifies the link and records how; names are never matched automatically. |
| Accuracy and correction | Teachers can review and override every misconception classification (stored separately); administrators can correct identity links and user records, with reasons. |
| Retention | Default 730 days (Settings); Data and privacy lists learners past the period. |
| Erasure | "Erase learning data" deletes a learner's responses, sessions, submissions, predictions, interventions, reviews, assignments, notifications and identity links and anonymises the profile; the sign-in account is then deleted in Firebase Authentication. Audited. |
| Accountability | Every administrative and data-sharing action is written to the append-only audit log with the actor and, for role, consent and erasure changes, a reason. |
| Synthetic vs real | Synthetic records carry `is_synthetic` and are labelled on every screen; the ML loader refuses to mix them; models trained on synthetic data can only be promoted as demonstrations. |

## 5. Before using CS Lifeline with real learners (checklist)

1. Ethics approval for the study (IRB), and the school's written authorisation.
2. Parent/guardian information sheet and consent form where required; record consent in Classes and roster.
3. Data-sharing agreements before authorising WOW Sir or DBWOW data.
4. Run the rules tests against the emulator; deploy the rules and indexes; confirm a test student cannot read predictions or another student's records.
5. Decide the retention period and set it in Settings.
6. Restrict who holds service-account keys (migration and provisioning only); delete keys after use.
