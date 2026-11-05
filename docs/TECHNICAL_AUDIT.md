# CS Lifeline — Technical Audit (v3 → v4)

Audit date: 5 November 2026
Audited inputs:

1. `CSLifeline_v3_FIXED_2.zip` (18 files, 9,269 lines).
2. DBWOW, GitHub `wowsirsupreme/dbwow` (Next.js 15 + SQLite/WebAssembly, 102 files).
3. WOW Sir, GitHub `wowsirsupreme/wowsir` (Next.js 16 + Firebase RTDB/Firestore, 143 files).
4. WOW Sir Pseudocode Interpreter, GitHub `wowsirsupreme/wowsir_igcse-0478-9618-pseudocode-interpreter` (single HTML file).

Method: every file was read; key behaviour was executed where possible (interpreters were run against a 12-program reference suite; question answer keys were listed and checked by hand). Findings are graded **Critical** (security breach or wrong data), **High** (feature does not work), **Medium** (works but misleading or fragile), **Low** (quality).

---

## 1. CS Lifeline v3 — inventory

| Area | File(s) | State |
|---|---|---|
| Landing + sign-in | `index.html` (347 lines) | Works visually; underlying auth logic insecure (see §2) |
| Student portal | `student/index.html` (1,827 lines, inline scripts) | Practice works; progress partially works; several features broken (see §3) |
| Teacher portal | `teacher/index.html` (1,877 lines, inline scripts) | Loads; most class-level views show **no data** because of a schema mismatch (§3.1) |
| Admin portal | `/admin/` route in `netlify.toml` and `_redirects` | **Route points to a page that does not exist** (no `admin/` folder). `routeByRole('admin')` sends admins to a 404 |
| Auth | `js/auth.js` | Insecure role assignment, predictable passwords (§2) |
| Data access | `js/sync.js` | Writes and reads disagree on field names (§3.1) |
| Behaviour capture | `js/behavioral.js` | Collects signals; derived "avoidance" label conflates tab switching with wrong answers (§5) |
| Interpreter | `js/interpreter.js` | Fails common exam programs (§3.6) |
| Question bank | `data/questions.js` (48 questions: 39 MCQ, 4 trace, 5 coding) | One wrong answer key; several mis-tags (§4) |
| Tutorials | `data/tutorials.js` (1,137 lines) | **Not imported by any page** — content exists but is unreachable |
| Firestore rules | `firestore.rules` | Privilege escalation possible (§2) |
| ML | `colab/*.ipynb` (two notebooks, overlapping) | Target leakage; scaler leakage; no temporal split (§6) |
| Deployment | `netlify.toml`, `_redirects`, `_headers` | Works for `/`, `/student/`, `/teacher/`; `/admin/` 404 |

There is no build step, no automated test, no `firestore.indexes.json`, no `firebase.json`, no README and no schema documentation.

---

## 2. Security findings

