// Shared helpers for teacher and admin views.
import { h, select, badge, fmtPct } from '../ui/kit.js';
import { RISK_LABELS } from '../engine/risk.js';
import { STATUS } from '../engine/misconception.js';

const KEY = 'csl.teacher.class';

/** Classes the signed-in teacher may see (admins: all classes). */
export async function myClasses(store) {
  const list = await store.listClasses();
  if (store.me.role === 'teacher') { const mine = new Set(store.me.class_codes || []); return list.filter(c => mine.has(c.id)); }
  return list;
}

/** Class selector shown in page headers. Returns { codes, picker, classes }. */
export async function classContext(ctx, { allowAll = true } = {}) {
  const classes = await myClasses(ctx.store);
  let cur = ''; try { cur = localStorage.getItem(KEY) || ''; } catch { /* ignore */ }
  const ids = classes.map(c => c.id);
  if (cur !== 'ALL' && !ids.includes(cur)) cur = allowAll && ids.length > 1 ? 'ALL' : ids[0] || '';
  if (!allowAll && cur === 'ALL') cur = ids[0] || '';
  const picker = select([...(allowAll && ids.length > 1 ? [['ALL', `All my classes (${ids.length})`]] : []), ...classes.map(c => [c.id, `${c.name || c.id}${c.is_synthetic ? ' (synthetic)' : ''}`])], cur, { 'aria-label': 'Class' });
  picker.addEventListener('change', () => { try { localStorage.setItem(KEY, picker.value); } catch { /* ignore */ } ctx.navigate(location.hash.replace(/^#/, '') || '/'); });
  const codes = cur === 'ALL' ? ids : cur ? [cur] : [];
  return { codes, picker, classes, current: cur };
}

export function riskBadge(p) {
  if (!p) return badge('No prediction');
  const cls = { high: 'risk-high', moderate: 'risk-borderline', low: 'risk-low' }[p.risk_category] || 'risk-unknown';
  return h('span.row', { style: { gap: '.3rem' } }, h('span', { class: 'risk-pill ' + cls }, h('span.risk-dot', { 'aria-hidden': 'true' }), `${RISK_LABELS[p.risk_category] || p.risk_category}${p.risk_probability != null ? ' ' + fmtPct(p.risk_probability) : ''}`),
    p.prediction_status !== 'validated' ? badge('demo model', 'demo') : null);
}

export function statusBadge(st) { const s = STATUS[st]; return badge(s?.label || st, s?.tone === 'muted' ? '' : s?.tone); }

export function noClasses() {
  return h('div.card', h('h2', 'No classes yet'), h('p', 'You have not been assigned to a class. An administrator assigns classes in the Administration portal (Users → Approve / edit). Once assigned, your class data will appear here.'));
}

export function provenance(data, extra = '') {
  const syn = (data.students || []).some(s => s.is_synthetic) || (data.responses || []).some(r => r.is_synthetic);
  return h('p.small.muted', { style: { marginTop: '-.6rem', marginBottom: '1rem' } },
    `Computed from ${(data.responses || []).length.toLocaleString()} responses by ${(data.students || []).length} students in ${data.codes.join(', ') || 'no class'}.`,
    syn ? h('span', ' ', badge('Includes synthetic records', 'demo')) : null, extra ? ' ' + extra : '',
    Object.keys(data.errors || {}).length ? h('span', { style: { color: 'var(--danger)' } }, ` Some data could not be loaded (${Object.keys(data.errors).join(', ')}).`) : null);
}
