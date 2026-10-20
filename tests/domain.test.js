import { test } from 'node:test';
import assert from 'node:assert/strict';

import { readiness, recommend, buildBlueprint, applicableChecklist, nextStatus } from '../src/domain/blueprint.js';
import { participantLifetimeValue, communityValueIndex, communityLifetimeValue, CVI_INPUTS } from '../src/domain/metrics.js';
import { simulateEvent, generateParticipants } from '../src/domain/simulate.js';
import { SAMPLE_EVENTS, SAMPLE_ORG } from '../src/data/sampleData.js';
import { TEMPLATES } from '../src/data/templates.js';
import { FOUR_WS } from '../src/domain/fourW.js';

const base = { id: 't1', typeId: '5k', format: 'physical', expected: 300, price: 30, features: ['registration', 'volunteers', 'sponsors'], fourWs: ['wellness'], checklist: {} };

test('readiness: physical events require safety items; virtual events do not', () => {
  const physical = applicableChecklist(base).map((i) => i.id);
  assert.ok(physical.includes('insurance'));
  assert.ok(physical.includes('ems'));
  assert.ok(physical.includes('timing'));
  const virtual = applicableChecklist({ ...base, typeId: 'virtual', format: 'virtual' }).map((i) => i.id);
  assert.ok(!virtual.includes('insurance'));
  assert.ok(virtual.includes('mile-logging'));
});

test('readiness: score rises as items complete and reaches 100', () => {
  const start = readiness(base).score;
  const items = applicableChecklist(base);
  const allDone = Object.fromEntries(items.map((i) => [i.id, 'done']));
  assert.equal(readiness({ ...base, checklist: allDone }).score, 100);
  assert.ok(start < 50);
  assert.equal(nextStatus('blocking'), 'attention');
  assert.equal(nextStatus('done'), 'blocking');
});

test('4Ws change recommendations and blueprint content', () => {
  const wealth = recommend({ ...base, fourWs: ['wealth'] });
  const wisdom = recommend({ ...base, fourWs: ['wisdom'] });
  assert.ok(wealth.programming.some((p) => p.id === 'fin-lit-booth'));
  assert.ok(wisdom.programming.some((p) => p.id === 'story-checkpoints'));
  assert.ok(wealth.features.includes('resources'));
  assert.ok(wisdom.features.includes('education'));
  const bp = buildBlueprint({ ...base, fourWs: ['work'] });
  assert.ok(bp.impact.survey.some((q) => q.includes('career')));
  assert.ok(bp.engagement.partners.includes(FOUR_WS.work.partners[0]));
});

test('PLV excludes non-economic value and sums its components', () => {
  const plv = participantLifetimeValue({
    participants: 100, registrationRevenue: 3500, directCosts: 1500, merchRevenue: 500, sponsorAttributed: 1000,
    membershipPerParticipant: 10, referralRegistrations: 20, retentionRate: 0.5, eventsPerYear: 1,
  });
  const sum = Object.values(plv.components).reduce((a, b) => a + b, 0);
  assert.equal(plv.value, Math.round(sum));
  assert.deepEqual(Object.keys(plv.components).sort(), ['contribution', 'membership', 'merchandise', 'referrals', 'sponsor']);
  assert.equal(plv.expectedYears, 2);
  assert.equal(communityLifetimeValue(184, 1283), 236072);
});

test('CVI is bounded 0–100 and weights sum to 100', () => {
  assert.equal(CVI_INPUTS.reduce((a, b) => a + b.weight, 0), 100);
  const perfect = communityValueIndex({ repeat: 1, cause: 1, referrals: 1, volunteering: 1, passport: 1, feedback: 5, involvement: 1, sponsor: 1, fourW: 1 });
  assert.equal(perfect.value, 100);
  const empty = communityValueIndex({});
  assert.equal(empty.value, 0);
});

test('simulation is deterministic and respects phase', () => {
  const e = { ...base, phase: 'live', cause: 'Test Fund' };
  const a = simulateEvent(e, SAMPLE_ORG);
  const b = simulateEvent(e, SAMPLE_ORG);
  assert.equal(a.registered, b.registered);
  assert.equal(a.plv.value, b.plv.value);
  assert.equal(generateParticipants({ ...e, phase: 'planning' }, 'planning').length, 0);
  const done = simulateEvent({ ...e, phase: 'complete' }, SAMPLE_ORG);
  assert.ok(done.finishers > 0 && done.finishers <= done.registered);
  assert.ok(done.nextActions.length >= 3);
  assert.ok(done.cvi.value >= 0 && done.cvi.value <= 100);
  assert.equal(a.funnel.at(-1).count, a.registered);
});

test('sample events and templates cover the three demo scenarios', () => {
  assert.deepEqual(TEMPLATES.map((t) => t.fourW), ['wellness', 'wealth', 'wisdom']);
  assert.deepEqual(SAMPLE_EVENTS.map((e) => e.phase), ['planning', 'live', 'complete']);
  for (const e of SAMPLE_EVENTS) {
    const s = simulateEvent(e, SAMPLE_ORG);
    assert.ok(Number.isFinite(s.plv.value) && s.plv.value > 0, e.name);
  }
});
