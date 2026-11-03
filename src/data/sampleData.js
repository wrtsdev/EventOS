// Sample organization, events and a participant Passport for the demo.
// All names, organizations and figures are fictional examples.

import { getTemplate } from './templates.js';
import { defaultBudget } from '../domain/finance.js';

export const SAMPLE_ORG = {
  id: 'org-demo',
  name: 'Northside Community Alliance',
  type: 'Nonprofit',
  coordinator: 'Dana Whitfield',
  email: 'events@northside-alliance.example',
  eventsPerYear: 3,
  historicMembers: 860,
  membershipPerParticipant: 12,
  tier: 'enterprise',
  assistantEnabled: true,
  epicWeights: { E: 40, P: 20, I: 20, C: 20 },
  isSample: true,
};

/** A second tenant. Its data must never appear in the demo organization's views. */
export const OTHER_ORG = {
  id: 'org-eastgate',
  name: 'Eastgate PTA',
  type: 'School or PTA',
  coordinator: 'Pat Morales',
  email: 'pta@eastgate.example',
  eventsPerYear: 1,
  historicMembers: 120,
  membershipPerParticipant: 0,
  tier: 'community',
  assistantEnabled: false,
  isSample: true,
};

function fromTemplate(templateId, overrides) {
  const t = getTemplate(templateId);
  return {
    ...t.preset,
    templateId,
    organizationId: SAMPLE_ORG.id,
    organization: SAMPLE_ORG.name,
    contact: SAMPLE_ORG.email,
    visibility: 'public',
    status: 'active',
    sponsors: [],
    ...overrides,
  };
}

const done = (ids) => Object.fromEntries(ids.map((k) => [k, 'done']));

export const SAMPLE_EVENTS = [
  // Validation scenario: Wellness primary, Wealth and Work supporting.
  fromTemplate('wellness-5k', {
    id: 'evt-wellness-5k',
    name: 'Northside Wellness 5K 2027',
    date: '2027-04-17',
    location: 'Riverside Park Pavilion',
    phase: 'planning',
    fourWs: ['wellness', 'wealth', 'work'],
    primaryW: 'wellness',
    audience: 'Northside families, walkers and first-time runners',
    revenueGoal: 24000,
    seriesId: 'series-northside-5k',
    seed: { risksReviewed: 7, contactsConfirmed: 4 },
    programming: ['health-screening', 'hydration', 'walking-division', 'wellness-village', 'fin-lit-booth', 'career-row'],
    checklist: {
      registration: 'done', waiver: 'done', permits: 'done', comms: 'done', cause: 'done', vendors: 'done', shirts: 'done', medals: 'done',
      route: 'attention', insurance: 'blocking', ems: 'attention', sponsors: 'attention', volunteers: 'attention', 'fourw-partners': 'done',
      timing: 'done', hydration: 'done', emergency: 'attention', security: 'done', packet: 'done', awards: 'done', survey: 'attention', followup: 'attention',
      budget: 'attention', 'payment-setup': 'done', 'local-vendors': 'done', accessibility: 'attention',
    },
  }),
  fromTemplate('money-walk', {
    id: 'evt-money-walk',
    name: 'Run Your Money Walk',
    date: '2026-11-07',
    location: 'Main Street Commons',
    phase: 'live',
    primaryW: 'wealth',
    seriesId: 'series-money-walk',
    checklist: {
      ...done(['registration', 'waiver', 'insurance', 'permits', 'route', 'ems', 'emergency', 'hydration', 'packet', 'shirts', 'sponsors', 'cause', 'fourw-partners', 'comms', 'survey', 'budget', 'payment-setup', 'local-vendors', 'accessibility', 'language-access']),
      security: 'attention', volunteers: 'attention', vendors: 'attention', followup: 'attention', 'briefing-pack': 'attention', 'community-notice': 'attention',
    },
  }),
  fromTemplate('legacy-walk', {
    id: 'evt-legacy-walk',
    name: 'Community Legacy Walk',
    date: '2026-09-26',
    location: 'Old Main Street Historic District',
    phase: 'complete',
    primaryW: 'wisdom',
    seriesId: 'series-legacy-walk',
    weather: { status: 'go', note: 'Clear, 68°F at start', decidedBy: 'Dana Whitfield' },
    distribution: { pledged: null, distributed: 3200, evidence: 'verified', date: '2026-10-15', note: 'Check #1042 acknowledged by the archive board.' },
    handoff: 'Story checkpoints worked best with an elder and a student together. Library wants to host the archive launch.',
    checklist: done(['registration', 'waiver', 'insurance', 'permits', 'route', 'ems', 'emergency', 'security', 'volunteers', 'hydration', 'packet', 'vendors', 'shirts', 'sponsors', 'cause', 'fourw-partners', 'comms', 'survey', 'followup', 'budget', 'payment-setup', 'local-vendors', 'accessibility', 'briefing-pack', 'language-access', 'community-notice', 'safety-briefing', 'radio-check', 'checkin-open', 'actuals-entered', 'hours-recorded']),
  }),
  // Belongs to another organization (tenant isolation fixture).
  {
    id: 'evt-eastgate-fun-run',
    organizationId: OTHER_ORG.id,
    organization: OTHER_ORG.name,
    name: 'Eastgate Family Fun Run',
    typeId: 'one-mile',
    format: 'physical',
    purpose: 'family-engagement',
    fourWs: ['wellness'],
    primaryW: 'wellness',
    date: '2027-03-06',
    location: 'Eastgate Elementary track',
    expected: 120,
    price: 10,
    phase: 'planning',
    status: 'active',
    features: ['registration', 'volunteers', 'surveys', 'followup'],
    checklist: {},
    sponsors: [],
  },
];

