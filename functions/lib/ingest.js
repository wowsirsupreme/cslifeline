// Ingestion handler for the learning-data integration API.
// Pure apart from the injected `store` (Firestore in production, in-memory in tests).
//
// POST /ingest
//   Headers: X-CSL-Platform: WOW_SIR | DBWOW | <registered code>
//            X-CSL-Timestamp: unix seconds (rejected if more than 5 minutes old — replay protection)
//            X-CSL-Signature: hex HMAC-SHA256(secret, `${timestamp}.${rawBody}`)
//   Body:    { "adapter": "events" | "wowsir-session" | "dbwow-progress", "payload": ... }
//
// Every request is stored raw (raw_source_records) before validation, so nothing is lost.
import crypto from 'node:crypto';

export async function handleIngest({ headers, rawBody, now = Date.now() }, { store, getSecret, shared }) {
  const h = Object.fromEntries(Object.entries(headers || {}).map(([k, v]) => [k.toLowerCase(), Array.isArray(v) ? v[0] : v]));
  const platform = String(h['x-csl-platform'] || '');
  const ts = Number(h['x-csl-timestamp']);
  const sig = String(h['x-csl-signature'] || '');
  if (!/^[A-Z][A-Z0-9_]{1,30}$/.test(platform)) return { status: 400, body: { error: 'X-CSL-Platform header missing or invalid' } };
  const integ = await store.get('platform_integrations', platform);
  if (!integ || integ.status === 'disabled') return { status: 403, body: { error: `Platform ${platform} is not registered or is disabled` } };
  if (integ.authorisation?.status !== 'approved') return { status: 403, body: { error: `Data sharing for ${platform} has not been authorised by an administrator` } };
  const secret = await getSecret(platform);
  if (!secret) return { status: 500, body: { error: 'No secret configured for this platform' } };
  if (!Number.isFinite(ts) || Math.abs(now / 1000 - ts) > 300) return { status: 401, body: { error: 'X-CSL-Timestamp missing or outside the 5-minute window' } };
  const expected = crypto.createHmac('sha256', secret).update(`${ts}.${rawBody}`).digest('hex');
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return { status: 401, body: { error: 'Invalid signature' } };

  let body;
  try { body = JSON.parse(rawBody); } catch { return { status: 400, body: { error: 'Body is not valid JSON' } }; }
  const batchId = 'batch_' + crypto.randomBytes(6).toString('hex');
  await store.set('raw_source_records', batchId, { source_platform: platform, adapter: body.adapter || 'events', received_at: new Date(now).toISOString(), payload: rawBody.slice(0, 900000), via: 'api' });

  const { processBatch, fromWowSirSession, fromDbwowProgress } = shared.events;
  let candidates = [], adapterRejected = [];
  try {
    if (body.adapter === 'wowsir-session') { const r = fromWowSirSession(body.payload); candidates = r.events; adapterRejected = r.rejected; }
    else if (body.adapter === 'dbwow-progress') { const r = fromDbwowProgress(body.payload, shared.dbwowKey); candidates = r.events; adapterRejected = r.rejected; }
    else candidates = Array.isArray(body.payload) ? body.payload : Array.isArray(body.events) ? body.events : [];
  } catch (e) { return { status: 422, body: { error: 'Adapter failed: ' + e.message, batch_id: batchId } }; }
  for (const c of candidates) if (c.source_platform && c.source_platform !== platform) adapterRejected.push({ event_id: c.event_id, reason: `source_platform ${c.source_platform} does not match the authenticated platform` });
  const own = candidates.filter(c => !c.source_platform || c.source_platform === platform).map(c => ({ ...c, source_platform: platform }));
  const existing = new Set();
  for (const c of own) if (c.event_id && await store.get('learning_events', c.event_id)) existing.add(c.event_id);
  const { accepted, rejected, duplicates } = processBatch(own, { existingIds: existing });
  for (const e of accepted) await store.set('learning_events', e.event_id, { ...e, provenance: { ...(e.provenance || {}), batch_id: batchId, via: 'api' }, received_at: new Date(now).toISOString() });
  const allRejected = [...adapterRejected, ...rejected];
  await store.merge('platform_integrations', platform, {
    connection_status: 'connected', last_success_at: new Date(now).toISOString(),
    records_received: (integ.records_received || 0) + candidates.length + adapterRejected.length,
    records_accepted: (integ.records_accepted || 0) + accepted.length,
    records_rejected: (integ.records_rejected || 0) + allRejected.length,
    duplicates: (integ.duplicates || 0) + duplicates,
    last_errors: allRejected.slice(0, 20), schema_version: '1.0',
  });
  return { status: 200, body: { batch_id: batchId, accepted: accepted.length, rejected: allRejected.length, duplicates, errors: allRejected.slice(0, 50) } };
}

export function sign(secret, ts, rawBody) { return crypto.createHmac('sha256', secret).update(`${ts}.${rawBody}`).digest('hex'); }
