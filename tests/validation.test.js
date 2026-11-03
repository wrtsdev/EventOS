// End-to-end validation scenario from the EPIC × 4Ws directive, run against
// the domain layer with clearly synthetic data.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { applicableChecklist, readiness } from '../src/domain/controls.js';
import { epicScore, criticalRisks } from '../src/domain/epic.js';
import { financeView, defaultBudget } from '../src/domain/finance.js';
import { riskAssessment, risksFor, contactsFor, newIncident } from '../src/domain/safety.js';
import { workforceFor, workforceSummary } from '../src/domain/workforce.js';
import { outcomesView } from '../src/domain/civic.js';
import { draftAAR, createNextEdition, snapshotFromEvent } from '../src/domain/aar.js';
import { simulateEvent } from '../src/domain/simulate.js';
import { purposeStatement } from '../src/domain/blueprint.js';
import { SAMPLE_ORG } from '../src/data/sampleData.js';

const org = SAMPLE_ORG;
const sim = (e) => simulateEvent(e, org);
const withAll = (e, ids, status = 'done') => ({ ...e, checklist: { ...e.checklist, ...Object.fromEntries(ids.map((i) => [i, status])) } });

test('validation scenario: 5K, Wellness primary, Wealth + Work supporting, from charter to next edition', () => {
  // 1–2. Create a 5K with Wellness primary and Wealth, Work supporting.
  let e = {
    id: 'evt-validation-5k', organizationId: 'org-demo', name: 'SYNTHETIC Validation 5K 2027', typeId: '5k', format: 'physical',
    purpose: 'community-wellness', fourWs: ['wellness', 'wealth', 'work'], primaryW: 'wellness', expected: 350, cap: 400, price: 35,
    cause: 'Synthetic Health Fund', features: ['registration', 'teams', 'volunteers', 'shirts', 'medals', 'sponsors', 'surveys', 'followup'],
    phase: 'planning', status: 'active', checklist: {}, date: '2027-05-01', seriesId: 'series-validation',
  };
  assert.match(purposeStatement(e), /Wellness/);

  // 3. EventOS creates a customized EPIC checklist.
  const controls = applicableChecklist(e, null, { includeAll: true });
  for (const d of ['E', 'P', 'I', 'C']) assert.ok(controls.some((c) => c.epic === d));
  assert.ok(controls.some((c) => c.id === 'timing'), 'timed 5K needs timing');
  assert.ok(controls.some((c) => c.id === 'security'), '350 people needs traffic support');
  assert.ok(controls.filter((c) => c.weight === 'critical').length >= 8);

  // 4. Registration goal and budget.
  e = { ...e, budget: defaultBudget(e), revenueGoal: 20000 };
  const fin0 = financeView(e);
  assert.ok(fin0.planned.revenue > 0 && fin0.planned.expense > 0);
  assert.ok(fin0.expenseLines.some((l) => l.id === 'exp-youth-wages'), 'Work W adds paid youth crew');
  e = withAll(e, ['budget']);

  // 5. Sponsors, local vendors, volunteers and safety personnel assigned.
  e = {
    ...e,
    risks: risksFor(e).map((r) => ({ ...r, reviewed: true, owner: r.owner || 'Safety lead' })),
    contacts: contactsFor(e).map((c, i) => ({ ...c, name: 'Synthetic Contact ' + i, phone: '555-0100', confirmed: true })),
    workforce: workforceFor(e).map((r) => ({ ...r, assigned: r.needed, trained: r.trainingRequired ? r.needed : 0, backup: r.backup || 'Synthetic Backup' })),
  };
  assert.equal(riskAssessment(e).complete, true);
  const wf0 = workforceSummary(e, financeView(e));
  assert.equal(wf0.volunteers.assigned, wf0.volunteers.needed);
  assert.ok(financeView(e).local.vendors.length >= 5);

  // 6. Registrations and financial performance tracked.
  e = { ...e, phase: 'live' };
  const s1 = sim(e);
  assert.ok(s1.registered > 0);
  assert.ok(financeView(e, s1).actual.revenue > 0);

  // 7. Readiness dashboard flags outstanding safety requirements.
  const manual = applicableChecklist(e, s1).filter((i) => !i.auto).map((i) => i.id);
  e = withAll(e, manual);
  e = withAll(e, ['ems'], 'attention');
  const crit = criticalRisks(e, s1);
  assert.ok(crit.some((c) => c.id === 'ctl-ems'), 'open EMS plan is flagged');
  assert.equal(epicScore(e, s1, org).clearance, 'blocked');
  e = withAll(e, ['ems']);
  assert.equal(criticalRisks(e, s1).length, 0);

  // 8. Event day monitored and recorded.
  e = { ...e, phase: 'eventday', weather: { status: 'go', decidedBy: 'Synthetic Organizer' }, dayLog: [{ time: '07:00', note: 'Radio check complete' }] };
  e = withAll(e, ['safety-briefing', 'radio-check', 'checkin-open']);
  e = { ...e, incidents: [{ ...newIncident({ type: 'Medical', severity: 'minor', summary: 'Synthetic blister care' }), status: 'closed' }] };
  const s2 = sim(e);
  assert.ok(s2.checkedIn > 0);
  assert.equal(readiness(e, s2).items.find((i) => i.id === 'weather-go').status, 'done');

  // 9. Actuals entered or imported.
  e = { ...e, phase: 'complete' };
  const s3 = sim(e);
  e = { ...e, budget: { ...e.budget, lines: e.budget.lines.map((l) => (l.id === 'exp-ems' ? { ...l, actual: 1250 } : l)) }, distribution: { distributed: 3000, evidence: 'verified' } };
  e = { ...e, workforce: workforceFor(e).map((r) => ({ ...r, hoursRecorded: r.assigned * r.hoursEach })) };
  e = { ...e, outcomes: { accommodations: { actual: 4, evidence: 'reported' } } };
  const fin = financeView(e, s3);
  assert.equal(fin.lines.find((l) => l.id === 'exp-ems').actualValue, 1250);
  assert.ok(fin.local.spend > 0);

  // 10. EPIC operational scorecard and 4Ws outcomes report — separate.
  const score = epicScore(e, s3, org);
  const outcomes = outcomesView(e, s3);
  assert.ok(score.composite > 70);
  assert.ok(outcomes.measured >= outcomes.total - 1);
  assert.ok(outcomes.rows.find((r) => r.id === 'paid-opps').evidence === 'verified');
  assert.equal('composite' in outcomes, false, 'outcomes are not folded into the operational score');

  // 11. After Action Review completed.
  const aar = { ...draftAAR(e, s3, org), status: 'complete', completedBy: 'Synthetic Organizer' };
  aar.actions.push({ id: 'ca-x', action: 'Book EMS 8 weeks earlier', epic: 'P', owner: 'Safety lead', status: 'open' });
  e = { ...e, aar };
  assert.equal(readiness(e, s3).items.find((i) => i.id === 'aar').status, 'done');
  const snap = snapshotFromEvent(e, s3, org);
  assert.equal(snap.seriesId, 'series-validation');
  assert.ok(snap.synthetic);

  // 12. Next edition created from lessons learned.
  const next = createNextEdition(e, s3, 'evt-validation-5k-2028');
  assert.equal(next.name, 'SYNTHETIC Validation 5K 2028');
  assert.equal(next.date, '2028-05-01');
  assert.equal(next.phase, 'planning');
  assert.equal(next.seriesId, e.seriesId);
  assert.equal(next.priorEventId, e.id);
  assert.ok(next.budget.lines.find((l) => l.id === 'exp-ems').planned >= 1250, 'budget rebased on actuals');
  assert.ok(next.risks.every((r) => !r.reviewed), 'risks must be re-reviewed');
  const carry = applicableChecklist(next, null).filter((i) => i.carryOver);
  assert.ok(carry.some((c) => c.label === 'Book EMS 8 weeks earlier' && c.epic === 'P'));
  assert.equal(e.phase, 'complete', 'prior event untouched');
});

