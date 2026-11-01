// EPIC operating framework (incorporated methodology) and the EPIC × 4Ws matrix.
//   E  Economic Vitality
//   P  Public Safety & Resilience
//   I  Information & Culture
//   C  Civic Influence
// The 4Ws say why an event matters. EPIC says how it should operate.

import { readiness, applicableChecklist, stageReviews, activeStages } from './controls.js';
import { riskAssessment, riskLevel, incidentsFor } from './safety.js';
import { financeView } from './finance.js';
import { isCanceled } from './eventBasics.js';

export const EPIC_DOMAINS = {
  E: { id: 'E', name: 'Economic Vitality', short: 'Economic', summary: 'Financial viability, revenue protection, local economic impact and responsible use of resources.' },
  P: { id: 'P', name: 'Public Safety & Resilience', short: 'Safety', summary: 'Participant safety, continuity, readiness, redundancy and incident response.' },
  I: { id: 'I', name: 'Information & Culture', short: 'Information', summary: 'Communication, organizational knowledge, cultural relevance, transparency and trust.' },
  C: { id: 'C', name: 'Civic Influence', short: 'Civic', summary: 'Community engagement, accessibility, inclusion, local partnerships and lasting benefit.' },
};
export const EPIC_ORDER = ['E', 'P', 'I', 'C'];

export const DEFAULT_WEIGHTS = { E: 40, P: 20, I: 20, C: 20 };

/**
 * EPIC × 4Ws matrix: all 16 combinations. `primary` marks the associations
 * from the WRTS directive; the others are supporting or contextual, never
 * exclusive.
 */
export const MATRIX = {
  wealth: {
    E: { relevance: 'primary', measures: 'Net event revenue, fundraising, local vendor spend' },
    P: { relevance: 'contextual', measures: 'Essential safety spending protected from cuts' },
    I: { relevance: 'supporting', measures: 'Financial resource information reaching participants' },
    C: { relevance: 'primary', measures: 'Local businesses featured, funds to beneficiaries' },
  },
  wellness: {
    E: { relevance: 'contextual', measures: 'Free or sponsored entry options' },
    P: { relevance: 'primary', measures: 'Safety readiness, incidents, accessibility' },
    I: { relevance: 'primary', measures: 'Health information shared, inclusive programming' },
    C: { relevance: 'supporting', measures: 'Ongoing activity programs with partners' },
  },
  wisdom: {
    E: { relevance: 'contextual', measures: 'Learning programming funded' },
    P: { relevance: 'contextual', measures: 'Safe learning stops on the route' },
    I: { relevance: 'primary', measures: 'Learning engagement, workshops, knowledge outcomes' },
    C: { relevance: 'primary', measures: 'Schools, elders and cultural partners involved' },
  },
  work: {
    E: { relevance: 'primary', measures: 'Paid opportunities, local contracts' },
    P: { relevance: 'supporting', measures: 'Crew training and safe working conditions' },
    I: { relevance: 'supporting', measures: 'Career resources and mentoring shared' },
    C: { relevance: 'primary', measures: 'Volunteer development, workforce partners engaged' },
  },
};

const WEIGHT = { critical: 3, standard: 2, nice: 1 };
const CREDIT = { done: 1, attention: 0.4, blocking: 0, open: 0 };

export function weightsFor(org) {
  const w = { ...DEFAULT_WEIGHTS, ...(org?.epicWeights ?? {}) };
  const sum = EPIC_ORDER.reduce((a, d) => a + (Number(w[d]) || 0), 0);
  return { weights: w, sum, valid: sum === 100 && EPIC_ORDER.every((d) => Number(w[d]) >= 0) };
}

/**
 * Critical risks are reported on their own and never averaged away:
 * unfinished critical controls, unreviewed high risks, essential spending
 * below minimum, and open serious incidents.
 */
export function criticalRisks(event, sim) {
  if (isCanceled(event)) return [];
  const items = applicableChecklist(event, sim).filter((i) => i.weight === 'critical' && i.status !== 'done');
  const out = items.map((i) => ({ id: 'ctl-' + i.id, epic: i.epic, title: i.label, detail: i.status === 'open' ? 'Not assessed yet' : i.status === 'blocking' ? 'Blocked' : 'In progress', kind: 'control', control: i }));
  const ra = riskAssessment(event);
  for (const r of ra.risks.filter((x) => riskLevel(x) === 'high' && (!x.reviewed || !x.owner))) {
    out.push({ id: 'risk-' + r.id, epic: 'P', title: `High risk not reviewed: ${r.hazard}`, detail: 'Needs an owner and an agreed mitigation.', kind: 'risk' });
  }
  for (const f of financeView(event, sim).flags.filter((x) => x.severity === 'critical')) {
    out.push({ id: 'fin-' + f.id, epic: 'P', title: f.title, detail: f.detail, kind: 'finance' });
  }
  for (const i of incidentsFor(event).filter((x) => x.status !== 'closed' && x.severity !== 'minor')) {
    out.push({ id: 'inc-' + i.id, epic: 'P', title: `Open ${i.severity} incident: ${i.type}`, detail: 'Restricted record. Close it with actions recorded.', kind: 'incident', restricted: true });
  }
  return out;
}

