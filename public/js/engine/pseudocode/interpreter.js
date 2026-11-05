// js/engine/pseudocode/interpreter.js
// Cambridge IGCSE (0478) / AS (9618) pseudocode interpreter.
// Tokenizer → recursive-descent parser → AST → async tree-walking evaluator.
//
// Replaces v3 js/interpreter.js, which failed multi-variable DECLARE, functions,
// WHILE … DO and REPEAT … UNTIL (see docs/TECHNICAL_AUDIT.md §3.6).
//
// Usage:
//   const r = await runPseudocode(code, { inputs: ['5', '7'], files: { 'a.txt': ['x'] }, trace: true });
//   r.output  -> array of output lines
//   r.error   -> { line, message } | null
//   r.trace   -> [{ line, name, value }]   (when trace: true)

const KEYWORDS = new Set(['DECLARE', 'CONSTANT', 'ARRAY', 'OF', 'INPUT', 'OUTPUT', 'IF', 'THEN', 'ELSE', 'ENDIF', 'CASE', 'OTHERWISE', 'ENDCASE',
  'FOR', 'TO', 'STEP', 'NEXT', 'WHILE', 'DO', 'ENDWHILE', 'REPEAT', 'UNTIL', 'PROCEDURE', 'ENDPROCEDURE', 'FUNCTION', 'ENDFUNCTION', 'RETURNS',
  'RETURN', 'CALL', 'BYREF', 'BYVAL', 'AND', 'OR', 'NOT', 'DIV', 'MOD', 'TRUE', 'FALSE', 'OPENFILE', 'READFILE', 'WRITEFILE', 'CLOSEFILE',
  'READ', 'WRITE', 'APPEND', 'INTEGER', 'REAL', 'STRING', 'CHAR', 'BOOLEAN', 'DATE']);
const TYPES = new Set(['INTEGER', 'REAL', 'STRING', 'CHAR', 'BOOLEAN', 'DATE']);
const NOT_CAMBRIDGE = { PRINT: 'OUTPUT', DISPLAY: 'OUTPUT', ELSEIF: 'ELSE IF … ENDIF', ENDFOR: 'NEXT', WEND: 'ENDWHILE', GET: 'INPUT' };

export class PseudoError extends Error { constructor(message, line) { super(message); this.line = line; } }

// ── Tokenizer ──────────────────────────────────────────────────────────
export function tokenize(src) {
  const toks = []; let i = 0, line = 1;
  const s = String(src).replace(/\r\n?/g, '\n').replace(/\t/g, '   ');
  const push = (type, value, extra = {}) => toks.push({ type, value, line, ...extra });
  while (i < s.length) {
    const c = s[i];
    if (c === '\n') { push('NL', '\n'); line++; i++; continue; }
    if (c === ' ' || c === ' ') { i++; continue; }
    if (c === '/' && s[i + 1] === '/') { while (i < s.length && s[i] !== '\n') i++; continue; }
    if (c === '"' || c === '“' || c === '”') {
      let j = i + 1, v = '';
      while (j < s.length && s[j] !== '"' && s[j] !== '”' && s[j] !== '\n') v += s[j++];
      if (s[j] !== '"' && s[j] !== '”') throw new PseudoError('String is missing its closing double quote "', line);
      push('STR', v); i = j + 1; continue;
    }
    if (c === "'" || c === '‘' || c === '’') {
      let j = i + 1, v = '';
      while (j < s.length && !["'", '’'].includes(s[j]) && s[j] !== '\n') v += s[j++];
      if (!["'", '’'].includes(s[j])) throw new PseudoError("Character literal is missing its closing quote '", line);
      if (v.length !== 1) throw new PseudoError(`Single quotes are for one CHAR; use double quotes for the string "${v}"`, line);
      push('CHR', v); i = j + 1; continue;
    }
    if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(s[i + 1]))) {
      let j = i; while (j < s.length && /[0-9]/.test(s[j])) j++;
      let isReal = false;
      if (s[j] === '.' && /[0-9]/.test(s[j + 1])) { isReal = true; j++; while (j < s.length && /[0-9]/.test(s[j])) j++; }
      push('NUM', Number(s.slice(i, j)), { real: isReal }); i = j; continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      let j = i; while (j < s.length && /[A-Za-z0-9_]/.test(s[j])) j++;
      const w = s.slice(i, j), up = w.toUpperCase();
      if (KEYWORDS.has(up)) push('KW', up, { raw: w }); else push('ID', w);
      i = j; continue;
    }
    const two = s.slice(i, i + 2);
    if (two === '<-') { push('OP', '←'); i += 2; continue; }
    if (['<=', '>=', '<>'].includes(two)) { push('OP', two); i += 2; continue; }
    if (c === '←') { push('OP', '←'); i++; continue; }
    if (c === '≤') { push('OP', '<='); i++; continue; }
    if (c === '≥') { push('OP', '>='); i++; continue; }
    if (c === '≠') { push('OP', '<>'); i++; continue; }
    if ('=<>+-*/^&()[],:.'.includes(c)) { push('OP', c); i++; continue; }
    throw new PseudoError(`Unexpected character "${c}"`, line);
  }
  push('NL', '\n'); push('EOF', null);
  return toks;
}

