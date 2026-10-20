// Smart Event Blueprint, readiness checklist, recommendations and the
// participant communication timeline. Pure functions over an Event.

import { FOUR_WS } from './fourW.js';
import { getEventType, getPurpose } from './catalog.js';

export const STATUS = {
  done: { id: 'done', label: 'Complete', tone: 'good' },
  attention: { id: 'attention', label: 'Needs attention', tone: 'warn' },
  blocking: { id: 'blocking', label: 'Blocking', tone: 'bad' },
};

const WEIGHT = { critical: 3, standard: 2, nice: 1 };
const STATUS_CREDIT = { done: 1, attention: 0.4, blocking: 0 };

export function isPhysical(event) {
  return event.format !== 'virtual' && getEventType(event.typeId).physical;
}

/**
 * Checklist definitions. `when` decides if an item applies to this event.
 * `informational` marks legal / permit / medical / insurance / safety items
 * whose guidance must be verified locally.
 */
export const CHECKLIST_ITEMS = [
  { id: 'registration', label: 'Registration page live', category: 'Joining', weight: 'critical', due: 56, owner: 'Organizer', when: () => true,
    help: 'Connect your registration provider (RunSignup, Race Roster and others) or use EventOS registration. Participants flow into Passport automatically.' },
  { id: 'waiver', label: 'Participant waiver', category: 'Safety and approvals', weight: 'critical', due: 42, owner: 'Organizer', informational: true, when: () => true,
    help: 'Every participant accepts a waiver at registration. Have your legal advisor or insurer review the wording.' },
  { id: 'insurance', label: 'Event insurance certificate', category: 'Safety and approvals', weight: 'critical', due: 42, owner: 'Organizer', informational: true, when: isPhysical,
    help: 'Most parks and cities require a certificate of liability insurance naming them as additional insured. Ask your venue for the required limits.' },
  { id: 'permits', label: 'Event or park permit', category: 'Safety and approvals', weight: 'critical', due: 60, owner: 'Organizer', informational: true, when: isPhysical,
    help: 'Contact your parks and recreation department or city special-events office. Lead times often run 30–90 days.' },
  { id: 'route', label: 'Course or route approved', category: 'Safety and approvals', weight: 'critical', due: 45, owner: 'Course lead', informational: true, when: isPhysical,
    help: 'Share a route map with the permitting office and police. Road closures usually need separate approval.' },
  { id: 'ems', label: 'EMS and first-aid plan', category: 'Safety and approvals', weight: 'critical', due: 30, owner: 'Safety lead', informational: true, when: isPhysical,
    help: 'Arrange first aid at start/finish and know the nearest hospital. Larger or timed events often need an ambulance on standby.' },
  { id: 'emergency', label: 'Emergency and weather plan', category: 'Safety and approvals', weight: 'critical', due: 21, owner: 'Safety lead', informational: true, when: isPhysical,
    help: 'Decide who can delay or cancel, how you will tell participants, and where people shelter in severe weather.' },
  { id: 'security', label: 'Police or traffic support', category: 'Safety and approvals', weight: 'standard', due: 30, owner: 'Safety lead', informational: true,
    when: (e) => isPhysical(e) && (getEventType(e.typeId).timed || Number(e.expected) >= 300),
    help: 'Street crossings and closures typically need officers or certified traffic control.' },
  { id: 'timing', label: 'Timing provider booked', category: 'Race day', weight: 'standard', due: 45, owner: 'Organizer',
    when: (e) => getEventType(e.typeId).timed && e.format !== 'virtual',
    help: 'EventOS does not time races. Book a local timing company; their results import through the Integration Gateway.' },
  { id: 'mile-logging', label: 'Mile logging set up', category: 'Race day', weight: 'critical', due: 21, owner: 'Organizer',
    when: (e) => !isPhysical(e) || e.format === 'hybrid',
    help: 'Virtual participants log miles in Passport or through a connected fitness app.' },
  { id: 'volunteers', label: 'Volunteer roles assigned', category: 'People', weight: 'standard', due: 14, owner: 'Volunteer lead',
    when: (e) => isPhysical(e) || e.features?.includes('volunteers'),
    help: 'Plan roughly 1 volunteer for every 15–25 participants: registration, course marshals, water, finish line, cleanup.' },
  { id: 'hydration', label: 'Water and hydration stations', category: 'Race day', weight: 'standard', due: 14, owner: 'Logistics lead',
    when: (e) => isPhysical(e) && getEventType(e.typeId).miles >= 2,
    help: 'Plan water at start/finish and about every 1.5 miles. A natural sponsor placement.' },
  { id: 'packet', label: 'Packet pickup plan', category: 'Race day', weight: 'nice', due: 10, owner: 'Logistics lead', when: isPhysical,
    help: 'Pick a time and place before race day to reduce morning lines.' },
  { id: 'vendors', label: 'Vendors confirmed', category: 'Partners', weight: 'standard', due: 21, owner: 'Logistics lead', when: isPhysical,
    help: 'Tents, tables, sound, portable restrooms, food. Confirm delivery times in writing.' },
  { id: 'shirts', label: 'Shirt order placed', category: 'Participant experience', weight: 'nice', due: 28, owner: 'Organizer', when: (e) => e.features?.includes('shirts'),
    help: 'Most printers need final counts and sizes 3–4 weeks out.' },
  { id: 'medals', label: 'Medals ordered', category: 'Participant experience', weight: 'nice', due: 42, owner: 'Organizer', when: (e) => e.features?.includes('medals'),
    help: 'Custom medals often take 6 weeks.' },
  { id: 'awards', label: 'Awards plan', category: 'Participant experience', weight: 'nice', due: 14, owner: 'Organizer', when: (e) => e.features?.includes('awards'),
    help: 'Decide categories, including community awards (largest team, top fundraiser, best spirit).' },
  { id: 'sponsors', label: 'Sponsor activation planned', category: 'Partners', weight: 'standard', due: 28, owner: 'Partnerships lead', when: (e) => e.features?.includes('sponsors'),
    help: 'Give each sponsor something measurable to do: a booth, a promo code, a challenge, a survey question.' },
  { id: 'cause', label: 'Beneficiary agreement', category: 'Partners', weight: 'standard', due: 45, owner: 'Organizer', when: (e) => Boolean(e.cause),
    help: 'Agree in writing how funds are shared, how the cause is described, and what impact data you will exchange.' },
  { id: 'fourw-partners', label: '4W programming partners confirmed', category: 'Community impact', weight: 'standard', due: 28, owner: 'Program lead',
    when: (e) => (e.fourWs?.length ?? 0) > 0,
    help: 'Confirm the partners who will run your Wellness, Wealth, Wisdom or Work activities.' },
  { id: 'comms', label: 'Participant communication timeline', category: 'Joining', weight: 'standard', due: 56, owner: 'Organizer', when: () => true,
    help: 'Use the EventOS timeline: announcement, early registration, team push, know-before-you-go, thank-you and survey.' },
  { id: 'survey', label: 'Post-event survey ready', category: 'Community impact', weight: 'nice', due: 7, owner: 'Organizer', when: (e) => e.features?.includes('surveys'),
    help: 'EventOS drafts questions from your 4W goals. Keep it under 3 minutes.' },
  { id: 'followup', label: 'What happens next plan', category: 'Community impact', weight: 'nice', due: 7, owner: 'Organizer', when: () => true,
    help: 'Decide the next experience you will invite participants into before race day.' },
];

