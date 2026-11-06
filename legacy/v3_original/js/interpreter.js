// js/interpreter.js
// Cambridge IGCSE/O-Level pseudocode interpreter
// Supports: DECLARE, assignment (←), IF/ELIF/ELSE, CASE OF,
//           FOR/WHILE/REPEAT, PROCEDURE/FUNCTION, arrays (1D+2D),
//           built-in functions (LENGTH, UCASE, LCASE, SUBSTRING/MID,
//           INT, REAL, STRING, MOD, DIV, EOF, OPENFILE, READFILE, WRITEFILE, CLOSEFILE)

export class PseudocodeInterpreter {
  constructor(outputFn) {
    this.out     = outputFn || (s => console.log(s));
    this.input   = null;   // set externally — async fn(prompt) => string
    this.reset();
  }

  reset() {
    this.vars      = {};     // variable store: name → {type, value}
    this.constants = {};
    this.procs     = {};     // procedures
    this.funcs     = {};     // functions
    this.files     = {};     // open file handles
    this.callStack = [];
    this.stopped   = false;
    this.output    = [];
    this.errors    = [];
  }

  // ── Public entry point ────────────────────────────────────────
  async run(code) {
    this.reset();
    const lines = this.tokeniseLines(code);
    try {
      await this.execBlock(lines, 0, lines.length);
    } catch (e) {
      if (e && e.type === '__RETURN__') {
        // RETURN thrown at top level (outside a function) - show the value
        const val = e.value;
        if (val !== null && val !== undefined) {
          this.out(String(val));
          this.output.push(String(val));
        }
      } else if (e && e.message !== '__STOP__') {
        this.errors.push(e.message || String(e));
        this.out('ERROR: ' + (e.message || String(e)));
      }
    }
    return { output: this.output.join('\n'), errors: this.errors };
  }

  // ── Tokenise into logical lines (handles continuation) ─────────
  tokeniseLines(code) {
    return code.split('\n').map((l, i) => ({ raw: l, n: i + 1, text: l.trim() }))
               .filter(l => l.text && !l.text.startsWith('//'));
  }

  // ── Execute a block of lines ───────────────────────────────────
  async execBlock(lines, start, end, scope) {
    let i = start;
    while (i < end && !this.stopped) {
      i = await this.execLine(lines, i, end, scope || this.vars);
    }
    return i;
  }

  // ── Execute one logical statement ──────────────────────────────
  async execLine(lines, i, end, scope) {
    const line = lines[i];
    const t    = line.text;

    // ── DECLARE ──────────────────────────────────────────────────
    if (t.startsWith('DECLARE ')) {
      const m = t.match(/^DECLARE\s+(\w+)\s*:\s*(ARRAY\[([^\]]+)\]\s+OF\s+(\w+)|(\w+))$/i);
      if (!m) throw new Error(`Line ${line.n}: Invalid DECLARE: ${t}`);
      const name = m[1];
      if (m[3]) {
        // Array
        const bounds = m[3].split(',').map(b => {
          const [lo, hi] = b.split(':').map(x => parseInt(x.trim()));
          return { lo, hi };
        });
        const type = m[4];
        this.setVar(scope, name, { type: 'ARRAY', bounds, elemType: type, data: {} });
      } else {
        this.setVar(scope, name, { type: m[5].toUpperCase(), value: this.defaultVal(m[5]) });
      }
      return i + 1;
    }

    // ── CONSTANT ────────────────────────────────────────────────
    if (t.startsWith('CONSTANT ')) {
      const m = t.match(/^CONSTANT\s+(\w+)\s*=\s*(.+)$/i);
      if (!m) throw new Error(`Line ${line.n}: Invalid CONSTANT`);
      this.constants[m[1]] = this.evalExpr(m[2].trim(), scope);
      return i + 1;
    }

