import test from 'node:test';
import assert from 'node:assert/strict';
import { runPseudocode, runTests } from '../../public/js/engine/pseudocode/interpreter.js';

const out = async (code, opts) => { const r = await runPseudocode(code, opts); if (r.error) throw new Error(`line ${r.error.line}: ${r.error.message}`); return r.output; };

// The 12-program reference suite used in the audit (both v3 and WOW Sir interpreters failed most of it).
test('reference suite: sum loop with multi-variable DECLARE', async () => {
  assert.deepEqual(await out(`DECLARE A : ARRAY[1:3] OF INTEGER\nDECLARE T, I : INTEGER\nA[1] ← 3\nA[2] ← 1\nA[3] ← 2\nT ← 0\nFOR I ← 1 TO 3\n  T ← T + A[I]\nNEXT I\nIF T = 6 THEN\n  OUTPUT "Sum ", T\nENDIF`), ['Sum 6']);
});
test('reference suite: function defined before use', async () => {
  assert.deepEqual(await out(`FUNCTION Sq(X : INTEGER) RETURNS INTEGER\n  RETURN X * X\nENDFUNCTION\nOUTPUT Sq(4)`), ['16']);
});
test('function defined after use (hoisted)', async () => {
  assert.deepEqual(await out(`OUTPUT Sq(5)\nFUNCTION Sq(X : INTEGER) RETURNS INTEGER\n  RETURN X * X\nENDFUNCTION`), ['25']);
});
test('reference suite: built-ins', async () => {
  assert.deepEqual(await out(`OUTPUT LENGTH("hello"), " ", 7 MOD 3, " ", 7 DIV 2, " ", UCASE("ab"), " ", SUBSTRING("Computer", 1, 3)`), ['5 1 3 AB Com']);
  assert.deepEqual(await out(`OUTPUT DIV(17, 5), MOD(17, 5), ROUND(3.456, 1), INT(3.9)`), ['323.53']);
});
test('reference suite: WHILE … DO', async () => {
  assert.deepEqual(await out(`DECLARE C : INTEGER\nC ← 1\nWHILE C <= 3 DO\n  OUTPUT C\n  C ← C + 1\nENDWHILE`), ['1', '2', '3']);
});
test('reference suite: REPEAT … UNTIL', async () => {
  assert.deepEqual(await out(`DECLARE N : INTEGER\nN ← 0\nREPEAT\n  N ← N + 2\nUNTIL N >= 6\nOUTPUT N`), ['6']);
});
test('reference suite: CASE OF with OTHERWISE and ranges', async () => {
  const code = `DECLARE G : CHAR\nG ← 'B'\nCASE OF G\n  'A' : OUTPUT "Top"\n  'B' : OUTPUT "Good"\n  OTHERWISE OUTPUT "Other"\nENDCASE`;
  assert.deepEqual(await out(code), ['Good']);
  assert.deepEqual(await out(`M ← 75\nCASE OF M\n  0 TO 49 : OUTPUT "F"\n  50 TO 79 : OUTPUT "P"\n            OUTPUT "two lines"\n  OTHERWISE : OUTPUT "D"\nENDCASE`), ['P', 'two lines']);
});
test('reference suite: procedure', async () => {
  assert.deepEqual(await out(`PROCEDURE Hi(Name : STRING)\n  OUTPUT "Hi ", Name\nENDPROCEDURE\nCALL Hi("Ama")`), ['Hi Ama']);
});
test('reference suite: nested loops', async () => {
  assert.deepEqual(await out(`DECLARE I, J : INTEGER\nFOR I ← 1 TO 2\n  FOR J ← 1 TO 2\n    OUTPUT I * J\n  NEXT J\nNEXT I`), ['1', '2', '2', '4']);
});
test('reference suite: bubble sort', async () => {
  assert.deepEqual(await out(`DECLARE A : ARRAY[1:4] OF INTEGER\nDECLARE Temp, I, J : INTEGER\nA[1] ← 4\nA[2] ← 3\nA[3] ← 1\nA[4] ← 2\nFOR I ← 1 TO 3\n  FOR J ← 1 TO 4 - I\n    IF A[J] > A[J + 1] THEN\n      Temp ← A[J]\n      A[J] ← A[J + 1]\n      A[J + 1] ← Temp\n    ENDIF\n  NEXT J\nNEXT I\nOUTPUT A[1], A[2], A[3], A[4]`), ['1234']);
});
test('reference suite: IF/ELSE and AND', async () => {
  assert.deepEqual(await out(`DECLARE X : INTEGER\nX ← 5\nIF X > 10 THEN\n  OUTPUT "big"\nELSE\n  OUTPUT "small"\nENDIF\nOUTPUT X > 3 AND X < 9`), ['small', 'TRUE']);
});
test('reference suite: 2D array and REAL', async () => {
  assert.deepEqual(await out(`DECLARE T : ARRAY[1:2, 1:2] OF INTEGER\nT[1,2] ← 7\nOUTPUT T[1,2]`), ['7']);
  assert.deepEqual(await out(`DECLARE R : REAL\nR ← 7 / 2\nOUTPUT R`), ['3.5']);
});

