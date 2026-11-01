// Workforce & volunteer operations. Unpaid volunteering, paid work and
// contracted services are tracked separately and never blended.

import { isPhysical, isTimed, volunteerNeed, expectedCount } from './eventBasics.js';

export const WORK_TYPES = {
  volunteer: { label: 'Volunteer (unpaid)' },
  paid: { label: 'Paid work' },
  contracted: { label: 'Contracted service' },
};

const fill = (event) => ({ planning: 0.6, live: 0.82, eventday: 1, complete: 1 })[event.phase] ?? 0.6;

export function defaultWorkforce(event) {
  const need = volunteerNeed(event);
  const physical = isPhysical(event);
  const ws = event.fourWs ?? [];
  const f = fill(event);
  const planning = event.phase === 'planning';
  const vol = physical
    ? [
        ['checkin', 'Check-in and packet pickup', 0.22, 4, true, 'Customer service', 'Maya R.'],
        ['marshals', 'Course marshals', 0.24, 4, true, 'Safety awareness', 'Curtis B.'],
        ['water', 'Water stations', 0.14, 4, false, 'Teamwork', 'Ebony T.'],
        ['finish', 'Finish line and medals', 0.12, 4, false, 'Event operations', 'Reggie P.'],
        ['village', 'Resource village guides', 0.12, 5, false, 'Community outreach', 'Simone A.'],
        ['setup', 'Setup and cleanup', 0.1, 5, false, 'Logistics', 'Devon K.'],
        ['ambassadors', 'Cause ambassadors', 0.06, 4, false, 'Public speaking', 'Nia W.'],
      ]
    : [
        ['hosts', 'Challenge hosts', 0.5, 6, true, 'Facilitation', 'Maya R.'],
        ['callers', 'Community check-in callers', 0.3, 4, false, 'Customer service', 'Curtis B.'],
        ['ambassadors', 'Cause ambassadors', 0.2, 3, false, 'Public speaking', 'Nia W.'],
      ];
  const rows = vol.map(([id, role, share, hours, training, skill, lead], i) => {
    const needed = Math.max(1, Math.round(need * share));
    const assigned = Math.min(needed, Math.round(needed * f));
    return {
      id,
      role,
      type: 'volunteer',
      needed,
      assigned,
      hoursEach: hours,
      trainingRequired: training ? 'Safety and route briefing' : '',
      trained: training ? (planning ? 0 : event.phase === 'live' ? Math.round(assigned * 0.6) : assigned) : 0,
      lead,
      backup: planning && i % 3 === 1 ? '' : ['Kendra L.', 'Isaiah M.', 'Tiana S.', 'Xavier J.'][i % 4],
      local: true,
      skill,
    };
  });
  rows.push({ id: 'manager', role: 'Event-day manager', type: 'paid', needed: 1, assigned: 1, hoursEach: 10, wage: 28, trainingRequired: '', trained: 0, lead: 'Dana Whitfield', backup: 'Andre Simmons', local: true, skill: 'Event management' });
  if (ws.includes('work')) {
    rows.push({ id: 'youth-crew', role: 'Youth event crew (paid, 16–24)', type: 'paid', needed: 4, assigned: planning ? 2 : 4, hoursEach: 6, wage: 15, trainingRequired: 'Crew orientation', trained: planning ? 0 : 4, lead: 'Workforce partner', backup: 'Andre Simmons', local: true, skill: 'Workplace readiness credential', involvesMinors: false });
  }
  if (physical) {
    rows.push({ id: 'ems', role: 'EMS crew', type: 'contracted', needed: 1, assigned: 1, hoursEach: 5, contractLine: 'exp-ems', trainingRequired: '', trained: 0, lead: 'County EMS', backup: 'Station 14', local: true, skill: '' });
    if (isTimed(event) || expectedCount(event) >= 300) rows.push({ id: 'police', role: 'Police traffic detail', type: 'contracted', needed: 1, assigned: 1, hoursEach: 5, contractLine: 'exp-police', trainingRequired: '', trained: 0, lead: 'Sgt. L. Owens', backup: 'Dispatch', local: true, skill: '' });
    rows.push({ id: 'sound', role: 'Sound and DJ', type: 'contracted', needed: 1, assigned: 1, hoursEach: 5, contractLine: 'exp-sound', trainingRequired: '', trained: 0, lead: 'DJ Reese', backup: '', local: true, skill: '' });
  }
  if (isTimed(event)) rows.push({ id: 'timing', role: 'Timing crew', type: 'contracted', needed: 1, assigned: 1, hoursEach: 5, contractLine: 'exp-timing', trainingRequired: '', trained: 0, lead: 'Timing provider', backup: '', local: false, skill: '' });
  return rows;
}

export function workforceFor(event) {
  return event.workforce ?? defaultWorkforce(event);
}

/**
 * Workforce Contribution & Capability summary.
 * Hours count only when the event day has happened, or when organizers
 * entered them (hoursRecorded).
 */
export function workforceSummary(event, finance) {
  const rows = workforceFor(event);
  const happened = event.phase === 'complete';
  const by = (t) => rows.filter((r) => r.type === t);
  const volunteers = by('volunteer');
  const paid = by('paid');
  const contracted = by('contracted');
  const hours = (r) => (r.hoursRecorded ?? (happened ? r.assigned * r.hoursEach : 0));
  const contractValue = (r) => {
    const l = finance?.expenseLines?.find((x) => x.id === r.contractLine);
    return l ? l.actualValue ?? l.planned : 0;
  };
  const needingTraining = rows.filter((r) => r.trainingRequired);
  const toTrain = needingTraining.reduce((a, r) => a + r.assigned, 0);
  const trained = needingTraining.reduce((a, r) => a + Math.min(r.trained, r.assigned), 0);
  const leadsWithoutBackup = rows.filter((r) => r.lead && !r.backup && r.type !== 'contracted');
  return {
    rows,
    volunteers: {
      needed: volunteers.reduce((a, r) => a + r.needed, 0),
      assigned: volunteers.reduce((a, r) => a + r.assigned, 0),
      hours: volunteers.reduce((a, r) => a + hours(r), 0),
      plannedHours: volunteers.reduce((a, r) => a + r.assigned * r.hoursEach, 0),
    },
    paid: {
      positions: paid.reduce((a, r) => a + r.assigned, 0),
      wages: paid.reduce((a, r) => a + r.assigned * r.hoursEach * (r.wage ?? 0), 0),
      hours: paid.reduce((a, r) => a + hours(r), 0),
    },
    contracted: {
      services: contracted.length,
      value: contracted.reduce((a, r) => a + contractValue(r), 0),
      localValue: contracted.filter((r) => r.local).reduce((a, r) => a + contractValue(r), 0),
    },
    training: { required: toTrain, trained, rate: toTrain ? trained / toTrain : null },
    skills: rows.filter((r) => r.skill && r.type !== 'contracted').reduce((a, r) => a + (happened || event.phase === 'eventday' ? r.assigned : 0), 0),
    leadsWithoutBackup,
    hoursRecorded: happened,
  };
}
