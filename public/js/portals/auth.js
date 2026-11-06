// Sign-in, registration and demonstration entry (layout follows the v3 landing page).
// Security changes from v3: no derived/predictable passwords (audit S4); roles are never
// self-assigned beyond 'student' (joining an open class) or 'teacher_pending' (S1–S3).

import { store } from '../core/store.js';
import { CONFIG, setMode } from '../core/config.js';
import { h, mount, btn, field, input, select, callout, friendlyError, icon, clear } from '../ui/kit.js';
import { brandMark, portalFor } from '../ui/shell.js';

const root = document.getElementById('app');
const params = new URLSearchParams(location.search);

const FEATURES = [
  ['brain', 'crimson', 'Misconceptions from evidence', 'Flags need repeated, consistent evidence — never a single wrong answer.'],
  ['alert', 'amber', 'Early warning that explains itself', 'Every flag lists the indicators behind it; demonstration models are labelled.'],
  ['flag', 'emerald', 'Interventions you can check', 'Compare a learner’s evidence before and after support.'],
  ['layers', 'teal', 'The whole 0478 syllabus', '13 question types across Paper 1 and Paper 2, chapters T01–T14.'],
];

function intro() {
  return h('section.auth-intro',
    h('a.brand', { href: '/' }, brandMark(), h('span', 'CS Lifeline', h('span.brand-dot', '.'))),
    h('div.auth-hero',
      h('p.eyebrow', h('span.pulse'), 'Cambridge IGCSE Computer Science 0478'),
      h('h1', 'Catch misconceptions before they ', h('span.accent', 'compound.')),
      h('p.lead', 'CS Lifeline turns everyday practice and assessments into evidence teachers can act on: what each student misunderstands, who needs support now, and whether that support worked.'),
      h('div.feature-grid', ...FEATURES.map(([ic, tone, title, text]) => h('div.feature',
        h('span', { class: 'stat-icon ' + tone }, icon(ic)), h('div', h('strong', title), h('p', text))))),
      h('div.chips', ...['Paper 1 & Paper 2', '14 chapters', 'Explained flags', 'Privacy by design'].map(t => h('span.chip', t)))));
}

function credits() {
  return h('footer.auth-credits',
    h('span', h('strong', 'CS Lifeline'), ` v${CONFIG.appVersion}`), h('span', 'Cambridge IGCSE 0478'), h('span', 'University of Ghana'),
    h('span', 'Wilfred Wilson Osei (22425069)'), h('span', 'Supervisor: Dr. Prince Boakye-Sekyerehene'), h('a', { href: '/privacy.html' }, 'How data is used'));
}

async function main() {
  await store.init().catch(e => { mount(root, h('div.main', callout('Could not start: ' + friendlyError(e), 'danger'))); throw e; });
  if (store.auth && store.me && !params.get('complete')) { location.replace(params.get('next') || portalFor(store.me.role)); return; }
  const panel = h('div.auth-card');
  mount(root, h('div.auth-page', h('div.auth-wrap', intro(), h('section.auth-panel', panel)), credits()));
  if (store.auth && !store.me) return completeProfile(panel);
  if (store.isDemo) return demoPanel(panel);
  signInCard(panel);
}

