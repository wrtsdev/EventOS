// EPIC operating controls. One list powers the Blueprint checklist, staged
// readiness reviews and the EPIC scorecard.
//
// Status values (stored per event in event.checklist):
//   undefined   not assessed yet (never counted as favorable)
//   attention   in progress
//   done        complete
//   blocking    blocked / problem found
// Some controls are calculated from event records (`auto`); those cannot be
// overridden by hand and show the record they were calculated from.

import { isPhysical, isTimed, expectedCount, sizeBand } from './eventBasics.js';
import { getEventType } from './catalog.js';
import { financeView } from './finance.js';
import { riskAssessment, contactsStatus, weatherFor, incidentsFor } from './safety.js';
import { workforceSummary } from './workforce.js';
import { commsSummary } from './comms.js';
import { partnersFor, outcomesView } from './civic.js';
import { sponsorsFor } from './sponsors.js';

export const STATUS = {
  open: { id: 'open', label: 'Not assessed', tone: 'neutral' },
  attention: { id: 'attention', label: 'In progress', tone: 'warn' },
  done: { id: 'done', label: 'Complete', tone: 'good' },
  blocking: { id: 'blocking', label: 'Blocked', tone: 'bad' },
};

export const STAGES = [
  { id: 'planning', label: 'Planning review', short: 'Planning', minDue: 45 },
  { id: 't30', label: '30 days before', short: '30 days', minDue: 30 },
  { id: 't7', label: '7 days before', short: '7 days', minDue: 7 },
  { id: 'eventday', label: 'Event day', short: 'Event day', minDue: 0 },
  { id: 'closure', label: 'Post-event closure', short: 'Closure', minDue: -Infinity },
];

const all = () => true;
const feat = (id) => (e) => e.features?.includes(id);
const hasSponsors = (e) => sponsorsFor(e).length > 0;

/**
 * Each control: id, label, epic (E|P|I|C), weight (critical|standard|nice),
 * due (days before event), stage ('eventday'|'closure' for those phases),
 * owner, informational (needs local verification), when, help, auto.
 */
