// API tests against a real MySQL/MariaDB database.
// Local: uses eventos_test (user eventos / devpass) unless TEST_DATABASE_URL is set.
// Skipped when no database is reachable, unless REQUIRE_DB=1 (CI sets it).
//
// Synthetic test data lives only in this isolated test database.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createPool, makeDb, migrate } from '../server/db.js';
import { createApp } from '../server/app.js';
import { loadConfig } from '../server/config.js';
import { signForTest } from '../server/stripe.js';
import { eventSeo } from '../server/seo.js';
import { createOutbox, totpCode, totpCounter, bootstrapMaster } from '../server/governance.js';

const dbCfg = process.env.TEST_DATABASE_URL
  ? { uri: process.env.TEST_DATABASE_URL }
  : { host: '127.0.0.1', port: 3306, database: 'eventos_test', user: 'eventos', password: 'devpass' };

const MASTER_EMAIL = 'master@wrts.test';
const PASSWORD = 'correct horse battery';

let pool;
let db;
let server;
let base;
let mailer;
let outbox;
let cfg;
let available = true;
let master; // { c, secret }
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

/** The newest link of a kind in email queued to an address. */
async function linkFromEmail(to, re) {
  const [rows] = await pool.query('SELECT body FROM email_outbox WHERE to_email = ? ORDER BY created_at DESC', [to]);
  for (const r of rows) {
    const m = r.body.match(re);
    if (m) return m[1];
  }
  return null;
}
const requestIdFor = async (email) => (await pool.query('SELECT id FROM account_requests WHERE email = ? ORDER BY created_at DESC LIMIT 1', [email]))[0][0]?.id;
const userRow = async (email) => (await pool.query('SELECT * FROM users WHERE email = ?', [email]))[0][0];

function requestBody(email, extra = {}) {
  return { firstName: 'Pat', lastName: 'Owner', email, password: PASSWORD, organizationName: 'Org', organizationType: 'Nonprofit or community group', requestedRole: 'org_admin', intendedUse: 'Community 5Ks and wellness walks', primaryPillar: 'wellness', acceptTerms: true, ...extra };
}

