// The three demo templates. A template pre-fills the Event Builder;
// the coordinator can change anything.

export const TEMPLATES = [
  {
    id: 'wellness-5k',
    name: 'Community Wellness 5K',
    fourW: 'wellness',
    tagline: 'Walkers and runners, health partners, and a movement program that lasts past race day.',
    includes: ['Walking + running divisions', 'Community health partners', 'Wellness booths', '30-day health challenge', 'Post-event movement program'],
    preset: {
      purpose: 'community-wellness',
      fourWs: ['wellness'],
      typeId: '5k',
      format: 'physical',
      name: 'Community Wellness 5K',
      expected: 400,
      cap: 450,
      price: 35,
      cause: 'Northside Community Health Center',
      description: 'A 5K for every pace. Walk, jog or run, then visit the wellness village for free screenings and join our 30-day movement challenge.',
      features: ['registration', 'teams', 'donations', 'volunteers', 'shirts', 'medals', 'awards', 'sponsors', 'challenges', 'resources', 'surveys', 'followup'],
      programming: ['health-screening', 'hydration', 'walking-division', 'wellness-village', 'health-challenge'],
    },
  },
  {
    id: 'money-walk',
    name: 'Run Your Money Walk',
    fourW: 'wealth',
    tagline: 'A community walk that ends at a resource village of credit unions, counselors and local entrepreneurs.',
    includes: ['2-mile community walk', 'Financial institution partners', 'Savings challenge', 'Credit and homeownership resources', 'Entrepreneur row'],
    preset: {
      purpose: 'economic-empowerment',
      fourWs: ['wealth'],
      typeId: 'community-walk',
      format: 'physical',
      name: 'Run Your Money Walk',
      expected: 300,
      cap: 350,
      price: 20,
      cause: 'Eastside Homeownership Fund',
      description: 'Walk two miles with neighbors, then talk money with people you can trust. Join the savings challenge and meet local businesses.',
      features: ['registration', 'teams', 'donations', 'volunteers', 'shirts', 'sponsors', 'challenges', 'resources', 'surveys', 'followup'],
      programming: ['fin-lit-booth', 'bank-sponsor', 'savings-challenge', 'entrepreneur-row', 'fin-health-survey'],
    },
  },
  {
    id: 'legacy-walk',
    name: 'Community Legacy Walk',
    fourW: 'wisdom',
    tagline: 'A walk through local history with storytelling checkpoints, elders, schools and cultural partners.',
    includes: ['Storytelling checkpoints', 'Community elders as guides', 'School partners', 'Cultural organizations', 'Story capture booth'],
    preset: {
      purpose: 'memorial',
      fourWs: ['wisdom', 'wellness'],
      typeId: 'community-walk',
      format: 'physical',
      name: 'Community Legacy Walk',
      expected: 250,
      cap: 300,
      price: 15,
      cause: 'Old Main Street Heritage Archive',
      description: 'Walk the neighborhood that raised us. Elders and students lead storytelling stops along the route, and every story you share helps build the archive.',
      features: ['registration', 'teams', 'donations', 'volunteers', 'shirts', 'sponsors', 'education', 'resources', 'surveys', 'followup'],
      programming: ['story-checkpoints', 'elders', 'school-partners', 'cultural-orgs', 'story-capture', 'walking-division'],
    },
  },
];

export function getTemplate(id) {
  return TEMPLATES.find((t) => t.id === id) ?? null;
}