export const CHECKLIST_ITEMS = [
  // ---------- Economic Vitality ----------
  { id: 'registration', label: 'Registration page live', epic: 'E', weight: 'critical', due: 56, owner: 'Organizer', when: all,
    help: 'Connect your registration provider or use EventOS registration. Participants flow into Passport automatically.' },
  { id: 'budget', label: 'Budget reviewed and approved', epic: 'E', weight: 'critical', due: 60, owner: 'Finance lead', when: all,
    help: 'Review every line in Finance, set contingency, then approve. Approval is recorded with your name.' },
  { id: 'essential-funded', label: 'Safety and staffing spending fully funded', epic: 'E', weight: 'critical', due: 60, owner: 'Finance lead', when: isPhysical,
    help: 'EMS, insurance, permits and traffic control must stay at or above their minimums, whatever else is cut.',
    auto: (e, x) => (x.fin().essentialAtRisk ? 'blocking' : 'done'), autoSource: 'Finance: essential lines vs minimums' },
  { id: 'break-even', label: 'Break-even is reachable', epic: 'E', weight: 'standard', due: 45, owner: 'Finance lead', when: all,
    help: 'Break-even should sit comfortably below your registration goal, or sponsorship should cover fixed costs.',
    auto: (e, x) => { const f = x.fin(); const n = expectedCount(e); if (f.breakEven == null) return 'blocking'; return f.breakEven <= n * 0.85 ? 'done' : f.breakEven <= n ? 'attention' : 'blocking'; }, autoSource: 'Finance: break-even vs goal' },
  { id: 'payment-setup', label: 'Payouts and refund policy set', epic: 'E', weight: 'standard', due: 56, owner: 'Finance lead', when: (e) => Number(e.price ?? 0) > 0,
    help: 'Confirm where registration money lands, when it pays out, and your refund and weather-cancellation policy.' },
  { id: 'cash-flow', label: 'Up-front cash covered', epic: 'E', weight: 'nice', due: 45, owner: 'Finance lead', when: all,
    help: 'Deposits often come due before registration money arrives.',
    auto: (e, x) => (x.fin().lowPoint >= 0 ? 'done' : 'attention'), autoSource: 'Finance: cash-flow low point' },
  { id: 'vendors', label: 'Vendor agreements confirmed', epic: 'E', weight: 'standard', due: 21, owner: 'Logistics lead', when: isPhysical,
    help: 'Tents, restrooms, sound, food. Confirm delivery times and price in writing.' },
  { id: 'local-vendors', label: 'Local vendors invited first', epic: 'E', weight: 'nice', due: 42, owner: 'Logistics lead', when: isPhysical,
    help: 'Ask neighborhood businesses before regional suppliers. Local spend is tracked separately in Finance.' },
  { id: 'sponsors', label: 'Sponsor activation planned', epic: 'E', weight: 'standard', due: 28, owner: 'Partnerships lead', when: feat('sponsors'),
    help: 'Give each sponsor something measurable to do: a booth, a promo code, a challenge, a survey question.' },
  { id: 'shirts', label: 'Shirt order placed', epic: 'E', weight: 'nice', due: 28, owner: 'Organizer', when: feat('shirts'),
    help: 'Most printers need final counts and sizes 3–4 weeks out.' },
  { id: 'medals', label: 'Medals ordered', epic: 'E', weight: 'nice', due: 42, owner: 'Organizer', when: feat('medals'),
    help: 'Custom medals often take 6 weeks.' },

  // ---------- Public Safety & Resilience ----------
  { id: 'waiver', label: 'Participant waiver', epic: 'P', weight: 'critical', due: 42, owner: 'Organizer', informational: true, when: all,
    help: 'Every participant accepts a waiver at registration. Have your legal advisor or insurer review the wording.' },
  { id: 'insurance', label: 'Event insurance certificate', epic: 'P', weight: 'critical', due: 42, owner: 'Organizer', informational: true, when: isPhysical,
    help: 'Most parks and cities require a certificate of liability insurance naming them as additional insured. Ask your venue for the required limits.' },
  { id: 'permits', label: 'Event or park permit', epic: 'P', weight: 'critical', due: 60, owner: 'Organizer', informational: true, when: isPhysical,
    help: 'Contact your parks and recreation department or city special-events office. Lead times often run 30–90 days.' },
  { id: 'route', label: 'Course or route approved', epic: 'P', weight: 'critical', due: 45, owner: 'Course lead', informational: true, when: (e) => isPhysical(e) && getEventType(e.typeId).miles > 0,
    help: 'Share a route map with the permitting office and police. Road closures usually need separate approval.' },
  { id: 'risk-assessment', label: 'Risk assessment complete', epic: 'P', weight: 'critical', due: 45, owner: 'Safety lead', informational: true, when: all,
    help: 'Review every suggested risk in Safety, give each an owner and a mitigation. Suggestions do not count until reviewed.',
    auto: (e, x) => { const r = x.risk(); if (!r.anyReviewed) return undefined; if (r.complete) return 'done'; return r.highUnreviewed.length ? 'blocking' : 'attention'; }, autoSource: 'Safety: risk register' },
  { id: 'ems', label: 'EMS and first-aid plan', epic: 'P', weight: 'critical', due: 30, owner: 'Safety lead', informational: true, when: isPhysical,
    help: 'Arrange first aid at start/finish and know the nearest hospital. Larger or timed events often need an ambulance on standby.' },
  { id: 'contacts', label: 'Emergency contact directory confirmed', epic: 'P', weight: 'critical', due: 21, owner: 'Safety lead', when: all,
    help: 'Every required role has a confirmed name and phone number.',
    auto: (e, x) => { const c = x.contacts(); if (c.confirmed === 0) return undefined; return c.complete ? 'done' : 'attention'; }, autoSource: 'Safety: emergency contacts' },
  { id: 'emergency', label: 'Emergency and weather plan', epic: 'P', weight: 'critical', due: 21, owner: 'Safety lead', informational: true, when: isPhysical,
    help: 'Decide who can delay or cancel, the criteria, how you will tell participants, and where people shelter in severe weather.' },
  { id: 'security', label: 'Police or traffic support', epic: 'P', weight: 'standard', due: 30, owner: 'Safety lead', informational: true,
    when: (e) => isPhysical(e) && (isTimed(e) || expectedCount(e) >= 300),
    help: 'Street crossings and closures typically need officers or certified traffic control.' },
  { id: 'accessibility', label: 'Accessibility and accommodation plan', epic: 'P', weight: 'standard', due: 30, owner: 'Accessibility lead', when: all,
    help: 'Accessible route or format, seating, restrooms, interpreters on request, and how people ask for accommodations.' },
  { id: 'redundancy', label: 'Backup named for every lead', epic: 'P', weight: 'standard', due: 14, owner: 'Volunteer lead', when: all,
    help: 'If a lead cannot come, their backup already knows the plan.',
    auto: (e, x) => (x.wf().leadsWithoutBackup.length ? 'attention' : 'done'), autoSource: 'Workforce: leads and backups' },
  { id: 'volunteers', label: 'Volunteer roles assigned', epic: 'P', weight: 'standard', due: 14, owner: 'Volunteer lead', when: (e) => isPhysical(e) || e.features?.includes('volunteers'),
    help: 'Plan roughly 1 volunteer for every 15–25 participants: registration, course marshals, water, finish line, cleanup.' },
  { id: 'training', label: 'Required training complete', epic: 'P', weight: 'standard', due: 7, owner: 'Volunteer lead', when: isPhysical,
    help: 'Marshals and check-in volunteers complete the safety and route briefing.',
    auto: (e, x) => { const t = x.wf().training; if (!t.required) return 'done'; if (!t.trained) return undefined; return t.rate >= 0.9 ? 'done' : 'attention'; }, autoSource: 'Workforce: training records' },
  { id: 'hydration', label: 'Water and hydration stations', epic: 'P', weight: 'standard', due: 14, owner: 'Logistics lead', when: (e) => isPhysical(e) && getEventType(e.typeId).miles >= 2,
    help: 'Plan water at start/finish and about every 1.5 miles. A natural sponsor placement.' },
  { id: 'timing', label: 'Timing provider booked', epic: 'P', weight: 'standard', due: 45, owner: 'Organizer', when: isTimed,
    help: 'EventOS does not time races. Book a local timing company; results import through the Integration Gateway.' },
  { id: 'mile-logging', label: 'Mile logging set up', epic: 'P', weight: 'critical', due: 21, owner: 'Organizer', when: (e) => !isPhysical(e) || e.format === 'hybrid',
    help: 'Virtual participants log miles in Passport or through a connected fitness app.' },

  // ---------- Information & Culture ----------
  { id: 'comms', label: 'Participant communication timeline', epic: 'I', weight: 'standard', due: 56, owner: 'Organizer', when: all,
    help: 'Announcement, early registration, team push, know-before-you-go, thank-you and survey.' },
  { id: 'comms-coverage', label: 'Every audience has an approved message', epic: 'I', weight: 'standard', due: 21, owner: 'Organizer', when: all,
    help: 'Participants, volunteers, sponsors, partners and neighbors each need at least one approved message.',
    auto: (e, x) => { const c = x.comms(); if (c.coverage === 0) return undefined; return c.coverage >= 1 ? 'done' : 'attention'; }, autoSource: 'Communications: coverage by audience' },
  { id: 'questions', label: 'Open questions answered', epic: 'I', weight: 'nice', due: 7, owner: 'Organizer', when: all,
    help: 'Answer what people are asking and add it to the FAQ.',
    auto: (e, x) => (x.comms().openQuestions.length ? 'attention' : 'done'), autoSource: 'Communications: open questions' },
  { id: 'briefing-pack', label: 'Volunteer briefing pack sent', epic: 'I', weight: 'standard', due: 7, owner: 'Volunteer lead', when: (e) => isPhysical(e) || e.features?.includes('volunteers'),
    help: 'Map, radio channels, emergency and lost-child protocol, run of show.' },
  { id: 'language-access', label: 'Language and accessible formats ready', epic: 'I', weight: 'nice', due: 21, owner: 'Organizer', when: all,
    help: 'Translate key messages for the languages your community speaks; provide large-print and screen-reader-friendly versions.' },
  { id: 'packet', label: 'Packet pickup plan', epic: 'I', weight: 'nice', due: 10, owner: 'Logistics lead', when: isPhysical,
    help: 'Pick a time and place before race day to reduce morning lines.' },
  { id: 'survey', label: 'Post-event survey ready', epic: 'I', weight: 'nice', due: 7, owner: 'Organizer', when: feat('surveys'),
    help: 'EventOS drafts questions from your 4W goals. Keep it under 3 minutes.' },
  { id: 'awards', label: 'Awards plan', epic: 'I', weight: 'nice', due: 14, owner: 'Organizer', when: feat('awards'),
    help: 'Decide categories, including community awards (largest team, top fundraiser, best spirit).' },

  // ---------- Civic Influence ----------
  { id: 'cause', label: 'Beneficiary agreement', epic: 'C', weight: 'standard', due: 45, owner: 'Organizer', when: (e) => Boolean(e.cause),
    help: 'Agree in writing how funds are shared, how the cause is described, and what impact evidence you will exchange.' },
  { id: 'fourw-partners', label: '4W programming partners confirmed', epic: 'C', weight: 'standard', due: 28, owner: 'Program lead', when: (e) => (e.fourWs?.length ?? 0) > 0,
    help: 'Confirm the partners who will run your Wellness, Wealth, Wisdom or Work activities.' },
  { id: 'partner-outcomes', label: 'Intended outcomes agreed with partners', epic: 'C', weight: 'standard', due: 28, owner: 'Program lead', when: (e) => partnersFor(e).length > 0,
    help: 'Before the event, write down what each partner expects to achieve and what evidence they will share.',
    auto: (e) => { const p = partnersFor(e); const n = p.filter((x) => x.intended?.trim()).length; if (!n) return undefined; return n === p.length ? 'done' : 'attention'; }, autoSource: 'Community: partner records' },
  { id: 'outcome-targets', label: '4W outcome targets set', epic: 'C', weight: 'standard', due: 45, owner: 'Organizer', when: (e) => (e.fourWs?.length ?? 0) > 0,
    help: 'Each 4W indicator has a target so results can be compared with intent.',
    auto: (e, x) => (x.outcomes().targetsSet ? 'done' : 'attention'), autoSource: '4W outcome targets' },
  { id: 'community-notice', label: 'Neighbors and businesses notified', epic: 'C', weight: 'standard', due: 14, owner: 'Organizer', when: (e) => isPhysical(e) && sizeBand(e) !== 'small',
    help: 'Tell residents and businesses along the route about closures, times and a number to call.' },
  { id: 'comms-plan-partners', label: 'Partner and sponsor communications planned', epic: 'C', weight: 'nice', due: 42, owner: 'Partnerships lead', when: hasSponsors,
    help: 'Welcome, deliverables timeline and results report for every sponsor and partner.' },
  { id: 'followup', label: 'What happens next plan', epic: 'C', weight: 'nice', due: 7, owner: 'Organizer', when: all,
    help: 'Decide the next experience you will invite participants into before race day.' },

  // ---------- Event day ----------
  { id: 'weather-go', label: 'Weather go / no-go decision recorded', epic: 'P', weight: 'critical', stage: 'eventday', due: 0, owner: 'Organizer on duty', when: isPhysical,
    help: 'Record the decision, who made it and when.',
    auto: (e) => { const w = weatherFor(e); if (!e.weather) return undefined; return ['go', 'modified', 'cancel'].includes(w.status) ? 'done' : 'attention'; }, autoSource: 'Event day: weather decision' },
  { id: 'safety-briefing', label: 'Safety briefing held', epic: 'P', weight: 'critical', stage: 'eventday', due: 0, owner: 'Safety lead', when: isPhysical,
    help: 'All leads, EMS and marshals briefed on radio channels, emergency and lost-child protocol.' },
  { id: 'radio-check', label: 'Radio and phone check', epic: 'P', weight: 'standard', stage: 'eventday', due: 0, owner: 'Safety lead', when: isPhysical,
    help: 'Every station answers on the radio or phone tree before start.' },
  { id: 'checkin-open', label: 'Check-in open with offline backup', epic: 'I', weight: 'standard', stage: 'eventday', due: 0, owner: 'Check-in lead', when: all,
    help: 'Printed or offline participant list ready in case connectivity fails.' },

  // ---------- Post-event closure ----------
  { id: 'incidents-closed', label: 'All incidents documented and closed', epic: 'P', weight: 'critical', stage: 'closure', due: -7, owner: 'Safety lead', when: all,
    help: 'Every incident has actions recorded and follow-up complete.',
    auto: (e) => (incidentsFor(e).some((i) => i.status !== 'closed') ? 'blocking' : 'done'), autoSource: 'Incident log' },
  { id: 'vendors-paid', label: 'Vendors and contractors paid', epic: 'E', weight: 'standard', stage: 'closure', due: -14, owner: 'Finance lead', when: all,
    help: 'Settle every invoice; local vendors first.',
    auto: (e, x) => (x.fin().expenseLines.every((l) => l.payment === 'paid') ? 'done' : 'attention'), autoSource: 'Finance: payment status' },
  { id: 'actuals-entered', label: 'Actual revenue and expenses entered', epic: 'E', weight: 'standard', stage: 'closure', due: -14, owner: 'Finance lead', when: all,
    help: 'Replace estimates with actuals so the scorecard compares plan to result.' },
  { id: 'funds-distributed', label: 'Funds distributed to beneficiary', epic: 'C', weight: 'standard', stage: 'closure', due: -30, owner: 'Finance lead', when: (e) => Boolean(e.cause),
    help: 'Record the amount, date and confirmation from the beneficiary.',
    auto: (e) => { const d = e.distribution; if (!d || d.distributed == null) return undefined; return d.evidence === 'verified' ? 'done' : 'attention'; }, autoSource: 'Beneficiary distribution record' },
  { id: 'outcomes-evidence', label: '4W outcomes measured with evidence', epic: 'C', weight: 'standard', stage: 'closure', due: -21, owner: 'Organizer', when: (e) => (e.fourWs?.length ?? 0) > 0,
    help: 'Enter results for every indicator and mark how each is evidenced.',
    auto: (e, x) => { const o = x.outcomes(); if (!o.measured) return undefined; return o.missing.length ? 'attention' : 'done'; }, autoSource: '4W outcomes' },
  { id: 'hours-recorded', label: 'Volunteer and staff hours recorded', epic: 'C', weight: 'nice', stage: 'closure', due: -7, owner: 'Volunteer lead', when: all,
    help: 'Confirm hours so volunteers get recognition and the Work outcomes are verified.' },
  { id: 'aar', label: 'After Action Review complete', epic: 'I', weight: 'standard', stage: 'closure', due: -21, owner: 'Organizer', when: all,
    help: 'Capture what worked, what to change, and corrective actions with owners.',
    auto: (e) => (e.aar?.status === 'complete' ? 'done' : e.aar ? 'attention' : undefined), autoSource: 'After Action Review' },
  { id: 'handoff', label: 'Handoff notes and documents filed', epic: 'I', weight: 'nice', stage: 'closure', due: -21, owner: 'Organizer', when: all,
    help: 'So next year’s team does not start from zero.',
    auto: (e, x) => { const c = x.comms(); return c.handoff && !c.missingDocs.length ? 'done' : c.handoff ? 'attention' : undefined; }, autoSource: 'Handoff notes + documents' },
];