export function applicableChecklist(event) {
  return CHECKLIST_ITEMS.filter((item) => item.when(event)).map((item) => ({
    ...item,
    status: event.checklist?.[item.id] ?? defaultStatus(item),
  }));
}

function defaultStatus(item) {
  if (item.weight === 'critical') return 'blocking';
  return 'attention';
}

export function readiness(event) {
  const items = applicableChecklist(event);
  let total = 0;
  let earned = 0;
  for (const item of items) {
    const w = WEIGHT[item.weight];
    total += w;
    earned += w * STATUS_CREDIT[item.status];
  }
  const score = total === 0 ? 0 : Math.round((earned / total) * 100);
  const missing = items.filter((i) => i.status !== 'done');
  return {
    score,
    items,
    done: items.filter((i) => i.status === 'done').length,
    blocking: items.filter((i) => i.status === 'blocking'),
    attention: items.filter((i) => i.status === 'attention'),
    missing,
  };
}

export function nextStatus(status) {
  return status === 'blocking' ? 'attention' : status === 'attention' ? 'done' : 'blocking';
}

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
    add('shirts', 'Shirts turn participants into walking ambassadors for the cause.');
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

/** Recommended volunteers given size and format. */
export function volunteerNeed(event) {
  const n = Number(event.expected) || 0;
  if (!isPhysical(event)) return Math.max(2, Math.ceil(n / 150));
  return Math.max(6, Math.ceil(n / 20));
}

