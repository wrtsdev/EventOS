// WRTS platform administration (plan tiers). Only users flagged as platform
// admins (PLATFORM_ADMIN_EMAILS at signup, or set in the database) can use it.

import { Router } from 'express';
import { audit } from './audit.js';
import { str } from './security.js';

export function platformRouter(db) {
  const r = Router();
  r.use((req, res, next) => (req.user?.isPlatformAdmin ? next() : res.status(404).json({ error: 'Not found.' })));
  r.get('/orgs', async (req, res, next) => {
    try {
      const rows = await db.query('SELECT o.id, o.name, o.tier, o.created_at AS createdAt, (SELECT COUNT(*) FROM events e WHERE e.organization_id = o.id) AS events FROM organizations o ORDER BY o.created_at DESC');
      res.json({ orgs: rows });
    } catch (e) {
      next(e);
    }
  });
  r.patch('/orgs/:id', async (req, res, next) => {
    try {
      const tier = str(req.body.tier, 20);
      if (!['community', 'pro', 'enterprise'].includes(tier)) return res.status(400).json({ error: 'Unknown plan.' });
      await db.query('UPDATE organizations SET tier = :t WHERE id = :id', { t: tier, id: req.params.id });
      await audit(db, { orgId: req.params.id, userId: req.user.id, action: 'platform.tier', detail: { tier }, ip: req.ip });
      res.json({ ok: true });
    } catch (e) {
      next(e);
    }
  });
  return r;
}
