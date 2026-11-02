import { Router } from 'express';
import { can, ROLES, hasFeature } from '../src/domain/access.js';
import { checkPatch, mergeIncidents, redactEventForRole } from '../src/domain/eventPolicy.js';
import { requireOrg } from './auth.js';
import { events, orgs, snapshots } from './repo.js';
import { audit } from './audit.js';
import { randomToken, sha256, EMAIL_RE, str } from './security.js';

const deny = (res, msg = 'Your role cannot do this.') => res.status(403).json({ error: msg });
const need = (perm) => (req, res, next) => (can(req.session.role, perm) ? next() : deny(res));
const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);

/** Fields of an event a new-event request may set. */
const CREATE_KEYS = ['name', 'typeId', 'format', 'purpose', 'purposeOther', 'fourWs', 'primaryW', 'audience', 'date', 'location', 'expected', 'cap', 'price', 'visibility', 'description', 'organization', 'cause', 'contact', 'features', 'programming', 'communityPartners', 'revenueGoal', 'budgetGoal', 'outcomes', 'templateId', 'phase', 'status', 'checklist', 'sponsors', 'seriesId', 'priorEventId', 'budget', 'risks', 'carryOver'];

export function apiRouter(db, cfg, mailer) {
  const r = Router();
  r.use(requireOrg);

  // ---------- Organization ----------
  r.get('/org', wrap(async (req, res) => {
    const org = await orgs.get(db, req.session.orgId);
    res.json({ org, role: req.session.role, roleLabel: ROLES[req.session.role]?.label, permissions: ROLES[req.session.role]?.perms ?? [] });
  }));

  r.patch('/org', wrap(async (req, res) => {
    const patch = {};
    const org = await orgs.get(db, req.session.orgId);
    if ('assistantEnabled' in req.body) {
      if (!can(req.session.role, 'org.admin')) return deny(res);
      patch.assistantEnabled = Boolean(req.body.assistantEnabled);
    }
    if ('coordinator' in req.body || 'eventsPerYear' in req.body) {
      if (!can(req.session.role, 'org.admin')) return deny(res);
      if ('coordinator' in req.body) patch.coordinator = str(req.body.coordinator, 120);
      if ('eventsPerYear' in req.body) patch.eventsPerYear = Math.max(1, Math.min(200, Number(req.body.eventsPerYear) || 1));
    }
    if ('epicWeights' in req.body) {
      if (!can(req.session.role, 'epic.configure')) return deny(res);
      if (!hasFeature(org.tier, 'epicConfig')) return deny(res, 'Custom EPIC weights are part of EventOS Enterprise.');
      const w = req.body.epicWeights ?? {};
      const vals = ['E', 'P', 'I', 'C'].map((k) => Number(w[k]));
      if (vals.some((v) => !Number.isFinite(v) || v < 0) || vals.reduce((a, b) => a + b, 0) !== 100) return res.status(400).json({ error: 'Weights must be zero or more and total 100.' });
      patch.epicWeights = { E: vals[0], P: vals[1], I: vals[2], C: vals[3] };
      patch.epicWeightsChangedBy = req.user.name || req.user.email;
      patch.epicWeightsChangedAt = new Date().toISOString();
    }
    if (!Object.keys(patch).length) return res.status(400).json({ error: 'Nothing to change.' });
    await orgs.updateSettings(db, req.session.orgId, patch);
    await audit(db, { orgId: req.session.orgId, userId: req.user.id, action: 'org.update', detail: Object.keys(patch), ip: req.ip });
    res.json({ org: await orgs.get(db, req.session.orgId) });
  }));

  // ---------- Members and invitations ----------
  r.get('/members', wrap(async (req, res) => {
    if (!can(req.session.role, 'org.admin') && req.session.role !== 'coordinator') return deny(res);
    const members = await db.query('SELECT u.id, u.email, u.display_name AS name, m.role, m.created_at AS joinedAt FROM memberships m JOIN users u ON u.id = m.user_id WHERE m.organization_id = :o ORDER BY m.created_at', { o: req.session.orgId });
    const invites = await db.query("SELECT email, role, expires_at AS expiresAt FROM tokens WHERE kind = 'invite' AND organization_id = :o AND used_at IS NULL AND expires_at > UTC_TIMESTAMP()", { o: req.session.orgId });
    res.json({ members, invites });
  }));

  r.post('/members/invite', need('org.admin'), wrap(async (req, res) => {
    const email = str(req.body.email, 254).toLowerCase();
    const role = str(req.body.role, 20);
    if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'Enter a valid email address.' });
    if (!ROLES[role]) return res.status(400).json({ error: 'Choose a role.' });
    const org = await orgs.get(db, req.session.orgId);
    const token = randomToken();
    await db.query("INSERT INTO tokens (token_hash, kind, email, organization_id, role, created_by, expires_at) VALUES (:h, 'invite', :e, :o, :r, :u, DATE_ADD(UTC_TIMESTAMP(), INTERVAL 7 DAY))", { h: sha256(token), e: email, o: req.session.orgId, r: role, u: req.user.id });
    const link = `${cfg.publicUrl}/#invite=${token}`;
    const sent = await mailer.send({ to: email, subject: `You're invited to ${org.name} on EventOS`, text: `${req.user.name || req.user.email} invited you to join ${org.name} on EventOS as ${ROLES[role].label}.\n\nAccept here (valid for 7 days):\n${link}` });
    await audit(db, { orgId: req.session.orgId, userId: req.user.id, action: 'member.invite', detail: { email, role }, ip: req.ip });
    // When email is not configured the owner gets the link to pass on themselves.
    res.status(201).json({ ok: true, emailed: sent.queued, link: sent.queued ? undefined : link });
  }));

  r.patch('/members/:userId', need('org.admin'), wrap(async (req, res) => {
    const role = str(req.body.role, 20);
    if (!ROLES[role]) return res.status(400).json({ error: 'Choose a role.' });
    const target = await db.one('SELECT role FROM memberships WHERE organization_id = :o AND user_id = :u', { o: req.session.orgId, u: req.params.userId });
    if (!target) return res.status(404).json({ error: 'Member not found.' });
    if (target.role === 'owner' && role !== 'owner') {
      const owners = await db.one("SELECT COUNT(*) AS n FROM memberships WHERE organization_id = :o AND role = 'owner'", { o: req.session.orgId });
      if (owners.n <= 1) return res.status(400).json({ error: 'An organization needs at least one owner.' });
    }
    await db.query('UPDATE memberships SET role = :r WHERE organization_id = :o AND user_id = :u', { r: role, o: req.session.orgId, u: req.params.userId });
    await audit(db, { orgId: req.session.orgId, userId: req.user.id, action: 'member.role', entityId: req.params.userId, detail: { role }, ip: req.ip });
    res.json({ ok: true });
  }));

  r.delete('/members/:userId', need('org.admin'), wrap(async (req, res) => {
    const target = await db.one('SELECT role FROM memberships WHERE organization_id = :o AND user_id = :u', { o: req.session.orgId, u: req.params.userId });
    if (!target) return res.status(404).json({ error: 'Member not found.' });
    if (target.role === 'owner') {
      const owners = await db.one("SELECT COUNT(*) AS n FROM memberships WHERE organization_id = :o AND role = 'owner'", { o: req.session.orgId });
      if (owners.n <= 1) return res.status(400).json({ error: 'An organization needs at least one owner.' });
    }
    await db.query('DELETE FROM memberships WHERE organization_id = :o AND user_id = :u', { o: req.session.orgId, u: req.params.userId });
    await db.query('DELETE FROM sessions WHERE user_id = :u AND organization_id = :o', { u: req.params.userId, o: req.session.orgId });
    await audit(db, { orgId: req.session.orgId, userId: req.user.id, action: 'member.remove', entityId: req.params.userId, ip: req.ip });
    res.json({ ok: true });
  }));

  r.get('/audit', need('org.admin'), wrap(async (req, res) => {
    const rows = await db.query('SELECT a.id, a.action, a.entity, a.entity_id AS entityId, a.detail, a.created_at AS at, u.email FROM audit_log a LEFT JOIN users u ON u.id = a.user_id WHERE a.organization_id = :o ORDER BY a.id DESC LIMIT 200', { o: req.session.orgId });
    res.json({ entries: rows });
  }));

  // ---------- Events ----------
  r.get('/events', wrap(async (req, res) => {
    const list = await events.list(db, req.session.orgId);
    res.json({ events: list.map((e) => redactEventForRole(e, req.session.role)) });
  }));

  r.get('/events/:id', wrap(async (req, res) => {
    const e = await events.get(db, req.session.orgId, req.params.id);
    if (!e) return res.status(404).json({ error: 'Event not found.' });
    res.json({ event: redactEventForRole(e, req.session.role) });
  }));

  r.post('/events', need('event.edit'), wrap(async (req, res) => {
    const input = Object.fromEntries(CREATE_KEYS.filter((k) => k in (req.body ?? {})).map((k) => [k, req.body[k]]));
    if (!str(input.name)) return res.status(400).json({ error: 'Give the event a name.' });
    if (input.budget && !can(req.session.role, 'finance.edit')) delete input.budget;
    const org = await orgs.get(db, req.session.orgId);
    if (!str(input.organization)) input.organization = org?.name ?? '';
    const e = await events.create(db, req.session.orgId, req.user.id, { status: 'active', phase: 'planning', checklist: {}, ...input });
    await audit(db, { orgId: req.session.orgId, userId: req.user.id, action: 'event.create', entity: 'event', entityId: e.id, ip: req.ip });
    res.status(201).json({ event: redactEventForRole(e, req.session.role) });
  }));

  r.patch('/events/:id', wrap(async (req, res) => {
    const current = await events.get(db, req.session.orgId, req.params.id);
    if (!current) return res.status(404).json({ error: 'Event not found.' });
    const patch = req.body?.patch ?? {};
    if (typeof patch !== 'object' || Array.isArray(patch)) return res.status(400).json({ error: 'Invalid change.' });
    const check = checkPatch(req.session.role, current, patch);
    if (!check.ok) return deny(res, check.error);
    if (Number(req.body.version) !== current.version) return res.status(409).json({ error: 'Someone else changed this event. Showing the latest version.', event: redactEventForRole(current, req.session.role) });
    const next = { ...current };
    for (const [k, v] of Object.entries(patch)) {
      if (k === 'incidents') next.incidents = mergeIncidents(current.incidents ?? [], v ?? []);
      else if (v === null) delete next[k];
      else next[k] = v;
    }
    if ('isPublic' in patch && !can(req.session.role, 'event.edit')) return deny(res);
    const saved = await events.save(db, req.session.orgId, next, current.version);
    if (!saved) return res.status(409).json({ error: 'Someone else changed this event. Reload to see the latest.' });
    await audit(db, { orgId: req.session.orgId, userId: req.user.id, action: 'event.update', entity: 'event', entityId: current.id, detail: Object.keys(patch), ip: req.ip });
    res.json({ event: redactEventForRole(saved, req.session.role) });
  }));

  r.delete('/events/:id', need('org.admin'), wrap(async (req, res) => {
    const ok = await events.remove(db, req.session.orgId, req.params.id);
    if (!ok) return res.status(404).json({ error: 'Event not found.' });
    await audit(db, { orgId: req.session.orgId, userId: req.user.id, action: 'event.delete', entity: 'event', entityId: req.params.id, ip: req.ip });
    res.json({ ok: true });
  }));

  // ---------- Snapshots ----------
  r.get('/snapshots', wrap(async (req, res) => res.json({ snapshots: await snapshots.list(db, req.session.orgId) })));
  r.post('/snapshots', need('event.edit'), wrap(async (req, res) => {
    await snapshots.upsert(db, req.session.orgId, req.body ?? {});
    res.status(201).json({ ok: true });
  }));

  return r;
}

