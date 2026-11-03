// Tenant-scoped data access. Every function takes the organization id from the
// authenticated session; none accepts it from request input.

import { newId } from './security.js';

const parse = (s, fallback) => {
  try {
    return s ? JSON.parse(s) : fallback;
  } catch {
    return fallback;
  }
};

export function rowToEvent(r) {
  if (!r) return null;
  return { ...parse(r.data, {}), id: r.id, organizationId: r.organization_id, slug: r.slug, version: r.version, isPublic: Boolean(r.is_public) };
}

function columns(e) {
  return {
    name: String(e.name ?? 'Untitled event').slice(0, 200),
    phase: ['planning', 'live', 'eventday', 'complete'].includes(e.phase) ? e.phase : 'planning',
    status: ['active', 'canceled', 'archived'].includes(e.status) ? e.status : 'active',
    starts_on: /^\d{4}-\d{2}-\d{2}$/.test(e.date ?? '') ? e.date : null,
    is_public: e.isPublic ? 1 : 0,
  };
}

function dataOf(e) {
  const { id, organizationId, slug, version, redactedKeys, ...rest } = e;
  return JSON.stringify(rest);
}

export function slugify(name) {
  const base = String(name || 'event').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'event';
  return `${base}-${Math.random().toString(36).slice(2, 7)}`;
}

export const events = {
  async list(db, orgId) {
    const rows = await db.query('SELECT * FROM events WHERE organization_id = :o ORDER BY starts_on IS NULL, starts_on DESC, created_at DESC', { o: orgId });
    return rows.map(rowToEvent);
  },
  async get(db, orgId, id) {
    return rowToEvent(await db.one('SELECT * FROM events WHERE id = :id AND organization_id = :o', { id, o: orgId }));
  },
  async create(db, orgId, userId, input) {
    const id = newId('evt');
    const slug = slugify(input.name);
    const e = { ...input, createdAt: new Date().toISOString(), createdBy: userId };
    const c = columns(e);
    await db.query(
      'INSERT INTO events (id, organization_id, slug, name, phase, status, is_public, starts_on, data, created_by) VALUES (:id, :o, :slug, :name, :phase, :status, :pub, :starts, :data, :u)',
      { id, o: orgId, slug, name: c.name, phase: c.phase, status: c.status, pub: c.is_public, starts: c.starts_on, data: dataOf(e), u: userId },
    );
    return events.get(db, orgId, id);
  },
  /** Optimistic concurrency: fails with null when version moved on. */
  async save(db, orgId, event, expectedVersion) {
    const c = columns(event);
    const r = await db.query(
      `UPDATE events SET name = :name, phase = :phase, status = :status, is_public = :pub, starts_on = :starts, data = :data, version = version + 1
        WHERE id = :id AND organization_id = :o AND version = :v`,
      { name: c.name, phase: c.phase, status: c.status, pub: c.is_public, starts: c.starts_on, data: dataOf(event), id: event.id, o: orgId, v: expectedVersion },
    );
    if (!r.affectedRows) return null;
    return events.get(db, orgId, event.id);
  },
  async remove(db, orgId, id) {
    const r = await db.query('DELETE FROM events WHERE id = :id AND organization_id = :o', { id, o: orgId });
    return r.affectedRows > 0;
  },
  async publicBySlug(db, slug) {
    return rowToEvent(await db.one("SELECT * FROM events WHERE slug = :s AND is_public = 1 AND status = 'active'", { s: slug }));
  },
};

export const orgs = {
  async get(db, orgId) {
    const r = await db.one('SELECT * FROM organizations WHERE id = :o', { o: orgId });
    if (!r) return null;
    return { id: r.id, name: r.name, type: r.org_type, tier: r.tier, ...parse(r.settings, {}) };
  },
  async updateSettings(db, orgId, patch) {
    const cur = await db.one('SELECT settings FROM organizations WHERE id = :o', { o: orgId });
    const next = { ...parse(cur?.settings, {}), ...patch };
    await db.query('UPDATE organizations SET settings = :s WHERE id = :o', { s: JSON.stringify(next), o: orgId });
  },
};

export const snapshots = {
  async list(db, orgId) {
    const rows = await db.query('SELECT * FROM snapshots WHERE organization_id = :o ORDER BY created_at', { o: orgId });
    return rows.map((r) => ({ ...parse(r.data, {}), id: r.id, organizationId: r.organization_id }));
  },
  async upsert(db, orgId, snap) {
    const id = String(snap.id ?? newId('snap')).slice(0, 60);
    const { id: _i, organizationId: _o, ...rest } = snap;
    await db.query(
      'INSERT INTO snapshots (id, organization_id, event_id, series_id, data) VALUES (:id, :o, :e, :s, :d) ON DUPLICATE KEY UPDATE data = IF(organization_id = :o, VALUES(data), data)',
      { id, o: orgId, e: snap.eventId ?? null, s: snap.seriesId ?? null, d: JSON.stringify({ ...rest, organizationId: orgId }) },
    );
  },
};