// ── Card with Student / Teacher tabs and a segmented choice inside each ──
function signInCard(panel) {
  const tab0 = params.get('tab');
  if (tab0 === 'demo') return demoInvite(panel);
  const body = h('div');
  const roleBar = h('div.auth-tabs', { role: 'tablist', 'aria-label': 'I am a' });
  const seg = h('div.seg', { role: 'tablist', 'aria-label': 'Choose an option' });
  const ROLES = {
    student: [['join', 'Join class', studentRegister], ['signin', 'Sign in', studentSignIn], ...(CONFIG.googleSignIn ? [['google', 'Google', googlePanel]] : [])],
    teacher: [['signin', 'Sign in', teacherSignIn], ['request', 'Request account', teacherRequest]],
  };
  let role = tab0 === 'teacher' ? 'teacher' : 'student';
  const pick = (r, sub) => {
    role = r;
    [...roleBar.children].forEach(b => b.setAttribute('aria-selected', String(b.dataset.id === r)));
    const opts = ROLES[r];
    sub = sub || opts.find(o => o[0] === 'signin')[0];
    clear(seg);
    for (const [id, label, fn] of opts) seg.appendChild(h('button', { type: 'button', role: 'tab', class: 'seg-btn', 'data-id': id, 'aria-selected': String(id === sub),
      on: { click: () => { [...seg.children].forEach(b => b.setAttribute('aria-selected', String(b.dataset.id === id))); fn(body); } } }, label));
    opts.find(o => o[0] === sub)[2](body);
  };
  for (const [id, label, ic] of [['student', 'Student', 'user'], ['teacher', 'Teacher', 'users']])
    roleBar.appendChild(h('button', { type: 'button', role: 'tab', class: 'auth-tab', 'data-id': id, on: { click: () => pick(id) } }, icon(ic), label));
  mount(panel, h('div.card.auth-box',
    h('div.auth-box-brand', brandMark(), h('span', 'CS Lifeline', h('span.brand-dot', '.'))),
    h('h2', 'Welcome'), h('p.muted', 'Sign in or create an account'),
    roleBar, seg, body,
    h('div.auth-demo', h('a', { href: '/?mode=demo', on: { click: (e) => { e.preventDefault(); demoInvite(panel); } } }, icon('play'), 'Try the demonstration (synthetic data)'))));
  pick(role, tab0 === 'register' || params.get('class') ? 'join' : null);
}

function errBox() { return h('div', { role: 'alert', 'aria-live': 'assertive' }); }
function showErr(box, e) { mount(box, callout(friendlyError(e), 'danger')); }
async function after() { location.href = params.get('next') || portalFor(store.me?.role); }

// Field with a leading icon; the label stays linked to the input for screen readers.
function iField(label, ic, control, hint = '') {
  const id = control.id || ('f' + Math.random().toString(36).slice(2)); control.id = id;
  return h('div.field', h('label', { for: id }, label), h('div.input-ic', icon(ic), control), hint ? h('div.hint', hint) : null);
}
const go = (label) => h('button', { type: 'submit', class: 'btn primary block' }, label, icon('arrow'));
const privacy = (text) => h('p.auth-privacy', icon('shield'), h('span', text));

function studentSignIn(body) {
  const email = input('', { type: 'email', autocomplete: 'username', required: true, placeholder: 'you@school.org or student login' });
  const pass = input('', { type: 'password', autocomplete: 'current-password', required: true, placeholder: '••••••••' });
  const err = errBox();
  mount(body, h('form', { on: { submit: async (e) => { e.preventDefault(); clear(err); try { await store.signInEmail(email.value.trim(), pass.value); if (!store.me) return completeProfile(body); await after(); } catch (x) { showErr(err, x); } } } },
    iField('Email or student login', 'mail', email, 'If your teacher gave you a login and access code, enter them here.'),
    iField('Password or access code', 'lock', pass), err,
    go('Start practising'),
    h('div.auth-row', h('button', { type: 'button', class: 'linkish', on: { click: async () => { if (!email.value.includes('@')) return mount(err, callout('Enter your email first.', 'warn')); try { await store.resetPassword(email.value.trim()); mount(err, callout('If an account exists, a reset link has been sent.', 'ok')); } catch (x) { showErr(err, x); } } } }, 'Forgot password?')),
    privacy('Your teacher sees your name and progress. Research exports use a pseudonymous ID, never your name.')));
}

function googlePanel(body) {
  const err = errBox();
  mount(body, h('div.stack',
    h('p.small.muted', 'Use the Google account your school gave you. New students are asked for their class code next.'),
    h('button', { type: 'button', class: 'btn block', on: { click: async () => { clear(err); try { await store.signInGoogle(); if (!store.me) return completeProfile(body); await after(); } catch (x) { showErr(err, x); } } } }, icon('google'), 'Continue with Google'),
    err, privacy('Google only confirms who you are. CS Lifeline does not read your email or files.')));
}

