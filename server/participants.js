// Registrations: organizer views, check-in, CSV export, aggregate rows for
// dashboards (no names or emails), and the public registration flow.

import { Router } from 'express';
import { can } from '../src/domain/access.js';
import { requireOrg } from './auth.js';
import { events } from './repo.js';
import { audit } from './audit.js';
import { newId, EMAIL_RE, str, rateLimit } from './security.js';
import { getIntegration } from './integrations.js';
import { createCheckoutSession } from './stripe.js';
import { getEventType } from '../src/domain/catalog.js';
import { FOUR_WS } from '../src/domain/fourW.js';
import { sponsorsFor } from '../src/domain/sponsors.js';

const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);
const COUNTED = "payment_status IN ('free','paid')";

/** Non-identifying row for dashboards. */
function toMetricRow(r, returningEmails) {
  return {
    id: r.id,
    zip: r.zip || null,
    team: r.team || null,
    referredBy: r.referral || null,
    source: r.source,
    division: r.division || null,
    paymentStatus: r.payment_status,
    amountCents: r.amount_cents,
    donationCents: r.donation_cents,
    donated: r.donation_cents > 0,
    returning: returningEmails.has(r.email),
    fourWInterest: (r.four_w_interest || '').split(',').filter(Boolean),
    consent: { analytics: Boolean(r.consent_analytics), marketing: Boolean(r.consent_marketing), sharePartners: Boolean(r.consent_partners) },
    checkedIn: Boolean(r.checked_in_at),
    finished: Boolean(r.finished),
    createdAt: r.created_at,
  };
}

export function participantsRouter(db, cfg) {
  const r = Router();
  r.use(requireOrg);

  // Aggregate-friendly rows: any role with reports.view.
  r.get('/events/:id/metrics', wrap(async (req, res) => {
    if (!can(req.session.role, 'reports.view') && !can(req.session.role, 'event.edit')) return res.status(403).json({ error: 'Your role cannot see reports.' });
    const e = await events.get(db, req.session.orgId, req.params.id);
    if (!e) return res.status(404).json({ error: 'Event not found.' });
    const rows = await db.query('SELECT * FROM registrations WHERE event_id = :e AND organization_id = :o ORDER BY created_at', { e: e.id, o: req.session.orgId });
    const prior = await db.query(
      "SELECT DISTINCT r.email FROM registrations r JOIN events ev ON ev.id = r.event_id WHERE r.organization_id = :o AND r.event_id <> :e AND ev.starts_on < COALESCE(:d, '9999-12-31')",
      { o: req.session.orgId, e: e.id, d: e.date || null },
    );
    const returning = new Set(prior.map((p) => p.email));
    res.json({ rows: rows.map((x) => toMetricRow(x, returning)) });
  }));

  // Full participant list: names and contact details need participants.view.
  r.get('/events/:id/registrations', wrap(async (req, res) => {
    if (!can(req.session.role, 'participants.view')) return res.status(403).json({ error: 'Your role cannot see participant details.' });
    const e = await events.get(db, req.session.orgId, req.params.id);
    if (!e) return res.status(404).json({ error: 'Event not found.' });
    const rows = await db.query(
      'SELECT id, first_name AS firstName, last_name AS lastName, email, zip, team, division, referral, shirt_size AS shirtSize, is_adult AS isAdult, payment_status AS paymentStatus, amount_cents AS amountCents, donation_cents AS donationCents, source, checked_in_at AS checkedInAt, finished, consent_marketing AS consentMarketing, created_at AS createdAt FROM registrations WHERE event_id = :e AND organization_id = :o ORDER BY created_at DESC',
      { e: e.id, o: req.session.orgId },
    );
    await audit(db, { orgId: req.session.orgId, userId: req.user.id, action: 'participants.view', entity: 'event', entityId: e.id, ip: req.ip });
    res.json({ registrations: rows });
  }));

  r.get('/events/:id/registrations.csv', wrap(async (req, res) => {
    if (!can(req.session.role, 'participants.view')) return res.status(403).json({ error: 'Your role cannot export participants.' });
    const e = await events.get(db, req.session.orgId, req.params.id);
    if (!e) return res.status(404).json({ error: 'Event not found.' });
    const rows = await db.query('SELECT first_name, last_name, email, zip, team, division, shirt_size, payment_status, amount_cents, donation_cents, source, checked_in_at, created_at FROM registrations WHERE event_id = :e AND organization_id = :o ORDER BY last_name', { e: e.id, o: req.session.orgId });
    const esc = (v) => {
      const s = v == null ? '' : String(v instanceof Date ? v.toISOString() : v);
      const safe = /^[=+\-@\t\r]/.test(s) ? "'" + s : s; // block spreadsheet formula injection
      return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
    };
    const head = ['First name', 'Last name', 'Email', 'ZIP', 'Team', 'Division', 'Shirt', 'Payment', 'Paid ($)', 'Donation ($)', 'Source', 'Checked in', 'Registered'];
    const lines = [head.join(','), ...rows.map((x) => [x.first_name, x.last_name, x.email, x.zip, x.team, x.division, x.shirt_size, x.payment_status, (x.amount_cents / 100).toFixed(2), (x.donation_cents / 100).toFixed(2), x.source, x.checked_in_at, x.created_at].map(esc).join(','))];
    await audit(db, { orgId: req.session.orgId, userId: req.user.id, action: 'participants.export', entity: 'event', entityId: e.id, ip: req.ip });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${e.slug}-participants.csv"`);
    res.send(lines.join('\n'));
  }));

  r.patch('/registrations/:id', wrap(async (req, res) => {
    if (!can(req.session.role, 'event.edit') && !can(req.session.role, 'workforce.edit')) return res.status(403).json({ error: 'Your role cannot check people in.' });
    const sets = [];
    const p = { id: req.params.id, o: req.session.orgId };
    if ('checkedIn' in req.body) sets.push(req.body.checkedIn ? 'checked_in_at = UTC_TIMESTAMP()' : 'checked_in_at = NULL');
    if ('finished' in req.body) { sets.push('finished = :f'); p.f = req.body.finished ? 1 : 0; }
    if (!sets.length) return res.status(400).json({ error: 'Nothing to change.' });
    const out = await db.query(`UPDATE registrations SET ${sets.join(', ')} WHERE id = :id AND organization_id = :o`, p);
    if (!out.affectedRows) return res.status(404).json({ error: 'Registration not found.' });
    res.json({ ok: true });
  }));

  return r;
}

