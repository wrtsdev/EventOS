// Public Safety & Resilience engine: risk register, emergency contacts,
// weather decisions and incident records. Planning support only: it is not
// an official emergency certification or legal approval.

import { isPhysical, isTimed, expectedCount } from './eventBasics.js';

const PHYSICAL_RISKS = [
  { id: 'heat', hazard: 'Heat illness or extreme weather', category: 'Weather', likelihood: 2, impact: 3, mitigation: 'Water every 1.5 miles, cooling station at finish, start before 9am in warm months, medical team briefed on heat illness.', owner: 'Safety lead' },
  { id: 'lightning', hazard: 'Severe weather or lightning', category: 'Weather', likelihood: 2, impact: 3, mitigation: 'Written go / delay / cancel criteria, 30-30 lightning rule, shelter locations mapped, delay and cancel messages drafted in advance.', owner: 'Organizer on duty' },
  { id: 'traffic', hazard: 'Vehicle traffic at crossings', category: 'Course', likelihood: 2, impact: 3, mitigation: 'Officers or certified flaggers at every open crossing, cones and signage, closure approved with the city.', owner: 'Course lead', when: (e) => isTimed(e) || expectedCount(e) >= 150 },
  { id: 'medical', hazard: 'Medical emergency on course', category: 'Medical', likelihood: 2, impact: 3, mitigation: 'EMS at start/finish, sweep cyclist or cart, AED locations marked, radio protocol to reach medical in under 3 minutes.', owner: 'Medical lead' },
  { id: 'crowding', hazard: 'Crowding at start or finish', category: 'Crowd', likelihood: 2, impact: 2, mitigation: 'Pace corrals, walkers start last, clear finish chute, marshals at the chute exit.', owner: 'Course lead', when: (e) => expectedCount(e) >= 200 },
  { id: 'lost-child', hazard: 'Child separated from guardian', category: 'People', likelihood: 1, impact: 3, mitigation: 'Reunification point at info tent, wristbands with guardian phone, every volunteer briefed on the protocol.', owner: 'Safety lead' },
  { id: 'marking', hazard: 'Course marking error', category: 'Course', likelihood: 2, impact: 2, mitigation: 'Course walk the day before, marshals at every turn, lead bike.', owner: 'Course lead', when: (e) => (e.typeId ?? '') !== 'workshop' },
  { id: 'key-person', hazard: 'Key lead unavailable on event day', category: 'Continuity', likelihood: 2, impact: 2, mitigation: 'Named backup for every lead, shared run-of-show, contact sheet printed.', owner: 'Organizer' },
  { id: 'power', hazard: 'Power or sound failure', category: 'Continuity', likelihood: 1, impact: 1, mitigation: 'Backup generator or battery megaphones at start and finish.', owner: 'Logistics lead' },
  { id: 'access-barrier', hazard: 'Accessibility barrier on site or route', category: 'Access', likelihood: 2, impact: 2, mitigation: 'Accessible route option, seating, accessible restroom, ASL on request, large-print maps.', owner: 'Accessibility lead' },
];
const COMMON_RISKS = [
  { id: 'outage', hazard: 'Registration or payment system outage', category: 'Continuity', likelihood: 1, impact: 2, mitigation: 'Export the participant list the day before; paper check-in backup; manual payment log.', owner: 'Organizer' },
];
const VIRTUAL_RISKS = [
  { id: 'self-route', hazard: 'Injury on self-chosen routes', category: 'People', likelihood: 1, impact: 2, mitigation: 'Safety guidance in welcome email; waiver covers self-directed activity; encourage daylight and buddy walks.', owner: 'Organizer' },
  { id: 'platform', hazard: 'Mile-logging platform unavailable', category: 'Continuity', likelihood: 1, impact: 2, mitigation: 'Manual submission form as fallback; extend the logging window.', owner: 'Organizer' },
];

export function riskLibrary(event) {
  const base = isPhysical(event) ? PHYSICAL_RISKS : VIRTUAL_RISKS;
  return [...base, ...COMMON_RISKS].filter((r) => !r.when || r.when(event));
}

/**
 * Risk register. New events start with suggested risks that are NOT yet
 * reviewed: suggestions are never counted as an assessment.
 */
