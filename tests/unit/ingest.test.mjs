import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { handleIngest, sign } from '../../functions/lib/ingest.js';
import * as events from '../../public/js/integration/events.js';

const dbwowKey = JSON.parse(fs.readFileSync(new URL('../../public/data/integrations/dbwow_quiz_key.json', import.meta.url)));
const fx = f => JSON.parse(fs.readFileSync(new URL('../fixtures/' + f, import.meta.url)));
function memStore(init = {}) {
  const d = structuredClone(init);
  return { d, get: async (c, i) => d[c]?.[i] ?? null, set: async (c, i, v) => { (d[c] ||= {})[i] = v; }, merge: async (c, i, v) => { (d[c] ||= {})[i] = { ...(d[c]?.[i] || {}), ...v }; } };
}
const approved = { platform_integrations: { WOW_SIR: { status: 'active', authorisation: { status: 'approved' } }, DBWOW: { status: 'active', authorisation: { status: 'approved' } }, OTHER: { status: 'active', authorisation: { status: 'pending' } } } };
const now = Date.UTC(2026, 10, 5, 12);
const call = (store, platform, body, { secret = 's3cret', ts = Math.floor(now / 1000), tamper = false } = {}) => {
  const raw = JSON.stringify(body);
  const headers = { 'X-CSL-Platform': platform, 'X-CSL-Timestamp': String(ts), 'X-CSL-Signature': sign(secret, ts, tamper ? raw + ' ' : raw) };
  return handleIngest({ headers, rawBody: raw, now }, { store, getSecret: async () => 's3cret', shared: { events, dbwowKey } });
};

test('ingest: signed WOW Sir session export is adapted, stored raw and as events; replay is a duplicate', async () => {
  const s = memStore(approved);
  const r = await call(s, 'WOW_SIR', { adapter: 'wowsir-session', payload: fx('wowsir_session_export.json') });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.accepted, 4); assert.equal(r.body.rejected, 1);
  assert.equal(Object.keys(s.d.raw_source_records).length, 1);
  assert.equal(s.d.platform_integrations.WOW_SIR.connection_status, 'connected');
  const again = await call(s, 'WOW_SIR', { adapter: 'wowsir-session', payload: fx('wowsir_session_export.json') });
  assert.equal(again.body.accepted, 0); assert.equal(again.body.duplicates, 4);
  assert.equal(Object.keys(s.d.learning_events).length, 4);
});
test('ingest: bad signature, stale timestamp, unauthorised platform and spoofed source are refused', async () => {
  const s = memStore(approved);
  assert.equal((await call(s, 'WOW_SIR', { payload: [] }, { tamper: true })).status, 401);
  assert.equal((await call(s, 'WOW_SIR', { payload: [] }, { ts: Math.floor(now / 1000) - 3600 })).status, 401);
  assert.equal((await call(s, 'OTHER', { payload: [] })).status, 403, 'authorisation pending');
  assert.equal((await call(s, 'NOPE', { payload: [] })).status, 403, 'not registered');
  const spoof = await call(s, 'DBWOW', { adapter: 'events', payload: [{ ...fx('brief_event.json') }] });
  assert.equal(spoof.body.accepted, 0); assert.match(spoof.body.errors[0].reason, /does not match/);
});
test('ingest: canonical events (brief format) from the authenticated platform are accepted', async () => {
  const s = memStore(approved);
  const r = await call(s, 'WOW_SIR', { adapter: 'events', payload: [fx('brief_event.json')] });
  assert.equal(r.body.accepted, 1);
  const e = Object.values(s.d.learning_events)[0];
  assert.equal(e.duration_ms, 35000); assert.equal(e.correct, false); assert.equal(e.provenance.via, 'api');
});