// ---------- Public pages and registration ----------

export function publicEventView(e, counts) {
  const type = getEventType(e.typeId);
  const programming = (e.programming ?? []).map((id) => Object.values(FOUR_WS).flatMap((w) => w.programming).find((p) => p.id === id)?.label).filter(Boolean);
  const cap = Number(e.cap) || null;
  return {
    slug: e.slug,
    name: e.name,
    date: e.date || null,
    location: e.location || null,
    description: e.description || '',
    organization: e.organization || '',
    typeLabel: type.label,
    format: e.format,
    price: Number(e.price) || 0,
    cause: e.cause || null,
    fourWs: (e.fourWs ?? []).map((w) => ({ id: w, name: FOUR_WS[w]?.name, prompt: FOUR_WS[w]?.prompt })),
    programming,
    walkRun: (e.programming ?? []).includes('walking-division'),
    sponsors: sponsorsFor(e).map((s) => s.name),
    shirts: (e.features ?? []).includes('shirts'),
    teams: (e.features ?? []).includes('teams'),
    donations: (e.features ?? []).includes('donations') || Boolean(e.cause),
    registrationOpen: e.phase === 'live' && e.status === 'active' && (!cap || counts.registered < cap),
    spotsLeft: cap ? Math.max(0, cap - counts.registered) : null,
    contact: e.contact || null,
  };
}

