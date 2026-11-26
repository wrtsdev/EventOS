// Authentication, account requests and two-step sign-in.
// Proprietary and confidential. © We Run These Streetz LLC.

import bcrypt from 'bcryptjs';
import QRCode from 'qrcode';
import { Router } from 'express';
import { newId, randomToken, sha256, parseCookies, EMAIL_RE, str, rateLimit } from './security.js';
import { audit } from './audit.js';
import { ROLES } from '../src/domain/access.js';
import {
  CAN_SIGN_IN, blockedMessage, PILLARS, REQUESTED_ROLES, TERMS_VERSION,
  newTotpSecret, otpauthUrl, verifyTotp, newRecoveryCodes, checkSecondFactor, encryptSecret,
  masterExists, promoteToMaster, adminRecipients,
} from './governance.js';
import { decrypt } from './security.js';

const COOKIE = 'eventos_session';
const BCRYPT_COST = 12;
const LOCK_AFTER = 8;
const LOCK_MINUTES = 15;
// Real hash used to keep response time the same when the email is unknown.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', BCRYPT_COST);

export function validPassword(p) {
  return typeof p === 'string' && p.length >= 12 && p.length <= 200;
}

function cookieHeader(token, cfg, maxAgeSec) {
  const secure = cfg.publicUrl.startsWith('https://') ? '; Secure' : '';
  return `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSec}${secure}`;
}

export async function createSession(db, cfg, res, userId, orgId, req, { mfaVerified = false } = {}) {
  const token = randomToken();
  const days = cfg.sessionDays;
  await db.query(
    'INSERT INTO sessions (token_hash, user_id, organization_id, expires_at, user_agent, ip, mfa_verified, last_seen_at) VALUES (:h, :u, :o, DATE_ADD(UTC_TIMESTAMP(), INTERVAL :d DAY), :ua, :ip, :m, UTC_TIMESTAMP())',
    { h: sha256(token), u: userId, o: orgId, d: days, ua: str(req.headers['user-agent'], 255), ip: str(req.ip, 64), m: mfaVerified ? 1 : 0 },
  );
  res.setHeader('Set-Cookie', cookieHeader(token, cfg, days * 86400));
}

/**
 * Loads req.user and req.session from the session cookie. Only active accounts
 * get a user: a suspended or deactivated account loses access on its next request,
 * and its sessions are removed.
 */
export function sessionMiddleware(db) {
  return async (req, res, next) => {
    try {
      const token = parseCookies(req.headers.cookie)[COOKIE];
      if (!token) return next();
      const row = await db.one(
        `SELECT s.token_hash, s.organization_id, s.mfa_verified, u.id, u.email, u.display_name, u.status,
                u.is_platform_admin, u.is_master, u.mfa_enabled_at, m.role
           FROM sessions s JOIN users u ON u.id = s.user_id
           LEFT JOIN memberships m ON m.user_id = u.id AND m.organization_id = s.organization_id
          WHERE s.token_hash = :h AND s.expires_at > UTC_TIMESTAMP()`,
        { h: sha256(token) },
      );
      if (row && row.status !== 'active') {
        await db.query('DELETE FROM sessions WHERE user_id = :u', { u: row.id });
        return next();
      }
      if (row) {
        const isMaster = Boolean(row.is_master);
        const isPlatformAdmin = isMaster || Boolean(row.is_platform_admin);
        req.user = {
          id: row.id, email: row.email, name: row.display_name, status: row.status,
          isMaster, isPlatformAdmin, privileged: isPlatformAdmin,
          mfaEnabled: Boolean(row.mfa_enabled_at), mfaVerified: Boolean(row.mfa_verified),
        };
        // A session only grants access to an org the user is still a member of.
        req.session = row.role ? { orgId: row.organization_id, role: row.role, tokenHash: row.token_hash } : { orgId: null, role: null, tokenHash: row.token_hash };
      }
      next();
    } catch (e) {
      next(e);
    }
  };
}

