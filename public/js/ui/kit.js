// js/ui/kit.js — shared interface components for all three portals.
// Pattern sources: WOW Sir (Toast, Modal, Card, Button components), DBWOW (import wizard
// that lists every rejected row with its reason). All text is escaped by default.

import { esc, fmtPct, fmtDate } from '../core/util.js';
export { esc, fmtPct, fmtDate };

// ── DOM helper ───────────────────────────────────────────────────────────
/** h('div.card#id', {attrs, on: {click}}, ...children) — strings become text nodes (never HTML). */
export function h(tag, attrs = {}, ...children) {
  if (attrs === null || typeof attrs !== 'object' || attrs instanceof Node || Array.isArray(attrs)) { children.unshift(attrs); attrs = {}; }
  const m = /^([a-z0-9-]+)?((?:[.#][\w-]+)*)$/i.exec(tag);
  const el = document.createElement(m?.[1] || 'div');
  for (const part of (m?.[2] || '').match(/[.#][\w-]+/g) || []) part[0] === '.' ? el.classList.add(part.slice(1)) : (el.id = part.slice(1));
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'on') for (const [ev, fn] of Object.entries(v)) el.addEventListener(ev, fn);
    else if (k === 'class') el.className += (el.className ? ' ' : '') + v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k === 'html') el.innerHTML = v; // only for trusted, static markup (icons)
    else if (k in el && typeof v !== 'string' && k !== 'list') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  append(el, children);
  return el;
}
export function append(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    el.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}
export function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); return el; }
export function mount(el, ...children) { clear(el); return append(el, children); }

// ── Icons (Lucide-style strokes, inline, no external fetch) ──────────────
const P = {
  home: '<path d="M3 10.5 12 3l9 7.5V21h-6v-6H9v6H3z"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7"/><path d="M18 14a5.5 5.5 0 0 1 3.5 6"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  chart: '<path d="M4 20V4"/><path d="M4 20h16"/><path d="M8 16v-5"/><path d="M12 16V8"/><path d="M16 16v-8"/>',
  brain: '<path d="M9 3a3 3 0 0 0-3 3 3 3 0 0 0-2 5 3 3 0 0 0 2 5 3 3 0 0 0 3 3h0V3z"/><path d="M15 3a3 3 0 0 1 3 3 3 3 0 0 1 2 5 3 3 0 0 1-2 5 3 3 0 0 1-3 3h0V3z"/>',
  alert: '<path d="M12 3 2 20h20z"/><path d="M12 10v4"/><path d="M12 17h.01"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
  clipboard: '<rect x="6" y="4" width="12" height="17" rx="2"/><path d="M9 4h6v3H9z"/><path d="M9 12h6M9 16h4"/>',
  book: '<path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z"/><path d="M4 19V5"/>',
  file: '<path d="M14 3H6v18h12V7z"/><path d="M14 3v4h4"/>',
  db: '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5"/><path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  shield: '<path d="M12 3 4 6v6c0 5 3.4 8.3 8 9 4.6-.7 8-4 8-9V6z"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  play: '<path d="M7 4v16l13-8z"/>',
  code: '<path d="m8 8-4 4 4 4"/><path d="m16 8 4 4-4 4"/><path d="m14 4-4 16"/>',
  check: '<path d="M4 12l5 5L20 6"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  download: '<path d="M12 4v11"/><path d="m7 10 5 5 5-5"/><path d="M5 20h14"/>',
  upload: '<path d="M12 20V9"/><path d="m7 14 5-5 5 5"/><path d="M5 4h14"/>',
  logout: '<path d="M15 4h4v16h-4"/><path d="M10 8l-4 4 4 4"/><path d="M6 12h10"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  flag: '<path d="M5 21V4"/><path d="M5 4h11l-2 4 2 4H5"/>',
  layers: '<path d="m12 3 9 5-9 5-9-5z"/><path d="m3 13 9 5 9-5"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
  inbox: '<path d="M3 13h5l1 3h6l1-3h5"/><path d="M5 5h14l2 8v6H3v-6z"/>',
  bell: '<path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4z"/><path d="M10 21h4"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.4 1.4M17.6 17.6 19 19M5 19l1.4-1.4M17.6 6.4 19 5"/>',
  edit: '<path d="M4 20h4L20 8l-4-4L4 16z"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M4 16V4h12"/>',
  archive: '<rect x="3" y="4" width="18" height="4"/><path d="M5 8v12h14V8"/><path d="M10 12h4"/>',
  wifioff: '<path d="M2 8a16 16 0 0 1 6-3.5M22 8a16 16 0 0 0-9-4"/><path d="M5 12a10 10 0 0 1 4-2.4M19 12a10 10 0 0 0-3-2"/><path d="M8.5 15.5a5 5 0 0 1 7 0"/><path d="M12 19h.01"/><path d="m3 3 18 18"/>',
  lifeline: '<path d="M2 12h4l2-5 4 10 3-7 2 2h5"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  key: '<circle cx="8" cy="15" r="4"/><path d="m11 12 9-9"/><path d="m17 6 3 3"/>',
  arrow: '<path d="M5 12h14"/><path d="m13 6 6 6-6 6"/>',
  hash: '<path d="M5 9h14M5 15h14M10 4 8 20M16 4l-2 16"/>',
  google: '<path d="M20.5 12.2c0-.6-.1-1.2-.2-1.7H12v3.3h4.8a4.1 4.1 0 0 1-1.8 2.7v2.2h2.9c1.7-1.6 2.6-3.9 2.6-6.5z"/><path d="M12 21c2.4 0 4.5-.8 5.9-2.2l-2.9-2.2c-.8.5-1.8.9-3 .9-2.3 0-4.3-1.6-5-3.7H4v2.3A9 9 0 0 0 12 21z"/><path d="M7 13.8a5.4 5.4 0 0 1 0-3.6V7.9H4a9 9 0 0 0 0 8.2z"/><path d="M12 6.6c1.3 0 2.5.5 3.4 1.3l2.6-2.6A9 9 0 0 0 4 7.9l3 2.3c.7-2.1 2.7-3.6 5-3.6z"/>',
};
export function icon(name, cls = '') {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('fill', 'none'); s.setAttribute('stroke', 'currentColor');
  s.setAttribute('stroke-width', '2'); s.setAttribute('stroke-linecap', 'round'); s.setAttribute('stroke-linejoin', 'round'); s.setAttribute('aria-hidden', 'true');
  if (cls) s.setAttribute('class', cls);
  s.innerHTML = P[name] || P.file;
  return s;
}

// ── Buttons, badges, tiles ───────────────────────────────────────────────
export function btn(label, onClick, { kind = '', ic = null, sm = false, title = null, disabled = false, type = 'button' } = {}) {
  return h('button', { type, class: ['btn', kind, sm ? 'sm' : ''].filter(Boolean).join(' '), title, disabled, on: onClick ? { click: onClick } : {} }, ic ? icon(ic) : null, label);
}
export function badge(text, tone = '') { return h('span', { class: 'badge' + (tone ? ' ' + tone : '') }, text); }
// v3 stat card: coloured icon square, big value, small label. Icon and tone follow the label unless given.
const TILE_GUESS = [[/attention|risk|reject|fail|overdue|refus|withdrawn|inactive/i, 'alert', 'crimson'], [/accuracy|average|score|correct|accepted|granted|production model/i, 'target', 'emerald'],
  [/participation|submitted|active|activity|waiting|pending|to mark|not released|duplicates|not recorded/i, 'clock', 'amber'], [/intervention/i, 'flag', 'amber'],
  [/misconception/i, 'brain', 'crimson'], [/student|learner|teacher|user|administrator/i, 'users', 'teal'], [/class|school/i, 'db', 'teal'], [/question|answer|response/i, 'layers', 'teal'],
  [/model|prediction/i, 'chart', 'teal']];
export function tile(label, value, sub = '', { attention = false, title = null, ic = null, tone = null } = {}) {
  const g = TILE_GUESS.find(([re]) => re.test(String(label))) || [null, 'chart', 'teal'];
  const t = attention ? 'crimson' : (tone || g[2]);
  return h('div', { class: `tile ${t}` + (attention ? ' attention' : ''), title }, h('div', { class: `stat-icon ${t}` }, icon(ic || g[1])),
    h('div.value', value ?? '—'), h('div.label', label), sub ? h('div.sub', sub) : null);
}
export function card(title, ...body) {
  const head = typeof title === 'string' ? h('div.card-head', h('h2', title)) : title;
  return h('section.card', head, ...body);
}
export function cardHead(title, ...actions) { return h('div.card-head', h('h2', title), actions.length ? h('div.row', ...actions) : null); }
export function callout(text, tone = '') { return h('div', { class: 'callout' + (tone ? ' ' + tone : ''), role: tone === 'danger' ? 'alert' : null }, ...(Array.isArray(text) ? text : [text])); }
export function empty(title, text = '', action = null, ic = 'inbox') { return h('div.empty', icon(ic), h('h3', title), text ? h('p', text) : null, action); }
export function skeleton(kind = 'page') {
  if (kind === 'tiles') return h('div.grid-tiles', ...Array.from({ length: 4 }, () => h('div.skeleton.sk-tile')));
  if (kind === 'table') return h('div.card', ...Array.from({ length: 6 }, () => h('div.skeleton.sk-line')));
  return h('div', skeleton('tiles'), h('div.grid-2', h('div.skeleton.sk-block'), h('div.skeleton.sk-block')));
}
export function pageHead(title, sub = '', ...actions) {
  return h('div.page-head', h('div', h('h1', title), sub ? h('p', sub) : null), actions.length ? h('div.page-actions', ...actions) : null);
}
export function pctTone(p) { return p === null || p === undefined ? '' : p >= 0.7 ? 'high' : p >= 0.5 ? 'mid' : 'low'; }
export function barRow(label, p, valueText = null, title = null) {
  return h('div.bar-row', { title }, h('div', label), h('div.bar-track', h('div', { class: 'bar-fill ' + pctTone(p), style: { width: `${Math.round((p || 0) * 100)}%` } })), h('div.v', valueText ?? fmtPct(p)));
}
export function heatCell(p, n) {
  if (p === null || p === undefined) return h('span.heat.muted', { title: 'No data' }, '—');
  const hue = Math.round(p * 120); // 0 red → 120 green
  return h('span.heat', { style: { background: `hsl(${hue} 60% 88%)`, color: `hsl(${hue} 70% 22%)` }, title: `${fmtPct(p)} of ${n} answers` }, fmtPct(p));
}

// ── Toast ───────────────────────────────────────────────────────────────
let toastRoot;
export function toast(msg, tone = '', ms = 4500) {
  if (!toastRoot) { toastRoot = h('div.toasts', { role: 'status', 'aria-live': 'polite' }); document.body.appendChild(toastRoot); }
  const t = h('div', { class: 'toast' + (tone ? ' ' + tone : '') }, icon(tone === 'ok' ? 'check' : tone === 'error' || tone === 'danger' ? 'x' : tone === 'warn' ? 'alert' : 'bell'), h('span', msg), h('button', { type: 'button', 'aria-label': 'Dismiss', on: { click: () => t.remove() } }, '×'));
  toastRoot.appendChild(t);
  if (ms) setTimeout(() => t.remove(), ms);
  return t;
}
export function errorToast(e, prefix = '') {
  const msg = friendlyError(e);
  console.error(prefix, e);
  return toast((prefix ? prefix + ': ' : '') + msg, 'error', 8000);
}
export function friendlyError(e) {
  const m = String(e?.code || '') + ' ' + String(e?.message || e || '');
  if (/permission|PERMISSION_DENIED|insufficient/i.test(m)) return 'You do not have permission for this action. If you think you should, ask an administrator.';
  if (/auth\/(invalid-credential|wrong-password|user-not-found|invalid-login)/.test(m)) return 'The email or password is not correct.';
  if (/auth\/too-many-requests/.test(m)) return 'Too many attempts. Wait a few minutes and try again.';
  if (/auth\/email-already-in-use/.test(m)) return 'An account already uses this email. Sign in instead.';
  if (/auth\/weak-password/.test(m)) return 'Choose a password of at least 8 characters.';
  if (/auth\/popup-closed/.test(m)) return 'The sign-in window was closed before finishing.';
  if (/offline|unavailable|network/i.test(m)) return 'You appear to be offline. Your work is saved on this device and will be sent when you reconnect.';
  if (/failed-precondition|index/i.test(m)) return 'The database needs an index that has not been deployed yet (see the deployment guide).';
  return (e?.message || String(e)).replace(/^Firebase: /, '');
}

// ── Modal and confirm ───────────────────────────────────────────────────
export function modal({ title, body, actions = [], wide = false, onClose = null }) {
  const prev = document.activeElement;
  const titleId = 'm' + Math.random().toString(36).slice(2);
  const close = () => { bd.remove(); document.removeEventListener('keydown', onKey); onClose && onClose(); prev && prev.focus && prev.focus(); };
  const box = h('div', { class: 'modal' + (wide ? ' wide' : ''), role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': titleId },
    h('div.modal-head', h('h2', { id: titleId }, title), h('button', { type: 'button', class: 'btn ghost icon-btn', 'aria-label': 'Close', on: { click: close } }, icon('x'))),
    h('div.modal-body', body),
    actions.length ? h('div.modal-foot', ...actions.map(a => a instanceof Node ? a : btn(a.label, async (ev) => { const r = await a.onClick?.(ev, close); if (r !== false && a.close !== false) close(); }, { kind: a.kind || '', ic: a.ic })) ) : null);
  const bd = h('div.modal-backdrop', { on: { mousedown: (e) => { if (e.target === bd) close(); } } }, box);
  const onKey = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); close(); }
    if (e.key === 'Tab') { // focus trap
      const f = [...box.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')].filter(x => !x.disabled && x.offsetParent !== null);
      if (!f.length) return; const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); } else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  };
  document.addEventListener('keydown', onKey);
  document.body.appendChild(bd);
  setTimeout(() => (box.querySelector('input, select, textarea') || box.querySelector('.modal-foot .btn.primary') || box.querySelector('button'))?.focus(), 20);
  return { close, el: box };
}
export function confirmDialog(title, message, { confirmLabel = 'Confirm', danger = false } = {}) {
  return new Promise(resolve => {
    let done = false;
    modal({ title, body: h('p', message), onClose: () => { if (!done) resolve(false); },
      actions: [{ label: 'Cancel', onClick: () => { done = true; resolve(false); } }, { label: confirmLabel, kind: danger ? 'danger' : 'primary', onClick: () => { done = true; resolve(true); } }] });
  });
}
/** Ask for text (e.g. a reason for an audited action). Resolves null when cancelled. */
export function promptDialog(title, label, { placeholder = '', required = true, initial = '' } = {}) {
  return new Promise(resolve => {
    const input = h('textarea', { placeholder, rows: 3 }); input.value = initial;
    const err = h('div.err', { role: 'alert' });
    let done = false;
    modal({ title, body: h('div.field', h('label', label), input, err), onClose: () => { if (!done) resolve(null); },
      actions: [{ label: 'Cancel', onClick: () => { done = true; resolve(null); } },
        { label: 'Save', kind: 'primary', onClick: () => { if (required && !input.value.trim()) { err.textContent = 'This is required.'; return false; } done = true; resolve(input.value.trim()); } }] });
  });
}

