// js/ui/shell.js — application shell shared by the student, teacher and admin portals.
// Navigation pattern informed by WOW Sir's TeacherNav (grouped sidebar) and DBWOW's NavPane,
// with a drawer on small screens. Hash routing keeps every page deep-linkable on static hosting.

import { store } from '../core/store.js';
import { setMode } from '../core/config.js';
import { h, icon, mount, clear, skeleton, toast, btn, callout, errorToast, friendlyError } from './kit.js';

const HOME = { student: '/student/', teacher: '/teacher/', admin: '/admin/' };
export function portalFor(role) { return role === 'admin' ? HOME.admin : role === 'teacher' ? HOME.teacher : role === 'student' ? HOME.student : '/'; }

function applyTheme() { try { const t = localStorage.getItem('csl.theme'); if (t) document.documentElement.dataset.theme = t; } catch { /* ignore */ } }
function toggleTheme() {
  const cur = document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  const next = cur === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next; try { localStorage.setItem('csl.theme', next); } catch { /* ignore */ }
}

export const brandMark = () => h('span.brand-mark', icon('lifeline'));

/**
 * @param cfg { portal: 'student'|'teacher'|'admin', allow: [roles], nav: [{ group, items: [{ path, label, ic, badge?() }] }], routes: [{ path, view }] }
 */