    // ── Assignment ← ────────────────────────────────────────────
    if (t.includes('←') || t.includes('<-')) {
      const op  = t.includes('←') ? '←' : '<-';
      const idx = t.indexOf(op);
      const lhs = t.slice(0, idx).trim();
      const rhs = t.slice(idx + op.length).trim();
      const val = this.evalExpr(rhs, scope);
      this.assignVar(scope, lhs, val, line.n);
      return i + 1;
    }

    // ── OUTPUT ──────────────────────────────────────────────────
    if (t.startsWith('OUTPUT ')) {
      const parts = this.splitOutputArgs(t.slice(7).trim());
      const str   = parts.map(p => String(this.evalExpr(p, scope))).join('');
      this.out(str);
      this.output.push(str);
      return i + 1;
    }

    // ── INPUT ───────────────────────────────────────────────────
    if (t.startsWith('INPUT ')) {
      const name = t.slice(6).trim();
      let val = this.input ? await this.input(name) : '';
      // Type coerce
      const v = this.getVarObj(scope, name);
      if (v && (v.type === 'INTEGER' || v.type === 'REAL')) val = Number(val);
      else if (v && v.type === 'BOOLEAN') val = val.toUpperCase() === 'TRUE';
      this.assignVar(scope, name, val, line.n);
      return i + 1;
    }

    // ── IF ──────────────────────────────────────────────────────
    if (t === 'IF' || t.match(/^IF\s+.+\s+THEN$/i) || t.match(/^IF\s+/i)) {
      return await this.execIf(lines, i, end, scope);
    }

    // ── CASE OF ─────────────────────────────────────────────────
    if (t.match(/^CASE\s+OF\s+/i)) {
      return await this.execCase(lines, i, end, scope);
    }

    // ── FOR ─────────────────────────────────────────────────────
    if (t.match(/^FOR\s+/i)) {
      return await this.execFor(lines, i, end, scope);
    }

    // ── WHILE ───────────────────────────────────────────────────
    if (t.match(/^WHILE\s+/i)) {
      return await this.execWhile(lines, i, end, scope);
    }

    // ── REPEAT ──────────────────────────────────────────────────
    if (t === 'REPEAT') {
      return await this.execRepeat(lines, i, end, scope);
    }

    // ── PROCEDURE definition ─────────────────────────────────────
    if (t.match(/^PROCEDURE\s+/i)) {
      return this.defProcedure(lines, i, end);
    }

    // ── FUNCTION definition ──────────────────────────────────────
    if (t.match(/^FUNCTION\s+/i)) {
      return this.defFunction(lines, i, end);
    }

    // ── CALL ────────────────────────────────────────────────────
    if (t.match(/^CALL\s+/i)) {
      await this.callProc(t.slice(5).trim(), scope, line.n);
      return i + 1;
    }

    // ── RETURN ──────────────────────────────────────────────────
    if (t.startsWith('RETURN ')) {
      const val = this.evalExpr(t.slice(7).trim(), scope);
      throw { type: '__RETURN__', value: val };
    }

    // ── File handling ────────────────────────────────────────────
    if (t.match(/^OPENFILE\s+/i))  { this.openFile(t, scope);  return i + 1; }
    if (t.match(/^READFILE\s+/i))  { this.readFile(t, scope);  return i + 1; }
    if (t.match(/^WRITEFILE\s+/i)) { this.writeFile(t, scope); return i + 1; }
    if (t.match(/^CLOSEFILE\s+/i)) { this.closeFile(t, scope); return i + 1; }

    // ── Skip END* / NEXT / UNTIL — handled by parent ────────────
    if (t.match(/^(ENDIF|ENDWHILE|ENDCASE|ENDPROCEDURE|ENDFUNCTION|NEXT\s+|UNTIL\s+|ELSE|ELSE IF|THEN$)/i)) {
      return i + 1;
    }

    // ── Standalone function call (procedure style) ───────────────
    if (t.match(/^\w+\s*\(/)) {
      this.evalExpr(t, scope);
      return i + 1;
    }

    return i + 1; // skip unknown lines gracefully
  }

