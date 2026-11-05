// Demonstration backend.
//
// Loads a synthetic dataset (data/demo/demo_dataset.json, produced by
// ml/cslifeline_ml/synthetic.py) into memory and keeps every change the visitor
// makes in a separate overlay in localStorage. The base file is never modified,
// so "Reset demonstration" always returns to the same starting point.
//
// Every record in this backend is synthetic. Nothing here is sent anywhere.
// It mirrors the generic interface of backend-firebase.js so the rest of the app
// cannot tell the two apart (the same pattern DBWOW uses for its test backend).

import { randomId, toMs } from './util.js';

const OVERLAY_KEY = 'csl.demo.overlay.v2';
const AUTH_KEY = 'csl.demo.auth.v2';

function readJSON(key, fallback) {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
}
function writeJSON(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); return true; } catch { return false; }
}

function getPath(obj, path) {
  return path.split('.').reduce((o, k) => (o === null || o === undefined ? undefined : o[k]), obj);
}

function cmp(a, b) {
  const ta = toMs(a), tb = toMs(b);
  if (ta !== null && tb !== null && typeof a !== 'number') return ta - tb;
  if (a === b) return 0;
  if (a === undefined || a === null) return -1;
  if (b === undefined || b === null) return 1;
  return a < b ? -1 : 1;
}

export function matches(doc, where) {
  for (const [field, op, val] of where) {
    const v = getPath(doc, field);
    switch (op) {
      case '==': if (v !== val) return false; break;
      case '!=': if (v === val) return false; break;
      case 'in': if (!val.includes(v)) return false; break;
      case 'array-contains': if (!Array.isArray(v) || !v.includes(val)) return false; break;
      case 'array-contains-any': if (!Array.isArray(v) || !v.some(x => val.includes(x))) return false; break;
      case '>': if (v === undefined || cmp(v, val) <= 0) return false; break;
      case '>=': if (v === undefined || cmp(v, val) < 0) return false; break;
      case '<': if (v === undefined || cmp(v, val) >= 0) return false; break;
      case '<=': if (v === undefined || cmp(v, val) > 0) return false; break;
      default: throw new Error('Unsupported operator ' + op);
    }
  }
  return true;
}

function deepMerge(base, patch) {
  const out = { ...(base || {}) };
  for (const [k, v] of Object.entries(patch)) {
    if (v && typeof v === 'object' && !Array.isArray(v) && v.constructor === Object && out[k] && typeof out[k] === 'object' && !Array.isArray(out[k])) {
      out[k] = deepMerge(out[k], v);
    } else out[k] = v;
  }
  return out;
}

export class DemoBackend {
  constructor({ datasetUrl, dataset } = {}) {
    this.mode = 'demo';
    this.datasetUrl = datasetUrl || new URL('../../data/demo/demo_dataset.json', import.meta.url).href;
    this._preloaded = dataset || null;
    this.base = null;
    this.meta = null;
    this.overlay = readJSON(OVERLAY_KEY, {});
    this.listeners = new Set();
    this._loading = null;
    this.capabilities = { serverScoring: false, storage: false, realtime: true };
  }

  async load() {
    if (this.base) return;
    if (!this._loading) {
      this._loading = (async () => {
        let data = this._preloaded;
        if (!data) {
          const res = await fetch(this.datasetUrl);
          if (!res.ok) throw new Error('Could not load the demonstration dataset (' + res.status + ')');
          data = await res.json();
        }
        this.meta = data.meta || {};
        this.base = {};
        for (const [col, docs] of Object.entries(data.collections || {})) {
          const m = new Map();
          for (const d of docs) m.set(d.id, d);
          this.base[col] = m;
        }
      })();
    }
    await this._loading;
  }

  _persist() {
    if (!writeJSON(OVERLAY_KEY, this.overlay)) {
      console.warn('Demo overlay could not be saved (storage full or unavailable); changes are kept for this tab only.');
    }
  }

  _emit(col) { for (const l of this.listeners) if (l.col === col) l.fire(); }

  _all(col) {
    const out = new Map(this.base?.[col] || []);
    const ov = this.overlay[col] || {};
    for (const [id, d] of Object.entries(ov)) { if (d === null) out.delete(id); else out.set(id, d); }
    return out;
  }

