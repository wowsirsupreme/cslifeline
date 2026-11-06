# Changelog

## 4.0.1 — 6 November 2026
* Restored the v3 visual identity as the default theme: midnight background, lifeline teal (#00D4AA), amber / crimson / emerald signals, Sora headings, Inter text, JetBrains Mono code, teal background glow, gradient primary buttons and accent-topped stat tiles. The theme button switches to a light version with the same teal identity. v3's faintest grey was lightened for readable contrast.
* Fonts are hosted with the site (no Google Fonts requests, so no learner IP addresses go to a third party); the Content-Security-Policy stays at 'self' for fonts.
* Hosting moved to Vercel (`vercel.json` with the same headers and routes); `netlify.toml` kept as an alternative.

## 4.0.0 — 6 November 2026 (rebuild of v3 "FIXED_2")

### Security
* Roles can no longer be self-assigned; visiting `/teacher/` or signing in no longer grants a role; teachers register as "awaiting approval"; first administrator provisioned by script (audit S1–S3, S6).
* Predictable student passwords removed; roster accounts get random one-time access codes (S4).
* Assessment answer keys moved to a teacher-only collection; students submit unscored answers; results visible only after release (S5).
* Students can write only their own practice responses; one submission per assessment; no self-scoring (S7).
* Teachers isolated to their own classes; administrators manage everything (S8).
* Hidden "shadow ban" replaced with a visible suspension (S9).
* All text rendered safely; strict CSP; CSV formula-injection guard; SVG uploads refused (S12).
* Append-only audit log for administrative, consent, export, import, promotion and erasure actions.

### Data integrity
* One response schema (2.0) with `class_code`, `school_id`, `pseudo_id` on every record; reads and writes agree (audit 3.1).
* Assessment submissions now have rules and a teacher marking screen (3.2).
* Coding answers are marked by tests in the interpreter or by the teacher, never automatically correct (3.3).
* Corrected the P1_T1_004 answer key and re-tagged mis-filed questions; added chapter T14 Databases.
* Offline outbox with deterministic IDs: answers survive dropped connections and are never duplicated.
* Migration script for v3 data, with backups, dry run and audit entry.

### Features
* Student portal: practice by chapter and misconception, timed assessments with saved drafts, assigned practice, daily challenge, progress with chapter understanding and revision suggestions (no risk labels), pseudocode editor, tutorials (the v3 tutorials were never reachable), account and privacy page.
* 13 question types, image and grouped-context questions, 214 validated built-in questions with diagnostic distractor links.
* New Cambridge pseudocode interpreter (passes the 12-program suite the v3 interpreter failed).
* Misconception engine (mce-1.1) with a 68-entry taxonomy: five evidence statuses, evidence strength, discriminating distractors, learner-baseline specificity, teacher review stored separately.
* Teacher portal: dashboard from real records with stated provenance, students, student detail, class analytics with filters, misconceptions with review, early warning with explanations, interventions with before/after evidence and immutable outcomes, assessments (build, publish, mark, release, item analysis), question bank (typed editor with live preview, validation, duplicate check, archive, import wizard with rejected-row report, CSV/JSON export), classes and roster (join codes, roster accounts, consent), seven printable reports with CSV, pseudonymised research export.
* Administrator portal (the v3 `/admin/` route was a 404): users and roles, schools and classes, curriculum and taxonomy, settings, model registry (register, promote with reason, rollback, import predictions), integrations (authorisation, batch import through adapters, identity map), audit log, data and privacy (consent overview, retention, erasure).
* Integration layer: canonical event schema 1.0, WOW Sir and DBWOW adapters built from their real data structures, duplicate detection, raw storage, verified-only identity linking, signed ingest API (Cloud Function).
* Demonstration mode with a synthetic dataset; timestamps shift so the demonstration always looks current.

### Analytics and machine learning
* Behavioural "avoidance" label from tab switches removed; interruptions kept as context only (audit §5).
* New Python pipeline replacing the two v3 notebooks: future-outcome label, learner-grouped and temporal validation, six model families, threshold rules, calibration, subgroups, ablation and cross-platform experiments with bootstrap intervals, model registry, predictions with provenance (audit §6, M1–M7).
* Feature parity between the browser and Python, and between the in-browser logistic model and scikit-learn, enforced by tests.
* Synthetic data generator in Node that marks every answer with the application's own engine and routes WOW Sir and DBWOW activity through the real adapters.

### Removed
* v3 inline-script pages, duplicate functions, the always-on live-signal writes (about 450 writes per student-hour), the leakage-prone notebooks (kept under `legacy/`).