test('exception: missing metrics stay missing and block closure', () => {
  const e = { id: 'x-miss', typeId: '5k', format: 'physical', expected: 200, price: 20, fourWs: ['wellness'], primaryW: 'wellness', features: ['registration'], phase: 'complete', status: 'active', checklist: {} };
  const s = sim(e);
  const o = outcomesView(e, s);
  const acc = o.rows.find((r) => r.id === 'accommodations');
  assert.equal(acc.actual, null);
  assert.equal(acc.result, 'not-measured');
  assert.equal(readiness(e, s).items.find((i) => i.id === 'outcomes-evidence').status, 'attention');
});

test('exception: canceled event freezes scoring and reports no outcomes', () => {
  const e = { id: 'x-cancel', typeId: '5k', format: 'physical', expected: 200, price: 20, fourWs: ['wellness'], primaryW: 'wellness', features: ['registration'], phase: 'live', status: 'canceled', cancelReason: 'Synthetic storm', checklist: {} };
  const s = sim(e);
  const sc = epicScore(e, s, org);
  assert.equal(sc.clearance, 'canceled');
  assert.equal(criticalRisks(e, s).length, 0);
  assert.ok(outcomesView({ ...e, phase: 'complete' }, s).rows.every((r) => r.actual == null));
});

test('exception: weather change leaves the event-day decision open until resolved', () => {
  const base = { id: 'x-wx', typeId: '5k', format: 'physical', expected: 200, price: 20, fourWs: ['wellness'], features: ['registration'], phase: 'eventday', status: 'active', checklist: {} };
  const delayed = { ...base, weather: { status: 'delay', note: 'Lightning 10 miles out' } };
  const r1 = readiness(delayed, sim(delayed)).items.find((i) => i.id === 'weather-go');
  assert.equal(r1.status, 'attention');
  assert.ok(criticalRisks(delayed, sim(delayed)).some((c) => c.id === 'ctl-weather-go'));
  const modified = { ...base, weather: { status: 'modified', note: 'Shortened to 2 miles' } };
  assert.equal(readiness(modified, sim(modified)).items.find((i) => i.id === 'weather-go').status, 'done');
});

