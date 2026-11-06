// Sign-in, registration and demonstration entry.
// Security changes from v3: no derived/predictable passwords (audit S4); roles are never
// self-assigned beyond 'student' (joining an open class) or 'teacher_pending' (S1–S3).

import { store } from '../core/store.js';
import { CONFIG, setMode } from '../core/config.js';
import { h, mount, btn, field, input, select, callout, tabs, toast, friendlyError, icon, clear } from '../ui/kit.js';
import { brandMark, portalFor } from '../ui/shell.js';

const root = document.getElementById('app');
const params = new URLSearchParams(location.search);

function intro() {
  return h('section.auth-intro',
    h('a.brand', { href: '/' }, brandMark(), h('span', 'CS Lifeline')),
    h('h1', 'See what your Computer Science students misunderstand — early enough to help.'),
    h('p.ink2', 'CS Lifeline is a learning analytics and early-warning system for Cambridge IGCSE Computer Science (0478). It turns everyday practice and assessments into evidence teachers can act on.'),
    h('ul', h('li', 'Practice and assessments with explanations, for every question type in the syllabus'),
      h('li', 'Misconception detection that needs repeated evidence, never a single wrong answer'),
      h('li', 'Early-warning indicators that explain themselves and are clearly labelled when they are demonstrations'),
      h('li', 'Intervention tracking that compares evidence before and after support')),
    h('p.small.muted', { style: { marginTop: '1.5rem' } }, `Version ${CONFIG.appVersion}. Student data is used only to support learning in your school. `, h('a', { href: '/privacy.html' }, 'How data is used')));
}

async function main() {
  await store.init().catch(e => { mount(root, h('div.main', callout('Could not start: ' + friendlyError(e), 'danger'))); throw e; });
  if (store.auth && store.me && !params.get('complete')) { location.replace(params.get('next') || portalFor(store.me.role)); return; }
  const panel = h('div.auth-card');
  mount(root, h('div.auth-wrap', intro(), h('section.auth-panel', panel)));
  if (store.auth && !store.me) return completeProfile(panel);
  if (store.isDemo) return demoPanel(panel);
  const body = h('div');
  mount(panel, h('div.card', h('h2', 'Welcome'), tabs([
    { id: 'student', label: 'Student' }, { id: 'register', label: 'Join a class' }, { id: 'teacher', label: 'Teacher or admin' }, { id: 'demo', label: 'Try the demo' },
  ], (id) => ({ student: studentSignIn, register: studentRegister, teacher: teacherPanel, demo: demoInvite })[id](body), params.get('tab') || 'student'), body));
}

function errBox() { return h('div', { role: 'alert', 'aria-live': 'assertive' }); }
function showErr(box, e) { mount(box, callout(friendlyError(e), 'danger')); }
async function after(next) { location.href = params.get('next') || portalFor(store.me?.role); }

function studentSignIn(body) {
  const email = input('', { type: 'email', autocomplete: 'username', required: true });
  const pass = input('', { type: 'password', autocomplete: 'current-password', required: true });
  const err = errBox();
  const form = h('form', { on: { submit: async (e) => { e.preventDefault(); clear(err); try { await store.signInEmail(email.value.trim(), pass.value); if (!store.me) return completeProfile(body); await after(); } catch (x) { showErr(err, x); } } } },
    field('Email or student login', email, 'If your teacher gave you a login and access code, enter them here.'),
    field('Password or access code', pass), err,
    h('div.row', btn('Sign in', null, { kind: 'primary', type: 'submit' }),
      btn('Forgot password?', async () => { if (!email.value.includes('@')) return mount(err, callout('Enter your email first.', 'warn')); try { await store.resetPassword(email.value.trim()); mount(err, callout('If an account exists, a reset link has been sent.', 'ok')); } catch (x) { showErr(err, x); } }, { kind: 'ghost' })),
    CONFIG.googleSignIn ? h('div', { style: { marginTop: '1rem' } }, btn('Continue with Google', async () => { clear(err); try { await store.signInGoogle(); if (!store.me) return completeProfile(body); await after(); } catch (x) { showErr(err, x); } })) : null);
  mount(body, form);
}

function studentRegister(body) {
  const name = input('', { autocomplete: 'name', maxlength: 60, required: true });
  const code = input(params.get('class') || '', { autocomplete: 'off', required: true, style: { textTransform: 'uppercase' } });
  const email = input('', { type: 'email', autocomplete: 'email', required: true });
  const pass = input('', { type: 'password', autocomplete: 'new-password', minlength: 8, required: true });
  const err = errBox();
  mount(body, h('form', { on: { submit: async (e) => {
      e.preventDefault(); clear(err);
      if (pass.value.length < 8) return mount(err, callout('Choose a password of at least 8 characters.', 'warn'));
      try { await store.signUpEmail({ email: email.value.trim(), password: pass.value, displayName: name.value.trim(), intent: 'student', classCode: code.value.trim().toUpperCase() }); await after(); }
      catch (x) { showErr(err, x); }
    } } },
    h('p.small.muted', 'Your teacher will give you a class code. If you do not have an email address, ask your teacher for a student login instead.'),
    field('Your name (as your teacher knows you)', name), field('Class code', code), field('Email', email), field('Password', pass, 'At least 8 characters.'), err,
    btn('Create account', null, { kind: 'primary', type: 'submit' })));
}

