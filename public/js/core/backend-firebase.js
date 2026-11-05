// Firebase backend (production). Implements the same generic interface as
// backend-demo.js. The Firebase SDK is loaded only when this backend is used,
// so the demonstration never contacts Google services.

import { CONFIG } from './config.js';
import { clean } from './util.js';

const V = CONFIG.firebaseSdkVersion;
const CDN = `https://www.gstatic.com/firebasejs/${V}`;

export class FirebaseBackend {
  constructor() {
    this.mode = 'firebase';
    this.capabilities = { serverScoring: CONFIG.functionsDeployed, storage: true, realtime: true };
    this._ready = null;
  }

  async init() {
    if (this._ready) return this._ready;
    this._ready = (async () => {
      const [appM, fsM, authM] = await Promise.all([
        import(`${CDN}/firebase-app.js`),
        import(`${CDN}/firebase-firestore.js`),
        import(`${CDN}/firebase-auth.js`),
      ]);
      this.fs = fsM; this.au = authM;
      this.app = appM.getApps()[0] || appM.initializeApp(CONFIG.firebase);
      try {
        // Offline persistence: writes made while offline are queued and sent on reconnection.
        this.db = fsM.initializeFirestore(this.app, {
          localCache: fsM.persistentLocalCache({ tabManager: fsM.persistentMultipleTabManager() }),
        });
      } catch {
        this.db = fsM.getFirestore(this.app);
      }
      this.auth = authM.getAuth(this.app);
    })();
    return this._ready;
  }

  // ── Auth ──────────────────────────────────────────────────────────────────
  async authReady() {
    await this.init();
    if (typeof this.auth.authStateReady === 'function') await this.auth.authStateReady();
    else await new Promise(r => { const u = this.au.onAuthStateChanged(this.auth, () => { u(); r(); }); });
    return this.currentAuth();
  }
  currentAuth() {
    const u = this.auth?.currentUser;
    return u ? { uid: u.uid, email: u.email || '', displayName: u.displayName || '', provider: u.providerData?.[0]?.providerId || 'password', emailVerified: u.emailVerified } : null;
  }
  async signInEmail(email, password) {
    await this.init();
    await this.au.signInWithEmailAndPassword(this.auth, email, password);
    return this.currentAuth();
  }
  async signUpEmail(email, password, displayName) {
    await this.init();
    const cred = await this.au.createUserWithEmailAndPassword(this.auth, email, password);
    if (displayName) await this.au.updateProfile(cred.user, { displayName });
    try { await this.au.sendEmailVerification(cred.user); } catch { /* optional */ }
    return this.currentAuth();
  }
  async signInGoogle() {
    await this.init();
    const p = new this.au.GoogleAuthProvider();
    p.setCustomParameters({ prompt: 'select_account' });
    await this.au.signInWithPopup(this.auth, p);
    return this.currentAuth();
  }
  async sendReset(email) { await this.init(); return this.au.sendPasswordResetEmail(this.auth, email); }
  async signOut() { await this.init(); return this.au.signOut(this.auth); }

  // ── Generic document API ──────────────────────────────────────────────────
  serverTime() { return this.fs.serverTimestamp(); }

  _ref(col, id) { return this.fs.doc(this.db, col, id); }

  async get(col, id) {
    await this.init();
    const s = await this.fs.getDoc(this._ref(col, id));
    return s.exists() ? { ...s.data(), id: s.id } : null;
  }
  async set(col, id, data, { merge = false } = {}) {
    await this.init();
    await this.fs.setDoc(this._ref(col, id), clean(data), { merge });
    return id;
  }
  async add(col, data) {
    await this.init();
    const r = await this.fs.addDoc(this.fs.collection(this.db, col), clean(data));
    return r.id;
  }
  async update(col, id, patch) { await this.init(); await this.fs.updateDoc(this._ref(col, id), clean(patch)); return id; }
  async remove(col, id) { await this.init(); await this.fs.deleteDoc(this._ref(col, id)); }

  _q(col, where, opts = {}) {
    const f = this.fs;
    const c = [];
    for (const [field, op, val] of where) c.push(f.where(field, op, val));
    if (opts.orderBy) c.push(f.orderBy(opts.orderBy, opts.direction || 'asc'));
    if (opts.limit) c.push(f.limit(opts.limit));
    return f.query(f.collection(this.db, col), ...c);
  }

  async query(col, where = [], opts = {}) {
    await this.init();
    // Firestore limits `in` to 30 values: split and merge.
    const inIdx = where.findIndex(w => w[1] === 'in' && Array.isArray(w[2]) && w[2].length > 30);
    if (inIdx >= 0) {
      const vals = where[inIdx][2];
      const out = [];
      for (let i = 0; i < vals.length; i += 30) {
        const w = where.slice(); w[inIdx] = [where[inIdx][0], 'in', vals.slice(i, i + 30)];
        out.push(...await this.query(col, w, { ...opts, limit: undefined }));
      }
      return opts.limit ? out.slice(0, opts.limit) : out;
    }
    if (where.some(w => w[1] === 'in' && Array.isArray(w[2]) && w[2].length === 0)) return [];
    const snap = await this.fs.getDocs(this._q(col, where, opts));
    return snap.docs.map(d => ({ ...d.data(), id: d.id }));
  }

  async batch(ops) {
    await this.init();
    for (let i = 0; i < ops.length; i += 450) {
      const b = this.fs.writeBatch(this.db);
      for (const op of ops.slice(i, i + 450)) {
        const r = this._ref(op.col, op.id);
        if (op.type === 'set') b.set(r, clean(op.data), { merge: !!op.merge });
        else if (op.type === 'update') b.update(r, clean(op.data));
        else if (op.type === 'delete') b.delete(r);
      }
      await b.commit();
    }
  }

  subscribe(col, where, cb, onError) {
    let unsub = () => {};
    this.init().then(() => {
      unsub = this.fs.onSnapshot(this._q(col, where),
        s => cb(s.docs.map(d => ({ ...d.data(), id: d.id }))),
        e => { console.warn('subscribe ' + col + ':', e.message); onError && onError(e); });
    });
    return () => unsub();
  }

  async uploadFile(path, file) {
    await this.init();
    const st = await import(`${CDN}/firebase-storage.js`);
    const storage = st.getStorage(this.app);
    const r = st.ref(storage, path);
    await st.uploadBytes(r, file, { contentType: file.type });
    return st.getDownloadURL(r);
  }
}
