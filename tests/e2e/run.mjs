#!/usr/bin/env node
// End-to-end test in a real browser (Chromium via Playwright) against the demonstration backend.
// Visits every route of every portal, fails on any uncaught error / console error, and runs the key
// workflows: student practice + assessment submission, teacher marking + intervention, admin pages.
// Screenshots go to tests/e2e/out/. Usage: node tests/e2e/run.mjs [--headed]
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
import { mkdirSync, readFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from '../../scripts/serve.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = join(ROOT, 'tests/e2e/out'); mkdirSync(OUT, { recursive: true });
const PORT = 8655;
const BASE = `http://localhost:${PORT}`;
const demo = JSON.parse(readFileSync(join(ROOT, 'public/data/demo/demo_dataset.json'), 'utf8')).collections;
const logins = demo.users.filter(u => u.demo_login);
const student = logins.find(u => u.role === 'student' && u.class_code === 'NB-10A');
const teacher = logins.find(u => u.id === 'syn_teacher_nb');
const admin = logins.find(u => u.role === 'admin');

const server = await startServer(PORT);
const browser = await chromium.launch();
const results = []; let failures = 0;
const errorsOf = new Map();

async function newPage(user, viewport = { width: 1366, height: 860 }) {
  const ctx = await browser.newContext({ viewport });
  await ctx.addInitScript(([u]) => { localStorage.setItem('csl.mode', 'demo'); if (u && !localStorage.getItem('csl.demo.auth.v2')) localStorage.setItem('csl.demo.auth.v2', JSON.stringify({ uid: u.id, email: u.email || '', displayName: u.display_name, provider: 'demo' })); }, [user]);
  const page = await ctx.newPage();
  const errs = []; errorsOf.set(page, errs);
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/favicon/.test(m.text())) errs.push('console: ' + m.text()); });
  return page;
}
async function check(name, fn) {
  const t0 = Date.now();
  try { await fn(); results.push(['PASS', name, Date.now() - t0]); }
  catch (e) { failures++; results.push(['FAIL', name, Date.now() - t0, e.message.split('\n')[0]]); }
}
async function visit(page, url, shot, { expect = null } = {}) {
  const errs = errorsOf.get(page); const before = errs.length;
  await page.goto(BASE + url, { waitUntil: 'load' });
  await page.waitForFunction(() => { const m = document.querySelector('#main'); return m && !m.querySelector('.skeleton') && m.textContent.trim().length > 0; }, null, { timeout: 30000 });
  await page.waitForTimeout(250);
  const text = await page.locator('#main').innerText();
  if (/Something went wrong|Page not found/.test(text)) throw new Error(`error page shown: ${text.slice(0, 200)}`);
  if (expect && !text.includes(expect)) throw new Error(`expected text "${expect}" not found`);
  if (shot) await page.screenshot({ path: join(OUT, shot + '.png'), fullPage: false });
  const newErrs = errs.slice(before); if (newErrs.length) throw new Error(newErrs.join(' | '));
  return text;
}

// ── Landing page ───────────────────────────────────────────────────────────
await check('landing page loads (demo)', async () => {
  const p = await newPage(null);
  await p.goto(BASE + '/?mode=demo'); await p.waitForSelector('#app *'); await p.waitForTimeout(500);
  await p.screenshot({ path: join(OUT, '00-landing.png') });
  const errs = errorsOf.get(p); if (errs.length) throw new Error(errs.join(' | '));
});

