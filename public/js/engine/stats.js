// js/engine/stats.js — statistics helpers used by the engines (pure).
// Generic helpers (toMs, DAY, mean, slope) live in core/util.js and are re-exported here
// so there is exactly one implementation of each.

import { toMs, DAY, mean, slope } from '../core/util.js';
export { toMs, DAY, mean, slope };

export function median(xs) {
  const v = xs.filter(Number.isFinite).sort((a, b) => a - b);
  if (!v.length) return null;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}
export function sd(xs) {
  const v = xs.filter(Number.isFinite); if (v.length < 2) return null;
  const m = mean(v); return Math.sqrt(v.reduce((a, x) => a + (x - m) ** 2, 0) / (v.length - 1));
}
/** Wilson score interval for a proportion k/n. */
export function wilson(k, n, z = 1.96) {
  if (!n) return { p: null, lo: null, hi: null };
  const p = k / n, d = 1 + z * z / n;
  const c = (p + z * z / (2 * n)) / d, h = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d;
  return { p, lo: Math.max(0, c - h), hi: Math.min(1, c + h) };
}
export function round(x, d = 3) { return x === null || !Number.isFinite(x) ? null : Math.round(x * 10 ** d) / 10 ** d; }
/** ISO date (YYYY-MM-DD) of the Monday of the UTC week containing ms. */
export function weekKey(ms) {
  const d = new Date(ms); const day = (d.getUTCDay() + 6) % 7;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day)).toISOString().slice(0, 10);
}