// ── Form helpers ────────────────────────────────────────────────────────
export function field(labelText, control, hint = '') {
  const id = control.id || ('f' + Math.random().toString(36).slice(2));
  control.id = id;
  return h('div.field', h('label', { for: id }, labelText), control, hint ? h('div.hint', hint) : null);
}
export function input(value = '', attrs = {}) { const i = h('input', { type: 'text', ...attrs }); i.value = value ?? ''; return i; }
export function textarea(value = '', attrs = {}) { const t = h('textarea', attrs); t.value = value ?? ''; return t; }
export function select(options, value, attrs = {}) {
  const s = h('select', attrs);
  for (const o of options) { const [v, l] = Array.isArray(o) ? o : [o.value ?? o, o.label ?? o]; const opt = h('option', { value: v }, l); if (String(v) === String(value)) opt.selected = true; s.appendChild(opt); }
  return s;
}
export function checkbox(labelText, checked = false, attrs = {}) {
  const c = h('input', { type: 'checkbox', ...attrs }); c.checked = !!checked;
  return { el: h('label.check', c, h('span', labelText)), input: c };
}

// ── Tabs ────────────────────────────────────────────────────────────────
export function tabs(items, onSelect, selected = items[0]?.id) {
  const bar = h('div.tabs', { role: 'tablist' });
  const render = (id) => { [...bar.children].forEach(b => b.setAttribute('aria-selected', String(b.dataset.id === id))); onSelect(id); };
  for (const it of items) bar.appendChild(h('button', { type: 'button', class: 'tab', role: 'tab', 'data-id': it.id, 'aria-selected': String(it.id === selected), on: { click: () => render(it.id) } }, it.label));
  setTimeout(() => render(selected), 0);
  return bar;
}