function teacherPanel(body) {
  const email = input('', { type: 'email', autocomplete: 'username' });
  const pass = input('', { type: 'password', autocomplete: 'current-password' });
  const err = errBox();
  const reqName = input('', { maxlength: 60 }), reqEmail = input('', { type: 'email' }), reqPass = input('', { type: 'password', autocomplete: 'new-password' });
  const err2 = errBox();
  mount(body,
    h('form', { on: { submit: async (e) => { e.preventDefault(); clear(err); try { await store.signInEmail(email.value.trim(), pass.value); if (!store.me) return completeProfile(body); await after(); } catch (x) { showErr(err, x); } } } },
      field('Email', email), field('Password', pass), err,
      h('div.row', btn('Sign in', null, { kind: 'primary', type: 'submit' }), CONFIG.googleSignIn ? btn('Continue with Google', async () => { clear(err); try { await store.signInGoogle(); if (!store.me) return completeProfile(body); await after(); } catch (x) { showErr(err, x); } }) : null)),
    h('hr.divider'),
    h('details', h('summary', { style: { cursor: 'pointer', fontWeight: 600 } }, 'New teacher? Request an account'),
      h('form', { style: { marginTop: '.8rem' }, on: { submit: async (e) => { e.preventDefault(); clear(err2); try { await store.signUpEmail({ email: reqEmail.value.trim(), password: reqPass.value, displayName: reqName.value.trim(), intent: 'teacher' }); location.href = '/teacher/'; } catch (x) { showErr(err2, x); } } } },
        h('p.small.muted', 'An administrator approves teacher accounts and assigns classes. Signing up does not give access to any student data until then.'),
        field('Full name', reqName), field('School email', reqEmail), field('Password', reqPass, 'At least 8 characters.'), err2, btn('Request teacher account', null, { kind: 'primary', type: 'submit' }))));
}

function demoInvite(body) {
  mount(body, h('div.stack',
    h('p', 'The demonstration runs entirely in your browser with a synthetic dataset of four schools, 18 classes and about 400 learners. Nothing is sent to any server and no real student is involved.'),
    callout('Results and predictions in the demonstration are produced from synthetic data. They show how the software works; they are not evidence of how well the model predicts real learners.', 'demo'),
    btn('Open the demonstration', () => { setMode('demo'); location.href = '/?mode=demo'; }, { kind: 'primary', ic: 'play' })));
}

async function demoPanel(panel) {
  let accounts = [];
  try { accounts = await store.demoAccounts(); } catch (e) { mount(panel, callout('The demonstration dataset could not be loaded: ' + friendlyError(e), 'danger')); return; }
  const group = (role, title) => {
    const list = accounts.filter(a => a.role === role).slice(0, role === 'student' ? 6 : 4);
    return list.length ? h('div', { style: { marginBottom: '1rem' } }, h('h3', title), h('div.stack', ...list.map(a => h('button', { type: 'button', class: 'btn', style: { width: '100%', justifyContent: 'space-between' },
      on: { click: async () => { await store.signInDemo(a.uid); location.href = portalFor(role); } } }, h('span', a.display_name), h('span.small.muted', a.class_code || (role === 'admin' ? 'Administrator' : 'Teacher')))))) : null;
  };
  mount(panel, h('div.card', h('div.card-head', h('h2', 'Demonstration'), h('span.badge.demo', 'Synthetic data')),
    callout('Choose an account to explore. Changes you make are kept only in this browser; use Reset in the sidebar to start again.', 'demo'),
    h('div', { style: { marginTop: '1rem' } }, group('teacher', 'Teachers'), group('admin', 'Administrator'), group('student', 'Students')),
    btn('Leave the demonstration', () => { setMode('firebase'); location.href = '/'; }, { kind: 'ghost' })));
}

async function completeProfile(panel) {
  const name = input(store.auth?.displayName || '', { maxlength: 60 });
  const code = input('', { style: { textTransform: 'uppercase' } });
  const kind = select([['student', 'I am a student joining a class'], ['teacher', 'I am a teacher (needs administrator approval)']], 'student');
  const codeField = field('Class code', code);
  kind.addEventListener('change', () => { codeField.hidden = kind.value !== 'student'; });
  const err = errBox();
  mount(panel, h('div.card', h('h2', 'Finish setting up your account'), h('p.small.muted', `Signed in as ${store.auth?.email || 'your account'}.`),
    h('form', { on: { submit: async (e) => { e.preventDefault(); clear(err); try { await store.createProfile({ intent: kind.value, displayName: name.value.trim(), classCode: code.value.trim().toUpperCase() }); location.href = portalFor(store.me.role === 'teacher_pending' ? 'teacher' : store.me.role); } catch (x) { showErr(err, x); } } } },
      field('Account type', kind), field('Your name', name), codeField, err,
      h('div.row', btn('Continue', null, { kind: 'primary', type: 'submit' }), btn('Sign out', async () => { await store.signOut(); location.href = '/'; }, { kind: 'ghost' })))));
}

main();