| # | Severity | Finding | Evidence |
|---|---|---|---|
| S1 | **Critical** | **Any signed-in user can make themselves a teacher or admin.** The `users` create rule only checks `uid() == userId`; it does not restrict the `role` field. | `firestore.rules` line 21: `allow create: if isAuth() && uid() == userId;` |
| S2 | **Critical** | **Visiting `/teacher/` or `/admin/` grants the role.** `requireRole(expected)` creates a missing user document *with the expected role*. Any new Google account that opens `/teacher/` becomes a teacher. | `js/auth.js` `requireRole` step 3 |
| S3 | **Critical** | **Teacher sign-in auto-provisions the teacher role** for any account that has no user document. Teacher self-sign-up also writes `role:"teacher"` with no approval. | `teacherSignIn`, `teacherSignUp`, `teacherSignInGoogle` |
| S4 | **Critical** | **Predictable student passwords.** Quick sign-in derives email and password from class code + name: `btoa(raw).slice(0,20)+"Aa1!"`. Anyone who knows a classmate's name and class code can sign in as them and read their data. | `studentSignInAnon` |
| S5 | **Critical** | **Assessment answer keys are sent to students.** Published assessments embed `correct` for every question and are readable by students; scoring happens in the student's browser, so scores can be forged. | `confirmPublish` (`correct:q.correct`), `submitLiveAssessment` |
| S6 | High | `requireRole` "trusts the auth session" when Firestore fails and lets the page load with the expected role. UI enforcement only, but it shows teacher UI to non-teachers. | `requireRole` catch block |
| S7 | High | `sessions` create rule allows any authenticated user to create a session for any `student_uid`; `responses` create allows writing a response for **another** student. | rules lines 29, 37 |
| S8 | High | Teachers can read **all** users, responses, sessions and live signals across all classes and schools; there is no class or school isolation. | `isTeacher()` rules |
| S9 | Medium | "Shadow ban": a teacher-set flag silently turns a student's submissions into no-ops while showing a normal UI. This is deceptive towards minors and silently destroys research data. | `activateShadowBan`, `fakeDelay` |
| S10 | Medium | Firebase web config is committed in source. This is normal for Firebase web apps (the key is not a secret), but it means security depends **entirely** on rules, which are currently weak (S1–S8). | `js/firebase-config.js` |
| S11 | Medium | Leaderboard publishes students' display names class-wide with no opt-out. | `challenge_scores` read rule `if isAuth()` |
| S12 | Low | XSS risk: teacher views interpolate student-controlled `displayName` and imported question text into `innerHTML` without escaping. | `loadStudents`, `renderBank` |

---

## 3. Functional findings

### 3.1 The teacher dashboard cannot see responses (Critical)

`saveResponse()` writes `session_id, student_uid, question_id, misconception_tag, chapter_id, paper, correct, recorded_at, ...signals` — **no `class_code`**. But `listenClassResponses()` and `listenRecentActivity()` query `where("class_code","==",classCode)`. Those listeners therefore always return zero documents. `getClassResponses()` works around this by fetching students first and then querying by `student_uid in [...]` in chunks of 30, so the Overview tab shows data but any view using the listeners does not. The same mismatch exists for users: students are stored with `classCode` (camelCase) while sessions, live signals and predictions use `class_code` (snake_case).

### 3.2 Live assessment submissions are rejected (Critical)

Students submit to `assessment_submissions`, but `firestore.rules` has **no rule** for that collection, so Firestore denies the write (default deny). The student sees an error toast; the teacher never receives submissions. The teacher portal also has no screen that reads `assessment_submissions`, so coding answers "marked by your teacher" can never be marked.

### 3.3 Coding answers are recorded as correct automatically (Critical, data integrity)

In practice mode `submitAnswer()` does `else { await window.runCode(); correct = true; }` for coding questions. Every coding attempt is saved as a correct response regardless of what the student wrote, inflating accuracy and corrupting the research dataset.

### 3.4 Risk labels shown without a model (High, research integrity)

When no prediction exists, the Students table silently shows a risk category computed from raw accuracy (`acc<50?'high':acc<70?'borderline':'low'`) in the same "risk pill" used for model predictions. The Overview "At-risk" tile uses the same heuristic. A teacher cannot tell a model output from a threshold rule.

### 3.5 Students see their own risk classification (High, ethics)

`renderPrediction()` shows the student "HIGH / BORDERLINE / LOW" risk pills and the model narrative. The brief requires that students are not labelled by the algorithm.

### 3.6 Pseudocode interpreter fails common programs (High)

A 12-program reference suite (sum loop, function, built-ins, WHILE … DO, REPEAT … UNTIL, CASE, procedure, nested loops, bubble sort, IF/ELSE with AND, 2-D array, REAL division) was run against both available interpreters.

