// Administration portal views. Everything an administrator routinely needs is here, so the
// Firebase Console is only needed for initial set-up. Every change goes through store.* which
// writes an audit entry; firestore.rules enforce that only administrators can make these changes.
import { h, btn, badge, tile, card, cardHead, callout, empty, pageHead, field, input, textarea, select, checkbox, tabs, dataTable, modal, confirmDialog, promptDialog, toast, errorToast, download, filePicker, fmtPct, fmtDate, rel, n } from '../ui/kit.js';
import { studentName } from '../app/data.js';
import { CHAPTERS, CHAPTER_IDS } from '../engine/curriculum.js';
import { TAXONOMY } from '../engine/taxonomy-data.js';
import { DEFAULT_THRESHOLDS, RISK_LABELS } from '../engine/risk.js';
import { fromWowSirSession, fromDbwowProgress, processBatch, PLATFORMS, EVENT_SCHEMA_VERSION } from '../integration/events.js';
import { toCSV } from '../engine/csv.js';
import { CONFIG } from '../core/config.js';
import { toMs } from '../core/util.js';

const ROLE_LABEL = { admin: 'Administrator', teacher: 'Teacher', teacher_pending: 'Teacher (awaiting approval)', student: 'Student' };
const reasonOrStop = (title) => promptDialog(title, 'Reason (kept in the audit log)', { placeholder: 'e.g. Approved by head of department, email 6 Nov' });

// ── Overview ────────────────────────────────────────────────────────────────
export async function adminHome(ctx) {
  const { store, navigate } = ctx;
  const [users, classes, schools, models, integ, audit] = await Promise.all([store.listUsers(), store.listClasses(), store.listSchools(), store.listModels().catch(() => []), store.listIntegrations().catch(() => []), store.listAudit(15).catch(() => [])]);
  const by = (r) => users.filter(u => u.role === r).length;
  const pending = users.filter(u => u.role === 'teacher_pending');
  const prod = models.find(m => m.status === 'production');
  return h('div', pageHead('Administration', 'Platform overview. Routine administration happens here, not in the Firebase Console.'),
    h('div.grid-tiles', tile('Students', n(by('student'))), tile('Teachers', n(by('teacher')), `${pending.length} awaiting approval`, { attention: pending.length > 0 }), tile('Administrators', n(by('admin'))),
      tile('Schools', n(schools.length)), tile('Classes', n(classes.length), `${classes.filter(c => c.join_open).length} open for joining`),
      tile('Production model', prod ? prod.model_version : 'none', prod ? (prod.validated_on_real_data ? 'validated on real data' : 'DEMONSTRATION — synthetic') : 'no predictions are made', { attention: prod && !prod.validated_on_real_data })),
    h('div.grid-2',
      card(cardHead('Teacher accounts awaiting approval', btn('Users', () => navigate('/users'), { sm: true })), pending.length ? h('div.stack', ...pending.map(u => h('div.row.between', h('div', h('strong', u.display_name), h('div.small.muted', u.email)), btn('Review', () => editUser(store, u, navigate), { sm: true, kind: 'primary' }))))
        : empty('No pending requests', 'New teacher registrations appear here. Nobody becomes a teacher or administrator by signing in.', null, 'check')),
      card(cardHead('Integrations', btn('Manage', () => navigate('/integrations'), { sm: true })), integ.length ? h('div.stack', ...integ.map(p => h('div.row.between', h('strong', p.name || p.id), integrationBadge(p)))) : h('p.muted', 'No platforms registered.'))),
    card(cardHead('Recent activity', btn('Audit log', () => navigate('/audit'), { sm: true })), auditTable(audit, users, { search: false, pageSize: 15 })));
}

// ── Users and roles ─────────────────────────────────────────────────────────
export async function usersView(ctx) {
  const { store, navigate } = ctx;
  const [users, classes, schools] = await Promise.all([store.listUsers(), store.listClasses(), store.listSchools()]);
  const fRole = select([['', 'All roles'], ...Object.entries(ROLE_LABEL)], ctx.query?.role || '');
  const tbl = h('div');
  const draw = () => tbl.replaceChildren(dataTable(users.filter(u => !fRole.value || u.role === fRole.value).map(u => ({ u, id: u.id, name: u.display_name || '(no name)', email: u.email || '', role: u.role, status: u.status || 'active',
    school: schools.find(s => s.id === u.school_id)?.name || u.school_id || '', classes: u.role === 'student' ? u.class_code : (u.class_codes || []).join(', '), seen: toMs(u.last_seen) })), [
    { key: 'name', label: 'Name', render: r => h('span', h('strong', r.name), r.u.is_synthetic ? h('span', ' ', badge('synthetic', 'demo')) : null) }, { key: 'email', label: 'Email' },
    { key: 'role', label: 'Role', render: r => badge(ROLE_LABEL[r.role] || r.role, r.role === 'teacher_pending' ? 'warn' : r.role === 'admin' ? 'info' : '') },
    { key: 'status', label: 'Status', render: r => badge(r.status, r.status === 'active' ? 'ok' : 'warn') }, { key: 'school', label: 'School' }, { key: 'classes', label: 'Class(es)' },
    { key: 'seen', label: 'Last active', render: r => rel(r.seen), sort: r => r.seen || 0 },
  ], { onRow: r => editUser(store, r.u, navigate, { classes, schools }), pageSize: 25 }));
  fRole.addEventListener('change', draw); draw();
  return h('div', pageHead('Users and roles', 'Approve teachers, assign classes, change roles and handle data requests. Every change asks for a reason and is audited.',
    btn('Export users CSV', () => download('users.csv', toCSV(users.map(u => ({ id: u.id, name: u.display_name, email: u.email, role: u.role, status: u.status, school_id: u.school_id, class: u.class_code || (u.class_codes || []).join(' '), research_id: u.pseudo_id || '' })))), { ic: 'download' })),
    callout(['Roles are provisioned only here (or by the one-off ', h('code', 'scripts/provision-admin.mjs'), ' for the first administrator). Students join with a class code; teachers register as "awaiting approval". The security rules reject any attempt to self-assign a role.'], 'info'),
    card(h('div.toolbar', fRole), tbl));
}