async function requestAndVerify(email, extra = {}) {
  const c = client();
  const r = await c.post('/api/auth/request', requestBody(email, extra));
  assert.equal(r.status, 202, JSON.stringify(r.body));
  const token = await linkFromEmail(email, /#verify=([A-Za-z0-9_-]+)/);
  assert.ok(token, 'verification email queued');
  const v = await c.post('/api/auth/verify', { token });
  assert.equal(v.status, 200, JSON.stringify(v.body));
  return { c, verify: v.body };
}

let n = 0;
/** A new, approved organization owner, signed in. */
async function newOrg(name = 'Org') {
  const email = `owner${++n}-${Date.now()}@example.org`;
  const { c } = await requestAndVerify(email, { organizationName: name });
  const a = await master.c.post(`/api/platform/requests/${await requestIdFor(email)}/approve`, { organization: { mode: 'new', name }, role: 'owner' });
  assert.equal(a.status, 200, JSON.stringify(a.body));
  const l = await c.post('/api/auth/login', { email, password: PASSWORD });
  assert.equal(l.status, 200, JSON.stringify(l.body));
  return { c, email };
}

/** Next authenticator code. Each sign-in uses a later time step (codes can't be replayed). */
let stepOffset = 0;
const nextCode = (secret) => totpCode(secret, totpCounter() + ++stepOffset);

const legacy = {}; // accounts that existed before identity governance

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

  // Recreate production as it was: the original schema with accounts already in it.
  const quiet = () => {};
  await migrate(pool, quiet, { only: ['001_init.sql'] });
  const bcrypt = (await import('bcryptjs')).default;
  const hash = await bcrypt.hash(PASSWORD, 4);
  legacy.email = 'legacy-owner@wrts.test';
  await pool.query("INSERT INTO users (id, email, display_name, password_hash, is_platform_admin) VALUES ('usr_legacy1', ?, 'Legacy Owner', ?, 1)", [legacy.email, hash]);
  await pool.query("INSERT INTO organizations (id, name, tier, settings) VALUES ('org_legacy1', 'Legacy Org', 'pro', '{}')");
  await pool.query("INSERT INTO memberships (organization_id, user_id, role) VALUES ('org_legacy1', 'usr_legacy1', 'owner')");
  await pool.query("INSERT INTO sessions (token_hash, user_id, organization_id, expires_at) VALUES (REPEAT('a', 64), 'usr_legacy1', 'org_legacy1', DATE_ADD(UTC_TIMESTAMP(), INTERVAL 1 DAY))");
  await migrate(pool, quiet);

  db = makeDb(pool);
  cfg = loadConfig({ publicUrl: 'http://localhost:3999', db: dbCfg, masterEmail: MASTER_EMAIL, rateLimitScale: 100 });
  mailer = { configured: true, fail: false, sent: [], async send(m) { if (this.fail) throw new Error('SMTP connection refused'); this.sent.push(m); return { queued: true }; } };
  outbox = createOutbox(db, mailer);
  const app = createApp({ db, cfg, mailer, outbox, fetchImpl: fakeFetch });
  await new Promise((r) => { server = app.listen(0, '127.0.0.1', r); });
  base = `http://127.0.0.1:${server.address().port}`;

  // No master yet and no account with the master email: startup bootstrap waits.
  assert.equal(await bootstrapMaster(db, cfg), 'awaiting account');
  // The master administrator requests access, confirms the email, and is designated master.
  const { c, verify } = await requestAndVerify(MASTER_EMAIL, { organizationName: 'We Run These Streetz', firstName: 'Robert', lastName: 'Rivers' });
  assert.equal(verify.status, 'master');
  assert.equal((await c.post('/api/auth/login', { email: MASTER_EMAIL, password: PASSWORD })).status, 200);
  // Admin center requires two-step verification first.
  assert.equal((await c.get('/api/platform/summary')).body.code, 'mfa_enrollment_required');
  const setup = await c.post('/api/auth/mfa/setup');
  assert.match(setup.body.qrSvg, /<svg/);
  const en = await c.post('/api/auth/mfa/enable', { code: totpCode(setup.body.secret, totpCounter()) });
  assert.equal(en.status, 200, JSON.stringify(en.body));
  master = { c, secret: setup.body.secret, recoveryCodes: en.body.recoveryCodes };
  assert.equal((await c.get('/api/platform/summary')).status, 200);
});

after(async () => {
  server?.close();
  await pool?.end().catch(() => {});
});

const EVENT = { name: 'Neighborhood 5K', typeId: '5k', format: 'physical', fourWs: ['wellness'], primaryW: 'wellness', date: '2027-05-01', location: 'Park', expected: 100, cap: 2, price: 0, features: ['registration'], sponsors: [] };

const t = (name, fn) => test(name, async (ctx) => (available ? fn(ctx) : ctx.skip('no database')));

t('health reports the database and that account requests are open', async () => {
  const r = await client().get('/api/health');
  assert.equal(r.status, 200);
  assert.equal(r.body.db, 'up');
  assert.equal(r.body.accountRequests, 'open');
});

// ---------------------------------------------------------------------------
// Identity governance (directive 4-5; acceptance 1-7, 16, 21, 23)
// ---------------------------------------------------------------------------

t('master administrator: designated once, kept on restart, can’t be taken over by changing the setting', async () => {
  const m = await userRow(MASTER_EMAIL);
  assert.equal(m.is_master, 1);
  assert.equal(m.status, 'active');
  assert.equal(await bootstrapMaster(db, cfg), 'exists');
  // Pointing the setting at another existing account does nothing once a master exists.
  const other = await newOrg('Takeover Org');
  assert.equal(await bootstrapMaster(db, { ...cfg, masterEmail: other.email }), 'exists');
  assert.equal((await userRow(other.email)).is_master, 0);
  assert.equal((await other.c.get('/api/platform/summary')).status, 404);
});

