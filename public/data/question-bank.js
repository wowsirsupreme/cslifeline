// data/question-bank.js
// CS Lifeline built-in question bank, schema v2.
//
//   1. The original 48 v3 questions (data/legacy/questions_v3.js, kept verbatim) with
//      documented patches: answer-key fix, re-tagging to the taxonomy, diagnostic distractors.
//   2. New questions (source 'cslifeline-v4') written so that each taxonomy entry has
//      several opportunities and several question types are represented.
//
// Every option_misconceptions entry maps a WRONG option index to the misconception that
// choosing it is evidence for. Correct options are never mapped (validated by tests).

import { QUESTIONS as V3 } from './legacy/questions_v3.js';

// ── 1. Patches to v3 questions ───────────────────────────────────────────
const P = {
  P1_T1_001: { misconception_tag: 'MC-BIN-01', option_misconceptions: { 0: 'MC-BIN-01', 2: 'MC-BIN-01', 3: 'MC-BIN-01' } },
  P1_T1_002: { misconception_tag: 'MC-BIN-02', option_misconceptions: { 1: 'MC-BIN-02', 2: 'MC-BIN-02', 3: 'MC-BIN-02' } },
  P1_T1_003: { misconception_tag: 'MC-BIN-04', option_misconceptions: { 0: 'MC-BIN-04', 2: 'MC-BIN-04' } },
  // FIX: v3 marked 11111111 correct. 238 + 49 = 287 overflows 8 bits; the 8-bit result is 00011111.
  P1_T1_004: { correct: 0, misconception_tag: 'MC-BIN-03', option_misconceptions: { 1: 'MC-BIN-03' },
    explanation: '11101110 (238) + 00110001 (49) = 287. 287 needs 9 bits (100011111). In an 8-bit register the 9th bit is lost, so the stored result is 00011111 and an overflow error occurs.',
    patch_note: 'v4: answer key corrected from option 1 to option 0' },
  P1_T1_005: { misconception_tag: 'MC-DREP-01', option_misconceptions: { 0: 'MC-DREP-01', 3: 'MC-DREP-01' } },
  P1_T1_006: { misconception_tag: 'MC-DREP-02', option_misconceptions: { 0: 'MC-DREP-02', 2: 'MC-DREP-02', 3: 'MC-DREP-02' } },
  P1_T1_007: { misconception_tag: 'MC-BIN-05', option_misconceptions: { 2: 'MC-BIN-05' } },
  P1_T2_001: { chapter_id: 'T05', topic: 'Cyber security', misconception_tag: 'MC-SEC-01', option_misconceptions: { 0: 'MC-SEC-01', 2: 'MC-SEC-01', 3: 'MC-SEC-01' }, patch_note: 'v4: moved T02→T05' },
  P1_T2_002: { chapter_id: 'T05', topic: 'Cyber security', misconception_tag: 'MC-SEC-02', option_misconceptions: { 0: 'MC-SEC-02', 3: 'MC-SEC-02' }, patch_note: 'v4: moved T02→T05' },
  P1_T2_003: { chapter_id: 'T03', topic: 'Network hardware', misconception_tag: 'MC-NET-02', option_misconceptions: { 0: 'MC-NET-02', 1: 'MC-NET-02' }, patch_note: 'v4: moved T02→T03' },
  P1_T2_004: { chapter_id: 'T03', topic: 'Network hardware', misconception_tag: 'MC-NET-01', option_misconceptions: { 0: 'MC-NET-01' }, patch_note: 'v4: moved T02→T03 (IP and MAC addresses are 0478 topic 3.4)' },
  P1_T3_001: { misconception_tag: 'MC-ARCH-01', option_misconceptions: { 0: 'MC-ARCH-01', 2: 'MC-ARCH-01' } },
  P1_T3_002: { misconception_tag: null },
  P1_T3_003: { misconception_tag: null },
  P1_T3_004: { chapter_id: 'T01', topic: 'Data storage and compression', misconception_tag: 'MC-DREP-03', option_misconceptions: { 0: 'MC-DREP-03' }, patch_note: 'v4: moved T03→T01' },
  P1_T4_001: { misconception_tag: 'MC-SW-02', option_misconceptions: { 0: 'MC-SW-02', 2: 'MC-SW-02', 3: 'MC-SW-02' } },
  P1_T4_002: { misconception_tag: 'MC-SW-01', option_misconceptions: { 0: 'MC-SW-01' } },
  P1_T4_003: { misconception_tag: 'MC-SW-02', option_misconceptions: { 0: 'MC-SW-02' } },
  P1_T5_001: { chapter_id: 'T03', topic: 'Network hardware', patch_note: 'v4: moved T05→T03; removed stray "Complete the table"', text: 'A MAC address is best described as:', misconception_tag: 'MC-NET-01', option_misconceptions: { 0: 'MC-NET-01', 2: 'MC-NET-01' } },
  P1_T5_002: { misconception_tag: null },
  P1_T6_001: { misconception_tag: 'MC-AUTO-01', option_misconceptions: { 0: 'MC-AUTO-01' } },
  P1_T6_002: { misconception_tag: 'MC-AUTO-02', option_misconceptions: { 0: 'MC-AUTO-02', 2: 'MC-AUTO-02', 3: 'MC-AUTO-02' } },
  P2_T7_001: { misconception_tag: 'MC-SYN-01', option_misconceptions: { 0: 'MC-SYN-01', 1: 'MC-SYN-01', 3: 'MC-SYN-01' } },
  P2_T7_002: { type: 'pseudocode', misconception_tag: 'MC-SEL-01', option_misconceptions: { 2: 'MC-SEL-01' } },
  P2_T7_003: { misconception_tag: 'MC-ALG-01', option_misconceptions: { 0: 'MC-ALG-01' } },
  P2_T7_004: { misconception_tag: 'MC-TEST-01', option_misconceptions: { 0: 'MC-TEST-01', 1: 'MC-TEST-01', 3: 'MC-TEST-01' } },
  P2_T7_005: { type: 'code_output', misconception_tag: 'MC-ITER-02', option_misconceptions: { 0: 'MC-VAR-01', 1: 'MC-ITER-02', 3: 'MC-TRACE-01' } },
  P2_T8_001: { misconception_tag: 'MC-ASSIGN-01', option_misconceptions: { 0: 'MC-ASSIGN-01', 1: 'MC-ASSIGN-01' } },
  P2_T8_002: { misconception_tag: 'MC-ITER-01', option_misconceptions: { 0: 'MC-ITER-01', 2: 'MC-ITER-01', 3: 'MC-ITER-01' } },
  P2_T8_003: { type: 'code_output', misconception_tag: 'MC-ITER-02', option_misconceptions: { 0: 'MC-ITER-02', 2: 'MC-ITER-02' } },
  P2_T8_004: { misconception_tag: 'MC-TYPE-01', option_misconceptions: { 0: 'MC-TYPE-01', 1: 'MC-TYPE-01' } },
  P2_T8_005: { type: 'debugging', misconception_tag: 'MC-SYN-01', option_misconceptions: { 0: 'MC-SYN-01', 1: 'MC-SYN-01', 3: 'MC-SYN-01' } },
  P2_T8_006: { misconception_tag: 'MC-ITER-04', tests: [
    { inputs: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'], expect_contains: ['55', '5.5'] },
    { inputs: ['2', '2', '2', '2', '2', '2', '2', '2', '2', '2'], expect_contains: ['20', '2'] }] },
  P2_T9_001: { misconception_tag: 'MC-ARR-01', option_misconceptions: { 0: 'MC-ARR-01', 2: 'MC-ARR-01', 3: 'MC-ARR-01' } },
  P2_T9_002: { misconception_tag: 'MC-ARR-02', option_misconceptions: { 0: 'MC-ARR-02', 2: 'MC-ARR-02' } },
  P2_T9_003: { misconception_tag: 'MC-ARR-02', tests: [
    { inputs: Array.from({ length: 50 }, (_, i) => `N${i + 1}`), expect_in_order: ['N50', 'N49', 'N2', 'N1'] }] },
  P2_T10_001: { misconception_tag: 'MC-SUB-01', option_misconceptions: { 0: 'MC-SUB-01', 2: 'MC-SUB-01', 3: 'MC-SUB-01' } },
  P2_T10_002: { misconception_tag: 'MC-SCOPE-01', option_misconceptions: { 0: 'MC-SCOPE-01', 2: 'MC-SCOPE-01', 3: 'MC-SCOPE-01' } },
  P2_T10_003: { misconception_tag: 'MC-SUB-02', tests: [
    { append: 'OUTPUT Maximum(3, 9)', expect_contains: ['9'] },
    { append: 'OUTPUT Maximum(12, 4)', expect_contains: ['12'] },
    { append: 'OUTPUT Maximum(-2, -7)', expect_contains: ['-2'] }] },
  P2_T11_001: { misconception_tag: 'MC-FILE-01', option_misconceptions: { 0: 'MC-FILE-01', 1: 'MC-FILE-01', 3: 'MC-FILE-01' } },
  P2_T11_002: { misconception_tag: 'MC-FILE-01', tests: [
    { files: { 'names.txt': ['Ama', 'Kofi', 'Esi'] }, expect_in_order: ['Ama', 'Kofi', 'Esi'] }] },
  P2_T12_001: { misconception_tag: 'MC-SRCH-02', option_misconceptions: { 0: 'MC-SRCH-02', 2: 'MC-SRCH-02' } },
  P2_T12_002: { misconception_tag: 'MC-SRCH-01', option_misconceptions: { 0: 'MC-SRCH-01', 2: 'MC-SRCH-01', 3: 'MC-SRCH-01' } },
  P2_T12_003: { type: 'pseudocode', misconception_tag: 'MC-SORT-01', option_misconceptions: { 1: 'MC-SORT-01', 3: 'MC-SORT-01' } },
  P2_T13_001: { misconception_tag: 'MC-LOGIC-01', option_misconceptions: { 0: 'MC-LOGIC-01' } },
  P2_T13_002: { misconception_tag: 'MC-LOGIC-01', option_misconceptions: { 1: 'MC-LOGIC-01' } },
  P2_T13_003: { misconception_tag: 'MC-LOGIC-02', option_misconceptions: { 0: 'MC-LOGIC-02' } },
  P2_T13_004: { misconception_tag: 'MC-OP-03', tests: [
    { inputs: ['1'], expect_contains: ['Valid'], expect_not_contains: ['Invalid'] },
    { inputs: ['100'], expect_contains: ['Valid'], expect_not_contains: ['Invalid'] },
    { inputs: ['0'], expect_contains: ['Invalid'] },
    { inputs: ['101'], expect_contains: ['Invalid'] },
    { inputs: ['57'], expect_contains: ['Valid'], expect_not_contains: ['Invalid'] }] },
};

const fromV3 = V3.map(q => {
  const p = P[q.id] || {};
  const { patch_note, ...rest } = p;
  return { ...q, ...rest, source: 'cslifeline-v3', ...(patch_note ? { patch_note } : {}) };
});

// ── 2. New questions ─────────────────────────────────────────────────────
const S = 'cslifeline-v4';
const mc = (id, chapter_id, difficulty, tag, text, options, answer, om = {}, explanation = '', x = {}) =>
  ({ id, type: 'mcq', chapter_id, difficulty, misconception_tag: tag, text, options, answer, option_misconceptions: om, explanation, source: S, ...x });
const tf = (id, chapter_id, difficulty, tag, text, answer, explanation = '', x = {}) =>
  ({ id, type: 'truefalse', chapter_id, difficulty, misconception_tag: tag, text, options: ['True', 'False'], answer,
     option_misconceptions: answer === false ? { 0: tag } : { 1: tag }, explanation, source: S, ...x });
const pc = (id, chapter_id, difficulty, tag, text, code, options, answer, om = {}, explanation = '', x = {}) =>
  ({ id, type: 'pseudocode', chapter_id, difficulty, misconception_tag: tag, text, code, options, answer, option_misconceptions: om, explanation, source: S, ...x });
const co = (id, chapter_id, difficulty, tag, text, code, options, answer, om = {}, explanation = '', x = {}) =>
  ({ id, type: 'code_output', chapter_id, difficulty, misconception_tag: tag, text, code, options, answer, option_misconceptions: om, explanation, source: S, ...x });

const NEW = [
  // ── T08 assignment, variables, constants ──
  mc('V4_T08_ASG_01', 'T08', 1, 'MC-ASSIGN-01', 'Which statement adds 1 to the value stored in Count?',
    ['Count = Count + 1', 'Count ← Count + 1', 'Count + 1 ← Count', 'Count ← 1'], 1, { 0: 'MC-ASSIGN-01', 2: 'MC-ASSIGN-02' },
    '← assigns: the right-hand side (Count + 1) is worked out and the result is stored in Count. "=" compares values.'),
  tf('V4_T08_ASG_02', 'T08', 2, 'MC-ASSIGN-01', 'The statement X ← X + 1 is invalid in pseudocode because X can never be equal to X + 1.', false,
    'X ← X + 1 is not an equation. It means "work out X + 1, then store the result in X".'),
  pc('V4_T08_ASG_03', 'T08', 1, 'MC-ASSIGN-01', 'What does the "=" on line 2 do?', 'X ← 5\nIF X = 5 THEN\n   OUTPUT "Yes"\nENDIF',
    ['It assigns 5 to X', 'It compares X with 5, giving TRUE or FALSE', 'It declares X as a constant', 'It outputs 5'], 1, { 0: 'MC-ASSIGN-01', 2: 'MC-VAR-02' },
    'Inside a condition, "=" is the equality operator; assignment always uses ←.'),
  co('V4_T08_ASG_04', 'T08', 1, 'MC-ASSIGN-02', 'What is output?', 'A ← 3\nB ← A\nA ← 7\nOUTPUT B', ['3', '7', '10', 'A'], 0, { 1: 'MC-ASSIGN-02' },
    'B ← A copies the value 3 into B at that moment. Changing A afterwards does not change B.'),
  mc('V4_T08_ASG_05', 'T08', 2, 'MC-ASSIGN-02', 'Which sequence correctly swaps the values stored in X and Y?',
    ['X ← Y\nY ← X', 'Temp ← X\nX ← Y\nY ← Temp', 'Y ← X\nX ← Y', 'X = Y\nY = X'], 1, { 0: 'MC-ASSIGN-02', 2: 'MC-ASSIGN-02', 3: 'MC-ASSIGN-01' },
    'After X ← Y the original value of X is lost, so it must be saved in a temporary variable first.'),
  { id: 'V4_T08_ASG_06', type: 'code_output', chapter_id: 'T08', difficulty: 2, misconception_tag: 'MC-ASSIGN-02',
    text: 'Write exactly what is output (one space between the values).', code: 'P ← 10\nQ ← P\nQ ← Q + 5\nOUTPUT P, " ", Q',
    answer: ['10 15'], answer_misconceptions: { '15 15': 'MC-ASSIGN-02' }, explanation: 'Q receives a copy of P (10) then becomes 15; P is unchanged.', source: S },
  co('V4_T08_VAR_01', 'T08', 1, 'MC-VAR-01', 'What is output?', 'Score ← 4\nScore ← 9\nScore ← Score - 2\nOUTPUT Score', ['7', '4 9 7', '2', '11'], 0, { 1: 'MC-VAR-01', 3: 'MC-VAR-01' },
    'A variable holds one value at a time. 4 is replaced by 9, then 9 − 2 = 7 replaces 9.'),
  { id: 'V4_T08_VAR_02', type: 'trace_table', chapter_id: 'T07', difficulty: 1, misconception_tag: 'MC-VAR-01',
    text: 'Complete the trace table. Write the value of X after each line.', code: 'X ← 2\nX ← X * 3\nX ← X - 1',
    columns: ['X'], answer: [['2'], ['6'], ['5']], marks: 3, explanation: 'Each assignment replaces the previous value: 2, then 6, then 5.', source: S },
  mc('V4_T08_VAR_03', 'T08', 2, 'MC-VAR-02', 'Why is a constant used to store a VAT rate in a shop program?',
    ['So the value can be changed while the program runs', 'So it is set in one place and cannot be changed accidentally while the program runs', 'Constants use less memory than variables', 'Constants can be input by the user'], 1, { 0: 'MC-VAR-02', 3: 'MC-VAR-02' },
    'A constant is fixed during execution; if the rate changes, the programmer edits one line.'),
  tf('V4_T08_VAR_04', 'T08', 1, 'MC-VAR-02', 'A constant can be given a new value later in the program with an assignment statement.', false, 'Assigning to a constant is an error.'),
  mc('V4_T08_VAR_05', 'T08', 2, 'MC-VAR-02', 'CONSTANT Rate ← 0.15 is declared at the start of a program. Which later statement causes an error?',
    ['OUTPUT Rate', 'Price ← Cost * (1 + Rate)', 'Rate ← 0.2', 'Tax ← Price * Rate'], 2, {}, 'Rate is a constant, so it cannot be assigned a new value.'),
  // ── T08 data types ──
  mc('V4_T08_TYP_01', 'T08', 1, 'MC-TYPE-01', 'Which data type is most suitable for the price of an item, for example 12.99?', ['INTEGER', 'REAL', 'CHAR', 'BOOLEAN'], 1, { 0: 'MC-TYPE-01' }, 'Prices have a fractional part, so REAL is needed.'),
  mc('V4_T08_TYP_02', 'T08', 1, 'MC-TYPE-01', 'A variable stores the number of students in a class. Which data type is most suitable?', ['INTEGER', 'REAL', 'STRING', 'CHAR'], 0, { 1: 'MC-TYPE-01', 2: 'MC-TYPE-01' }, 'A count is always a whole number.'),
  mc('V4_T08_TYP_03', 'T08', 1, 'MC-TYPE-02', 'Which data type is most suitable for a telephone number such as 0244123456?', ['INTEGER', 'STRING', 'REAL', 'BOOLEAN'], 1, { 0: 'MC-TYPE-02', 2: 'MC-TYPE-02' }, 'It is never used in arithmetic and the leading 0 must be kept.'),
  co('V4_T08_TYP_04', 'T08', 2, 'MC-TYPE-02', 'What is output?', 'A ← "5"\nB ← "3"\nOUTPUT A & B', ['53', '8', '5 3', 'A & B'], 0, { 1: 'MC-TYPE-02', 2: 'MC-STR-02' }, '"5" and "3" are strings; & joins them with no space.'),
  tf('V4_T08_TYP_05', 'T08', 2, 'MC-TYPE-02', 'A student ID such as 00731 should be stored as an INTEGER.', false, 'Storing it as an INTEGER loses the leading zeros; it is an identifier, not a quantity.'),
  mc('V4_T08_TYP_06', 'T08', 1, 'MC-TYPE-03', 'Found is set to TRUE when a search finds the item. Which data type should Found be?', ['BOOLEAN', 'STRING', 'INTEGER', 'CHAR'], 0, { 1: 'MC-TYPE-03', 3: 'MC-TYPE-03' }, 'Flags have two possible values, TRUE and FALSE.'),
  mc('V4_T08_TYP_07', 'T08', 2, 'MC-TYPE-03', 'Found is a BOOLEAN variable. Which condition correctly tests whether it is true?', ['IF Found = "TRUE" THEN', 'IF Found THEN', 'IF "Found" THEN', 'IF Found = "YES" THEN'], 1, { 0: 'MC-TYPE-03', 3: 'MC-TYPE-03' }, 'A Boolean can be used directly as the condition. "TRUE" in quotes is a string.'),
  tf('V4_T08_TYP_08', 'T08', 2, 'MC-TYPE-03', 'TRUE and "TRUE" are the same value in pseudocode.', false, 'TRUE is a Boolean; "TRUE" is a string of four characters.'),
  // ── T08 operators ──
  mc('V4_T08_OP_01', 'T08', 1, 'MC-OP-01', 'What is the value of 17 DIV 5?', ['3', '2', '3.4', '85'], 0, { 1: 'MC-OP-01', 2: 'MC-OP-01' }, 'DIV gives the whole-number quotient: 5 goes into 17 three times.'),
  mc('V4_T08_OP_02', 'T08', 1, 'MC-OP-01', 'What is the value of 17 MOD 5?', ['2', '3', '3.4', '0'], 0, { 1: 'MC-OP-01', 2: 'MC-OP-01' }, 'MOD gives the remainder: 17 = 3 × 5 + 2.'),
  mc('V4_T08_OP_03', 'T08', 2, 'MC-OP-01', 'Which condition is TRUE only when Number is even?', ['Number MOD 2 = 0', 'Number DIV 2 = 0', 'Number / 2 = 0', 'Number MOD 2 = 1'], 0, { 1: 'MC-OP-01' }, 'Even numbers leave remainder 0 when divided by 2.'),
  co('V4_T08_OP_04', 'T08', 1, 'MC-OP-02', 'What is output?', 'OUTPUT 2 + 3 * 4', ['14', '20', '24', '9'], 0, { 1: 'MC-OP-02' }, 'Multiplication is done before addition: 3 × 4 = 12, then 2 + 12 = 14.'),
  mc('V4_T08_OP_05', 'T08', 2, 'MC-OP-02', 'Which statement correctly calculates the average of A and B?', ['Average ← A + B / 2', 'Average ← (A + B) / 2', 'Average ← A + (B / 2)', 'Average ← A / 2 + B'], 1, { 0: 'MC-OP-02', 2: 'MC-OP-02', 3: 'MC-OP-02' }, 'Brackets make the addition happen before the division.'),
  co('V4_T08_OP_06', 'T08', 2, 'MC-OP-02', 'What is output?', 'OUTPUT 10 - 4 / 2', ['8', '3', '7', '6'], 0, { 1: 'MC-OP-02' }, '4 / 2 = 2 is done first, then 10 − 2 = 8.'),
  mc('V4_T08_OP_07', 'T08', 2, 'MC-OP-03', 'Which condition accepts ages from 13 to 19 inclusive?', ['Age > 13 AND Age < 19', 'Age >= 13 AND Age <= 19', 'Age >= 13 OR Age <= 19', 'Age > 12 OR Age < 20'], 1, { 0: 'MC-OP-03', 2: 'MC-LOGIC-01', 3: 'MC-LOGIC-01' }, 'Inclusive means 13 and 19 themselves must be accepted, and both conditions must hold (AND).'),
  co('V4_T08_OP_08', 'T08', 1, 'MC-OP-03', 'What is output?', 'Mark ← 50\nIF Mark > 50 THEN\n   OUTPUT "Pass"\nELSE\n   OUTPUT "Fail"\nENDIF', ['Pass', 'Fail', 'Pass Fail', 'Nothing'], 1, { 0: 'MC-OP-03', 2: 'MC-SEL-01' }, '50 > 50 is FALSE, so the ELSE branch runs.'),
  tf('V4_T08_OP_09', 'T08', 1, 'MC-OP-03', 'The condition Score < 100 is TRUE when Score is 100.', false, '< is strict: 100 < 100 is FALSE. Use <= to include 100.'),
  // ── T08 selection ──
  co('V4_T08_SEL_01', 'T08', 2, 'MC-SEL-01', 'What is output?', 'Mark ← 75\nIF Mark >= 70 THEN\n   OUTPUT "A"\nELSE\n   IF Mark >= 50 THEN\n      OUTPUT "B"\n   ELSE\n      OUTPUT "C"\n   ENDIF\nENDIF',
    ['A', 'A B', 'B', 'A B C'], 0, { 1: 'MC-SEL-01', 3: 'MC-SEL-01' }, 'The first condition is TRUE, so only that branch runs; the ELSE part is skipped.'),
  pc('V4_T08_SEL_02', 'T08', 2, 'MC-SEL-02', 'A student scores 90. What value does Grade have after this code runs?', 'IF Mark >= 50 THEN\n   Grade ← "C"\nELSE\n   IF Mark >= 80 THEN\n      Grade ← "A"\n   ENDIF\nENDIF',
    ['"C"', '"A"', '"A" then "C"', 'No value is assigned'], 0, { 1: 'MC-SEL-02', 2: 'MC-SEL-01' }, '90 >= 50 is TRUE, so Grade ← "C". The test for 80 is never reached — the conditions are in the wrong order.'),
  tf('V4_T08_SEL_03', 'T08', 1, 'MC-SEL-01', 'In a nested IF statement, every condition is checked even after one has been found to be TRUE.', false, 'Once a branch is chosen, the alternatives in its ELSE part are skipped.'),
  mc('V4_T08_SEL_04', 'T08', 2, 'MC-SEL-02', 'Grades are A (80 or more), B (60 or more) and C (40 or more). In which order should the conditions be tested?',
    ['≥ 40, then ≥ 60, then ≥ 80', '≥ 80, then ≥ 60, then ≥ 40', '≥ 60, then ≥ 80, then ≥ 40', 'The order does not matter'], 1, { 0: 'MC-SEL-02', 2: 'MC-SEL-02', 3: 'MC-SEL-02' }, 'Test the most restrictive condition first, otherwise a wider condition catches values meant for later branches.'),
  mc('V4_T08_SEL_05', 'T08', 2, 'MC-SEL-03', 'Which statement about CASE OF is correct?',
    ['It can test any Boolean condition, for example CASE OF Mark > 50', 'It compares one variable with listed values; OTHERWISE handles any value not listed', 'A value that is not listed automatically uses the first case', 'It cannot be used with CHAR values'], 1, { 0: 'MC-SEL-03', 2: 'MC-SEL-03' }, 'CASE compares a single identifier against values; OTHERWISE is the catch-all.'),
  tf('V4_T08_SEL_06', 'T08', 1, 'MC-SEL-03', 'A CASE OF statement can deal with a value that is not listed if it includes an OTHERWISE clause.', true, 'OTHERWISE runs when no listed value matches.'),
  // ── T08 iteration ──
  co('V4_T08_ITR_01', 'T08', 2, 'MC-ITER-01', 'What is output?', 'Count ← 10\nWHILE Count < 5 DO\n   OUTPUT Count\n   Count ← Count + 1\nENDWHILE\nOUTPUT "Done"',
    ['Done', '10 Done', '10 11 12 13 14 Done', 'The loop never ends'], 0, { 1: 'MC-ITER-01', 3: 'MC-ITER-03' }, 'WHILE tests first: 10 < 5 is FALSE, so the body runs zero times.'),
  co('V4_T08_ITR_02', 'T08', 2, 'MC-ITER-01', 'What is output?', 'Count ← 10\nREPEAT\n   OUTPUT Count\n   Count ← Count + 1\nUNTIL Count > 5',
    ['10', 'Nothing', '5 6 7 8 9 10', 'The loop never ends'], 0, { 1: 'MC-ITER-01', 3: 'MC-ITER-03' }, 'REPEAT runs the body before testing, so 10 is output; then 11 > 5 is TRUE and the loop stops.'),
  mc('V4_T08_ITR_03', 'T08', 1, 'MC-ITER-02', 'How many times does the body of FOR I ← 2 TO 7 … NEXT I run?', ['6', '5', '7', '9'], 0, { 1: 'MC-ITER-02', 2: 'MC-ITER-02' }, 'Values 2, 3, 4, 5, 6, 7 — six values (7 − 2 + 1).'),
  { id: 'V4_T08_ITR_04', type: 'code_output', chapter_id: 'T08', difficulty: 1, misconception_tag: 'MC-ITER-02', text: 'Write the values output, separated by spaces.',
    code: 'FOR I ← 1 TO 4\n   OUTPUT I * 2\nNEXT I', answer: ['2 4 6 8'], answer_misconceptions: { '2 4 6': 'MC-ITER-02', '2 4 6 8 10': 'MC-ITER-02', '4 6 8': 'MC-ITER-02' },
    explanation: 'I takes the values 1, 2, 3 and 4, so 2, 4, 6, 8 are output.', source: S },
  pc('V4_T08_ITR_05', 'T08', 1, 'MC-ITER-03', 'What is wrong with this algorithm?', 'N ← 1\nWHILE N <= 10 DO\n   OUTPUT N\nENDWHILE',
    ['N is never changed inside the loop, so the loop never ends', 'WHILE cannot use <=', 'Nothing — it outputs 1 to 10', 'N should be declared as REAL'], 0, { 2: 'MC-ITER-03' }, 'The condition depends on N, but N is never updated, so it stays TRUE for ever.'),
  tf('V4_T08_ITR_06', 'T08', 1, 'MC-ITER-03', 'In a WHILE loop, the variable used in the condition is increased by 1 automatically after each pass.', false, 'Only FOR loops update their control variable automatically.'),
  { id: 'V4_T08_ITR_07', type: 'debugging', chapter_id: 'T08', difficulty: 2, misconception_tag: 'MC-ITER-03', text: 'This loop should stop after five marks have been input. Why does it never stop?',
    code: 'Total ← 0\nCount ← 0\nREPEAT\n   INPUT Mark\n   Total ← Total + Mark\nUNTIL Count = 5',
    options: ['Count is never increased inside the loop', 'Total should start at 1', 'UNTIL should be replaced by WHILE', 'Mark has not been declared'], answer: 0, option_misconceptions: { 2: 'MC-ITER-01' },
    explanation: 'Count stays 0, so Count = 5 is never TRUE. Add Count ← Count + 1 inside the loop.', source: S },
  co('V4_T08_TOT_01', 'T08', 2, 'MC-ITER-04', 'The user inputs 4, 5 and 6. What is output?', 'FOR I ← 1 TO 3\n   Total ← 0\n   INPUT Mark\n   Total ← Total + Mark\nNEXT I\nOUTPUT Total',
    ['6', '15', '4', '0'], 0, { 1: 'MC-ITER-04' }, 'Total is reset to 0 on every pass, so only the last mark (6) is left.'),
  { id: 'V4_T08_TOT_02', type: 'debugging', chapter_id: 'T08', difficulty: 2, misconception_tag: 'MC-ITER-04', text: 'Which line must be moved to before the loop so that Total is correct?',
    code: '01 FOR I ← 1 TO 3\n02    Total ← 0\n03    INPUT Mark\n04    Total ← Total + Mark\n05 NEXT I\n06 OUTPUT Total',
    options: ['Line 02', 'Line 03', 'Line 04', 'Line 06'], answer: 0, option_misconceptions: { 2: 'MC-ITER-04' }, explanation: 'Initialise the total once, before the loop starts.', source: S },
  tf('V4_T08_TOT_03', 'T08', 1, 'MC-ITER-04', 'A running total should be set to 0 inside the loop so that it is ready for each new value.', false, 'Setting it to 0 inside the loop throws away the total each time.'),
  co('V4_T08_NST_01', 'T08', 2, 'MC-NEST-01', 'How many times is "*" output?', 'FOR I ← 1 TO 3\n   FOR J ← 1 TO 4\n      OUTPUT "*"\n   NEXT J\nNEXT I', ['12', '7', '4', '3'], 0, { 1: 'MC-NEST-01', 2: 'MC-NEST-01' }, 'The inner loop runs 4 times for each of the 3 outer passes: 3 × 4 = 12.'),
  co('V4_T08_NST_02', 'T08', 3, 'MC-NEST-01', 'What is output on the fourth line?', 'FOR I ← 1 TO 2\n   FOR J ← 1 TO 3\n      OUTPUT I, J\n   NEXT J\nNEXT I', ['21', '14', '22', '31'], 0, { 1: 'MC-NEST-01' }, 'Lines: 11, 12, 13, then the outer loop moves to I = 2 and J restarts at 1: 21.'),
  tf('V4_T08_NST_03', 'T08', 1, 'MC-NEST-01', 'In a nested loop, the inner loop runs only once in total.', false, 'The inner loop runs completely every time the outer loop body runs.'),
  // ── T08 strings ──
  mc('V4_T08_STR_01', 'T08', 2, 'MC-STR-01', 'What does SUBSTRING("Computer", 2, 3) return?', ['"omp"', '"om"', '"mpu"', '"Com"'], 0, { 1: 'MC-STR-01', 2: 'MC-STR-01' }, 'Start at position 2 (the first character is position 1) and take 3 characters.'),
  mc('V4_T08_STR_02', 'T08', 1, 'MC-STR-01', 'What does LENGTH("IGCSE") return?', ['5', '4', '6', '"IGCSE"'], 0, { 1: 'MC-STR-01' }, 'LENGTH counts all the characters: I, G, C, S, E.'),
  mc('V4_T08_STR_03', 'T08', 3, 'MC-STR-01', 'S ← "Computer Science". Which expression returns "Science"?', ['SUBSTRING(S, 10, 7)', 'SUBSTRING(S, 9, 7)', 'SUBSTRING(S, 10, 16)', 'SUBSTRING(S, 9, 16)'], 0, { 1: 'MC-STR-01', 2: 'MC-STR-01', 3: 'MC-STR-01' }, '"Computer" is positions 1–8, the space is 9, so "Science" starts at 10 and has 7 characters.'),
  co('V4_T08_STR_04', 'T08', 1, 'MC-STR-02', 'What is output?', 'OUTPUT "Hello" & "World"', ['HelloWorld', 'Hello World', '"Hello" & "World"', 'Hello'], 0, { 1: 'MC-STR-02' }, 'Concatenation joins the strings exactly; it does not add a space.'),
  mc('V4_T08_SYN_01', 'T08', 1, 'MC-SYN-01', 'Which is a correct Cambridge pseudocode statement to read a value into Age?', ['INPUT Age', 'Age = input()', 'READ Age', 'GET Age'], 0, { 1: 'MC-SYN-01', 2: 'MC-SYN-01', 3: 'MC-SYN-01' }, 'INPUT is the Cambridge keyword.'),
  { id: 'V4_T08_SYN_02', type: 'debugging', chapter_id: 'T08', difficulty: 1, misconception_tag: 'MC-SYN-01', text: 'Which line contains an error?',
    code: '01 DECLARE Count : INTEGER\n02 Count ← 0\n03 WHILE Count < 3 DO\n04    PRINT Count\n05    Count ← Count + 1\n06 ENDWHILE',
    options: ['Line 01', 'Line 03', 'Line 04', 'Line 06'], answer: 2, explanation: 'PRINT is not a Cambridge keyword; use OUTPUT.', source: S },
  // ── T07 algorithms, trace, test ──
  tf('V4_T07_ALG_01', 'T07', 1, 'MC-ALG-01', 'Decomposition means removing unnecessary detail from a problem.', false, 'That is abstraction. Decomposition breaks a problem into smaller sub-problems.'),
  mc('V4_T07_ALG_02', 'T07', 1, 'MC-ALG-01', 'Abstraction means:', ['Removing unnecessary detail to focus on what is important', 'Breaking a problem into smaller sub-problems', 'Testing a program with boundary data', 'Translating code into machine code'], 0, { 1: 'MC-ALG-01' }, 'A map is an abstraction: it keeps roads and drops the colour of each house.'),
  co('V4_T07_ALG_03', 'T07', 1, 'MC-ALG-02', 'What is output?', 'X ← 4\nOUTPUT X\nX ← 9', ['4', '9', '4 9', 'Nothing'], 0, { 1: 'MC-ALG-02', 2: 'MC-VAR-01' }, 'Statements run in order: X is 4 when it is output; the later assignment happens afterwards.'),
  { id: 'V4_T07_TRC_01', type: 'trace_table', chapter_id: 'T07', difficulty: 2, misconception_tag: 'MC-TRACE-01',
    text: 'Complete the trace table. Leave a cell empty when the variable does not change on that row.', code: 'Total ← 0\nFOR I ← 1 TO 3\n   Total ← Total + I\nNEXT I',
    columns: ['I', 'Total'], answer: [['', '0'], ['1', '1'], ['2', '3'], ['3', '6']], marks: 4, explanation: 'Total starts at 0, then becomes 1, 3 and 6 as I takes the values 1, 2 and 3.', source: S },
  mc('V4_T07_TRC_02', 'T07', 1, 'MC-TRACE-01', 'When completing a trace table, when should a new value be written in a variable\'s column?',
    ['Each time the variable is assigned a value', 'Only at the end of the algorithm', 'On every row, for every variable', 'Only when the value is output'], 0, { 1: 'MC-TRACE-01', 2: 'MC-TRACE-01', 3: 'MC-TRACE-01' }, 'A trace table records each change, in the order the statements execute.'),
  { id: 'V4_T07_TST_01', type: 'multi', chapter_id: 'T07', difficulty: 2, misconception_tag: 'MC-TEST-01', text: 'A program accepts whole numbers from 1 to 10. Select ALL the extreme test data.',
    options: ['1', '10', '0', '11', '5'], answer: [0, 1], option_misconceptions: { 2: 'MC-TEST-01', 3: 'MC-TEST-01' }, explanation: 'Extreme data are the largest and smallest values that should be accepted: 1 and 10.', marks: 2, source: S },
  { id: 'V4_T07_TST_02', type: 'matching', chapter_id: 'T07', difficulty: 2, misconception_tag: 'MC-TEST-01', text: 'A program accepts whole numbers from 1 to 10. Match each value to its type of test data.',
    left: ['5', '10', '-3', '"ten"'], right: ['Normal', 'Extreme', 'Abnormal'], answer: [0, 1, 2, 2], marks: 2, explanation: '5 is normal, 10 is extreme (largest accepted), −3 and "ten" should be rejected (abnormal).', source: S },
  mc('V4_T07_VAL_01', 'T07', 1, 'MC-TEST-02', 'Entering a new password twice and comparing the two entries is an example of:', ['Verification', 'Validation', 'Encryption', 'Authentication'], 0, { 1: 'MC-TEST-02' }, 'Double entry checks the data was entered accurately — verification.'),
  tf('V4_T07_VAL_02', 'T07', 1, 'MC-TEST-02', 'A range check guarantees that the data entered is correct.', false, 'Validation checks data is reasonable, not that it is true. An age of 15 passes a range check even if the person is 16.'),
  // ── T09 arrays ──
  tf('V4_T09_ARR_01', 'T09', 1, 'MC-ARR-01', 'DECLARE Names : ARRAY[10] OF STRING is a valid Cambridge pseudocode declaration.', false, 'Both bounds are needed: ARRAY[1:10].'),
  mc('V4_T09_ARR_02', 'T09', 2, 'MC-ARR-01', 'Which declares a 2D array with 5 rows and 3 columns of integers?', ['DECLARE Grid : ARRAY[1:5, 1:3] OF INTEGER', 'DECLARE Grid : ARRAY[5, 3] OF INTEGER', 'DECLARE Grid[1:5][1:3] : INTEGER', 'DECLARE Grid : ARRAY[1:3, 1:5] OF INTEGER'], 0, { 1: 'MC-ARR-01', 2: 'MC-ARR-01', 3: 'MC-ARR-03' }, 'Rows first, then columns, each with lower and upper bounds.'),
  co('V4_T09_ARR_03', 'T09', 1, 'MC-ARR-02', 'What is output?', 'DECLARE A : ARRAY[1:4] OF INTEGER\nA[1] ← 8\nA[2] ← 3\nA[3] ← 5\nA[4] ← 1\nI ← 3\nOUTPUT A[I]', ['5', '3', '1', '8'], 0, { 1: 'MC-ARR-02', 2: 'MC-ARR-02' }, 'A[I] is the value stored at position 3, which is 5.'),
  mc('V4_T09_ARR_04', 'T09', 1, 'MC-ARR-02', 'How many elements does DECLARE List : ARRAY[0:4] OF INTEGER contain?', ['5', '4', '6', '0'], 0, { 1: 'MC-ARR-02' }, '0, 1, 2, 3, 4 — upper − lower + 1 = 5.'),
  mc('V4_T09_ARR_05', 'T09', 2, 'MC-ARR-03', 'Table is declared as ARRAY[1:3, 1:4]. What does Table[2, 3] refer to?', ['Row 2, column 3', 'Row 3, column 2', 'The value 6', 'The 5th element'], 0, { 1: 'MC-ARR-03' }, 'The first index is the row, the second is the column.'),
  pc('V4_T09_ARR_06', 'T09', 3, 'MC-ARR-03', 'Table is ARRAY[1:3, 1:4] (3 rows, 4 columns). What is wrong with this code?', 'FOR Row ← 1 TO 3\n   FOR Col ← 1 TO 4\n      OUTPUT Table[Col, Row]\n   NEXT Col\nNEXT Row',
    ['The indices are the wrong way round — it should be Table[Row, Col]', 'Nothing is wrong', 'The loops should both go to 4', 'Col should be the outer loop'], 0, { 1: 'MC-ARR-03' }, 'Table[Col, Row] uses the column number as a row index; Table[4, 1] does not exist.'),
  tf('V4_T09_ARR_07', 'T09', 2, 'MC-ARR-03', 'For DECLARE M : ARRAY[1:2, 1:5] OF INTEGER, M[5, 2] is a valid element.', false, 'M has 2 rows and 5 columns, so the first index can only be 1 or 2.'),
  // ── T10 procedures, functions, parameters, scope ──
  mc('V4_T10_SUB_01', 'T10', 1, 'MC-SUB-01', 'Square(N) is a FUNCTION that RETURNS an INTEGER. Which statement uses it correctly?', ['Result ← Square(5)', 'CALL Square(5)', 'Square(5) ← Result', 'RETURN Square(5)'], 0, { 1: 'MC-SUB-01', 2: 'MC-ASSIGN-02', 3: 'MC-SUB-01' }, 'A function call is an expression whose returned value can be stored or used.'),
  tf('V4_T10_SUB_02', 'T10', 1, 'MC-SUB-01', 'A PROCEDURE must always RETURN a value.', false, 'Procedures do not return values; functions do.'),
  pc('V4_T10_SUB_03', 'T10', 2, 'MC-SUB-02', 'What is wrong with this function?', 'FUNCTION Larger(A : INTEGER, B : INTEGER) RETURNS INTEGER\n   IF A > B THEN\n      OUTPUT A\n   ELSE\n      OUTPUT B\n   ENDIF\nENDFUNCTION',
    ['It outputs the value instead of returning it, so the calling code receives nothing', 'Nothing — OUTPUT and RETURN do the same thing', 'A function cannot have two parameters', 'It must be called with CALL'], 0, { 1: 'MC-SUB-02', 3: 'MC-SUB-01' }, 'Replace OUTPUT with RETURN so the value goes back to the calling statement.'),
  tf('V4_T10_SUB_04', 'T10', 2, 'MC-SUB-02', 'Using OUTPUT inside a function sends the value back to the statement that called the function.', false, 'OUTPUT shows the value to the user; only RETURN passes it back to the program.'),
  co('V4_T10_PRM_01', 'T10', 2, 'MC-PARAM-01', 'What is output?', 'PROCEDURE Show(X : INTEGER, Y : INTEGER)\n   OUTPUT X - Y\nENDPROCEDURE\nA ← 2\nB ← 9\nCALL Show(B, A)',
    ['7', '-7', '11', 'An error, because the names do not match'], 0, { 1: 'MC-PARAM-01', 3: 'MC-PARAM-01' }, 'Arguments are matched by position: X receives B (9) and Y receives A (2). 9 − 2 = 7.'),
  tf('V4_T10_PRM_02', 'T10', 1, 'MC-PARAM-01', 'The names of the arguments in a CALL statement must be the same as the parameter names in the procedure.', false, 'Values are copied by position; the names can be different.'),
  mc('V4_T10_PRM_03', 'T10', 1, 'MC-PARAM-01', 'In CALL Area(5, 3), what are 5 and 3?', ['Arguments', 'Parameters', 'Local variables', 'Return values'], 0, { 1: 'MC-PARAM-01', 2: 'MC-SCOPE-01', 3: 'MC-SUB-01' }, 'Values passed in a call are arguments; the names in the procedure header are parameters.'),
  co('V4_T10_SCP_01', 'T10', 3, 'MC-SCOPE-01', 'What is output?', 'X ← 1\nPROCEDURE Change()\n   DECLARE X : INTEGER\n   X ← 5\nENDPROCEDURE\nCALL Change()\nOUTPUT X', ['1', '5', '6', 'An error'], 0, { 1: 'MC-SCOPE-01' }, 'The procedure declares its own local X; the global X is unchanged.'),
  tf('V4_T10_SCP_02', 'T10', 1, 'MC-SCOPE-01', 'A variable declared inside a procedure can be used by the main program after the procedure has finished.', false, 'Local variables exist only while the procedure runs.'),
  // ── T11 files ──
  tf('V4_T11_FIL_01', 'T11', 1, 'MC-FILE-01', 'Opening a file FOR WRITE adds new lines to the end of its existing contents.', false, 'FOR WRITE replaces the contents. (FOR APPEND adds to the end at A Level.)'),
  { id: 'V4_T11_FIL_02', type: 'ordering', chapter_id: 'T11', difficulty: 1, misconception_tag: 'MC-FILE-01', text: 'Put these statements in the correct order to output the first line of log.txt.',
    items: ['OPENFILE "log.txt" FOR READ', 'READFILE "log.txt", Line', 'OUTPUT Line', 'CLOSEFILE "log.txt"'], answer: [0, 1, 2, 3], marks: 2, explanation: 'Open, read, use the data, close.', source: S },
  // ── T12 searching and sorting ──
  tf('V4_T12_SRC_01', 'T12', 1, 'MC-SRCH-01', 'A binary search can be used on any list, whether or not it is sorted.', false, 'Binary search relies on the list being in order.'),
  mc('V4_T12_SRC_02', 'T12', 1, 'MC-SRCH-01', 'Which list can a binary search be applied to directly?', ['[2, 5, 9, 14, 20]', '[9, 2, 20, 5, 14]', '[20, 2, 14, 9, 5]', 'Any of these lists'], 0, { 1: 'MC-SRCH-01', 2: 'MC-SRCH-01', 3: 'MC-SRCH-01' }, 'Only the sorted list.'),
  mc('V4_T12_SRC_03', 'T12', 2, 'MC-SRCH-02', 'A linear search looks for 9 in [4, 9, 2, 9]. After how many comparisons does it stop?', ['2', '4', '1', '3'], 0, { 1: 'MC-SRCH-02', 2: 'MC-SRCH-02' }, 'It checks 4, then 9 — found after 2 comparisons; it stops at the first match.'),
  tf('V4_T12_SRT_01', 'T12', 1, 'MC-SORT-01', 'After one complete pass of a bubble sort, the list is always fully sorted.', false, 'One pass only guarantees the largest value has reached the end.'),
  mc('V4_T12_SRT_02', 'T12', 2, 'MC-SORT-01', 'A bubble sort puts [4, 1, 3, 2] into ascending order. What is the list after the FIRST pass?', ['[1, 3, 2, 4]', '[1, 2, 3, 4]', '[1, 4, 3, 2]', '[4, 1, 2, 3]'], 0, { 1: 'MC-SORT-01', 2: 'MC-SORT-01' }, '4↔1 → [1,4,3,2]; 4↔3 → [1,3,4,2]; 4↔2 → [1,3,2,4].'),
  // ── T13 Boolean logic ──
  mc('V4_T13_LOG_01', 'T13', 1, 'MC-LOGIC-01', 'A = 0 and B = 1. What is A OR B?', ['1', '0', 'Undefined', 'Same as A AND B'], 0, { 1: 'MC-LOGIC-01' }, 'OR is 1 when at least one input is 1.'),
  mc('V4_T13_LOG_02', 'T13', 2, 'MC-LOGIC-02', 'Which expression is equivalent to NOT(A OR B)?', ['NOT A AND NOT B', 'NOT A OR NOT B', 'A AND B', 'NOT A OR B'], 0, { 1: 'MC-LOGIC-02' }, 'De Morgan: NOT(A OR B) = NOT A AND NOT B.'),
  tf('V4_T13_LOG_03', 'T13', 2, 'MC-LOGIC-02', 'NOT(A AND B) is the same as NOT A AND NOT B.', false, 'NOT(A AND B) = NOT A OR NOT B. Check with A = 1, B = 0.'),
  mc('V4_T13_LOG_04', 'T13', 1, 'MC-LOGIC-03', 'What is A XOR B when A = 1 and B = 1?', ['0', '1', '2', 'Undefined'], 0, { 1: 'MC-LOGIC-03' }, 'XOR is 1 only when the inputs are different.'),
  { id: 'V4_T13_LOG_05', type: 'multi', chapter_id: 'T13', difficulty: 2, misconception_tag: 'MC-LOGIC-03', text: 'Select ALL the input pairs (A, B) for which A XOR B = 1.',
    options: ['A = 0, B = 0', 'A = 0, B = 1', 'A = 1, B = 0', 'A = 1, B = 1'], answer: [1, 2], option_misconceptions: { 3: 'MC-LOGIC-03' }, marks: 2, explanation: 'Only the pairs where the inputs differ.', source: S },
  mc('V4_T13_LOG_06', 'T13', 1, 'MC-LOGIC-04', 'How many rows (not counting the heading) does a truth table for a circuit with 3 inputs need?', ['8', '6', '3', '9'], 0, { 1: 'MC-LOGIC-04' }, '2³ = 8 combinations.'),
  { id: 'V4_T13_LOG_07', type: 'gap', chapter_id: 'T13', difficulty: 2, misconception_tag: 'MC-LOGIC-04', text: 'A truth table for a circuit with 4 inputs has {{1}} rows. A circuit with 2 inputs has {{2}} rows.',
    answer: [['16'], ['4']], marks: 2, explanation: '2⁴ = 16 and 2² = 4.', source: S },
  { id: 'V4_T13_IMG_01', type: 'mcq', chapter_id: 'T13', difficulty: 2, misconception_tag: 'MC-LOGIC-01', group_id: 'G-CIRCUIT-1', stimulus: 'The logic circuit shown gives X = (A AND B) OR C.',
    image_url: '/img/questions/circuit-and-or.svg', image_alt: 'Logic circuit: inputs A and B go into an AND gate; its output and input C go into an OR gate whose output is X.',
    text: 'A = 1, B = 0, C = 0. What is X?', options: ['0', '1'], answer: 0, option_misconceptions: { 1: 'MC-LOGIC-01' }, explanation: 'A AND B = 0; 0 OR 0 = 0.', source: S },
  { id: 'V4_T13_IMG_02', type: 'mcq', chapter_id: 'T13', difficulty: 2, misconception_tag: 'MC-LOGIC-01', group_id: 'G-CIRCUIT-1', stimulus: 'The logic circuit shown gives X = (A AND B) OR C.',
    image_url: '/img/questions/circuit-and-or.svg', image_alt: 'Logic circuit: inputs A and B go into an AND gate; its output and input C go into an OR gate whose output is X.',
    text: 'A = 0, B = 0, C = 1. What is X?', options: ['0', '1'], answer: 1, option_misconceptions: { 0: 'MC-LOGIC-01' }, explanation: 'A AND B = 0; 0 OR 1 = 1.', source: S },
  // ── T01 data representation ──
  { id: 'V4_T01_BIN_01', type: 'short', chapter_id: 'T01', difficulty: 1, misconception_tag: 'MC-BIN-01', text: 'Convert the binary number 01011010 to denary.', answer: ['90'],
    answer_misconceptions: { '45': 'MC-BIN-01', '180': 'MC-BIN-01' }, explanation: '64 + 16 + 8 + 2 = 90.', source: S },
  mc('V4_T01_BIN_02', 'T01', 1, 'MC-BIN-01', 'What is denary 37 as an 8-bit binary number?', ['00100101', '10100100', '00100111', '01000101'], 0, { 1: 'MC-BIN-01', 3: 'MC-BIN-01' }, '37 = 32 + 4 + 1.'),
  mc('V4_T01_HEX_01', 'T01', 2, 'MC-BIN-02', 'What is hexadecimal 3F in denary?', ['63', '315', '48', '52'], 0, { 1: 'MC-BIN-02' }, '3 × 16 + 15 = 63.'),
  mc('V4_T01_HEX_02', 'T01', 2, 'MC-BIN-02', 'What is denary 200 in hexadecimal?', ['C8', '128', '8C', 'B8'], 0, { 1: 'MC-BIN-02', 2: 'MC-BIN-02' }, '200 = 12 × 16 + 8, and 12 is C.'),
  tf('V4_T01_OVF_01', 'T01', 2, 'MC-BIN-03', 'Adding 10000000 and 10000000 in an 8-bit register gives 00000000 and an overflow error.', true, '128 + 128 = 256, which needs 9 bits.'),
  mc('V4_T01_OVF_02', 'T01', 1, 'MC-BIN-03', 'Why does overflow occur when adding two 8-bit binary numbers?', ['The result is greater than 255, so it needs more than 8 bits', 'The result is negative', 'The two numbers have different numbers of 1s', 'Overflow cannot happen in binary addition'], 0, { 3: 'MC-BIN-03' }, 'An 8-bit register can only hold 0–255.'),
  mc('V4_T01_SHF_01', 'T01', 2, 'MC-BIN-04', 'What is 00010110 after a logical left shift of 2 places?', ['01011000', '00000101', '00101100', '10110000'], 0, { 1: 'MC-BIN-04', 3: 'MC-BIN-04' }, 'Each bit moves 2 places left; zeros fill from the right.'),
  tf('V4_T01_SHF_02', 'T01', 2, 'MC-BIN-04', 'A logical right shift of 1 place divides an unsigned binary number by 2 (ignoring any remainder).', true, 'Each place to the right halves the place value.'),
  mc('V4_T01_TWO_01', 'T01', 3, 'MC-BIN-05', "What is the denary value of the 8-bit two's complement number 10000001?", ['-127', '129', '-1', '-126'], 0, { 1: 'MC-BIN-05', 2: 'MC-BIN-05' }, '−128 + 1 = −127.'),
  mc('V4_T01_TWO_02', 'T01', 3, 'MC-BIN-05', "What is −5 as an 8-bit two's complement number?", ['11111011', '10000101', '11111010', '00000101'], 0, { 1: 'MC-BIN-05', 2: 'MC-BIN-05' }, '5 = 00000101; invert → 11111010; add 1 → 11111011.'),
  mc('V4_T01_SND_01', 'T01', 3, 'MC-DREP-01', 'A mono sound is sampled at 44 100 Hz with 16-bit resolution for 10 seconds. What is the file size in bytes?', ['882 000', '7 056 000', '441 000', '88 200 000'], 0, { 1: 'MC-DREP-01', 2: 'MC-DREP-01' }, '44 100 × 16 × 10 = 7 056 000 bits ÷ 8 = 882 000 bytes.'),
  mc('V4_T01_IMG_01', 'T01', 2, 'MC-DREP-01', 'An image is 800 × 600 pixels with a colour depth of 8 bits. What is its file size in bytes?', ['480 000', '3 840 000', '480', '60 000'], 0, { 1: 'MC-DREP-01', 3: 'MC-DREP-01' }, '800 × 600 × 8 = 3 840 000 bits ÷ 8 = 480 000 bytes.'),
  tf('V4_T01_IMG_02', 'T01', 1, 'MC-DREP-02', 'Increasing the colour depth of an image increases the number of pixels in the image.', false, 'Colour depth is bits per pixel; the number of pixels is the resolution.'),
  tf('V4_T01_CMP_01', 'T01', 1, 'MC-DREP-03', 'Lossless compression permanently removes some of the data from a file.', false, 'Lossless compression allows the original to be reconstructed exactly.'),
  mc('V4_T01_CMP_02', 'T01', 2, 'MC-DREP-03', 'Which file should be compressed with LOSSLESS rather than lossy compression?', ['A program source code file', 'A photo for a website', 'A music track for streaming', 'A video clip for social media'], 0, {}, 'Losing any character would break the program, so lossless is required.'),
  // ── T03 hardware ──
  mc('V4_T03_STO_01', 'T03', 1, 'MC-ARCH-01', 'Which type of memory is volatile?', ['RAM', 'ROM', 'SSD', 'Hard disk drive'], 0, { 1: 'MC-ARCH-01', 2: 'MC-ARCH-01', 3: 'MC-ARCH-01' }, 'RAM loses its contents when the power is turned off.'),
  mc('V4_T03_STO_02', 'T03', 1, 'MC-ARCH-02', 'Where must a program be loaded so that the CPU can run it?', ['RAM', 'Hard disk drive', 'USB flash drive', 'Optical disc'], 0, { 1: 'MC-ARCH-02', 2: 'MC-ARCH-02', 3: 'MC-ARCH-02' }, 'The CPU fetches instructions from primary memory (RAM).'),
  tf('V4_T03_STO_03', 'T03', 1, 'MC-ARCH-02', 'An SSD is an example of primary storage.', false, 'An SSD is secondary storage; primary storage is RAM, ROM and cache.'),
  mc('V4_T03_FDE_01', 'T03', 2, 'MC-ARCH-03', 'What does the Program Counter (PC) hold?', ['The address of the next instruction to be fetched', 'The instruction currently being executed', 'The data fetched from memory', 'The result of a calculation'], 0, { 1: 'MC-ARCH-03', 2: 'MC-ARCH-03', 3: 'MC-ARCH-03' }, 'The PC holds an address; the CIR holds the current instruction.'),
  mc('V4_T03_FDE_02', 'T03', 2, 'MC-ARCH-03', 'Which register holds the address of the memory location being read from or written to?', ['MAR', 'MDR', 'CIR', 'ACC'], 0, { 1: 'MC-ARCH-03', 2: 'MC-ARCH-03' }, 'Memory Address Register.'),
  mc('V4_T03_NET_01', 'T03', 1, 'MC-NET-02', 'Which device forwards data between devices on the SAME local network using MAC addresses?', ['Switch', 'Router', 'Modem', 'Proxy server'], 0, { 1: 'MC-NET-02' }, 'Switches work within a network; routers connect networks.'),
  // ── T04 software ──
  tf('V4_T04_TRN_01', 'T04', 1, 'MC-SW-01', 'An interpreter produces an executable file that can run without the interpreter.', false, 'That describes a compiler.'),
  mc('V4_T04_TRN_02', 'T04', 1, 'MC-SW-01', 'Which translator reports errors only after attempting to translate the whole program?', ['Compiler', 'Interpreter', 'Assembler', 'Linker'], 0, { 1: 'MC-SW-01' }, 'An interpreter stops at the first error it meets while running.'),
  mc('V4_T04_LNG_01', 'T04', 2, 'MC-SW-02', 'Why might a programmer use a low-level language for a washing-machine controller?', ['Direct control of the hardware and efficient use of limited memory', 'It is easier to debug than a high-level language', 'It runs on any type of processor', 'It has more built-in libraries'], 0, { 1: 'MC-SW-02', 2: 'MC-SW-02' }, 'Low-level code is processor-specific but gives precise hardware control.'),
  // ── T02 data transmission ──
  tf('V4_T02_PKT_01', 'T02', 1, 'MC-NET-03', 'In packet switching, all the packets of a file travel along the same route and arrive in order.', false, 'Packets can take different routes and arrive out of order.'),
  mc('V4_T02_PKT_02', 'T02', 1, 'MC-NET-03', 'Why does a packet header contain a packet number?', ['So the packets can be put back in the correct order', 'So all packets travel the same route', 'To encrypt the packet', 'To detect viruses'], 0, { 1: 'MC-NET-03' }, 'The receiver uses it to reassemble the data.'),
  mc('V4_T02_PKT_03', 'T02', 2, 'MC-NET-03', 'What happens to the packets of one message in packet switching?', ['Each packet may take a different route and they are reassembled at the destination', 'They wait until one route is free and then travel together', 'They are joined into one large packet by the first router', 'They are sent one at a time only after the previous packet arrives'], 0, { 1: 'MC-NET-03', 2: 'MC-NET-03' }, 'Routers choose a route for each packet independently.'),
  mc('V4_T02_ERR_01', 'T02', 2, 'MC-NET-04', 'Even parity is used. What is the parity bit for the 7 data bits 1011001?', ['0', '1'], 0, { 1: 'MC-NET-04' }, 'There are four 1s, which is already even, so the parity bit is 0.'),
  tf('V4_T02_ERR_02', 'T02', 1, 'MC-NET-04', 'A checksum can correct errors in transmitted data.', false, 'A checksum detects that an error has occurred; the data must be re-sent.'),
  mc('V4_T02_ERR_03', 'T02', 2, 'MC-NET-04', 'Which describes an echo check?', ['The receiver sends the data back and the sender compares it with the original', 'The receiver calculates a value from the data and compares it with a value sent', 'A digit calculated from the other digits is added to a number', 'An extra bit is added to make the number of 1s even'], 0, { 1: 'MC-NET-04', 2: 'MC-NET-04', 3: 'MC-NET-04' }, 'The other options describe a checksum, a check digit and a parity check.'),
  mc('V4_T02_TRN_01', 'T02', 1, 'MC-NET-05', 'Data can be sent in both directions at the same time. This is:', ['Full-duplex', 'Half-duplex', 'Parallel', 'Serial'], 0, { 1: 'MC-NET-05', 2: 'MC-NET-05', 3: 'MC-NET-05' }, 'Serial/parallel is about the number of wires, not direction.'),
  tf('V4_T02_ENC_01', 'T02', 1, 'MC-SEC-03', 'Encrypting data before it is transmitted stops it from being intercepted.', false, 'It can still be intercepted, but cannot be understood without the key.'),
  mc('V4_T02_ENC_02', 'T02', 1, 'MC-SEC-03', 'Encrypted data is intercepted during transmission. What is the effect of the encryption?', ['The data cannot be understood without the key', 'The data could not have been intercepted', 'The data is deleted automatically', 'The data is sent back to the sender'], 0, { 1: 'MC-SEC-03' }, 'Encryption protects meaning, not access.'),
  // ── T05 internet and cyber security ──
  tf('V4_T03_ADR_01', 'T03', 1, 'MC-NET-01', 'A device\'s MAC address changes each time it joins a different network.', false, 'The MAC address is fixed by the manufacturer; the IP address can change.'),
  mc('V4_T05_MAL_01', 'T05', 1, 'MC-SEC-01', 'Which malware encrypts a user\'s files and demands payment?', ['Ransomware', 'Spyware', 'Adware', 'Worm'], 0, { 1: 'MC-SEC-01', 2: 'MC-SEC-01', 3: 'MC-SEC-01' }, 'Ransomware holds the data to ransom.'),
  mc('V4_T05_MAL_02', 'T05', 2, 'MC-SEC-01', 'Which malware replicates itself across a network without needing to attach to a host file?', ['Worm', 'Trojan horse', 'Virus', 'Spyware'], 0, { 1: 'MC-SEC-01', 2: 'MC-SEC-01' }, 'A virus needs a host file; a worm spreads on its own.'),
  tf('V4_T05_FW_01', 'T05', 1, 'MC-SEC-02', 'A firewall removes viruses from infected files.', false, 'A firewall filters traffic. Anti-malware software removes malware.'),
  // ── T06 automated and emerging ──
  mc('V4_T06_AUT_01', 'T06', 1, 'MC-AUTO-01', 'In an automatic greenhouse, what compares the temperature reading with the stored value?', ['The microprocessor', 'The temperature sensor', 'The actuator', 'The heater'], 0, { 1: 'MC-AUTO-01', 2: 'MC-AUTO-01' }, 'Sensors measure; the microprocessor decides; actuators act.'),
  tf('V4_T06_AUT_02', 'T06', 1, 'MC-AUTO-01', 'In an automated system, the sensor decides when to switch on the actuator.', false, 'The microprocessor makes the decision.'),
  tf('V4_T06_AI_01', 'T06', 1, 'MC-AUTO-02', 'A traffic light that changes every 60 seconds on a fixed timer is an example of machine learning.', false, 'It follows a fixed rule and does not learn from data.'),
  // ── T14 databases ──
  mc('V4_T14_KEY_01', 'T14', 1, 'MC-DB-01', 'Table STUDENT has fields StudentID, Surname, DateOfBirth and Class. Which is the most suitable primary key?', ['StudentID', 'Surname', 'DateOfBirth', 'Class'], 0, { 1: 'MC-DB-01', 2: 'MC-DB-01', 3: 'MC-DB-01' }, 'Only StudentID is guaranteed to be unique.'),
  tf('V4_T14_KEY_02', 'T14', 1, 'MC-DB-01', 'Two records may have the same primary key value as long as their other fields are different.', false, 'A primary key must be unique for every record.'),
  mc('V4_T14_REC_01', 'T14', 1, 'MC-DB-02', 'A database table has 5 fields and 30 records. How many rows of data does it contain?', ['30', '5', '150', '35'], 0, { 1: 'MC-DB-02', 2: 'MC-DB-02' }, 'Each record is one row.'),
  mc('V4_T14_REC_02', 'T14', 1, 'MC-DB-02', 'A field is:', ['One item of data stored about every record, shown as a column', 'One complete row of the table', 'The whole table', 'The primary key only'], 0, { 1: 'MC-DB-02', 2: 'MC-DB-02' }, 'Fields are columns; records are rows.'),
  mc('V4_T14_TYP_01', 'T14', 1, 'MC-DB-03', 'Which data type should be used for a PhoneNumber field such as 0244123456?', ['Text', 'Integer', 'Real', 'Boolean'], 0, { 1: 'MC-DB-03', 2: 'MC-DB-03' }, 'Text keeps the leading zero.'),
  tf('V4_T14_TYP_02', 'T14', 2, 'MC-DB-03', 'Dates should be stored as text so that they sort correctly.', false, 'Text sorts character by character ("10/01" before "9/12"); a Date/Time type sorts by date.'),
  mc('V4_T14_SQL_01', 'T14', 2, 'MC-DB-04', 'Which SQL statement shows the Name of every student in class 10B?',
    ["SELECT Name FROM Student WHERE Class = '10B';", "SELECT Class = '10B' FROM Student;", "SELECT Name FROM Student ORDER BY '10B';", "SELECT Student FROM Name WHERE Class = '10B';"], 0, { 1: 'MC-DB-04', 2: 'MC-DB-04', 3: 'MC-DB-04' }, 'SELECT chooses fields, FROM chooses the table, WHERE chooses records.'),
  mc('V4_T14_SQL_02', 'T14', 1, 'MC-DB-04', 'Which SQL clause sorts the results?', ['ORDER BY', 'WHERE', 'SELECT', 'FROM'], 0, { 1: 'MC-DB-04' }, 'ORDER BY sorts; WHERE filters.'),
  // ── Structured (manual marking with keyword assistance) ──
  { id: 'V4_T09_STR_01', type: 'structured', chapter_id: 'T09', difficulty: 2, misconception_tag: null, marks: 3,
    text: 'A program stores the test marks of 30 students.', parts: [
      { prompt: '(a) State a suitable data type for one mark.', marks: 1, keywords: ['integer'], mark_scheme: 'INTEGER (accept REAL if half marks are possible).' },
      { prompt: '(b) Explain why an array is used instead of 30 separate variables.', marks: 2, keywords: ['loop', 'index', 'one name', 'single identifier', 'easier', 'iterate'], mark_scheme: 'One identifier for all values (1); can be processed with a loop using the index (1).' }],
    explanation: 'An array groups related data under one identifier so that it can be processed with a loop.', source: S },

  // ── Additional opportunities so each misconception has at least three items ──
  mc('V4_T08_SEL_07', 'T08', 2, 'MC-SEL-02', 'Discounts: 20% for 100 items or more, 10% for 50 or more. Which algorithm gives the right discount for 120 items?',
    ['IF Items >= 50 THEN Discount ← 10 ELSE IF Items >= 100 THEN Discount ← 20', 'IF Items >= 100 THEN Discount ← 20 ELSE IF Items >= 50 THEN Discount ← 10', 'Either — both give 20 for 120 items', 'Neither — CASE OF must be used'], 1, { 0: 'MC-SEL-02', 2: 'MC-SEL-02' }, 'Test the stricter condition (≥ 100) first.'),
  mc('V4_T08_SEL_08', 'T08', 2, 'MC-SEL-03', 'Which CASE OF clause correctly handles every Choice that is not 1, 2 or 3?', ['OTHERWISE : OUTPUT "Invalid"', 'ELSE : OUTPUT "Invalid"', 'DEFAULT OUTPUT "Invalid"', 'Nothing is needed — unlisted values are ignored safely'], 0, { 1: 'MC-SEL-03', 3: 'MC-SEL-03' }, 'Cambridge pseudocode uses OTHERWISE.'),
  co('V4_T08_STR_05', 'T08', 1, 'MC-STR-02', 'What is output?', 'First ← "Ada"\nLast ← "Lovelace"\nOUTPUT First & " " & Last', ['Ada Lovelace', 'AdaLovelace', 'First Last', 'Ada & Lovelace'], 0, { 1: 'MC-STR-02' }, 'The space appears only because " " is concatenated between the names.'),
  co('V4_T07_ALG_04', 'T07', 1, 'MC-ALG-02', 'What is output?', 'A ← 1\nB ← A + 1\nA ← 10\nOUTPUT B', ['2', '11', '10', '1'], 0, { 1: 'MC-ALG-02' }, 'B was calculated when A was 1; changing A later does not recalculate B.'),
  co('V4_T07_ALG_05', 'T07', 2, 'MC-ALG-02', 'What is output?', 'Count ← 0\nOUTPUT Count\nFOR I ← 1 TO 3\n   Count ← Count + 1\nNEXT I', ['0', '3', '0 1 2 3', '1 2 3'], 0, { 1: 'MC-ALG-02', 2: 'MC-TRACE-01' }, 'The OUTPUT runs before the loop, so it shows 0.'),
  mc('V4_T07_VAL_03', 'T07', 1, 'MC-TEST-02', 'A form rejects a date of birth in the future. This is an example of:', ['Validation', 'Verification', 'Encryption', 'A checksum'], 0, { 1: 'MC-TEST-02' }, 'It checks the data is reasonable against a rule.'),
  mc('V4_T12_SRC_04', 'T12', 1, 'MC-SRCH-02', 'When does a linear search for a value that IS in the list stop?', ['As soon as the value is found', 'Only after every item has been checked', 'After half of the items', 'When it reaches the middle item'], 0, { 1: 'MC-SRCH-02', 3: 'MC-SRCH-01' }, 'A linear search checks items in order and stops at the first match.'),
  tf('V4_T13_LOG_08', 'T13', 1, 'MC-LOGIC-03', 'XOR gives 1 when both of its inputs are 1.', false, 'XOR gives 0 when the inputs are the same.'),
  tf('V4_T13_LOG_09', 'T13', 1, 'MC-LOGIC-04', 'A truth table for a circuit with 3 inputs needs 6 rows of input combinations.', false, '2³ = 8 rows.'),
  mc('V4_T01_IMG_03', 'T01', 1, 'MC-DREP-02', 'Resolution is:', ['The number of pixels in an image (width × height)', 'The number of bits used for each pixel', 'The smallest element of an image', 'The number of colours in the palette'], 0, { 1: 'MC-DREP-02', 2: 'MC-DREP-02', 3: 'MC-DREP-02' }, 'Colour depth is bits per pixel; a pixel is one element.'),
  tf('V4_T03_STO_04', 'T03', 1, 'MC-ARCH-01', 'Non-volatile means the storage device can be removed from the computer.', false, 'Non-volatile means data is kept when power is lost.'),
  mc('V4_T03_STO_05', 'T03', 1, 'MC-ARCH-02', 'Which is an example of primary storage?', ['ROM', 'SSD', 'Hard disk drive', 'DVD'], 0, { 1: 'MC-ARCH-02', 2: 'MC-ARCH-02', 3: 'MC-ARCH-02' }, 'RAM, ROM and cache are directly accessed by the CPU.'),
  tf('V4_T03_FDE_03', 'T03', 2, 'MC-ARCH-03', 'The Current Instruction Register (CIR) holds the address of the next instruction.', false, 'The PC holds that address; the CIR holds the instruction being decoded and executed.'),
  tf('V4_T03_NET_02', 'T03', 1, 'MC-NET-02', 'A switch is used to connect a school network to the internet.', false, 'A router connects different networks; a switch connects devices within a network.'),
  mc('V4_T02_TRN_02', 'T02', 2, 'MC-NET-05', 'A walkie-talkie lets only one person speak at a time, in either direction. This is:', ['Half-duplex', 'Full-duplex', 'Simplex', 'Parallel'], 0, { 1: 'MC-NET-05', 3: 'MC-NET-05' }, 'Both directions, but not at the same time.'),
  tf('V4_T02_TRN_03', 'T02', 1, 'MC-NET-05', 'Parallel transmission means data is sent in both directions at the same time.', false, 'Parallel means several bits are sent at once over several wires; both directions at once is full-duplex.'),
  mc('V4_T05_FW_02', 'T05', 2, 'MC-SEC-02', 'What does a firewall do?', ['Examines traffic and blocks it if it breaks set rules', 'Removes malware from infected files', 'Encrypts all data on the computer', 'Hides the user\'s IP address by sending requests on their behalf'], 0, { 1: 'MC-SEC-02', 3: 'MC-SEC-02' }, 'Hiding the IP address is what a proxy server does.'),
  mc('V4_T02_ENC_03', 'T02', 1, 'MC-SEC-03', 'Why is data encrypted before it is sent over the internet?', ['So that if it is intercepted it cannot be understood', 'So that it cannot be intercepted', 'So that it travels faster', 'So that errors are detected'], 0, { 1: 'MC-SEC-03' }, 'Interception is still possible.'),
  mc('V4_T06_AI_02', 'T06', 2, 'MC-AUTO-02', 'Which is an example of machine learning?', ['A system that recommends videos and improves as it learns what you watch', 'A calculator adding two numbers', 'A washing machine following a fixed programme', 'A spreadsheet formula'], 0, { 1: 'MC-AUTO-02', 2: 'MC-AUTO-02', 3: 'MC-AUTO-02' }, 'It improves from data without being reprogrammed.'),
  mc('V4_T14_KEY_03', 'T14', 2, 'MC-DB-01', 'Why is Surname a poor choice of primary key?', ['Two records can have the same surname', 'Surnames are stored as text', 'Surnames are too short', 'Surnames cannot be sorted'], 0, { 1: 'MC-DB-01' }, 'A primary key must be unique for every record.'),
  tf('V4_T14_REC_03', 'T14', 1, 'MC-DB-02', 'A record is one column of a database table.', false, 'A record is a row; a field is a column.'),
  mc('V4_T14_TYP_03', 'T14', 2, 'MC-DB-03', 'Which data type is most suitable for a field storing whether a fee has been paid?', ['Boolean', 'Text', 'Integer', 'Date/Time'], 0, { 1: 'MC-DB-03', 2: 'MC-DB-03' }, 'Yes/No values need a Boolean field.'),
  mc('V4_T14_SQL_03', 'T14', 2, 'MC-DB-04', "What does WHERE Age > 15 do in SELECT Name FROM Student WHERE Age > 15;?", ['Selects only the records where Age is greater than 15', 'Sorts the results by Age', 'Shows the Age field', 'Counts the students over 15'], 0, { 1: 'MC-DB-04', 2: 'MC-DB-04' }, 'WHERE filters records.'),
];


export const QUESTION_BANK = [...fromV3, ...NEW];
export const BANK_VERSION = '4.0';
