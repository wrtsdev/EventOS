import { test } from 'node:test';
import assert from 'node:assert/strict';

import { can, ROLES, eventsForSession, getEventForSession, updateEventForSession, snapshotsForSession, redactIncident, hasFeature } from '../src/domain/access.js';
import { migrateState, SCHEMA_VERSION } from '../src/domain/migrate.js';
import { SAMPLE_EVENTS, SAMPLE_ORGS, SAMPLE_PASSPORT, SAMPLE_SNAPSHOTS } from '../src/data/sampleData.js';
import { localRulesProvider } from '../src/copilot/engine.js';
import { simulateEvent } from '../src/domain/simulate.js';

const db = { orgs: SAMPLE_ORGS, events: SAMPLE_EVENTS, snapshots: SAMPLE_SNAPSHOTS };
const demo = { orgId: 'org-demo', role: 'owner' };
const eastgate = { orgId: 'org-eastgate', role: 'owner' };

test('each organization sees only its own events and history', () => {
  const mine = eventsForSession(db, demo);
  assert.ok(mine.length >= 3);
  assert.ok(mine.every((e) => e.organizationId === 'org-demo'));
  assert.ok(!mine.some((e) => e.id === 'evt-eastgate-fun-run'));
  const theirs = eventsForSession(db, eastgate);
  assert.deepEqual(theirs.map((e) => e.id), ['evt-eastgate-fun-run']);
  assert.ok(snapshotsForSession(db, demo).every((s) => s.organizationId === 'org-demo'));
  assert.deepEqual(eventsForSession(db, null), []);
});

test('another tenant’s event looks exactly like a missing one', () => {
  assert.equal(getEventForSession(db, demo, 'evt-eastgate-fun-run'), null);
  assert.equal(getEventForSession(db, demo, 'does-not-exist'), null);
});

test('cross-tenant and unauthorized writes are refused', () => {
  const cross = updateEventForSession(db, demo, 'evt-eastgate-fun-run', { name: 'hijacked' });
  assert.equal(cross.ok, false);
  assert.equal(cross.error, 'not-found');
  const move = updateEventForSession(db, demo, 'evt-money-walk', { organizationId: 'org-eastgate' });
  assert.equal(move.ok, false);
  const partner = updateEventForSession(db, { orgId: 'org-demo', role: 'partner' }, 'evt-money-walk', { name: 'x' });
  assert.equal(partner.error, 'forbidden');
  const finance = updateEventForSession(db, { orgId: 'org-demo', role: 'volunteer' }, 'evt-money-walk', { budget: {} }, 'finance.edit');
  assert.equal(finance.error, 'forbidden');
  const ok = updateEventForSession(db, { orgId: 'org-demo', role: 'coordinator' }, 'evt-money-walk', { name: 'Renamed' });
  assert.equal(ok.ok, true);
  assert.equal(ok.db.events.find((e) => e.id === 'evt-money-walk').name, 'Renamed');
  assert.equal(db.events.find((e) => e.id === 'evt-money-walk').name, 'Run Your Money Walk', 'original data untouched');
});

test('role permissions follow least privilege', () => {
  assert.equal(can('owner', 'epic.configure'), true);
  assert.equal(can('coordinator', 'epic.configure'), false);
  assert.equal(can('volunteer', 'finance.view'), false);
  assert.equal(can('partner', 'incidents.view'), false);
  assert.equal(can('safety', 'incidents.view'), true);
  assert.equal(can('nobody', 'reports.view'), false);
  for (const r of Object.values(ROLES)) assert.ok(r.perms.length > 0);
});

test('incident records are redacted by role, with extra protection for minors', () => {
  const inc = { id: 'i', time: '09:00', type: 'Separated child', severity: 'moderate', status: 'closed', summary: 'Child name and details', actions: 'Guardian ID checked', involvesMinor: true };
  assert.equal(redactIncident(inc, 'safety').summary, inc.summary);
  assert.equal(redactIncident(inc, 'owner').summary, inc.summary);
  const coord = redactIncident(inc, 'coordinator');
  assert.ok(coord.redacted && !coord.summary.includes('Child name'));
  const partner = redactIncident(inc, 'partner');
  assert.equal(partner.type, 'Restricted');
  assert.equal(partner.actions, '');
});

test('plan entitlements gate advanced modules without hiding the basics', () => {
  assert.equal(hasFeature('community', 'safetyChecklist'), true);
  assert.equal(hasFeature('community', 'epicScorecard'), false);
  assert.equal(hasFeature('pro', 'epicScorecard'), true);
  assert.equal(hasFeature('pro', 'epicConfig'), false);
  assert.equal(hasFeature('enterprise', 'seriesTrends'), true);
});

test('v1 saved state migrates to v2 without losing events or progress', () => {
  const v1 = {
    org: { id: 'org-mine', name: 'My Club' },
    events: [{ id: 'e1', name: 'Old Event', fourWs: ['wealth', 'work'], phase: 'live', checklist: { permits: 'done' } }],
    passport: SAMPLE_PASSPORT,
  };
  const defaults = { orgs: SAMPLE_ORGS, events: SAMPLE_EVENTS, passport: SAMPLE_PASSPORT, snapshots: SAMPLE_SNAPSHOTS };
  const v2 = migrateState(v1, defaults);
  assert.equal(v2.schemaVersion, SCHEMA_VERSION);
  assert.deepEqual(v2.session, { orgId: 'org-mine', role: 'owner' });
  assert.ok(v2.orgs.some((o) => o.id === 'org-mine'));
  const e = v2.events[0];
  assert.equal(e.organizationId, 'org-mine');
  assert.equal(e.primaryW, 'wealth');
  assert.equal(e.status, 'active');
  assert.equal(e.checklist.permits, 'done');
  assert.equal(migrateState({ schemaVersion: 99 }, defaults), null, 'newer data is not guessed at');
  assert.equal(migrateState(null, defaults), null);
});

test('the assistant reads only the event it is given and labels suggestions', async () => {
  const event = SAMPLE_EVENTS.find((e) => e.id === 'evt-wellness-5k');
  const sim = simulateEvent(event, SAMPLE_ORGS[0]);
  const cp = localRulesProvider({ event, sim, org: SAMPLE_ORGS[0] });
  const pkg = await cp.answer('Draft a sponsor package');
  assert.equal(pkg.basis, 'suggestion');
  const sum = await cp.answer('Summarize this event');
  assert.equal(sum.basis, 'data');
  assert.ok(!JSON.stringify(sum).includes('Eastgate'));
  const ctl = await cp.answer('Which EPIC controls apply to this event?');
  assert.equal(ctl.intent, 'epic');
});
