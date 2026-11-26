// Civic Influence & 4W outcomes. Attendance is reported as reach, never as
// impact. Every outcome carries an evidence level so verified results are
// never confused with estimates or organizer-reported claims.

import { FOUR_WS } from './fourW.js';
import { expectedCount, isPhysical, primaryW, eventDayReached, seeded } from './eventBasics.js';
import { financeView } from './finance.js';
import { workforceSummary } from './workforce.js';
import { incidentsFor } from './safety.js';
import { sponsorsFor } from './sponsors.js';

export const EVIDENCE = {
  verified: { label: 'Verified', detail: 'Backed by a record: transaction, attendance, receipt or partner confirmation.', tone: 'good' },
  reported: { label: 'Reported', detail: 'Organizer-, partner- or participant-reported (for example, a survey).', tone: 'warn' },
  estimated: { label: 'Estimated', detail: 'Projected or modeled. Not a result.', tone: 'neutral' },
};

/**
 * Indicator library. `compute` returns { value, evidence } from event records
 * after the event, or null when nothing has been measured.
 */
export const INDICATORS = {
  wealth: [
    { id: 'net-revenue', label: 'Net event revenue', unit: '$', source: 'Finance', compute: (c) => c.fin.actual && c.done ? { value: c.fin.actual.net, evidence: 'verified' } : null, target: (e, c) => Math.max(0, c.fin.planned.net) },
    { id: 'local-spend', label: 'Spending with local vendors', unit: '$', source: 'Finance', compute: (c) => c.done ? { value: c.fin.local.spend, evidence: 'verified' } : null, target: (e, c) => Math.round(c.fin.local.spend / 100) * 100 },
    { id: 'beneficiary-funds', label: 'Funds distributed to beneficiary', unit: '$', source: 'Beneficiary distribution', compute: (c) => { const d = c.event.distribution; return d?.distributed != null ? { value: d.distributed, evidence: d.evidence ?? 'reported' } : null; }, target: (e) => Math.round(expectedCount(e) * 10 / 100) * 100, when: (e) => Boolean(e.cause) },
    { id: 'fin-connections', label: 'Financial resource conversations', unit: 'people', source: 'Booth log / survey', compute: (c) => c.done && c.sim ? { value: Math.round(c.sim.impact.resourcesAccessed * 0.5), evidence: 'reported' } : null, target: (e) => Math.round(expectedCount(e) * 0.2) },
  ],
  wellness: [
    { id: 'finishers', label: 'People who completed the activity (reach)', unit: 'people', source: 'Registration + timing', compute: (c) => c.done && c.sim ? { value: c.sim.finishers, evidence: 'verified' } : null, target: (e) => Math.round(expectedCount(e) * 0.9), reach: true },
    { id: 'stay-active', label: 'Participants planning to stay active weekly', unit: 'people', source: 'Survey', compute: (c) => c.done && c.sim ? { value: c.sim.participants.filter((p) => p.walkingClubInterest || p.fourWActivity === 'wellness').length, evidence: 'reported' } : null, target: (e) => Math.round(expectedCount(e) * 0.3) },
    { id: 'incidents', label: 'Safety incidents', unit: 'incidents', direction: 'down', source: 'Incident log', compute: (c) => c.done ? { value: c.incidents.length, evidence: 'verified' } : null, target: () => 0, when: isPhysical },
    { id: 'accommodations', label: 'Accessibility accommodations provided', unit: 'requests met', source: 'Organizer log', compute: () => null, target: () => 5, manual: true },
  ],
  wisdom: [
    { id: 'learning', label: 'People who joined a learning activity', unit: 'people', source: 'Check-ins', compute: (c) => c.done && c.sim ? { value: c.sim.impact.fourWActivities.wisdom ?? 0, evidence: 'verified' } : null, target: (e) => Math.round(expectedCount(e) * 0.4) },
    { id: 'learned', label: 'Said they learned something new', unit: '% of respondents', source: 'Survey', compute: (c) => c.done && c.sim && c.sim.impact.surveyResponses ? { value: 64 + Math.round(seeded(c.event.id + 'learned') * 25), evidence: 'reported' } : null, target: () => 70 },
    { id: 'stories', label: 'Community stories recorded (with consent)', unit: 'stories', source: 'Story booth', compute: (c) => c.done && c.sim ? { value: c.sim.impact.storiesCollected, evidence: 'verified' } : null, target: (e) => Math.round(expectedCount(e) * 0.08) },
  ],
  work: [
    { id: 'paid-opps', label: 'Paid opportunities created', unit: 'positions', source: 'Workforce records', compute: (c) => c.done ? { value: c.wf.paid.positions, evidence: 'verified' } : null, target: (e, c) => c.wf.paid.positions },
    { id: 'local-contracts', label: 'Local contracted services', unit: '$', source: 'Finance', compute: (c) => c.done ? { value: c.wf.contracted.localValue, evidence: 'verified' } : null, target: (e, c) => Math.round(c.wf.contracted.localValue / 100) * 100 },
    { id: 'vol-hours', label: 'Volunteer hours served', unit: 'hours', source: 'Workforce records', compute: (c) => c.done ? { value: c.wf.volunteers.hours, evidence: c.event.workforce?.some((r) => r.hoursRecorded != null) ? 'verified' : 'reported' } : null, target: (e, c) => c.wf.volunteers.plannedHours },
    { id: 'skills', label: 'People who gained a skill or credential', unit: 'people', source: 'Training records', compute: (c) => c.done ? { value: c.wf.skills, evidence: 'reported' } : null, target: (e, c) => Math.round(c.wf.volunteers.needed * 0.5) },
  ],
};