// ── Parser ─────────────────────────────────────────────────────────────
class Parser {
  constructor(toks) { this.t = toks; this.p = 0; }
  peek(o = 0) { return this.t[this.p + o]; }
  next() { return this.t[this.p++]; }
  isKW(v, o = 0) { const k = this.peek(o); return k.type === 'KW' && k.value === v; }
  isOP(v, o = 0) { const k = this.peek(o); return k.type === 'OP' && k.value === v; }
  eatKW(v, msg) { if (!this.isKW(v)) throw new PseudoError(msg || `Expected ${v} but found ${this.desc(this.peek())}`, this.peek().line); return this.next(); }
  eatOP(v, msg) { if (!this.isOP(v)) throw new PseudoError(msg || `Expected "${v}" but found ${this.desc(this.peek())}`, this.peek().line); return this.next(); }
  eatID(msg) { const k = this.peek(); if (k.type !== 'ID') throw new PseudoError(msg || `Expected a name but found ${this.desc(k)}`, k.line); return this.next().value; }
  desc(k) { return k.type === 'NL' ? 'end of line' : k.type === 'EOF' ? 'end of program' : `"${k.raw || k.value}"`; }
  skipNL() { while (this.peek().type === 'NL') this.next(); }

  program() { const body = this.block(new Set(['EOF'])); return body; }

  /** Parse statements until one of the terminator keywords (not consumed). */
  block(terms) {
    const out = [];
    this.skipNL();
    while (true) {
      const k = this.peek();
      if (k.type === 'EOF') { if (terms.has('EOF')) return out; throw new PseudoError(`Missing ${[...terms].join(' or ')} before the end of the program`, k.line); }
      if (k.type === 'KW' && terms.has(k.value)) return out;
      if (terms.has('__CASELABEL__') && this.atCaseLabel()) return out;
      out.push(this.statement());
      // Allow several statements on one line (v3 templates do this) — only NL or a new statement may follow
      if (this.peek().type === 'NL') this.skipNL();
    }
  }

  statement() {
    const k = this.peek(), line = k.line;
    if (k.type === 'ID' && NOT_CAMBRIDGE[k.value.toUpperCase()]) throw new PseudoError(`${k.value} is not a Cambridge pseudocode keyword — use ${NOT_CAMBRIDGE[k.value.toUpperCase()]}`, line);
    if (k.type === 'ID') return this.assignment();
    if (k.type !== 'KW') throw new PseudoError(`Unexpected ${this.desc(k)} at the start of a statement`, line);
    switch (k.value) {
      case 'DECLARE': return this.declare();
      case 'CONSTANT': { this.next(); const name = this.eatID(); if (this.isOP('=') || this.isOP('←')) this.next(); else throw new PseudoError('CONSTANT needs ← or = and a value', line); return { k: 'const', name, expr: this.expr(), line }; }
      case 'INPUT': { this.next(); return { k: 'input', target: this.target(), line }; }
      case 'OUTPUT': { this.next(); const items = [this.expr()]; while (this.isOP(',')) { this.next(); items.push(this.expr()); } return { k: 'output', items, line }; }
      case 'IF': return this.ifStmt();
      case 'CASE': return this.caseStmt();
      case 'FOR': return this.forStmt();
      case 'WHILE': { this.next(); const cond = this.expr(); if (this.isKW('DO')) this.next(); const body = this.block(new Set(['ENDWHILE'])); this.eatKW('ENDWHILE'); return { k: 'while', cond, body, line }; }
      case 'REPEAT': { this.next(); const body = this.block(new Set(['UNTIL'])); this.eatKW('UNTIL'); return { k: 'repeat', body, cond: this.expr(), line }; }
      case 'PROCEDURE': case 'FUNCTION': return this.subDef(k.value);
      case 'CALL': { this.next(); const name = this.eatID(); let args = []; if (this.isOP('(')) args = this.args(); return { k: 'call', name, args, line }; }
      case 'RETURN': { this.next(); return { k: 'return', expr: this.expr(), line }; }
      case 'OPENFILE': { this.next(); const file = this.expr(); this.eatKW('FOR', 'OPENFILE needs FOR READ, FOR WRITE or FOR APPEND'); const m = this.next(); if (!(m.type === 'KW' && ['READ', 'WRITE', 'APPEND'].includes(m.value))) throw new PseudoError('File mode must be READ, WRITE or APPEND', line); return { k: 'open', file, mode: m.value, line }; }
      case 'READFILE': { this.next(); const file = this.expr(); this.eatOP(',', 'READFILE needs a file name, a comma, then a variable'); return { k: 'readfile', file, target: this.target(), line }; }
      case 'WRITEFILE': { this.next(); const file = this.expr(); this.eatOP(',', 'WRITEFILE needs a file name, a comma, then the data'); return { k: 'writefile', file, expr: this.expr(), line }; }
      case 'CLOSEFILE': { this.next(); return { k: 'close', file: this.expr(), line }; }
      case 'ENDIF': case 'ENDWHILE': case 'NEXT': case 'UNTIL': case 'ENDCASE': case 'ENDPROCEDURE': case 'ENDFUNCTION': case 'ELSE':
        throw new PseudoError(`${k.value} without a matching opening statement`, line);
      default: throw new PseudoError(`Unexpected keyword ${k.value} at the start of a statement`, line);
    }
  }

  declare() {
    const line = this.next().line; const names = [this.eatID()];
    while (this.isOP(',')) { this.next(); names.push(this.eatID()); }
    this.eatOP(':', 'DECLARE needs a colon and a data type, e.g. DECLARE Score : INTEGER');
    if (this.isKW('ARRAY')) {
      this.next(); this.eatOP('[', 'ARRAY needs bounds, e.g. ARRAY[1:10]');
      const dims = [];
      do {
        if (dims.length) this.next();
        const lo = this.expr();
        if (!this.isOP(':')) throw new PseudoError('Array bounds need a lower and upper bound separated by a colon, e.g. ARRAY[1:10]', line);
        this.next(); const hi = this.expr(); dims.push([lo, hi]);
      } while (this.isOP(','));
      this.eatOP(']'); this.eatKW('OF', 'ARRAY declarations need OF and a type, e.g. ARRAY[1:10] OF INTEGER');
      const type = this.type(line); return { k: 'declare', names, array: dims, type, line };
    }
    return { k: 'declare', names, type: this.type(line), line };
  }
  type(line) { const t = this.next(); if (t.type === 'KW' && TYPES.has(t.value)) return t.value; throw new PseudoError(`Unknown data type ${this.desc(t)} (use INTEGER, REAL, STRING, CHAR or BOOLEAN)`, line); }