t('existing accounts lose access until the master administrator reviews them', async () => {
  const u = await userRow(legacy.email);
  assert.equal(u.status, 'pending_approval');
  assert.equal(u.is_platform_admin, 0, 'legacy platform-admin flags are cleared');
  const [[sess]] = await pool.query("SELECT COUNT(*) AS n FROM sessions WHERE user_id = 'usr_legacy1'");
  assert.equal(Number(sess.n), 0, 'old sessions are removed');
  const c = client();
  const l = await c.post('/api/auth/login', { email: legacy.email, password: PASSWORD });
  assert.equal(l.status, 403);
  assert.equal(l.body.status, 'pending_approval');
  const reqId = await requestIdFor(legacy.email);
  assert.match(reqId, /^req_legacy_/);
  assert.equal((await master.c.post(`/api/platform/requests/${reqId}/approve`, {})).status, 200);
  assert.equal((await c.post('/api/auth/login', { email: legacy.email, password: PASSWORD })).status, 200);
  const me = (await c.get('/api/auth/me')).body;
  assert.equal(me.session.orgId, 'org_legacy1', 'organization and role kept');
  assert.equal(me.session.role, 'owner');
  assert.equal(me.user.isPlatformAdmin, false);
});

t('open sign-up is gone', async () => {
  assert.equal((await client().post('/api/auth/signup', { email: 'x@example.org', password: PASSWORD, organization: 'X' })).status, 410);
});