/** Carry-over controls created from last edition's corrective actions. */
function carryOverControls(event) {
  return (event.carryOver ?? []).map((a) => ({
    id: 'carry-' + a.id,
    label: a.action,
    epic: a.epic ?? 'I',
    weight: 'standard',
    due: 30,
    owner: a.owner || 'Organizer',
    when: all,
    carryOver: true,
    help: `Corrective action from ${a.fromEvent ?? 'the last edition'}. ${a.why ?? ''}`.trim(),
  }));
}

/** Lazily computed context for auto controls. */
function makeCtx(event, sim) {
  const memo = {};
  const once = (k, fn) => () => (memo[k] ??= fn());
  const fin = once('fin', () => financeView(event, sim));
  return {
    fin,
    risk: once('risk', () => riskAssessment(event)),
    contacts: once('contacts', () => contactsStatus(event)),
    wf: once('wf', () => workforceSummary(event, fin())),
    comms: once('comms', () => commsSummary(event)),
    outcomes: once('outcomes', () => outcomesView(event, sim)),
  };
}

function stageOf(item) {
  if (item.stage) return item.stage;
  return item.due >= 45 ? 'planning' : item.due >= 30 ? 't30' : 't7';
}

/** Which stages count for the event's current phase. */
export function activeStages(event) {
  if (event.phase === 'complete') return ['planning', 't30', 't7', 'eventday', 'closure'];
  if (event.phase === 'eventday') return ['planning', 't30', 't7', 'eventday'];
  return ['planning', 't30', 't7'];
}