| Program | CS Lifeline v3 `js/interpreter.js` | WOW Sir interpreter (extracted class) |
|---|---|---|
| `DECLARE T, I : INTEGER` (multi-variable declare) | **Fails** | Fails later |
| Function defined then called | **Returns `null`** | "Unknown function" |
| `WHILE C <= 3 DO` | **No output** | Fails |
| `REPEAT … UNTIL N >= 6` | **"Infinite loop"** | "Infinite loop" |
| Bubble sort | Fails (declare) | Fails |
| Built-ins, CASE, procedure, 2-D array, REAL | Pass | Mostly fail |

Several of v3's own editor templates (Bubble Sort, Linear Search, Average) use multi-variable `DECLARE` and therefore fail when a student loads them. Neither interpreter is fit to auto-mark coding questions. Decision: write a new tokenizer → parser → AST interpreter with its own test suite (see `CHANGELOG.md`).

### 3.7 Other functional defects

| # | Severity | Finding |
|---|---|---|
| F1 | High | `/admin/` route has no page (404). |
| F2 | High | Assessments are only MCQ/trace/coding; no multiple-select, true/false, short answer, matching, ordering, fill-in-the-gap, trace table or image questions. |
| F3 | High | No intervention workflow exists anywhere. |
| F4 | High | No misconception taxonomy: 18 flat tags, no descriptions, causes, strategies or evidence rules; one wrong answer counts as one "misconception". |
| F5 | High | No offline protection: responses are written with `addDoc(...).catch(console.error)`; a dropped connection loses the attempt without the student knowing. Random `addDoc` IDs also mean a retry would duplicate. |
| F6 | Medium | Question import validates only that `id,text,paper,chapter_id` exist; no answer-key validation, no option count check, no duplicate-text detection (only duplicate IDs). |
| F7 | Medium | Duplicate implementations: `openSV`, `svPaper`, `closeSV`, the radar/bars builders and `setText` are each defined twice in `teacher/index.html`; the Firebase SDK is re-imported dynamically in four places; `endSession_` rebuilds the question card HTML that `loadQuestions` also rebuilds. |
| F8 | Medium | Leaderboard query uses `where` × 3 + `orderBy('score')` which needs a composite index that is not defined; it fails silently (`console.warn`). |
| F9 | Medium | "Standard assessment" mode only draws from chapters where the student scores ≥ 50 %, so it systematically avoids the student's weak areas and over-estimates attainment. |
| F10 | Medium | Live signals are pushed every 8 s for every active student — about 450 writes per student-hour — mostly unchanged values. |
| F11 | Low | All logic is inline in two 1,800-line HTML files; global `window.*` functions; no modules, no tests. |
| F12 | Low | `tutorials.js` (1,137 lines of Paper 2 tutorials) is never loaded by any page. |

---

## 4. Question bank content audit (48 questions)

| ID | Problem | Fix applied in v4 |
|---|---|---|
| P1_T1_004 | **Wrong answer key.** 11101110 (238) + 00110001 (49) = 287, which overflows 8 bits; the 8-bit result is 00011111. The key marks 11111111. The explanation text even notices the contradiction ("wait, 238+49=287"). | Key changed to option 0 (`00011111`); explanation rewritten to teach overflow. |
| P1_T2_001 | Spyware question filed under T02 Data Transmission. | Moved to T05 (cyber security sits in 0478 topic 5). |
| P2_T7_003 | Decomposition tagged `SEQUENTIAL_EXECUTION_ERROR`. | Re-tagged to the taxonomy entry for problem decomposition. |
| P2_T12_001, P2_T12_002 | Search questions tagged `SEQUENTIAL_EXECUTION_ERROR`. | Re-tagged to linear/binary search misconceptions. |
| All MCQs | Distractors carry no diagnostic meaning, so wrong answers cannot be linked to a specific misconception. | Diagnostic distractor mapping added (`option_misconceptions`) for questions whose distractors correspond to a known error. |
| Chapters | T01–T13 split Programming across several chapters and omit 0478 topic 9 Databases. | IDs T01–T13 kept so existing records stay valid; T14 Databases added; each chapter now records its 0478 syllabus reference. |