  target() {
    const name = this.eatID(); const line = this.peek().line;
    if (this.isOP('[')) { this.next(); const idx = [this.expr()]; while (this.isOP(',')) { this.next(); idx.push(this.expr()); } this.eatOP(']'); return { name, idx, line }; }
    return { name, idx: null, line };
  }
  assignment() {
    const line = this.peek().line; const target = this.target();
    if (this.isOP('=')) throw new PseudoError(`Use ← for assignment, not "=" (write ${target.name} ← …). "=" compares two values.`, line);
    this.eatOP('←', `Expected ← after ${target.name}`);
    return { k: 'assign', target, expr: this.expr(), line };
  }
  ifStmt() {
    const line = this.next().line; const cond = this.expr();
    this.skipNL();
    this.eatKW('THEN', 'IF needs THEN after the condition');
    const then = this.block(new Set(['ELSE', 'ENDIF']));
    let els = [];
    if (this.isKW('ELSE')) {
      this.next();
      if (this.isKW('IF')) { // ELSE IF … : nested IF that shares the outer ENDIF only if the student writes one ENDIF per IF
        els = [this.ifStmt()];
        this.skipNL();
        if (this.isKW('ENDIF')) { this.next(); return { k: 'if', cond, then, els, line }; }
        throw new PseudoError('Each IF needs its own ENDIF (an ELSE IF needs two ENDIFs)', line);
      }
      els = this.block(new Set(['ENDIF']));
    }
    this.eatKW('ENDIF', 'IF is missing ENDIF');
    return { k: 'if', cond, then, els, line };
  }
  atCaseLabel() {
    // a case label: [-] literal [TO [-] literal] ':'
    let o = 0;
    const lit = () => { if (this.isOP('-', o)) o++; const k = this.peek(o); if (['NUM', 'STR', 'CHR'].includes(k.type) || (k.type === 'KW' && (k.value === 'TRUE' || k.value === 'FALSE'))) { o++; return true; } return false; };
    if (!lit()) return false;
    while (this.isOP(',', o)) { o++; if (!lit()) return false; }
    if (this.isKW('TO', o)) { o++; if (!lit()) return false; }
    return this.isOP(':', o);
  }
  caseStmt() {
    const line = this.next().line; this.eatKW('OF', 'CASE needs OF, e.g. CASE OF Choice');
    const subject = this.expr(); this.skipNL();
    const clauses = []; let otherwise = null;
    while (!this.isKW('ENDCASE')) {
      if (this.peek().type === 'EOF') throw new PseudoError('CASE is missing ENDCASE', line);
      if (this.isKW('OTHERWISE')) {
        this.next(); if (this.isOP(':')) this.next();
        otherwise = this.block(new Set(['ENDCASE']));
        break;
      }
      if (!this.atCaseLabel()) throw new PseudoError(`Each CASE option must start with a value and a colon, e.g. 'A' : …  (found ${this.desc(this.peek())})`, this.peek().line);
      const values = []; let range = null;
      values.push(this.literal());
      while (this.isOP(',')) { this.next(); values.push(this.literal()); }
      if (this.isKW('TO')) { this.next(); range = [values.pop(), this.literal()]; }
      this.eatOP(':');
      const body = this.block(new Set(['ENDCASE', 'OTHERWISE', '__CASELABEL__']));
      clauses.push({ values, range, body });
    }
    this.eatKW('ENDCASE');
    return { k: 'case', subject, clauses, otherwise, line };
  }
  literal() { let neg = false; if (this.isOP('-')) { this.next(); neg = true; } const k = this.next(); let v = k.type === 'KW' ? k.value === 'TRUE' : k.value; return neg ? -v : v; }
  forStmt() {
    const line = this.next().line; const v = this.eatID(); this.eatOP('←', 'FOR needs ← , e.g. FOR I ← 1 TO 10');
    const from = this.expr(); this.eatKW('TO', 'FOR needs TO, e.g. FOR I ← 1 TO 10'); const to = this.expr();
    let step = null; if (this.isKW('STEP')) { this.next(); step = this.expr(); }
    const body = this.block(new Set(['NEXT'])); this.eatKW('NEXT');
    if (this.peek().type === 'ID') { const n = this.next(); if (n.value.toLowerCase() !== v.toLowerCase()) throw new PseudoError(`NEXT ${n.value} does not match FOR ${v}`, n.line); }
    return { k: 'for', v, from, to, step, body, line };
  }
  subDef(kind) {
    const line = this.next().line; const name = this.eatID(); const params = [];
    if (this.isOP('(')) {
      this.next();
      let mode = 'BYVAL';
      while (!this.isOP(')')) {
        if (this.isKW('BYREF') || this.isKW('BYVAL')) mode = this.next().value;
        const pn = this.eatID(); let type = null;
        if (this.isOP(':')) { this.next(); if (this.isKW('ARRAY')) { this.next(); if (this.isOP('[')) { while (!this.isOP(']')) this.next(); this.next(); } this.eatKW('OF'); } type = this.type(line); }
        params.push({ name: pn, type, byref: mode === 'BYREF' });
        if (this.isOP(',')) this.next(); else if (!this.isOP(')')) throw new PseudoError('Parameters must be separated by commas', line);
      }
      this.next();
    }
    let returns = null;
    if (kind === 'FUNCTION') { this.skipNL(); this.eatKW('RETURNS', 'A FUNCTION header needs RETURNS and a type'); returns = this.type(line); }
    const end = kind === 'FUNCTION' ? 'ENDFUNCTION' : 'ENDPROCEDURE';
    const body = this.block(new Set([end])); this.eatKW(end);
    return { k: 'def', kind, name, params, returns, body, line };
  }
  args() { this.eatOP('('); const a = []; while (!this.isOP(')')) { a.push(this.expr()); if (this.isOP(',')) this.next(); else if (!this.isOP(')')) throw new PseudoError('Arguments must be separated by commas', this.peek().line); } this.next(); return a; }

