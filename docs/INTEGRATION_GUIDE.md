# Integration guide: WOW Sir, DBWOW and future platforms

## 1. Principles

1. Each platform stays independent. Nothing in WOW Sir or DBWOW depends on CS Lifeline; if CS Lifeline is down, they keep working, and vice versa.
2. Only educationally relevant, authorised data enters. A platform's data is accepted only after an administrator records the legal or institutional basis (Administration → Integrations → Record authorisation). Permission to use a platform is not permission to share its data.
3. One canonical event schema (API_DOCUMENTATION.md), informed by xAPI ("actor–verb–object" statements) and 1EdTech Caliper (event types and profiles), without depending on either.
4. Raw first. Every batch is stored as received (`raw_source_records`) before validation; nothing is silently dropped; rejected records are reported with reasons.
5. No guessed identities. Learners on another platform become linked to a CS Lifeline research ID only when a teacher or administrator verifies the link and records how. Names are never used to match automatically. Unlinked records stay separate learning histories and are not used in learner-level models.

## 2. Source-platform report (from the actual code)

### WOW Sir (`github.com/wowsirsupreme/wowsir`, Next.js 16, Firebase Realtime Database + Firestore)

* **What it does:** teacher-hosted live quizzes joined with a session code, Hot Seat, 1-v-1 Battle, Practice, Study Corner; a 6,230-question bank across Grade 4–11 Computing, IGCSE CS (0478), IGCSE DT (0445) and A Level CS (9618).
* **Authentication:** teachers sign in with email; **students are unauthenticated guests**. A player id (`p_<time>_<random>`) lives only for one session; the only human-readable link is a typed display name.
* **Educational data:** Realtime Database `sessions/{id}/players/{pid}.answers[qIndex] = {choice, correct, timeMs}`, `tabSwitchesByQ`; `sessions_questions/{id}` with `topicKey`; Firestore `results/{id}` with per-player aggregates and per-question correct counts.
* **Relevant:** answers to questions whose `topicKey` maps to 0478 (`gr9-*`, `gr10-*`, `gr11-*` CS keys → T01–T14, table in `engine/curriculum.js`). **Not relevant / excluded:** Grade 4–8 Computing, DT and A Level topics (rejected with a reason), music themes, avatars, battles, leaderboard names, teacher profiles. Tab switches are carried only as context.
* **Identity consequence:** each session's players are separate learners (`<sessionId>:<playerId>`) until a teacher verifies who they are. Player names are shown to the teacher as hints for verification but are never written into events.
* **Adapter:** `fromWowSirSession` in `public/js/integration/events.js` (time precision `session`: the session start time).

### DBWOW (`github.com/wowsirsupreme/dbwow`, Next.js + SQLite/WebAssembly, Firebase project `dbwow-eb46c`)

* **What it does:** a Microsoft Access-style database environment with a Learning Centre: 20 topics with knowledge checks, guided practicals checked against the real database, achievements.
* **Authentication:** Firebase email accounts; Firestore rules allow only the owner to read `users/{uid}`.
* **Educational data:** `users/{uid}.progress` (JSON string): `quizzes{"topic:index": chosenOption}`, `steps{"practical:index": true}`, `achievements{id: date}`, `events{action: count}`. **No timestamps per answer.**
* **Relevant:** quiz answers on database concepts that are in 0478 topic 9 (keys, relationships, data types, validation, SQL) → T14; verified practical steps as activity evidence (not attainment). **Excluded:** Access-application skills outside the syllabus (forms, reports, import/export), the learners' database files (they can contain anything students typed), emails, share links.
* **Answer key:** extracted from `src/learning/content.ts` into `public/data/integrations/dbwow_quiz_key.json` (`scripts/extract-dbwow-key.mjs`).
* **Timing:** because DBWOW stores no answer times, a scheduled export every few weeks is needed; an answer's time is the first export in which it appears (`time_precision: snapshot`). The ML pipeline uses DBWOW events only if that snapshot is before the prediction cut-off.
* **Adapter:** `fromDbwowProgress`.
* **Access:** DBWOW's rules (correctly) do not let another service read learners' progress. Data can reach CS Lifeline only by (a) a learner-initiated export, or (b) a server-side job in DBWOW's project with the Admin SDK, set up under a data-sharing agreement.

### Engineering patterns reused (see TECHNICAL_AUDIT.md §7–8)

Swappable backend with an in-memory test backend (DBWOW), "nothing silently discarded" import wizard (DBWOW), evidence-based achievement logic → evidence-based misconceptions (DBWOW), answer stripping before broadcast (WOW Sir), CSV question format (WOW Sir; the importer reads it directly), toast/modal/card component set and grouped teacher navigation (WOW Sir).

## 3. How data gets in

| Route | Needs | Use |
|---|---|---|
| Batch import in the app (Administration → Integrations → Import a batch) | nothing extra | Upload a WOW Sir session export, a DBWOW progress export, or canonical events JSON. Preview shows accepted / rejected / duplicates before anything is stored. |
| Signed ingest API (`POST /ingest`) | Cloud Functions deployed (Blaze plan), platform secret | Automated push from a platform's server, or a scheduled job. |

Sample payloads: `public/templates/wowsir_session_example.json`, `dbwow_progress_example.json`, `learning_events_canonical_example.json`, `learning_event_example.json` (the short form).

## 4. Identity map

Administration → Integrations → Learner identity map lists every link. A link is `unverified` when created (for example from a WOW Sir player name), `verified` when a teacher or administrator confirms it and records the evidence ("student confirmed their WOW Sir name in class"), or `rejected`. Only verified links set `learner_id` on events (`linkLearners`). Corrections are made by rejecting the wrong link and verifying the right one; every change is audited. Teachers can see and verify links only for their own classes.

## 5. Onboarding a new platform

1. **Agree the purpose and basis** with the school (what data, why, retention). Record it: Integrations → Record authorisation.
2. **Choose a platform code** (`[A-Z][A-Z0-9_]+`, e.g. `CODELAB`) and add `{ name, adapter, version }` to `PLATFORMS` in `integration/events.js`.
3. **Write an adapter** `fromCodelabExport(exp) → { events, rejected, nameHints }` that maps the platform's native records to canonical events: give each a stable `event_id` (use `makeEventId`), a `source_learner_id`, a `chapter_id` from a mapping table (add it to `EXTERNAL_TOPIC_MAP` in `engine/curriculum.js`; unmapped topics must be rejected, not guessed), and the honest `time_precision`.
4. **Add tests** in `tests/unit/integration.test.mjs` with a fixture in the platform's real shape (see the WOW Sir and DBWOW fixtures).
5. **Enable it**: batch import works immediately; for the API, set a secret (`firebase functions:secrets:set CSL_SECRET_CODELAB`), add the adapter branch in `functions/lib/ingest.js`, run `npm run build:functions` and deploy.
6. **Verify identities** in the identity map before using the data in learner-level analysis.
7. **Evaluate** whether the data helps: the ML pipeline's cross-platform comparison reports PR-AUC with and without the new features with a learner-level bootstrap confidence interval. Keep the features only if the interval excludes zero.

## 6. What the synthetic experiment showed

On the synthetic cohorts (MODEL_EVALUATION.md), adding verified WOW Sir and DBWOW features did not demonstrably improve prediction (all confidence intervals include zero). This is a statement about the simulation; with real data the comparison must be repeated. The infrastructure makes that comparison routine.
