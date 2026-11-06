# API documentation

CS Lifeline has one server API: the **learning-data ingest endpoint** for other platforms. It is a Cloud Function (`functions/index.js` → `functions/lib/ingest.js`) and needs the Firebase Blaze plan. Without it, the same adapters run in the browser through **Administration → Integrations → Import a batch**.

## POST /ingest

`https://europe-west1-<project-id>.cloudfunctions.net/ingest`

### Authentication

Each platform has its own shared secret, stored as a Functions secret (`CSL_SECRET_WOW_SIR`, `CSL_SECRET_DBWOW`, or `CSL_SECRET_<CODE>` for a new platform). Requests are signed:

| Header | Value |
|---|---|
| `Content-Type` | `application/json` |
| `X-CSL-Platform` | `WOW_SIR`, `DBWOW` or another registered code |
| `X-CSL-Timestamp` | Unix time in seconds; rejected if more than 5 minutes from server time (replay protection) |
| `X-CSL-Signature` | hex `HMAC-SHA256(secret, "<timestamp>.<raw body>")` |

The platform must also be **authorised** by an administrator (Integrations → Record authorisation, which stores the legal or institutional basis). Unauthorised or disabled platforms receive 403 even with a valid signature.

Example (Node):
```js
import crypto from 'node:crypto';
const body = JSON.stringify({ adapter: 'events', payload: [event] });
const ts = Math.floor(Date.now() / 1000);
const sig = crypto.createHmac('sha256', process.env.CSL_SECRET).update(`${ts}.${body}`).digest('hex');
await fetch(URL, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSL-Platform': 'WOW_SIR', 'X-CSL-Timestamp': ts, 'X-CSL-Signature': sig }, body });
```

### Body

```json
{ "adapter": "events" | "wowsir-session" | "dbwow-progress", "payload": ... }
```

| adapter | payload |
|---|---|
| `events` | array of canonical events (below), or the short form from the project brief |
| `wowsir-session` | a WOW Sir live-session export `{ meta, players, questions }` (Realtime Database `sessions/{id}/meta`, `sessions/{id}/players`, `sessions_questions/{id}`) |
| `dbwow-progress` | a DBWOW Learning Centre export `{ uid, progress, exported_at }` (`users/{uid}.progress`) |

### Response

`200 { "batch_id", "accepted", "rejected", "duplicates", "errors": [{ event_id | source_learner_id, reason }] }`
Errors: 400 bad header or JSON, 401 bad signature or timestamp, 403 platform not registered/authorised, 405 not POST, 422 adapter failure, 500 no secret configured.

Every request body is stored first in `raw_source_records` (nothing is lost), then events are validated; valid new events go to `learning_events`, duplicates (same `event_id`) are counted and ignored, invalid ones are returned with reasons and kept in `platform_integrations/{code}.last_errors`.

## Canonical learning event (schema 1.0)

Required: `event_id`, `schema_version` ("1.0"), `source_platform`, `source_learner_id`, `event_type`, `subject`, `time_precision`.

| Field | Type | Notes |
|---|---|---|
| `event_id` | string | unique per platform; used for duplicate detection |
| `source_platform` | string | `CS_LIFELINE`, `WOW_SIR`, `DBWOW`, … |
| `source_learner_id` | string | the platform's own learner id (never an email) |
| `learner_id` | string or null | CS Lifeline research ID — set **only** from a verified identity link, never by the sender |
| `event_type` | enum | `question_answered`, `assessment_completed`, `activity_completed`, `practical_step_verified`, `intervention_assigned`, `intervention_outcome` |
| `subject` / `curriculum` | string | `CS-0478` / `CIE-0478` |
| `chapter_id` | T01–T14 or null | mapped from the platform's topic; events outside IGCSE CS are rejected with a reason |
| `question_id`, `assessment_id`, `activity_id` | string | prefixed with the platform, e.g. `WOWSIR:q17` |
| `correct`, `score`, `max_score`, `response` | | outcome |
| `attempt_number`, `duration_ms` | number | |
| `occurred_at` | ISO-8601 | |
| `time_precision` | `exact` · `session` · `snapshot` | `snapshot` = first seen in a periodic export (DBWOW stores no answer times) |
| `misconception_tags[]` | taxonomy ids | |
| `context` | object | e.g. `{ mode: "live_quiz", interruptions: 1 }` |
| `provenance` | object | adapter name and version, batch id |
| `is_synthetic` | boolean | |

### Short form accepted (as in the project brief)

```json
{ "event_id": "EVT-001", "source_platform": "WOW_SIR", "learner_id": "ANON-001", "event_type": "question_answered",
  "subject": "Computer Science", "chapter": "Programming", "topic": "Selection", "question_id": "Q-001",
  "response_correct": false, "attempt_number": 2, "duration_seconds": 35, "timestamp": "2026-11-05T14:00:00Z", "data_version": "1.0" }
```
is normalised to the canonical form: `data_version → schema_version`, `timestamp → occurred_at`, `response_correct → correct`, `duration_seconds → duration_ms`, `"Computer Science" → CS-0478`, chapter "Programming" → `T08`, and the sender's `learner_id` becomes `source_learner_id` (a platform's own ID is not trusted as a research ID). Tested in `tests/unit/integration.test.mjs` and with `public/templates/learning_event_example.json`.

## Data exchanged with the Python pipeline

| Direction | File | Where |
|---|---|---|
| App → Python | Research export: `learners.csv`, `responses.csv`, `sessions.csv`, `interventions.csv`, `predictions.csv` | Teacher portal → Research export |
| Python → App | `ml/models/<version>/registry_entry.json` | Administration → Models → Register model |
| Python → App | `ml/reports/predictions_<cohort>_<version>.json` (`{ model_version, predictions: [...] }`) | Administration → Models → Import predictions (production model only) |

Columns are defined in `DATA_DICTIONARY.md`.
