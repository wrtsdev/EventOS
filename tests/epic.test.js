import { test } from 'node:test';
import assert from 'node:assert/strict';

import { epicScore, criticalRisks, MATRIX, EPIC_ORDER, DEFAULT_WEIGHTS, weightsFor, epicHeatmap } from '../src/domain/epic.js';
import { applicableChecklist, readiness, stageReviews, CHECKLIST_ITEMS } from '../src/domain/controls.js';
import { financeView, defaultBudget } from '../src/domain/finance.js';
import { outcomesView } from '../src/domain/civic.js';
import { workforceSummary } from '../src/domain/workforce.js';
import { simulateEvent } from '../src/domain/simulate.js';
import { SAMPLE_ORG } from '../src/data/sampleData.js';

const ev = (o = {}) => ({ id: 't-epic', organizationId: 'org-demo', typeId: '5k', format: 'physical', expected: 300, price: 30, features: ['registration', 'volunteers', 'sponsors', 'shirts', 'medals'], fourWs: ['wellness', 'wealth', 'work'], primaryW: 'wellness', phase: 'planning', status: 'active', checklist: {}, ...o });

test('EPIC × 4Ws matrix covers all 16 combinations with the directive’s primary links', () => {
  const ws = Object.keys(MATRIX);
  assert.equal(ws.length * EPIC_ORDER.length, 16);
  for (const w of ws) for (const d of EPIC_ORDER) assert.ok(MATRIX[w][d].relevance);
  assert.equal(MATRIX.wealth.E.relevance, 'primary');
  assert.equal(MATRIX.wealth.C.relevance, 'primary');
  assert.equal(MATRIX.wellness.P.relevance, 'primary');
  assert.equal(MATRIX.wellness.I.relevance, 'primary');
  assert.equal(MATRIX.wisdom.I.relevance, 'primary');
  assert.equal(MATRIX.work.E.relevance, 'primary');
});

test('every control belongs to an EPIC domain and every domain has controls', () => {
  for (const c of CHECKLIST_ITEMS) assert.ok(EPIC_ORDER.includes(c.epic), c.id);
  const items = applicableChecklist(ev(), null, { includeAll: true });
  for (const d of EPIC_ORDER) assert.ok(items.some((i) => i.epic === d), d);
});

test('default weights are 40/20/20/20 and custom weights must total 100', () => {
  assert.deepEqual(DEFAULT_WEIGHTS, { E: 40, P: 20, I: 20, C: 20 });
  assert.equal(weightsFor({ epicWeights: { E: 50 } }).valid, false);
  assert.equal(weightsFor({ epicWeights: { E: 25, P: 25, I: 25, C: 25 } }).valid, true);
});

test('unassessed controls earn nothing: an empty event cannot score well', () => {
  const s = epicScore(ev(), null, SAMPLE_ORG);
  assert.ok(s.composite < 30, `composite ${s.composite}`);
  assert.ok(s.coverage < 0.4);
  assert.notEqual(s.clearance, 'clear');
});

test('a high composite never hides an open critical safety control', () => {
  const items = applicableChecklist(ev(), null);
  const all = Object.fromEntries(items.filter((i) => !i.auto).map((i) => [i.id, 'done']));
  all.ems = 'blocking';
  const e = ev({ checklist: all, risks: undefined, seed: { risksReviewed: 99, contactsConfirmed: 99 } });
  const s = epicScore(e, null, SAMPLE_ORG);
  assert.ok(s.composite >= 70, `composite ${s.composite}`);
  assert.equal(s.clearance, 'blocked');
  assert.ok(s.critical.some((c) => c.id === 'ctl-ems'));
});

test('critical risks include essential spending cut below minimum', () => {
  const e = ev();
  const b = defaultBudget(e);
  e.budget = { ...b, lines: b.lines.map((l) => (l.id === 'exp-ems' ? { ...l, planned: 100 } : l)) };
  const crit = criticalRisks(e, null);
  assert.ok(crit.some((c) => c.kind === 'finance'));
  assert.equal(financeView(e).essentialAtRisk, true);
});

test('staged reviews are cumulative and closure items only count after the event', () => {
  const e = ev();
  const r = stageReviews(e, null);
  const n = Object.fromEntries(r.map((x) => [x.id, x.items.length]));
  assert.ok(n.planning <= n.t30 && n.t30 <= n.t7 && n.t7 <= n.eventday && n.eventday <= n.closure);
  assert.ok(!readiness(e).items.some((i) => i.stage === 'closure'));
  const done = ev({ phase: 'complete' });
  assert.ok(readiness(done, simulateEvent(done, SAMPLE_ORG)).items.some((i) => i.stage === 'closure'));
  const heat = epicHeatmap(e, null);
  assert.ok(heat[0].cells.find((c) => c.stage === 'closure').future);
});

test('break-even, scenarios and planned net are consistent', () => {
  const e = ev({ features: ['registration', 'volunteers'], fourWs: [], primaryW: null });
  const f = financeView(e);
  const at = f.scenarios.find((s) => s.id === 'expected');
  assert.equal(at.people, 300);
  assert.equal(Math.abs(at.net - f.planned.net) <= 2, true, `${at.net} vs ${f.planned.net}`);
  if (f.breakEven > 0) {
    const fixed = f.expenseLines.filter((l) => !l.perHead).reduce((a, l) => a + l.planned, 0) + f.planned.contingency;
    assert.ok(f.breakEven * f.perHeadMargin >= fixed - f.revenueLines.filter((l) => !l.perHead).reduce((a, l) => a + l.planned, 0) - 1);
  }
});

test('local vendor spending is tracked separately from total spending', () => {
  const f = financeView(ev());
  const total = f.expenseLines.reduce((a, l) => a + l.planned, 0);
  assert.ok(f.local.spend > 0 && f.local.spend < total);
  assert.ok(f.local.vendors.length > 0);
});

test('larger turnout is not reported as a budget overrun', () => {
  const e = ev({ phase: 'complete', expected: 200 });
  const sim = simulateEvent(e, SAMPLE_ORG);
  assert.ok(sim.registered > 190);
  const f = financeView(e, sim);
  assert.ok(!f.flags.some((x) => x.id === 'overrun-exp-shirts'), 'per-participant lines are flexed');
});

test('volunteer, paid and contracted work are separated; volunteer time is never priced', () => {
  const e = ev({ phase: 'complete' });
  const wf = workforceSummary(e, financeView(e, simulateEvent(e, SAMPLE_ORG)));
  assert.ok(wf.volunteers.hours > 0);
  assert.ok(wf.paid.positions >= 1 && wf.paid.wages > 0);
  assert.ok(wf.contracted.value > 0);
  assert.equal('value' in wf.volunteers, false);
});

test('4W outcomes keep their own units and stay blank until measured', () => {
  const e = ev();
  const o = outcomesView(e, null);
  assert.equal(o.measured, 0);
  assert.ok(o.rows.every((r) => r.actual == null && r.result === 'not-measured'));
  const units = new Set(o.rows.map((r) => r.unit));
  assert.ok(units.size >= 3);
  assert.ok(o.rows.some((r) => r.reach), 'attendance is labeled as reach');
  assert.equal(o.byW.wellness.length >= o.byW.wealth.length, true, 'primary W gets more measures');
});