  // Expressions — precedence: OR < AND < NOT < comparison < & < + - < * / DIV MOD < unary - < ^ < primary
  expr() { return this.or(); }
  or() { let l = this.and(); while (this.isKW('OR')) { const line = this.next().line; l = { k: 'bin', op: 'OR', l, r: this.and(), line }; } return l; }
  and() { let l = this.not(); while (this.isKW('AND')) { const line = this.next().line; l = { k: 'bin', op: 'AND', l, r: this.not(), line }; } return l; }
  not() { if (this.isKW('NOT')) { const line = this.next().line; return { k: 'un', op: 'NOT', e: this.not(), line }; } return this.cmp(); }
  cmp() {
    let l = this.cat();
    while (['=', '<>', '<', '>', '<=', '>='].some(o => this.isOP(o))) { const t = this.next(); l = { k: 'bin', op: t.value, l, r: this.cat(), line: t.line }; }
    return l;
  }
  cat() { let l = this.add(); while (this.isOP('&')) { const line = this.next().line; l = { k: 'bin', op: '&', l, r: this.add(), line }; } return l; }
  add() { let l = this.mul(); while (this.isOP('+') || this.isOP('-')) { const t = this.next(); l = { k: 'bin', op: t.value, l, r: this.mul(), line: t.line }; } return l; }
  mul() {
    let l = this.unary();
    while (this.isOP('*') || this.isOP('/') || (this.isKW('DIV') && !this.isOP('(', 1)) || (this.isKW('MOD') && !this.isOP('(', 1))) { const t = this.next(); l = { k: 'bin', op: t.value, l, r: this.unary(), line: t.line }; }
    return l;
  }
  unary() { if (this.isOP('-')) { const line = this.next().line; return { k: 'un', op: '-', e: this.unary(), line }; } if (this.isOP('+')) { this.next(); return this.unary(); } return this.pow(); }
  pow() { const b = this.primary(); if (this.isOP('^')) { const line = this.next().line; return { k: 'bin', op: '^', l: b, r: this.unary(), line }; } return b; }
  primary() {
    const k = this.peek(), line = k.line;
    if (k.type === 'NUM') { this.next(); return { k: 'lit', v: k.value, real: k.real, line }; }
    if (k.type === 'STR') { this.next(); return { k: 'lit', v: k.value, str: true, line }; }
    if (k.type === 'CHR') { this.next(); return { k: 'lit', v: k.value, str: true, line }; }
    if (k.type === 'KW' && (k.value === 'TRUE' || k.value === 'FALSE')) { this.next(); return { k: 'lit', v: k.value === 'TRUE', line }; }
    if (k.type === 'KW' && (k.value === 'DIV' || k.value === 'MOD') && this.isOP('(', 1)) { this.next(); return { k: 'fn', name: k.value, args: this.args(), line }; }
    if (this.isOP('(')) { this.next(); const e = this.expr(); this.eatOP(')', 'Missing closing bracket )'); return e; }
    if (k.type === 'ID') {
      this.next();
      if (this.isOP('(')) return { k: 'fn', name: k.value, args: this.args(), line };
      if (this.isOP('[')) { this.next(); const idx = [this.expr()]; while (this.isOP(',')) { this.next(); idx.push(this.expr()); } this.eatOP(']', 'Missing ] after array index'); return { k: 'idx', name: k.value, idx, line }; }
      return { k: 'var', name: k.value, line };
    }
    throw new PseudoError(`Expected a value but found ${this.desc(k)}`, line);
  }
}

export function parse(src) { return new Parser(tokenize(src)).program(); }

// ── Evaluator ──────────────────────────────────────────────────────────
class ReturnSignal { constructor(v) { this.v = v; } }
const key = n => n.toLowerCase();

export function formatValue(v) {
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  if (typeof v === 'number') {
    if (Number.isInteger(v)) return String(v);
    return String(Number(v.toPrecision(12)));
  }
  if (v === null || v === undefined) return '';
  if (v && v.__array) return '[array]';
  return String(v);
}

class Machine {
  constructor(opts) {
    this.inputs = [...(opts.inputs || [])]; this.inputFn = opts.input || null;
    this.out = []; this.onOutput = opts.onOutput || null;
    this.maxSteps = opts.maxSteps || 200000; this.steps = 0;
    this.files = {}; for (const [n, lines] of Object.entries(opts.files || {})) this.files[n] = { lines: [...lines], pos: 0, mode: null };
    this.globals = new Map(); this.frames = []; this.subs = new Map();
    this.trace = opts.trace ? [] : null;
  }
  tick(line) { if (++this.steps > this.maxSteps) throw new PseudoError(`Stopped after ${this.maxSteps.toLocaleString()} steps — the program may contain an infinite loop`, line); }
  scope() { return this.frames.length ? this.frames[this.frames.length - 1] : this.globals; }
  lookup(name, line, { create = false } = {}) {
    const k = key(name);
    if (this.frames.length && this.scope().has(k)) return this.scope().get(k);
    if (this.globals.has(k)) return this.globals.get(k);
    if (create) { const cell = { type: null, value: undefined, declared: false, name }; this.scope().set(k, cell); return cell; }
    throw new PseudoError(`${name} has not been given a value or declared`, line);
  }
  record(line, name, value) { if (this.trace) this.trace.push({ line, name, value: formatValue(value) }); }