test('exception: failed payments are not counted as registrations or revenue', () => {
  const e = { id: 'x-pay', typeId: '5k', format: 'physical', expected: 300, price: 40, fourWs: ['wealth'], features: ['registration'], phase: 'live', status: 'active', checklist: {} };
  const s = sim(e);
  assert.ok(s.payments.pending > 0);
  assert.equal(s.revenue.registration, s.registered * 40);
  const f = financeView(e, s);
  assert.ok(f.flags.some((x) => x.id === 'payments'));
});

test('exception: an incomplete risk assessment blocks clearance', () => {
  const e = { id: 'x-risk', typeId: '5k', format: 'physical', expected: 300, price: 30, fourWs: ['wellness'], features: ['registration'], phase: 'planning', status: 'active', checklist: {} };
  const partly = { ...e, risks: risksFor(e).map((r, i) => ({ ...r, reviewed: i > 1, owner: i > 1 ? 'Lead' : '' })) };
  const ra = riskAssessment(partly);
  assert.equal(ra.complete, false);
  assert.ok(ra.highUnreviewed.length > 0);
  assert.equal(readiness(partly).items.find((i) => i.id === 'risk-assessment').status, 'blocking');
  assert.ok(criticalRisks(partly).some((c) => c.kind === 'risk'));
  const none = readiness(e).items.find((i) => i.id === 'risk-assessment');
  assert.equal(none.assessed, false, 'suggested risks alone are "not assessed", not done');
});
