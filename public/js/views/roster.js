// Classes and roster (teacher): join codes, students, accounts for learners without email, consent records.
import { h, btn, badge, card, cardHead, callout, pageHead, field, input, select, dataTable, modal, confirmDialog, promptDialog, toast, errorToast, download, rel, n } from '../ui/kit.js';
import { myClasses, noClasses } from './common.js';
import { studentName } from '../app/data.js';
import { toCSV } from '../engine/csv.js';
import { toMs } from '../core/util.js';

const CONSENT = { granted: ['Research use: permitted', 'ok'], refused: ['Research use: refused', 'danger'], withdrawn: ['Research use: withdrawn', 'warn'], not_recorded: ['Research use: not recorded', ''] };

export async function rosterView(ctx) {
  const { store, navigate } = ctx;
  const classes = await myClasses(store);
  if (!classes.length) return h('div', pageHead('Classes and roster'), noClasses());
  const students = await store.listStudents(classes.map(c => c.id));
  const joinUrl = (c) => `${location.origin}/?tab=register&class=${encodeURIComponent(c.id)}`;

  const classCards = classes.map(c => {
    const mine = students.filter(s => s.class_code === c.id);
    const toggle = btn(c.join_open ? 'Close joining' : 'Open joining', async () => {
      try { await store.saveClass({ id: c.id, join_open: !c.join_open }); toast(c.join_open ? 'Joining closed' : 'Joining open', 'ok'); navigate('/roster'); } catch (e) { errorToast(e); }
    }, { sm: true });
    const addStudent = btn('Create student account', () => createAccount(store, c, navigate), { sm: true, ic: 'plus', disabled: !c.join_open, title: c.join_open ? '' : 'Open joining first' });
    return card(cardHead(`${c.name || c.id}`, toggle, addStudent),
      h('div.row', { style: { flexWrap: 'wrap', gap: '1rem' } },
        h('div', h('div.small.muted', 'Class code'), h('div', { style: { fontSize: '1.4rem', fontWeight: 700, letterSpacing: '.08em' } }, c.id)),
        h('div', h('div.small.muted', 'Joining'), c.join_open ? badge('open — students can register with the code', 'ok') : badge('closed', 'warn')),
        h('div', h('div.small.muted', 'Students'), h('strong', n(mine.length))),
        c.is_synthetic ? badge('synthetic class', 'demo') : null),
      h('p.small', 'Students register at the CS Lifeline home page with ', h('strong', 'Join a class'), ' and this code. Share link: ',
        h('a', { href: joinUrl(c) }, joinUrl(c)), ' ', btn('Copy', async () => { try { await navigator.clipboard.writeText(joinUrl(c)); toast('Link copied', 'ok'); } catch { toast('Copy failed — select the link instead', 'warn'); } }, { sm: true, kind: 'ghost' })));
  });

  const rows = students.map(s => ({ s, id: s.id, name: studentName(s), class_code: s.class_code, status: s.status || 'active', consent: s.consent?.research_use || 'not_recorded', last: toMs(s.last_seen), pseudo: s.pseudo_id }));
  const table = dataTable(rows, [
    { key: 'name', label: 'Student', render: r => h('a', { href: `#/student/${r.id}` }, r.name) },
    ...(classes.length > 1 ? [{ key: 'class_code', label: 'Class' }] : []),
    { key: 'status', label: 'Account', render: r => badge(r.status, r.status === 'active' ? 'ok' : 'warn') },
    { key: 'consent', label: 'Research consent', render: r => badge(...CONSENT[r.consent] || [r.consent]) },
    { key: 'pseudo', label: 'Research ID', render: r => h('code.small', r.pseudo || '—') },
    { key: 'last', label: 'Last active', render: r => rel(r.last), sort: r => r.last || 0 },
    { key: 'act', label: '', sortable: false, render: r => h('span.row',
      btn('Consent', () => consentDialog(store, r.s, navigate), { sm: true }),
      btn(r.status === 'suspended' ? 'Reactivate' : 'Suspend', async () => {
        const next = r.status === 'suspended' ? 'active' : 'suspended';
        if (next === 'suspended' && !(await confirmDialog('Suspend this account?', `${r.name} will see a message that their account is suspended and will not be able to use CS Lifeline until reactivated. Nothing is hidden from them or silently discarded.`, { confirmLabel: 'Suspend', danger: true }))) return;
        try { await store.backend.set('users', r.id, { status: next, updated_at: store.backend.serverTime(), updated_by: store.auth.uid }, { merge: true }); await store.audit('student.' + next, 'users/' + r.id, {}); toast('Saved', 'ok'); navigate('/roster'); } catch (e) { errorToast(e); }
      }, { sm: true, kind: 'ghost' })) },
  ], { initialSort: { key: 'name', dir: 'asc' }, empty: 'No students have joined yet.' });

  return h('div', pageHead('Classes and roster', 'Join codes, student accounts and research-consent records. Classes are created and assigned by an administrator.',
    btn('Download roster CSV', () => download('roster.csv', toCSV(rows.map(r => ({ name: r.name, class: r.class_code, account: r.status, research_consent: r.consent, research_id: r.pseudo })))), { ic: 'download' })),
  ...classCards, card('Students', table),
  callout(['Research consent is recorded per learner by the school. Only learners marked ', h('strong', 'permitted'), ' are included in research exports when the platform setting requires consent (it does by default). Consent changes are kept in the audit log.'], 'info'));
}