  coerce(type, v, line, name) {
    if (!type) return v;
    switch (type) {
      case 'INTEGER':
        if (typeof v === 'number' && Number.isInteger(v)) return v;
        throw new PseudoError(`Cannot store ${formatValue(v)} in INTEGER ${name}${typeof v === 'number' ? ' (it has a fractional part — use REAL, or INT() / ROUND())' : ''}`, line);
      case 'REAL':
        if (typeof v === 'number') return v;
        throw new PseudoError(`Cannot store ${JSON.stringify(v)} in REAL ${name}`, line);
      case 'STRING':
        if (typeof v === 'string') return v;
        throw new PseudoError(`Cannot store ${formatValue(v)} in STRING ${name} — put text in double quotes, or use NUM_TO_STR()`, line);
      case 'CHAR':
        if (typeof v === 'string' && v.length === 1) return v;
        throw new PseudoError(`A CHAR holds exactly one character; cannot store ${JSON.stringify(formatValue(v))} in ${name}`, line);
      case 'BOOLEAN':
        if (typeof v === 'boolean') return v;
        throw new PseudoError(`Cannot store ${formatValue(v)} in BOOLEAN ${name} — use TRUE or FALSE (no quotes)`, line);
      default: return v;
    }
  }
  fromInput(type, s, line, name) {
    const t = String(s ?? '').trim();
    switch (type) {
      case 'INTEGER': if (/^[-+]?\d+$/.test(t)) return Number(t); throw new PseudoError(`Input "${s}" is not a whole number for INTEGER ${name}`, line);
      case 'REAL': if (t !== '' && Number.isFinite(Number(t))) return Number(t); throw new PseudoError(`Input "${s}" is not a number for REAL ${name}`, line);
      case 'BOOLEAN': if (/^true$/i.test(t)) return true; if (/^false$/i.test(t)) return false; throw new PseudoError(`Input "${s}" must be TRUE or FALSE for ${name}`, line);
      case 'CHAR': if (String(s).length === 1) return String(s); throw new PseudoError(`Input "${s}" must be a single character for CHAR ${name}`, line);
      case 'STRING': return String(s ?? '');
      default: return t !== '' && Number.isFinite(Number(t)) ? Number(t) : String(s ?? '');
    }
  }

  async run(prog) {
    for (const st of prog) if (st.k === 'def') this.subs.set(key(st.name), st);
    await this.block(prog, true);
  }
  async block(stmts, top = false) { for (const st of stmts) { if (st.k === 'def') { if (!top && this.frames.length === 0) this.subs.set(key(st.name), st); continue; } await this.exec(st); } }

