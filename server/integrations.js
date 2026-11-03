// Per-organization integrations: Stripe, RunSignup, HubSpot. Secrets are
import { log } from './log.js';
// encrypted at rest and never returned to the browser.

import { Router } from 'express';
import { can } from '../src/domain/access.js';
import { runSignup } from '../src/integrations/registry.js';
import { requireOrg } from './auth.js';
import { events } from './repo.js';
import { audit } from './audit.js';
import { encrypt, decrypt, newId, str } from './security.js';
import { stripeRequest, verifyStripeSignature } from './stripe.js';

const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);

export const PROVIDERS = {
  stripe: { label: 'Stripe payments', fields: ['secretKey', 'webhookSecret'] },
  runsignup: { label: 'RunSignup', fields: ['apiKey', 'apiSecret'] },
  hubspot: { label: 'HubSpot', fields: ['accessToken'] },
};

export async function getIntegration(db, cfg, orgId, provider) {
  const row = await db.one('SELECT secret_enc, settings FROM integrations WHERE organization_id = :o AND provider = :p', { o: orgId, p: provider });
  if (!row) return null;
  const secrets = JSON.parse(decrypt(cfg.appSecret, row.secret_enc));
  return { ...secrets, secret: secrets.secretKey ?? secrets.apiKey ?? secrets.accessToken, settings: JSON.parse(row.settings || '{}') };
}

// ---------- RunSignup ----------
export async function fetchRunSignupParticipants({ apiKey, apiSecret, raceId, eventId }, fetchImpl = fetch) {
  const out = [];
  for (let page = 1; page <= 50; page++) {
    const u = new URL(`https://runsignup.com/Rest/race/${encodeURIComponent(raceId)}/participants`);
    u.search = new URLSearchParams({ format: 'json', api_key: apiKey, api_secret: apiSecret, event_id: eventId, page: String(page), results_per_page: '250' }).toString();
    const res = await fetchImpl(u, { headers: { Accept: 'application/json' } });
    if (!res.ok) throw Object.assign(new Error(`RunSignup returned ${res.status}`), { status: 502 });
    const body = await res.json();
    if (body?.error) throw Object.assign(new Error(body.error.error_msg || 'RunSignup error'), { status: 502 });
    const batch = (Array.isArray(body) ? body : []).flatMap((ev) => ev.participants ?? []);
    out.push(...batch);
    if (batch.length < 250) break;
  }
  return out;
}

// ---------- HubSpot ----------
const HS = 'https://api.hubapi.com';
export const HUBSPOT_CUSTOM_PROPERTIES = [
  ['wrts_event_history', 'WRTS event history'],
  ['wrts_cause_interest', 'WRTS cause interest'],
  ['wrts_4w_interest', 'WRTS 4W interest'],
  ['wrts_organization', 'WRTS organization'],
  ['wrts_referral_source', 'WRTS referral source'],
  ['wrts_membership_status', 'WRTS membership status'],
  ['wrts_engagement_level', 'WRTS engagement level'],
  ['wrts_next_best_action', 'WRTS next best action'],
];