export function publicRouter(db, cfg, { fetchImpl } = {}) {
  const r = Router();
  const limiter = rateLimit({ windowMs: 10 * 60 * 1000, max: 40 });

  r.get('/events/:slug', wrap(async (req, res) => {
    const e = await events.publicBySlug(db, str(req.params.slug, 120));
    if (!e) return res.status(404).json({ error: 'Event not found.' });
    const c = await db.one(`SELECT COUNT(*) AS n FROM registrations WHERE event_id = :e AND ${COUNTED}`, { e: e.id });
    res.json({ event: publicEventView(e, { registered: Number(c.n) }) });
  }));

  r.post('/events/:slug/register', limiter, wrap(async (req, res) => {
    const e = await events.publicBySlug(db, str(req.params.slug, 120));
    if (!e) return res.status(404).json({ error: 'Event not found.' });
    const c = await db.one(`SELECT COUNT(*) AS n FROM registrations WHERE event_id = :e AND ${COUNTED}`, { e: e.id });
    const view = publicEventView(e, { registered: Number(c.n) });
    if (!view.registrationOpen) return res.status(409).json({ error: 'Registration for this event is closed.' });
    const b = req.body ?? {};
    const first = str(b.firstName, 100);
    const last = str(b.lastName, 100);
    const email = str(b.email, 254).toLowerCase();
    if (!first || !last) return res.status(400).json({ error: 'Enter your first and last name.' });
    if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'Enter a valid email address.' });
    if (!b.waiver) return res.status(400).json({ error: 'Accept the participant waiver to register.' });
    const isAdult = b.isAdult !== false;
    const guardian = str(b.guardianName, 200);
    if (!isAdult && !guardian) return res.status(400).json({ error: 'A parent or guardian must register participants under 18.' });
    const dup = await db.one(`SELECT id FROM registrations WHERE event_id = :e AND email = :m AND first_name = :f AND ${COUNTED}`, { e: e.id, m: email, f: first });
    if (dup) return res.status(409).json({ error: 'You are already registered for this event.' });
    const priceCents = Math.round(view.price * 100);
    const donationCents = Math.max(0, Math.min(100000, Math.round(Number(b.donation || 0) * 100)));
    const total = priceCents + donationCents;
    const id = newId('reg');
    const four = (Array.isArray(b.fourWInterest) ? b.fourWInterest : []).filter((w) => FOUR_WS[w]).join(',');
    await db.query(
      `INSERT INTO registrations (id, organization_id, event_id, first_name, last_name, email, zip, team, division, referral, shirt_size, four_w_interest, is_adult, guardian_name,
        consent_analytics, consent_marketing, consent_partners, waiver_accepted_at, amount_cents, donation_cents, payment_status, source)
       VALUES (:id, :o, :e, :f, :l, :m, :zip, :team, :div, :ref, :shirt, :four, :adult, :g, :ca, :cm, :cp, UTC_TIMESTAMP(), :amt, :don, :ps, 'eventos')`,
      {
        id, o: e.organizationId, e: e.id, f: first, l: last, m: email, zip: str(b.zip, 12).replace(/[^0-9A-Za-z -]/g, ''), team: str(b.team, 120) || null,
        div: ['walk', 'run'].includes(b.division) ? b.division : null, ref: str(b.referral, 120) || null, shirt: str(b.shirtSize, 8) || null, four,
        adult: isAdult ? 1 : 0, g: guardian || null, ca: b.consentAnalytics ? 1 : 0, cm: b.consentMarketing ? 1 : 0, cp: b.consentPartners ? 1 : 0,
        amt: priceCents, don: donationCents, ps: total > 0 ? 'pending' : 'free',
      },
    );
    if (total === 0) return res.status(201).json({ ok: true, status: 'registered' });

    const stripe = await getIntegration(db, cfg, e.organizationId, 'stripe');
    if (!stripe?.secret) {
      await db.query("UPDATE registrations SET payment_status = 'failed' WHERE id = :id", { id });
      return res.status(503).json({ error: 'Online payment is not set up for this event yet. Contact the organizer.' });
    }
    const session = await createCheckoutSession(stripe.secret, {
      registrationId: id,
      email,
      eventName: e.name,
      priceCents,
      donationCents,
      cause: e.cause,
      successUrl: `${cfg.publicUrl}/e/${e.slug}?registered=1`,
      cancelUrl: `${cfg.publicUrl}/e/${e.slug}?canceled=1`,
    }, fetchImpl ? { fetchImpl } : undefined);
    await db.query('UPDATE registrations SET stripe_session_id = :s WHERE id = :id', { s: session.id, id });
    res.status(201).json({ ok: true, status: 'payment_required', checkoutUrl: session.url });
  }));

  return r;
}
