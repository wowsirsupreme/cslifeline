import test from 'node:test';
import assert from 'node:assert/strict';
import { normaliseQuestion, validateQuestion, scoreAnswer, stripAnswerKey } from '../../public/js/engine/questions.js';
import { markResponse, splitKey, joinKey } from '../../public/js/engine/marking.js';
import { detectForStudent, classify, probAboveHalf, applyReviews, aggregateClass } from '../../public/js/engine/misconception.js';
import { studentSummary, classSummary, accuracy, weeklyTrend, itemStats } from '../../public/js/engine/analytics.js';
import { computeFeatures, predictLogistic, explain, recommendAction, categorise, FEATURE_NAMES } from '../../public/js/engine/risk.js';
import { evaluateIntervention, effectiveStatus, diffCI } from '../../public/js/engine/interventions.js';
import { prepareImport, textSimilarity, templateCSV } from '../../public/js/engine/importer.js';
import { parseCSV, toCSV } from '../../public/js/engine/csv.js';
import { QUESTION_BANK } from '../../public/data/question-bank.js';
import { DAY } from '../../public/js/core/util.js';

const T0 = Date.UTC(2026, 8, 1);
const bank = QUESTION_BANK.map(q => normaliseQuestion(q, { source: q.source }));
const Q = new Map(bank.map(q => [q.id, q]));