async function editUser(store, u, navigate, pre = {}) {
  const [classes, schools] = pre.classes ? [pre.classes, pre.schools] : await Promise.all([store.listClasses(), store.listSchools()]);
  const role = select(Object.entries(ROLE_LABEL), u.role);
  const status = select([['active', 'Active'], ['suspended', 'Suspended'], ['pending', 'Pending']], u.status || 'active');
  const school = select([['', '— none —'], ...schools.map(s => [s.id, s.name])], u.school_id || '');
  const cls = select([['', '— none —'], ...classes.map(c => [c.id, `${c.id} · ${c.name || ''}`])], u.class_code || '');
  const tBoxes = classes.map(c => ({ c, cb: checkbox(`${c.id} · ${c.name || ''}`, (u.class_codes || []).includes(c.id)) }));
  const roleArea = h('div');
  const drawRole = () => roleArea.replaceChildren(role.value === 'student' ? field('Class', cls) : ['teacher', 'teacher_pending'].includes(role.value) ? h('div.field', h('label', 'Classes taught'), h('div', { style: { maxHeight: '220px', overflowY: 'auto' } }, ...tBoxes.map(x => x.cb.el))) : h('p.small.muted', 'Administrators can see and manage every class.'));
  role.addEventListener('change', drawRole); drawRole();
  if (u.role === 'teacher_pending') { role.value = 'teacher'; status.value = 'active'; drawRole(); }
  modal({ title: u.display_name || u.email || u.id, wide: true, body: h('div',
    h('p.small.muted', `${u.email || 'no email'} · account ${u.id}${u.pseudo_id ? ' · research ID ' + u.pseudo_id : ''} · created ${fmtDate(u.created_at)}`),
    h('div.form-grid', field('Role', role), field('Status', status), field('School', school)), roleArea,
    u.role === 'student' ? h('div.row', { style: { marginTop: '1rem' } }, btn('Erase learning data…', async () => {
      const reason = await promptDialog('Erase this learner\'s data?', 'This permanently deletes their responses, sessions, submissions, predictions, interventions and identity links, and anonymises the profile. Give the reason (e.g. data-erasure request reference).');
      if (!reason) return;
      if (!(await confirmDialog('Erase permanently?', 'This cannot be undone.', { confirmLabel: 'Erase', danger: true }))) return;
      try { const nDel = await store.eraseStudentData(u.id, reason); toast(`${nDel} records deleted`, 'ok'); navigate('/users'); } catch (e) { errorToast(e); }
    }, { kind: 'danger', sm: true }), h('span.small.muted', 'The sign-in account itself is deleted in Firebase Authentication (see the user guide).')) : null),
  actions: [{ label: 'Cancel' }, { label: 'Save', kind: 'primary', onClick: async () => {
    const patch = { role: role.value, status: status.value, school_id: school.value || null };
    if (role.value === 'student') { if (!cls.value) { toast('Choose a class for the student', 'warn'); return false; } patch.class_code = cls.value; }
    if (['teacher', 'teacher_pending'].includes(role.value)) patch.class_codes = tBoxes.filter(x => x.cb.input.checked).map(x => x.c.id);
    if (role.value === 'admin' && u.role !== 'admin' && !(await confirmDialog('Grant administrator rights?', 'Administrators can read all classes, change roles and erase data.', { confirmLabel: 'Grant' }))) return false;
    if (u.id === store.auth.uid && role.value !== 'admin') { toast('You cannot remove your own administrator role.', 'warn'); return false; }
    const reason = await reasonOrStop('Why is this change being made?'); if (!reason) return false;
    try { await store.adminUpdateUser(u.id, patch, reason); toast('Saved', 'ok'); navigate(location.hash.replace(/^#/, '') || '/users'); } catch (e) { errorToast(e); return false; }
  } }] });
}

// ── Schools and classes ─────────────────────────────────────────────────────
export async function schoolsClasses(ctx) {
  const { store, navigate } = ctx;
  const [schools, classes, users] = await Promise.all([store.listSchools(), store.listClasses(), store.listUsers()]);
  const teachers = users.filter(u => u.role === 'teacher');
  const students = users.filter(u => u.role === 'student');
  const schoolDlg = (s = {}) => {
    const name = input(s.name || ''), country = input(s.country || 'Ghana'), cur = input(s.curriculum || 'Cambridge IGCSE');
    modal({ title: s.id ? 'Edit school' : 'New school', body: h('div', field('Name', name), h('div.form-grid', field('Country', country), field('Curriculum', cur))),
      actions: [{ label: 'Cancel' }, { label: 'Save', kind: 'primary', onClick: async () => { if (!name.value.trim()) { toast('Name required', 'warn'); return false; } try { await store.saveSchool({ id: s.id, name: name.value.trim(), country: country.value.trim(), curriculum: cur.value.trim() }); toast('Saved', 'ok'); navigate('/schools'); } catch (e) { errorToast(e); return false; } } }] });
  };
  const classDlg = (c = {}) => {
    const code = input(c.id || '', { disabled: !!c.id, placeholder: 'e.g. NB-10A', maxlength: 20 }), name = input(c.name || ''), grade = select([['9', '9'], ['10', '10'], ['11', '11']], String(c.grade || 10));
    const sch = select(schools.map(s => [s.id, s.name]), c.school_id || schools[0]?.id || ''); const open = checkbox('Open for students to join with the code', c.join_open ?? true);
    const tb = teachers.map(t => ({ t, cb: checkbox(t.display_name || t.email, (c.teacher_uids || []).includes(t.id)) }));
    modal({ title: c.id ? `Class ${c.id}` : 'New class', wide: true, body: h('div', h('div.form-grid', field('Class code (students type this to join)', code, '3–20 letters, digits or hyphens'), field('Name', name), field('Grade', grade), field('School', sch)), open.el,
      h('div.field', h('label', 'Teachers'), tb.length ? h('div', ...tb.map(x => x.cb.el)) : h('p.small.muted', 'No approved teachers yet.'))),
    actions: [{ label: 'Cancel' }, { label: 'Save', kind: 'primary', onClick: async () => {
      if (!schools.length) { toast('Create a school first', 'warn'); return false; }
      try {
        const id = await store.saveClass({ id: (c.id || code.value).trim().toUpperCase(), name: name.value.trim(), grade: Number(grade.value), school_id: sch.value, subject: 'CS-0478', join_open: open.input.checked, teacher_uids: tb.filter(x => x.cb.input.checked).map(x => x.t.id), ...(c.id ? {} : { created_at: store.backend.serverTime() }) });
        for (const x of tb) { // keep each teacher's class list consistent with the class's teacher list
          const has = (x.t.class_codes || []).includes(id);
          if (x.cb.input.checked !== has) await store.adminUpdateUser(x.t.id, { class_codes: x.cb.input.checked ? [...(x.t.class_codes || []), id] : (x.t.class_codes || []).filter(k => k !== id) }, `Class ${id} teacher assignment`);
        }
        toast('Saved', 'ok'); navigate('/schools');
      } catch (e) { errorToast(e); return false; }
    } }] });
  };
  return h('div', pageHead('Schools and classes', 'The academic hierarchy: school → grade → class. Subjects, chapters and topics are under Curriculum.'),
    card(cardHead('Schools', btn('New school', () => schoolDlg(), { sm: true, ic: 'plus' })), dataTable(schools.map(s => ({ s, id: s.id, name: s.name, country: s.country || '', classes: classes.filter(c => c.school_id === s.id).length })), [
      { key: 'name', label: 'School', render: r => h('span', r.name, r.s.is_synthetic ? h('span', ' ', badge('synthetic', 'demo')) : null) }, { key: 'country', label: 'Country' }, { key: 'classes', label: 'Classes', num: true }], { onRow: r => schoolDlg(r.s), search: false })),
    card(cardHead('Classes', btn('New class', () => classDlg(), { sm: true, ic: 'plus' })), dataTable(classes.map(c => ({ c, id: c.id, name: c.name || '', school: schools.find(s => s.id === c.school_id)?.name || c.school_id, grade: c.grade, students: students.filter(s => s.class_code === c.id).length,
      teachers: (c.teacher_uids || []).map(t => teachers.find(x => x.id === t)?.display_name || t).join(', '), open: c.join_open })), [
      { key: 'id', label: 'Code', render: r => h('strong', r.id) }, { key: 'name', label: 'Name' }, { key: 'school', label: 'School' }, { key: 'grade', label: 'Grade', num: true }, { key: 'students', label: 'Students', num: true },
      { key: 'teachers', label: 'Teachers' }, { key: 'open', label: 'Joining', render: r => r.open ? badge('open', 'ok') : badge('closed') }], { onRow: r => classDlg(r.c) })));
}

// ── Curriculum and taxonomy ─────────────────────────────────────────────────
export async function curriculumView(ctx) {
  const { store, navigate } = ctx;
  const overrides = Object.fromEntries((await store.listCurriculum().catch(() => [])).map(c => [c.id, c]));
  const body = h('div');
  const drawCh = () => body.replaceChildren(dataTable(CHAPTER_IDS.map(id => ({ id, ...CHAPTERS[id], ...(overrides[id] || {}), edited: !!overrides[id] })), [
    { key: 'id', label: 'Chapter', render: r => h('strong', r.id) }, { key: 'title', label: 'Title', render: r => h('span', r.title, r.edited ? h('span', ' ', badge('edited', 'info')) : null) },
    { key: 'paper', label: 'Paper' }, { key: 'syllabus', label: '0478 ref.' }, { key: 'topics', label: 'Topics', render: r => h('span.small', (r.topics || []).join(' · ')) },
  ], { onRow: r => {
    const title = input(r.title), topics = textarea((r.topics || []).join('\n'), { rows: 8 });
    modal({ title: `Chapter ${r.id}`, body: h('div', field('Title', title), field('Topics (one per line)', topics), h('p.small.muted', 'Chapter IDs never change, so existing responses and questions stay linked.')),
      actions: [{ label: 'Cancel' }, { label: 'Save', kind: 'primary', onClick: async () => { try { await store.saveCurriculum({ id: r.id, title: title.value.trim(), topics: topics.value.split('\n').map(s => s.trim()).filter(Boolean) }); toast('Saved', 'ok'); navigate('/curriculum'); } catch (e) { errorToast(e); return false; } } }] });
  }, search: false, pageSize: 20 }));
  const drawTax = () => body.replaceChildren(h('p.small.muted', `${TAXONOMY.length} misconceptions. Each has observable indicators, likely causes, teaching strategies, related misconceptions and evidence requirements. Defined in public/js/engine/taxonomy-data.js (version-controlled so that every classification can be traced to the definition used).`),
    dataTable(TAXONOMY.map(t => ({ ...t })), [{ key: 'id', label: 'ID', render: t => h('code.small', t.id) }, { key: 'name', label: 'Misconception' }, { key: 'chapter_id', label: 'Chapter' }, { key: 'area', label: 'Area', render: t => t.area || t.topic || '' }],
      { onRow: t => modal({ title: `${t.id} · ${t.name}`, wide: true, body: h('div', h('p', t.description || t.explanation || ''), ...['indicators', 'question_patterns', 'causes', 'strategies', 'related', 'evidence'].filter(k => t[k]).map(k => h('div', h('h3', k.replace('_', ' ')), Array.isArray(t[k]) ? h('ul', ...t[k].map(x => h('li', typeof x === 'string' ? x : JSON.stringify(x)))) : h('p', typeof t[k] === 'string' ? t[k] : JSON.stringify(t[k]))))) }), pageSize: 20 }));
  return h('div', pageHead('Curriculum', 'Cambridge IGCSE Computer Science (0478): school → grade → subject → chapter → subchapter → topic → question.'),
    card(tabs([{ id: 'ch', label: 'Chapters and topics' }, { id: 'tax', label: 'Misconception taxonomy' }], id => (id === 'ch' ? drawCh() : drawTax())), body));
}

// ── Settings ────────────────────────────────────────────────────────────────
export async function settingsView(ctx) {
  const { store, navigate } = ctx;
  const s = store.settings;
  const mod = input(String(s.risk_thresholds?.moderate ?? DEFAULT_THRESHOLDS.moderate), { type: 'number', step: 0.01, min: 0, max: 1 });
  const high = input(String(s.risk_thresholds?.high ?? DEFAULT_THRESHOLDS.high), { type: 'number', step: 0.01, min: 0, max: 1 });
  const capture = checkbox('Record page interruptions (visibility changes) as context. Never used as a predictor or as evidence of cheating.', s.capture_interruptions !== false);
  const consent = checkbox('Research exports include only learners with recorded research consent', s.research_export_requires_consent !== false);
  const selfReg = checkbox('Students may register themselves with a class code', s.allow_student_self_registration !== false);
  const retention = input(String(s.retention_days ?? 730), { type: 'number', min: 30, max: 3650 });
  const release = select([['on_scoring', 'Release results as soon as they are marked'], ['manual', 'Teacher releases results']], s.release_feedback_default || 'on_scoring');
  return h('div', pageHead('Platform settings', 'Analytics configuration and data-protection settings. Changes are audited.'),
    h('div.grid-2',
      card('Early-warning thresholds', h('p.small', 'Used when a model has no thresholds of its own. Registered models carry thresholds justified on validation data (see Models); those take precedence.'),
        h('div.form-grid', field('Moderate risk from probability', mod), field('High risk from probability', high))),
      card('Data collection and protection', capture.el, consent.el, selfReg.el, field('Keep learning records for (days)', retention, 'Records older than this are listed for deletion under Data and privacy.'), field('Assessment results default', release))),
    h('div.card-foot', btn('Save settings', async () => {
      const m = Number(mod.value), hi = Number(high.value);
      if (!(m > 0 && hi > m && hi < 1)) return toast('Thresholds must satisfy 0 < moderate < high < 1', 'warn');
      try { await store.saveSettings({ risk_thresholds: { moderate: m, high: hi }, capture_interruptions: capture.input.checked, research_export_requires_consent: consent.input.checked, allow_student_self_registration: selfReg.input.checked, retention_days: Number(retention.value), release_feedback_default: release.value }); toast('Settings saved', 'ok'); navigate('/settings'); } catch (e) { errorToast(e); }
    }, { kind: 'primary' })));
}

// ── Model registry ──────────────────────────────────────────────────────────
export async function modelsView(ctx) {
  const { store, navigate } = ctx;
  const models = await store.listModels();
  const preds = await store.listAllPredictions().catch(() => []);
  const register = filePicker('.json,application/json', async (text) => {
    try {
      const e = JSON.parse(text);
      if (!e.model_version || !e.metrics || !e.features) throw new Error('This is not a registry_entry.json from the research pipeline (ml/models/<version>/registry_entry.json).');
      const { metrics, ...rest } = e;
      await store.saveModel({ ...rest, metrics: { test: metrics.test, cv: metrics.cv, subgroups: metrics.subgroups, errors: metrics.errors }, status: e.status === 'production' ? 'candidate' : (e.status || 'candidate') });
      toast(`Registered ${e.model_version} as a candidate`, 'ok'); navigate('/models');
    } catch (er) { errorToast(er, 'Register'); }
  }, 'Register model (registry_entry.json)');
  const importPreds = filePicker('.json,application/json', async (text) => {
    try {
      const f = JSON.parse(text); const list = f.predictions || f;
      if (!Array.isArray(list) || !list.length) throw new Error('No predictions in this file.');
      const m = models.find(x => x.id === list[0].model_version);
      if (!m) throw new Error(`Model ${list[0].model_version} is not registered. Register it first.`);
      if (m.status !== 'production') throw new Error(`Model ${m.id} is ${m.status}. Only predictions from the production model are imported, so teachers never see output from an unapproved model.`);
      const bad = list.filter(p => !p.student_uid || !p.class_code || !p.model_version || !('risk_category' in p));
      if (bad.length) throw new Error(`${bad.length} rows lack student_uid, class_code, model_version or risk_category.`);
      const status = m.validated_on_real_data ? 'validated' : 'demonstration';
      const nImp = await store.importPredictions(list.map(p => ({ ...p, prediction_status: status })), { model_version: m.id, prediction_status: status });
      toast(`${nImp} predictions imported (${status})`, 'ok'); navigate('/models');
    } catch (er) { errorToast(er, 'Import predictions'); }
  }, 'Import predictions');
  const rows = models.map(m => ({ m, id: m.id, name: m.model_name || m.model_type, status: m.status, real: !!m.validated_on_real_data, prauc: m.metrics?.test?.pr_auc, recall: m.metrics?.test?.recall, precision: m.metrics?.test?.precision, brier: m.metrics?.test?.brier,
    preds: preds.filter(p => p.model_version === m.id).length, when: toMs(m.registered_at || m.training?.trained_at) }));
  const detail = (m) => modal({ title: m.id, wide: true, body: h('div',
    m.warning ? callout(m.warning, 'warn') : null,
    h('p', h('strong', m.model_name || m.model_type), ` · features ${m.feature_version} · trained on ${m.trained_on}`), h('p.small', m.label_definition || ''),
    m.training ? h('p.small', `Training cohort ${m.training.train_cohort} (${m.training.train_rows} rows, ${m.training.train_learners} learners); temporal hold-out ${m.training.test_cohort} (${m.training.test_rows} rows, ${m.training.test_learners} learners). ${m.training.selection_rule}. Data hash ${m.training.data_hash}.`) : null,
    m.thresholds ? h('p.small', `Thresholds: moderate ≥ ${m.thresholds.moderate}, high ≥ ${m.thresholds.high}. ${m.thresholds.rule || ''}`) : null,
    m.metrics?.test ? h('table', h('thead', h('tr', h('th', 'Hold-out metric'), h('th.num', 'Value'))), h('tbody', ...[['PR-AUC', m.metrics.test.pr_auc], ['ROC-AUC', m.metrics.test.roc_auc], ['Recall (flag)', m.metrics.test.recall], ['Precision (flag)', m.metrics.test.precision], ['F1 (flag)', m.metrics.test.f1], ['Brier score', m.metrics.test.brier], ['Calibration error (ECE)', m.metrics.test.ece], ['Prevalence', m.metrics.test.prevalence]].map(([k, v]) => h('tr', h('td', k), h('td.num', v == null ? '—' : Number(v).toFixed(3)))))) : null,
    m.metrics?.test?.flag?.confusion ? h('p.small', `At the flag threshold: ${m.metrics.test.flag.confusion.tp} true positives, ${m.metrics.test.flag.confusion.fp} false positives (flagged but fine), ${m.metrics.test.flag.confusion.fn} false negatives (missed), ${m.metrics.test.flag.confusion.tn} true negatives.`) : null,
    m.artefact ? callout('This model has an in-browser artefact: teachers can score their classes from the Early-warning page.', 'info') : callout('No in-browser artefact: predictions come from the Python pipeline (Import predictions).', ''),
    m.promotion_reason ? h('p.small.muted', `Promoted ${fmtDate(m.promoted_at)}: ${m.promotion_reason}`) : null) });
  return h('div', pageHead('Models', 'The model registry. A model reaches teachers only after an administrator promotes it; the previous production model is archived and can be restored (rollback).', register, importPreds),
    callout(['Train and evaluate in the research pipeline (', h('code', 'python -m cslifeline_ml train'), '), then register its ', h('code', 'registry_entry.json'), ' here. Models trained on synthetic data can only be used as clearly labelled DEMONSTRATION models.'], 'info'),
    card(dataTable(rows, [
      { key: 'id', label: 'Version', render: r => h('a', { href: '#', on: { click: (e) => { e.preventDefault(); detail(r.m); } } }, r.id) }, { key: 'name', label: 'Model' },
      { key: 'status', label: 'Status', render: r => badge(r.status, r.status === 'production' ? 'ok' : r.status === 'candidate' ? 'info' : '') },
      { key: 'real', label: 'Data', render: r => r.real ? badge('validated on real data', 'ok') : badge('synthetic — demonstration', 'demo') },
      { key: 'prauc', label: 'PR-AUC', num: true, render: r => r.prauc == null ? '—' : r.prauc.toFixed(3) }, { key: 'recall', label: 'Recall', num: true, render: r => fmtPct(r.recall) }, { key: 'precision', label: 'Precision', num: true, render: r => fmtPct(r.precision) },
      { key: 'preds', label: 'Predictions', num: true },
      { key: 'act', label: '', sortable: false, render: r => r.status === 'production' ? h('span.small.muted', 'in use') : btn(r.status === 'archived' ? 'Restore (rollback)' : 'Promote', async () => {
        if (!r.real && !(await confirmDialog('Promote a DEMONSTRATION model?', 'This model was not validated on real learners. Its predictions will be labelled "demonstration" everywhere and must not be acted on as evidence.', { confirmLabel: 'Promote as demonstration' }))) return;
        const reason = await reasonOrStop(`Why promote ${r.id}?`); if (!reason) return;
        try { await store.promoteModel(r.id, reason); toast(`${r.id} is now in production`, 'ok'); navigate('/models'); } catch (e) { errorToast(e); }
      }, { sm: true, kind: 'primary' }) },
    ], { initialSort: { key: 'when', dir: 'desc' }, empty: 'No models registered. Until one is promoted, no predictions are shown to teachers.' })));
}

// ── Integrations, batch import and identity ─────────────────────────────────
function integrationBadge(p) {
  if (p.status === 'disabled') return badge('disabled');
  if (p.connection_status === 'connected' && p.last_success_at) return badge(`connected · last ${rel(toMs(p.last_success_at))}`, 'ok');
  if (p.status === 'test_data') return badge('test data only — not connected', 'demo');
  if (p.last_import_at) return badge(`batch import · last ${rel(toMs(p.last_import_at))}`, 'info');
  return badge('configured — no data received', 'warn');
}

export async function integrationsView(ctx) {
  const { store, navigate } = ctx;
  const [integ, idmap, students] = await Promise.all([store.listIntegrations(), store.listIdentityMap(), store.listUsers([['role', '==', 'student']])]);
  const byId = Object.fromEntries(integ.map(p => [p.id, p]));
  const known = Object.keys(PLATFORMS).filter(k => k !== 'CS_LIFELINE');
  const all = [...new Set([...known, ...integ.map(p => p.id)])];
  const platformCard = (id) => {
    const p = byId[id] || { id, name: PLATFORMS[id]?.name || id };
    const auth = p.authorisation || {};
    return card(cardHead(p.name || id, integrationBadge(p)),
      h('div.grid-tiles', tile('Received', n(p.records_received || 0)), tile('Accepted', n(p.records_accepted || 0)), tile('Rejected', n(p.records_rejected || 0), '', { attention: (p.records_rejected || 0) > 0 }), tile('Duplicates ignored', n(p.duplicates || 0))),
      h('p.small', h('strong', 'Adapter: '), `${PLATFORMS[id]?.adapter || p.adapter || 'canonical events'} · schema ${p.schema_version || EVENT_SCHEMA_VERSION}`, h('br'), h('strong', 'Connection: '), p.connection || (p.connection_status === 'connected' ? 'Signed API requests' : 'None yet')),
      h('p.small', h('strong', 'Data-sharing authorisation: '), auth.status === 'approved' ? badge(`approved ${fmtDate(auth.approved_at)} — ${auth.basis}`, 'ok') : badge('not authorised — the API rejects this platform', 'warn')),
      (p.last_errors || []).length ? h('details', h('summary.small', `Last ${p.last_errors.length} rejected records`), h('ul.small', ...p.last_errors.map(e => h('li', `${e.source_learner_id || e.event_id || e.key || ''}: ${e.reason || (e.errors || []).join('; ')}`)))) : null,
      h('div.card-foot', btn(auth.status === 'approved' ? 'Withdraw authorisation' : 'Record authorisation', async () => {
        if (auth.status === 'approved') { const r = await reasonOrStop('Why is data sharing being withdrawn?'); if (!r) return; await store.saveIntegration({ id, name: p.name || id, authorisation: { status: 'withdrawn', withdrawn_at: new Date().toISOString(), reason: r, by: store.auth.uid } }); }
        else {
          const basis = await promptDialog(`Authorise data from ${p.name || id}`, 'Legal / institutional basis and scope (e.g. "Data-sharing agreement DSA-2026-03 with DPS; IGCSE CS quiz answers only; pseudonymised; 2-year retention")'); if (!basis) return;
          await store.saveIntegration({ id, name: p.name || id, adapter: PLATFORMS[id]?.adapter || 'events', status: p.status === 'disabled' ? 'configured' : (p.status || 'configured'), authorisation: { status: 'approved', basis, approved_at: new Date().toISOString(), by: store.auth.uid } });
        }
        toast('Saved', 'ok'); navigate('/integrations');
      }, { sm: true }), btn('Import a batch…', () => importBatch(store, id, navigate), { sm: true, kind: 'primary', ic: 'upload', disabled: auth.status !== 'approved' && !store.isDemo })));
  };
  const linked = idmap.filter(x => x.status === 'verified').length;
  const names = Object.fromEntries(students.map(s => [s.id, `${studentName(s)} (${s.class_code})`]));
  return h('div', pageHead('Integrations', 'WOW Sir, DBWOW and future platforms contribute authorised, educationally relevant records through one canonical event schema. Each platform keeps working on its own.'),
    callout(['Only platforms with a recorded data-sharing authorisation are accepted by the ingest API. Permission to use one platform never implies permission to share its data. ',
      CONFIG.functionsDeployed ? 'API endpoint: POST https://<region>-<project>.cloudfunctions.net/ingest (signed requests; see docs/API_DOCUMENTATION.md).' : 'The ingest API (Cloud Function) is not deployed in this installation; use batch import below. See docs/INTEGRATION_GUIDE.md.'], 'info'),
    ...all.map(platformCard),
    card(cardHead('Learner identity map', badge(`${linked} verified link${linked === 1 ? '' : 's'}`, 'info')),
      h('p.small', 'Links connect a learner on another platform to a CS Lifeline research ID. A link is used only when its status is ', h('strong', 'verified'), ' by a teacher or administrator. Names are never used to match automatically; unverified records stay separate learning histories.'),
      dataTable(idmap.map(x => ({ x, id: x.id, platform: x.source_platform, source: x.source_learner_id, student: names[x.student_uid] || '—', status: x.status, evidence: x.evidence || '' })), [
        { key: 'platform', label: 'Platform' }, { key: 'source', label: 'Learner on that platform', render: r => h('code.small', r.source) }, { key: 'student', label: 'CS Lifeline learner' },
        { key: 'status', label: 'Status', render: r => badge(r.status, r.status === 'verified' ? 'ok' : r.status === 'rejected' ? 'danger' : 'warn') }, { key: 'evidence', label: 'Evidence', render: r => h('span.small', r.evidence) },
        { key: 'act', label: '', sortable: false, render: r => h('span.row', r.status !== 'verified' ? btn('Verify', async () => { const ev = await promptDialog('Verify this link', 'How was it confirmed? (e.g. student confirmed their WOW Sir name in class, 6 Nov)'); if (!ev) return; await store.saveIdentityLink({ ...r.x, status: 'verified', evidence: ev }); toast('Verified', 'ok'); navigate('/integrations'); }, { sm: true }) : null,
          r.status !== 'rejected' ? btn('Reject', async () => { const ev = await promptDialog('Reject this link', 'Reason'); if (!ev) return; await store.saveIdentityLink({ ...r.x, status: 'rejected', evidence: ev }); toast('Link rejected; records stay separate', 'ok'); navigate('/integrations'); }, { sm: true, kind: 'ghost' }) : null) },
      ], { pageSize: 15 })));
}

async function importBatch(store, platform, navigate) {
  const kind = select(platform === 'WOW_SIR' ? [['wowsir-session', 'WOW Sir live-session export (meta, players, questions)'], ['events', 'Canonical events (JSON array)']]
    : platform === 'DBWOW' ? [['dbwow-progress', 'DBWOW Learning Centre progress export (uid, progress)'], ['events', 'Canonical events (JSON array)']] : [['events', 'Canonical events (JSON array)']]);
  const out = h('div');
  let pending = null;
  const pick = filePicker('.json,application/json', async (text, file) => {
    try {
      const raw = JSON.parse(text);
      let cand = [], rej = [], hints = [];
      if (kind.value === 'wowsir-session') { for (const x of [].concat(raw)) { const r = fromWowSirSession(x); cand.push(...r.events); rej.push(...r.rejected); hints.push(...r.nameHints); } }
      else if (kind.value === 'dbwow-progress') { const key = await (await fetch('/data/integrations/dbwow_quiz_key.json')).json(); for (const x of [].concat(raw)) { const r = fromDbwowProgress(x, key); cand.push(...r.events); rej.push(...r.rejected); } }
      else cand = [].concat(raw.events || raw);
      const wrong = cand.filter(c => c.source_platform && c.source_platform !== platform);
      cand = cand.filter(c => !c.source_platform || c.source_platform === platform).map(c => ({ ...c, source_platform: platform }));
      const existing = new Set((await store.listEvents([['source_platform', '==', platform]])).map(e => e.id));
      const { accepted, rejected, duplicates } = processBatch(cand, { existingIds: existing });
      const allRej = [...rej, ...wrong.map(w => ({ event_id: w.event_id, reason: `source_platform ${w.source_platform} does not match ${platform}` })), ...rejected];
      pending = { raw, accepted, rejected: allRej, duplicates, hints, file: file?.name };
      out.replaceChildren(h('div.grid-tiles', tile('Accepted', n(accepted.length)), tile('Rejected', n(allRej.length), '', { attention: allRej.length > 0 }), tile('Duplicates', n(duplicates)), tile('Learners', n(new Set(accepted.map(a => a.source_learner_id)).size))),
        allRej.length ? h('details', h('summary', 'Rejected records and reasons'), h('ul.small', ...allRej.slice(0, 100).map(r => h('li', `${r.source_learner_id || r.event_id || r.key || ''}: ${r.reason || (r.errors || []).join('; ')}`)))) : null,
        hints.length ? h('p.small.muted', `${hints.length} WOW Sir player name(s) found. They are NOT stored in events; unverified identity links are created for a teacher to confirm.`) : null);
    } catch (e) { out.replaceChildren(callout('Could not read this file: ' + e.message, 'danger')); }
  }, 'Choose JSON file');
  modal({ title: `Import a batch from ${PLATFORMS[platform]?.name || platform}`, wide: true, body: h('div', field('Format', kind), pick, out, h('p.small.muted', 'The original file is kept as a raw source record. Only valid, new events are stored; nothing is discarded silently.')),
    actions: [{ label: 'Cancel' }, { label: 'Store accepted events', kind: 'primary', onClick: async () => {
      if (!pending) { toast('Choose a file first', 'warn'); return false; }
      try {
        await store.storeBatch({ platform, raw: pending.raw, accepted: pending.accepted, rejected: pending.rejected, duplicates: pending.duplicates, batchMeta: { file_name: pending.file || null, adapter: kind.value } });
        for (const hnt of pending.hints) await store.saveIdentityLink({ source_platform: platform, source_learner_id: hnt.source_learner_id, student_uid: null, pseudo_id: null, status: 'unverified', evidence: `Name in source: "${hnt.name}" (not verified)` });
        toast(`${pending.accepted.length} events stored`, 'ok'); navigate('/integrations');
      } catch (e) { errorToast(e); return false; }
    } }] });
}

// ── Audit log ───────────────────────────────────────────────────────────────
function auditTable(rows, users, opts = {}) {
  const names = Object.fromEntries(users.map(u => [u.id, u.display_name || u.email || u.id]));
  return dataTable(rows.map(a => ({ a, at: toMs(a.at), actor: names[a.actor_uid] || a.actor_uid || 'system', role: a.actor_role || '', action: a.action, target: a.target, details: a.details })), [
    { key: 'at', label: 'When', render: r => fmtDate(r.at, true) }, { key: 'actor', label: 'Who' }, { key: 'action', label: 'Action', render: r => h('code.small', r.action) }, { key: 'target', label: 'Record', render: r => h('span.small', r.target) },
    { key: 'details', label: 'Details', sortable: false, render: r => h('span.small', r.details?.reason ? `Reason: ${r.details.reason}` : JSON.stringify(r.details || {}).slice(0, 140)) },
  ], { initialSort: { key: 'at', dir: 'desc' }, ...opts });
}

export async function auditView(ctx) {
  const { store } = ctx;
  const [rows, users] = await Promise.all([store.listAudit(1000), store.listUsers()]);
  return h('div', pageHead('Audit log', 'Append-only record of administrative and teacher actions (role changes, consent, exports, imports, promotions, erasure). Entries cannot be edited or deleted — the rules forbid it.',
    btn('Download CSV', () => download('audit_log.csv', toCSV(rows.map(a => ({ at: new Date(toMs(a.at)).toISOString(), actor_uid: a.actor_uid, role: a.actor_role, action: a.action, target: a.target, details: JSON.stringify(a.details || {}) })))), { ic: 'download' })),
    card(auditTable(rows, users, { pageSize: 30 })));
}

// ── Data and privacy ────────────────────────────────────────────────────────
export async function dataView(ctx) {
  const { store } = ctx;
  const users = await store.listUsers([['role', '==', 'student']]);
  const consent = (k) => users.filter(u => (u.consent?.research_use || 'not_recorded') === k).length;
  const days = store.settings.retention_days || 730;
  const cutoff = Date.now() - days * 864e5;
  const stale = users.filter(u => toMs(u.last_seen) && toMs(u.last_seen) < cutoff && u.status !== 'erased');
  const synthetic = users.filter(u => u.is_synthetic).length;
  return h('div', pageHead('Data and privacy', 'Consent overview, retention, erasure and the separation of synthetic from real records.'),
    h('div.grid-tiles', tile('Learners', n(users.length)), tile('Research consent granted', n(consent('granted'))), tile('Not recorded', n(consent('not_recorded'))), tile('Refused / withdrawn', n(consent('refused') + consent('withdrawn'))),
      tile('Synthetic learner records', n(synthetic), synthetic ? 'clearly marked; excluded from real-data exports' : 'none'), tile(`Inactive > ${days} days`, n(stale.length), 'candidates for deletion', { attention: stale.length > 0 })),
    card('Retention', stale.length ? h('div', h('p', `${stale.length} learner(s) have not been active for more than ${days} days. Review them and erase their learning data from Users and roles if the school no longer needs it.`),
      h('ul.small', ...stale.slice(0, 50).map(u => h('li', `${studentName(u)} (${u.class_code}) — last active ${fmtDate(u.last_seen)}`)))) : h('p.muted', 'No learner is past the retention period.')),
    card('What is stored and why', h('ul',
      h('li', 'Answers, correctness, time on each question, answer changes and hint use — to identify misconceptions and learning difficulty.'),
      h('li', 'Page interruptions (if enabled) — context only; never a predictor and never treated as cheating.'),
      h('li', 'Predictions with model version, date and contributing features — so every early-warning indicator can be audited. Students never see them.'),
      h('li', 'Research exports use pseudonymous IDs only and, by default, only learners with recorded consent.'),
      h('li', 'Not collected: other apps or websites, location, device identifiers, contacts.')),
      h('p.small', 'Full policy: docs/SECURITY_AND_PRIVACY.md. Data-subject requests: use "Erase learning data" on the learner in Users and roles; then delete the sign-in account in Firebase Authentication.')));
}
