// Canonical learning-event schema (version 1.0) and source-platform adapters.
//
// The schema is informed by xAPI (actor / verb / object / result / context) and
// 1EdTech Caliper (typed events with a shared vocabulary) but is deliberately small
// and flat so it can be stored in Firestore and loaded into pandas without
// transformation. JSON Schema: schemas/learning_event.schema.json.
//
// Layers (docs/INTEGRATION_GUIDE.md):
//   raw_source_records  exactly what a platform sent (kept for audit)
//   learning_events     validated canonical events (this module)
//   learner_identity_map  verified links from platform learner IDs to pseudonymous IDs
//
// An event is never linked to a CS Lifeline learner unless an identity mapping has
// been verified by a teacher or administrator. Unlinked events stay as separate
// learning histories.

import { hash32, toMs } from '../core/util.js';
import { mapExternalTopic } from '../engine/curriculum.js';

export const EVENT_SCHEMA_VERSION = '1.0';
export const PLATFORMS = {
  CS_LIFELINE: { name: 'CS Lifeline', adapter: 'cslifeline-response', version: '1.0' },
  WOW_SIR: { name: 'WOW Sir', adapter: 'wowsir-session', version: '1.0' },
  DBWOW: { name: 'DBWOW', adapter: 'dbwow-progress', version: '1.0' },
};
export const EVENT_TYPES = ['question_answered', 'assessment_completed', 'activity_completed', 'practical_step_verified', 'intervention_assigned', 'intervention_outcome'];
export const TIME_PRECISION = ['exact', 'session', 'snapshot'];

const REQUIRED = ['event_id', 'schema_version', 'source_platform', 'source_learner_id', 'event_type', 'subject', 'time_precision'];

/** Validate one canonical event. Returns a list of error messages (empty when valid). */
export function validateEvent(e) {
  const errs = [];
  if (!e || typeof e !== 'object') return ['event must be an object'];
  for (const k of REQUIRED) if (e[k] === undefined || e[k] === null || e[k] === '') errs.push(`missing ${k}`);
  if (e.schema_version && e.schema_version !== EVENT_SCHEMA_VERSION) errs.push(`unsupported schema_version ${e.schema_version}`);
  if (e.source_platform && !/^[A-Z][A-Z0-9_]{1,30}$/.test(e.source_platform)) errs.push('source_platform must be an upper-case code such as WOW_SIR');
  if (e.event_type && !EVENT_TYPES.includes(e.event_type)) errs.push(`unknown event_type ${e.event_type}`);
  if (e.time_precision && !TIME_PRECISION.includes(e.time_precision)) errs.push(`unknown time_precision ${e.time_precision}`);
  if (e.time_precision !== 'snapshot' && !e.occurred_at) errs.push('occurred_at is required unless time_precision is snapshot');
  if (e.occurred_at && Number.isNaN(Date.parse(e.occurred_at))) errs.push('occurred_at must be an ISO 8601 date-time');
  if (e.correct !== undefined && e.correct !== null && typeof e.correct !== 'boolean') errs.push('correct must be true, false or null');
  if (e.duration_ms !== undefined && e.duration_ms !== null && !(typeof e.duration_ms === 'number' && e.duration_ms >= 0 && e.duration_ms < 864e5)) errs.push('duration_ms must be between 0 and 86 400 000');
  if (e.score !== undefined && e.score !== null && typeof e.score !== 'number') errs.push('score must be a number');
  if (e.event_type === 'question_answered' && !e.question_id) errs.push('question_answered events need question_id');
  // Personal data must not travel in events.
  for (const k of ['email', 'name', 'display_name', 'student_name']) if (k in e) errs.push(`${k} is not allowed in learning events (use source_learner_id)`);
  return errs;
}

export function makeEventId(platform, ...parts) { return 'EVT-' + platform + '-' + hash32(parts.join('|')).toString(36) + hash32(parts.reverse().join('|')).toString(36); }

/**
 * Accept the short illustrative format (as in the project brief) as well as the
 * canonical one: {event_id, source_platform, learner_id, event_type, subject,
 * chapter, topic, question_id, response_correct, attempt_number, duration_seconds,
 * timestamp, data_version}.
 */