async function hs(token, path, body, fetchImpl = fetch, method = 'POST') {
  const res = await fetchImpl(`${HS}${path}`, { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  const json = text ? JSON.parse(text) : {};
  return { ok: res.ok, status: res.status, json };
}

export async function ensureHubSpotProperties(token, fetchImpl = fetch) {
  const created = [];
  for (const [name, label] of HUBSPOT_CUSTOM_PROPERTIES) {
    const r = await hs(token, '/crm/v3/properties/contacts', { name, label, type: 'string', fieldType: 'text', groupName: 'contactinformation' }, fetchImpl);
    if (r.ok) created.push(name);
    else if (r.status !== 409) throw Object.assign(new Error(r.json?.message || `HubSpot returned ${r.status}`), { status: 502 });
  }
  return created;
}

/** Upserts consented contacts by email. Only marketing-consented registrations are sent. */
export async function upsertHubSpotContacts(token, contacts, fetchImpl = fetch) {
  let sent = 0;
  for (let i = 0; i < contacts.length; i += 100) {
    const batch = contacts.slice(i, i + 100);
    const r = await hs(token, '/crm/v3/objects/contacts/batch/upsert', { inputs: batch.map((c) => ({ idProperty: 'email', id: c.email, properties: c.properties })) }, fetchImpl);
    if (!r.ok) throw Object.assign(new Error(r.json?.message || `HubSpot returned ${r.status}`), { status: 502 });
    sent += batch.length;
  }
  return sent;
}

export function integrationsRouter(db, cfg, { fetchImpl = fetch } = {}) {
  const r = Router();
  r.use(requireOrg);
  const admin = (req, res, next) => (can(req.session.role, 'org.admin') ? next() : res.status(403).json({ error: 'Only the organization owner can manage integrations.' }));

  r.get('/integrations', wrap(async (req, res) => {
    const rows = await db.query('SELECT provider, settings, updated_at AS updatedAt FROM integrations WHERE organization_id = :o', { o: req.session.orgId });
    const byP = Object.fromEntries(rows.map((x) => [x.provider, x]));
    res.json({
      integrations: Object.entries(PROVIDERS).map(([id, p]) => ({ id, label: p.label, connected: Boolean(byP[id]), updatedAt: byP[id]?.updatedAt ?? null, settings: byP[id] ? JSON.parse(byP[id].settings || '{}') : {} })),
      webhookUrl: `${cfg.publicUrl}/api/webhooks/stripe/${req.session.orgId}`,
    });
  }));

  r.put('/integrations/:provider', admin, wrap(async (req, res) => {
    const p = PROVIDERS[req.params.provider];
    if (!p) return res.status(404).json({ error: 'Unknown integration.' });
    const secrets = Object.fromEntries(p.fields.map((f) => [f, str(req.body?.[f], 500)]));
    if (p.fields.some((f) => f !== 'webhookSecret' && !secrets[f])) return res.status(400).json({ error: 'Fill in every field.' });
    // Verify credentials before saving.
    if (req.params.provider === 'stripe') await stripeRequest(secrets.secretKey, '/balance', {}, { fetchImpl, method: 'GET' });
    if (req.params.provider === 'hubspot') {
      const t = await hs(secrets.accessToken, '/crm/v3/objects/contacts?limit=1', null, fetchImpl, 'GET');
      if (!t.ok) return res.status(400).json({ error: 'HubSpot did not accept this token. It needs the crm.objects.contacts read/write and crm.schemas.contacts write scopes.' });
    }
    const settings = { last4: Object.values(secrets).filter(Boolean).map((s) => s.slice(-4)) };
    await db.query(
      'INSERT INTO integrations (organization_id, provider, secret_enc, settings, updated_by) VALUES (:o, :p, :s, :st, :u) ON DUPLICATE KEY UPDATE secret_enc = VALUES(secret_enc), settings = VALUES(settings), updated_by = VALUES(updated_by)',
      { o: req.session.orgId, p: req.params.provider, s: encrypt(cfg.appSecret, JSON.stringify(secrets)), st: JSON.stringify(settings), u: req.user.id },
    );
    await audit(db, { orgId: req.session.orgId, userId: req.user.id, action: 'integration.connect', entity: 'integration', entityId: req.params.provider, ip: req.ip });
    res.json({ ok: true });
  }));

  r.delete('/integrations/:provider', admin, wrap(async (req, res) => {
    await db.query('DELETE FROM integrations WHERE organization_id = :o AND provider = :p', { o: req.session.orgId, p: req.params.provider });
    await audit(db, { orgId: req.session.orgId, userId: req.user.id, action: 'integration.disconnect', entity: 'integration', entityId: req.params.provider, ip: req.ip });
    res.json({ ok: true });
  }));

  // Import registrations from a RunSignup race/event into an EventOS event.
  r.post('/events/:id/import/runsignup', wrap(async (req, res) => {
    if (!can(req.session.role, 'event.edit')) return res.status(403).json({ error: 'Your role cannot import registrations.' });
    const e = await events.get(db, req.session.orgId, req.params.id);
    if (!e) return res.status(404).json({ error: 'Event not found.' });
    const integ = await getIntegration(db, cfg, req.session.orgId, 'runsignup');
    if (!integ) return res.status(400).json({ error: 'Connect RunSignup in Integrations first.' });
    const raceId = str(req.body?.raceId, 20);
    const eventId = str(req.body?.eventId, 20);
    if (!/^\d+$/.test(raceId) || !/^\d+$/.test(eventId)) return res.status(400).json({ error: 'Enter the RunSignup race ID and event ID (numbers).' });
    const raw = await fetchRunSignupParticipants({ apiKey: integ.apiKey, apiSecret: integ.apiSecret, raceId, eventId }, fetchImpl);
    let imported = 0;
    for (const p of raw) {
      const c = runSignup.normalize(p);
      const r2 = await db.query(
        `INSERT INTO registrations (id, organization_id, event_id, first_name, last_name, email, zip, team, referral, consent_analytics, consent_marketing, consent_partners, amount_cents, payment_status, source, external_id, created_at)
         VALUES (:id, :o, :e, :f, :l, :m, :zip, :team, :ref, 1, :cm, :cp, :amt, 'paid', 'runsignup', :x, :at)
         ON DUPLICATE KEY UPDATE team = VALUES(team), zip = VALUES(zip), consent_marketing = VALUES(consent_marketing)`,
        {
          id: newId('reg'), o: req.session.orgId, e: e.id, f: c.firstName || 'Participant', l: p.user?.last_name || c.lastInitial || '-', m: (c.email || `${c.externalId}@runsignup.invalid`).toLowerCase(),
          zip: c.zip, team: c.team, ref: c.referralCode, cm: c.consent.marketing ? 1 : 0, cp: c.consent.sharePartners ? 1 : 0, amt: Math.round((c.amountPaid || 0) * 100), x: c.externalId,
          at: new Date(c.registeredAt || Date.now()),
        },
      );
      if (r2.affectedRows === 1) imported++;
    }
    await events.save(db, req.session.orgId, { ...e, runsignup: { raceId, eventId, lastImportAt: new Date().toISOString() } }, e.version);
    await audit(db, { orgId: req.session.orgId, userId: req.user.id, action: 'import.runsignup', entity: 'event', entityId: e.id, detail: { fetched: raw.length, imported }, ip: req.ip });
    res.json({ fetched: raw.length, imported });
  }));

  // Send consented participants of an event to HubSpot.
  r.post('/events/:id/sync/hubspot', wrap(async (req, res) => {
    if (!can(req.session.role, 'event.edit')) return res.status(403).json({ error: 'Your role cannot sync to HubSpot.' });
    const e = await events.get(db, req.session.orgId, req.params.id);
    if (!e) return res.status(404).json({ error: 'Event not found.' });
    const integ = await getIntegration(db, cfg, req.session.orgId, 'hubspot');
    if (!integ) return res.status(400).json({ error: 'Connect HubSpot in Integrations first.' });
    if (!integ.settings.propertiesReady) {
      await ensureHubSpotProperties(integ.accessToken, fetchImpl);
      await db.query("UPDATE integrations SET settings = JSON_SET(COALESCE(settings,'{}'), '$.propertiesReady', true) WHERE organization_id = :o AND provider = 'hubspot'", { o: req.session.orgId });
    }
    const rows = await db.query("SELECT * FROM registrations WHERE event_id = :e AND organization_id = :o AND consent_marketing = 1 AND payment_status IN ('free','paid')", { e: e.id, o: req.session.orgId });
    const contacts = rows.map((x) => ({
      email: x.email,
      properties: {
        firstname: x.first_name,
        lastname: x.last_name,
        zip: x.zip || '',
        wrts_event_history: e.name,
        wrts_cause_interest: x.donation_cents > 0 && e.cause ? e.cause : '',
        wrts_4w_interest: (x.four_w_interest || '').split(',').join(';'),
        wrts_organization: e.organization || '',
        wrts_referral_source: x.referral || 'Direct',
        wrts_membership_status: 'Registered',
        wrts_engagement_level: x.checked_in_at ? 'Active' : 'New',
        wrts_next_best_action: x.donation_cents > 0 ? 'Cause supporter nurture' : 'Welcome series',
      },
    }));
    const sent = await upsertHubSpotContacts(integ.accessToken, contacts, fetchImpl);
    if (rows.length) await db.query(`UPDATE registrations SET hubspot_synced_at = UTC_TIMESTAMP() WHERE id IN (${rows.map((_, i) => ':r' + i).join(',')})`, Object.fromEntries(rows.map((x, i) => ['r' + i, x.id])));
    const withheld = (await db.one("SELECT COUNT(*) AS n FROM registrations WHERE event_id = :e AND consent_marketing = 0 AND payment_status IN ('free','paid')", { e: e.id })).n;
    await audit(db, { orgId: req.session.orgId, userId: req.user.id, action: 'sync.hubspot', entity: 'event', entityId: e.id, detail: { sent, withheld: Number(withheld) }, ip: req.ip });
    res.json({ sent, withheld: Number(withheld) });
  }));

  return r;
}

/** Stripe webhook per organization: verifies the signature with that org's secret. */
export function webhookRouter(db, cfg) {
  const r = Router();
  r.post('/stripe/:orgId', async (req, res) => {
    try {
      const integ = await getIntegration(db, cfg, str(req.params.orgId, 40), 'stripe');
      const raw = req.rawBody ?? '';
      if (!integ?.webhookSecret || !verifyStripeSignature(raw, req.headers['stripe-signature'], integ.webhookSecret)) return res.status(400).send('invalid signature');
      const evt = JSON.parse(raw);
      const first = await db.query('INSERT IGNORE INTO webhook_events (id, provider) VALUES (:id, :p)', { id: String(evt.id).slice(0, 120), p: 'stripe' });
      if (!first.affectedRows) return res.json({ received: true, duplicate: true });
      const s = evt.data?.object ?? {};
      const regId = s.client_reference_id || s.metadata?.registration_id;
      const scope = { id: regId, o: req.params.orgId };
      if (evt.type === 'checkout.session.completed' && s.payment_status === 'paid') await db.query("UPDATE registrations SET payment_status = 'paid' WHERE id = :id AND organization_id = :o", scope);
      else if (evt.type === 'checkout.session.async_payment_succeeded') await db.query("UPDATE registrations SET payment_status = 'paid' WHERE id = :id AND organization_id = :o", scope);
      else if (['checkout.session.expired', 'checkout.session.async_payment_failed'].includes(evt.type)) await db.query("UPDATE registrations SET payment_status = 'failed' WHERE id = :id AND organization_id = :o AND payment_status = 'pending'", scope);
      res.json({ received: true });
    } catch (e) {
      log.error('stripe webhook error', { error: e.message });
      res.status(500).send('error');
    }
  });
  return r;
}

