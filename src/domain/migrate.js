// Client-state schema versions. v1 (initial prototype) stored one org and its
// events; v2 adds organizations as tenants, a session (org + role), primary W,
// event status, and recorded snapshots. Migrations are pure and tested.

export const SCHEMA_VERSION = 2;

export function migrateEvent(e, orgId) {
  return {
    status: 'active',
    ...e,
    organizationId: e.organizationId ?? orgId,
    primaryW: e.primaryW ?? e.fourWs?.[0] ?? null,
    checklist: e.checklist ?? {},
  };
}

/** Accepts any saved shape and returns the current one, or null if unusable. */
export function migrateState(saved, defaults) {
  if (!saved || typeof saved !== 'object') return null;
  let s = saved;
  if (!s.schemaVersion || s.schemaVersion < 2) {
    const org = s.org ?? null;
    const orgId = org?.id ?? defaults.orgs[0].id;
    const orgs = org && !defaults.orgs.some((o) => o.id === org.id)
      ? [...defaults.orgs, { tier: 'pro', assistantEnabled: true, ...org }]
      : defaults.orgs;
    s = {
      schemaVersion: 2,
      orgs,
      session: org ? { orgId, role: 'owner' } : null,
      events: (s.events ?? defaults.events).map((e) => migrateEvent(e, orgId)),
      passport: s.passport ?? defaults.passport,
      snapshots: defaults.snapshots,
    };
  }
  if (s.schemaVersion > SCHEMA_VERSION) return null; // written by a newer app: don't guess
  return s;
}