// ── Data table: search, sort, pagination, row click, CSV ────────────────
/**
 * columns: [{ key, label, render?(row)->Node|string, sort?(row)->value, num?, csv?(row) }]
 */
export function dataTable(rows, columns, { onRow = null, search = true, pageSize = 25, empty: emptyMsg = 'Nothing to show yet.', searchText = null, initialSort = null, caption = null } = {}) {
  let q = '', sortKey = initialSort?.key || null, dir = initialSort?.dir || 'asc', page = 0;
  const wrap = h('div');
  const tbl = h('table'); const thead = h('thead'); const tbody = h('tbody'); tbl.append(thead, tbody);
  if (caption) tbl.prepend(h('caption.sr-only', caption));
  const pager = h('div.pager');
  const sIn = h('input', { type: 'search', placeholder: 'Search…', 'aria-label': 'Search table', on: { input: (e) => { q = e.target.value.toLowerCase(); page = 0; draw(); } } });
  const textOf = searchText || (r => columns.map(c => { const v = c.sort ? c.sort(r) : r[c.key]; return v === null || v === undefined ? '' : String(v); }).join(' ').toLowerCase());
  const headRow = h('tr');
  for (const c of columns) {
    const th = h('th', { class: c.num ? 'num' : '', scope: 'col' }, c.label);
    if (c.sortable !== false) { th.setAttribute('aria-sort', 'none'); th.tabIndex = 0; const go = () => { if (sortKey === c.key) dir = dir === 'asc' ? 'desc' : 'asc'; else { sortKey = c.key; dir = 'asc'; } draw(); }; th.addEventListener('click', go); th.addEventListener('keydown', e => { if (e.key === 'Enter') go(); }); }
    headRow.appendChild(th);
  }
  thead.appendChild(headRow);
  function draw() {
    let list = q ? rows.filter(r => textOf(r).includes(q)) : [...rows];
    if (sortKey) {
      const c = columns.find(x => x.key === sortKey); const get = c?.sort || (r => r[sortKey]);
      list.sort((a, b) => { const x = get(a), y = get(b); if (x === y) return 0; if (x === null || x === undefined || x === '') return 1; if (y === null || y === undefined || y === '') return -1; return (x < y ? -1 : 1) * (dir === 'asc' ? 1 : -1); });
    }
    [...headRow.children].forEach((th, i) => th.hasAttribute('aria-sort') && th.setAttribute('aria-sort', columns[i].key === sortKey ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'));
    const pages = Math.max(1, Math.ceil(list.length / pageSize)); page = Math.min(page, pages - 1);
    clear(tbody);
    if (!list.length) tbody.appendChild(h('tr', h('td', { colspan: columns.length }, h('div.empty', { style: { padding: '1.2rem' } }, q ? 'No rows match your search.' : emptyMsg))));
    for (const r of list.slice(page * pageSize, page * pageSize + pageSize)) {
      const tr = h('tr', { class: onRow ? 'clickable' : '' });
      if (onRow) { tr.tabIndex = 0; tr.addEventListener('click', (e) => { if (!e.target.closest('button,a,input,select')) onRow(r); }); tr.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target === tr) onRow(r); }); }
      for (const c of columns) { const v = c.render ? c.render(r) : r[c.key]; tr.appendChild(h('td', { class: c.num ? 'num' : '' }, v === null || v === undefined || v === '' ? '—' : v)); }
      tbody.appendChild(tr);
    }
    mount(pager, h('span', `${list.length} row${list.length === 1 ? '' : 's'}${q ? ' (filtered)' : ''}`),
      pages > 1 ? h('span.row', btn('Previous', () => { page--; draw(); }, { sm: true, disabled: page === 0 }), h('span', `Page ${page + 1} of ${pages}`), btn('Next', () => { page++; draw(); }, { sm: true, disabled: page >= pages - 1 })) : null);
  }
  if (search) wrap.appendChild(h('div.toolbar', sIn));
  wrap.appendChild(h('div.table-wrap', tbl, pager));
  draw();
  wrap.update = (newRows) => { rows = newRows; draw(); };
  return wrap;
}