export function applicableChecklist(event, sim, { includeAll = false } = {}) {
  const ctx = makeCtx(event, sim);
  const stages = activeStages(event);
  return [...CHECKLIST_ITEMS, ...carryOverControls(event)]
    .filter((item) => item.when(event))
    .map((item) => {
      const stage = stageOf(item);
      let status = event.checklist?.[item.id];
      let auto = false;
      if (item.auto) {
        auto = true;
        status = item.auto(event, ctx);
      }
      const severity = item.weight;
      return { ...item, stage, severity, status: status ?? 'open', assessed: status != null, auto };
    })
    .filter((item) => includeAll || stages.includes(item.stage));
}

const WEIGHT = { critical: 3, standard: 2, nice: 1 };
const CREDIT = { done: 1, attention: 0.4, blocking: 0, open: 0 };

/**
 * Readiness for the current phase. "Blocking" means a critical control that
 * is not complete, whether unassessed, in progress or blocked.
 */
export function readiness(event, sim) {
  const items = applicableChecklist(event, sim);
  let total = 0;
  let earned = 0;
  for (const item of items) {
    total += WEIGHT[item.weight];
    earned += WEIGHT[item.weight] * CREDIT[item.status];
  }
  const score = total === 0 ? 0 : Math.round((earned / total) * 100);
  const missing = items.filter((i) => i.status !== 'done');
  return {
    score,
    items,
    done: items.filter((i) => i.status === 'done').length,
    blocking: missing.filter((i) => i.weight === 'critical'),
    attention: missing.filter((i) => i.weight !== 'critical'),
    unassessed: items.filter((i) => !i.assessed),
    missing,
  };
}

export function nextStatus(status) {
  if (status === 'attention') return 'done';
  if (status === 'done') return 'blocking';
  return 'attention'; // open or blocking → in progress
}

/** Staged readiness review: what must be complete by each checkpoint. */
export function stageReviews(event, sim) {
  const items = applicableChecklist(event, sim, { includeAll: true });
  return STAGES.map((s) => {
    const due = items.filter((i) => (s.id === 'eventday' ? i.stage !== 'closure' : s.id === 'closure' ? true : STAGES.findIndex((x) => x.id === i.stage) <= STAGES.findIndex((x) => x.id === s.id)));
    const outstanding = due.filter((i) => i.status !== 'done');
    return {
      ...s,
      items: due,
      done: due.length - outstanding.length,
      outstanding,
      critical: outstanding.filter((i) => i.weight === 'critical'),
      recorded: (event.reviews ?? []).find((r) => r.stage === s.id) ?? null,
    };
  });
}
