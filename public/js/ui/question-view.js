// js/ui/question-view.js — renders any question type for answering or review, and
// student-facing feedback that explains the idea rather than only marking right/wrong.

import { h, icon, badge, clear } from './kit.js';
import { QUESTION_TYPES, DIFFICULTY_LABELS } from '../engine/questions.js';
import { chapterTitle } from '../engine/curriculum.js';
import { TAXONOMY } from '../engine/taxonomy-data.js';
import { seededShuffle, hash32 } from '../core/util.js';

const TAX = new Map(TAXONOMY.map(t => [t.id, t]));

export function questionMeta(q, { showTags = false } = {}) {
  return h('div.q-meta', badge(chapterTitle(q.chapter_id), 'brand'), badge(QUESTION_TYPES[q.type]?.label || q.type), badge(DIFFICULTY_LABELS[q.difficulty] || 'Core'),
    badge(`${q.marks || 1} mark${(q.marks || 1) === 1 ? '' : 's'}`), showTags && q.misconception_tag ? badge(q.misconception_tag, 'info') : null);
}

/**
 * @returns {{ el: HTMLElement, getValue: () => any, lock: (result) => void }}
 */
export function renderQuestion(q, { value, onChange = () => {}, disabled = false, number = null, showMeta = true, seed = 1 } = {}) {
  const root = h('div.question', { 'data-qid': q.id });
  let val = value;
  const set = (v) => { val = v; onChange(v); };
  if (showMeta) root.appendChild(questionMeta(q));
  if (q.stimulus) root.appendChild(h('div.q-stimulus', q.stimulus));
  if (q.image_url) root.appendChild(h('img.q-image', { src: q.image_url, alt: q.image_alt || 'Diagram for this question', loading: 'lazy' }));
  root.appendChild(h('div.q-text', { id: `qt-${q.id}` }, number ? h('strong', `${number}. `) : null, q.text));
  if (q.code) root.appendChild(h('pre.q-code', { 'aria-label': 'Code' }, q.code));
  const area = h('div'); root.appendChild(area);
  const name = 'q_' + q.id.replace(/\W/g, '_') + '_' + Math.random().toString(36).slice(2, 6);
  const labelled = `qt-${q.id}`;

  const optionList = (multi) => {
    const box = h('div.options', { role: multi ? 'group' : 'radiogroup', 'aria-labelledby': labelled });
    const chosen = new Set(multi ? (Array.isArray(val) ? val : []) : (val === undefined || val === null || val === '' ? [] : [Number(val)]));
    q.options.forEach((opt, i) => {
      const inp = h('input', { type: multi ? 'checkbox' : 'radio', name, value: String(i), disabled, checked: chosen.has(i) });
      inp.addEventListener('change', () => {
        if (multi) { inp.checked ? chosen.add(i) : chosen.delete(i); set([...chosen].sort((a, b) => a - b)); }
        else set(i);
      });
      box.appendChild(h('label', { class: 'option' + (disabled ? ' disabled' : ''), 'data-i': i }, inp, h('span.opt-text', opt)));
    });
    return box;
  };
  switch (q.type) {
    case 'mcq': case 'pseudocode': case 'debugging': case 'code_output':
      if (q.options?.length) { area.appendChild(optionList(false)); break; }
      // falls through: free-text answer
    case 'short': {
      const i = h('input', { type: 'text', 'aria-labelledby': labelled, disabled, autocomplete: 'off', class: q.type === 'code_output' ? 'code-input' : '' });
      i.value = val ?? ''; i.addEventListener('input', () => set(i.value)); area.appendChild(i); break;
    }
    case 'truefalse': {
      const box = h('div.options', { role: 'radiogroup', 'aria-labelledby': labelled });
      [['True', true], ['False', false]].forEach(([lbl, v]) => {
        const inp = h('input', { type: 'radio', name, disabled, checked: val === v });
        inp.addEventListener('change', () => set(v));
        box.appendChild(h('label', { class: 'option', 'data-i': v ? 0 : 1 }, inp, h('span.opt-text', lbl)));
      });
      area.appendChild(box); break;
    }
    case 'multi':
      area.appendChild(h('p.small.muted', 'Select all that apply.')); area.appendChild(optionList(true)); break;
    case 'gap': {
      const parts = q.text.split(/(\{\{\d+\}\}|_{3,})/);
      const vals = Array.isArray(val) ? [...val] : [];
      let gi = 0;
      const line = h('p', { style: { lineHeight: '2.4' } });
      for (const p of parts) {
        if (/^\{\{\d+\}\}$|^_{3,}$/.test(p)) {
          const idx = gi++;
          const inp = h('input', { type: 'text', 'aria-label': `Gap ${idx + 1}`, disabled, style: { width: '9rem', display: 'inline-block', margin: '0 .25rem' } });
          inp.value = vals[idx] ?? ''; inp.addEventListener('input', () => { vals[idx] = inp.value; set([...vals]); });
          line.appendChild(inp);
        } else line.appendChild(document.createTextNode(p));
      }
      root.querySelector('.q-text').hidden = true; area.appendChild(line); break;
    }
    case 'matching': {
      const vals = Array.isArray(val) ? [...val] : [];
      const tbl = h('table', h('tbody', ...q.left.map((l, i) => {
        const s = h('select', { 'aria-label': `Match for ${l}`, disabled }, h('option', { value: '' }, 'Choose…'), ...q.right.map((r, j) => h('option', { value: String(j), selected: vals[i] === j }, r)));
        s.addEventListener('change', () => { vals[i] = s.value === '' ? null : Number(s.value); set([...vals]); });
        return h('tr', h('td', { style: { fontWeight: 600 } }, l), h('td', s));
      })));
      area.appendChild(h('div.table-wrap', tbl)); break;
    }
    case 'ordering': {
      let order = Array.isArray(val) && val.length === q.items.length ? [...val] : seededShuffle(q.items.map((_, i) => i), hash32(q.id) ^ seed);
      if (!Array.isArray(val)) set([...order]);
      const list = h('ol.order-list', { 'aria-label': 'Items to put in order' });
      const draw = () => {
        clear(list);
        order.forEach((idx, pos) => list.appendChild(h('li', h('span.badge', String(pos + 1)), h('span.grow', q.items[idx]),
          h('button', { type: 'button', class: 'btn sm', disabled: disabled || pos === 0, 'aria-label': `Move "${q.items[idx]}" up`, on: { click: () => { [order[pos - 1], order[pos]] = [order[pos], order[pos - 1]]; set([...order]); draw(); list.children[pos - 1]?.querySelector('button')?.focus(); } } }, '↑'),
          h('button', { type: 'button', class: 'btn sm', disabled: disabled || pos === order.length - 1, 'aria-label': `Move "${q.items[idx]}" down`, on: { click: () => { [order[pos + 1], order[pos]] = [order[pos], order[pos + 1]]; set([...order]); draw(); list.children[pos + 1]?.querySelectorAll('button')[1]?.focus(); } } }, '↓'))));
      };
      draw(); area.appendChild(list); break;
    }
    case 'trace_table': {
      const rows = q.answer?.length || q.rows || 4;
      const vals = Array.isArray(val) ? val.map(r => [...r]) : Array.from({ length: rows }, () => q.columns.map(() => ''));
      const tbl = h('table.trace-input', h('thead', h('tr', ...q.columns.map(c => h('th', c)))),
        h('tbody', ...vals.map((r, ri) => h('tr', ...q.columns.map((c, ci) => { const i = h('input', { type: 'text', 'aria-label': `Row ${ri + 1}, ${c}`, disabled }); i.value = r[ci] ?? ''; i.addEventListener('input', () => { vals[ri][ci] = i.value; set(vals.map(x => [...x])); }); return h('td', i); })))));
      area.appendChild(h('div.table-wrap', tbl)); area.appendChild(h('p.small.muted', 'Write a value only when the variable changes; leave other cells empty.'));
      break;
    }
    case 'structured': {
      const vals = val && typeof val === 'object' ? { ...val } : {};
      for (const [i, p] of (q.parts || []).entries()) {
        const t = h('textarea', { rows: 3, disabled, 'aria-label': p.prompt }); t.value = vals[i] ?? '';
        t.addEventListener('input', () => { vals[i] = t.value; set({ ...vals }); });
        area.appendChild(h('div.field', h('label', `${p.prompt} [${p.marks}]`), t));
      }
      break;
    }
    case 'coding': {
      const t = h('textarea', { class: 'code', rows: 12, disabled, spellcheck: 'false', 'aria-label': 'Your pseudocode' }); t.value = val ?? q.starter ?? '';
      if (val === undefined && q.starter) set(q.starter);
      t.addEventListener('input', () => set(t.value));
      t.addEventListener('keydown', (e) => { if (e.key === 'Tab' && !e.shiftKey) { e.preventDefault(); const s = t.selectionStart; t.setRangeText('   ', s, t.selectionEnd, 'end'); set(t.value); } });
      area.appendChild(t);
      if (q.tests_count || q.tests?.length) area.appendChild(h('p.small.muted', `Your code will be checked by running ${q.tests_count || q.tests.length} test case${(q.tests_count || q.tests.length) > 1 ? 's' : ''}. Your teacher may also review it.`));
      break;
    }
    default: area.appendChild(h('p.muted', 'This question type cannot be displayed.'));
  }
  return {
    el: root,
    getValue: () => val,
    lock(result, key = null) {
      root.querySelectorAll('input, select, textarea, .order-list button').forEach(x => { x.disabled = true; });
      const ans = key?.answer ?? q.answer;
      root.querySelectorAll('.option').forEach(o => {
        o.classList.add('disabled');
        const i = Number(o.dataset.i);
        const isKey = q.type === 'multi' ? (ans || []).includes(i) : q.type === 'truefalse' ? (ans === true ? i === 0 : i === 1) : i === ans;
        const picked = o.querySelector('input')?.checked;
        if (isKey) o.classList.add('correct'); else if (picked) o.classList.add('wrong');
      });
    },
  };
}