export function commsTimeline(event) {
  const ws = (event.fourWs ?? []).map((w) => FOUR_WS[w].name).join(' + ') || 'community';
  return [
    { when: '8 weeks before', title: 'Announce the event', channel: 'Email, social, partner newsletters', detail: `Lead with why: ${getPurpose(event.purpose).label.toLowerCase()} and your ${ws} focus.` },
    { when: '6 weeks before', title: 'Early registration deadline', channel: 'Email + text', detail: 'Reward early sign-ups; invite returning Passport members first.' },
    { when: '4 weeks before', title: 'Team and referral push', channel: 'Email + team captains', detail: 'Share team links. Referral codes track who brought whom.' },
    { when: '2 weeks before', title: 'Cause story', channel: 'Email + social', detail: event.cause ? `Show what ${event.cause} will do with the support.` : 'Share why this event matters to the community.' },
    { when: '3 days before', title: 'Know before you go', channel: 'Email + text', detail: 'Packet pickup, parking, start times, weather plan, what to bring.' },
    { when: 'Event day', title: 'Welcome and live updates', channel: 'Text', detail: 'Start reminders, course updates, resource village map.' },
    { when: '1 day after', title: 'Thank you + survey', channel: 'Email', detail: 'Photos, results, a 3-minute survey, and the cause total.' },
    { when: '2 weeks after', title: 'What happens next', channel: 'Email + Passport', detail: 'Invite participants into the next experience based on what they told you.' },
  ];
}

/** The generated Smart Event Blueprint. */
export function buildBlueprint(event) {
  const type = getEventType(event.typeId);
  const purpose = getPurpose(event.purpose);
  const ws = (event.fourWs ?? []).map((w) => FOUR_WS[w]);
  const ready = readiness(event);
  const byCat = (cats) => ready.items.filter((i) => cats.includes(i.category));

  return {
    experience: {
      distance: type.miles >= 20 ? `${type.miles} miles over the challenge` : `${type.miles} miles`,
      eventType: type.label,
      format: event.format === 'physical' ? 'In person' : event.format === 'virtual' ? 'Virtual' : 'Hybrid',
      audience: type.audience,
      expected: Number(event.expected) || 0,
    },
    purpose: {
      purpose: purpose.label,
      cause: event.cause || 'No beneficiary yet',
      fourWs: ws,
      objective: ws.length ? ws.map((w) => w.goal).join(' ') : 'Bring people together through movement.',
    },
    operations: byCat(['Joining', 'Safety and approvals', 'Race day', 'People']),
    engagement: {
      teams: event.features?.includes('teams'),
      challenges: event.features?.includes('challenges'),
      partners: ws.flatMap((w) => w.partners.slice(0, 2)),
      sponsors: event.features?.includes('sponsors'),
      volunteers: volunteerNeed(event),
      comms: commsTimeline(event),
    },
    impact: {
      metrics: ['Participants and finishers', 'First-time vs returning participants', ...ws.flatMap((w) => w.metrics.slice(0, 2))],
      survey: ['How likely are you to join another WRTS event?', ...ws.flatMap((w) => w.surveyQuestions)],
      causeOutcomes: event.cause ? [`Funds raised for ${event.cause}`, 'Participants who took a cause action'] : [],
      postEvent: ws.length ? ws.flatMap((w) => w.followUps.slice(0, 1)) : ['Invite participants to the next community walk'],
    },
    readiness: ready,
  };
}