export function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Sign in to continue.' });
  next();
}
export function requireOrg(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Sign in to continue.' });
  if (!req.session?.orgId) return res.status(403).json({ error: 'Choose an organization first.' });
  next();
}

const fullName = (first, last) => [first, last].filter(Boolean).join(' ');

export function authRouter(db, cfg, outbox) {
  const r = Router();
  // Per IP address. Tests raise the limits with cfg.rateLimitScale.
  const scale = cfg.rateLimitScale ?? 1;
  const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 30 * scale });
  const requestLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 10 * scale });
  const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

  async function sendVerification(user, { resend = false } = {}) {
    const token = randomToken();
    await db.query("INSERT INTO tokens (token_hash, kind, email, expires_at) VALUES (:h, 'verify', :e, DATE_ADD(UTC_TIMESTAMP(), INTERVAL 24 HOUR))", { h: sha256(token), e: user.email });
    await outbox.queue({
      kind: 'account.verify',
      to: user.email,
      subject: 'Confirm your email for EventOS',
      body: `Thanks for requesting an EventOS account.\n\nConfirm your email address here (the link works for 24 hours):\n${cfg.publicUrl}/#verify=${token}\n\nAfter you confirm, We Run These Streetz reviews your request. You'll get an email when it's approved.\n\nIf you didn't request an account, ignore this email.`,
      // Resends are limited to one an hour per address.
      dedupeKey: resend ? `verify:${user.email}:${new Date().toISOString().slice(0, 13)}` : null,
      relatedEntity: 'user',
      relatedId: user.id,
    });
  }

  async function notifyAdminsOfRequest(reqRow, { reason = 'new' } = {}) {
    const name = fullName(reqRow.first_name, reqRow.last_name) || reqRow.email;
    for (const to of await adminRecipients(db, cfg)) {
      await outbox.queue({
        kind: 'admin.account_request',
        to,
        subject: reason === 'response' ? `EventOS account request updated: ${name}` : `New EventOS account request: ${name}`,
        body: `${reason === 'response' ? `${name} replied to your request for more information.` : `${name} requested an EventOS account.`}\n\nEmail: ${reqRow.email}\nOrganization: ${reqRow.organization_name || '—'} (${reqRow.organization_type || 'type not given'})\nRequested role: ${REQUESTED_ROLES[reqRow.requested_role] ?? reqRow.requested_role ?? '—'}\nPillar of interest: ${reqRow.primary_pillar || '—'}\n\nReview it in the WRTS admin center (sign-in and two-step verification required). Opening this link does not approve anything:\n${cfg.publicUrl}/?review=${reqRow.id}`,
        dedupeKey: `admin-notify:${reqRow.id}:${reason}:${reqRow.updated_at ? new Date(reqRow.updated_at).toISOString() : ''}`,
        relatedEntity: 'account_request',
        relatedId: reqRow.id,
      });
    }
  }

  // Open self-registration is replaced by account requests.
  r.post('/signup', (req, res) => res.status(410).json({ error: 'EventOS accounts are approved by We Run These Streetz. Request access instead.' }));

  /** Public account request. Always answers the same way so it can't reveal who has an account. */
  r.post('/request', requestLimiter, wrap(async (req, res) => {
    const b = req.body || {};
    const email = str(b.email, 254).toLowerCase();
    const first = str(b.firstName, 100);
    const last = str(b.lastName, 100);
    const pillar = str(b.primaryPillar, 20).toLowerCase();
    const role = str(b.requestedRole, 40);
    if (!first || !last) return res.status(400).json({ error: 'Enter your first and last name.' });
    if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'Enter a valid email address.' });
    if (!validPassword(b.password)) return res.status(400).json({ error: 'Choose a password of at least 12 characters.' });
    if (!str(b.organizationType, 80)) return res.status(400).json({ error: 'Choose your organization type.' });
    if (!REQUESTED_ROLES[role]) return res.status(400).json({ error: 'Choose the kind of account you need.' });
    if (!str(b.intendedUse, 2000)) return res.status(400).json({ error: 'Tell us how you plan to use EventOS.' });
    if (!PILLARS.includes(pillar)) return res.status(400).json({ error: 'Choose the WRTS pillar you’re most interested in.' });
    if (b.acceptTerms !== true) return res.status(400).json({ error: 'Accept the terms of use and privacy notice to continue.' });

    const generic = { ok: true, message: 'Check your email. If this address can be used for a new account, we sent a link to confirm it.' };
    const existing = await db.one('SELECT id, email, status FROM users WHERE email = :e', { e: email });
    if (existing) {
      if (existing.status === 'unverified') await sendVerification(existing, { resend: true });
      await audit(db, { userId: existing.id, action: 'account.request_duplicate', detail: { status: existing.status }, ip: req.ip });
      return res.status(202).json(generic);
    }
    const userId = newId('usr');
    const reqId = newId('req');
    const hash = await bcrypt.hash(b.password, BCRYPT_COST);
    await db.tx(async (t) => {
      await t.query(
        "INSERT INTO users (id, email, display_name, first_name, last_name, password_hash, status) VALUES (:id, :e, :n, :f, :l, :h, 'unverified')",
        { id: userId, e: email, n: fullName(first, last), f: first, l: last, h: hash },
      );
      await t.query(
        `INSERT INTO account_requests (id, user_id, source, email, first_name, last_name, organization_name, organization_type, requested_role, intended_use, primary_pillar, phone, website, terms_version, terms_accepted_at, status, ip)
         VALUES (:id, :u, 'request', :e, :f, :l, :on, :ot, :rr, :use, :p, :ph, :w, :tv, UTC_TIMESTAMP(), 'unverified', :ip)`,
        { id: reqId, u: userId, e: email, f: first, l: last, on: str(b.organizationName, 200), ot: str(b.organizationType, 80), rr: role, use: str(b.intendedUse, 2000), p: pillar, ph: str(b.phone, 40), w: str(b.website, 255), tv: TERMS_VERSION, ip: str(req.ip, 64) },
      );
    });
    await sendVerification({ id: userId, email });
    await audit(db, { userId, action: 'account.request', entity: 'account_request', entityId: reqId, ip: req.ip });
    res.status(202).json(generic);
  }));

  /** Confirms the email address and puts the request in the approval queue. Never activates an ordinary account. */
  r.post('/verify', limiter, wrap(async (req, res) => {
    const tok = await db.one("SELECT * FROM tokens WHERE token_hash = :h AND kind = 'verify' AND used_at IS NULL AND expires_at > UTC_TIMESTAMP()", { h: sha256(str(req.body.token, 200)) });
    if (!tok) return res.status(400).json({ error: 'This link is invalid or has expired. Request access again to get a new one.' });
    const user = await db.one('SELECT * FROM users WHERE email = :e', { e: tok.email });
    await db.query('UPDATE tokens SET used_at = UTC_TIMESTAMP() WHERE token_hash = :h', { h: tok.token_hash });
    if (!user || user.status !== 'unverified') return res.json({ ok: true, status: user?.status === 'active' ? 'active' : 'pending_approval' });
    await db.query("UPDATE users SET email_verified_at = UTC_TIMESTAMP(), status = 'pending_approval', status_changed_at = UTC_TIMESTAMP() WHERE id = :id", { id: user.id });
    await db.query("UPDATE account_requests SET status = 'pending_approval', submitted_at = UTC_TIMESTAMP() WHERE user_id = :u AND status = 'unverified'", { u: user.id });
    const reqRow = await db.one('SELECT * FROM account_requests WHERE user_id = :u ORDER BY created_at DESC LIMIT 1', { u: user.id });
    await audit(db, { userId: user.id, action: 'account.email_verified', ip: req.ip });

    // Bootstrap: the configured master administrator, when no master exists yet.
    if (cfg.masterEmail && user.email === cfg.masterEmail && !(await masterExists(db))) {
      const orgId = newId('org');
      const settings = { type: reqRow?.organization_type || 'WRTS-operated program', coordinator: user.display_name, assistantEnabled: true, epicWeights: { E: 40, P: 20, I: 20, C: 20 }, eventsPerYear: 1 };
      await db.query('INSERT INTO organizations (id, name, org_type, tier, settings) VALUES (:id, :n, :t, :tier, :s)', { id: orgId, n: reqRow?.organization_name || 'We Run These Streetz', t: settings.type, tier: 'enterprise', s: JSON.stringify(settings) });
      await db.query("INSERT INTO memberships (organization_id, user_id, role) VALUES (:o, :u, 'owner')", { o: orgId, u: user.id });
      await promoteToMaster(db, user.id, { via: 'email verification' });
      return res.json({ ok: true, status: 'master' });
    }
    if (reqRow) await notifyAdminsOfRequest(reqRow);
    res.json({ ok: true, status: 'pending_approval' });
  }));

  /** Applicant view of a request for more information (from the emailed link). */
  r.get('/request-info/:token', wrap(async (req, res) => {
    const tok = await db.one("SELECT * FROM tokens WHERE token_hash = :h AND kind = 'reqinfo' AND used_at IS NULL AND expires_at > UTC_TIMESTAMP()", { h: sha256(str(req.params.token, 200)) });
    if (!tok) return res.status(404).json({ error: 'This link is invalid or has expired.' });
    const reqRow = await db.one("SELECT first_name, info_request_note FROM account_requests WHERE email = :e AND status = 'info_required' ORDER BY updated_at DESC LIMIT 1", { e: tok.email });
    if (!reqRow) return res.status(404).json({ error: 'There is no open question on this request.' });
    res.json({ email: tok.email, firstName: reqRow.first_name, question: reqRow.info_request_note });
  }));

  r.post('/request-info', limiter, wrap(async (req, res) => {
    const tok = await db.one("SELECT * FROM tokens WHERE token_hash = :h AND kind = 'reqinfo' AND used_at IS NULL AND expires_at > UTC_TIMESTAMP()", { h: sha256(str(req.body.token, 200)) });
    if (!tok) return res.status(400).json({ error: 'This link is invalid or has expired.' });
    const response = str(req.body.response, 4000);
    if (!response) return res.status(400).json({ error: 'Add your answer.' });
    const reqRow = await db.one("SELECT * FROM account_requests WHERE email = :e AND status = 'info_required' ORDER BY updated_at DESC LIMIT 1", { e: tok.email });
    if (!reqRow) return res.status(400).json({ error: 'There is no open question on this request.' });
    await db.query("UPDATE account_requests SET applicant_response = :r, status = 'pending_approval' WHERE id = :id", { r: response, id: reqRow.id });
    await db.query("UPDATE users SET status = 'pending_approval', status_changed_at = UTC_TIMESTAMP() WHERE id = :u AND status = 'info_required'", { u: reqRow.user_id });
    await db.query('UPDATE tokens SET used_at = UTC_TIMESTAMP() WHERE token_hash = :h', { h: tok.token_hash });
    await audit(db, { userId: reqRow.user_id, action: 'account.info_provided', entity: 'account_request', entityId: reqRow.id, ip: req.ip });
    await notifyAdminsOfRequest(await db.one('SELECT * FROM account_requests WHERE id = :id', { id: reqRow.id }), { reason: 'response' });
    res.json({ ok: true });
  }));

  r.post('/login', limiter, wrap(async (req, res) => {
    const email = str(req.body.email, 254).toLowerCase();
    const user = await db.one('SELECT * FROM users WHERE email = :e', { e: email });
    const generic = { error: 'Email or password is incorrect.' };
    if (!user) {
      await bcrypt.compare(String(req.body.password ?? ''), DUMMY_HASH);
      return res.status(401).json(generic);
    }
    if (user.locked_until && new Date(user.locked_until) > new Date()) return res.status(429).json({ error: `Too many attempts. Try again in ${LOCK_MINUTES} minutes or reset your password.` });
    const ok = await bcrypt.compare(String(req.body.password ?? ''), user.password_hash);
    if (!ok) {
      const n = user.failed_logins + 1;
      await db.query('UPDATE users SET failed_logins = :n, locked_until = IF(:n >= :max, DATE_ADD(UTC_TIMESTAMP(), INTERVAL :m MINUTE), NULL) WHERE id = :id', { n, max: LOCK_AFTER, m: LOCK_MINUTES, id: user.id });
      await audit(db, { userId: user.id, action: 'auth.login_failed', ip: req.ip });
      return res.status(401).json(generic);
    }
    await db.query('UPDATE users SET failed_logins = 0, locked_until = NULL WHERE id = :id', { id: user.id });
    // Status is only revealed after the correct password.
    if (!CAN_SIGN_IN.has(user.status)) {
      if (user.status === 'unverified') await sendVerification(user, { resend: true });
      await audit(db, { userId: user.id, action: 'auth.login_blocked', detail: { status: user.status }, ip: req.ip });
      return res.status(403).json({ error: blockedMessage(user.status), status: user.status });
    }
    if (user.mfa_enabled_at) {
      const ticket = randomToken();
      await db.query("INSERT INTO tokens (token_hash, kind, email, expires_at) VALUES (:h, 'mfa', :e, DATE_ADD(UTC_TIMESTAMP(), INTERVAL 5 MINUTE))", { h: sha256(ticket), e: user.email });
      return res.json({ ok: true, mfaRequired: true, ticket });
    }
    await finishLogin(req, res, user, { mfaVerified: false });
  }));

  async function finishLogin(req, res, user, { mfaVerified }) {
    if (user.status === 'approved') {
      await db.query("UPDATE users SET status = 'active', status_changed_at = UTC_TIMESTAMP() WHERE id = :id", { id: user.id });
      await audit(db, { userId: user.id, action: 'account.activated', ip: req.ip });
    }
    await db.query('UPDATE users SET last_login_at = UTC_TIMESTAMP() WHERE id = :id', { id: user.id });
    const m = await db.one('SELECT organization_id FROM memberships WHERE user_id = :u ORDER BY created_at LIMIT 1', { u: user.id });
    await createSession(db, cfg, res, user.id, m?.organization_id ?? null, req, { mfaVerified });
    await audit(db, { orgId: m?.organization_id, userId: user.id, action: 'auth.login', detail: { mfa: mfaVerified }, ip: req.ip });
    res.json({ ok: true });
  }

  /** Second step of sign-in for accounts with two-step verification. */
  r.post('/mfa/verify', limiter, wrap(async (req, res) => {
    const tok = await db.one("SELECT * FROM tokens WHERE token_hash = :h AND kind = 'mfa' AND used_at IS NULL AND expires_at > UTC_TIMESTAMP()", { h: sha256(str(req.body.ticket, 200)) });
    if (!tok) return res.status(400).json({ error: 'Your sign-in expired. Enter your email and password again.' });
    const user = await db.one('SELECT * FROM users WHERE email = :e', { e: tok.email });
    if (!user || !CAN_SIGN_IN.has(user.status)) return res.status(403).json({ error: blockedMessage(user?.status) });
    const how = await checkSecondFactor(db, cfg, user, req.body.code);
    if (!how) {
      await audit(db, { userId: user.id, action: 'auth.mfa_failed', ip: req.ip });
      return res.status(401).json({ error: 'That code didn’t work. Use the current 6-digit code from your authenticator app, or a recovery code.' });
    }
    await db.query('UPDATE tokens SET used_at = UTC_TIMESTAMP() WHERE token_hash = :h', { h: tok.token_hash });
    await finishLogin(req, res, user, { mfaVerified: true });
  }));

  // Two-step verification setup for the signed-in user.
  r.post('/mfa/setup', requireAuth, wrap(async (req, res) => {
    if (req.user.mfaEnabled) return res.status(409).json({ error: 'Two-step verification is already on.' });
    const secret = newTotpSecret();
    await db.query('UPDATE users SET mfa_pending_secret = :s WHERE id = :id', { s: encryptSecret(cfg, secret), id: req.user.id });
    const url = otpauthUrl(secret, req.user.email);
    const qrSvg = await QRCode.toString(url, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' });
    res.json({ secret, otpauthUrl: url, qrSvg });
  }));

  r.post('/mfa/enable', requireAuth, limiter, wrap(async (req, res) => {
    const row = await db.one('SELECT mfa_pending_secret FROM users WHERE id = :id', { id: req.user.id });
    if (!row?.mfa_pending_secret) return res.status(400).json({ error: 'Start the setup again.' });
    const secret = decrypt(cfg.appSecret, row.mfa_pending_secret);
    const step = verifyTotp(secret, req.body.code);
    if (step == null) return res.status(400).json({ error: 'That code didn’t match. Check the time on your phone and try the newest code.' });
    const { codes, stored } = newRecoveryCodes();
    await db.query(
      'UPDATE users SET mfa_secret = mfa_pending_secret, mfa_pending_secret = NULL, mfa_enabled_at = UTC_TIMESTAMP(), mfa_last_counter = :c, mfa_recovery_codes = :r WHERE id = :id',
      { c: step, r: stored, id: req.user.id },
    );
    await db.query('UPDATE sessions SET mfa_verified = 1 WHERE token_hash = :h', { h: req.session.tokenHash });
    await audit(db, { userId: req.user.id, action: 'auth.mfa_enabled', ip: req.ip });
    res.json({ ok: true, recoveryCodes: codes });
  }));

  r.post('/mfa/recovery-codes', requireAuth, limiter, wrap(async (req, res) => {
    const user = await db.one('SELECT * FROM users WHERE id = :id', { id: req.user.id });
    if (!(await checkSecondFactor(db, cfg, user, req.body.code))) return res.status(401).json({ error: 'That code didn’t work.' });
    const { codes, stored } = newRecoveryCodes();
    await db.query('UPDATE users SET mfa_recovery_codes = :r WHERE id = :id', { r: stored, id: req.user.id });
    await audit(db, { userId: req.user.id, action: 'auth.mfa_recovery_codes_regenerated', ip: req.ip });
    res.json({ ok: true, recoveryCodes: codes });
  }));

  r.post('/mfa/disable', requireAuth, limiter, wrap(async (req, res) => {
    if (req.user.privileged) return res.status(403).json({ error: 'Administrators must keep two-step verification on.' });
    const user = await db.one('SELECT * FROM users WHERE id = :id', { id: req.user.id });
    if (!(await checkSecondFactor(db, cfg, user, req.body.code))) return res.status(401).json({ error: 'That code didn’t work.' });
    await db.query('UPDATE users SET mfa_secret = NULL, mfa_enabled_at = NULL, mfa_last_counter = NULL, mfa_recovery_codes = NULL WHERE id = :id', { id: req.user.id });
    await audit(db, { userId: req.user.id, action: 'auth.mfa_disabled', ip: req.ip });
    res.json({ ok: true });
  }));

  r.post('/logout', wrap(async (req, res) => {
    if (req.session?.tokenHash) await db.query('DELETE FROM sessions WHERE token_hash = :h', { h: req.session.tokenHash });
    res.setHeader('Set-Cookie', cookieHeader('', cfg, 0));
    res.json({ ok: true });
  }));

  r.get('/me', wrap(async (req, res) => {
    if (!req.user) return res.json({ user: null });
    const orgs = await db.query(
      'SELECT o.id, o.name, o.tier, m.role FROM memberships m JOIN organizations o ON o.id = m.organization_id WHERE m.user_id = :u ORDER BY o.name',
      { u: req.user.id },
    );
    res.json({ user: req.user, session: req.session?.orgId ? { orgId: req.session.orgId, role: req.session.role } : null, orgs });
  }));

  r.post('/switch-org', requireAuth, wrap(async (req, res) => {
    const m = await db.one('SELECT role FROM memberships WHERE user_id = :u AND organization_id = :o', { u: req.user.id, o: str(req.body.orgId, 40) });
    if (!m) return res.status(404).json({ error: 'Organization not found.' });
    await db.query('UPDATE sessions SET organization_id = :o WHERE token_hash = :h', { o: str(req.body.orgId, 40), h: req.session.tokenHash });
    res.json({ ok: true });
  }));

  // Password reset: always answers the same way so it cannot reveal accounts. Doesn't change account status.
  r.post('/password/forgot', limiter, wrap(async (req, res) => {
    const email = str(req.body.email, 254).toLowerCase();
    const user = EMAIL_RE.test(email) ? await db.one('SELECT id, status FROM users WHERE email = :e', { e: email }) : null;
    if (user && CAN_SIGN_IN.has(user.status)) {
      const token = randomToken();
      await db.query("INSERT INTO tokens (token_hash, kind, email, expires_at) VALUES (:h, 'reset', :e, DATE_ADD(UTC_TIMESTAMP(), INTERVAL 1 HOUR))", { h: sha256(token), e: email });
      await outbox.queue({
        kind: 'auth.password_reset',
        to: email,
        subject: 'Reset your EventOS password',
        body: `Someone asked to reset the EventOS password for this email.\n\nReset it here (valid for 1 hour):\n${cfg.publicUrl}/#reset=${token}\n\nIf this wasn't you, ignore this email. Your password stays the same.`,
        relatedEntity: 'user',
        relatedId: user.id,
      });
    }
    res.json({ ok: true, message: 'If that email has an active account, a reset link is on its way.' });
  }));

  r.post('/password/reset', limiter, wrap(async (req, res) => {
    if (!validPassword(req.body.password)) return res.status(400).json({ error: 'Use a password of at least 12 characters.' });
    const tok = await db.one("SELECT * FROM tokens WHERE token_hash = :h AND kind = 'reset' AND used_at IS NULL AND expires_at > UTC_TIMESTAMP()", { h: sha256(str(req.body.token, 200)) });
    if (!tok) return res.status(400).json({ error: 'This reset link is invalid or has expired.' });
    const hash = await bcrypt.hash(req.body.password, BCRYPT_COST);
    const user = await db.one('SELECT id FROM users WHERE email = :e', { e: tok.email });
    await db.tx(async (t) => {
      await t.query('UPDATE users SET password_hash = :p, failed_logins = 0, locked_until = NULL WHERE id = :id', { p: hash, id: user.id });
      await t.query('UPDATE tokens SET used_at = UTC_TIMESTAMP() WHERE token_hash = :h', { h: tok.token_hash });
      await t.query('DELETE FROM sessions WHERE user_id = :id', { id: user.id }); // sign out everywhere
    });
    await audit(db, { userId: user.id, action: 'auth.password_reset', ip: req.ip });
    res.json({ ok: true });
  }));

  /**
   * Accept an invitation. An existing active account joins the organization.
   * A new account joins only after approval, unless a platform administrator
   * sent the invitation (that is the approval). Invitations never grant
   * platform privileges.
   */
  r.post('/invite/accept', limiter, wrap(async (req, res) => {
    const tok = await db.one("SELECT * FROM tokens WHERE token_hash = :h AND kind = 'invite' AND used_at IS NULL AND expires_at > UTC_TIMESTAMP()", { h: sha256(str(req.body.token, 200)) });
    if (!tok) return res.status(400).json({ error: 'This invitation is invalid or has expired. Ask for a new one.' });
    if (!ROLES[tok.role]) return res.status(400).json({ error: 'Invalid invitation.' });
    const inviter = tok.created_by ? await db.one("SELECT is_master, is_platform_admin, status FROM users WHERE id = :id", { id: tok.created_by }) : null;
    const preApproved = Boolean(inviter && inviter.status === 'active' && (inviter.is_master || inviter.is_platform_admin));
    let user = await db.one('SELECT * FROM users WHERE email = :e', { e: tok.email });

    if (!user) {
      if (!validPassword(req.body.password)) return res.status(400).json({ error: 'Choose a password of at least 12 characters.' });
      const id = newId('usr');
      const name = str(req.body.name, 200);
      const status = preApproved ? 'active' : 'pending_approval';
      await db.query(
        'INSERT INTO users (id, email, display_name, password_hash, status, status_changed_at, email_verified_at) VALUES (:id, :e, :n, :h, :s, UTC_TIMESTAMP(), UTC_TIMESTAMP())',
        { id, e: tok.email, n: name, h: await bcrypt.hash(req.body.password, BCRYPT_COST), s: status },
      );
      user = await db.one('SELECT * FROM users WHERE id = :id', { id });
      if (!preApproved) {
        const reqId = newId('req');
        const org = await db.one('SELECT name, org_type FROM organizations WHERE id = :o', { o: tok.organization_id });
        await db.query(
          `INSERT INTO account_requests (id, user_id, source, email, first_name, organization_name, organization_type, requested_role, intended_use, status, invite_organization_id, invite_role, submitted_at, ip)
           VALUES (:id, :u, 'invite', :e, :n, :on, :ot, 'coordinator', :use, 'pending_approval', :io, :ir, UTC_TIMESTAMP(), :ip)`,
          { id: reqId, u: id, e: tok.email, n: name, on: org?.name, ot: org?.org_type, use: `Invited to ${org?.name} as ${ROLES[tok.role].label}.`, io: tok.organization_id, ir: tok.role, ip: str(req.ip, 64) },
        );
        await db.query('UPDATE tokens SET used_at = UTC_TIMESTAMP() WHERE token_hash = :h', { h: tok.token_hash });
        await audit(db, { orgId: tok.organization_id, userId: id, action: 'account.request', entity: 'account_request', entityId: reqId, detail: { source: 'invite', role: tok.role }, ip: req.ip });
        await notifyAdminsOfRequest(await db.one('SELECT * FROM account_requests WHERE id = :id', { id: reqId }));
        return res.status(202).json({ ok: true, pending: true, message: 'Your account is waiting for approval by We Run These Streetz. We’ll email you when you can sign in.' });
      }
    } else {
      if (!(await bcrypt.compare(String(req.body.password ?? ''), user.password_hash))) return res.status(401).json({ error: 'You already have an account. Enter that password to accept.' });
      if (!CAN_SIGN_IN.has(user.status)) return res.status(403).json({ error: blockedMessage(user.status) });
      if (user.mfa_enabled_at) return res.status(403).json({ error: 'Sign in first (with two-step verification), then open the invitation link again.' });
    }
    await db.tx(async (t) => {
      await t.query('INSERT INTO memberships (organization_id, user_id, role) VALUES (:o, :u, :r) ON DUPLICATE KEY UPDATE role = VALUES(role)', { o: tok.organization_id, u: user.id, r: tok.role });
      await t.query('UPDATE tokens SET used_at = UTC_TIMESTAMP() WHERE token_hash = :h', { h: tok.token_hash });
    });
    if (user.status === 'approved') await db.query("UPDATE users SET status = 'active', status_changed_at = UTC_TIMESTAMP() WHERE id = :id", { id: user.id });
    await createSession(db, cfg, res, user.id, tok.organization_id, req);
    await audit(db, { orgId: tok.organization_id, userId: user.id, action: 'member.join', detail: { role: tok.role, preApproved }, ip: req.ip });
    res.json({ ok: true });
  }));

  r.get('/invite/:token', wrap(async (req, res) => {
    const tok = await db.one(
      "SELECT t.email, t.role, o.name AS org FROM tokens t JOIN organizations o ON o.id = t.organization_id WHERE t.token_hash = :h AND t.kind = 'invite' AND t.used_at IS NULL AND t.expires_at > UTC_TIMESTAMP()",
      { h: sha256(str(req.params.token, 200)) },
    );
    if (!tok) return res.status(404).json({ error: 'This invitation is invalid or has expired.' });
    const existing = await db.one('SELECT id FROM users WHERE email = :e', { e: tok.email });
    res.json({ email: tok.email, role: tok.role, roleLabel: ROLES[tok.role]?.label, organization: tok.org, hasAccount: Boolean(existing) });
  }));

  return r;
}