// ── Scoring: every type ────────────────────────────────────────────────────
test('scoring: mcq, truefalse, multi (partial), short, gap, matching, ordering, trace table', () => {
  const mcq = normaliseQuestion({ id: 'a1', type: 'mcq', text: 'x', options: ['a', 'b', 'c'], answer: 1, option_misconceptions: { 2: 'MC-BIN-01' } });
  assert.equal(scoreAnswer(mcq, 1).correct, true);
  assert.deepEqual(scoreAnswer(mcq, 2).misconception_hits, ['MC-BIN-01']);
  assert.deepEqual(scoreAnswer(mcq, 0).misconception_hits, []);
  const tf = normaliseQuestion({ id: 'a2', type: 'truefalse', text: 'x', answer: 'false' });
  assert.equal(scoreAnswer(tf, false).correct, true); assert.equal(scoreAnswer(tf, true).correct, false);
  const mu = normaliseQuestion({ id: 'a3', type: 'multi', text: 'x', options: ['1', '10', '0', '11'], answer: [0, 1], marks: 2 });
  assert.equal(scoreAnswer(mu, [0, 1]).correct, true);
  const half = scoreAnswer(mu, [0]); assert.equal(half.score, 1); assert.equal(half.correct, null);
  assert.equal(scoreAnswer(mu, [0, 2]).score, 0, 'a wrong pick cancels a right pick');
  const sh = normaliseQuestion({ id: 'a4', type: 'short', text: 'x', answer: '90|ninety', numeric_tolerance: 0 });
  assert.equal(scoreAnswer(sh, ' 90 ').correct, true); assert.equal(scoreAnswer(sh, 'Ninety').correct, true); assert.equal(scoreAnswer(sh, '91').correct, false);
  const gap = normaliseQuestion({ id: 'a5', type: 'gap', text: '{{1}} and {{2}}', answer: [['16'], ['4']], marks: 2 });
  assert.equal(scoreAnswer(gap, ['16', '4']).correct, true); assert.equal(scoreAnswer(gap, ['16', '5']).score, 1);
  const mt = normaliseQuestion({ id: 'a6', type: 'matching', text: 'x', left: ['a', 'b'], right: ['A', 'B'], answer: [0, 1], marks: 2 });
  assert.equal(scoreAnswer(mt, [0, 1]).correct, true); assert.equal(scoreAnswer(mt, [1, 0]).correct, false);
  const od = normaliseQuestion({ id: 'a7', type: 'ordering', text: 'x', items: ['a', 'b', 'c', 'd'], answer: [0, 1, 2, 3], marks: 2 });
  assert.equal(scoreAnswer(od, [0, 1, 2, 3]).correct, true);
  assert.ok(scoreAnswer(od, [0, 1, 3, 2]).score > 0 && scoreAnswer(od, [0, 1, 3, 2]).score < 2);
  const tt = normaliseQuestion({ id: 'a8', type: 'trace_table', text: 'x', columns: ['X'], answer: [['2'], ['6'], ['5']], marks: 3 });
  assert.equal(scoreAnswer(tt, [['2'], ['6'], ['5']]).correct, true); assert.equal(scoreAnswer(tt, [['2'], ['6'], ['4']]).score, 2);
});
test('scoring: unanswered is wrong but flagged; structured and coding need manual or tests', async () => {
  const mcq = normaliseQuestion({ id: 'b1', type: 'mcq', text: 'x', options: ['a', 'b'], answer: 0 });
  const r = scoreAnswer(mcq, undefined); assert.equal(r.correct, false); assert.equal(r.unanswered, true);
  const st = normaliseQuestion({ id: 'b2', type: 'structured', text: 'x', parts: [{ prompt: 'a', marks: 2 }] });
  assert.equal(scoreAnswer(st, 'text').needs_manual, true);
  const cod = Q.get('P2_T13_004');
  const good = await markResponse(cod, cod.solution); assert.equal(good.correct, true, JSON.stringify(good.detail));
  const bad = await markResponse(cod, cod.solution.replace('>= 1', '> 1')); assert.equal(bad.correct, null); assert.ok(bad.score < cod.marks);
  const blank = await markResponse(cod, ''); assert.equal(blank.correct, false);
});
test('answer keys are stripped for students and can be rejoined for teachers', () => {
  const q = Q.get('V4_T09_STR_01');
  const pub = stripAnswerKey(q);
  assert.equal(pub.answer, undefined); assert.equal(pub.option_misconceptions, undefined); assert.equal(pub.parts[0].keywords, undefined);
  const back = joinKey(pub, splitKey(q));
  assert.deepEqual(back.parts[1].keywords, q.parts[1].keywords);
  const m = Q.get('P1_T1_004'); const p2 = stripAnswerKey(m);
  assert.ok(!('answer' in p2) && !('explanation' in p2));
});
test('normalisation accepts v3 and WOW Sir formats', () => {
  const v3 = normaliseQuestion({ id: 'X', type: 'MCQ', chapter_id: 'T01', text: 't', options: ['a', 'b'], correct: 1, misconception_tag: 'BINARY_CONVERSION_ERROR' });
  assert.equal(v3.type, 'mcq'); assert.equal(v3.answer, 1); assert.equal(v3.misconception_tag, 'MC-BIN-01'); assert.equal(v3.legacy_tag, 'BINARY_CONVERSION_ERROR');
  const ws = normaliseQuestion({ id: 'gr9-x-01', topicKey: 'gr9-data-binary', type: 'mcq', text: 't', optionA: 'a', optionB: 'b', optionC: 'c', answer: 'C', difficulty: 'hard', points: 2 });
  assert.equal(ws.answer, 2); assert.equal(ws.difficulty, 3); assert.equal(ws.marks, 2); assert.equal(ws.external_ref.topicKey, 'gr9-data-binary');
});

