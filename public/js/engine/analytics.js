// js/engine/analytics.js
// Learning analytics computed from canonical response records.
// Every figure returned here is derived from the records passed in — nothing is estimated
// or hard-coded. Callers display `n` alongside every percentage.
//
// Canonical response (see docs/DATABASE_SCHEMA.md):
//   { id, student_uid, class_code, session_id, assessment_id, question_id, chapter_id,
//     mode: 'practice'|'assessment'|'challenge'|'intervention', correct: bool|null, score, max,
//     time_ms, first_answer_ms, revisions, hint_used, visibility_interruptions, recorded_at (ms), is_synthetic }

import { CHAPTERS, CHAPTER_IDS } from './curriculum.js';
import { mean, median, slope, toMs, weekKey, DAY, wilson } from './stats.js';

export const marked = r => r.correct === true || r.correct === false;

export function accuracy(responses) {
  const m = responses.filter(marked);
  const k = m.filter(r => r.correct).length;
  return { n: m.length, correct: k, accuracy: m.length ? k / m.length : null, ci: wilson(k, m.length) };
}

/** Score-weighted attainment (handles partial credit): sum(score)/sum(max) over marked/partially marked. */
export function attainment(responses) {
  const s = responses.filter(r => Number.isFinite(r.score) && r.max > 0);
  const got = s.reduce((a, r) => a + r.score, 0), max = s.reduce((a, r) => a + r.max, 0);
  return { n: s.length, score: got, max, ratio: max ? got / max : null };
}

export function filterResponses(responses, f = {}) {
  return responses.filter(r => {
    const t = toMs(r.recorded_at);
    if (f.from && t < f.from) return false;
    if (f.to && t > f.to) return false;
    if (f.chapter_id && r.chapter_id !== f.chapter_id) return false;
    if (f.assessment_id && r.assessment_id !== f.assessment_id) return false;
    if (f.mode && r.mode !== f.mode) return false;
    if (f.class_code && r.class_code !== f.class_code) return false;
    if (f.student_uid && r.student_uid !== f.student_uid) return false;
    if (f.topic && r.topic !== f.topic) return false;
    return true;
  });
}

export function byChapter(responses) {
  const out = {};
  for (const id of CHAPTER_IDS) out[id] = { chapter_id: id, title: CHAPTERS[id].title, paper: CHAPTERS[id].paper, ...accuracy(responses.filter(r => r.chapter_id === id)) };
  return out;
}

/** Weekly accuracy series and least-squares trend (accuracy change per week). */
export function weeklyTrend(responses) {
  const weeks = new Map();
  for (const r of responses.filter(marked)) {
    const t = toMs(r.recorded_at); if (!t) continue;
    const k = weekKey(t); if (!weeks.has(k)) weeks.set(k, []); weeks.get(k).push(r);
  }
  const series = [...weeks.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([week, rs]) => ({ week, ...accuracy(rs) }));
  const xs = series.map((_, i) => i), ys = series.map(s => s.accuracy);
  return { series, slope_per_week: series.length >= 3 ? slope(xs, ys) : null };
}

export function studentSummary(responses, sessions = [], now = Date.now()) {
  const all = accuracy(responses);
  const assess = accuracy(responses.filter(r => r.mode === 'assessment'));
  const chapters = byChapter(responses);
  const attempted = Object.values(chapters).filter(c => c.n >= 3);
  const weakest = [...attempted].sort((a, b) => a.accuracy - b.accuracy).slice(0, 3);
  const strongest = [...attempted].sort((a, b) => b.accuracy - a.accuracy).slice(0, 3);
  const times = responses.map(r => toMs(r.recorded_at)).filter(Boolean);
  const lastActive = times.length ? Math.max(...times) : null;
  const activeDays28 = new Set(times.filter(t => t >= now - 28 * DAY).map(t => new Date(t).toISOString().slice(0, 10))).size;
  const started = sessions.length, completed = sessions.filter(s => s.status === 'completed' || s.ended_at).length;
  return {
    responses: responses.length, marked: all.n, accuracy: all.accuracy, accuracy_ci: all.ci,
    assessment_accuracy: assess.accuracy, assessment_n: assess.n,
    attainment: attainment(responses).ratio,
    chapters, weakest, strongest,
    trend: weeklyTrend(responses),
    sessions_started: started, sessions_completed: completed, completion_rate: started ? completed / started : null,
    last_active: lastActive, active_days_28: activeDays28,
    awaiting_marking: responses.filter(r => r.needs_manual && !marked(r)).length,
  };
}

