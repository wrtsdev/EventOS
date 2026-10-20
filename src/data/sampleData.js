// Sample organization, events and a participant Passport for the demo.
// All names, organizations and figures are fictional examples.

import { getTemplate } from './templates.js';

export const SAMPLE_ORG = {
  id: 'org-demo',
  name: 'Northside Community Alliance',
  type: 'Nonprofit',
  coordinator: 'Dana Whitfield',
  email: 'events@northside-alliance.example',
  eventsPerYear: 3,
  historicMembers: 860,
  membershipPerParticipant: 12,
  isSample: true,
};

function fromTemplate(templateId, overrides) {
  const t = getTemplate(templateId);
  return {
    ...t.preset,
    templateId,
    organization: SAMPLE_ORG.name,
    contact: SAMPLE_ORG.email,
    visibility: 'public',
    sponsors: [],
    ...overrides,
  };
}

export const SAMPLE_EVENTS = [
  fromTemplate('wellness-5k', {
    id: 'evt-wellness-5k',
    name: 'Northside Wellness 5K',
    date: '2027-04-17',
    location: 'Riverside Park Pavilion',
    phase: 'planning',
    checklist: {
      registration: 'done',
      waiver: 'done',
      permits: 'done',
      comms: 'done',
      cause: 'done',
      vendors: 'done',
      shirts: 'done',
      medals: 'done',
      route: 'attention',
      insurance: 'blocking',
      ems: 'blocking',
      sponsors: 'attention',
      volunteers: 'attention',
      'fourw-partners': 'done',
      timing: 'done',
      hydration: 'done',
      emergency: 'attention',
      security: 'done',
      packet: 'done',
      awards: 'done',
      survey: 'attention',
      followup: 'attention',
    },
  }),
  fromTemplate('money-walk', {
    id: 'evt-money-walk',
    name: 'Run Your Money Walk',
    date: '2026-11-07',
    location: 'Main Street Commons',
    phase: 'live',
    checklist: {
      registration: 'done', waiver: 'done', insurance: 'done', permits: 'done', route: 'done', ems: 'done',
      emergency: 'done', security: 'attention', volunteers: 'attention', hydration: 'done', packet: 'done', vendors: 'attention',
      shirts: 'done', sponsors: 'done', cause: 'done', 'fourw-partners': 'done', comms: 'done', survey: 'done', followup: 'attention',
    },
  }),
  fromTemplate('legacy-walk', {
    id: 'evt-legacy-walk',
    name: 'Community Legacy Walk',
    date: '2026-09-26',
    location: 'Old Main Street Historic District',
    phase: 'complete',
    checklist: Object.fromEntries(
      ['registration', 'waiver', 'insurance', 'permits', 'route', 'ems', 'emergency', 'security', 'volunteers', 'hydration', 'packet', 'vendors', 'shirts', 'sponsors', 'cause', 'fourw-partners', 'comms', 'survey', 'followup'].map((k) => [k, 'done']),
    ),
  }),
];

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
    { eventId: 'evt-wellness-5k', name: 'Northside Wellness 5K', date: '2027-04-17', fourW: 'wellness', why: 'You have run it twice. Early registration is open to you.' },
  ],
  privacy: { analytics: true, marketing: true, sharePartners: false, showOnLeaderboards: true },
};
