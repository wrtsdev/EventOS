// API tests against a real MySQL/MariaDB database.
// Local: uses eventos_test (user eventos / devpass) unless TEST_DATABASE_URL is set.
// Skipped when no database is reachable, unless REQUIRE_DB=1 (CI sets it).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createPool, makeDb, migrate } from '../server/db.js';
import { createApp } from '../server/app.js';
import { loadConfig } from '../server/config.js';
import { signForTest } from '../server/stripe.js';

const dbCfg = process.env.TEST_DATABASE_URL
  ? { uri: process.env.TEST_DATABASE_URL }
  : { host: '127.0.0.1', port: 3306, database: 'eventos_test', user: 'eventos', password: 'devpass' };

let pool;
let server;
let base;
let mailer;
let available = true;
const stripeCalls = [];

// Fake Stripe/HubSpot: records requests, returns plausible bodies.
async function fakeFetch(url, init = {}) {
  const u = String(url);
  stripeCalls.push({ url: u, body: init.body });
  const json = (body, status = 200) => ({ ok: status < 400, status, json: async () => body, text: async () => JSON.stringify(body) });
  if (u.includes('api.stripe.com/v1/balance')) return json({ object: 'balance' });
  if (u.includes('api.stripe.com/v1/checkout/sessions')) return json({ id: 'cs_test_123', url: 'https://checkout.stripe.com/c/pay/cs_test_123' });
  return json({ error: 'unexpected' }, 404);
}

before(async () => {
  try {
    pool = createPool(dbCfg);
    await pool.query('SELECT 1');
  } catch (e) {
    if (process.env.REQUIRE_DB === '1') throw e;
    available = false;
    return;
  }
  // Fresh schema every run.
  const [tables] = await pool.query("SELECT table_name AS t FROM information_schema.tables WHERE table_schema = DATABASE()");
  await pool.query('SET FOREIGN_KEY_CHECKS = 0');
  for (const { t } of tables) await pool.query(`DROP TABLE IF EXISTS \`${t}\``);
  await pool.query('SET FOREIGN_KEY_CHECKS = 1');
  await migrate(pool);
  const cfg = loadConfig({ publicUrl: 'http://localhost:3999', db: dbCfg });
  mailer = { configured: false, outbox: [], async send(m) { this.outbox.push(m); return { queued: false }; } };
  const app = createApp({ db: makeDb(pool), cfg, mailer, fetchImpl: fakeFetch });
  await new Promise((r) => { server = app.listen(0, '127.0.0.1', r); });
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  server?.close();
  await pool?.end().catch(() => {});
});

/** A browser-like client with its own cookie jar. */
function client() {
  let cookie = '';
  const call = async (method, path, body, headers = {}) => {
    const res = await fetch(base + path, {
      method,
      headers: { 'X-Requested-With': 'eventos', ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}), ...headers },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    const type = res.headers.get('content-type') || '';
    return { status: res.status, body: type.includes('json') ? await res.json() : await res.text() };
  };
  return { get: (p) => call('GET', p), post: (p, b = {}, h) => call('POST', p, b, h), patch: (p, b) => call('PATCH', p, b), put: (p, b) => call('PUT', p, b), del: (p) => call('DELETE', p) };
}

let n = 0;
async function newOrg(name = 'Org') {
  const c = client();
  const email = `owner${++n}-${Date.now()}@example.org`;
  const r = await c.post('/api/auth/signup', { email, password: 'correct horse battery', name: 'Owner', organization: name });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  return { c, email };
}
const EVENT = { name: 'Neighborhood 5K', typeId: '5k', format: 'physical', fourWs: ['wellness'], primaryW: 'wellness', date: '2027-05-01', location: 'Park', expected: 100, cap: 2, price: 0, features: ['registration'], sponsors: [] };

const t = (name, fn) => test(name, async (ctx) => (available ? fn(ctx) : ctx.skip('no database')));

t('health reports the database', async () => {
  const r = await client().get('/api/health');
  assert.equal(r.status, 200);
  assert.equal(r.body.db, 'up');
});

t('signup, me, logout, login, wrong password', async () => {
  const { c, email } = await newOrg('Auth Org');
  let me = await c.get('/api/auth/me');
  assert.equal(me.body.user.email, email);
  assert.equal(me.body.session.role, 'owner');
  await c.post('/api/auth/logout');
  me = await c.get('/api/auth/me');
  assert.equal(me.body.user, null);
  assert.equal((await c.post('/api/auth/login', { email, password: 'wrong password here' })).status, 401);
  assert.equal((await c.post('/api/auth/login', { email, password: 'correct horse battery' })).status, 200);
  assert.equal((await c.get('/api/events')).status, 200);
});