  async exec(st) {
    this.tick(st.line);
    switch (st.k) {
      case 'declare': {
        for (const n of st.names) {
          if (st.array) {
            const dims = [];
            for (const [lo, hi] of st.array) {
              const l = await this.eval(lo), h = await this.eval(hi);
              if (!Number.isInteger(l) || !Number.isInteger(h)) throw new PseudoError('Array bounds must be whole numbers', st.line);
              if (h < l) throw new PseudoError(`Upper bound ${h} is less than lower bound ${l}`, st.line);
              if ((h - l + 1) > 100000) throw new PseudoError('Array is too large for the practice interpreter', st.line);
              dims.push([l, h]);
            }
            this.scope().set(key(n), { type: st.type, declared: true, name: n, value: { __array: true, dims, data: new Map(), type: st.type } });
          } else {
            this.scope().set(key(n), { type: st.type, declared: true, name: n, value: undefined });
          }
        }
        return;
      }
      case 'const': {
        const v = await this.eval(st.expr);
        this.scope().set(key(st.name), { type: null, declared: true, constant: true, name: st.name, value: v });
        this.record(st.line, st.name, v); return;
      }
      case 'assign': return this.store(st.target, await this.eval(st.expr), st.line);
      case 'input': {
        let raw;
        if (this.inputs.length) raw = this.inputs.shift();
        else if (this.inputFn) raw = await this.inputFn(st.target.name);
        else throw new PseudoError(`INPUT ${st.target.name}: the program asked for more input than was provided`, st.line);
        const cell = this.peekCell(st.target.name);
        const type = cell ? (cell.value && cell.value.__array ? cell.value.type : cell.type) : null;
        return this.store(st.target, this.fromInput(type, raw, st.line, st.target.name), st.line, true);
      }
      case 'output': {
        let s = ''; for (const e of st.items) s += formatValue(await this.eval(e));
        this.out.push(s); if (this.onOutput) this.onOutput(s); return;
      }
      case 'if': { const c = await this.cond(st.cond, st.line); await this.block(c ? st.then : st.els); return; }
      case 'case': {
        const v = await this.eval(st.subject);
        for (const cl of st.clauses) {
          const hit = cl.values.some(x => x === v) || (cl.range && v >= cl.range[0] && v <= cl.range[1]);
          if (hit) { await this.block(cl.body); return; }
        }
        if (st.otherwise) await this.block(st.otherwise);
        return;
      }
      case 'for': {
        const from = await this.eval(st.from), to = await this.eval(st.to), step = st.step ? await this.eval(st.step) : 1;
        if (![from, to, step].every(x => typeof x === 'number')) throw new PseudoError('FOR loop bounds and STEP must be numbers', st.line);
        if (step === 0) throw new PseudoError('STEP 0 would loop for ever', st.line);
        const cell = this.lookup(st.v, st.line, { create: true });
        for (let i = from; step > 0 ? i <= to : i >= to; i += step) {
          cell.value = i; this.record(st.line, st.v, i);
          await this.block(st.body); this.tick(st.line);
          i = cell.value; // honour (discouraged) changes to the loop variable
        }
        return;
      }
      case 'while': while (await this.cond(st.cond, st.line)) { await this.block(st.body); this.tick(st.line); } return;
      case 'repeat': do { await this.block(st.body); this.tick(st.line); } while (!(await this.cond(st.cond, st.line))); return;
      case 'call': {
        const sub = this.subs.get(key(st.name));
        if (!sub) throw new PseudoError(`There is no PROCEDURE called ${st.name}`, st.line);
        if (sub.kind === 'FUNCTION') throw new PseudoError(`${st.name} is a FUNCTION: use its value in an expression (e.g. X ← ${st.name}(…)) instead of CALL`, st.line);
        await this.invoke(sub, st.args, st.line); return;
      }
      case 'return': {
        if (!this.frames.length || !this.frames[this.frames.length - 1].__fn) throw new PseudoError('RETURN can only be used inside a FUNCTION', st.line);
        throw new ReturnSignal(await this.eval(st.expr));
      }
      case 'open': {
        const name = String(await this.eval(st.file));
        if (st.mode === 'READ') { if (!this.files[name]) throw new PseudoError(`File "${name}" does not exist`, st.line); this.files[name].pos = 0; this.files[name].mode = 'READ'; }
        else if (st.mode === 'WRITE') this.files[name] = { lines: [], pos: 0, mode: 'WRITE' };
        else { this.files[name] ??= { lines: [], pos: 0 }; this.files[name].mode = 'APPEND'; }
        return;
      }
      case 'readfile': {
        const name = String(await this.eval(st.file)); const f = this.files[name];
        if (!f || f.mode !== 'READ') throw new PseudoError(`File "${name}" must be opened FOR READ before READFILE`, st.line);
        if (f.pos >= f.lines.length) throw new PseudoError(`No more lines to read in "${name}" (check EOF first)`, st.line);
        const cell = this.peekCell(st.target.name);
        return this.store(st.target, this.fromInput(cell?.type || 'STRING', f.lines[f.pos++], st.line, st.target.name), st.line, true);
      }
      case 'writefile': {
        const name = String(await this.eval(st.file)); const f = this.files[name];
        if (!f || !['WRITE', 'APPEND'].includes(f.mode)) throw new PseudoError(`File "${name}" must be opened FOR WRITE or APPEND before WRITEFILE`, st.line);
        f.lines.push(formatValue(await this.eval(st.expr))); return;
      }
      case 'close': { const name = String(await this.eval(st.file)); if (this.files[name]) this.files[name].mode = null; return; }
      default: throw new PseudoError(`Cannot execute statement ${st.k}`, st.line);
    }
  }
  peekCell(name) { const k = key(name); if (this.frames.length && this.scope().has(k)) return this.scope().get(k); return this.globals.get(k) || null; }

  async store(target, v, line, fromInput = false) {
    let cell = this.peekCell(target.name);
    if (cell?.constant) throw new PseudoError(`${target.name} is a CONSTANT and cannot be changed`, line);
    if (target.idx) {
      if (!cell || !cell.value?.__array) throw new PseudoError(`${target.name} is not an array — declare it first, e.g. DECLARE ${target.name} : ARRAY[1:10] OF INTEGER`, line);
      const k = await this.index(cell.value, target, line);
      const val = this.coerce(cell.value.type, v, line, `${target.name}[${k}]`);
      cell.value.data.set(k, val); this.record(line, `${target.name}[${k}]`, val); return;
    }
    if (!cell) cell = this.lookup(target.name, line, { create: true });
    if (cell.value?.__array) throw new PseudoError(`${target.name} is an array — give an index, e.g. ${target.name}[1]`, line);
    cell.value = this.coerce(cell.type, v, line, target.name);
    this.record(line, target.name, cell.value);
  }
  async index(arr, target, line) {
    if (target.idx.length !== arr.dims.length) throw new PseudoError(`${target.name} has ${arr.dims.length} dimension${arr.dims.length > 1 ? 's' : ''} but ${target.idx.length} index${target.idx.length > 1 ? 'es were' : ' was'} given`, line);
    const parts = [];
    for (let d = 0; d < arr.dims.length; d++) {
      const i = await this.eval(target.idx[d]); const [lo, hi] = arr.dims[d];
      if (!Number.isInteger(i)) throw new PseudoError(`Array index must be a whole number (got ${formatValue(i)})`, line);
      if (i < lo || i > hi) throw new PseudoError(`Index ${i} is outside the bounds of ${target.name} [${lo}:${hi}]`, line);
      parts.push(i);
    }
    return parts.join(',');
  }
  async cond(e, line) { const v = await this.eval(e); if (typeof v !== 'boolean') throw new PseudoError(`A condition must be TRUE or FALSE, but this gives ${formatValue(v)}`, line); return v; }