t('account request: validation, verification, admin notification, no access until approved, first sign-in activates', async () => {
  const c = client();
  const email = `applicant${Date.now()}@example.org`;
  assert.equal((await c.post('/api/auth/request', requestBody(email, { password: 'short' }))).status, 400);
  assert.equal((await c.post('/api/auth/request', requestBody(email, { acceptTerms: false }))).status, 400);
  assert.equal((await c.post('/api/auth/request', requestBody(email, { primaryPillar: 'fun' }))).status, 400);
  assert.equal((await c.post('/api/auth/request', requestBody(email, { requestedRole: 'superuser' }))).status, 400);

  assert.equal((await c.post('/api/auth/request', requestBody(email))).status, 202);
  assert.equal((await userRow(email)).status, 'unverified');
  let l = await c.post('/api/auth/login', { email, password: PASSWORD });
  assert.equal(l.status, 403);
  assert.equal(l.body.status, 'unverified');

  const token = await linkFromEmail(email, /#verify=([A-Za-z0-9_-]+)/);
  assert.equal((await c.post('/api/auth/verify', { token })).body.status, 'pending_approval');
  assert.equal((await c.post('/api/auth/verify', { token })).status, 400, 'verification links work once');
  assert.equal((await userRow(email)).status, 'pending_approval');

  // The master administrator is emailed a review link that doesn't approve anything by itself.
  const reqId = await requestIdFor(email);
  const review = await linkFromEmail(MASTER_EMAIL, new RegExp(`(\\?review=${reqId})`));
  assert.ok(review, 'admin notification queued with a review link');
  await client().get(`/${review}`); // opening the link (with or without the built app shell)
  assert.equal((await userRow(email)).status, 'pending_approval');

  // Pending accounts can't sign in or call protected APIs.
  l = await c.post('/api/auth/login', { email, password: PASSWORD });
  assert.equal(l.status, 403);
  assert.equal(l.body.status, 'pending_approval');
  assert.equal((await c.get('/api/events')).status, 401);

  // A duplicate request reveals nothing and creates nothing.
  const dup = await client().post('/api/auth/request', requestBody(email, { password: 'some other long passphrase' }));
  assert.equal(dup.status, 202);
  assert.equal((await pool.query('SELECT COUNT(*) AS n FROM users WHERE email = ?', [email]))[0][0].n, 1);

  const detail = await master.c.get(`/api/platform/requests/${reqId}`);
  assert.equal(detail.body.request.intendedUse, 'Community 5Ks and wellness walks');
  assert.equal(detail.body.request.primaryPillar, 'wellness');
  assert.ok(detail.body.request.termsAcceptedAt);

  const a = await master.c.post(`/api/platform/requests/${reqId}/approve`, { organization: { mode: 'new', name: 'Applicant Org' }, role: 'owner' });
  assert.equal(a.body.status, 'approved');
  assert.equal((await master.c.post(`/api/platform/requests/${reqId}/approve`, {})).status, 409, 'decisions are final');
  assert.ok(await linkFromEmail(email, /(approved)/), 'approval email queued');
  assert.equal((await c.post('/api/auth/login', { email, password: PASSWORD })).status, 200);
  assert.equal((await userRow(email)).status, 'active');
  const me = (await c.get('/api/auth/me')).body;
  assert.equal(me.session.role, 'owner');
  assert.equal(me.user.isPlatformAdmin, false, 'approval never grants platform rights');

  const actions = (await master.c.get('/api/platform/audit')).body.entries.map((e) => e.action);
  for (const a of ['account.request', 'account.email_verified', 'account.approve', 'account.activated']) assert.ok(actions.includes(a), `audit has ${a}`);
});

t('request more information, then deny', async () => {
  const email = `info${Date.now()}@example.org`;
  const { c } = await requestAndVerify(email);
  const reqId = await requestIdFor(email);
  assert.equal((await master.c.post(`/api/platform/requests/${reqId}/request-info`, { note: '' })).status, 400);
  assert.equal((await master.c.post(`/api/platform/requests/${reqId}/request-info`, { note: 'Which city will you run events in?' })).status, 200);
  assert.equal((await userRow(email)).status, 'info_required');
  const token = await linkFromEmail(email, /#info=([A-Za-z0-9_-]+)/);
  assert.equal((await c.get(`/api/auth/request-info/${token}`)).body.question, 'Which city will you run events in?');
  assert.equal((await c.post('/api/auth/request-info', { token, response: 'Hartford, CT' })).status, 200);
  assert.equal((await userRow(email)).status, 'pending_approval');
  assert.equal((await master.c.get(`/api/platform/requests/${reqId}`)).body.request.applicantResponse, 'Hartford, CT');

  assert.equal((await master.c.post(`/api/platform/requests/${reqId}/deny`, { note: 'Outside our service area for now.' })).status, 200);
  const l = await c.post('/api/auth/login', { email, password: PASSWORD });
  assert.equal(l.status, 403);
  assert.equal(l.body.status, 'denied');
  assert.ok(await linkFromEmail(email, /(Outside our service area)/), 'denial email includes the note');
});

t('only the master administrator approves; platform admins need two-step verification; nobody can touch the master account', async () => {
  const outsider = await newOrg('Outsider Org');
  assert.equal((await outsider.c.get('/api/platform/requests')).status, 404);
  assert.equal((await outsider.c.post(`/api/platform/requests/${await requestIdFor(outsider.email)}/approve`, {})).status, 404);

  // Grant platform-admin rights to an active account.
  const admin = await newOrg('Admin Org');
  const adminId = (await userRow(admin.email)).id;
  assert.equal((await master.c.post(`/api/platform/accounts/${adminId}/platform-admin`, { enabled: true })).status, 200);
  assert.equal((await admin.c.get('/api/auth/me')).body.user, null, 'new rights need a fresh sign-in');
  assert.equal((await admin.c.post('/api/auth/login', { email: admin.email, password: PASSWORD })).status, 200);
  assert.equal((await admin.c.get('/api/platform/summary')).body.code, 'mfa_enrollment_required');
  const setup = await admin.c.post('/api/auth/mfa/setup');
  assert.equal((await admin.c.post('/api/auth/mfa/enable', { code: '000000' })).status, 400);
  assert.equal((await admin.c.post('/api/auth/mfa/enable', { code: totpCode(setup.body.secret, totpCounter()) })).status, 200);
  assert.equal((await admin.c.get('/api/platform/summary')).status, 200);
  assert.equal((await admin.c.post('/api/auth/mfa/disable', { code: totpCode(setup.body.secret, totpCounter() + 1) })).status, 403, 'admins keep two-step on');

  const email = `pending${Date.now()}@example.org`;
  await requestAndVerify(email);
  const reqId = await requestIdFor(email);
  assert.equal((await admin.c.post(`/api/platform/requests/${reqId}/approve`, { organization: { mode: 'new', name: 'X' } })).status, 403);
  assert.equal((await admin.c.post(`/api/platform/requests/${reqId}/deny`, {})).status, 403);
  assert.equal((await admin.c.get('/api/platform/data-inventory')).status, 403);

  const masterId = (await userRow(MASTER_EMAIL)).id;
  for (const s of ['suspended', 'deactivated']) assert.equal((await admin.c.post(`/api/platform/accounts/${masterId}/status`, { status: s })).status, 403);
  assert.equal((await admin.c.post(`/api/platform/accounts/${masterId}/sessions/revoke`)).status, 403);
  assert.equal((await master.c.post(`/api/platform/accounts/${masterId}/status`, { status: 'suspended' })).status, 403, 'not even by the master');
  assert.equal((await admin.c.post(`/api/platform/accounts/${adminId}/platform-admin`, { enabled: true })).status, 403);
  assert.equal((await master.c.get('/api/auth/me')).body.user.isMaster, true);
});

t('suspended accounts lose access immediately; reactivation restores it', async () => {
  const { c, email } = await newOrg('Suspend Org');
  const id = (await userRow(email)).id;
  assert.equal((await c.get('/api/events')).status, 200);
  assert.equal((await master.c.post(`/api/platform/accounts/${id}/status`, { status: 'suspended', reason: 'Billing review' })).status, 200);
  assert.equal((await c.get('/api/events')).status, 401);
  const l = await c.post('/api/auth/login', { email, password: PASSWORD });
  assert.equal(l.status, 403);
  assert.equal(l.body.status, 'suspended');
  assert.equal((await master.c.post(`/api/platform/accounts/${id}/status`, { status: 'active' })).status, 200);
  assert.equal((await c.post('/api/auth/login', { email, password: PASSWORD })).status, 200);
  assert.equal((await c.get('/api/events')).status, 200);
  const acct = (await master.c.get(`/api/platform/accounts?q=${encodeURIComponent(email)}`)).body.accounts[0];
  assert.equal(acct.status, 'active');
  assert.equal((await master.c.post(`/api/platform/accounts/${id}/status`, { status: 'active' })).status, 409);
});

t('two-step sign-in: code required, wrong code refused, codes can’t be replayed, recovery codes work once', async () => {
  const c = client();
  const first = await c.post('/api/auth/login', { email: MASTER_EMAIL, password: PASSWORD });
  assert.equal(first.body.mfaRequired, true);
  assert.equal((await c.get('/api/auth/me')).body.user, null, 'no session before the second step');
  assert.equal((await c.post('/api/auth/mfa/verify', { ticket: first.body.ticket, code: '123456' })).status, 401);
  const code = nextCode(master.secret);
  assert.equal((await c.post('/api/auth/mfa/verify', { ticket: first.body.ticket, code })).status, 200);
  assert.equal((await c.get('/api/platform/summary')).status, 200);
  // The same code can't be used again.
  const again = await client().post('/api/auth/login', { email: MASTER_EMAIL, password: PASSWORD });
  assert.equal((await client().post('/api/auth/mfa/verify', { ticket: again.body.ticket, code })).status, 401);
  // A recovery code works once.
  const rc = master.recoveryCodes[0];
  const c2 = client();
  const t2 = await c2.post('/api/auth/login', { email: MASTER_EMAIL, password: PASSWORD });
  assert.equal((await c2.post('/api/auth/mfa/verify', { ticket: t2.body.ticket, code: rc })).status, 200);
  const t3 = await client().post('/api/auth/login', { email: MASTER_EMAIL, password: PASSWORD });
  assert.equal((await client().post('/api/auth/mfa/verify', { ticket: t3.body.ticket, code: rc })).status, 401);
});

t('email queue: failures are retried and visible to administrators; duplicates send once', async () => {
  const to = `queue${Date.now()}@example.org`;
  mailer.fail = true;
  const id = await outbox.queue({ kind: 'test', to, subject: 'Queue test', body: 'Hello', dedupeKey: `dup-${to}` });
  assert.equal(await outbox.queue({ kind: 'test', to, subject: 'Queue test', body: 'Hello', dedupeKey: `dup-${to}` }), null, 'duplicate not queued');
  await outbox.kick();
  await outbox.processOutbox();
  let row = (await pool.query('SELECT * FROM email_outbox WHERE id = ?', [id]))[0][0];
  assert.equal(row.status, 'queued');
  assert.ok(row.attempts >= 1);
  assert.match(row.last_error, /SMTP connection refused/);
  const listed = (await master.c.get('/api/platform/emails')).body.emails.find((e) => e.id === id);
  assert.match(listed.lastError, /refused/);
  mailer.fail = false;
  assert.equal((await master.c.post(`/api/platform/emails/${id}/retry`)).status, 200);
  await outbox.processOutbox();
  row = (await pool.query('SELECT * FROM email_outbox WHERE id = ?', [id]))[0][0];
  assert.equal(row.status, 'sent');
  assert.equal(mailer.sent.filter((m) => m.to === to).length, 1);
});

t('data inventory: master only, read-only, retains the master, flags demo-style records', async () => {
  const { c } = await newOrg('Northside Community Alliance');
  await c.post('/api/events', { ...EVENT, name: 'Run Your Money Walk' });
  const before = (await pool.query('SELECT (SELECT COUNT(*) FROM users) u, (SELECT COUNT(*) FROM events) e'))[0][0];
  const r = await master.c.get('/api/platform/data-inventory');
  assert.equal(r.status, 200);
  assert.equal(r.body.users.find((u) => u.email === MASTER_EMAIL).classification, 'retain: master administrator');
  assert.equal(r.body.organizations.find((o) => o.name === 'Northside Community Alliance').classification, 'likely synthetic');
  assert.ok(r.body.events.some((e) => e.name === 'Run Your Money Walk' && e.classification === 'likely synthetic'));
  const after = (await pool.query('SELECT (SELECT COUNT(*) FROM users) u, (SELECT COUNT(*) FROM events) e'))[0][0];
  assert.deepEqual(after, before, 'nothing deleted');
});

// ---------------------------------------------------------------------------
// Core product (unchanged behavior)
// ---------------------------------------------------------------------------

t('sign in, me, logout, wrong password', async () => {
  const { c, email } = await newOrg('Auth Org');
  let me = await c.get('/api/auth/me');
  assert.equal(me.body.user.email, email);
  assert.equal(me.body.session.role, 'owner');
  await c.post('/api/auth/logout');
  me = await c.get('/api/auth/me');
  assert.equal(me.body.user, null);
  assert.equal((await c.post('/api/auth/login', { email, password: 'wrong password here' })).status, 401);
  assert.equal((await c.post('/api/auth/login', { email, password: PASSWORD })).status, 200);
  assert.equal((await c.get('/api/events')).status, 200);
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

t('organization invites: a new person waits for approval; an existing active account joins; roles are enforced', async () => {
  const { c } = await newOrg('Roles Org');
  const { body: ev } = await c.post('/api/events', EVENT);
  const volEmail = `vol${Date.now()}@example.org`;
  const inv = await c.post('/api/members/invite', { email: volEmail, role: 'volunteer' });
  assert.equal(inv.status, 201);
  const token = inv.body.link.split('#invite=')[1];
  const v = client();
  assert.equal((await v.get(`/api/auth/invite/${token}`)).body.role, 'volunteer');
  const acc = await v.post('/api/auth/invite/accept', { token, password: 'volunteer passphrase', name: 'Val' });
  assert.equal(acc.status, 202);
  assert.equal(acc.body.pending, true);
  assert.equal((await v.get('/api/events')).status, 401, 'no access before approval');
  // Token is single use.
  assert.equal((await client().post('/api/auth/invite/accept', { token, password: 'another passphrase' })).status, 400);
  // The master administrator approves into the inviting organization with the invited role.
  const reqId = await requestIdFor(volEmail);
  assert.equal((await master.c.get(`/api/platform/requests/${reqId}`)).body.request.inviteRole, 'volunteer');
  assert.equal((await master.c.post(`/api/platform/requests/${reqId}/approve`, {})).status, 200);
  assert.equal((await v.post('/api/auth/login', { email: volEmail, password: 'volunteer passphrase' })).status, 200);
  // Volunteer: can see events, cannot see PII, cannot invite, cannot edit the budget.
  assert.equal((await v.get('/api/events')).status, 200);
  assert.equal((await v.get(`/api/events/${ev.event.id}/registrations`)).status, 403);
  assert.equal((await v.post('/api/members/invite', { email: 'x@example.org', role: 'owner' })).status, 403);
  const cur = (await v.get(`/api/events/${ev.event.id}`)).body.event;
  assert.equal((await v.patch(`/api/events/${ev.event.id}`, { version: cur.version, patch: { budget: { lines: [] } } })).status, 403);
  // Last owner cannot be demoted.
  const members = (await c.get('/api/members')).body.members;
  const owner = members.find((m) => m.role === 'owner');
  assert.equal((await c.patch(`/api/members/${owner.id}`, { role: 'coordinator' })).status, 400);
  // An existing active account joins another organization straight away.
  const other = await newOrg('Second Org');
  const inv2 = await other.c.post('/api/members/invite', { email: volEmail, role: 'partner' });
  const t2 = inv2.body.link.split('#invite=')[1];
  assert.equal((await client().post('/api/auth/invite/accept', { token: t2, password: 'volunteer passphrase' })).status, 200);
});

t('password reset flow', async () => {
  const { email } = await newOrg();
  const c = client();
  assert.equal((await c.post('/api/auth/password/forgot', { email })).status, 200);
  const token = await linkFromEmail(email, /#reset=([A-Za-z0-9_-]+)/);
  assert.ok(token, 'reset email queued');
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

t('WRTS admin center: organizations created by an administrator; their owner set-up links are pre-approved', async () => {
  const ownerEmail = `customer-${Date.now()}@example.org`;
  assert.equal((await master.c.post('/api/platform/orgs', { name: '', ownerEmail })).status, 400);
  assert.equal((await master.c.post('/api/platform/orgs', { name: 'X', ownerEmail: 'not-an-email' })).status, 400);
  assert.equal((await master.c.post('/api/platform/orgs', { name: 'X', ownerEmail, tier: 'gold' })).status, 400);
  const made = await master.c.post('/api/platform/orgs', { name: 'Eastside Run Club', ownerEmail, ownerName: 'Dana', tier: 'community', orgType: 'Running or walking club' });
  assert.equal(made.status, 201, JSON.stringify(made.body));
  assert.match(made.body.link, /#invite=/);
  assert.ok(await linkFromEmail(ownerEmail, /(#invite=)/), 'owner set-up email queued');

  let row = (await master.c.get('/api/platform/orgs')).body.orgs.find((o) => o.id === made.body.org.id);
  assert.equal(row.tier, 'community');
  assert.equal(row.pendingOwners, ownerEmail);

  const customer = client();
  const token = made.body.link.split('#invite=')[1];
  assert.equal((await customer.get(`/api/auth/invite/${token}`)).body.role, 'owner');
  assert.equal((await customer.post('/api/auth/invite/accept', { token, password: 'another long phrase', name: 'Dana' })).status, 200);
  const me = (await customer.get('/api/auth/me')).body;
  assert.equal(me.session.orgId, made.body.org.id);
  assert.equal(me.session.role, 'owner');
  assert.equal(me.user.isPlatformAdmin, false);
  assert.equal((await customer.get('/api/platform/orgs')).status, 404);

  row = (await master.c.get('/api/platform/orgs')).body.orgs.find((o) => o.id === made.body.org.id);
  assert.equal(row.owners, ownerEmail);
  assert.equal((await master.c.get(`/api/platform/orgs/${made.body.org.id}`)).body.members[0].email, ownerEmail);
  assert.equal((await master.c.get('/api/platform/orgs/org_missing')).status, 404);
  assert.equal((await master.c.patch(`/api/platform/orgs/${made.body.org.id}`, { tier: 'enterprise' })).status, 200);
  assert.equal((await master.c.patch(`/api/platform/orgs/${made.body.org.id}`, { tier: 'gold' })).status, 400);
  assert.equal((await master.c.patch('/api/platform/orgs/org_missing', { tier: 'pro' })).status, 404);
  assert.equal((await master.c.post(`/api/platform/orgs/${made.body.org.id}/owner-invite`, { email: 'second-owner@example.org' })).status, 201);
});

test('event pages for search and AI: escaped tags and schema.org Event data', () => {
  const view = { slug: 'x', name: 'Run <for> "Hope"', date: '2027-05-01', location: 'Lake Park', description: 'A 5K </script><script>alert(1)</script>', organization: 'Eastside & Co', typeLabel: '5K run/walk', format: 'physical', price: 25, cause: null, fourWs: [{ name: 'Wellness' }], programming: [], sponsors: ['Acme'], registrationOpen: true, spotsLeft: 12 };
  const { head, body } = eventSeo(view, 'https://eventos.example/e/x');
  assert.match(head, /<title>Run &lt;for&gt; &quot;Hope&quot; · Eastside &amp; Co · EventOS<\/title>/);
  assert.ok(!head.includes('</script><script>'), 'JSON-LD must not close its script tag');
  const ld = JSON.parse(head.match(/<script type="application\/ld\+json">(.*)<\/script>/)[1]);
  assert.equal(ld['@type'], 'Event');
  assert.equal(ld.startDate, '2027-05-01');
  assert.equal(ld.location.name, 'Lake Park');
  assert.equal(ld.offers.price, '25');
  assert.match(body, /<h1>Run &lt;for&gt; &quot;Hope&quot;<\/h1>/);
  assert.match(body, /Saturday, May 1, 2027/);
  assert.match(body, /\$25, 12 spots left/);
  assert.ok(!body.includes('<script>'));
});

t('sitemap lists the home page, sign-up and published events only', async () => {
  const { c } = await newOrg('Sitemap Org');
  let pub = (await c.post('/api/events', { ...EVENT, name: 'Sitemap Public Run' })).body.event;
  pub = (await c.patch(`/api/events/${pub.id}`, { version: pub.version, patch: { isPublic: true } })).body.event;
  const priv = (await c.post('/api/events', { ...EVENT, name: 'Sitemap Private Run' })).body.event;
  const res = await fetch(base + '/sitemap.xml');
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /xml/);
  const xml = await res.text();
  assert.match(xml, /<loc>http:\/\/localhost:3999\/signup<\/loc>/);
  assert.ok(xml.includes(`/e/${pub.slug}<`));
  assert.ok(!xml.includes(`/e/${priv.slug}<`));
});