// ── Question bank content integrity ─────────────────────────────────────────
test('every built-in question validates, ids are unique, and diagnostic distractors never point at the key', async () => {
  const { TAXONOMY } = await import('../../public/js/engine/taxonomy-data.js');
  const ids = new Set(TAXONOMY.map(t => t.id));
  assert.equal(new Set(bank.map(q => q.id)).size, bank.length, 'unique ids');
  for (const q of bank) {
    const v = validateQuestion(q, { taxonomyIds: ids });
    assert.ok(v.ok, `${q.id}: ${v.errors.join('; ')}`);
    assert.ok(!v.warnings.some(w => /taxonomy/.test(w)), `${q.id}: ${v.warnings.join('; ')}`);
  }
});
test('the v3 answer-key error P1_T1_004 is fixed (238 + 49 overflows to 00011111)', () => {
  const q = Q.get('P1_T1_004');
  assert.equal(q.options[q.answer], '00011111');
  assert.equal(((0b11101110 + 0b00110001) & 0xff).toString(2).padStart(8, '0'), '00011111');
});
test('code-output answers match what the interpreter actually prints', async () => {
  const { runPseudocode } = await import('../../public/js/engine/pseudocode/interpreter.js');
  const inputs = { V4_T08_TOT_01: ['4', '5', '6'] };
  const checked = [];
  for (const q of bank.filter(x => x.type === 'code_output' && x.code)) {
    const r = await runPseudocode(q.code, { inputs: inputs[q.id] || [], maxSteps: 5000 });
    if (/never ends|wrong with|What is wrong/i.test(q.text) || /never ends/i.test(q.options?.[q.answer] || '')) continue; // conceptual, not literal output
    if (/How many times/.test(q.text)) { assert.equal(String(r.output.length), q.options[q.answer], q.id); checked.push(q.id); continue; }
    if (/fourth line/.test(q.text)) { assert.equal(r.output[3], q.options[q.answer], q.id); checked.push(q.id); continue; }
    if (/value does Grade have/.test(q.text)) continue;
    assert.equal(r.error, null, `${q.id}: ${r.error?.message}`);
    const got = r.output.join(' ');
    const expected = q.options.length ? q.options[q.answer] : q.answer[0];
    assert.equal(got.replace(/\s+/g, ' ').trim(), expected === 'Nothing' ? '' : expected, q.id);
    checked.push(q.id);
  }
  assert.ok(checked.length >= 20, `checked ${checked.length}`);
});
test('coding questions: the model solution passes every test case', async () => {
  for (const q of bank.filter(x => x.type === 'coding')) {
    const r = await markResponse(q, q.solution);
    assert.equal(r.correct, true, `${q.id}: ${JSON.stringify(r.detail)}`);
  }
});
test('coverage: most misconceptions have at least 3 opportunities in the bank', async () => {
  const { TAXONOMY } = await import('../../public/js/engine/taxonomy-data.js');
  const { targetsOf } = await import('../../public/js/engine/misconception.js');
  const n = new Map(TAXONOMY.map(t => [t.id, 0]));
  for (const q of bank) for (const id of targetsOf(q).keys()) n.set(id, (n.get(id) || 0) + 1);
  const covered = [...n.values()].filter(c => c >= 3).length;
  assert.ok(covered / TAXONOMY.length >= 0.75, `only ${covered}/${TAXONOMY.length} have ≥3 opportunities`);
  assert.ok([...n.values()].every(c => c >= 1), 'every taxonomy entry has at least one item: ' + [...n].filter(([, c]) => !c).map(([k]) => k));
});