export function defaultRisks(event) {
  const lib = riskLibrary(event);
  const reviewedCount = event.phase === 'planning' ? event.seed?.risksReviewed ?? 0 : lib.length;
  return lib.map(({ when, ...r }, i) => ({
    ...r,
    reviewed: i < reviewedCount,
    owner: i < reviewedCount ? r.owner : '',
    mitigationStatus: i < reviewedCount ? (event.phase === 'planning' ? 'planned' : 'in-place') : 'suggested',
  }));
}

export function risksFor(event) {
  return event.risks ?? defaultRisks(event);
}

export function riskLevel(r) {
  const s = r.likelihood * r.impact;
  return s >= 6 ? 'high' : s >= 3 ? 'medium' : 'low';
}

export function riskAssessment(event) {
  const risks = risksFor(event);
  const incomplete = risks.filter((r) => !r.reviewed || !r.owner || !r.mitigation?.trim());
  const highUnreviewed = incomplete.filter((r) => riskLevel(r) === 'high');
  const heat = [3, 2, 1].map((l) => [1, 2, 3].map((i) => risks.filter((r) => r.likelihood === l && r.impact === i)));
  return {
    risks,
    incomplete,
    highUnreviewed,
    reviewed: risks.length - incomplete.length,
    complete: incomplete.length === 0 && risks.length > 0,
    anyReviewed: risks.some((r) => r.reviewed),
    heat,
  };
}

export function requiredContacts(event) {
  return isPhysical(event)
    ? ['EMS / medical provider', 'Police non-emergency / traffic', 'Venue or park manager', 'Event safety lead', 'Backup safety lead', 'Weather monitor', 'Organizer on duty']
    : ['Organizer on duty', 'Backup organizer', 'Platform support'];
}

const SAMPLE_NAMES = ['Station 14 Supervisor', 'Sgt. L. Owens', 'Parks Ops Desk', 'Tamara Greene', 'Victor Hale', 'Andre Simmons', 'Dana Whitfield', 'Support desk'];

export function defaultContacts(event) {
  const req = requiredContacts(event);
  const confirmed = event.phase === 'planning' ? event.seed?.contactsConfirmed ?? 0 : req.length;
  return req.map((role, i) => ({
    role,
    name: i < confirmed ? SAMPLE_NAMES[i % SAMPLE_NAMES.length] : '',
    phone: i < confirmed ? `555-01${String(10 + i).padStart(2, '0')}` : '',
    confirmed: i < confirmed,
  }));
}

export function contactsFor(event) {
  return event.contacts ?? defaultContacts(event);
}

export function contactsStatus(event) {
  const c = contactsFor(event);
  const confirmed = c.filter((x) => x.confirmed && x.name && x.phone).length;
  return { contacts: c, confirmed, total: c.length, complete: confirmed === c.length && c.length > 0 };
}

export const WEATHER_STATUS = {
  go: { label: 'Go as planned', tone: 'good' },
  monitor: { label: 'Monitoring', tone: 'warn' },
  delay: { label: 'Delayed', tone: 'warn' },
  modified: { label: 'Modified course or format', tone: 'warn' },
  cancel: { label: 'Canceled for weather', tone: 'bad' },
};

export function weatherFor(event) {
  return event.weather ?? { status: event.phase === 'complete' ? 'go' : 'monitor', note: '', decidedBy: '' };
}

/** Synthetic incidents for completed demo events. */
export function defaultIncidents(event) {
  if (event.phase !== 'complete' || !isPhysical(event)) return [];
  return [
    { id: 'inc-1', time: '09:12', type: 'Medical', severity: 'minor', summary: 'Participant felt dizzy near mile 1.5; treated for dehydration at the medical tent and released.', actions: 'Water and shade; EMS assessed; participant finished walking with a volunteer.', status: 'closed', involvesMinor: false },
    { id: 'inc-2', time: '09:40', type: 'Separated child', severity: 'moderate', summary: 'A child was separated from a guardian at the finish; reunited at the info tent after 12 minutes.', actions: 'Reunification protocol followed; guardian ID checked.', status: 'closed', involvesMinor: true },
  ];
}

export function incidentsFor(event) {
  return event.incidents ?? defaultIncidents(event);
}

export function newIncident(partial) {
  return {
    id: 'inc-' + Date.now().toString(36),
    time: new Date().toTimeString().slice(0, 5),
    type: 'Other',
    severity: 'minor',
    summary: '',
    actions: '',
    status: 'open',
    involvesMinor: false,
    ...partial,
  };
}