  // ── IF / ELSE IF / ELSE ───────────────────────────────────────
  async execIf(lines, i, end, scope) {
    const blocks = [];  // [{cond, startLine, endLine}]
    let depth = 0;
    let cur   = null;

    for (let j = i; j < end; j++) {
      const t = lines[j].text;
      if (t.match(/^IF\s+/i) && depth === 0) {
        const cond = t.replace(/^IF\s+/i, '').replace(/\s+THEN$/i, '');
        cur = { cond, start: j + 1, n: lines[j].n };
        depth = 1;
      } else if (t.match(/^IF\s+/i)) {
        depth++;
      } else if (t.match(/^ELSE\s+IF\s+/i) && depth === 1) {
        if (cur) { cur.end = j; blocks.push(cur); }
        const cond = t.replace(/^ELSE\s+IF\s+/i, '').replace(/\s+THEN$/i, '');
        cur = { cond, start: j + 1, n: lines[j].n };
      } else if (t === 'ELSE' && depth === 1) {
        if (cur) { cur.end = j; blocks.push(cur); }
        cur = { cond: null, start: j + 1, n: lines[j].n }; // else block
      } else if (t === 'ENDIF' && depth === 1) {
        if (cur) { cur.end = j; blocks.push(cur); }
        // Execute first matching block
        for (const block of blocks) {
          if (block.cond === null || this.evalExpr(block.cond, scope)) {
            await this.execBlock(lines, block.start, block.end, scope);
            break;
          }
        }
        return j + 1;
      } else if (t === 'ENDIF') {
        depth--;
      }
    }
    return end;
  }

  // ── CASE OF ──────────────────────────────────────────────────
  async execCase(lines, i, end, scope) {
    const expr = lines[i].text.replace(/^CASE\s+OF\s+/i, '').trim();
    const val  = this.evalExpr(expr, scope);
    let j = i + 1;
    let executed = false;

    while (j < end) {
      const t = lines[j].text;
      if (t === 'ENDCASE') return j + 1;
      if (t.startsWith('OTHERWISE')) {
        if (!executed) await this.execLine(lines, j, end, scope);
        return j + 2;
      }
      // Match: value : statement  OR  value1 TO value2 : statement
      const m = t.match(/^(.+?)\s*:\s*(.+)$/);
      if (m && !executed) {
        const casePart = m[1].trim();
        let matches = false;
        if (casePart.match(/\s+TO\s+/i)) {
          const [lo, hi] = casePart.split(/\s+TO\s+/i).map(x => this.evalExpr(x.trim(), scope));
          matches = val >= lo && val <= hi;
        } else {
          matches = val == this.evalExpr(casePart, scope);
        }
        if (matches) {
          const fakeLine = { text: m[2].trim(), n: lines[j].n, raw: m[2] };
          await this.execLine([fakeLine], 0, 1, scope);
          executed = true;
        }
      }
      j++;
    }
    return j;
  }

  // ── FOR loop ─────────────────────────────────────────────────
  async execFor(lines, i, end, scope) {
    const t   = lines[i].text;
    const m   = t.match(/^FOR\s+(\w+)\s*(?:←|<-)\s*(.+)\s+TO\s+(.+?)(?:\s+STEP\s+(.+))?$/i);
    if (!m) throw new Error(`Line ${lines[i].n}: Invalid FOR`);
    const varName = m[1];
    let   from    = Number(this.evalExpr(m[2].trim(), scope));
    const to      = Number(this.evalExpr(m[3].trim(), scope));
    const step    = m[4] ? Number(this.evalExpr(m[4].trim(), scope)) : 1;

    // Find matching NEXT
    let depth = 0, bodyEnd = end;
    for (let j = i + 1; j < end; j++) {
      const tt = lines[j].text;
      if (tt.match(/^FOR\s+/i)) depth++;
      else if (tt.match(/^NEXT\b/i) && depth === 0) { bodyEnd = j; break; }
      else if (tt.match(/^NEXT\b/i)) depth--;
    }

    this.setVar(scope, varName, { type: 'INTEGER', value: from });
    const iter = step > 0 ? () => from <= to : () => from >= to;
    let guard = 0;
    while (iter() && !this.stopped) {
      this.setVar(scope, varName, { type: 'INTEGER', value: from });
      await this.execBlock(lines, i + 1, bodyEnd, scope);
      from += step;
      if (++guard > 100000) throw new Error('Infinite loop detected');
    }
    return bodyEnd + 1;
  }