async function createAccount(store, c, navigate) {
  const name = input('', { maxlength: 60, placeholder: 'Name the teacher will see' });
  modal({ title: `New student account in ${c.id}`, body: h('div', field('Student name', name), h('p.small.muted', 'For learners without an email address. CS Lifeline creates a random login and password, shows them once, and does not store the password.')),
    actions: [{ label: 'Cancel' }, { label: 'Create', kind: 'primary', onClick: async () => {
      if (!name.value.trim()) { toast('Enter a name', 'warn'); return false; }
      try {
        const r = await store.createRosterStudent({ displayName: name.value.trim(), classCode: c.id });
        setTimeout(() => modal({ title: 'Login details — copy them now', body: h('div', callout('This password is shown only once. Give it to the student privately. If it is lost, an administrator can reset it.', 'warn'),
          h('p', 'Login: ', h('code', r.login)), h('p', 'Password: ', h('code', r.password))),
        actions: [{ label: 'Copy both', onClick: async () => { try { await navigator.clipboard.writeText(`CS Lifeline\nLogin: ${r.login}\nPassword: ${r.password}`); toast('Copied', 'ok'); } catch { toast('Copy failed', 'warn'); } return false; } }, { label: 'Done', kind: 'primary', onClick: () => navigate('/roster') }] }), 50);
      } catch (e) { errorToast(e, 'Could not create the account'); return false; }
    } }] });
}

async function consentDialog(store, s, navigate) {
  const sel = select(Object.entries(CONSENT).map(([k, v]) => [k, v[0].replace('Research use: ', '')]), s.consent?.research_use || 'not_recorded');
  modal({ title: `Research consent: ${studentName(s)}`, body: h('div', field('Status', sel), h('p.small.muted', 'Record what the school has on file (for example a signed parental consent form). This controls inclusion in research exports only; it does not change what the student can do or what the teacher sees.')),
    actions: [{ label: 'Cancel' }, { label: 'Save', kind: 'primary', onClick: async () => {
      const note = await promptDialog('Reference', 'Where is the consent record kept? (e.g. "Form 2026-14, school office")', { required: sel.value === 'granted' });
      if (note === null && sel.value === 'granted') return false;
      try { await store.setConsent(s.id, sel.value, note || ''); toast('Consent recorded', 'ok'); navigate('/roster'); } catch (e) { errorToast(e); return false; }
    } }] });
}
