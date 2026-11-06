# Database schema (Cloud Firestore, schema version 2.0)

Field names are `snake_case` everywhere. Timestamps are Firestore server timestamps or ISO-8601 strings; `core/util.js toMs()` reads both. Every record that describes a learner carries `class_code` (and usually `school_id` and `pseudo_id`), which is what the rules and the class queries use — this closes v3 finding 3.1. Synthetic records carry `is_synthetic: true`.

Access is summarised per collection; `firestore.rules` is authoritative.

## Identity and organisation

| Collection / id | Key fields | Who |
|---|---|---|
| `users/{uid}` | `role` (`student` · `teacher_pending` · `teacher` · `admin`), `status` (`active` · `pending` · `suspended` · `erased`), `display_name`, `email`, students: `class_code`, `school_id`, `grade`, `pseudo_id` (`L-` + 10 chars), `consent.research_use` (`granted` · `refused` · `withdrawn` · `not_recorded`); staff: `class_codes[]`, `school_id`; `created_at`, `last_seen`, `is_synthetic` | Self-create only as student (open class) or teacher_pending; own `display_name`; teachers: `status`/`consent` of their students; admins: everything |
| `schools/{id}` | `name`, `country`, `curriculum` | read: signed in · write: admin |
| `classes/{CODE}` | `name`, `school_id`, `grade`, `subject` (`CS-0478`), `teacher_uids[]`, `join_open` | get: signed in · list: admin or its teachers · teacher may change `join_open`, `name` |
| `settings/platform` | `risk_thresholds{moderate,high}`, `capture_interruptions`, `retention_days`, `research_export_requires_consent`, `allow_student_self_registration`, `release_feedback_default` | read: signed in · write: admin |
| `curriculum/{chapterId}` | overrides of `title`, `topics[]` | read: signed in · write: admin |

## Content

| Collection | Key fields |
|---|---|
| `questions/{id}` | `schema_version: 2`, `subject`, `grade`, `paper`, `chapter_id` (T01–T14), `subchapter`, `topic`, `learning_objective`, `difficulty` (1–3), `type` (see below), `text`, `code`, `image_url`, `image_alt`, `group_id`, `stimulus`, `options[]`, `answer`, `explanation`, `hint`, `misconception_tag`, `option_misconceptions{index: id}`, `answer_misconceptions{answer: id}`, `marks`, type-specific `items/left/right/columns/parts/tests/starter/solution`, `visibility` (`practice` or private), `active`, `status`, `source`, `created_by`, `teacher_modified` |
| `question_groups/{id}` | shared `stimulus`, `image_url` for grouped questions |

Question types: `mcq`, `multi`, `truefalse`, `short`, `gap`, `matching`, `ordering`, `trace_table`, `code_output`, `pseudocode`, `debugging`, `structured` (teacher-marked with keyword suggestions), `coding` (marked by tests in the interpreter, or by the teacher). The 214 built-in questions are in `public/data/question-bank.js`; a stored question with the same id overrides a built-in one.

## Assessment

| Collection | Key fields | Notes |
|---|---|---|
| `assessments/{id}` | `title`, `instructions`, `class_codes[]`, `status` (`draft` · `published` · `closed`), `opens_at`, `closes_at`, `time_limit_min`, `release_feedback` (`on_scoring` · `manual`), `shuffle_questions`, `questions[]` (**answer keys removed**), `question_ids[]`, `question_count`, `total_marks`, `created_by` | Students read published/closed ones for their class |
| `assessment_keys/{assessmentId}` | `answers{qid: {answer, explanation, option_misconceptions, tests, parts…, marks}}`, `class_codes`, `created_by` | Teachers of those classes and admins only (v3 finding S5) |
| `sessions/{id}` | `student_uid`, `class_code`, `pseudo_id`, `mode`, `chapter_id`, `assessment_id`, `question_count`, `answered`, `correct_count`, `status`, `started_at`, `ended_at`, `last_activity_at` | |
| `submissions/{assessmentId}__{uid}` | `assessment_id`, `student_uid`, `class_code`, `answers{qid: value}`, `behaviour{qid: {...}}`, `started_at`, `submitted_at`, `forced`, `status` (`submitted` · `needs_marking` · `scored`), `scored_at`, `scored_by` | One per student per assessment (id enforced by rule); a student cannot write a score |
| `submission_results/{submissionId}` | `score`, `max_score`, `results{qid: {score, max, correct, needs_manual, explanation, correct_answer}}`, `manual_marks{qid: marks}`, `pending_marking`, `released`, `released_at` | Student can read only when `released == true` |

## Responses (the core research record)

`responses/{id}` with deterministic id `<session or submission id>__<question id>__<attempt>` (retries never duplicate):

