// js/engine/csv.js — RFC 4180 CSV parse/serialise (pure). Handles quotes, escaped quotes,
// embedded newlines, CRLF, BOM, and a leading "sep=" line written by Excel.

export function parseCSV(text) {
  let s = String(text ?? '');
  if (s.charCodeAt(0) === 0xfeff) s = s.slice(1);
  if (/^sep=.\r?\n/.test(s)) s = s.replace(/^sep=.\r?\n/, '');
  const rows = []; let row = [], field = '', i = 0, q = false;
  while (i < s.length) {
    const c = s[i];
    if (q) {
      if (c === '"') { if (s[i + 1] === '"') { field += '"'; i += 2; continue; } q = false; i++; continue; }
      field += c; i++; continue;
    }
    if (c === '"') { q = true; i++; continue; }
    if (c === ',') { row.push(field); field = ''; i++; continue; }
    if (c === '\r') { i++; continue; }
    if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; i++; continue; }
    field += c; i++;
  }
  if (q) throw new Error('CSV ends inside a quoted field (unbalanced quotes)');
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows.filter(r => !(r.length === 1 && r[0] === ''));
}

/** Parse CSV with a header row into objects. Header names are trimmed. */
export function parseCSVObjects(text) {
  const rows = parseCSV(text);
  if (!rows.length) return { headers: [], records: [] };
  const headers = rows[0].map(h => h.trim());
  const records = rows.slice(1).map((r, idx) => {
    const o = { __row: idx + 2 };
    headers.forEach((h, i) => { o[h] = r[i] !== undefined ? r[i] : ''; });
    return o;
  });
  return { headers, records };
}

export function csvEscape(v) {
  if (v === null || v === undefined) return '';
  const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
  return /[",\r\n]/.test(s) || /^[=+\-@\t]/.test(s) ? `"${(/^[=+\-@\t]/.test(s) ? "'" : '') + s.replace(/"/g, '""')}"` : s;
}

/** Serialise objects to CSV. Leading = + - @ are prefixed with ' to prevent spreadsheet formula injection. */
export function toCSV(rows, headers = null) {
  if (!rows.length && !headers) return '';
  const h = headers || [...rows.reduce((set, r) => { Object.keys(r).forEach(k => set.add(k)); return set; }, new Set())];
  return [h.join(','), ...rows.map(r => h.map(k => csvEscape(r[k])).join(','))].join('\r\n') + '\r\n';
}
