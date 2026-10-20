import { test } from 'node:test';
import assert from 'node:assert/strict';

import { importRegistrations, genericTiming, ADAPTERS } from '../src/integrations/registry.js';
import { defineAdapter, splitRecord, allowedFor } from '../src/integrations/adapter.js';
import { toHubSpotContact, syncPreview } from '../src/integrations/hubspot.js';
import { localRulesProvider, detectIntent } from '../src/copilot/engine.js';
import { simulateEvent } from '../src/domain/simulate.js';
import { SAMPLE_EVENTS, SAMPLE_ORG } from '../src/data/sampleData.js';

test('different vendor shapes normalize to one canonical participant', async () => {
  const rows = await importRegistrations();
  assert.ok(rows.length >= 3);
  const keys = new Set(rows.map((r) => Object.keys(r.canonical).sort().join(',')));
  assert.equal(keys.size, 1, 'all canonical records share one shape');
  const rr = rows.find((r) => r.source === 'raceroster').canonical;
  assert.equal(rr.firstName, 'Imani');
  assert.equal(rr.lastInitial, 'B');
  assert.equal(rr.amountPaid, 35);
});

test('timing results normalize to seconds', async () => {
  const [raw] = await genericTiming.fetchRaw();
  assert.equal(genericTiming.normalize(raw).chipSeconds, 37 * 60 + 48);
});

test('intelligence record carries no direct identifiers', async () => {
  const [row] = await importRegistrations();
  const { intelligence, transactional } = splitRecord(row.canonical);
  assert.equal(intelligence.email, undefined);
  assert.equal(intelligence.firstName, undefined);
  assert.ok(transactional.email);
});

test('adapters must declare their contract', () => {
  assert.throws(() => defineAdapter({ id: 'x' }));
  for (const a of ADAPTERS) assert.ok(a.id && a.category && a.status);
});

test('HubSpot sync withholds participants without marketing consent', () => {
  const event = { ...SAMPLE_EVENTS[2] };
  const sim = simulateEvent(event, SAMPLE_ORG);
  const preview = syncPreview(sim.participants, event);
  assert.equal(preview.syncable + preview.withheld, sim.participants.length);
  const optedOut = sim.participants.find((p) => !allowedFor('marketing', p));
  assert.equal(toHubSpotContact(optedOut, event), null);
});

test('Copilot answers from event data and flags safety guidance', async () => {
  const event = SAMPLE_EVENTS[0];
  const sim = simulateEvent(event, SAMPLE_ORG);
  const cp = localRulesProvider({ event, sim, org: SAMPLE_ORG });
  const ready = await cp.answer('Is my event ready?');
  assert.equal(ready.intent, 'ready');
  assert.ok(ready.blocks[0].text.includes('%'));
  const permits = await cp.answer('What permits might I need?');
  assert.ok(permits.disclaimer);
  assert.equal(detectIntent('Which sponsor performed best?'), 'sponsor');
  assert.equal(detectIntent('What should our next event be?'), 'next');
  assert.equal(detectIntent('Create my participant communication timeline'), 'comms');
  assert.equal(detectIntent('Build my 5K event plan'), 'plan');
});