/** Student-facing feedback. Never shows risk or teacher labels. */
export function feedbackBox(q, result, { key = null } = {}) {
  const k = key || q;
  if (result.needs_manual) return h('div.feedback', h('h4', 'Answer saved'), h('p', 'This answer will be marked by your teacher.'));
  const ok = result.correct === true, partial = result.correct === null && result.score > 0;
  const box = h('div', { class: 'feedback ' + (ok ? 'ok' : 'no'), role: 'status' },
    h('h4', ok ? 'Correct' : partial ? `Partly correct — ${result.score} of ${result.max} marks` : 'Not quite'));
  if (result.detail?.tests_total) box.appendChild(h('p', `${result.detail.tests_passed} of ${result.detail.tests_total} test cases passed.`,
    ...result.detail.results.filter(r => !r.pass).slice(0, 2).map(r => h('span', { style: { display: 'block' } }, '• ' + r.why))));
  if (!ok && k.answer !== undefined && k.answer !== null && !['coding', 'structured', 'trace_table', 'ordering', 'matching', 'gap'].includes(q.type)) {
    const shown = q.options?.length && Number.isInteger(k.answer) ? q.options[k.answer] : q.type === 'truefalse' ? (k.answer ? 'True' : 'False') : Array.isArray(k.answer) ? (q.type === 'multi' ? k.answer.map(i => q.options[i]).join('; ') : k.answer[0]) : String(k.answer);
    box.appendChild(h('p', h('strong', 'Correct answer: '), h('span', { style: { whiteSpace: 'pre-wrap' } }, shown)));
  }
  if (k.explanation) box.appendChild(h('p', k.explanation));
  for (const mid of result.misconception_hits || []) {
    const t = TAX.get(mid); if (!t) continue;
    box.appendChild(h('div.callout', { style: { marginTop: '.5rem' } }, h('strong', 'A common mix-up: '), t.name + '. ', String(t.description || '').replace(/^The learner /, 'A student '),
      t.strategies?.[0] ? h('p.small', { style: { margin: '.4rem 0 0' } }, h('strong', 'Try this: '), t.strategies[0]) : null));
  }
  return box;
}

export function isAnswered(q, v) {
  if (v === undefined || v === null || v === '') return false;
  if (Array.isArray(v)) return q.type === 'trace_table' ? v.some(r => r.some(c => String(c).trim())) : v.some(x => x !== null && x !== undefined && String(x).trim() !== '');
  if (typeof v === 'object') return Object.values(v).some(x => String(x).trim());
  if (q.type === 'coding') return String(v).trim() !== '' && String(v).trim() !== String(q.starter || '').trim();
  return true;
}

export { icon };
