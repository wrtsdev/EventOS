// WRTS Master Administration Center API (EventOS 1.0 directive, sections 4-6).
//
// Access: active platform administrators who have signed in with two-step
// verification. Everyone else gets a plain 404 (the routes don't advertise
// themselves). Approving accounts, granting administrator rights and the data
// inventory are master-administrator only. Nobody can change the master
// administrator's account through the API.
//
// Proprietary and confidential. © We Run These Streetz LLC.

import { Router } from 'express';
import { audit } from './audit.js';
import { newId, randomToken, sha256, EMAIL_RE, str } from './security.js';
import { ROLES } from '../src/domain/access.js';
import { ACCOUNT_STATES, REQUESTED_ROLES } from './governance.js';
import { SAMPLE_ORGS, SAMPLE_EVENTS, SAMPLE_SNAPSHOTS } from '../src/data/sampleData.js';

const TIERS = ['community', 'pro', 'enterprise'];
const INVITE_DAYS = 14;
const INFO_DAYS = 14;

function wrap(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}
const num = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, v == null ? v : Number(v)]));

export function platformRouter(db, cfg, outbox) {
  const r = Router();

  // Gate 1: platform administrator. Gate 2: two-step verification on this session.
  r.use((req, res, next) => {
    if (!req.user?.isPlatformAdmin) return res.status(404).json({ error: 'Not found.' });
    if (!req.user.mfaEnabled) return res.status(403).json({ error: 'Turn on two-step verification to use the admin center.', code: 'mfa_enrollment_required' });
    if (!req.user.mfaVerified) return res.status(403).json({ error: 'Sign in again with two-step verification to use the admin center.', code: 'mfa_required' });
    next();
  });
  const masterOnly = (req, res, next) => (req.user.isMaster ? next() : res.status(403).json({ error: 'Only the master administrator can do this.' }));

  async function ownerInvite({ orgId, orgName, email, by }) {
    const token = randomToken();
    await db.query(
      "INSERT INTO tokens (token_hash, kind, email, organization_id, role, created_by, expires_at) VALUES (:h, 'invite', :e, :o, 'owner', :u, DATE_ADD(UTC_TIMESTAMP(), INTERVAL :d DAY))",
      { h: sha256(token), e: email, o: orgId, u: by.id, d: INVITE_DAYS },
    );
    const link = `${cfg.publicUrl}/#invite=${token}`;
    await outbox.queue({
      kind: 'platform.owner_invite',
      to: email,
      subject: `Your EventOS organization is ready: ${orgName}`,
      body: `We Run These Streetz set up ${orgName} on EventOS for you, with you as the owner.\n\nChoose your password and sign in here (valid for ${INVITE_DAYS} days):\n${link}\n\nQuestions? Reply to this email.`,
      relatedEntity: 'organization',
      relatedId: orgId,
    });
    return { link, emailConfigured: cfg.mailConfigured };
  }

  // ----- Executive overview -------------------------------------------------

  r.get('/summary', wrap(async (req, res) => {
    const row = await db.one(
      `SELECT (SELECT COUNT(*) FROM organizations) AS orgs,
              (SELECT COUNT(*) FROM users) AS users,
              (SELECT COUNT(*) FROM users WHERE status = 'active') AS activeAccounts,
              (SELECT COUNT(*) FROM users WHERE status = 'suspended') AS suspendedAccounts,
              (SELECT COUNT(*) FROM account_requests WHERE status = 'pending_approval') AS pendingRequests,
              (SELECT COUNT(*) FROM account_requests WHERE status = 'info_required') AS infoRequired,
              (SELECT COUNT(*) FROM events) AS events,
              (SELECT COUNT(*) FROM events WHERE is_public = 1 AND status = 'active') AS publishedEvents,
              (SELECT COUNT(*) FROM registrations) AS registrations,
              (SELECT COUNT(*) FROM email_outbox WHERE status = 'failed') AS emailFailed,
              (SELECT COUNT(*) FROM email_outbox WHERE status IN ('queued', 'sending')) AS emailQueued,
              (SELECT COUNT(*) FROM integrations) AS integrationsConnected,
              (SELECT COUNT(*) FROM audit_log WHERE action IN ('auth.login_failed', 'auth.mfa_failed') AND created_at > DATE_SUB(UTC_TIMESTAMP(), INTERVAL 1 DAY)) AS failedSignIns24h,
              (SELECT COUNT(*) FROM organizations WHERE created_at > DATE_SUB(UTC_TIMESTAMP(), INTERVAL 30 DAY)) AS newOrgs30d`,
    );
    res.json({ ...num(row), emailConfigured: cfg.mailConfigured, demoEnabled: cfg.demoEnabled });
  }));

  // ----- Account requests ---------------------------------------------------

  r.get('/requests', wrap(async (req, res) => {
    const status = str(req.query.status, 30) || 'open';
    const where = status === 'open' ? "r.status IN ('pending_approval', 'info_required')" : status === 'all' ? '1 = 1' : 'r.status = :s';
    const rows = await db.query(
      `SELECT r.id, r.source, r.email, r.first_name AS firstName, r.last_name AS lastName, r.organization_name AS organizationName,
              r.organization_type AS organizationType, r.requested_role AS requestedRole, r.primary_pillar AS primaryPillar,
              r.status, r.submitted_at AS submittedAt, r.reviewed_at AS reviewedAt, r.created_at AS createdAt, u.status AS accountStatus
         FROM account_requests r JOIN users u ON u.id = r.user_id
        WHERE ${where} ORDER BY COALESCE(r.submitted_at, r.created_at) DESC LIMIT 500`,
      { s: status },
    );
    res.json({ requests: rows, states: ACCOUNT_STATES, requestedRoles: REQUESTED_ROLES });
  }));

  r.get('/requests/:id', wrap(async (req, res) => {
    const row = await db.one('SELECT * FROM account_requests WHERE id = :id', { id: req.params.id });
    if (!row) return res.status(404).json({ error: 'Request not found.' });
    const user = await db.one('SELECT id, email, display_name AS name, status, email_verified_at AS emailVerifiedAt, created_at AS createdAt FROM users WHERE id = :u', { u: row.user_id });
    const memberships = await db.query('SELECT o.id, o.name, m.role FROM memberships m JOIN organizations o ON o.id = m.organization_id WHERE m.user_id = :u', { u: row.user_id });
    const history = await db.query("SELECT action, detail, created_at AS at FROM audit_log WHERE user_id = :u OR entity_id = :id ORDER BY id DESC LIMIT 50", { u: row.user_id, id: row.id });
    const inviteOrg = row.invite_organization_id ? await db.one('SELECT id, name FROM organizations WHERE id = :o', { o: row.invite_organization_id }) : null;
    res.json({
      request: {
        id: row.id, source: row.source, email: row.email, firstName: row.first_name, lastName: row.last_name,
        organizationName: row.organization_name, organizationType: row.organization_type, requestedRole: row.requested_role,
        intendedUse: row.intended_use, primaryPillar: row.primary_pillar, phone: row.phone, website: row.website,
        termsVersion: row.terms_version, termsAcceptedAt: row.terms_accepted_at, status: row.status,
        submittedAt: row.submitted_at, reviewedAt: row.reviewed_at, decisionNote: row.decision_note,
        infoRequestNote: row.info_request_note, applicantResponse: row.applicant_response,
        inviteOrganization: inviteOrg, inviteRole: row.invite_role,
      },
      user, memberships, history,
    });
  }));

  async function loadOpenRequest(id) {
    const row = await db.one('SELECT * FROM account_requests WHERE id = :id', { id });
    if (!row) return { error: [404, 'Request not found.'] };
    if (!['pending_approval', 'info_required'].includes(row.status)) return { error: [409, `This request is already ${ACCOUNT_STATES[row.status]?.toLowerCase() ?? row.status}.`] };
    return { row };
  }

  /**
   * Approve: assigns an organization and role server-side. The applicant signs in
   * with the password they chose; their first sign-in makes the account active.
   * Never grants platform-administrator rights.
   */
  r.post('/requests/:id/approve', masterOnly, wrap(async (req, res) => {
    const { row, error } = await loadOpenRequest(req.params.id);
    if (error) return res.status(error[0]).json({ error: error[1] });
    const user = await db.one('SELECT * FROM users WHERE id = :u', { u: row.user_id });
    let orgId = null;
    let role = null;
    let orgName = null;

    if (row.source === 'legacy') {
      // Existing account: keep its organizations and roles as they were.
    } else {
      const mode = str(req.body.organization?.mode, 20) || (row.invite_organization_id ? 'existing' : 'new');
      role = str(req.body.role, 20) || row.invite_role || 'owner';
      if (!ROLES[role]) return res.status(400).json({ error: 'Choose a role.' });
      if (mode === 'existing') {
        orgId = str(req.body.organization?.id, 40) || row.invite_organization_id;
        const org = orgId ? await db.one('SELECT id, name FROM organizations WHERE id = :o', { o: orgId }) : null;
        if (!org) return res.status(400).json({ error: 'Choose an existing organization.' });
        orgName = org.name;
      } else if (mode === 'new') {
        orgName = str(req.body.organization?.name, 200) || row.organization_name;
        if (!orgName) return res.status(400).json({ error: 'Enter the new organization’s name.' });
        const tier = str(req.body.organization?.tier, 20) || 'pro';
        if (!TIERS.includes(tier)) return res.status(400).json({ error: 'Unknown plan.' });
        orgId = newId('org');
        const settings = { type: row.organization_type, coordinator: [row.first_name, row.last_name].filter(Boolean).join(' '), assistantEnabled: true, epicWeights: { E: 40, P: 20, I: 20, C: 20 }, eventsPerYear: 1, primaryPillar: row.primary_pillar };
        await db.query('INSERT INTO organizations (id, name, org_type, tier, settings) VALUES (:id, :n, :t, :tier, :s)', { id: orgId, n: orgName, t: row.organization_type, tier, s: JSON.stringify(settings) });
        await audit(db, { orgId, userId: req.user.id, action: 'platform.org_create', entity: 'organization', entityId: orgId, detail: { name: orgName, via: 'account approval' }, ip: req.ip });
      } else {
        return res.status(400).json({ error: 'Choose a new or existing organization.' });
      }
      await db.query('INSERT INTO memberships (organization_id, user_id, role) VALUES (:o, :u, :r) ON DUPLICATE KEY UPDATE role = VALUES(role)', { o: orgId, u: user.id, r: role });
    }
    const nextStatus = row.source === 'legacy' ? 'active' : 'approved';
    await db.query("UPDATE users SET status = :s, status_reason = NULL, status_changed_at = UTC_TIMESTAMP(), status_changed_by = :by WHERE id = :u", { s: nextStatus, by: req.user.id, u: user.id });
    await db.query(
      "UPDATE account_requests SET status = 'approved', reviewed_by = :by, reviewed_at = UTC_TIMESTAMP(), decision_note = :n, assigned_organization_id = :o, assigned_role = :r WHERE id = :id",
      { by: req.user.id, n: str(req.body.note, 2000) || null, o: orgId, r: role, id: row.id },
    );
    await audit(db, { orgId, userId: req.user.id, action: 'account.approve', entity: 'user', entityId: user.id, detail: { requestId: row.id, source: row.source, role, organization: orgName }, ip: req.ip });
    await outbox.queue({
      kind: 'account.approved',
      to: user.email,
      subject: 'Your EventOS account is approved',
      body: `Good news: We Run These Streetz approved your EventOS account${orgName ? ` for ${orgName} (${ROLES[role].label})` : ''}.\n\nSign in with the email and password you chose:\n${cfg.publicUrl}/\n\nWelcome to EventOS.`,
      dedupeKey: `approved:${row.id}`,
      relatedEntity: 'account_request',
      relatedId: row.id,
    });
    res.json({ ok: true, status: nextStatus, organizationId: orgId });
  }));

  r.post('/requests/:id/deny', masterOnly, wrap(async (req, res) => {
    const { row, error } = await loadOpenRequest(req.params.id);
    if (error) return res.status(error[0]).json({ error: error[1] });
    const note = str(req.body.note, 2000);
    await db.query("UPDATE users SET status = 'denied', status_reason = :n, status_changed_at = UTC_TIMESTAMP(), status_changed_by = :by WHERE id = :u", { n: note || null, by: req.user.id, u: row.user_id });
    await db.query("UPDATE account_requests SET status = 'denied', reviewed_by = :by, reviewed_at = UTC_TIMESTAMP(), decision_note = :n WHERE id = :id", { by: req.user.id, n: note || null, id: row.id });
    await db.query('DELETE FROM sessions WHERE user_id = :u', { u: row.user_id });
    await audit(db, { userId: req.user.id, action: 'account.deny', entity: 'user', entityId: row.user_id, detail: { requestId: row.id }, ip: req.ip });
    if (req.body.notify !== false) {
      await outbox.queue({
        kind: 'account.denied',
        to: row.email,
        subject: 'About your EventOS account request',
        body: `Thank you for your interest in EventOS. We aren't able to approve your account request right now.${note ? `\n\nNote from We Run These Streetz:\n${note}` : ''}\n\nQuestions? Contact sales@werunthesestreetz.com.`,
        dedupeKey: `denied:${row.id}`,
        relatedEntity: 'account_request',
        relatedId: row.id,
      });
    }
    res.json({ ok: true });
  }));

  r.post('/requests/:id/request-info', masterOnly, wrap(async (req, res) => {
    const { row, error } = await loadOpenRequest(req.params.id);
    if (error) return res.status(error[0]).json({ error: error[1] });
    const note = str(req.body.note, 2000);
    if (!note) return res.status(400).json({ error: 'Write what you need to know.' });
    const token = randomToken();
    await db.query("INSERT INTO tokens (token_hash, kind, email, expires_at) VALUES (:h, 'reqinfo', :e, DATE_ADD(UTC_TIMESTAMP(), INTERVAL :d DAY))", { h: sha256(token), e: row.email, d: INFO_DAYS });
    await db.query("UPDATE users SET status = 'info_required', status_changed_at = UTC_TIMESTAMP(), status_changed_by = :by WHERE id = :u", { by: req.user.id, u: row.user_id });
    await db.query("UPDATE account_requests SET status = 'info_required', info_request_note = :n, applicant_response = NULL WHERE id = :id", { n: note, id: row.id });
    await audit(db, { userId: req.user.id, action: 'account.request_info', entity: 'user', entityId: row.user_id, detail: { requestId: row.id }, ip: req.ip });
    await outbox.queue({
      kind: 'account.info_required',
      to: row.email,
      subject: 'A question about your EventOS account request',
      body: `We Run These Streetz is reviewing your EventOS account request and has a question:\n\n${note}\n\nReply here (the link works for ${INFO_DAYS} days):\n${cfg.publicUrl}/#info=${token}`,
      relatedEntity: 'account_request',
      relatedId: row.id,
    });
    res.json({ ok: true });
  }));

  // ----- Accounts -----------------------------------------------------------

  r.get('/accounts', wrap(async (req, res) => {
    const q = str(req.query.q, 100).toLowerCase();
    const status = str(req.query.status, 30);
    const rows = await db.query(
      `SELECT u.id, u.email, u.display_name AS name, u.status, u.status_reason AS statusReason, u.is_master AS isMaster,
              u.is_platform_admin AS isPlatformAdmin, (u.mfa_enabled_at IS NOT NULL) AS mfaEnabled, u.last_login_at AS lastLoginAt,
              u.created_at AS createdAt,
              (SELECT GROUP_CONCAT(CONCAT(o.name, ' (', m.role, ')') SEPARATOR ', ') FROM memberships m JOIN organizations o ON o.id = m.organization_id WHERE m.user_id = u.id) AS organizations,
              (SELECT COUNT(*) FROM sessions s WHERE s.user_id = u.id AND s.expires_at > UTC_TIMESTAMP()) AS activeSessions
         FROM users u
        WHERE (:q = '' OR LOWER(u.email) LIKE CONCAT('%', :q, '%') OR LOWER(u.display_name) LIKE CONCAT('%', :q, '%'))
          AND (:s = '' OR u.status = :s)
        ORDER BY u.created_at DESC LIMIT 500`,
      { q, s: status },
    );
    res.json({ accounts: rows.map((a) => ({ ...a, isMaster: Boolean(a.isMaster), isPlatformAdmin: Boolean(a.isPlatformAdmin), mfaEnabled: Boolean(a.mfaEnabled), activeSessions: Number(a.activeSessions) })), states: ACCOUNT_STATES });
  }));

  /** Loads a target account and enforces who may manage it. */
  async function manageable(req, res) {
    const target = await db.one('SELECT * FROM users WHERE id = :id', { id: req.params.id });
    if (!target) return res.status(404).json({ error: 'Account not found.' }), null;
    if (target.is_master) return res.status(403).json({ error: 'The master administrator account can’t be changed here. See the owner recovery procedure.' }), null;
    if (target.is_platform_admin && !req.user.isMaster) return res.status(403).json({ error: 'Only the master administrator can manage other administrators.' }), null;
    return target;
  }

  const STATUS_CHANGES = { suspended: 'account.suspend', deactivated: 'account.deactivate', archived: 'account.archive', active: 'account.reactivate' };
  r.post('/accounts/:id/status', wrap(async (req, res) => {
    const target = await manageable(req, res);
    if (!target) return;
    const status = str(req.body.status, 30);
    if (!STATUS_CHANGES[status]) return res.status(400).json({ error: 'Choose suspend, deactivate, archive or reactivate.' });
    if (status === 'active' && !['suspended', 'deactivated', 'archived'].includes(target.status)) return res.status(409).json({ error: 'Only suspended, deactivated or archived accounts can be reactivated. Use the request queue for new accounts.' });
    const reason = str(req.body.reason, 500);
    await db.query('UPDATE users SET status = :s, status_reason = :r, status_changed_at = UTC_TIMESTAMP(), status_changed_by = :by WHERE id = :id', { s: status, r: reason || null, by: req.user.id, id: target.id });
    if (status !== 'active') await db.query('DELETE FROM sessions WHERE user_id = :u', { u: target.id });
    await audit(db, { userId: req.user.id, action: STATUS_CHANGES[status], entity: 'user', entityId: target.id, detail: { from: target.status, to: status, reason }, ip: req.ip });
    res.json({ ok: true });
  }));

  r.post('/accounts/:id/sessions/revoke', wrap(async (req, res) => {
    const target = await manageable(req, res);
    if (!target) return;
    const result = await db.query('DELETE FROM sessions WHERE user_id = :u', { u: target.id });
    await audit(db, { userId: req.user.id, action: 'account.sessions_revoked', entity: 'user', entityId: target.id, detail: { count: result?.affectedRows ?? 0 }, ip: req.ip });
    res.json({ ok: true, revoked: result?.affectedRows ?? 0 });
  }));

  /** Platform administrator rights: master only, active accounts only. They must set up two-step verification to use them. */
  r.post('/accounts/:id/platform-admin', masterOnly, wrap(async (req, res) => {
    const target = await manageable(req, res);
    if (!target) return;
    const enabled = req.body.enabled === true;
    if (enabled && target.status !== 'active') return res.status(409).json({ error: 'Only active accounts can be administrators.' });
    await db.query('UPDATE users SET is_platform_admin = :a WHERE id = :id', { a: enabled ? 1 : 0, id: target.id });
    await db.query('DELETE FROM sessions WHERE user_id = :u', { u: target.id }); // new rights apply at next sign-in
    await audit(db, { userId: req.user.id, action: enabled ? 'platform.admin_grant' : 'platform.admin_revoke', entity: 'user', entityId: target.id, ip: req.ip });
    res.json({ ok: true });
  }));

  // ----- Organizations ------------------------------------------------------

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

  // Create an organization for a customer and send its owner a set-up link (pre-approved: sent by an administrator).
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
    const invite = await ownerInvite({ orgId, orgName: name, email, by: req.user });
    await audit(db, { orgId, userId: req.user.id, action: 'platform.org_create', entity: 'organization', entityId: orgId, detail: { name, ownerEmail: email, tier }, ip: req.ip });
    res.status(201).json({ ok: true, org: { id: orgId, name, tier }, ...invite });
  }));

  r.get('/orgs/:id', wrap(async (req, res) => {
    const org = await db.one('SELECT id, name, org_type AS orgType, tier, created_at AS createdAt FROM organizations WHERE id = :id', { id: req.params.id });
    if (!org) return res.status(404).json({ error: 'Organization not found.' });
    const members = await db.query(
      'SELECT u.id, u.email, u.display_name AS name, u.status, m.role, m.created_at AS joinedAt FROM memberships m JOIN users u ON u.id = m.user_id WHERE m.organization_id = :o ORDER BY m.created_at',
      { o: org.id },
    );
    const invites = await db.query(
      "SELECT email, role, expires_at AS expiresAt FROM tokens WHERE organization_id = :o AND kind = 'invite' AND used_at IS NULL AND expires_at > UTC_TIMESTAMP() ORDER BY created_at DESC",
      { o: org.id },
    );
    res.json({ org, members, invites });
  }));

  r.post('/orgs/:id/owner-invite', wrap(async (req, res) => {
    const org = await db.one('SELECT id, name FROM organizations WHERE id = :id', { id: req.params.id });
    if (!org) return res.status(404).json({ error: 'Organization not found.' });
    const email = str(req.body.email, 254).toLowerCase();
    if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'Enter a valid email address.' });
    const invite = await ownerInvite({ orgId: org.id, orgName: org.name, email, by: req.user });
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

  // ----- Email delivery -----------------------------------------------------

  r.get('/emails', wrap(async (req, res) => {
    const status = str(req.query.status, 20);
    const rows = await db.query(
      `SELECT id, kind, to_email AS \`to\`, subject, status, attempts, last_error AS lastError, next_attempt_at AS nextAttemptAt, sent_at AS sentAt, created_at AS createdAt
         FROM email_outbox WHERE (:s = '' OR status = :s) ORDER BY created_at DESC LIMIT 200`,
      { s: status },
    );
    res.json({ emails: rows, emailConfigured: cfg.mailConfigured });
  }));

  r.post('/emails/:id/retry', wrap(async (req, res) => {
    const result = await db.query("UPDATE email_outbox SET status = 'queued', next_attempt_at = UTC_TIMESTAMP() WHERE id = :id AND status IN ('failed', 'queued')", { id: req.params.id });
    if (!result?.affectedRows) return res.status(404).json({ error: 'Email not found or already sent.' });
    await audit(db, { userId: req.user.id, action: 'platform.email_retry', entity: 'email', entityId: req.params.id, ip: req.ip });
    await outbox.kick();
    res.json({ ok: true });
  }));

  // ----- Platform activity (read-only; nothing in the API edits audit records) ----

  r.get('/audit', wrap(async (req, res) => {
    const rows = await db.query(
      `SELECT a.id, a.action, a.entity, a.entity_id AS entityId, a.detail, a.ip, a.created_at AS at, u.email AS actor, o.name AS organization
         FROM audit_log a LEFT JOIN users u ON u.id = a.user_id LEFT JOIN organizations o ON o.id = a.organization_id
        WHERE (:p = '' OR a.action LIKE CONCAT(:p, '%')) ORDER BY a.id DESC LIMIT 300`,
      { p: str(req.query.prefix, 40) },
    );
    res.json({ entries: rows.map((e) => ({ ...e, detail: e.detail ? JSON.parse(e.detail) : null })) });
  }));

  // ----- Production data inventory (read-only; nothing is deleted) ------------

  r.get('/data-inventory', masterOnly, wrap(async (req, res) => {
    const sampleOrgNames = new Set(SAMPLE_ORGS.map((o) => o.name.toLowerCase()));
    const sampleEventNames = new Set([...SAMPLE_EVENTS, ...SAMPLE_SNAPSHOTS].map((e) => e.name.toLowerCase()));
    const testEmail = /@(example\.(com|org|net)|test|invalid|localhost)$|^(test|demo|sample)[^@]*@/i;
    const testName = /\b(test|demo|sample|dummy|fake|lorem)\b/i;

    const counts = num(await db.one(
      `SELECT (SELECT COUNT(*) FROM users) AS users, (SELECT COUNT(*) FROM organizations) AS organizations, (SELECT COUNT(*) FROM memberships) AS memberships,
              (SELECT COUNT(*) FROM events) AS events, (SELECT COUNT(*) FROM registrations) AS registrations, (SELECT COUNT(*) FROM integrations) AS integrations,
              (SELECT COUNT(*) FROM audit_log) AS auditEntries, (SELECT COUNT(*) FROM account_requests) AS accountRequests`,
    ));
    const users = await db.query('SELECT id, email, display_name AS name, status, is_master AS isMaster, created_at AS createdAt FROM users ORDER BY created_at');
    const orgs = await db.query(
      `SELECT o.id, o.name, o.created_at AS createdAt, (SELECT COUNT(*) FROM events e WHERE e.organization_id = o.id) AS events,
              (SELECT COUNT(*) FROM registrations g WHERE g.organization_id = o.id) AS registrations,
              (SELECT COUNT(*) FROM memberships m WHERE m.organization_id = o.id) AS members FROM organizations o ORDER BY o.created_at`,
    );
    const events = await db.query(
      `SELECT e.id, e.name, e.organization_id AS organizationId, e.is_public AS isPublic, e.created_at AS createdAt,
              (SELECT COUNT(*) FROM registrations g WHERE g.event_id = e.id) AS registrations FROM events e ORDER BY e.created_at`,
    );
    const regs = await db.query("SELECT id, event_id AS eventId, email, created_at AS createdAt FROM registrations WHERE email REGEXP '@(example\\\\.(com|org|net)|test|invalid|localhost)$'");
    const flag = (reasons) => (reasons.length ? { classification: 'likely synthetic', reasons } : { classification: 'unclassified: review', reasons: [] });
    const report = {
      generatedAt: new Date().toISOString(),
      policy: 'Read-only inventory. Nothing has been deleted or changed. Records are classified by simple rules for review; "unclassified" means authenticity could not be established automatically.',
      counts,
      users: users.map((u) => (u.isMaster ? { ...u, isMaster: true, classification: 'retain: master administrator', reasons: [] } : { ...u, isMaster: false, ...flag([testEmail.test(u.email) && 'test-style email domain', testName.test(u.name || '') && 'test-style name'].filter(Boolean)) })),
      organizations: orgs.map((o) => ({ ...num({ events: o.events, registrations: o.registrations, members: o.members }), id: o.id, name: o.name, createdAt: o.createdAt, ...flag([sampleOrgNames.has(o.name.toLowerCase()) && 'matches a demo organization name', testName.test(o.name) && 'test-style name'].filter(Boolean)) })),
      events: events.map((e) => ({ id: e.id, name: e.name, organizationId: e.organizationId, isPublic: Boolean(e.isPublic), registrations: Number(e.registrations), createdAt: e.createdAt, ...flag([sampleEventNames.has(e.name.toLowerCase()) && 'matches a demo event name', testName.test(e.name) && 'test-style name'].filter(Boolean)) })),
      registrationsWithTestEmails: regs,
    };
    await audit(db, { userId: req.user.id, action: 'platform.data_inventory', ip: req.ip });
    res.json(report);
  }));

  return r;
}