  // ── WHILE loop ───────────────────────────────────────────────
  async execWhile(lines, i, end, scope) {
    const cond = lines[i].text.replace(/^WHILE\s+/i, '').replace(/\s+DO$/i, '').trim();
    let depth = 0, bodyEnd = end;
    for (let j = i + 1; j < end; j++) {
      if (lines[j].text.match(/^WHILE\s+/i)) depth++;
      else if (lines[j].text === 'ENDWHILE' && depth === 0) { bodyEnd = j; break; }
      else if (lines[j].text === 'ENDWHILE') depth--;
    }
    let guard = 0;
    while (this.evalExpr(cond, scope) && !this.stopped) {
      await this.execBlock(lines, i + 1, bodyEnd, scope);
      if (++guard > 100000) throw new Error('Infinite loop detected');
    }
    return bodyEnd + 1;
  }

  // ── REPEAT UNTIL ─────────────────────────────────────────────
  async execRepeat(lines, i, end, scope) {
    let depth = 0, untilLine = end, untilCond = '';
    for (let j = i + 1; j < end; j++) {
      if (lines[j].text === 'REPEAT') depth++;
      else if (lines[j].text.match(/^UNTIL\s+/i) && depth === 0) {
        untilLine = j;
        untilCond = lines[j].text.replace(/^UNTIL\s+/i, '').trim();
        break;
      } else if (lines[j].text.match(/^UNTIL\s+/i)) depth--;
    }
    let guard = 0;
    do {
      await this.execBlock(lines, i + 1, untilLine, scope);
      if (++guard > 100000) throw new Error('Infinite loop detected');
    } while (!this.evalExpr(untilCond, scope) && !this.stopped);
    return untilLine + 1;
  }