  // ── Auth (demonstration accounts; no passwords are stored or checked) ─────
  async authReady() { await this.load(); return this.currentAuth(); }
  currentAuth() { return readJSON(AUTH_KEY, null); }
  async demoAccounts() {
    await this.load();
    return [...this._all('users').values()].filter(u => u.demo_login).map(u => ({ uid: u.id, display_name: u.display_name, role: u.role, class_code: u.class_code || null, email: u.email || '' }));
  }
  async signInDemo(uid) {
    await this.load();
    const u = this._all('users').get(uid);
    if (!u) throw new Error('Unknown demonstration account');
    const auth = { uid, email: u.email || '', displayName: u.display_name, provider: 'demo' };
    writeJSON(AUTH_KEY, auth);
    return auth;
  }
  async signInEmail(email) {
    await this.load();
    const u = [...this._all('users').values()].find(x => (x.email || '').toLowerCase() === String(email).toLowerCase());
    if (!u) { const e = new Error('No demonstration account uses that email. Choose an account from the list.'); e.code = 'auth/user-not-found'; throw e; }
    return this.signInDemo(u.id);
  }
  async signUpEmail(email, _password, displayName) {
    await this.load();
    if ([...this._all('users').values()].some(x => (x.email || '').toLowerCase() === String(email).toLowerCase())) {
      const e = new Error('An account with this email already exists.'); e.code = 'auth/email-already-in-use'; throw e;
    }
    const uid = randomId('demo_u_', 12);
    const auth = { uid, email, displayName, provider: 'demo' };
    writeJSON(AUTH_KEY, auth);
    return auth;
  }
  async signInGoogle() { throw new Error('Google sign-in is not available in demonstration mode.'); }
  async sendReset() { return true; }
  async signOut() { try { localStorage.removeItem(AUTH_KEY); } catch { /* ignore */ } }

  // ── Generic document API ──────────────────────────────────────────────────
  serverTime() { return new Date().toISOString(); }

  async get(col, id) { await this.load(); const d = this._all(col).get(id); return d ? { ...d, id } : null; }

  async set(col, id, data, { merge = false } = {}) {
    await this.load();
    const prev = this._all(col).get(id);
    const next = merge && prev ? deepMerge(prev, data) : { ...data };
    next.id = id;
    (this.overlay[col] ||= {})[id] = next;
    this._persist(); this._emit(col);
    return id;
  }

  async add(col, data) { const id = randomId('', 20); await this.set(col, id, data); return id; }

  async update(col, id, patch) {
    await this.load();
    const prev = this._all(col).get(id);
    if (!prev) { const e = new Error(`No document ${col}/${id}`); e.code = 'not-found'; throw e; }
    return this.set(col, id, patch, { merge: true });
  }

  async remove(col, id) {
    await this.load();
    (this.overlay[col] ||= {})[id] = null;
    this._persist(); this._emit(col);
  }

  async query(col, where = [], { orderBy, direction = 'asc', limit } = {}) {
    await this.load();
    let docs = [...this._all(col).entries()].map(([id, d]) => ({ ...d, id })).filter(d => matches(d, where));
    if (orderBy) {
      docs.sort((a, b) => cmp(getPath(a, orderBy), getPath(b, orderBy)) * (direction === 'desc' ? -1 : 1));
    }
    if (limit) docs = docs.slice(0, limit);
    return docs;
  }

  async batch(ops) {
    await this.load();
    for (const op of ops) {
      if (op.type === 'set') await this.set(op.col, op.id, op.data, { merge: !!op.merge });
      else if (op.type === 'update') await this.update(op.col, op.id, op.data);
      else if (op.type === 'delete') await this.remove(op.col, op.id);
    }
  }

  subscribe(col, where, cb) {
    const l = { col, fire: async () => cb(await this.query(col, where)) };
    this.listeners.add(l);
    l.fire();
    return () => this.listeners.delete(l);
  }

  async uploadFile(_path, file) {
    // No storage service in demonstration mode: images are kept inline as data URLs.
    return await new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = () => reject(r.error);
      r.readAsDataURL(file);
    });
  }

  resetDemo() {
    try { localStorage.removeItem(OVERLAY_KEY); localStorage.removeItem(AUTH_KEY); } catch { /* ignore */ }
    this.overlay = {};
  }
}