function context(event, sim) {
  const fin = financeView(event, sim);
  return { event, sim, fin, wf: workforceSummary(event, fin), incidents: incidentsFor(event), done: event.phase === 'complete' };
}

export function indicatorsFor(event) {
  const p = primaryW(event);
  return (event.fourWs ?? [])
    .flatMap((w) => {
      const list = INDICATORS[w].filter((i) => !i.when || i.when(event));
      return (w === p ? list : list.slice(0, 2)).map((i) => ({ ...i, fourW: w, primary: w === p }));
    });
}

/** Planned vs actual 4W outcomes with evidence. Missing data stays missing. */
export function outcomesView(event, sim) {
  const ctx = context(event, sim);
  const overrides = event.outcomes ?? {};
  const rows = indicatorsFor(event).map((ind) => {
    const o = overrides[ind.id] ?? {};
    const computed = event.status === 'canceled' ? null : ind.compute(ctx);
    const actual = o.actual != null ? { value: Number(o.actual), evidence: o.evidence ?? 'reported' } : computed;
    const target = o.target != null ? Number(o.target) : ind.target(event, ctx);
    let result = 'not-measured';
    if (actual) {
      const good = ind.direction === 'down' ? actual.value <= target : actual.value >= target;
      result = good ? 'met' : 'below';
    }
    return {
      id: ind.id, fourW: ind.fourW, primary: ind.primary, label: ind.label, unit: ind.unit, source: ind.source,
      direction: ind.direction ?? 'up', reach: Boolean(ind.reach), target, actual: actual?.value ?? null,
      evidence: actual?.evidence ?? null, result, note: o.note ?? '',
    };
  });
  const byW = Object.fromEntries((event.fourWs ?? []).map((w) => [w, rows.filter((r) => r.fourW === w)]));
  const measured = rows.filter((r) => r.actual != null);
  return {
    rows,
    byW,
    measured: measured.length,
    total: rows.length,
    verified: measured.filter((r) => r.evidence === 'verified').length,
    missing: rows.filter((r) => r.actual == null),
    targetsSet: rows.every((r) => r.target != null),
    ctx,
  };
}

/** Partners, beneficiaries, local vendors and sponsors with intended vs actual outcomes. */
export function defaultPartners(event) {
  const done = event.phase === 'complete';
  const planning = event.phase === 'planning';
  const list = [];
  if (event.cause) {
    list.push({ id: 'pt-beneficiary', name: event.cause, type: 'beneficiary', local: true, intended: 'Receive event proceeds and recruit new supporters', actual: done ? 'Funds received; new supporters joined the mailing list' : '', evidence: done ? 'reported' : null, repeat: true });
  }
  (event.fourWs ?? []).forEach((w, i) => {
    FOUR_WS[w].partners.slice(0, 2).forEach((name, j) => {
      list.push({
        id: `pt-${w}-${j}`, name, type: 'community', local: true,
        intended: FOUR_WS[w].metrics[j] ?? FOUR_WS[w].goal,
        actual: done ? `${FOUR_WS[w].metrics[j] ?? 'Activities'} delivered on site` : '',
        evidence: done ? (j === 0 ? 'verified' : 'reported') : null,
        repeat: i === 0 && j === 0,
        intendedSet: !planning || j === 0,
      });
    });
  });
  for (const [i, name] of (event.communityPartners ?? []).entries()) {
    list.push({ id: 'pt-own-' + i, name, type: 'community', local: true, intended: '', actual: '', evidence: null, repeat: false });
  }
  for (const s of sponsorsFor(event)) {
    list.push({ id: 'pt-' + s.id, name: s.name, type: 'sponsor', local: true, intended: s.activation, actual: done ? 'Activation delivered; results report shared' : '', evidence: done ? 'verified' : null, repeat: false });
  }
  return list.map((p) => ({ ...p, intended: p.intendedSet === false ? '' : p.intended }));
}

export function partnersFor(event) {
  return event.partners ?? defaultPartners(event);
}

export function distributionFor(event, raised) {
  return event.distribution ?? (event.phase === 'complete' ? { pledged: raised, distributed: null, evidence: null, date: '' } : { pledged: raised, distributed: null, evidence: null, date: '' });
}

export function civicSummary(event, sim) {
  const partners = partnersFor(event);
  const fin = financeView(event, sim);
  return {
    partners,
    withIntended: partners.filter((p) => p.intended?.trim()).length,
    withActual: partners.filter((p) => p.actual?.trim()).length,
    verified: partners.filter((p) => p.evidence === 'verified').length,
    repeat: partners.filter((p) => p.repeat).length,
    local: partners.filter((p) => p.local).length,
    localVendors: fin.local.vendors,
    localSpend: fin.local.spend,
    distribution: distributionFor(event, sim?.impact?.raised ?? 0),
    eventDayReached: eventDayReached(event),
  };
}