export function normaliseIncoming(raw, { chapterLookup } = {}) {
  const e = { ...raw };
  if (e.data_version && !e.schema_version) { e.schema_version = e.data_version; delete e.data_version; }
  if (e.timestamp && !e.occurred_at) { e.occurred_at = e.timestamp; delete e.timestamp; }
  if ('response_correct' in e && !('correct' in e)) { e.correct = e.response_correct; delete e.response_correct; }
  if (typeof e.duration_seconds === 'number' && e.duration_ms === undefined) { e.duration_ms = Math.round(e.duration_seconds * 1000); delete e.duration_seconds; }
  if (e.learner_id && !e.source_learner_id) { e.source_learner_id = e.learner_id; delete e.learner_id; }
  if (e.chapter && !e.chapter_id) { e.source_chapter = e.chapter; e.chapter_id = chapterLookup ? chapterLookup(e.chapter) : null; delete e.chapter; }
  if (!e.time_precision) e.time_precision = e.occurred_at ? 'exact' : 'snapshot';
  if (e.subject === 'Computer Science') e.subject = 'CS-0478';
  return e;
}

// ── Curriculum mapping ──────────────────────────────────────────────────────
// One mapping table for the whole application: engine/curriculum.js EXTERNAL_TOPIC_MAP.
// WOW Sir topic keys outside IGCSE CS (Grade 4–8 Computing, DT, quantum, OOP) map to null
// and are rejected with a reason, so they never enter CS Lifeline analytics or models.
export function mapWowSirTopic(key) { return mapExternalTopic('WOW_SIR', key); }

// DBWOW Learning Centre topic → taxonomy misconceptions its quiz items probe.
export const DBWOW_TOPIC_TAGS = {
  pk: ['MC-DB-01'], fk: ['MC-DB-01'], terms: ['MC-DB-02'], tables: ['MC-DB-02'], types: ['MC-DB-03'],
  queries: ['MC-DB-04'], sql: ['MC-DB-04'], sortfilter: ['MC-DB-04'],
};

// ── Adapters ────────────────────────────────────────────────────────────────
function base(platform, extra) {
  return { schema_version: EVENT_SCHEMA_VERSION, source_platform: platform, subject: 'CS-0478', curriculum: 'CIE-0478',
    provenance: { adapter: PLATFORMS[platform]?.adapter || 'custom', adapter_version: PLATFORMS[platform]?.version || '1.0' }, ...extra };
}

/** CS Lifeline response → event. */
export function fromCSLifelineResponse(r) {
  const t = toMs(r.recorded_at);
  return base('CS_LIFELINE', {
    event_id: makeEventId('CS_LIFELINE', r.id), source_record_id: r.id, source_learner_id: r.student_uid,
    learner_id: r.pseudo_id || null, class_code: r.class_code || null, event_type: 'question_answered', time_precision: 'exact',
    chapter_id: r.chapter_id || null, topic: r.topic || null, question_id: r.question_id, assessment_id: r.assessment_id || null,
    correct: r.correct === true || r.correct === false ? r.correct : null, score: r.score ?? null, max_score: r.max ?? null,
    attempt_number: r.attempt || 1, duration_ms: r.time_ms ?? null, occurred_at: t ? new Date(t).toISOString() : null,
    response: r.chosen ?? null, misconception_tags: [r.misconception_tag, ...(r.misconception_hits || [])].filter(Boolean),
    context: { mode: r.mode || null }, is_synthetic: !!r.is_synthetic,
  });
}

/**
 * WOW Sir live-session export → events.
 * Input: { meta: LiveSession, players: {playerId: SessionPlayer}, questions: Question[] }
 * (Realtime Database sessions/{id}/meta, sessions/{id}/players and sessions_questions/{id}).
 * WOW Sir players are guests identified only within one session, so source_learner_id
 * is `${sessionId}:${playerId}`. Player names are returned separately in `nameHints`
 * for a teacher to confirm identity; they are never written into events.
 */
export function fromWowSirSession(exp, { isSynthetic = false } = {}) {
  const events = [], rejected = [], nameHints = [];
  const meta = exp.meta || {};
  const sid = meta.id || exp.sessionId;
  const qs = exp.questions || [];
  if (!sid) return { events, rejected: [{ reason: 'Session export has no meta.id' }], nameHints };
  for (const [pid, p] of Object.entries(exp.players || {})) {
    const learner = `${sid}:${pid}`;
    nameHints.push({ source_learner_id: learner, name: p.name || '' });
    for (const [qIndex, a] of Object.entries(p.answers || {})) {
      const q = qs[Number(qIndex)] || {};
      const chapter = mapWowSirTopic(q.topicKey);
      if (!chapter) { rejected.push({ source_learner_id: learner, qIndex, reason: `Topic ${q.topicKey || '(none)'} is not part of IGCSE Computer Science` }); continue; }
      const startedAt = meta.startedAt || exp.exported_at;
      events.push(base('WOW_SIR', {
        event_id: makeEventId('WOW_SIR', sid, pid, qIndex), source_record_id: `${sid}/players/${pid}/answers/${qIndex}`,
        source_learner_id: learner, learner_id: null, event_type: 'question_answered', time_precision: 'session',
        chapter_id: chapter, source_topic: q.topicKey, question_id: `WOWSIR:${q.id || qIndex}`, assessment_id: `WOWSIR:${meta.quizId || sid}`,
        correct: typeof a.correct === 'boolean' ? a.correct : null, attempt_number: 1,
        duration_ms: typeof a.timeMs === 'number' ? a.timeMs : null,
        context: { interruptions: p.tabSwitchesByQ?.[qIndex] ?? null, mode: 'live_quiz' },
        occurred_at: startedAt ? new Date(startedAt).toISOString() : null, is_synthetic: isSynthetic,
      }));
    }
  }
  return { events, rejected, nameHints };
}

