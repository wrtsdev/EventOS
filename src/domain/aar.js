// Post-event learning: After Action Review, corrective actions, results
// snapshots for recurring-event trends, and cloning the next edition.

import { financeView } from './finance.js';
import { workforceSummary } from './workforce.js';
import { incidentsFor, risksFor } from './safety.js';
import { outcomesView } from './civic.js';
import { epicScore } from './epic.js';
import { fulfillment } from './sponsors.js';

export function emptyAAR() {
  return { status: 'draft', wentWell: '', improve: '', safety: '', lessons: '', actions: [], completedBy: '', completedAt: '' };
}

/**
 * Draft built from the event's own records. Every line can be traced back to
 * data; organizers edit and own the final review.
 */
export function draftAAR(event, sim, org) {
  const fin = financeView(event, sim);
  const wf = workforceSummary(event, fin);
  const inc = incidentsFor(event);
  const score = epicScore(event, sim, org);
  const neg = sim?.feedback?.filter((f) => f.sentiment === 'negative') ?? [];
  const pos = sim?.feedback?.filter((f) => f.sentiment === 'positive') ?? [];
  const weakest = [...score.domains].filter((d) => d.score != null).sort((a, b) => a.score - b.score)[0];
  const actions = [];
  for (const f of neg.slice(0, 2)) {
    if (f.theme.includes('Parking')) actions.push({ action: 'Publish a parking and arrival map in the know-before-you-go message', epic: 'I', owner: 'Organizer', why: `${f.mentions} survey mentions of parking confusion.` });
    else if (f.theme.includes('Check-in')) actions.push({ action: 'Add a second packet pickup window the day before', epic: 'I', owner: 'Logistics lead', why: `${f.mentions} survey mentions of long check-in lines.` });
    else if (f.theme.includes('water')) actions.push({ action: 'Add a midpoint water station', epic: 'P', owner: 'Logistics lead', why: `${f.mentions} survey mentions of water on course.` });
  }
  // Use Finance's own overrun flags, which flex per-participant lines to actual turnout.
  for (const f of fin.flags.filter((x) => x.id.startsWith('overrun-'))) {
    const l = fin.expenseLines.find((x) => 'overrun-' + x.id === f.id);
    actions.push({ action: `Re-quote ${l.label.toLowerCase()} earlier`, epic: 'E', owner: 'Finance lead', why: f.detail });
  }
  if (wf.leadsWithoutBackup.length) actions.push({ action: 'Name a backup for every volunteer lead', epic: 'P', owner: 'Volunteer lead', why: `${wf.leadsWithoutBackup.length} leads had no backup.` });
  if (inc.some((i) => i.involvesMinor)) actions.push({ action: 'Add a staffed family reunification point at the finish', epic: 'P', owner: 'Safety lead', why: 'A child was separated from a guardian at the finish.' });
  const missing = outcomesView(event, sim).missing;
  if (missing.length) actions.push({ action: `Plan how to measure: ${missing.map((m) => m.label.toLowerCase()).join(', ')}`, epic: 'C', owner: 'Organizer', why: 'These outcomes had no evidence this year.' });
  return {
    ...emptyAAR(),
    draftedFrom: 'event records',
    wentWell: [
      sim?.finishers ? `${sim.finishers} finishers; average satisfaction ${sim.impact?.avgSatisfaction?.toFixed(1) ?? 'n/a'} of 5.` : '',
      ...pos.slice(0, 2).map((f) => `${f.theme} (${f.mentions} mentions).`),
      fin.actual ? `Net result ${money(fin.actual.net)} against ${money(fin.planned.net)} planned.` : '',
      wf.volunteers.hours ? `${wf.volunteers.hours} volunteer hours; ${wf.paid.positions} paid positions.` : '',
    ].filter(Boolean).join('\n'),
    improve: [
      ...neg.slice(0, 3).map((f) => `${f.theme} (${f.mentions} mentions).`),
      weakest ? `Weakest EPIC area: ${weakest.name} at ${weakest.score}.` : '',
    ].filter(Boolean).join('\n'),
    safety: inc.length ? inc.map((i) => `${i.time} ${i.type} (${i.severity}), ${i.status}.`).join('\n') : 'No incidents recorded.',
    lessons: '',
    actions: actions.map((a, i) => ({ id: 'ca' + (i + 1), status: 'open', due: '', ...a })),
  };
}