function studentRegister(body) {
  const name = input('', { autocomplete: 'name', maxlength: 60, required: true, placeholder: 'As your teacher knows you' });
  const code = input(params.get('class') || '', { autocomplete: 'off', required: true, style: { textTransform: 'uppercase' }, placeholder: 'From your teacher' });
  const email = input('', { type: 'email', autocomplete: 'email', required: true, placeholder: 'you@school.org' });
  const pass = input('', { type: 'password', autocomplete: 'new-password', minlength: 8, required: true, placeholder: 'At least 8 characters' });
  const err = errBox();
  mount(body, h('form', { on: { submit: async (e) => {
      e.preventDefault(); clear(err);
      if (pass.value.length < 8) return mount(err, callout('Choose a password of at least 8 characters.', 'warn'));
      try { await store.signUpEmail({ email: email.value.trim(), password: pass.value, displayName: name.value.trim(), intent: 'student', classCode: code.value.trim().toUpperCase() }); await after(); }
      catch (x) { showErr(err, x); }
    } } },
    iField('Your name', 'user', name), iField('Class code', 'hash', code), iField('Email', 'mail', email), iField('Password', 'lock', pass), err,
    go('Join and start practising'),
    privacy('No email address? Ask your teacher for a student login instead. Your teacher sees your name; research uses a pseudonymous ID.')));
}

function teacherSignIn(body) {
  const email = input('', { type: 'email', autocomplete: 'username', required: true, placeholder: 'you@school.org' });
  const pass = input('', { type: 'password', autocomplete: 'current-password', required: true, placeholder: '••••••••' });
  const err = errBox();
  mount(body, h('form', { on: { submit: async (e) => { e.preventDefault(); clear(err); try { await store.signInEmail(email.value.trim(), pass.value); if (!store.me) return completeProfile(body); await after(); } catch (x) { showErr(err, x); } } } },
    iField('Email', 'mail', email), iField('Password', 'lock', pass), err,
    go('Open dashboard'),
    CONFIG.googleSignIn ? h('button', { type: 'button', class: 'btn block', style: { marginTop: '.6rem' }, on: { click: async () => { clear(err); try { await store.signInGoogle(); if (!store.me) return completeProfile(body); await after(); } catch (x) { showErr(err, x); } } } }, icon('google'), 'Continue with Google') : null,
    h('div.auth-row', h('button', { type: 'button', class: 'linkish', on: { click: async () => { if (!email.value.includes('@')) return mount(err, callout('Enter your email first.', 'warn')); try { await store.resetPassword(email.value.trim()); mount(err, callout('If an account exists, a reset link has been sent.', 'ok')); } catch (x) { showErr(err, x); } } } }, 'Forgot password?')),
    privacy('Teachers see only their own classes. Administrators also sign in here.')));
}

function teacherRequest(body) {
  const reqName = input('', { maxlength: 60, required: true }), reqEmail = input('', { type: 'email', required: true, placeholder: 'you@school.org' }), reqPass = input('', { type: 'password', autocomplete: 'new-password', minlength: 8, required: true, placeholder: 'At least 8 characters' });
  const err = errBox();
  mount(body, h('form', { on: { submit: async (e) => { e.preventDefault(); clear(err); try { await store.signUpEmail({ email: reqEmail.value.trim(), password: reqPass.value, displayName: reqName.value.trim(), intent: 'teacher' }); location.href = '/teacher/'; } catch (x) { showErr(err, x); } } } },
    iField('Full name', 'user', reqName), iField('School email', 'mail', reqEmail), iField('Password', 'lock', reqPass), err,
    go('Request teacher account'),
    privacy('An administrator approves teacher accounts and assigns classes. Until then the account cannot see any student data.')));
}