/**
 * DBWOW Learning Centre progress → events.
 * Input: { uid, progress (JSON string or object from users/{uid}.progress), exported_at }
 * Quiz answers have no timestamps in DBWOW, so time_precision is 'snapshot'.
 * Saved databases are student work and are deliberately not read.
 */
export function fromDbwowProgress(exp, key, { isSynthetic = false } = {}) {
  const events = [], rejected = [];
  const prog = typeof exp.progress === 'string' ? JSON.parse(exp.progress) : (exp.progress || {});
  const learner = `dbwow:${exp.uid}`;
  const at = exp.exported_at ? new Date(exp.exported_at).toISOString() : null;
  for (const [k, choice] of Object.entries(prog.quizzes || {})) {
    const [topic, idx] = k.split(':');
    const item = key?.topics?.[topic]?.quiz?.[Number(idx)];
    if (!item) { rejected.push({ source_learner_id: learner, key: k, reason: 'Quiz item not found in the DBWOW answer key' }); continue; }
    const chapter = mapExternalTopic('DBWOW', topic);
    if (!chapter) { rejected.push({ source_learner_id: learner, key: k, reason: `DBWOW topic "${topic}" is an Access application skill outside the 0478 syllabus` }); continue; }
    events.push(base('DBWOW', {
      event_id: makeEventId('DBWOW', exp.uid, k), source_record_id: `users/${exp.uid}/progress/quizzes/${k}`,
      source_learner_id: learner, learner_id: null, event_type: 'question_answered', time_precision: 'snapshot',
      chapter_id: chapter, source_topic: topic, question_id: `DBWOW:${k}`, correct: Number(choice) === item.answer,
      response: Number(choice), misconception_tags: Number(choice) === item.answer ? [] : (DBWOW_TOPIC_TAGS[topic] || []), occurred_at: at, is_synthetic: isSynthetic,
    }));
  }
  for (const [k, ok] of Object.entries(prog.steps || {})) {
    if (!ok) continue;
    events.push(base('DBWOW', {
      event_id: makeEventId('DBWOW', exp.uid, 'step', k), source_record_id: `users/${exp.uid}/progress/steps/${k}`,
      source_learner_id: learner, learner_id: null, event_type: 'practical_step_verified', time_precision: 'snapshot',
      chapter_id: 'T14', activity_id: `DBWOW:${k.split(':')[0]}`, correct: true, occurred_at: at, is_synthetic: isSynthetic,
    }));
  }
  return { events, rejected, nameHints: [] };
}

/** Apply verified identity mappings. Unverified or missing mappings leave learner_id null. */
export function linkLearners(events, identityMap) {
  const m = new Map();
  for (const x of identityMap) if (x.status === 'verified') m.set(`${x.source_platform}|${x.source_learner_id}`, x.pseudo_id);
  return events.map(e => ({ ...e, learner_id: e.learner_id || m.get(`${e.source_platform}|${e.source_learner_id}`) || null, linkage: (e.learner_id || m.has(`${e.source_platform}|${e.source_learner_id}`)) ? 'linked' : 'unlinked' }));
}

/**
 * Validate and de-duplicate a batch. Returns accepted events, rejected items with
 * reasons, and the number of duplicates (same event_id already stored or repeated).
 */
export function processBatch(rawEvents, { existingIds = new Set(), chapterLookup } = {}) {
  const accepted = [], rejected = []; let duplicates = 0;
  const seen = new Set(existingIds);
  rawEvents.forEach((raw, i) => {
    const e = normaliseIncoming(raw, { chapterLookup });
    const errs = validateEvent(e);
    if (errs.length) { rejected.push({ index: i, event_id: raw?.event_id || null, errors: errs }); return; }
    if (seen.has(e.event_id)) { duplicates++; return; }
    seen.add(e.event_id);
    accepted.push(e);
  });
  return { accepted, rejected, duplicates };
}