// ── Student ────────────────────────────────────────────────────────────────
const sp = await newPage(student);
for (const [route, shot] of [['/', 's-home'], ['/practice', 's-practice'], ['/assessments', 's-assessments'], ['/assigned', null], ['/challenge', null], ['/progress', 's-progress'], ['/editor', null], ['/tutorials', null], ['/account', null]]) {
  await check(`student ${route}`, () => visit(sp, '/student/#' + route, shot));
}
await check('student progress never shows risk labels', async () => {
  const t = await visit(sp, '/student/#/progress');
  if (/at[- ]risk|risk|prediction/i.test(t)) throw new Error('risk/prediction wording visible to student');
});
await check('student practice: answer and get feedback', async () => {
  await visit(sp, '/student/#/practice');
  const start = sp.getByRole('button', { name: /start|practise/i }).first();
  await start.click(); await sp.waitForTimeout(600);
  const opt = sp.locator('.option input, .options input').first();
  if (await opt.count()) { await opt.check({ force: true }); }
  else { const inp = sp.locator('#main input[type=text], #main textarea').first(); if (await inp.count()) await inp.fill('1'); }
  await sp.getByRole('button', { name: /check|submit/i }).first().click(); await sp.waitForTimeout(500);
  const fb = await sp.locator('.feedback').count();
  if (!fb) throw new Error('no feedback shown after answering');
  await sp.screenshot({ path: join(OUT, 's-practice-feedback.png') });
});
await check('student takes and submits the open assessment', async () => {
  await visit(sp, '/student/#/assessment/asm_nb_10a_week9_check');
  const begin = sp.getByRole('button', { name: /start|begin/i }).first(); if (await begin.count()) { await begin.click(); await sp.waitForTimeout(500); }
  await sp.screenshot({ path: join(OUT, 's-assessment.png') });
  for (let i = 0; i < 12; i++) {
    const opt = sp.locator('#main .option input').first();
    if (await opt.count()) await opt.check({ force: true });
    const next = sp.getByRole('button', { name: /^next/i });
    if (await next.count() && await next.first().isEnabled()) { await next.first().click(); await sp.waitForTimeout(150); } else break;
  }
  sp.once('dialog', d => d.accept());
  await sp.getByRole('button', { name: /submit/i }).first().click(); await sp.waitForTimeout(300);
  const confirm = sp.locator('.modal-foot .btn.primary'); if (await confirm.count()) await confirm.first().click();
  await sp.waitForTimeout(1500);
  const errs = errorsOf.get(sp); if (errs.length) throw new Error(errs.join(' | '));
  const sub = await sp.evaluate(() => JSON.parse(localStorage.getItem('csl.demo.overlay.v2') || '{}').submissions);
  if (!sub || !Object.keys(sub).length) throw new Error('no submission stored');
  await sp.screenshot({ path: join(OUT, 's-assessment-submitted.png') });
});

// ── Teacher ────────────────────────────────────────────────────────────────
const tp = await newPage(teacher);
const firstStudent = demo.users.find(u => u.role === 'student' && u.class_code === 'NB-10A');
const interv = demo.interventions.find(i => i.class_code.startsWith('NB'));
for (const [route, shot, expect] of [['/', 't-dashboard', 'Students requiring attention'], ['/students', 't-students'], [`/student/${firstStudent.id}`, 't-student-detail'], ['/analytics', 't-analytics'],
  ['/misconceptions', 't-misconceptions'], ['/early-warning', 't-early-warning', 'Demonstration model'], ['/interventions', 't-interventions'], ['/interventions/new', null], [interv ? `/intervention/${interv.id}` : '/interventions', 't-intervention'],
  ['/assessments', 't-assessments'], ['/assessment/new/edit', 't-assessment-new'], ['/assessment/asm_nb_10a_week9_check/results', 't-assessment-results'], ['/questions', 't-questions'],
  ['/question/new', 't-question-new'], [`/question/${demo.assessments[0].question_ids[0]}`, null], ['/questions/import', null], ['/roster', 't-roster'], ['/reports', 't-reports'], ['/research', null]]) {
  await check(`teacher ${route}`, () => visit(tp, '/teacher/#' + route, shot, { expect }));
}
await check('teacher generates every report type', async () => {
  for (const type of ['student', 'class', 'chapter', 'misconceptions', 'atrisk', 'interventions', 'progress']) {
    await visit(tp, '/teacher/#/reports');
    await tp.locator('#main .card select').first().selectOption(type); await tp.waitForTimeout(100);
    await tp.getByRole('button', { name: 'Generate report' }).click(); await tp.waitForTimeout(700);
    const t = await tp.locator('#main').innerText();
    if (!/Generated/.test(t)) throw new Error(`${type} report did not render: ${t.slice(-300)}`);
    if (type === 'class') await tp.screenshot({ path: join(OUT, 't-report-class.png'), fullPage: true });
  }
  const errs = errorsOf.get(tp); if (errs.length) throw new Error(errs.join(' | '));
});
await check('teacher scores class with the in-browser model', async () => {
  await visit(tp, '/teacher/#/early-warning');
  const b = tp.getByRole('button', { name: /^Score with/ });
  if (!(await b.count())) throw new Error('no scoring button');
  await b.click(); await tp.locator('.modal-foot .btn.primary').click(); await tp.waitForTimeout(1500);
  const errs = errorsOf.get(tp); if (errs.length) throw new Error(errs.join(' | '));
  const preds = await tp.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('csl.demo.overlay.v2') || '{}').predictions || {}).length);
  if (!preds) throw new Error('no predictions saved');
});
await check('same browser: teacher sees the student\'s submission, marked', async () => {
  // The demonstration backend keeps data per browser, so switch the student's browser to the teacher account.
  await sp.evaluate((t) => localStorage.setItem('csl.demo.auth.v2', JSON.stringify({ uid: t.id, email: t.email, displayName: t.display_name, provider: 'demo' })), teacher);
  const t = await visit(sp, '/teacher/#/assessment/asm_nb_10a_week9_check/results', 't-assessment-marked');
  if (!t.includes(student.display_name)) throw new Error('student submission not listed');
  const res = await sp.evaluate(() => Object.values(JSON.parse(localStorage.getItem('csl.demo.overlay.v2') || '{}').submission_results || {}));
  if (!res.length || res[0].score == null) throw new Error('submission has no marked result');
  const resp = await sp.evaluate(() => Object.values(JSON.parse(localStorage.getItem('csl.demo.overlay.v2') || '{}').responses || {}).filter(r => r.mode === 'assessment'));
  if (!resp.length || !resp.every(r => r.class_code === 'NB-10A')) throw new Error('assessment responses missing or without class_code');
});
await check('teacher validates a question in the editor', async () => {
  await visit(tp, '/teacher/#/question/new');
  await tp.locator('#main input').first().fill('E2E_TEST_01');
  await tp.locator('#main textarea').first().fill('Which keyword starts a count-controlled loop in pseudocode?');
  const opts = tp.locator('#main input[placeholder^="Option"]');
  for (let i = 0; i < 4; i++) await opts.nth(i).fill(['FOR', 'WHILE', 'REPEAT', 'IF'][i]);
  await tp.getByRole('button', { name: 'Save question' }).click(); await tp.waitForTimeout(800);
  const m = tp.locator('.modal-foot .btn.primary'); if (await m.count()) { await m.click(); await tp.waitForTimeout(500); }
  const q = await tp.evaluate(() => JSON.parse(localStorage.getItem('csl.demo.overlay.v2') || '{}').questions?.E2E_TEST_01);
  if (!q) throw new Error('question not saved');
});