  async invoke(sub, argExprs, line) {
    if (argExprs.length !== sub.params.length) throw new PseudoError(`${sub.name} expects ${sub.params.length} argument${sub.params.length === 1 ? '' : 's'} but ${argExprs.length} ${argExprs.length === 1 ? 'was' : 'were'} given`, line);
    if (this.frames.length > 500) throw new PseudoError('Too many nested calls (recursion without a stopping condition?)', line);
    const frame = new Map(); frame.__fn = sub.kind === 'FUNCTION';
    for (let i = 0; i < sub.params.length; i++) {
      const p = sub.params[i], a = argExprs[i];
      if (p.byref) {
        if (a.k !== 'var') throw new PseudoError(`BYREF parameter ${p.name} needs a variable as its argument`, line);
        frame.set(key(p.name), this.lookup(a.name, line));
      } else {
        const v = await this.eval(a);
        frame.set(key(p.name), { type: v && v.__array ? null : p.type, declared: true, name: p.name, value: v && v.__array ? v : this.coerce(p.type, v, line, p.name) });
      }
    }
    this.frames.push(frame);
    try { await this.block(sub.body); }
    catch (e) { if (e instanceof ReturnSignal) { this.frames.pop(); return sub.returns ? this.coerce(sub.returns, e.v, line, `the value returned by ${sub.name}`) : e.v; } this.frames.pop(); throw e; }
    this.frames.pop();
    if (sub.kind === 'FUNCTION') throw new PseudoError(`FUNCTION ${sub.name} finished without RETURN — a function must RETURN a value (OUTPUT only displays it)`, line);
    return undefined;
  }

  async eval(e) {
    switch (e.k) {
      case 'lit': return e.v;
      case 'var': {
        const c = this.lookup(e.name, e.line);
        if (c.value === undefined) throw new PseudoError(`${e.name} has been declared but has not been given a value yet`, e.line);
        return c.value;
      }
      case 'idx': {
        const c = this.lookup(e.name, e.line);
        if (!c.value?.__array) throw new PseudoError(`${e.name} is not an array`, e.line);
        const k = await this.index(c.value, e, e.line);
        if (!c.value.data.has(k)) throw new PseudoError(`${e.name}[${k}] has not been given a value yet`, e.line);
        return c.value.data.get(k);
      }
      case 'un': {
        const v = await this.eval(e.e);
        if (e.op === 'NOT') { if (typeof v !== 'boolean') throw new PseudoError('NOT needs a TRUE/FALSE value', e.line); return !v; }
        if (typeof v !== 'number') throw new PseudoError('Unary minus needs a number', e.line); return -v;
      }
      case 'bin': return this.binop(e);
      case 'fn': return this.call(e);
      default: throw new PseudoError(`Cannot evaluate ${e.k}`, e.line);
    }
  }
  async binop(e) {
    if (e.op === 'AND' || e.op === 'OR') {
      const l = await this.eval(e.l); if (typeof l !== 'boolean') throw new PseudoError(`${e.op} needs TRUE/FALSE values on both sides`, e.line);
      if (e.op === 'AND' && !l) return false; if (e.op === 'OR' && l) return true;
      const r = await this.eval(e.r); if (typeof r !== 'boolean') throw new PseudoError(`${e.op} needs TRUE/FALSE values on both sides`, e.line); return r;
    }
    const l = await this.eval(e.l), r = await this.eval(e.r);
    const num = () => { if (typeof l !== 'number' || typeof r !== 'number') throw new PseudoError(`"${e.op}" needs numbers on both sides (got ${formatValue(l)} and ${formatValue(r)})`, e.line); };
    switch (e.op) {
      case '+': if (typeof l === 'string' || typeof r === 'string') throw new PseudoError('Use & to join strings; + is for numbers', e.line); num(); return l + r;
      case '-': num(); return l - r;
      case '*': num(); return l * r;
      case '/': num(); if (r === 0) throw new PseudoError('Division by zero', e.line); return l / r;
      case '^': num(); return Math.pow(l, r);
      case 'DIV': num(); if (r === 0) throw new PseudoError('Division by zero', e.line); return Math.trunc(l / r);
      case 'MOD': num(); if (r === 0) throw new PseudoError('Division by zero', e.line); return l - r * Math.trunc(l / r);
      case '&': return formatValue(l) + formatValue(r);
      case '=': return l === r;
      case '<>': return l !== r;
      case '<': case '>': case '<=': case '>=': {
        if (typeof l !== typeof r) throw new PseudoError(`Cannot compare ${formatValue(l)} with ${formatValue(r)} (different data types)`, e.line);
        return e.op === '<' ? l < r : e.op === '>' ? l > r : e.op === '<=' ? l <= r : l >= r;
      }
    }
    throw new PseudoError(`Unknown operator ${e.op}`, e.line);
  }
  async call(e) {
    const name = e.name.toUpperCase();
    const sub = this.subs.get(key(e.name));
    if (sub) {
      if (sub.kind === 'PROCEDURE') throw new PseudoError(`${e.name} is a PROCEDURE — use CALL ${e.name}(…) as a statement; it does not return a value`, e.line);
      return this.invoke(sub, e.args, e.line);
    }
    const a = []; for (const x of e.args) a.push(await this.eval(x));
    const need = (n, types) => {
      if (a.length !== n) throw new PseudoError(`${name} needs ${n} argument${n === 1 ? '' : 's'}`, e.line);
      (types || []).forEach((t, i) => { if (t && typeof a[i] !== t) throw new PseudoError(`${name}: argument ${i + 1} must be a ${t === 'number' ? 'number' : t}`, e.line); });
    };
    switch (name) {
      case 'LENGTH': need(1, ['string']); return a[0].length;
      case 'UCASE': case 'TO_UPPER': need(1, ['string']); return a[0].toUpperCase();
      case 'LCASE': case 'TO_LOWER': need(1, ['string']); return a[0].toLowerCase();
      case 'SUBSTRING': case 'MID': {
        need(3, ['string', 'number', 'number']);
        if (a[1] < 1) throw new PseudoError(`${name}: the first character is position 1 (got ${a[1]})`, e.line);
        if (a[1] + a[2] - 1 > a[0].length) throw new PseudoError(`${name}: asks for characters beyond the end of "${a[0]}" (length ${a[0].length})`, e.line);
        return a[0].substr(a[1] - 1, a[2]);
      }
      case 'LEFT': need(2, ['string', 'number']); return a[0].slice(0, a[1]);
      case 'RIGHT': need(2, ['string', 'number']); return a[0].slice(Math.max(0, a[0].length - a[1]));
      case 'ROUND': need(2, ['number', 'number']); { const f = 10 ** a[1]; return Math.round(a[0] * f) / f; }
      case 'INT': need(1, ['number']); return Math.trunc(a[0]);
      case 'DIV': need(2, ['number', 'number']); if (a[1] === 0) throw new PseudoError('Division by zero', e.line); return Math.trunc(a[0] / a[1]);
      case 'MOD': need(2, ['number', 'number']); if (a[1] === 0) throw new PseudoError('Division by zero', e.line); return a[0] - a[1] * Math.trunc(a[0] / a[1]);
      case 'RANDOM': need(0); return Math.random();
      case 'NUM_TO_STR': need(1, ['number']); return formatValue(a[0]);
      case 'STR_TO_NUM': need(1, ['string']); { const n = Number(a[0]); if (a[0].trim() === '' || !Number.isFinite(n)) throw new PseudoError(`STR_TO_NUM: "${a[0]}" is not a number`, e.line); return n; }
      case 'IS_NUM': need(1, ['string']); return a[0].trim() !== '' && Number.isFinite(Number(a[0]));
      case 'ASC': need(1, ['string']); return a[0].charCodeAt(0);
      case 'CHR': need(1, ['number']); return String.fromCharCode(a[0]);
      case 'EOF': need(1, ['string']); { const f = this.files[a[0]]; if (!f || f.mode !== 'READ') throw new PseudoError(`EOF: file "${a[0]}" is not open FOR READ`, e.line); return f.pos >= f.lines.length; }
      default: throw new PseudoError(`There is no FUNCTION called ${e.name}`, e.line);
    }
  }
}