// ── Misconception engine ───────────────────────────────────────────────────
const resp = (question_id, correct, chosen, i, extra = {}) => ({ id: `${question_id}-${i}`, question_id, correct, chosen, recorded_at: T0 + i * DAY, session_id: 's' + Math.floor(i / 3), time_ms: 20000, ...extra });
test('a single wrong answer is never a misconception', () => {
  const f = detectForStudent([resp('V4_T08_ASG_01', false, 0, 1)], Q);
  assert.equal(f[0].status, 'insufficient_evidence');
});
test('repeated diagnostic distractor choices across questions → demonstrated', () => {
  const rs = [resp('V4_T08_ASG_01', false, 0, 1), resp('P2_T8_001', false, 0, 2), resp('V4_T08_ASG_02', false, 0, 3), resp('V4_T08_ASG_03', false, 0, 4)];
  const f = detectForStudent(rs, Q).find(x => x.misconception_id === 'MC-ASSIGN-01');
  assert.equal(f.status, 'demonstrated'); assert.ok(f.evidence_strength >= 0.8);
  // mce-1.1: the true/false item has only one wrong option, so choosing it cannot be told apart from a guess — 3 of 4 errors are diagnostic.
  assert.equal(f.counts.diagnostic_hits, 3);
  assert.equal(f.evidence.length, 4, 'evidence is traceable to responses');
});
test('wrong answers that avoid the diagnostic distractors → knowledge gap, not misconception', () => {
  // MC-ASSIGN-02 diagnostic options: V4_T08_ASG_04 {1}, V4_T08_ASG_05 {0,2}
  const rs = [resp('V4_T08_ASG_04', false, 2, 1), resp('V4_T08_ASG_05', false, 3, 2), resp('V4_T08_ASG_04', false, 3, 3)];
  const f = detectForStudent(rs, Q).find(x => x.misconception_id === 'MC-ASSIGN-02');
  assert.equal(f.status, 'knowledge_gap');
});
test('one slip among correct answers → isolated error; trend improving', () => {
  const rs = [resp('V4_T08_OP_01', false, 1, 1, { time_ms: 900 }), resp('V4_T08_OP_02', true, 0, 2), resp('V4_T08_OP_03', true, 0, 3), resp('V4_T08_OP_01', true, 0, 4)];
  const f = detectForStudent(rs, Q, { medianTimeByQuestion: new Map([['V4_T08_OP_01', 20000]]) }).find(x => x.misconception_id === 'MC-OP-01');
  assert.equal(f.status, 'isolated_error'); assert.match(f.reason, /slip/); assert.equal(f.trend, 'improving');
});
test('responses awaiting manual marking are ignored; no errors → no finding', () => {
  assert.deepEqual(detectForStudent([resp('V4_T08_OP_01', null, null, 1), resp('V4_T08_OP_02', true, 0, 2)], Q), []);
});
test('teacher reviews override the displayed status without changing the engine output', () => {
  const rs = [resp('V4_T08_ASG_01', false, 0, 1), resp('P2_T8_001', false, 0, 2), resp('V4_T08_ASG_02', false, 0, 3)];
  const f = detectForStudent(rs, Q);
  const reviewed = applyReviews(f, { 'MC-ASSIGN-01': { status: 'isolated_error', note: 'Typing slip' } });
  const a = reviewed.find(x => x.misconception_id === 'MC-ASSIGN-01');
  assert.equal(a.final_status, 'isolated_error'); assert.notEqual(a.status, 'isolated_error'); assert.equal(a.final_source, 'teacher');
  const agg = aggregateClass({ u1: reviewed });
  assert.equal(agg.find(x => x.misconception_id === 'MC-ASSIGN-01').counts.isolated_error, 1);
});
test('probAboveHalf matches known Beta values', () => {
  assert.equal(probAboveHalf(1, 1), 0.5);
  assert.ok(Math.abs(probAboveHalf(4, 1) - 0.9375) < 1e-9); // Beta(4,1): 1 - 0.5^4
  assert.ok(Math.abs(probAboveHalf(1, 4) - 0.0625) < 1e-9);
});

