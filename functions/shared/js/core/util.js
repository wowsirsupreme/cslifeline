// Small shared helpers. No DOM access here so the module also runs in Node tests.

/** Escape text for safe insertion into HTML (fixes the v3 stored-XSS findings). */
export function esc(v) {
  if (v === null || v === undefined) return '';
  return String(v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** Random identifier. Not derived from any personal data. */
export function randomId(prefix = '', len = 16) {
  const abc = 'abcdefghijkmnpqrstuvwxyz23456789';
  let out = '';
  const g = globalThis.crypto;
  if (g && g.getRandomValues) {
    const buf = new Uint32Array(len);
    g.getRandomValues(buf);
    for (let i = 0; i < len; i++) out += abc[buf[i] % abc.length];
  } else {
    for (let i = 0; i < len; i++) out += abc[Math.floor(Math.random() * abc.length)];
  }
  return prefix + out;
}

/** Pseudonymous learner identifier used in every research export. */
export function newPseudoId() { return randomId('L-', 10).toUpperCase(); }

/** Convert Firestore Timestamp, Date, ISO string or epoch ms to epoch ms. */
export function toMs(t) {
  if (t === null || t === undefined || t === '') return null;
  if (typeof t === 'number') return t;
  if (t instanceof Date) return t.getTime();
  if (typeof t === 'string') { const v = Date.parse(t); return Number.isNaN(v) ? null : v; }
  if (typeof t.toMillis === 'function') return t.toMillis();
  if (typeof t.seconds === 'number') return t.seconds * 1000 + Math.floor((t.nanoseconds || 0) / 1e6);
  return null;
}

export function isoDate(t) { const ms = toMs(t); return ms === null ? '' : new Date(ms).toISOString(); }

export function fmtDate(t, withTime = false) {
  const ms = toMs(t);
  if (ms === null) return '—';
  const d = new Date(ms);
  const opts = { day: 'numeric', month: 'short', year: 'numeric' };
  if (withTime) Object.assign(opts, { hour: '2-digit', minute: '2-digit' });
  return d.toLocaleString('en-GB', opts);
}

export function fmtPct(x, digits = 0) {
  if (x === null || x === undefined || Number.isNaN(x)) return '—';
  return (x * 100).toFixed(digits) + '%';
}

export function fmtDuration(ms) {
  if (ms === null || ms === undefined) return '—';
  const s = Math.round(ms / 1000);
  if (s < 60) return s + 's';
  const m = Math.floor(s / 60);
  return m + 'm ' + String(s % 60).padStart(2, '0') + 's';
}

export const DAY = 86400000;

export function mean(arr) { return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null; }

export function groupBy(arr, keyFn) {
  const m = new Map();
  for (const x of arr) {
    const k = typeof keyFn === 'function' ? keyFn(x) : x[keyFn];
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(x);
  }
  return m;
}

/** Least-squares slope of y against x. Returns null for fewer than 3 points. */
export function slope(xs, ys) {
  const n = xs.length;
  if (n < 3) return null;
  const mx = mean(xs), my = mean(ys);
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) { num += (xs[i] - mx) * (ys[i] - my); den += (xs[i] - mx) ** 2; }
  return den === 0 ? 0 : num / den;
}

export function clamp(x, lo, hi) { return Math.max(lo, Math.min(hi, x)); }

export function uniq(arr) { return [...new Set(arr)]; }

/** Deterministic string hash (FNV-1a), used for stable IDs and seeded shuffles. */
export function hash32(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}

export function seededShuffle(arr, seed) {
  const a = [...arr];
  let s = seed >>> 0;
  const rnd = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

export function shuffle(arr) { return seededShuffle(arr, (Math.random() * 2 ** 32) >>> 0); }

/** Remove keys whose value is undefined (Firestore rejects undefined). */
export function clean(obj) {
  if (Array.isArray(obj)) return obj.map(clean);
  if (obj && typeof obj === 'object' && obj.constructor === Object) {
    const out = {};
    for (const [k, v] of Object.entries(obj)) if (v !== undefined) out[k] = clean(v);
    return out;
  }
  return obj;
}