| Field | Meaning |
|---|---|
| `schema_version`, `source_platform` | `2.0`, `CS_LIFELINE` |
| `student_uid`, `pseudo_id`, `class_code`, `school_id` | who and where |
| `session_id`, `submission_id`, `assessment_id`, `mode` (`practice` · `challenge` · `intervention` · `assessment`), `attempt` | context |
| `question_id`, `question_type`, `chapter_id`, `subchapter`, `topic`, `paper`, `difficulty`, `misconception_tag` | item metadata at answer time |
| `answer`, `chosen` | raw answer; option index when the type has options |
| `correct` (true/false/null), `score`, `max`, `needs_manual`, `misconception_hits[]`, `marking_detail` | marking result (`null` = awaiting a teacher) |
| `time_ms`, `first_answer_ms`, `revisions`, `hint_used`, `visibility_interruptions`, `away_ms`, `offline_during` | behaviour (interruptions are context only) |
| `recorded_at`, `client_ts`, `scored_by` (`client` · `teacher` · `cloud-function`), `is_synthetic` | provenance |

Students may create only their own practice/challenge/intervention responses for their own class, scored by the client; assessment responses are written by the marking step (teacher browser or Cloud Function).

## Analytics, intervention and model records

| Collection | Key fields | Who |
|---|---|---|
| `misconception_reviews/{uid}__{misconceptionId}` | `decision` (teacher's status), `note`, `automated_status`, `automated_strength`, `reviewer_uid`, `reviewed_at` | Staff of the class. Teacher-validated labels are stored separately from automated findings, which are recomputed and never overwritten. |
| `predictions/{uid}__{model}__{date}` | `student_uid`, `pseudo_id`, `class_code`, `risk_probability`, `risk_category`, `features{}`, `feature_version`, `contributions[]`, `explanation_method`, `model_version`, `prediction_status` (`validated` · `demonstration`), `is_synthetic_model`, `predicted_at`, `thresholds`, `source` | Staff of the class; never students |
| `interventions/{id}` | `student_uid`, `class_code`, `target{type: misconception·chapter, id, label}`, `reason`, `evidence_snapshot`, `action_type`, `activity_details`, `practice_question_ids[]`, `started_at`, `review_date`, `status`, `notes`, `observations[]`, `latest_outcome`, `teacher_uid` | Staff of the class |
| `intervention_outcomes/{id}` | `intervention_id`, `student_uid`, `class_code`, `target`, `evaluation{pre, post, difference, outcome, summary, evidence_response_ids}`, `note`, `recorded_by`, `recorded_at` | Staff create; **immutable** |
| `practice_assignments/{id}` | `student_uid`, `class_code`, `intervention_id`, `title`, `question_ids[]`, `due_at`, `status`, `completed_at` | Staff; student may only mark completed |
| `notifications/{id}` | `to_uid`, `type`, `text`, `link`, `read`, `from_uid` | recipient reads/marks read |
| `model_registry/{version}` | `model_name`, `model_type`, `status` (`candidate` · `production` · `archived`), `validated_on_real_data`, `trained_on`, `feature_version`, `features[]`, `label_definition`, `thresholds`, `training{…data_hash, seed}`, `metrics{test, cv, subgroups, errors}`, `artefact` (logistic only), `warning`, `promoted_at`, `promotion_reason` | read: staff · write: admin |

## Integration

| Collection | Key fields | Who |
|---|---|---|
| `platform_integrations/{PLATFORM}` | `name`, `adapter`, `status`, `connection_status`, `authorisation{status, basis, approved_at, by}`, `records_received/accepted/rejected`, `duplicates`, `last_errors[]`, `last_success_at`, `last_import_at`, `schema_version` | admin |
| `raw_source_records/{batchId}` | original payload (truncated at 900 kB), `source_platform`, `received_at`, `adapter`, `via` | admin |
| `learning_events/{event_id}` | canonical event (see API_DOCUMENTATION.md) + `provenance{batch_id}`, `received_at` | admin |
| `learner_identity_map/{PLATFORM}__{sourceId}` | `source_platform`, `source_learner_id`, `student_uid`, `pseudo_id`, `class_code`, `status` (`verified` · `unverified` · `rejected`), `evidence`, `verified_by`, `verified_at` | admin; teachers for their classes |

## Governance

| Collection | Key fields | Who |
|---|---|---|
| `audit_logs/{id}` | `actor_uid`, `actor_role`, `action`, `target`, `details`, `at` | create own entries; admin reads; nobody updates or deletes |
| `legacy_predictions/{id}` | v3 notebook predictions moved by the migration | admin (via default deny: Console only) |

## Indexes

`firestore.indexes.json` defines the composite indexes the app's queries need: `users(role, class_code)`, `questions(visibility, active)`, `assessments(class_codes array-contains, status)`, `responses(class_code, student_uid)`. All other queries use single-field indexes. Dashboards sort in memory after filtering by class, so no ordered composite index is required.

## Migration from v3

`scripts/migrate-v3.mjs` (dry run by default, backup before writing, idempotent) maps v3 records: camelCase user fields to snake_case; self-assigned v3 teacher/admin roles to `teacher_pending` unless listed as trusted; responses gain `class_code`, `pseudo_id` and raw behaviour fields; v3 coding responses (always recorded correct) and responses to the wrongly keyed P1_T1_004 get `correct = null` with a legacy flag; v3 "shadow bans" become visible suspensions; v3 predictions move to `legacy_predictions`; `published_assessments` split into `assessments` + `assessment_keys`. Transform rules are unit-tested in `tests/unit/migrate.test.mjs`.