// ── Analytics ──────────────────────────────────────────────────────────────
test('analytics: accuracy excludes unmarked responses; class summary counts real records only', () => {
  const rs = [{ student_uid: 'a', correct: true, recorded_at: T0, chapter_id: 'T01', question_id: 'q1' }, { student_uid: 'a', correct: null, needs_manual: true, recorded_at: T0, chapter_id: 'T01', question_id: 'q2' },
    { student_uid: 'b', correct: false, recorded_at: T0 + 20 * DAY, chapter_id: 'T08', question_id: 'q1' }];
  assert.equal(accuracy(rs).n, 2);
  const s = studentSummary(rs.filter(r => r.student_uid === 'a'), [], T0 + DAY);
  assert.equal(s.accuracy, 1); assert.equal(s.awaiting_marking, 1);
  const c = classSummary([{ uid: 'a' }, { uid: 'b' }, { uid: 'c' }], rs, { now: T0 + 21 * DAY, activeWindowDays: 14 });
  assert.equal(c.total_students, 3); assert.equal(c.active_students, 1); assert.equal(c.students_with_data, 2); assert.equal(c.responses, 3);
  const items = itemStats(rs, Q); assert.equal(items.find(i => i.question_id === 'q1').facility, 0.5);
});
test('weekly trend slope is negative for declining accuracy', () => {
  const rs = []; for (let w = 0; w < 5; w++) for (let i = 0; i < 10; i++) rs.push({ correct: i < 9 - w * 2, recorded_at: T0 + w * 7 * DAY + i * 1000 });
  assert.ok(weeklyTrend(rs).slope_per_week < -0.1);
});

// ── Risk features and inference ────────────────────────────────────────────
test('risk features use only data before the cut-off (no temporal leakage)', () => {
  const rs = [{ correct: true, recorded_at: T0, question_id: 'a', chapter_id: 'T01' }, { correct: false, recorded_at: T0 + 10 * DAY, question_id: 'b', chapter_id: 'T01' }];
  const f = computeFeatures(rs, [], T0 + 5 * DAY);
  assert.equal(f.n_responses, 1); assert.equal(f.acc_all, 1);
  assert.deepEqual(Object.keys(f).sort(), [...FEATURE_NAMES].sort());
});
test('logistic inference: probabilities, exact contributions, thresholds and minimum data', () => {
  const model = { model_type: 'logistic', features: ['acc_all', 'active_days_28'], means: [0.6, 8], scales: [0.2, 4], coef: [-1.5, -0.5], intercept: -0.5, thresholds: { moderate: 0.35, high: 0.6 }, min_responses: 5 };
  const low = predictLogistic(model, { acc_all: 0.9, active_days_28: 12, n_responses: 50 });
  const high = predictLogistic(model, { acc_all: 0.2, active_days_28: 1, n_responses: 50 });
  assert.ok(low.risk_probability < high.risk_probability);
  assert.equal(high.risk_category, 'high');
  const z = high.contributions.reduce((a, c) => a + c.contribution, model.intercept);
  assert.ok(Math.abs(1 / (1 + Math.exp(-z)) - high.risk_probability) < 1e-12, 'contributions sum to the logit');
  assert.equal(predictLogistic(model, { acc_all: 0.2, n_responses: 2 }).risk_category, 'unknown');
  const ex = explain(high.contributions); assert.ok(ex.length >= 1 && ex.every(e => e.contribution > 0));
  assert.match(recommendAction('high', ex, [{ name: 'Assignment and equality are the same', status: 'demonstrated' }]), /Assignment and equality/);
  assert.equal(categorise(0.5, { moderate: 0.35, high: 0.6 }), 'moderate');
});

// ── Interventions ──────────────────────────────────────────────────────────
test('intervention outcome needs evidence on both sides and reports an association with a CI', () => {
  const iv = { started_at: T0 + 30 * DAY, target: { type: 'chapter', id: 'T08' } };
  const mk = (n, k, start) => Array.from({ length: n }, (_, i) => ({ id: `${start}-${i}`, correct: i < k, chapter_id: 'T08', question_id: 'q', recorded_at: start + i * 3600e3 }));
  const few = evaluateIntervention(iv, [...mk(5, 1, T0 + 10 * DAY), ...mk(2, 2, T0 + 31 * DAY)], { now: T0 + 40 * DAY });
  assert.equal(few.outcome, 'insufficient_evidence');
  const good = evaluateIntervention(iv, [...mk(10, 2, T0 + 10 * DAY), ...mk(10, 9, T0 + 31 * DAY)], { now: T0 + 40 * DAY });
  assert.equal(good.outcome, 'improved'); assert.ok(good.ci_low > 0); assert.match(good.summary, /not proof/);
  assert.equal(good.evidence_response_ids.pre.length, 10);
  const flat = evaluateIntervention(iv, [...mk(10, 5, T0 + 10 * DAY), ...mk(10, 6, T0 + 31 * DAY)], { now: T0 + 40 * DAY });
  assert.equal(flat.outcome, 'no_clear_change');
  assert.equal(effectiveStatus({ status: 'active', review_date: T0 }, T0 + DAY), 'review_due');
  const d = diffCI(2, 10, 9, 10); assert.ok(d.lo < d.diff && d.diff < d.hi);
});

