// WRTS admin console: every organization on EventOS, their plans and owners.
// Only platform admins can reach it: users whose email is in PLATFORM_ADMIN_EMAILS,
// or who are flagged in the database. Everyone else gets a plain 404.

import { Router } from 'express';
import { audit } from './audit.js';
import { newId, randomToken, sha256, EMAIL_RE, str } from './security.js';

const TIERS = ['community', 'pro', 'enterprise'];
const INVITE_DAYS = 14;

function wrap(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

async function ownerInvite(db, cfg, mailer, { orgId, orgName, email, by }) {
  const token = randomToken();
  await db.query(
    "INSERT INTO tokens (token_hash, kind, email, organization_id, role, created_by, expires_at) VALUES (:h, 'invite', :e, :o, 'owner', :u, DATE_ADD(UTC_TIMESTAMP(), INTERVAL :d DAY))",
    { h: sha256(token), e: email, o: orgId, u: by.id, d: INVITE_DAYS },
  );
  const link = `${cfg.publicUrl}/#invite=${token}`;
  const sent = await mailer.send({
    to: email,
    subject: `Your EventOS organization is ready: ${orgName}`,
    text: `We Run These Streetz set up ${orgName} on EventOS for you, with you as the owner.\n\nChoose your password and sign in here (valid for ${INVITE_DAYS} days):\n${link}\n\nQuestions? Reply to this email.`,
  });
  return { emailed: sent.queued, link: sent.queued ? undefined : link };
}

export function platformRouter(db, cfg, mailer) {
  const r = Router();
  r.use((req, res, next) => (req.user?.isPlatformAdmin ? next() : res.status(404).json({ error: 'Not found.' })));

  r.get('/summary', wrap(async (req, res) => {
    const row = await db.one(
      `SELECT (SELECT COUNT(*) FROM organizations) AS orgs,
              (SELECT COUNT(*) FROM users) AS users,
              (SELECT COUNT(*) FROM events) AS events,
              (SELECT COUNT(*) FROM registrations) AS registrations,
              (SELECT COUNT(*) FROM organizations WHERE created_at > DATE_SUB(UTC_TIMESTAMP(), INTERVAL 30 DAY)) AS newOrgs30d`,
    );
    res.json({ ...Object.fromEntries(Object.entries(row).map(([k, v]) => [k, Number(v)])), signupOpen: cfg.signupOpen });
  }));

  r.get('/orgs', wrap(async (req, res) => {
    const rows = await db.query(
      `SELECT o.id, o.name, o.org_type AS orgType, o.tier, o.created_at AS createdAt,
              (SELECT COUNT(*) FROM events e WHERE e.organization_id = o.id) AS events,
              (SELECT COUNT(*) FROM registrations g WHERE g.organization_id = o.id) AS registrations,
              (SELECT COUNT(*) FROM memberships m WHERE m.organization_id = o.id) AS members,
              (SELECT GROUP_CONCAT(u.email ORDER BY m.created_at SEPARATOR ', ') FROM memberships m JOIN users u ON u.id = m.user_id WHERE m.organization_id = o.id AND m.role = 'owner') AS owners,
              (SELECT GROUP_CONCAT(t.email SEPARATOR ', ') FROM tokens t WHERE t.organization_id = o.id AND t.kind = 'invite' AND t.role = 'owner' AND t.used_at IS NULL AND t.expires_at > UTC_TIMESTAMP()) AS pendingOwners
         FROM organizations o ORDER BY o.created_at DESC`,
    );
    res.json({ orgs: rows.map((o) => ({ ...o, events: Number(o.events), registrations: Number(o.registrations), members: Number(o.members) })) });
  }));

  // Create an organization for a customer and send its owner a set-up link.
  r.post('/orgs', wrap(async (req, res) => {
    const name = str(req.body.name, 200);
    const email = str(req.body.ownerEmail, 254).toLowerCase();
    const tier = str(req.body.tier, 20) || 'pro';
    const orgType = str(req.body.orgType, 80);
    if (!name) return res.status(400).json({ error: 'Enter the organization name.' });
    if (!EMAIL_RE.test(email)) return res.status(400).json({ error: "Enter the owner's email address." });
    if (!TIERS.includes(tier)) return res.status(400).json({ error: 'Unknown plan.' });
    const orgId = newId('org');
    const settings = { type: orgType, coordinator: str(req.body.ownerName, 200), assistantEnabled: true, epicWeights: { E: 40, P: 20, I: 20, C: 20 }, eventsPerYear: 1 };
    await db.query('INSERT INTO organizations (id, name, org_type, tier, settings) VALUES (:id, :n, :t, :tier, :s)', { id: orgId, n: name, t: orgType, tier, s: JSON.stringify(settings) });
    const invite = await ownerInvite(db, cfg, mailer, { orgId, orgName: name, email, by: req.user });
    await audit(db, { orgId, userId: req.user.id, action: 'platform.org_create', entity: 'organization', entityId: orgId, detail: { name, ownerEmail: email, tier }, ip: req.ip });
    res.status(201).json({ ok: true, org: { id: orgId, name, tier }, ...invite });
  }));

  r.get('/orgs/:id', wrap(async (req, res) => {
    const org = await db.one('SELECT id, name, org_type AS orgType, tier, created_at AS createdAt FROM organizations WHERE id = :id', { id: req.params.id });
    if (!org) return res.status(404).json({ error: 'Organization not found.' });
    const members = await db.query(
      'SELECT u.id, u.email, u.display_name AS name, m.role, m.created_at AS joinedAt FROM memberships m JOIN users u ON u.id = m.user_id WHERE m.organization_id = :o ORDER BY m.created_at',
      { o: org.id },
    );
    const invites = await db.query(
      "SELECT email, role, expires_at AS expiresAt FROM tokens WHERE organization_id = :o AND kind = 'invite' AND used_at IS NULL AND expires_at > UTC_TIMESTAMP() ORDER BY created_at DESC",
      { o: org.id },
    );
    res.json({ org, members, invites });
  }));

  // New owner set-up link (lost email, new owner, or the first link expired).
  r.post('/orgs/:id/owner-invite', wrap(async (req, res) => {
    const org = await db.one('SELECT id, name FROM organizations WHERE id = :id', { id: req.params.id });
    if (!org) return res.status(404).json({ error: 'Organization not found.' });
    const email = str(req.body.email, 254).toLowerCase();
    if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'Enter a valid email address.' });
    const invite = await ownerInvite(db, cfg, mailer, { orgId: org.id, orgName: org.name, email, by: req.user });
    await audit(db, { orgId: org.id, userId: req.user.id, action: 'platform.owner_invite', detail: { email }, ip: req.ip });
    res.status(201).json({ ok: true, ...invite });
  }));

  r.patch('/orgs/:id', wrap(async (req, res) => {
    const tier = str(req.body.tier, 20);
    if (!TIERS.includes(tier)) return res.status(400).json({ error: 'Unknown plan.' });
    const result = await db.query('UPDATE organizations SET tier = :t WHERE id = :id', { t: tier, id: req.params.id });
    if (result?.affectedRows === 0) return res.status(404).json({ error: 'Organization not found.' });
    await audit(db, { orgId: req.params.id, userId: req.user.id, action: 'platform.tier', detail: { tier }, ip: req.ip });
    res.json({ ok: true });
  }));

  return r;
}
