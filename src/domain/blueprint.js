// Smart Event Blueprint and feature recommendations. Controls, readiness and
// communications live in their own modules and are re-exported here so
// existing imports keep working.

import { FOUR_WS } from './fourW.js';
import { getEventType, getPurpose } from './catalog.js';
import { readiness } from './controls.js';
import { commsTimeline } from './comms.js';
import { isPhysical, volunteerNeed, primaryW, supportingWs } from './eventBasics.js';

export { STATUS, CHECKLIST_ITEMS, applicableChecklist, readiness, nextStatus, stageReviews, STAGES } from './controls.js';
export { commsTimeline } from './comms.js';
export { isPhysical, volunteerNeed } from './eventBasics.js';

/** Feature and programming recommendations driven by event type and 4Ws. */
export function recommend(event) {
  const type = getEventType(event.typeId);
  const features = new Set(['registration', 'surveys', 'followup']);
  const reasons = {};
  const add = (id, why) => {
    features.add(id);
    reasons[id] = why;
  };

  if (type.timed) {
    add('medals', 'Timed events are where finishers expect a medal.');
    add('awards', 'Age-group and community awards reward every kind of finisher.');
  }
  if (['fundraising-walk'].includes(type.id) || event.purpose === 'fundraising') {
    add('fundraising', 'Peer pages typically raise more than registration fees alone.');
    add('donations', 'A donation prompt at checkout is the easiest gift to give.');
    add('teams', 'Teams fundraise together and bring friends.');
  }
  if (['team-challenge', 'wellness-challenge'].includes(type.id) || event.purpose === 'employee-wellness') {
    add('teams', 'Team standings keep multi-week challenges alive.');
    add('challenges', 'Weekly challenges create reasons to come back.');
  }
  if (type.physical && event.format !== 'virtual') {
    add('volunteers', 'In-person events need marshals, water and finish-line help.');
    if (type.miles > 0) add('shirts', 'Shirts turn participants into walking ambassadors for the cause.');
  }
  if (Number(event.expected) >= 150) {
    add('sponsors', 'At this size sponsors can see real engagement, not just a logo.');
  }
  if (event.cause) {
    add('donations', 'Let participants give directly to ' + event.cause + '.');
  }
  for (const w of event.fourWs ?? []) {
    if (w === 'wellness') add('challenges', 'A post-event movement challenge keeps people active.');
    if (w === 'wealth') add('resources', 'A financial resource village meets people where they are.');
    if (w === 'wisdom') add('education', 'Storytelling checkpoints turn the route into the program.');
    if (w === 'work') add('resources', 'An employer and career row creates real next steps.');
    add('sponsors', 'Your 4W focus gives sponsors a meaningful role.');
  }

  const programming = (event.fourWs ?? []).flatMap((w) =>
    FOUR_WS[w].programming.map((p) => ({ ...p, fourW: w })),
  );
  return { features: [...features], reasons, programming };
}

/** Plain-language Community Purpose Statement drafted from the organizer's answers. */
export function purposeStatement(event) {
  if (event.purposeStatement?.trim()) return event.purposeStatement;
  const p = primaryW(event);
  const sup = supportingWs(event);
  const purpose = event.purpose === 'other' && event.purposeOther ? event.purposeOther : getPurpose(event.purpose).label.toLowerCase();
  const who = event.audience?.trim() || getEventType(event.typeId).audience.toLowerCase();
  const parts = [
    `${event.name || 'This event'} brings ${who} together for ${purpose}.`,
    p ? `Its primary goal is ${FOUR_WS[p].name}: ${FOUR_WS[p].goal.charAt(0).toLowerCase() + FOUR_WS[p].goal.slice(1)}` : '',
    sup.length ? `It also supports ${sup.map((w) => FOUR_WS[w].name).join(' and ')}.` : '',
    event.cause ? `Proceeds benefit ${event.cause}.` : '',
  ];
  return parts.filter(Boolean).join(' ');
}

/** The generated Smart Event Blueprint. */
export function buildBlueprint(event) {
  const type = getEventType(event.typeId);
  const purpose = getPurpose(event.purpose);
  const ws = (event.fourWs ?? []).map((w) => FOUR_WS[w]);
  const ready = readiness(event);

  return {
    experience: {
      distance: type.miles === 0 ? 'No set distance' : type.miles >= 20 ? `${type.miles} miles over the challenge` : `${type.miles} miles`,
      eventType: type.label,
      format: event.format === 'physical' ? 'In person' : event.format === 'virtual' ? 'Virtual' : 'Hybrid',
      audience: event.audience || type.audience,
      expected: Number(event.expected) || 0,
    },
    purpose: {
      purpose: purpose.label,
      cause: event.cause || 'No beneficiary yet',
      fourWs: ws,
      primary: primaryW(event),
      objective: ws.length ? ws.map((w) => w.goal).join(' ') : 'Bring people together through movement.',
      statement: purposeStatement(event),
    },
    engagement: {
      teams: event.features?.includes('teams'),
      challenges: event.features?.includes('challenges'),
      partners: ws.flatMap((w) => w.partners.slice(0, 2)),
      sponsors: event.features?.includes('sponsors'),
      volunteers: volunteerNeed(event),
      comms: commsTimeline(event),
    },
    impact: {
      metrics: ['Participants and finishers (reach)', 'First-time vs returning participants', ...ws.flatMap((w) => w.metrics.slice(0, 2))],
      survey: ['How likely are you to join another WRTS event?', ...ws.flatMap((w) => w.surveyQuestions)],
      causeOutcomes: event.cause ? [`Funds distributed to ${event.cause}`, 'Participants who took a cause action'] : [],
      postEvent: ws.length ? ws.flatMap((w) => w.followUps.slice(0, 1)) : ['Invite participants to the next community walk'],
    },
    physical: isPhysical(event),
    readiness: ready,
  };
}