// Validation scenario exception: EMS was cut below the safe minimum to balance
// the draft budget. EventOS must flag it as a critical risk.
{
  const e = SAMPLE_EVENTS[0];
  const b = defaultBudget(e);
  e.budget = { ...b, lines: b.lines.map((l) => (l.id === 'exp-ems' ? { ...l, planned: 450, note: 'Cut from $1,200 in draft to balance budget' } : l)) };
}

/**
 * Prior-edition results (synthetic) for recurring-event trends.
 * Real snapshots are recorded when an After Action Review is completed.
 */
export const SAMPLE_SNAPSHOTS = [
  { id: 'snap-5k-2024', eventId: 'hist-5k-2024', seriesId: 'series-northside-5k', organizationId: 'org-demo', name: 'Northside Wellness 5K 2024', date: '2024-10-19', participants: 286, finishers: 268, netRevenue: 2100, localSpend: 6900, volunteerHours: 92, raised: 3100, cvi: 61, epic: 64, incidents: 3, sponsorFulfillment: 0.71, synthetic: true },
  { id: 'snap-5k-2025', eventId: 'hist-5k-2025', seriesId: 'series-northside-5k', organizationId: 'org-demo', name: 'Northside Wellness 5K 2025', date: '2025-10-18', participants: 361, finishers: 342, netRevenue: 4800, localSpend: 8400, volunteerHours: 118, raised: 4400, cvi: 70, epic: 76, incidents: 2, sponsorFulfillment: 0.86, synthetic: true },
  { id: 'snap-eastgate-2026', eventId: 'hist-eastgate', seriesId: 'series-eastgate', organizationId: 'org-eastgate', name: 'Eastgate Family Fun Run 2026', date: '2026-03-07', participants: 104, finishers: 101, netRevenue: 310, localSpend: 450, volunteerHours: 30, raised: 0, cvi: 58, epic: 55, incidents: 0, sponsorFulfillment: null, synthetic: true },
];

export const SAMPLE_ORGS = [SAMPLE_ORG, OTHER_ORG];

/** One participant's Passport, spanning several organizations' events. */
export const SAMPLE_PASSPORT = {
  id: 'pp-jordan',
  name: 'Jordan Mitchell',
  memberSince: '2024-05-11',
  homeZip: '27704',
  streakMonths: 7,
  events: [
    { id: 'h1', name: 'Juneteenth Freedom Walk', date: '2024-06-15', org: 'WRTS', miles: 2, fourWs: ['wisdom'], role: 'participant' },
    { id: 'h2', name: 'Fall Wellness 5K', date: '2024-10-19', org: 'Northside Community Alliance', miles: 3.1, fourWs: ['wellness'], role: 'participant', result: '41:12' },
    { id: 'h3', name: 'New Year Movement Challenge', date: '2025-01-31', org: 'WRTS', miles: 30, fourWs: ['wellness'], role: 'participant' },
    { id: 'h4', name: 'Career Miles Walk', date: '2025-05-03', org: 'Regional Workforce Board', miles: 2, fourWs: ['work'], role: 'volunteer' },
    { id: 'h5', name: 'Northside Wellness 5K', date: '2025-10-18', org: 'Northside Community Alliance', miles: 3.1, fourWs: ['wellness'], role: 'participant', result: '37:48' },
    { id: 'h6', name: 'Community Legacy Walk', date: '2026-09-26', org: 'Northside Community Alliance', miles: 2, fourWs: ['wisdom', 'wellness'], role: 'participant' },
  ],
  causes: [
    { name: 'Northside Community Health Center', actions: ['Donated $40', 'Shared fundraising page'] },
    { name: 'Old Main Street Heritage Archive', actions: ['Recorded a family story'] },
  ],
  teams: ['Northside Striders'],
  referrals: 4,
  volunteerActions: [{ what: 'Water station lead', event: 'Career Miles Walk', hours: 4 }],
  challenges: [
    { name: '30-day movement challenge', progress: 1, detail: '30 of 30 days' },
    { name: 'Savings streak', progress: 0.6, detail: '6 of 10 weeks' },
  ],
  badges: [
    { id: 'first-finish', name: 'First Finish', earned: '2024-06-15' },
    { id: 'five-events', name: 'Five Events', earned: '2025-10-18' },
    { id: 'connector', name: 'Connector', earned: '2025-03-02', detail: 'Brought 3+ people' },
    { id: 'helper', name: 'Helping Hands', earned: '2025-05-03', detail: 'Volunteered' },
    { id: 'storyteller', name: 'Storyteller', earned: '2026-09-26', detail: 'Shared a story' },
    { id: 'pr', name: 'Personal Best', earned: '2025-10-18' },
  ],
  upcoming: [
    { eventId: 'evt-money-walk', name: 'Run Your Money Walk', date: '2026-11-07', fourW: 'wealth', why: 'You joined the savings challenge' },
    { eventId: 'evt-wellness-5k', name: 'Northside Wellness 5K 2027', date: '2027-04-17', fourW: 'wellness', why: 'You have run it twice. Early registration is open to you.' },
  ],
  privacy: { analytics: true, marketing: true, sharePartners: false, showOnLeaderboards: true },
};