// ── Admin ──────────────────────────────────────────────────────────────────
const ap = await newPage(admin);
for (const [route, shot] of [['/', 'a-overview'], ['/users', 'a-users'], ['/schools', 'a-schools'], ['/curriculum', null], ['/settings', null], ['/models', 'a-models'], ['/integrations', 'a-integrations'], ['/audit', 'a-audit'], ['/data', null]]) {
  await check(`admin ${route}`, () => visit(ap, '/admin/#' + route, shot));
}
await check('admin approves the pending teacher (with audited reason)', async () => {
  await visit(ap, '/admin/#/');
  await ap.getByRole('button', { name: 'Review' }).first().click(); await ap.waitForTimeout(300);
  await ap.locator('.modal input[type=checkbox]').first().check();
  await ap.locator('.modal-foot .btn.primary').click(); await ap.waitForTimeout(300);
  await ap.locator('.modal textarea').fill('Approved for E2E test'); await ap.locator('.modal-foot .btn.primary').last().click(); await ap.waitForTimeout(800);
  const u = await ap.evaluate(() => JSON.parse(localStorage.getItem('csl.demo.overlay.v2') || '{}').users?.syn_teacher_pending);
  if (u?.role !== 'teacher') throw new Error('role not updated: ' + JSON.stringify(u));
  const audit = await ap.evaluate(() => Object.values(JSON.parse(localStorage.getItem('csl.demo.overlay.v2') || '{}').audit_logs || {}));
  if (!audit.some(a => a.action === 'user.update' && a.details?.reason === 'Approved for E2E test')) throw new Error('no audit entry');
});

// ── Access control in the UI (rules are the real control; see tests/rules) ─
await check('student cannot open the teacher portal', async () => {
  const sp2 = await newPage(student);
  await sp2.goto(BASE + '/teacher/'); await sp2.waitForTimeout(1500);
  if (!sp2.url().includes('/student/')) throw new Error('student was not redirected: ' + sp2.url());
});
await check('teacher cannot open the admin portal', async () => {
  await tp.goto(BASE + '/admin/'); await tp.waitForTimeout(1500);
  if (!tp.url().includes('/teacher/')) throw new Error('teacher was not redirected: ' + tp.url());
});

// ── Mobile layout ──────────────────────────────────────────────────────────
await check('mobile: no horizontal scroll on key pages', async () => {
  const mp = await newPage(teacher, { width: 390, height: 844 });
  for (const r of ['/teacher/#/', '/teacher/#/students', '/teacher/#/early-warning']) {
    await visit(mp, r, r === '/teacher/#/' ? 'm-teacher-dashboard' : null);
    const over = await mp.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    if (over > 2) throw new Error(`${r} overflows by ${over}px`);
  }
  const ms = await newPage(student, { width: 390, height: 844 });
  await visit(ms, '/student/#/', 'm-student-home');
  const over = await ms.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  if (over > 2) throw new Error(`student home overflows by ${over}px`);
});

await browser.close(); server.close();
for (const r of results) console.log(`${r[0]}  ${r[1]}  (${r[2]} ms)${r[3] ? '\n      ' + r[3] : ''}`);
console.log(`\n${results.length - failures}/${results.length} passed`);
process.exit(failures ? 1 : 0);
