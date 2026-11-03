import bcrypt from 'bcryptjs';
import { Router } from 'express';
import { newId, randomToken, sha256, parseCookies, EMAIL_RE, str, rateLimit } from './security.js';
import { audit } from './audit.js';
import { ROLES } from '../src/domain/access.js';

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

export async function createSession(db, cfg, res, userId, orgId, ua) {
  const token = randomToken();
  const days = cfg.sessionDays;
  await db.query(
    'INSERT INTO sessions (token_hash, user_id, organization_id, expires_at, user_agent) VALUES (:h, :u, :o, DATE_ADD(UTC_TIMESTAMP(), INTERVAL :d DAY), :ua)',
    { h: sha256(token), u: userId, o: orgId, d: days, ua: str(ua, 255) },
  );
  res.setHeader('Set-Cookie', cookieHeader(token, cfg, days * 86400));
}

/** Loads req.user and req.session (org + role) from the session cookie. */
export function sessionMiddleware(db) {
  return async (req, res, next) => {
    try {
      const token = parseCookies(req.headers.cookie)[COOKIE];
      if (!token) return next();
      const row = await db.one(
        `SELECT s.token_hash, s.organization_id, u.id, u.email, u.display_name, u.is_platform_admin, m.role
           FROM sessions s JOIN users u ON u.id = s.user_id
           LEFT JOIN memberships m ON m.user_id = u.id AND m.organization_id = s.organization_id
          WHERE s.token_hash = :h AND s.expires_at > UTC_TIMESTAMP()`,
        { h: sha256(token) },
      );
      if (row) {
        req.user = { id: row.id, email: row.email, name: row.display_name, isPlatformAdmin: Boolean(row.is_platform_admin) };
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

export function authRouter(db, cfg, mailer) {
  const r = Router();
  const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 30 });

  r.post('/signup', limiter, async (req, res, next) => {
    try {
      if (!cfg.signupOpen) return res.status(403).json({ error: 'New organizations are by invitation right now.' });
      const email = str(req.body.email, 254).toLowerCase();
      const name = str(req.body.name, 200);
      const orgName = str(req.body.organization, 200);
      if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'Enter a valid email address.' });
      if (!validPassword(req.body.password)) return res.status(400).json({ error: 'Use a password of at least 12 characters.' });
      if (!orgName) return res.status(400).json({ error: 'Enter your organization name.' });
      const exists = await db.one('SELECT id FROM users WHERE email = :e', { e: email });
      if (exists) return res.status(409).json({ error: 'An account with this email already exists. Sign in instead.' });
      const userId = newId('usr');
      const orgId = newId('org');
      const hash = await bcrypt.hash(req.body.password, BCRYPT_COST);
      const settings = { type: str(req.body.orgType, 80), coordinator: name, assistantEnabled: true, epicWeights: { E: 40, P: 20, I: 20, C: 20 }, eventsPerYear: Number(req.body.eventsPerYear) || 1 };
      await db.tx(async (t) => {
        await t.query('INSERT INTO users (id, email, display_name, password_hash, is_platform_admin) VALUES (:id, :e, :n, :h, :a)', { id: userId, e: email, n: name, h: hash, a: cfg.platformAdmins.includes(email) ? 1 : 0 });
        await t.query('INSERT INTO organizations (id, name, org_type, tier, settings) VALUES (:id, :n, :t, :tier, :s)', { id: orgId, n: orgName, t: settings.type, tier: 'pro', s: JSON.stringify(settings) });
        await t.query("INSERT INTO memberships (organization_id, user_id, role) VALUES (:o, :u, 'owner')", { o: orgId, u: userId });
      });
      await createSession(db, cfg, res, userId, orgId, req.headers['user-agent']);
      await audit(db, { orgId, userId, action: 'org.create', entity: 'organization', entityId: orgId, ip: req.ip });
      res.status(201).json({ ok: true });
    } catch (e) {
      next(e);
    }
  });

  r.post('/login', limiter, async (req, res, next) => {
    try {
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
      const m = await db.one('SELECT organization_id FROM memberships WHERE user_id = :u ORDER BY created_at LIMIT 1', { u: user.id });
      await createSession(db, cfg, res, user.id, m?.organization_id ?? null, req.headers['user-agent']);
      await audit(db, { orgId: m?.organization_id, userId: user.id, action: 'auth.login', ip: req.ip });
      res.json({ ok: true });
    } catch (e) {
      next(e);
    }
  });

  r.post('/logout', async (req, res, next) => {
    try {
      if (req.session?.tokenHash) await db.query('DELETE FROM sessions WHERE token_hash = :h', { h: req.session.tokenHash });
      res.setHeader('Set-Cookie', cookieHeader('', cfg, 0));
      res.json({ ok: true });
    } catch (e) {
      next(e);
    }
  });

  r.get('/me', async (req, res, next) => {
    try {
      if (!req.user) return res.json({ user: null });
      const orgs = await db.query(
        'SELECT o.id, o.name, o.tier, m.role FROM memberships m JOIN organizations o ON o.id = m.organization_id WHERE m.user_id = :u ORDER BY o.name',
        { u: req.user.id },
      );
      res.json({ user: req.user, session: req.session?.orgId ? { orgId: req.session.orgId, role: req.session.role } : null, orgs });
    } catch (e) {
      next(e);
    }
  });

  r.post('/switch-org', requireAuth, async (req, res, next) => {
    try {
      const m = await db.one('SELECT role FROM memberships WHERE user_id = :u AND organization_id = :o', { u: req.user.id, o: str(req.body.orgId, 40) });
      if (!m) return res.status(404).json({ error: 'Organization not found.' });
      await db.query('UPDATE sessions SET organization_id = :o WHERE token_hash = :h', { o: str(req.body.orgId, 40), h: req.session.tokenHash });
      res.json({ ok: true });
    } catch (e) {
      next(e);
    }
  });

  // Password reset: always answers the same way so it cannot reveal accounts.
  r.post('/password/forgot', limiter, async (req, res, next) => {
    try {
      const email = str(req.body.email, 254).toLowerCase();
      const user = EMAIL_RE.test(email) ? await db.one('SELECT id FROM users WHERE email = :e', { e: email }) : null;
      if (user) {
        const token = randomToken();
        await db.query("INSERT INTO tokens (token_hash, kind, email, expires_at) VALUES (:h, 'reset', :e, DATE_ADD(UTC_TIMESTAMP(), INTERVAL 1 HOUR))", { h: sha256(token), e: email });
        await mailer.send({
          to: email,
          subject: 'Reset your EventOS password',
          text: `Someone asked to reset the EventOS password for this email.\n\nReset it here (valid for 1 hour):\n${cfg.publicUrl}/#reset=${token}\n\nIf this wasn't you, ignore this email.`,
        });
      }
      res.json({ ok: true, message: 'If that email has an account, a reset link is on its way.' });
    } catch (e) {
      next(e);
    }
  });

  r.post('/password/reset', limiter, async (req, res, next) => {
    try {
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
    } catch (e) {
      next(e);
    }
  });

  // Accept an invitation: creates the account if needed, adds membership.
  r.post('/invite/accept', limiter, async (req, res, next) => {
    try {
      const tok = await db.one("SELECT * FROM tokens WHERE token_hash = :h AND kind = 'invite' AND used_at IS NULL AND expires_at > UTC_TIMESTAMP()", { h: sha256(str(req.body.token, 200)) });
      if (!tok) return res.status(400).json({ error: 'This invitation is invalid or has expired. Ask for a new one.' });
      if (!ROLES[tok.role]) return res.status(400).json({ error: 'Invalid invitation.' });
      let user = await db.one('SELECT * FROM users WHERE email = :e', { e: tok.email });
      if (!user) {
        if (!validPassword(req.body.password)) return res.status(400).json({ error: 'Choose a password of at least 12 characters.' });
        const id = newId('usr');
        await db.query('INSERT INTO users (id, email, display_name, password_hash) VALUES (:id, :e, :n, :h)', { id, e: tok.email, n: str(req.body.name, 200), h: await bcrypt.hash(req.body.password, BCRYPT_COST) });
        user = { id };
      } else if (!(await bcrypt.compare(String(req.body.password ?? ''), user.password_hash))) {
        return res.status(401).json({ error: 'You already have an account. Enter that password to accept.' });
      }
      await db.tx(async (t) => {
        await t.query('INSERT INTO memberships (organization_id, user_id, role) VALUES (:o, :u, :r) ON DUPLICATE KEY UPDATE role = VALUES(role)', { o: tok.organization_id, u: user.id, r: tok.role });
        await t.query('UPDATE tokens SET used_at = UTC_TIMESTAMP() WHERE token_hash = :h', { h: tok.token_hash });
      });
      await createSession(db, cfg, res, user.id, tok.organization_id, req.headers['user-agent']);
      await audit(db, { orgId: tok.organization_id, userId: user.id, action: 'member.join', detail: { role: tok.role }, ip: req.ip });
      res.json({ ok: true });
    } catch (e) {
      next(e);
    }
  });

  r.get('/invite/:token', async (req, res, next) => {
    try {
      const tok = await db.one(
        "SELECT t.email, t.role, o.name AS org FROM tokens t JOIN organizations o ON o.id = t.organization_id WHERE t.token_hash = :h AND t.kind = 'invite' AND t.used_at IS NULL AND t.expires_at > UTC_TIMESTAMP()",
        { h: sha256(str(req.params.token, 200)) },
      );
      if (!tok) return res.status(404).json({ error: 'This invitation is invalid or has expired.' });
      const existing = await db.one('SELECT id FROM users WHERE email = :e', { e: tok.email });
      res.json({ email: tok.email, role: tok.role, roleLabel: ROLES[tok.role]?.label, organization: tok.org, hasAccount: Boolean(existing) });
    } catch (e) {
      next(e);
    }
  });

  return r;
}