t('short passwords and duplicate emails are refused', async () => {
  const c = client();
  assert.equal((await c.post('/api/auth/signup', { email: 'short@example.org', password: 'short', organization: 'X' })).status, 400);
  const { email } = await newOrg();
  assert.equal((await client().post('/api/auth/signup', { email, password: 'correct horse battery', organization: 'Y' })).status, 409);
});

t('CSRF: missing header and foreign origin are refused', async () => {
  const { c } = await newOrg();
  const res = await fetch(base + '/api/events', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(res.status, 403);
  assert.equal((await c.post('/api/events', EVENT, { Origin: 'https://evil.example' })).status, 403);
});

t('tenant isolation: another org cannot read or change an event', async () => {
  const a = await newOrg('A');
  const b = await newOrg('B');
  const { body } = await a.c.post('/api/events', EVENT);
  const id = body.event.id;
  assert.equal((await b.c.get(`/api/events/${id}`)).status, 404);
  assert.equal((await b.c.patch(`/api/events/${id}`, { version: body.event.version, patch: { name: 'Hijacked' } })).status, 404);
  assert.equal((await b.c.get(`/api/events/${id}/registrations`)).status, 404);
  const list = await b.c.get('/api/events');
  assert.ok(!list.body.events.some((e) => e.id === id));
});

t('optimistic concurrency: stale version gets 409 with the current event', async () => {
  const { c } = await newOrg();
  const { body } = await c.post('/api/events', EVENT);
  const e = body.event;
  const ok = await c.patch(`/api/events/${e.id}`, { version: e.version, patch: { location: 'New park' } });
  assert.equal(ok.status, 200);
  const stale = await c.patch(`/api/events/${e.id}`, { version: e.version, patch: { location: 'Other' } });
  assert.equal(stale.status, 409);
  assert.equal(stale.body.event.location, 'New park');
  assert.ok([400, 403].includes((await c.patch(`/api/events/${e.id}`, { version: ok.body.event.version, patch: { organizationId: 'org_x' } })).status));
});

t('invites, roles and permissions are enforced by the server', async () => {
  const { c } = await newOrg('Roles Org');
  const { body: ev } = await c.post('/api/events', EVENT);
  const inv = await c.post('/api/members/invite', { email: 'vol@example.org', role: 'volunteer' });
  assert.equal(inv.status, 201);
  const token = inv.body.link.split('#invite=')[1];
  const v = client();
  assert.equal((await v.get(`/api/auth/invite/${token}`)).body.role, 'volunteer');
  assert.equal((await v.post('/api/auth/invite/accept', { token, password: 'volunteer passphrase', name: 'Val' })).status, 200);
  // Volunteer: can see events, cannot see PII, cannot invite, cannot edit the budget.
  assert.equal((await v.get('/api/events')).status, 200);
  assert.equal((await v.get(`/api/events/${ev.event.id}/registrations`)).status, 403);
  assert.equal((await v.post('/api/members/invite', { email: 'x@example.org', role: 'owner' })).status, 403);
  const cur = (await v.get(`/api/events/${ev.event.id}`)).body.event;
  assert.equal((await v.patch(`/api/events/${ev.event.id}`, { version: cur.version, patch: { budget: { lines: [] } } })).status, 403);
  // Token is single use.
  assert.equal((await client().post('/api/auth/invite/accept', { token, password: 'another passphrase' })).status, 400);
  // Last owner cannot be demoted.
  const members = (await c.get('/api/members')).body.members;
  const owner = members.find((m) => m.role === 'owner');
  assert.equal((await c.patch(`/api/members/${owner.id}`, { role: 'coordinator' })).status, 400);
});

t('password reset flow', async () => {
  const { email } = await newOrg();
  const c = client();
  mailer.outbox.length = 0;
  assert.equal((await c.post('/api/auth/password/forgot', { email })).status, 200);
  const mail = mailer.outbox.find((m) => m.to === email);
  assert.ok(mail, 'reset email queued');
  const token = mail.text.match(/#reset=([A-Za-z0-9_-]+)/)[1];
  assert.equal((await c.post('/api/auth/password/reset', { token, password: 'brand new passphrase' })).status, 200);
  assert.equal((await c.post('/api/auth/login', { email, password: 'brand new passphrase' })).status, 200);
  assert.equal((await c.post('/api/auth/password/reset', { token, password: 'yet another one!!' })).status, 400);
});

t('public page: hidden until published, registration needs live phase, waiver, cap', async () => {
  const { c } = await newOrg('Public Org');
  const { body } = await c.post('/api/events', EVENT);
  let e = body.event;
  const pub = client();
  assert.equal((await pub.get(`/api/public/events/${e.slug}`)).status, 404);
  e = (await c.patch(`/api/events/${e.id}`, { version: e.version, patch: { isPublic: true } })).body.event;
  const view = await pub.get(`/api/public/events/${e.slug}`);
  assert.equal(view.status, 200);
  assert.equal(view.body.event.registrationOpen, false);
  assert.equal(view.body.event.organization, 'Public Org');
  assert.ok(!('budget' in view.body.event) && !('checklist' in view.body.event), 'no internal fields');
  const person = { firstName: 'Ana', lastName: 'Lopez', email: 'ana@example.org', zip: '48207', waiver: true };
  assert.equal((await pub.post(`/api/public/events/${e.slug}/register`, person)).status, 409);
  e = (await c.patch(`/api/events/${e.id}`, { version: e.version, patch: { phase: 'live' } })).body.event;
  assert.equal((await pub.post(`/api/public/events/${e.slug}/register`, { ...person, waiver: false })).status, 400);
  assert.equal((await pub.post(`/api/public/events/${e.slug}/register`, { ...person, isAdult: false })).status, 400);
  assert.equal((await pub.post(`/api/public/events/${e.slug}/register`, person)).status, 201);
  assert.equal((await pub.post(`/api/public/events/${e.slug}/register`, person)).status, 409, 'duplicate');
  assert.equal((await pub.post(`/api/public/events/${e.slug}/register`, { ...person, firstName: 'Ben', email: 'ben@example.org' })).status, 201);
  assert.equal((await pub.post(`/api/public/events/${e.slug}/register`, { ...person, firstName: 'Cy', email: 'cy@example.org' })).status, 409, 'cap reached');
  const regs = await c.get(`/api/events/${e.id}/registrations`);
  assert.equal(regs.body.registrations.length, 2);
  const metrics = await c.get(`/api/events/${e.id}/metrics`);
  assert.ok(metrics.body.rows.every((r) => !('email' in r) && !('firstName' in r)), 'metrics carry no PII');
  const csv = await c.get(`/api/events/${e.id}/registrations.csv`);
  assert.match(csv.body, /Ana/);
  const reg = regs.body.registrations[0];
  assert.equal((await c.patch(`/api/registrations/${reg.id}`, { checkedIn: true })).status, 200);
});

t('paid registration: Stripe Checkout, signed webhook marks paid, bad signature refused, replay ignored', async () => {
  const { c } = await newOrg('Paid Org');
  assert.equal((await c.put('/api/integrations/stripe', { secretKey: 'sk_test_abc', webhookSecret: 'whsec_test' })).status, 200);
  const integ = await c.get('/api/integrations');
  assert.equal(integ.body.integrations.find((i) => i.id === 'stripe').connected, true);
  assert.ok(!JSON.stringify(integ.body).includes('sk_test_abc'), 'secret never returned');
  const orgId = (await c.get('/api/org')).body.org.id;
  let e = (await c.post('/api/events', { ...EVENT, price: 25, cap: 10 })).body.event;
  e = (await c.patch(`/api/events/${e.id}`, { version: e.version, patch: { isPublic: true, phase: 'live' } })).body.event;
  const r = await client().post(`/api/public/events/${e.slug}/register`, { firstName: 'Pay', lastName: 'Er', email: 'pay@example.org', waiver: true, donation: 5 });
  assert.equal(r.status, 201);
  assert.equal(r.body.status, 'payment_required');
  assert.match(r.body.checkoutUrl, /checkout\.stripe\.com/);
  const sent = stripeCalls.find((x) => x.url.includes('checkout/sessions'));
  assert.match(decodeURIComponent(sent.body), /unit_amount\]=2500/);
  let reg = (await c.get(`/api/events/${e.id}/registrations`)).body.registrations[0];
  assert.equal(reg.paymentStatus, 'pending');

  const evt = JSON.stringify({ id: 'evt_1', type: 'checkout.session.completed', data: { object: { client_reference_id: reg.id, payment_status: 'paid' } } });
  const hook = (body, sig) => fetch(`${base}/api/webhooks/stripe/${orgId}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Stripe-Signature': sig }, body });
  assert.equal((await hook(evt, signForTest(evt, 'whsec_wrong'))).status, 400);
  assert.equal((await hook(evt, signForTest(evt, 'whsec_test'))).status, 200);
  reg = (await c.get(`/api/events/${e.id}/registrations`)).body.registrations[0];
  assert.equal(reg.paymentStatus, 'paid');
  const replay = await (await hook(evt, signForTest(evt, 'whsec_test'))).json();
  assert.equal(replay.duplicate, true);
});

t('paid registration without Stripe connected fails cleanly', async () => {
  const { c } = await newOrg();
  let e = (await c.post('/api/events', { ...EVENT, price: 20 })).body.event;
  e = (await c.patch(`/api/events/${e.id}`, { version: e.version, patch: { isPublic: true, phase: 'live' } })).body.event;
  const r = await client().post(`/api/public/events/${e.slug}/register`, { firstName: 'No', lastName: 'Stripe', email: 'ns@example.org', waiver: true });
  assert.equal(r.status, 503);
});