/** Run pseudocode. Never throws: errors are returned in `error`. */
export async function runPseudocode(code, opts = {}) {
  let prog;
  const m = new Machine(opts);
  try { prog = parse(code); }
  catch (e) { return { output: [], error: { line: e.line ?? null, message: e.message, phase: 'syntax' }, steps: 0, trace: m.trace, files: {} }; }
  try { await m.run(prog); return { output: m.out, error: null, steps: m.steps, trace: m.trace, files: exportFiles(m.files) }; }
  catch (e) {
    if (e instanceof ReturnSignal) return { output: m.out, error: { line: null, message: 'RETURN used outside a FUNCTION', phase: 'runtime' }, steps: m.steps, trace: m.trace, files: exportFiles(m.files) };
    return { output: m.out, error: { line: e.line ?? null, message: e.message, phase: 'runtime' }, steps: m.steps, trace: m.trace, files: exportFiles(m.files) };
  }
}
function exportFiles(f) { return Object.fromEntries(Object.entries(f).map(([k, v]) => [k, [...v.lines]])); }

/** Mark a coding answer against test cases. Each test: { inputs?, files?, append?, expected_output?, expect_contains?, expect_not_contains?, expect_in_order? } */
export async function runTests(code, tests, { maxSteps = 200000 } = {}) {
  const results = [];
  for (const t of tests) {
    const src = t.append ? `${code}\n${t.append}` : code;
    const r = await runPseudocode(src, { inputs: t.inputs || [], files: t.files || {}, maxSteps });
    const text = r.output.join('\n');
    let pass = !r.error, why = r.error ? `Error on line ${r.error.line}: ${r.error.message}` : '';
    const norm = s => String(s).replace(/\s+/g, ' ').trim().toLowerCase();
    if (pass && t.expected_output !== undefined && norm(text) !== norm(Array.isArray(t.expected_output) ? t.expected_output.join('\n') : t.expected_output)) { pass = false; why = 'Output does not match the expected output'; }
    if (pass && t.expect_contains) {
      const missing = t.expect_contains.filter(x => !containsToken(text, x));
      if (missing.length) { pass = false; why = `Output should include ${missing.map(x => `"${x}"`).join(', ')}`; }
    }
    if (pass && t.expect_not_contains) {
      const bad = t.expect_not_contains.filter(x => containsToken(text, x));
      if (bad.length) { pass = false; why = `Output should not include ${bad.map(x => `"${x}"`).join(', ')}`; }
    }
    if (pass && t.expect_in_order) {
      let pos = 0;
      for (const x of t.expect_in_order) { const i = indexOfToken(text, x, pos); if (i < 0) { pass = false; why = `Expected "${x}" (in order) in the output`; break; } pos = i + String(x).length; }
    }
    results.push({ pass, why, output: r.output, error: r.error });
  }
  return { passed: results.filter(r => r.pass).length, total: results.length, results };
}
// Token-aware matching so that "2" does not match inside "20" and "Valid" does not match inside "Invalid".
function tokenRe(x) { return new RegExp(`(?<![A-Za-z0-9.])${String(x).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![A-Za-z0-9])`, 'i'); }
function containsToken(text, x) { return tokenRe(x).test(text); }
function indexOfToken(text, x, from) { const m = tokenRe(x).exec(text.slice(from)); return m ? from + m.index : -1; }