function money(n) {
  return (n < 0 ? '−$' : '$') + Math.abs(Math.round(n)).toLocaleString('en-US');
}

export function aarFor(event) {
  return event.aar ?? null;
}

/** Results snapshot stored when the AAR is completed; feeds recurring-event trends. */
export function snapshotFromEvent(event, sim, org) {
  const fin = financeView(event, sim);
  const wf = workforceSummary(event, fin);
  const score = epicScore(event, sim, org);
  return {
    id: 'snap-' + event.id,
    eventId: event.id,
    seriesId: event.seriesId ?? event.id,
    organizationId: event.organizationId,
    name: event.name,
    date: event.date,
    participants: sim?.registered ?? 0,
    finishers: sim?.finishers ?? 0,
    netRevenue: fin.actual?.net ?? fin.planned.net,
    localSpend: fin.local.spend,
    volunteerHours: wf.volunteers.hours,
    raised: sim?.impact?.raised ?? 0,
    cvi: sim?.cvi?.value ?? null,
    epic: score.composite,
    incidents: incidentsFor(event).length,
    sponsorFulfillment: fulfillment(event).rate,
    synthetic: true,
  };
}

function bumpName(name, date) {
  const m = name.match(/(\d{4})/);
  if (m) return name.replace(m[1], String(Number(m[1]) + 1));
  if (date) return `${name} ${Number(date.slice(0, 4)) + 1}`;
  return name + ' (next edition)';
}

function nextYear(date) {
  if (!date) return '';
  const d = new Date(date + 'T12:00:00');
  d.setFullYear(d.getFullYear() + 1);
  return d.toISOString().slice(0, 10);
}

/**
 * Clone a completed event into its next edition: keeps the configuration,
 * budget plan (rebased on actuals), risks, partners and sponsors (as
 * prospects), and turns open corrective actions into checklist controls.
 * The prior event and its reports are not modified.
 */
export function createNextEdition(event, sim, newId) {
  const fin = financeView(event, sim);
  const actions = (event.aar?.actions ?? []).filter((a) => a.status !== 'dropped');
  const budget = {
    contingencyPct: fin.contingencyPct,
    lines: fin.lines.map(({ actualValue, actualSource, ...l }) => ({
      ...l,
      planned: l.kind === 'expense' && actualValue != null ? Math.max(l.planned, Math.round(actualValue)) : l.planned,
      actual: null,
      payment: 'unpaid',
      paymentSet: false,
    })),
  };
  const keep = ['typeId', 'format', 'purpose', 'purposeOther', 'fourWs', 'primaryW', 'location', 'expected', 'cap', 'price', 'visibility', 'description', 'organization', 'cause', 'contact', 'features', 'programming', 'audience', 'organizationId', 'templateId'];
  const base = Object.fromEntries(keep.filter((k) => k in event).map((k) => [k, event[k]]));
  return {
    ...base,
    id: newId,
    name: bumpName(event.name, event.date),
    date: nextYear(event.date),
    phase: 'planning',
    status: 'active',
    seriesId: event.seriesId ?? event.id,
    priorEventId: event.id,
    checklist: {},
    budget,
    risks: risksFor(event).map((r) => ({ ...r, reviewed: false, mitigationStatus: 'suggested' })),
    sponsors: event.sponsors ?? [],
    carryOver: actions.map((a) => ({ ...a, fromEvent: event.name })),
    createdAt: new Date().toISOString(),
  };
}