function demoInvite(panel) {
  mount(panel, h('div.card.auth-box',
    h('div.auth-box-brand', brandMark(), h('span', 'CS Lifeline', h('span.brand-dot', '.'))),
    h('div.card-head', h('h2', 'Demonstration'), h('span.badge.demo', 'Synthetic data')),
    h('p', 'The demonstration runs entirely in your browser with a synthetic dataset: two schools, five classes and 92 learners in the current term (the demonstration model was trained and tested on a further 584 synthetic learners from two earlier terms). Nothing is sent to any server and no real student is involved.'),
    callout('Results and predictions in the demonstration come from synthetic data. They show how the software works; they are not evidence of how well the model predicts real learners.', 'demo'),
    h('div.stack', { style: { marginTop: '1rem' } },
      h('button', { type: 'button', class: 'btn primary block', on: { click: () => { setMode('demo'); location.href = '/?mode=demo'; } } }, icon('play'), 'Open the demonstration'),
      h('button', { type: 'button', class: 'btn ghost block', on: { click: () => signInCard(panel) } }, 'Back to sign in'))));
}

async function demoPanel(panel) {
  let accounts = [];
  try { accounts = await store.demoAccounts(); } catch (e) { mount(panel, callout('The demonstration dataset could not be loaded: ' + friendlyError(e), 'danger')); return; }
  const group = (role, title, ic) => {
    const list = accounts.filter(a => a.role === role).slice(0, role === 'student' ? 6 : 4);
    return list.length ? h('div.demo-group', h('h3', title), h('div.stack', ...list.map(a => h('button', { type: 'button', class: 'demo-acct',
      on: { click: async () => { await store.signInDemo(a.uid); location.href = portalFor(role); } } },
      h('span.avatar', a.display_name.split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase()), h('span.demo-name', a.display_name),
      h('span.small.muted', a.class_code || (role === 'admin' ? 'Administrator' : 'Teacher')), icon('arrow'))))) : null;
  };
  mount(panel, h('div.card.auth-box',
    h('div.auth-box-brand', brandMark(), h('span', 'CS Lifeline', h('span.brand-dot', '.'))),
    h('div.card-head', h('h2', 'Demonstration'), h('span.badge.demo', 'Synthetic data')),
    h('p.muted', 'Choose an account to explore. Changes stay in this browser; use Reset in the sidebar to start again.'),
    group('teacher', 'Teachers'), group('admin', 'Administrator'), group('student', 'Students'),
    h('button', { type: 'button', class: 'btn ghost block', on: { click: () => { setMode('firebase'); location.href = '/'; } } }, 'Leave the demonstration')));
}

async function completeProfile(panel) {
  const name = input(store.auth?.displayName || '', { maxlength: 60 });
  const code = input('', { style: { textTransform: 'uppercase' } });
  const kind = select([['student', 'I am a student joining a class'], ['teacher', 'I am a teacher (needs administrator approval)']], 'student');
  const codeField = field('Class code', code);
  kind.addEventListener('change', () => { codeField.hidden = kind.value !== 'student'; });
  const err = errBox();
  mount(panel, h('div.card.auth-box', h('h2', 'Finish setting up your account'), h('p.small.muted', `Signed in as ${store.auth?.email || 'your account'}.`),
    h('form', { on: { submit: async (e) => { e.preventDefault(); clear(err); try { await store.createProfile({ intent: kind.value, displayName: name.value.trim(), classCode: code.value.trim().toUpperCase() }); location.href = portalFor(store.me.role === 'teacher_pending' ? 'teacher' : store.me.role); } catch (x) { showErr(err, x); } } } },
      field('Account type', kind), field('Your name', name), codeField, err,
      h('div.row', btn('Continue', null, { kind: 'primary', type: 'submit' }), btn('Sign out', async () => { await store.signOut(); location.href = '/'; }, { kind: 'ghost' })))));
}

main();