test('ASCII arrow <- and several statements on one line (v3 templates)', async () => {
  assert.deepEqual(await out(`DECLARE A : ARRAY[1:3] OF INTEGER\nA[1]<-64  A[2]<-34  A[3]<-25\nOUTPUT A[1] + A[2] + A[3]`), ['123']);
});
test('ELSE IF needs its own ENDIF and works', async () => {
  assert.deepEqual(await out(`M ← 55\nIF M >= 70 THEN\n OUTPUT "A"\nELSE IF M >= 50 THEN\n OUTPUT "B"\n ELSE\n OUTPUT "C"\n ENDIF\nENDIF`), ['B']);
});
test('INPUT with typed conversion and errors', async () => {
  assert.deepEqual(await out(`DECLARE N : INTEGER\nINPUT N\nOUTPUT N * 2`, { inputs: ['21'] }), ['42']);
  const r = await runPseudocode(`DECLARE N : INTEGER\nINPUT N`, { inputs: ['abc'] });
  assert.match(r.error.message, /not a whole number/);
});
test('type errors are reported with line numbers', async () => {
  const r = await runPseudocode(`DECLARE N : INTEGER\nN ← 3.5`);
  assert.equal(r.error.line, 2); assert.match(r.error.message, /fractional part/);
});
test('= used for assignment gives a teaching error', async () => {
  const r = await runPseudocode(`X = 5`);
  assert.match(r.error.message, /Use ← for assignment/);
});
test('PRINT is rejected with the Cambridge keyword', async () => {
  const r = await runPseudocode(`PRINT "hi"`);
  assert.match(r.error.message, /use OUTPUT/);
});
test('array bounds checking and missing bounds', async () => {
  let r = await runPseudocode(`DECLARE A : ARRAY[1:3] OF INTEGER\nA[4] ← 1`);
  assert.match(r.error.message, /outside the bounds/);
  r = await runPseudocode(`DECLARE A : ARRAY[10] OF INTEGER`);
  assert.match(r.error.message, /lower and upper bound/);
});
test('infinite loop guard', async () => {
  const r = await runPseudocode(`N ← 1\nWHILE N <= 10 DO\n OUTPUT N\nENDWHILE`, { maxSteps: 5000 });
  assert.match(r.error.message, /infinite loop/);
});
test('local scope does not change globals; BYREF does', async () => {
  assert.deepEqual(await out(`X ← 1\nPROCEDURE Change()\n   DECLARE X : INTEGER\n   X ← 5\nENDPROCEDURE\nCALL Change()\nOUTPUT X`), ['1']);
  assert.deepEqual(await out(`PROCEDURE Inc(BYREF N : INTEGER)\n  N ← N + 1\nENDPROCEDURE\nDECLARE C : INTEGER\nC ← 1\nCALL Inc(C)\nOUTPUT C`), ['2']);
});
test('function without RETURN is an error explaining OUTPUT vs RETURN', async () => {
  const r = await runPseudocode(`FUNCTION F(A : INTEGER) RETURNS INTEGER\n  OUTPUT A\nENDFUNCTION\nX ← F(3)`);
  assert.match(r.error.message, /must RETURN a value/);
});
test('constants cannot be reassigned', async () => {
  const r = await runPseudocode(`CONSTANT Rate ← 0.15\nRate ← 0.2`);
  assert.match(r.error.message, /CONSTANT/);
});
test('file handling with virtual files and EOF', async () => {
  const code = `OPENFILE "names.txt" FOR READ\nDECLARE Line : STRING\nWHILE NOT EOF("names.txt")\n   READFILE "names.txt", Line\n   OUTPUT Line\nENDWHILE\nCLOSEFILE "names.txt"`;
  assert.deepEqual(await out(code, { files: { 'names.txt': ['Ama', 'Kofi'] } }), ['Ama', 'Kofi']);
  const r = await runPseudocode(`OPENFILE "o.txt" FOR WRITE\nWRITEFILE "o.txt", "x"\nCLOSEFILE "o.txt"`);
  assert.deepEqual(r.files['o.txt'], ['x']);
});
test('trace records each assignment', async () => {
  const r = await runPseudocode(`X ← 2\nX ← X * 3\nX ← X - 1`, { trace: true });
  assert.deepEqual(r.trace.map(t => t.value), ['2', '6', '5']);
});
test('runTests: token-aware matching (Valid vs Invalid, 2 vs 20)', async () => {
  const sol = `DECLARE Num : INTEGER\nINPUT Num\nIF Num >= 1 AND Num <= 100 THEN\n   OUTPUT "Valid"\nELSE\n   OUTPUT "Invalid"\nENDIF`;
  const t = [{ inputs: ['1'], expect_contains: ['Valid'], expect_not_contains: ['Invalid'] }, { inputs: ['0'], expect_contains: ['Invalid'] }];
  assert.equal((await runTests(sol, t)).passed, 2);
  const wrong = sol.replace('>= 1', '> 1');
  assert.equal((await runTests(wrong, t)).passed, 1);
});
