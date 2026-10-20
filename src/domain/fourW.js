// The 4Ws operating system. Each W changes goals, programming, partners,
// participant activities, impact metrics, and post-event engagement.
// Nothing here is decorative: blueprint, recommendations, surveys, the
// impact report and Copilot all read from these definitions.

export const FOUR_WS = {
  wellness: {
    id: 'wellness',
    name: 'Wellness',
    letter: 'W1',
    prompt: 'How do we improve our health together?',
    summary: 'Health, physical activity, preventive wellness, nutrition, mental well-being, healthy habits.',
    goal: 'Get more neighbors moving regularly and connected to preventive health resources.',
    programming: [
      { id: 'health-screening', label: 'Health screening partner', why: 'Blood pressure and wellness checks turn a race morning into a prevention moment.' },
      { id: 'hydration', label: 'Hydration stations', why: 'Required for any course over 2 miles; doubles as a sponsor touchpoint.' },
      { id: 'walking-division', label: 'Walking division', why: 'Signals that every pace belongs. Usually the largest group at community events.' },
      { id: 'wellness-village', label: 'Wellness resource village', why: 'A post-finish area where clinics, gyms and nutrition partners meet participants.' },
      { id: 'health-challenge', label: '30-day post-event movement challenge', why: 'Keeps people moving after race day and feeds Passport streaks.' },
    ],
    partners: ['Community health center', 'Hospital system outreach team', 'Local gyms and run clubs', 'Nutrition educators', 'Mental health nonprofit'],
    metrics: ['Participants who joined the movement challenge', 'Wellness village visits', 'Screenings completed (count only, no results stored)', 'Participants planning to stay active'],
    surveyQuestions: ['After today, how likely are you to walk or run weekly?', 'Which wellness resources would you use again?'],
    followUps: ['Invite participants into a weekly community walking group', 'Share the wellness partner directory', 'Launch a spring movement challenge'],
    activities: ['Group warm-up led by a local trainer', 'Stretch and recovery zone', 'Healthy-habits pledge wall'],
  },
  wealth: {
    id: 'wealth',
    name: 'Wealth',
    letter: 'W2',
    prompt: 'How do we build financial capacity together?',
    summary: 'Financial capability, saving, credit, investing, homeownership, entrepreneurship, financial confidence.',
    goal: 'Connect participants to trusted financial resources and one concrete next step.',
    programming: [
      { id: 'fin-lit-booth', label: 'Financial literacy booth', why: 'Short conversations with counselors at the finish line reach people workshops never do.' },
      { id: 'bank-sponsor', label: 'Bank or credit union sponsor', why: 'A natural title sponsor with a measurable activation: accounts opened, appointments booked.' },
      { id: 'savings-challenge', label: 'Savings challenge', why: 'Pairs miles with dollars saved; easy to track in Passport.' },
      { id: 'entrepreneur-row', label: 'Local entrepreneur row', why: 'Puts neighborhood businesses in front of hundreds of buyers.' },
      { id: 'fin-health-survey', label: 'Financial confidence survey', why: 'Measures confidence before and after, never account details.' },
    ],
    partners: ['Credit union', 'HUD-approved housing counselor', 'Small business development center', 'Local banks', 'Tax prep nonprofit'],
    metrics: ['Financial resource conversations', 'Savings challenge sign-ups', 'Homeownership session RSVPs', 'Local businesses featured'],
    surveyQuestions: ['How confident do you feel about your next financial goal?', 'Which money topic would you attend a workshop on?'],
    followUps: ['Host a homebuyer workshop for interested participants', 'Share savings challenge progress', 'Introduce entrepreneurs to the business center'],
    activities: ['Mile-marker money tips', 'Savings pledge at check-in', 'Ask-a-counselor tent'],
  },
  wisdom: {
    id: 'wisdom',
    name: 'Wisdom',
    letter: 'W3',
    prompt: 'How do we grow what our community knows?',
    summary: 'Education, history, civic knowledge, personal development, literacy, storytelling, mentoring.',
    goal: 'Turn the route into a classroom and give the community a story it can carry forward.',
    programming: [
      { id: 'story-checkpoints', label: 'Storytelling checkpoints', why: 'Short local-history stops along the route make the course itself the program.' },
      { id: 'elders', label: 'Community elders as guides', why: 'Elders lead segments and share memory; intergenerational contact is the point.' },
      { id: 'school-partners', label: 'School partners', why: 'Students research checkpoints and walk with families.' },
      { id: 'cultural-orgs', label: 'Cultural organizations', why: 'Museums, libraries and historical societies host stops and keep the stories.' },
      { id: 'story-capture', label: 'Story capture booth', why: 'Collect participant stories (with consent) for an archive and the impact report.' },
    ],
    partners: ['Public library', 'Historical society', 'Local schools', 'Cultural center', 'Faith and civic elders'],
    metrics: ['Checkpoints completed', 'Stories collected (with consent)', 'Students participating', 'Participants who learned something new'],
    surveyQuestions: ['What did you learn about this community today?', 'Would you volunteer to share or record a story?'],
    followUps: ['Publish the story archive', 'Invite participants to a library discussion series', 'Recruit storytellers for next year'],
    activities: ['Passport stamp at each history stop', 'Intergenerational walking pairs', 'Route map with QR stories'],
  },
  work: {
    id: 'work',
    name: 'Work',
    letter: 'W4',
    prompt: 'How do we create opportunity together?',
    summary: 'Career readiness, employment, entrepreneurship, workforce development, professional growth.',
    goal: 'Connect participants to employers, skills and opportunity in a setting that feels human.',
    programming: [
      { id: 'career-row', label: 'Career and employer row', why: 'Hiring partners meet candidates in a relaxed setting after the walk.' },
      { id: 'resume-clinic', label: 'Resume and LinkedIn clinic', why: 'A quick, valuable service that drives return visits.' },
      { id: 'mentor-miles', label: 'Mentor miles', why: 'Pair professionals with young adults for the walk itself.' },
      { id: 'skills-workshops', label: 'Skills workshop sign-ups', why: 'Turns interest into a scheduled next step.' },
      { id: 'workforce-survey', label: 'Career interest survey', why: 'Shows employers and workforce boards what the community wants.' },
    ],
    partners: ['Workforce development board', 'Regional employers', 'Community college', 'Professional associations', 'Apprenticeship programs'],
    metrics: ['Employer conversations', 'Resume reviews', 'Mentor pairs formed', 'Workshop sign-ups'],
    surveyQuestions: ['Which career resources would help you most this year?', 'Would you like to be matched with a mentor?'],
    followUps: ['Share candidate interest (with consent) with hiring partners', 'Schedule a skills workshop', 'Launch a mentor walking group'],
    activities: ['Mentor-mentee walking pairs', 'Career pledge card', 'Employer scavenger stamps'],
  },
};

export const FOUR_W_LIST = Object.values(FOUR_WS);

export function getFourW(id) {
  return FOUR_WS[id] ?? null;
}

/** Suggested 4Ws for a stated purpose, used to pre-select in the wizard. */
export function suggestFourWs(purposeId) {
  const map = {
    'community-wellness': ['wellness'],
    'employee-wellness': ['wellness', 'work'],
    fundraising: ['wellness'],
    awareness: ['wisdom'],
    'family-engagement': ['wellness', 'wisdom'],
    education: ['wisdom'],
    'economic-empowerment': ['wealth'],
    workforce: ['work'],
    memorial: ['wisdom', 'wellness'],
    other: [],
  };
  return map[purposeId] ?? [];
}