// ── Import, duplicate detection, CSV ───────────────────────────────────────
test('CSV round trip with quotes, commas, newlines and formula injection guard', () => {
  const rows = [{ a: 'x, y', b: 'line1\nline2', c: 'He said "hi"', d: '=SUM(A1)' }];
  const csv = toCSV(rows);
  const back = parseCSV(csv);
  assert.deepEqual(back[1].slice(0, 3), ['x, y', 'line1\nline2', 'He said "hi"']);
  assert.equal(back[1][3], "'=SUM(A1)");
});
test('import: template parses; invalid rows rejected with reasons; duplicates need confirmation', () => {
  const t = prepareImport({ csvText: templateCSV() }, []);
  assert.equal(t.ready.length, 1, JSON.stringify(t.rejected)); assert.equal(t.ready[0].answer, 1);
  const csv = 'id,type,chapter_id,text,optionA,optionB,answer\n' +
    'N1,mcq,T01,What is 2+2?,3,4,B\n' +
    'N2,mcq,T01,Bad answer,3,4,Z\n' +
    'N3,mcq,T01,What is 2 + 2 ?,3,4,B\n' +
    `N4,mcq,T01,"${bank.find(q => q.id === 'P1_T1_001').text}",142,174,B\n`;
  const r = prepareImport({ csvText: csv }, bank);
  assert.deepEqual(r.ready.map(q => q.id), ['N1']);
  assert.ok(r.rejected.find(x => x.id === 'N2').errors[0].match(/index/));
  assert.ok(r.rejected.find(x => x.id === 'N3').errors[0].match(/row 2/), 'same text within the file');
  assert.equal(r.duplicates.find(x => x.q.id === 'N4').kind, 'similar');
  assert.ok(textSimilarity('Convert 1010 to denary', 'Convert 1010 into denary') > 0.7);
  const wow = prepareImport({ csvText: 'id,topicKey,type,text,optionA,optionB,optionC,optionD,answer,explanation,difficulty,points,chapter,imageUrl\nW1,gr9-cpu,mcq,What does the ALU do?,Arithmetic and logic,Stores data,Fetches,Displays,0,Explained,easy,1,,\n' }, []);
  assert.equal(wow.ready.length, 1, 'WOW Sir template accepted'); assert.equal(wow.ready[0].external_ref.platform, 'WOW_SIR');
});

test('mce-1.1: errors no higher than the learner\'s own baseline are a knowledge gap, not a misconception', async () => {
  // Learner is wrong on almost everything (baseline error rate high), including the assignment items.
  const rs = [resp('V4_T08_ASG_01', false, 0, 1), resp('P2_T8_001', false, 0, 2), resp('V4_T08_ASG_03', false, 0, 3)];
  for (let i = 0; i < 8; i++) rs.push(resp('V4_T08_OP_0' + (1 + (i % 3)), false, 3, 10 + i));
  const f = detectForStudent(rs, Q).find(x => x.misconception_id === 'MC-ASSIGN-01');
  assert.notEqual(f.status, 'demonstrated');
  assert.equal(f.baseline_error_rate, 1);
});