/**
 * EPIC Operational Health Score.
 * Domain score = earned weight ÷ total applicable weight. Unassessed controls
 * earn nothing and are listed, so missing data can never raise a score.
 */
export function epicScore(event, sim, org) {
  const { weights, sum, valid } = weightsFor(org);
  const items = applicableChecklist(event, sim);
  const domains = EPIC_ORDER.map((d) => {
    const list = items.filter((i) => i.epic === d);
    const total = list.reduce((a, i) => a + WEIGHT[i.weight], 0);
    const earned = list.reduce((a, i) => a + WEIGHT[i.weight] * CREDIT[i.status], 0);
    const assessedW = list.filter((i) => i.assessed).reduce((a, i) => a + WEIGHT[i.weight], 0);
    return {
      ...EPIC_DOMAINS[d],
      weight: Number(weights[d]) || 0,
      score: total ? Math.round((earned / total) * 100) : null,
      coverage: total ? assessedW / total : 0,
      controls: list,
      unassessed: list.filter((i) => !i.assessed),
      openCritical: list.filter((i) => i.weight === 'critical' && i.status !== 'done'),
    };
  });
  const scored = domains.filter((d) => d.score != null);
  const wsum = scored.reduce((a, d) => a + d.weight, 0);
  const composite = wsum ? Math.round(scored.reduce((a, d) => a + d.score * d.weight, 0) / wsum) : null;
  const coverage = items.length ? items.filter((i) => i.assessed).length / items.length : 0;
  const critical = criticalRisks(event, sim);
  const canceled = isCanceled(event);
  return {
    composite,
    coverage,
    domains,
    weights,
    weightsValid: valid,
    weightSum: sum,
    critical,
    clearance: canceled ? 'canceled' : critical.length ? 'blocked' : coverage < 0.6 ? 'insufficient-data' : 'clear',
    band: composite == null ? 'No data' : composite >= 85 ? 'Strong' : composite >= 70 ? 'Solid' : composite >= 50 ? 'Developing' : 'At risk',
  };
}

export const CLEARANCE = {
  clear: { label: 'No critical risks open', tone: 'good' },
  blocked: { label: 'Critical risks open', tone: 'bad' },
  'insufficient-data': { label: 'Not enough assessed to judge', tone: 'warn' },
  canceled: { label: 'Event canceled', tone: 'neutral' },
};

/** Heatmap rows: EPIC domain × stage, cell = share complete. */
export function epicHeatmap(event, sim) {
  const reviews = stageReviews(event, sim);
  const active = activeStages(event);
  return EPIC_ORDER.map((d) => ({
    domain: EPIC_DOMAINS[d],
    cells: reviews.map((s) => {
      const items = s.items.filter((i) => i.epic === d && i.stage === s.id);
      const done = items.filter((i) => i.status === 'done').length;
      const crit = items.filter((i) => i.weight === 'critical' && i.status !== 'done').length;
      return { stage: s.id, label: s.short, total: items.length, done, critical: crit, rate: items.length ? done / items.length : null, future: !active.includes(s.id) };
    }),
  }));
}

/** Matrix rows for the event: which EPIC controls support each selected W. */
export function matrixFor(event, sim) {
  const items = applicableChecklist(event, sim, { includeAll: true });
  return (event.fourWs ?? []).map((w) => ({
    fourW: w,
    cells: EPIC_ORDER.map((d) => {
      const list = items.filter((i) => i.epic === d);
      return { domain: d, ...MATRIX[w][d], done: list.filter((i) => i.status === 'done').length, total: list.length };
    }),
  }));
}

/** Snapshot recorded at a staged review: the EPIC score history. */
export function reviewSnapshot(event, sim, org, stage, by) {
  const s = epicScore(event, sim, org);
  return {
    stage,
    at: new Date().toISOString(),
    by,
    composite: s.composite,
    coverage: Math.round(s.coverage * 100),
    domains: Object.fromEntries(s.domains.map((d) => [d.id, d.score])),
    criticalOpen: s.critical.length,
    readiness: readiness(event, sim).score,
  };
}
