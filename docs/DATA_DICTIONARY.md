# Data dictionary

## 1. Question import (CSV template: `public/templates/questions_template.csv`)

| Column | Required | Meaning |
|---|---|---|
| `id` | yes | Unique ID: letters, digits, `_ - .` (2–80). Existing IDs are offered as "replace" in the import preview, never overwritten silently. |
| `type` | yes | `mcq`, `multi`, `truefalse`, `short`, `gap`, `matching`, `ordering`, `trace_table`, `code_output`, `pseudocode`, `debugging`, `structured`, `coding`. WOW Sir names (`fillinblank`, `shortanswer`, `multiselect`) are accepted. |
| `chapter_id` | recommended | `T01`–`T14` (warning if missing; error if unknown). |
| `subchapter`, `topic`, `learning_objective` | no | Hierarchy below chapter. |
| `grade` | no | 9, 10 or 11. |
| `difficulty` | no | 1 Foundation, 2 Core (default), 3 Extended; or easy/medium/hard. |
| `marks` | no | Default 1 (coding/structured 4, trace table 3, matching/ordering 2). |
| `text` | yes | Question text. For `gap`, write each gap as `___`. |
| `code` | no | Pseudocode shown with the question. |
| `optionA`–`optionE` | for option types | Options in order. |
| `answer` | yes (except structured/coding) | `mcq`/option types: letter or index; `multi`: `A|C`; `truefalse`: `true`/`false`; `short`/typed: accepted answers separated by `|`; `gap`: gaps separated by `;`, alternatives by `|`; `matching`/`ordering`: indexes separated by `|`. |
| `explanation`, `hint` | no | Shown after answering / in practice. |
| `misconception_tag` | no | Main taxonomy ID the question probes (e.g. `MC-LOOP-01`). |
| `option_misconceptions` | no | Diagnostic distractors: `index:ID;index:ID` (0-based). A distractor is diagnostic only if at least one other wrong option is *not* linked to the same misconception. |
| `image_url`, `image_alt` | no | Image and its text description (required for accessibility when an image is used). |
| `group_id`, `stimulus` | no | Questions with the same `group_id` share the `stimulus` (passage or diagram context). |
| `items`, `left`, `right`, `columns` | type-specific | `|`-separated lists for ordering, matching and trace tables. |
| `active` | no | `true`/`false`. |

JSON import accepts the same fields with arrays/objects (`public/templates/questions_template.json`).

## 2. Research export (Teacher → Research export) and ML input

All identifiers are pseudonymous research IDs (`L-XXXXXXXXXX`). Names, emails, account IDs and typed answers are not exported.

**learners.csv** — `uid` (= research ID), `pseudo_id`, `school_id`, `class_code`, `grade`, `is_synthetic`. Optional `cohort` (term label) added by the researcher.

**responses.csv**

| Column | Type | Meaning |
|---|---|---|
| `id` | string | response record ID |
| `student_uid`, `pseudo_id` | string | research ID |
| `class_code`, `school_id` | string | |
| `session_id`, `submission_id`, `assessment_id` | string | context (submission IDs use the research ID) |
| `mode` | enum | practice, challenge, intervention, assessment |
| `question_id`, `question_type`, `chapter_id`, `difficulty` | | item metadata |
| `misconception_tag` | string | main misconception the item probes |
| `misconception_hits` | `;`-list | misconceptions indicated by the chosen distractor / typed answer |
| `chosen` | int | option index chosen (option types) |
| `correct` | true/false/empty | empty = awaiting teacher marking |
| `score`, `max`, `needs_manual` | | marks |
| `time_ms` | int | time on the question (ms) |
| `first_answer_ms` | int | time before the first answer |
| `revisions` | int | answer changes |
| `hint_used` | bool | hint opened (practice) |
| `visibility_interruptions` | int | times the page was hidden — **context only, never a predictor** |
| `recorded_at` | ISO-8601 | |
| `is_synthetic` | bool | |

**sessions.csv** — `id`, `student_uid`, `class_code`, `mode`, `chapter_id`, `question_count`, `status`, `started_at`, `ended_at`, `is_synthetic`.
**interventions.csv** — `id`, `student_uid`, `class_code`, `target_type`, `target_id`, `action_type`, `status`, `started_at`, `review_date`, `latest_outcome`.
**predictions.csv** — `student_uid`, `model_version`, `prediction_status`, `risk_category`, `risk_probability`, `predicted_at`.

## 3. Synthetic data (`ml/data/synthetic/`)

Same columns as above plus `cohort` (`H1` training term, `H2` hold-out term, `C` current term). Extra files: `ground_truth.csv` (`theta` simulated ability, `engagement`, `held_initial` / `held_final` misconceptions — for evaluating the misconception engine, **never a model feature**), `learning_events.csv.gz` (WOW Sir and DBWOW events produced by the real adapters; `linkage` = `linked` only for verified identities), `identity_map.csv`, `interventions.csv` (`resolved_in_simulation` is the simulation's truth).

## 4. Risk features (feature version fv-1.1)

Identical in `public/js/engine/risk.js` and `ml/cslifeline_ml/features.py` (parity-tested). Only responses recorded strictly before the cut-off are used.

| Feature | Definition |
|---|---|
| `acc_all` | share of marked responses that are correct |
| `acc_recent` | accuracy over the last 20 marked responses |
| `acc_trend` | least-squares slope of weekly accuracy over the last 6 weeks with data (0 if fewer than 3 weeks) |
| `acc_assessment` | accuracy on assessment responses (falls back to `acc_all`) |
| `chapter_min_acc` | lowest chapter accuracy among chapters with ≥ 3 marked responses |
| `chapters_below_50` | fraction of those chapters below 50 % |
| `diag_error_rate` | share of wrong answers that chose a diagnostic distractor (`misconception_hits` non-empty) |
| `repeat_error_rate` | share of distinct questions answered wrongly two or more times |
| `completion_rate` | sessions that ended before the cut-off ÷ sessions started before it |
| `active_days_28` | distinct days with a response in the 28 days before the cut-off |
| `days_since_active` | days from the last response to the cut-off (capped at 60) |
| `rel_time_median` | median of response time ÷ median time for that question (1 = typical) |
| `hint_rate` | share of practice responses with a hint opened |
| `n_responses` | marked responses before the cut-off; predictions need ≥ 10 |
| `wow_sir_acc`, `wow_sir_n`, `wow_sir_linked`, `dbwow_acc`, `dbwow_n`, `dbwow_linked` | cross-platform features from **verified** links only (experiments; not in the production feature set) |

**Label:** 1 if assessment accuracy in the 28 days after the cut-off is below 50 %, 0 otherwise; missing (row excluded) if fewer than 3 marked assessment answers in that window.

## 5. Misconception findings (computed, not stored)

`misconception_id`, `name`, `chapter_id`, `status` (demonstrated · possible · knowledge_gap · isolated_error · insufficient_evidence; teacher review may add not_misconception), `evidence_strength` (0–1), `strength_label`, `reason`, `trend` (improving · persisting · unclear), `counts{opportunities, errors, correct, diagnostic_hits, distinct_questions_wrong, sessions_with_errors}`, `baseline_error_rate`, `error_rate`, `evidence[]` (response IDs — every finding is traceable to raw responses), `engine_version`. Teacher reviews are stored separately in `misconception_reviews`.