// ── Files ───────────────────────────────────────────────────────────────
export function download(filename, content, type = 'text/plain;charset=utf-8') {
  const blob = content instanceof Blob ? content : new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: filename }); document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
export function readFileText(file) { return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(r.error); r.readAsText(file); }); }
export function filePicker(accept, onText, label = 'Choose file') {
  const inp = h('input', { type: 'file', accept, class: 'sr-only', on: { change: async (e) => { const f = e.target.files?.[0]; if (f) onText(await readFileText(f), f); e.target.value = ''; } } });
  const b = btn(label, () => inp.click(), { ic: 'upload' });
  return h('span', b, inp);
}

// ── Charts (Chart.js vendored at /vendor/chart.umd.js, loaded as a classic script) ──
const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
export const palette = () => ['--c1', '--c2', '--c3', '--c4', '--c5', '--c6'].map(css);
export function chart(type, data, options = {}, { height = null, sm = false, label = 'Chart' } = {}) {
  const box = h('div', { class: 'chart-box' + (sm ? ' sm' : ''), style: height ? { height: height + 'px' } : null });
  const canvas = h('canvas', { role: 'img', 'aria-label': label });
  box.appendChild(canvas);
  if (!window.Chart) { box.replaceChildren(h('p.muted', 'Charts could not be loaded.')); return box; }
  const ink = css('--ink-2'), grid = css('--line');
  const ch = new window.Chart(canvas, {
    type, data,
    options: {
      responsive: true, maintainAspectRatio: false, animation: matchMedia('(prefers-reduced-motion: reduce)').matches ? false : { duration: 300 },
      plugins: { legend: { labels: { color: ink, boxWidth: 12 } }, tooltip: { mode: 'index', intersect: false } },
      scales: type === 'doughnut' || type === 'radar' ? undefined : { x: { ticks: { color: ink }, grid: { color: grid } }, y: { ticks: { color: ink }, grid: { color: grid }, beginAtZero: true } },
      ...options,
    },
  });
  box.chart = ch;
  return box;
}

// ── Misc formatting ─────────────────────────────────────────────────────
export function rel(ms) {
  if (!ms) return '—';
  const d = Date.now() - ms, day = 864e5;
  if (d < 6e4) return 'just now'; if (d < 36e5) return Math.round(d / 6e4) + ' min ago'; if (d < day) return Math.round(d / 36e5) + ' h ago';
  if (d < 30 * day) return Math.round(d / day) + ' d ago'; return fmtDate(ms);
}
export function n(x) { return x === null || x === undefined ? '—' : Number(x).toLocaleString('en-GB'); }