export async function startPortal(cfg) {
  applyTheme();
  const root = document.getElementById('app');
  mount(root, h('div', { style: { padding: '2rem' } }, skeleton()));
  try { await store.init(); }
  catch (e) { mount(root, h('div.main', callout(['CS Lifeline could not connect to its database. ', friendlyError(e)], 'danger'), h('p', h('a', { href: '/?mode=demo' }, 'Open the demonstration instead')))); return; }

  if (!store.auth) { location.replace('/?next=' + encodeURIComponent(location.pathname + location.hash)); return; }
  if (!store.me) { location.replace('/?complete=1'); return; }
  const role = store.me.role;
  if (store.me.status === 'suspended' || store.me.status === 'erased') return blocked(root, 'Your account is not active', 'Your account has been suspended. Please speak to your teacher or the school administrator.');
  if (role === 'teacher_pending') return blocked(root, 'Your teacher account is awaiting approval', 'An administrator must approve your account and assign your classes before you can use the teacher portal. You will be able to sign in here as soon as that is done.');
  if (!cfg.allow.includes(role)) { location.replace(portalFor(role)); return; }

  const ctx = { store, portal: cfg.portal, role, navigate, refreshNav: () => drawNav(), params: {} };
  const main = h('main.main', { id: 'main', tabindex: '-1' });
  const side = h('nav.sidebar', { 'aria-label': 'Main navigation' });
  const scrim = h('div.scrim', { on: { click: () => closeNav() } });
  const outbox = h('span.badge.warn', { hidden: true, title: 'Answers saved on this device and waiting to be sent' });
  const offline = h('span.badge.warn', { hidden: navigator.onLine }, icon('wifioff'), 'Offline');
  const menuBtn = h('button', { type: 'button', class: 'btn ghost icon-btn menu-btn', 'aria-label': 'Open menu', 'aria-expanded': 'false', on: { click: () => side.classList.contains('open') ? closeNav() : openNav() } }, icon('menu'));
  const userBox = h('div.row', { style: { gap: '.4rem' } },
    h('span.small.muted', { style: { maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis' } }, store.me.display_name || store.auth.email),
    h('button', { type: 'button', class: 'btn ghost icon-btn', title: 'Light or dark theme', 'aria-label': 'Toggle light or dark theme', on: { click: toggleTheme } }, icon('sun')),
    h('button', { type: 'button', class: 'btn ghost sm', on: { click: async () => { await store.signOut(); location.href = '/'; } } }, icon('logout'), h('span', 'Sign out')));
  const top = h('header.topbar', menuBtn,
    h('a.brand', { href: HOME[cfg.portal] + '#/' }, brandMark(), h('span', 'CS Lifeline'), h('small', { style: { marginLeft: '.3rem' } }, cfg.portal)),
    store.isDemo ? h('span.badge.demo', { title: 'Every record in this mode is synthetic and stays in this browser' }, 'DEMONSTRATION — synthetic data') : null,
    h('span.spacer'), offline, outbox, userBox);
  mount(root, top, h('div.layout', side, scrim, main));
  window.addEventListener('online', () => { offline.hidden = true; store.flushOutbox(); });
  window.addEventListener('offline', () => { offline.hidden = false; });
  const setOutbox = (n) => { outbox.hidden = !n; outbox.textContent = `${n} waiting to send`; };
  store.onOutboxChange = setOutbox; setOutbox(store.pendingCount());

  function openNav() { side.classList.add('open'); scrim.classList.add('open'); menuBtn.setAttribute('aria-expanded', 'true'); }
  function closeNav() { side.classList.remove('open'); scrim.classList.remove('open'); menuBtn.setAttribute('aria-expanded', 'false'); }

  async function drawNav() {
    clear(side);
    const cur = currentPath();
    for (const g of cfg.nav) {
      if (g.group) side.appendChild(h('div.nav-group', g.group));
      for (const it of g.items) {
        const active = it.path === '/' ? cur === '/' : cur === it.path || cur.startsWith(it.path + '/');
        const a = h('a', { class: 'nav-link', href: '#' + it.path, 'aria-current': active ? 'page' : null, on: { click: () => closeNav() } }, icon(it.ic), h('span', it.label));
        side.appendChild(a);
        if (it.badge) Promise.resolve(it.badge(ctx)).then(n => { if (n) a.appendChild(h('span.count', String(n))); }).catch(() => {});
      }
    }
    if (store.isDemo) side.appendChild(h('div', { style: { margin: '1.5rem .6rem 0' } }, callout([h('strong', 'Demonstration mode. '), 'All learners, results and predictions are synthetic. ',
      h('a', { href: '#', on: { click: (e) => { e.preventDefault(); store.backend.resetDemo(); location.reload(); } } }, 'Reset'), ' · ',
      h('a', { href: '/', on: { click: () => { setMode('firebase'); } } }, 'Leave demo')], 'demo')));
  }

  function currentPath() { return (location.hash.replace(/^#/, '') || '/').split('?')[0] || '/'; }
  function navigate(path) { if (location.hash === '#' + path) route(); else location.hash = path; }
  let seq = 0;
  async function route() {
    const path = currentPath();
    const my = ++seq;
    drawNav();
    let match = null, params = {};
    for (const r of cfg.routes) {
      const names = []; const re = new RegExp('^' + r.path.replace(/:[a-zA-Z_]+/g, (m) => { names.push(m.slice(1)); return '([^/]+)'; }) + '/?$');
      const m = re.exec(path);
      if (m) { match = r; params = Object.fromEntries(names.map((n, i) => [n, decodeURIComponent(m[i + 1])])); break; }
    }
    const query = Object.fromEntries(new URLSearchParams(location.hash.split('?')[1] || ''));
    mount(main, skeleton());
    if (!match) { mount(main, h('div.card', h('h1', 'Page not found'), h('p', 'This page does not exist.'), btn('Go to the start page', () => navigate('/'), { kind: 'primary' }))); return; }
    try {
      const node = await match.view({ ...ctx, params, query });
      if (my !== seq) return; // a newer navigation has started
      mount(main, node);
      document.title = (main.querySelector('h1')?.textContent || 'CS Lifeline') + ' · CS Lifeline';
      main.focus({ preventScroll: true }); window.scrollTo(0, 0);
    } catch (e) {
      if (my !== seq) return;
      console.error(e);
      mount(main, h('div.card', h('h1', 'Something went wrong'), callout(friendlyError(e), 'danger'), h('div.row', { style: { marginTop: '1rem' } }, btn('Try again', () => route(), { kind: 'primary' }), btn('Start page', () => navigate('/')))));
    }
  }
  window.addEventListener('hashchange', route);
  route();
  return ctx;
}

function blocked(root, title, text) {
  mount(root, h('div.auth-wrap', h('div.auth-intro', h('a.brand', { href: '/' }, brandMark(), 'CS Lifeline'), h('h1', title), h('p.ink2', text)),
    h('div.auth-panel', h('div.auth-card.card', h('p', 'Signed in as ', h('strong', store.auth?.email || store.me?.display_name || '')),
      btn('Sign out', async () => { await store.signOut(); location.href = '/'; }, { kind: 'primary', ic: 'logout' })))));
}

export { toast, errorToast };
