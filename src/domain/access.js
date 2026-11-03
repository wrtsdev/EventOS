// Roles, permissions, tenant isolation and plan entitlements.
//
// In this prototype the "server" is the repository layer below, running in the
// browser. Production must enforce the same rules on the server (row-level
// security by organization_id); client checks alone are not a security boundary.

export const PERMISSIONS = {
  'event.edit': 'Create and edit events',
  'finance.view': 'See budgets and financial details',
  'finance.edit': 'Edit budgets and approve them',
  'safety.edit': 'Edit risks, contacts and safety controls',
  'incidents.view': 'See incident details',
  'incidents.edit': 'Log and close incidents',
  'comms.approve': 'Approve messages before they are sent',
  'workforce.edit': 'Manage volunteers, staff and contractors',
  'partners.edit': 'Manage partners, sponsors and outcomes',
  'reports.view': 'See reports and scorecards',
  'participants.view': 'See participant names and contact details',
  'epic.configure': 'Change EPIC score weights',
  'org.admin': 'Manage users, plan and settings',
};

export const ROLES = {
  owner: { label: 'Organization owner', perms: Object.keys(PERMISSIONS) },
  coordinator: { label: 'Event coordinator', perms: ['event.edit', 'participants.view', 'finance.view', 'finance.edit', 'safety.edit', 'incidents.view', 'incidents.edit', 'comms.approve', 'workforce.edit', 'partners.edit', 'reports.view'] },
  finance: { label: 'Finance lead', perms: ['finance.view', 'finance.edit', 'reports.view'] },
  safety: { label: 'Safety lead', perms: ['safety.edit', 'incidents.view', 'incidents.edit', 'reports.view'] },
  volunteer: { label: 'Volunteer lead', perms: ['workforce.edit', 'reports.view'] },
  partner: { label: 'Partner or sponsor viewer', perms: ['reports.view'] },
};

export function can(role, perm) {
  return ROLES[role]?.perms.includes(perm) ?? false;
}

/** Incidents carry the most protection: details only for incident roles; minors always redacted for others. */
export function redactIncident(incident, role) {
  if (can(role, 'incidents.view')) {
    if (incident.involvesMinor && !['owner', 'safety'].includes(role)) {
      return { ...incident, summary: 'Involves a minor. Details visible to the owner and safety lead only.', actions: '', redacted: true };
    }
    return incident;
  }
  return { id: incident.id, time: incident.time, type: 'Restricted', severity: incident.severity, status: incident.status, summary: 'Restricted record.', actions: '', redacted: true };
}

// ---------- Tenancy ----------

/** Events visible to a session: only its own organization's. */
export function eventsForSession(db, session) {
  if (!session?.orgId) return [];
  return db.events.filter((e) => e.organizationId === session.orgId);
}

export function getEventForSession(db, session, eventId) {
  const e = db.events.find((x) => x.id === eventId);
  if (!e || e.organizationId !== session?.orgId) return null; // same answer for "missing" and "not yours"
  return e;
}

/** Guarded write: refuses cross-tenant writes and missing permissions. */
export function updateEventForSession(db, session, eventId, patch, perm = 'event.edit') {
  const e = getEventForSession(db, session, eventId);
  if (!e) return { ok: false, error: 'not-found', db };
  if (!can(session.role, perm)) return { ok: false, error: 'forbidden', db };
  if ('organizationId' in patch && patch.organizationId !== e.organizationId) return { ok: false, error: 'forbidden', db };
  return { ok: true, db: { ...db, events: db.events.map((x) => (x.id === eventId ? { ...x, ...patch } : x)) } };
}

export function snapshotsForSession(db, session) {
  return (db.snapshots ?? []).filter((s) => s.organizationId === session?.orgId);
}

// ---------- Entitlements ----------

export const FEATURES = {
  builder: 'community',
  registration: 'community',
  simpleBudget: 'community',
  safetyChecklist: 'community',
  fourWReporting: 'community',
  impactReport: 'community',
  passport: 'community',
  financeAdvanced: 'pro',
  sponsorOS: 'pro',
  workforce: 'pro',
  comms: 'pro',
  partners: 'pro',
  epicScorecard: 'pro',
  intelligence: 'pro',
  aar: 'pro',
  seriesTrends: 'enterprise',
  epicConfig: 'enterprise',
  userAdmin: 'enterprise',
  integrationsAdvanced: 'enterprise',
};

const RANK = { community: 0, pro: 1, enterprise: 2 };

export function hasFeature(tier, feature) {
  const need = FEATURES[feature];
  if (!need) return true;
  return (RANK[tier] ?? 0) >= RANK[need];
}

export function tierNeeded(feature) {
  return FEATURES[feature] ?? 'community';
}