/**
 * Class dashboard figures.
 * @param students  [{uid, display_name, ...}]
 * @param responses canonical responses for this class
 * @param assessments published assessments for this class [{id, title, ...}]
 * @param submissions [{assessment_id, student_uid, status}]
 */
export function classSummary(students, responses, { sessions = [], assessments = [], submissions = [], now = Date.now(), activeWindowDays = 14 } = {}) {
  const uids = new Set(students.map(s => s.uid));
  const rs = responses.filter(r => uids.has(r.student_uid));
  const activeSince = now - activeWindowDays * DAY;
  const activeUids = new Set(rs.filter(r => toMs(r.recorded_at) >= activeSince).map(r => r.student_uid));
  const perStudent = students.map(s => ({ uid: s.uid, ...accuracy(rs.filter(r => r.student_uid === s.uid)) }));
  const withData = perStudent.filter(p => p.n > 0);
  const participation = assessments.map(a => {
    const subs = submissions.filter(x => x.assessment_id === a.id && uids.has(x.student_uid));
    const submitted = new Set(subs.filter(x => x.status !== 'in_progress').map(x => x.student_uid)).size;
    return { assessment_id: a.id, title: a.title, submitted, total: students.length, rate: students.length ? submitted / students.length : null };
  });
  const chapters = byChapter(rs);
  const difficultChapters = Object.values(chapters).filter(c => c.n >= 5).sort((a, b) => a.accuracy - b.accuracy).slice(0, 5);
  const recent = [...rs].sort((a, b) => toMs(b.recorded_at) - toMs(a.recorded_at)).slice(0, 25);
  return {
    total_students: students.length,
    active_students: activeUids.size,
    active_window_days: activeWindowDays,
    students_with_data: withData.length,
    responses: rs.length,
    class_accuracy: accuracy(rs).accuracy,
    mean_student_accuracy: mean(withData.map(p => p.accuracy)),
    median_student_accuracy: median(withData.map(p => p.accuracy)),
    participation,
    chapters, difficult_chapters: difficultChapters,
    trend: weeklyTrend(rs),
    recent,
    per_student: perStudent,
  };
}

/** Distribution of student accuracy in 10-point bins (for histograms). */
export function accuracyDistribution(perStudent) {
  const bins = Array.from({ length: 10 }, (_, i) => ({ from: i * 10, to: i * 10 + 10, count: 0 }));
  perStudent.filter(p => p.accuracy !== null).forEach(p => { bins[Math.min(9, Math.floor(p.accuracy * 10))].count++; });
  return bins;
}

/** Relative response time: time_ms divided by the median time for that question (1 = typical). */
export function relativeTimes(responses, medianByQuestion) {
  return responses.filter(r => r.time_ms > 0 && medianByQuestion.get(r.question_id)).map(r => r.time_ms / medianByQuestion.get(r.question_id));
}

/** Per-question item statistics (facility index and distractor counts) — used for item review. */
export function itemStats(responses, questionsById) {
  const by = new Map();
  for (const r of responses.filter(marked)) {
    if (!by.has(r.question_id)) by.set(r.question_id, { question_id: r.question_id, n: 0, correct: 0, choices: {} });
    const s = by.get(r.question_id); s.n++; if (r.correct) s.correct++;
    if (r.chosen !== null && r.chosen !== undefined) s.choices[r.chosen] = (s.choices[r.chosen] || 0) + 1;
  }
  return [...by.values()].map(s => {
    const q = questionsById instanceof Map ? questionsById.get(s.question_id) : questionsById?.[s.question_id];
    return { ...s, facility: s.n ? s.correct / s.n : null, text: q?.text?.slice(0, 120) || s.question_id, chapter_id: q?.chapter_id || null };
  }).sort((a, b) => (a.facility ?? 1) - (b.facility ?? 1));
}