---

## 5. Behavioural analytics findings

* `signal_avoidance = tabSwitches > 0 && !finalCorrect` treats any tab switch on a wrong answer as "avoidance". The brief forbids interpreting a tab switch as avoidance or cheating. v4 records tab switches only as context (`visibility_interruptions`) and never derives a label from them.
* `signal_uncertainty = revisions > 1 || hesitation > 15 s` penalises slow readers and screen-reader users. v4 keeps the raw measures (time to first answer, revisions) and normalises them per question (relative to the question's median), which is the meaningful quantity.
* The ML risk composite gives tab switches 20 % weight. Removed.

---

## 6. Machine-learning findings (Critical for the thesis)

| # | Finding | Why it matters |
|---|---|---|
| M1 | **Target leakage.** `at_risk` is computed from `accuracy < 0.5`, `misc_count > 3` and `avg_tab_switches > 2 && accuracy < 0.65` — and the same `accuracy`, misconception and tab-switch values are model features. The model is asked to rediscover its own label definition, so any reported F1/AUC is meaningless. | The label must be a **future** outcome (performance in a later window) and features must come only from data before the prediction date. |
| M2 | **Pre-split scaling.** `StandardScaler().fit_transform(X_full)` runs on all rows before cross-validation. | Test-fold statistics leak into training. Scaling must be inside a `Pipeline`. |
| M3 | **Row-level stratified K-fold** with one row per student but no temporal ordering. | Must use student-grouped and time-aware validation. |
| M4 | **"BW-RF" duplicates behavioural columns to up-weight them.** | No methodological basis; inflates tab-switch influence. Dropped. |
| M5 | Two notebooks implement overlapping pipelines with different feature names (`accuracy` vs `f01_performance_trend_slope`). | One package, one notebook. |
| M6 | Notebook writes predictions directly to Firestore with no model version, no synthetic/real flag and no approval step. | v4 adds a model registry, prediction provenance and an admin approval gate. |
| M7 | Synthetic data (Gaussian copula) is generated in the same notebook that writes to production Firestore. | Synthetic data now lives in a separate, clearly prefixed namespace. |

---

## 7. DBWOW — what it is and what CS Lifeline can use

**What it actually does.** A Microsoft-Access-style database learning app. SQLite compiled to WebAssembly runs entirely in the browser; Firebase (project `dbwow-eb46c`) stores each user's databases and **Learning Centre progress**.

**Educational data it holds** (inspected in `src/learning/achievements.ts`, `src/cloud/firebase.ts`):

* `users/{uid}.progress` — a JSON string `LearnState` with `quizzes` (`"topicId:index" → chosen option`), `steps` (`"practicalId:index" → verified`), `achievements` (`id → ISO date`), `events` (`action → count`).
* 20 Learning Centre topics with quizzes (`src/learning/content.ts`), each with a known answer key; 4 practicals with verified steps; sample exercises.
* No per-answer timestamps (only achievement unlock dates).
* Firestore rules: owner-only access to `users/{uid}`. Nothing is readable by another service without the learner's own export or the Admin SDK.

**Educationally relevant for CS Lifeline:** quiz answers on database concepts (primary/foreign keys, relationships, data types, validation, SQL) map onto 0478 topic 9 Databases and carry distractor information. Practical step completion is activity evidence (not attainment evidence).
**Not relevant / must stay out:** the user's database files and their contents (these can contain arbitrary personal data typed by students), email addresses, share links.

**Engineering patterns adopted:**

1. Swappable backend interface with an in-memory test backend (`src/cloud/backend.ts` + `testBackend.ts`) — adopted as `js/core/backend-*.js`; it also powers a clearly labelled local demo mode.
2. "Nothing is silently discarded" import wizard (preview → validate → per-row reasons → downloadable rejects) — adopted for question import and integration batch import.
3. Evidence-based achievements (awarded from real state, never from opening a screen) — mirrors the evidence rule for misconceptions.
4. Separate `ARCHITECTURE.md`, `DEVELOPMENT_LOG.md`, `FEATURE_STATUS.md`, `TESTING.md` documentation discipline.

## 8. WOW Sir — what it is and what CS Lifeline can use

**What it actually does.** A live quiz platform (teacher-hosted live quiz, Hot Seat, Battle, Practice, Study Corner) built on Next.js, Firebase RTDB for live sessions and Firestore for the question bank and results.

**Educational data it holds** (inspected in `src/types/*.ts`, `src/lib/firebase/sessions.ts`, `firestore.rules`):

* Question bank: 6,230 questions in `public/seed/questions.json`, each with `topicKey` (e.g. `gr9-data-binary`, `gr10-algorithms`), `type` (mcq, truefalse, shortanswer, fillinblank, matching, ordering), `answer`, `difficulty`, `grade`, `subject`.
* Live sessions (RTDB `sessions/{id}`): per player `answers[qIndex] = {choice, correct, timeMs}`, `tabSwitches`, `tabSwitchesByQ`.
* Results (Firestore `results/{id}`): aggregate per player (score, correct, total, accuracy, streak, tabSwitches) plus per-question correct counts.

**Critical integration fact — identity.** WOW Sir students are **unauthenticated guests**. A player is `p_<time>_<random>` stored in `sessionStorage` and is only stable within one session; the only human-readable link is a typed display name. There is therefore **no reliable cross-platform learner identity**. v4 keeps WOW Sir histories as separate, session-scoped learners unless a teacher explicitly verifies a link in the identity-map screen. Names are never used to auto-match.

**Educationally relevant:** per-question answers with time for IGCSE CS topic keys (`gr9-*`, `gr10-*`, `gr11-*`). **Not relevant:** music themes, avatars, battle matchmaking, practice leaderboard entries (name + score only, no question data), teacher profile data.

**Engineering patterns adopted:**

1. Answer stripping before broadcast (`stripAnswer`) — v4 applies the same idea to published assessments (answer keys in a teacher-only document).
2. CSV question template (`id,topicKey,type,text,optionA–D,answer,explanation,difficulty,points,chapter,imageUrl`) — the v4 importer accepts this format directly, so questions move between the two platforms.
3. Typed question model with optional extended metadata (grade, chapter, learningObjective, cognitiveLevel) — merged into the v4 question schema.
4. Toast / Modal / Card component set and per-question analytics (`questionStats`) in results.

## 9. WOW Sir Pseudocode Interpreter

Contains a useful **code-level misconception checker** (`=` used for assignment, `IF` without `THEN`, `ARRAY[10]` without bounds, missing `NEXT` variable). These ideas are adopted as a pseudocode lint that gives formative hints. Style-only rules (PascalCase, spacing) are excluded because they are conventions, not misconceptions. The interpreter itself fails the reference suite (§3.6) and is not reused.

---

## 10. Priorities (order of implementation)

1. Close S1–S5 (role escalation, predictable passwords, exposed answer keys) — new rules, trusted provisioning, teacher-only answer keys.
2. Fix the write/read schema mismatch (§3.1) with one schema (`DATABASE_SCHEMA.md`) and a migration script.
3. Make responses durable (idempotent IDs + offline outbox).
4. Build the admin portal so `/admin/` resolves and role provisioning happens in the app.
5. Replace tag counting with an evidence-based misconception engine and taxonomy.
6. Rebuild the ML pipeline without leakage; label every prediction with model version and demonstration/validated status.
7. Intervention workflow with before/after evidence.
8. Cross-platform integration layer with honest identity handling.
9. Tests, documentation, deployment.