  // ── PROCEDURE definition ─────────────────────────────────────
  defProcedure(lines, i, end) {
    const t = lines[i].text;
    const m = t.match(/^PROCEDURE\s+(\w+)\s*(?:\(([^)]*)\))?$/i);
    if (!m) throw new Error(`Line ${lines[i].n}: Invalid PROCEDURE`);
    const name   = m[1];
    const params = m[2] ? this.parseParams(m[2]) : [];
    let bodyEnd  = end;
    let depth    = 0;
    for (let j = i + 1; j < end; j++) {
      if (lines[j].text.match(/^PROCEDURE\s+/i) || lines[j].text.match(/^FUNCTION\s+/i)) depth++;
      else if (lines[j].text === 'ENDPROCEDURE' && depth === 0) { bodyEnd = j; break; }
      else if (lines[j].text === 'ENDPROCEDURE') depth--;
    }
    this.procs[name.toUpperCase()] = { params, body: lines.slice(i + 1, bodyEnd) };
    return bodyEnd + 1;
  }

  // ── FUNCTION definition ──────────────────────────────────────
  defFunction(lines, i, end) {
    const t = lines[i].text;
    const m = t.match(/^FUNCTION\s+(\w+)\s*(?:\(([^)]*)\))?\s*RETURNS\s+(\w+)$/i);
    if (!m) throw new Error(`Line ${lines[i].n}: Invalid FUNCTION`);
    const name   = m[1];
    const params = m[2] ? this.parseParams(m[2]) : [];
    let bodyEnd  = end;
    let depth    = 0;
    for (let j = i + 1; j < end; j++) {
      if (lines[j].text.match(/^FUNCTION\s+/i)) depth++;
      else if (lines[j].text === 'ENDFUNCTION' && depth === 0) { bodyEnd = j; break; }
      else if (lines[j].text === 'ENDFUNCTION') depth--;
    }
    this.funcs[name.toUpperCase()] = { params, body: lines.slice(i + 1, bodyEnd), returnType: m[3] };
    return bodyEnd + 1;
  }

  parseParams(str) {
    return str.split(',').map(p => {
      const m = p.trim().match(/^(?:BYREF\s+|BYVAL\s+)?(\w+)\s*:\s*(\w+)/i);
      return m ? { name: m[1], type: m[2].toUpperCase(), byRef: /BYREF/i.test(p) } : null;
    }).filter(Boolean);
  }

  async callProc(expr, scope, lineN) {
    const m    = expr.match(/^(\w+)\s*(?:\(([^)]*)\))?$/);
    if (!m) throw new Error(`Line ${lineN}: Cannot call: ${expr}`);
    const name = m[1].toUpperCase();
    const proc = this.procs[name];
    if (!proc) throw new Error(`Line ${lineN}: Unknown procedure: ${m[1]}`);
    const argVals = m[2] ? this.splitArgs(m[2]).map(a => this.evalExpr(a.trim(), scope)) : [];
    const localScope = Object.create(scope);
    proc.params.forEach((p, idx) => {
      localScope[p.name.toUpperCase()] = { type: p.type, value: argVals[idx] ?? this.defaultVal(p.type) };
    });
    try {
      await this.execBlock(proc.body, 0, proc.body.length, localScope);
    } catch (e) {
      if (e.type !== '__RETURN__') throw e;
    }
  }

  async callFunc(name, args, scope) {
    const fn = this.funcs[name.toUpperCase()];
    if (!fn) return this.builtinFunc(name, args, scope);
    const localScope = Object.create(scope);
    fn.params.forEach((p, idx) => {
      localScope[p.name.toUpperCase()] = { type: p.type, value: args[idx] ?? this.defaultVal(p.type) };
    });
    try {
      await this.execBlock(fn.body, 0, fn.body.length, localScope);
    } catch (e) {
      if (e.type === '__RETURN__') return e.value;
      throw e;
    }
    return null;
  }

  // ── Expression evaluator ─────────────────────────────────────
  evalExpr(expr, scope) {
    if (expr === undefined || expr === null) return null;
    expr = expr.trim();

    // String literal
    if (expr.startsWith('"') && expr.endsWith('"')) return expr.slice(1, -1);
    if (expr.startsWith("'") && expr.endsWith("'")) return expr.slice(1, -1);

    // Boolean literals
    if (expr.toUpperCase() === 'TRUE')  return true;
    if (expr.toUpperCase() === 'FALSE') return false;

    // Numeric literal
    if (/^-?\d+(\.\d+)?$/.test(expr)) return Number(expr);

    // NOT operator
    if (expr.toUpperCase().startsWith('NOT ')) {
      return !this.evalExpr(expr.slice(4), scope);
    }

    // Function call
    const fnMatch = expr.match(/^(\w+)\s*\((.*)?\)$/s);
    if (fnMatch) {
      const fname = fnMatch[1].toUpperCase();
      const rawArgs = fnMatch[2] ? this.splitArgs(fnMatch[2]) : [];
      const args = rawArgs.map(a => this.evalExpr(a.trim(), scope));
      return this.builtinFunc(fname, args, scope);
    }

    // Array element: Name[idx] or Name[row, col]
    const arrMatch = expr.match(/^(\w+)\[([^\]]+)\]$/);
    if (arrMatch) {
      const name = arrMatch[1].toUpperCase();
      const v    = this.getVarObj(scope, name);
      if (v && v.type === 'ARRAY') {
        const idxs = arrMatch[2].split(',').map(x => this.evalExpr(x.trim(), scope));
        return v.data[idxs.join(',')] ?? this.defaultVal(v.elemType);
      }
    }

    // Binary operators — in precedence order
    // Parentheses first
    let depth = 0, best = -1, bestOp = '';
    const ops = [
      [' OR ', ' AND '],
      ['<>', '<=', '>=', '<', '>', '='],
      [' MOD ', ' DIV '],
      ['+', '-'],
      ['*', '/'],
      ['&'],
    ];

    for (const opGroup of ops) {
      for (let i = expr.length - 1; i >= 0; i--) {
        if (expr[i] === ')') depth++;
        else if (expr[i] === '(') depth--;
        if (depth !== 0) continue;
        for (const op of opGroup) {
          if (expr.slice(i, i + op.length).toUpperCase() === op.toUpperCase() &&
              (op !== '-' || i > 0)) {
            // Found operator
            const lhs = expr.slice(0, i).trim();
            const rhs = expr.slice(i + op.length).trim();
            if (!lhs && op !== '-') continue;
            const L = lhs ? this.evalExpr(lhs, scope) : null;
            const R = this.evalExpr(rhs, scope);
            return this.applyOp(L, op.trim(), R);
          }
        }
      }
    }

    // Parenthesised expression
    if (expr.startsWith('(') && expr.endsWith(')')) {
      return this.evalExpr(expr.slice(1, -1), scope);
    }

    // Variable lookup
    const name = expr.toUpperCase();
    if (this.constants[expr] !== undefined) return this.constants[expr];
    if (this.constants[name] !== undefined) return this.constants[name];
    const v = this.getVarObj(scope, name);
    if (v !== undefined) return v.type === 'ARRAY' ? v : v.value;

    // Unrecognised — return as-is (might be uninitialized)
    return expr;
  }

  applyOp(L, op, R) {
    switch (op.toUpperCase()) {
      case '+':   return (typeof L === 'string' || typeof R === 'string') ? String(L) + String(R) : Number(L) + Number(R);
      case '-':   return L === null ? -Number(R) : Number(L) - Number(R);
      case '*':   return Number(L) * Number(R);
      case '/':   if (R === 0) throw new Error('Division by zero'); return Number(L) / Number(R);
      case 'DIV': return Math.trunc(Number(L) / Number(R));
      case 'MOD': return Number(L) % Number(R);
      case '&':   return String(L) + String(R);
      case '=':   return L == R;
      case '<>':  return L != R;
      case '<':   return L < R;
      case '>':   return L > R;
      case '<=':  return L <= R;
      case '>=':  return L >= R;
      case 'AND': return Boolean(L) && Boolean(R);
      case 'OR':  return Boolean(L) || Boolean(R);
      default:    throw new Error('Unknown operator: ' + op);
    }
  }

  // ── Built-in functions ────────────────────────────────────────
  builtinFunc(name, args, scope) {
    switch (name.toUpperCase()) {
      case 'LENGTH':    return String(args[0]).length;
      case 'UCASE':     return String(args[0]).toUpperCase();
      case 'LCASE':     return String(args[0]).toLowerCase();
      case 'SUBSTRING':
      case 'MID':       {
        const s = String(args[0]), start = Number(args[1]) - 1, len = Number(args[2]);
        return s.slice(start, start + len);
      }
      case 'LEFT':      return String(args[0]).slice(0, Number(args[1]));
      case 'RIGHT':     { const s = String(args[0]); return s.slice(s.length - Number(args[1])); }
      case 'INT':       return Math.trunc(Number(args[0]));
      case 'REAL':      return parseFloat(args[0]);
      case 'STRING':    return String(args[0]);
      case 'NUM_TO_STR':return String(args[0]);
      case 'STR_TO_NUM':return Number(args[0]);
      case 'ROUND':     return Number(Math.round(Number(args[0]) * Math.pow(10, args[1] || 0)) / Math.pow(10, args[1] || 0));
      case 'SQRT':      return Math.sqrt(Number(args[0]));
      case 'ABS':       return Math.abs(Number(args[0]));
      case 'MOD':       return Number(args[0]) % Number(args[1]);
      case 'DIV':       return Math.trunc(Number(args[0]) / Number(args[1]));
      case 'CHAR':
      case 'CHR':       return String.fromCharCode(Number(args[0]));
      case 'ASC':
      case 'ORD':       return String(args[0]).charCodeAt(0);
      case 'EOF':       {
        const fName = String(args[0]);
        const f = this.files[fName];
        return !f || f.pos >= f.lines.length;
      }
      case 'RAND':      return Math.random();
      case 'TRUE':      return true;
      case 'FALSE':     return false;
      default:
        // Try user-defined function
        if (this.funcs[name]) {
          // Async not supported here — would need refactor for await
          // For now return placeholder
          return null;
        }
        throw new Error(`Unknown function: ${name}`);
    }
  }

  // ── File handling ────────────────────────────────────────────
  openFile(t, scope) {
    const m = t.match(/^OPENFILE\s+"([^"]+)"\s+FOR\s+(READ|WRITE|APPEND)$/i);
    if (!m) throw new Error('Invalid OPENFILE');
    const name = m[1], mode = m[2].toUpperCase();
    this.files[name] = { mode, lines: [], pos: 0 };
  }
  readFile(t, scope) {
    const m = t.match(/^READFILE\s+"([^"]+)"\s*,\s*(\w+)$/i);
    if (!m) throw new Error('Invalid READFILE');
    const f = this.files[m[1]];
    if (!f || f.pos >= f.lines.length) throw new Error('EOF reached: ' + m[1]);
    this.assignVar(scope, m[2], f.lines[f.pos++], 0);
  }
  writeFile(t, scope) {
    const m = t.match(/^WRITEFILE\s+"([^"]+)"\s*,\s*(.+)$/i);
    if (!m) throw new Error('Invalid WRITEFILE');
    const f = this.files[m[1]];
    if (!f) throw new Error('File not open: ' + m[1]);
    f.lines.push(String(this.evalExpr(m[2], scope)));
  }
  closeFile(t, scope) {
    const m = t.match(/^CLOSEFILE\s+"([^"]+)"$/i);
    if (m) delete this.files[m[1]];
  }

  // ── Variable helpers ─────────────────────────────────────────
  setVar(scope, name, obj) {
    scope[name.toUpperCase()] = obj;
  }
  getVarObj(scope, name) {
    return scope[name.toUpperCase()];
  }
  assignVar(scope, lhs, val, lineN) {
    // Array element assignment: Name[i] or Name[i,j]
    const arrM = lhs.match(/^(\w+)\[([^\]]+)\]$/);
    if (arrM) {
      const name = arrM[1].toUpperCase();
      const v    = this.getVarObj(scope, name);
      if (!v || v.type !== 'ARRAY') throw new Error(`${name} is not an array`);
      const idxs = arrM[2].split(',').map(x => this.evalExpr(x.trim(), scope));
      v.data[idxs.join(',')] = val;
      return;
    }
    const name = lhs.toUpperCase();
    const existing = this.getVarObj(scope, name);
    if (existing) {
      existing.value = val;
    } else {
      // Auto-declare
      const type = typeof val === 'number' ? (Number.isInteger(val) ? 'INTEGER' : 'REAL')
                 : typeof val === 'boolean' ? 'BOOLEAN' : 'STRING';
      this.setVar(scope, name, { type, value: val });
    }
  }
  defaultVal(type) {
    switch ((type||'').toUpperCase()) {
      case 'INTEGER': return 0;
      case 'REAL':    return 0.0;
      case 'BOOLEAN': return false;
      case 'CHAR':    return '';
      case 'STRING':  return '';
      default:        return null;
    }
  }
  splitArgs(str) {
    const args = []; let depth = 0, cur = '';
    for (const ch of str) {
      if (ch === '(' || ch === '[') depth++;
      else if (ch === ')' || ch === ']') depth--;
      if (ch === ',' && depth === 0) { args.push(cur); cur = ''; }
      else cur += ch;
    }
    if (cur.trim()) args.push(cur);
    return args;
  }
  splitOutputArgs(str) {
    return this.splitArgs(str);
  }
}
