// Plain-language option lists for the Event Builder.

export const PURPOSES = [
  { id: 'community-wellness', label: 'Community wellness', hint: 'Get neighbors moving and connected to health resources' },
  { id: 'fundraising', label: 'Fundraising', hint: 'Raise money for a cause or nonprofit' },
  { id: 'awareness', label: 'Awareness', hint: 'Draw attention to an issue or need' },
  { id: 'family-engagement', label: 'Family and community engagement', hint: 'Bring households and neighbors together' },
  { id: 'employee-wellness', label: 'Employee wellness', hint: 'Healthy, connected teams at work' },
  { id: 'education', label: 'School and community education', hint: 'Learning, history, literacy' },
  { id: 'economic-empowerment', label: 'Economic empowerment', hint: 'Saving, credit, homeownership, business' },
  { id: 'workforce', label: 'Career and workforce engagement', hint: 'Jobs, skills, mentoring' },
  { id: 'memorial', label: 'Memorial or legacy', hint: 'Honor a person, place or history' },
  { id: 'other', label: 'Something else', hint: 'Tell us in your own words' },
];

export const EVENT_TYPES = [
  { id: 'one-mile', label: '1-mile walk', miles: 1, timed: false, physical: true, audience: 'All ages and abilities' },
  { id: '5k', label: '5K walk/run', miles: 3.1, timed: true, physical: true, audience: 'Walkers and runners of every pace' },
  { id: '10k', label: '10K', miles: 6.2, timed: true, physical: true, audience: 'Experienced walkers and runners' },
  { id: 'community-walk', label: 'Community walk', miles: 2, timed: false, physical: true, audience: 'Families, neighbors, groups' },
  { id: 'fundraising-walk', label: 'Fundraising walk', miles: 2, timed: false, physical: true, audience: 'Supporters, teams and families' },
  { id: 'virtual', label: 'Virtual challenge', miles: 3.1, timed: false, physical: false, audience: 'Anyone, anywhere' },
  { id: 'wellness-challenge', label: 'Wellness challenge (multi-week)', miles: 30, timed: false, physical: false, audience: 'Members, employees, groups' },
  { id: 'team-challenge', label: 'Team challenge', miles: 20, timed: false, physical: false, audience: 'Workplaces, chapters, congregations' },
  { id: 'hybrid', label: 'Hybrid event', miles: 3.1, timed: true, physical: true, audience: 'Local and remote participants' },
  { id: 'festival', label: 'Community festival + fun walk', miles: 1, timed: false, physical: true, audience: 'Families, neighbors, local businesses' },
  { id: 'workshop', label: 'Workshop or learning walk', miles: 0, timed: false, physical: true, audience: 'Learners, members, community groups' },
  { id: 'custom', label: 'Custom movement event', miles: 2, timed: false, physical: true, audience: 'Defined by you' },
];

export const FORMATS = [
  { id: 'physical', label: 'In person', hint: 'Everyone gathers at one place and time' },
  { id: 'virtual', label: 'Virtual', hint: 'People move on their own schedule and log miles' },
  { id: 'hybrid', label: 'Hybrid', hint: 'In-person event plus a virtual option' },
];

export const EXPERIENCE_FEATURES = [
  { id: 'registration', label: 'Online registration', group: 'Joining', core: true },
  { id: 'teams', label: 'Teams', group: 'Joining' },
  { id: 'fundraising', label: 'Peer fundraising pages', group: 'Giving' },
  { id: 'donations', label: 'Donation at checkout', group: 'Giving' },
  { id: 'volunteers', label: 'Volunteer roles', group: 'People' },
  { id: 'shirts', label: 'Event shirts', group: 'Swag' },
  { id: 'medals', label: 'Finisher medals', group: 'Swag' },
  { id: 'awards', label: 'Awards', group: 'Swag' },
  { id: 'sponsors', label: 'Sponsor visibility', group: 'Partners' },
  { id: 'challenges', label: 'Challenges', group: 'Engagement' },
  { id: 'education', label: 'Learning activities', group: 'Engagement' },
  { id: 'resources', label: 'Community resource village', group: 'Engagement' },
  { id: 'surveys', label: 'Participant survey', group: 'After', core: true },
  { id: 'followup', label: 'Post-event follow-up', group: 'After', core: true },
];

export function getEventType(id) {
  return EVENT_TYPES.find((t) => t.id === id) ?? EVENT_TYPES[1];
}

export function getPurpose(id) {
  return PURPOSES.find((p) => p.id === id) ?? PURPOSES[PURPOSES.length - 1];
}

/** Suggest a product tier by size and organization profile. */
export function suggestTier(expected, eventsPerYear = 1) {
  if (eventsPerYear >= 4) return 'enterprise';
  if (expected > 500) return 'pro';
  return 'community';
}

// Proposed commercial configurations: not final prices or public commitments.
export const TIERS = [
  {
    id: 'community',
    name: 'EventOS Community',
    audience: 'Small and first-time community organizers',
    size: 'Up to about 500 participants',
    price: 'Proposed: entry tier',
    includes: ['Guided Event Builder with 4Ws', 'Registration and Passport', 'Simple budget', 'Safety checklists and staged reviews', 'Foundational 4Ws reporting and Impact Report'],
  },
  {
    id: 'pro',
    name: 'EventOS Pro',
    audience: 'Established races and nonprofit events',
    size: 'Hundreds to thousands of participants',
    price: 'Proposed: annual subscription',
    includes: ['Everything in Community', 'Advanced finance: scenarios, break-even, cash flow', 'Sponsor, vendor and partner management', 'Workforce and volunteer operations', 'EPIC scorecard, Community Intelligence, After Action Review'],
  },
  {
    id: 'enterprise',
    name: 'EventOS Enterprise',
    audience: 'Municipalities, employers, associations and networks running many events',
    size: 'Multi-event, multi-site',
    price: 'Proposed: annual partnership',
    includes: ['Everything in Pro', 'Recurring-event trends and organization dashboards', 'Configurable EPIC weights and governance', 'User administration and roles', 'Advanced integrations and consolidated impact reporting'],
  },
];

export const MANAGED_SERVICES = {
  name: 'WRTS Managed Services',
  detail: 'Add-on to any tier: WRTS event producers plan and run the event with you.',
};
