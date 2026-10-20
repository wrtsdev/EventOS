// Deterministic event simulation. In production these numbers come from the
// Integration Gateway (registration, timing, fundraising, surveys). For the
// prototype we generate realistic canonical data seeded by the event id, so any
// event a stakeholder creates can be walked from planning to impact report.

import { FOUR_WS } from './fourW.js';
import { getEventType } from './catalog.js';
import { participantLifetimeValue, communityLifetimeValue, communityValueIndex } from './metrics.js';
import { isPhysical, volunteerNeed } from './blueprint.js';

export function hashString(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function rng(seed) {
  let a = typeof seed === 'number' ? seed : hashString(String(seed));
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FIRST = ['Aaliyah', 'Marcus', 'Keisha', 'Andre', 'Tasha', 'Jamal', 'Monique', 'Darnell', 'Imani', 'Terrence', 'Brianna', 'Malik', 'Ebony', 'Curtis', 'Nia', 'Reggie', 'Latoya', 'Devon', 'Simone', 'Corey', 'Ana', 'Luis', 'Grace', 'Ethan', 'Maya', 'Priya', 'Sam', 'Olivia', 'Noah', 'Destiny', 'Isaiah', 'Kendra', 'Jordan', 'Tiana', 'Xavier'];
const LAST_I = 'ABCDEFGHJKLMNPRSTW';
// Sample ZIP codes for a fictional service area.
export const SAMPLE_ZIPS = ['27701', '27703', '27704', '27705', '27707', '27712', '27713'];
const ZIP_WEIGHTS = [0.24, 0.2, 0.16, 0.13, 0.12, 0.09, 0.06];
const PROVIDERS = [
  { id: 'runsignup', w: 0.55 },
  { id: 'raceroster', w: 0.25 },
  { id: 'eventos', w: 0.2 },
];
export const REFERRAL_GROUPS = ['Team captains', 'Faith partners', 'Run clubs', 'Coworkers', 'Greek chapters', 'Social media', 'School families'];

function pickWeighted(r, items, weights) {
  const x = r();
  let acc = 0;
  for (let i = 0; i < items.length; i++) {
    acc += weights[i];
    if (x <= acc) return items[i];
  }
  return items[items.length - 1];
}

const GENERAL_FEEDBACK = [
  { theme: 'Felt welcoming for every pace', sentiment: 'positive', quote: 'First time I did a 5K and nobody made me feel slow.' },
  { theme: 'Great energy at the finish', sentiment: 'positive', quote: 'The DJ and the crowd at the finish were the best part.' },
  { theme: 'Parking and arrival were confusing', sentiment: 'negative', quote: 'Took 20 minutes to find parking and the start area.' },
  { theme: 'Check-in lines were long', sentiment: 'negative', quote: 'Packet line at 7am was too slow.' },
  { theme: 'Want more water on course', sentiment: 'negative', quote: 'Needed water around mile 2.' },
  { theme: 'Liked doing it with family', sentiment: 'positive', quote: 'Brought my kids and my mom. We all finished together.' },
];
const W_FEEDBACK = {
  wellness: [
    { theme: 'Health screenings were valuable', sentiment: 'positive', quote: 'Got my blood pressure checked for the first time in years.' },
    { theme: 'Want a regular walking group', sentiment: 'need', quote: 'Wish there was a weekly walk like this.' },
  ],
  wealth: [
    { theme: 'Financial booth felt approachable', sentiment: 'positive', quote: 'Talked to a credit union person without feeling judged.' },
    { theme: 'Interest in homebuying help', sentiment: 'need', quote: 'Would come back for a first-time homebuyer class.' },
  ],
  wisdom: [
    { theme: 'History stops were the highlight', sentiment: 'positive', quote: 'Learned things about my own street I never knew.' },
    { theme: 'Want more stories from elders', sentiment: 'need', quote: 'Please record the elders. Their stories should be saved.' },
  ],
  work: [
    { theme: 'Employer row felt low-pressure', sentiment: 'positive', quote: 'Easier to talk to recruiters after a walk than at a job fair.' },
    { theme: 'Want resume and interview help', sentiment: 'need', quote: 'Would love a resume workshop for my son.' },
  ],
};
const NEEDS = [
  { need: 'Weekly walking group', fourW: 'wellness' },
  { need: 'First-time homebuyer workshop', fourW: 'wealth' },
  { need: 'Youth mentoring', fourW: 'work' },
  { need: 'Local history series', fourW: 'wisdom' },
  { need: 'Healthy cooking on a budget', fourW: 'wellness' },
  { need: 'Small business support', fourW: 'wealth' },
];

export const DEFAULT_SPONSORS = {
  wellness: [
    { id: 'sp-health', name: 'Riverside Health System', tier: 'Presenting', amount: 7500, activation: 'Health screening tent + hydration' },
    { id: 'sp-gym', name: 'Northside Fitness Collective', tier: 'Community', amount: 1500, activation: '30-day challenge prizes' },
  ],
  wealth: [
    { id: 'sp-cu', name: 'Unity Community Credit Union', tier: 'Presenting', amount: 8000, activation: 'Savings challenge + account match' },
    { id: 'sp-realty', name: 'Keystone Homeownership Center', tier: 'Community', amount: 2000, activation: 'Homebuyer RSVP booth' },
  ],
  wisdom: [
    { id: 'sp-lib', name: 'County Public Library Foundation', tier: 'Presenting', amount: 4000, activation: 'Story capture booth' },
    { id: 'sp-bank', name: 'Heritage Savings Bank', tier: 'Community', amount: 1500, activation: 'Checkpoint passport stamps' },
  ],
  work: [
    { id: 'sp-wfb', name: 'Regional Workforce Board', tier: 'Presenting', amount: 6000, activation: 'Employer row + resume clinic' },
    { id: 'sp-cc', name: 'Tri-County Community College', tier: 'Community', amount: 2500, activation: 'Skills workshop sign-ups' },
  ],
};

export function sponsorsFor(event) {
  if (event.sponsors?.length) return event.sponsors;
  if (!event.features?.includes('sponsors')) return [];
  const ws = event.fourWs?.length ? event.fourWs : ['wellness'];
  return ws.flatMap((w) => DEFAULT_SPONSORS[w]).slice(0, 3);
}

/**
 * Generate canonical participants for an event at a given phase.
 * Returns objects in the same shape the Integration Gateway produces.
 */
export function generateParticipants(event, phase) {
  const r = rng(event.id + ':participants');
  const goal = Number(event.cap || event.expected) || 100;
  const fill = phase === 'complete' ? 0.96 + r() * 0.06 : phase === 'live' ? 0.66 + r() * 0.08 : 0;
  const n = Math.round(goal * fill);
  const ws = event.fourWs?.length ? event.fourWs : ['wellness'];
  const teamCount = event.features?.includes('teams') ? Math.max(3, Math.round(n / 28)) : 0;
  const teamNames = ['Northside Striders', 'Deacon Board Walkers', 'Alpha Chapter', 'Riverside Nurses', 'Eastgate PTA', 'Unity CU Team', 'Westend Run Club', 'Library Legends', 'Grandkids Crew', 'Mayor’s Office', 'Delta Sisters', 'Main St Merchants', 'Hope Church', 'Lincoln High Track'];
  const teams = teamNames.slice(0, teamCount);
  const out = [];
  for (let i = 0; i < n; i++) {
    const returning = r() < 0.36;
    const referred = r() < 0.27;
    const physical = isPhysical(event);
    const zip = pickWeighted(r, SAMPLE_ZIPS, ZIP_WEIGHTS);
    out.push({
      id: `${event.id}-p${i + 1}`,
      firstName: FIRST[Math.floor(r() * FIRST.length)],
      lastInitial: LAST_I[Math.floor(r() * LAST_I.length)],
      zip,
      source: pickWeighted(r, PROVIDERS.map((p) => p.id), PROVIDERS.map((p) => p.w)),
      team: teams.length && r() < 0.58 ? teams[Math.floor(r() * teams.length)] : null,
      referredBy: referred ? REFERRAL_GROUPS[Math.floor(r() * REFERRAL_GROUPS.length)] : null,
      returning,
      priorEvents: returning ? 1 + Math.floor(r() * 4) : 0,
      division: physical && r() < 0.48 ? 'walk' : 'run',
      finished: phase === 'complete' ? r() < 0.94 : false,
      volunteer: false,
      causeAction: r() < (event.cause ? 0.52 : 0.18),
      donated: event.cause ? r() < 0.31 : false,
      fourWActivity: phase === 'complete' && r() < 0.49 ? ws[Math.floor(r() * ws.length)] : null,
      fourWInterest: ws.filter(() => r() < 0.5),
      resourceVisit: phase === 'complete' && r() < 0.44,
      sponsorInteraction: phase === 'complete' && r() < 0.41,
      satisfaction: phase === 'complete' ? Math.min(5, 3 + Math.round(r() * 2 + r() * 0.6)) : null,
      passportActive: phase === 'complete' ? r() < 0.62 : r() < 0.4,
      likelyReturn: returning ? r() < 0.78 : r() < 0.49,
      walkingClubInterest: r() < 0.22,
      consent: { analytics: r() < 0.93, marketing: r() < 0.76, sharePartners: r() < 0.41 },
    });
  }
  return out;
}

function countBy(list, fn) {
  const m = new Map();
  for (const x of list) {
    const k = fn(x);
    if (k == null) continue;
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return [...m.entries()].map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count);
}

/** Full simulated performance for an event. Planning-phase events return a light projection. */
export function simulateEvent(event, org = {}) {
  const phase = event.phase ?? 'planning';
  const r = rng(event.id + ':metrics');
  const type = getEventType(event.typeId);
  const goal = Number(event.cap || event.expected) || 100;
  const price = Number(event.price ?? 35);
  const participants = generateParticipants(event, phase);
  const n = participants.length;
  const ws = event.fourWs?.length ? event.fourWs : ['wellness'];
  const sponsors = sponsorsFor(event);
  const physical = isPhysical(event);

  // Registration funnel
  const payToReg = 0.76 + r() * 0.16;
  const startToPay = 0.58 + r() * 0.26;
  const viewToStart = 0.26 + r() * 0.1;
  const reachedPayment = Math.round(n / payToReg);
  const started = Math.round(reachedPayment / startToPay);
  const pageViews = Math.round(started / viewToStart);
  const funnel = [
    { stage: 'Viewed event page', count: pageViews },
    { stage: 'Started registration', count: started },
    { stage: 'Reached payment', count: reachedPayment },
    { stage: 'Registered', count: n },
  ];
  // The view→start step is always the biggest raw drop on any event page, so
  // the actionable leak is the weaker of the two in-form steps.
  const leakIdx = startToPay < payToReg ? 1 : 2;

  const SHAPE = [0.05, 0.08, 0.1, 0.09, 0.12, 0.14, 0.18, 0.24];
  const visibleWeeks = phase === 'live' ? 6 : SHAPE.length;
  const shown = SHAPE.slice(0, visibleWeeks);
  const shownSum = shown.reduce((a, b) => a + b, 0);
  const regSeries = shown.map((s) => Math.round((s / shownSum) * n));
  // fix rounding so the series sums to n
  const diff = n - regSeries.reduce((a, b) => a + b, 0);
  if (regSeries.length) regSeries[regSeries.length - 1] += diff;

  const teams = countBy(participants, (p) => p.team).map((t) => ({
    name: t.key,
    members: t.count,
    raised: event.features?.includes('fundraising') ? Math.round(t.count * (38 + r() * 60)) : 0,
  }));

  // Money
  const freeEvent = price === 0;
  const registrationRevenue = n * price;
  const sponsorship = sponsors.reduce((a, s) => a + (Number(s.amount) || 0), 0) * (phase === 'planning' ? 0 : 1);
  const donations = participants.filter((p) => p.donated).length * (28 + Math.round(r() * 20));
  const fundraising = teams.reduce((a, t) => a + t.raised, 0);
  const merchandise = event.features?.includes('shirts') ? Math.round(n * (0.14 + r() * 0.06) * 25) : 0;
  const fixedCosts = physical ? 2400 + (type.timed ? 1800 : 0) + (Number(event.expected) > 300 ? 1500 : 600) : 600;
  const perHead = (event.features?.includes('shirts') ? 7.5 : 0) + (event.features?.includes('medals') ? 4.5 : 0) + (physical ? 3 : 1.2) + price * 0.06;
  const costs = Math.round(fixedCosts + perHead * n);
  const revenueTotal = registrationRevenue + sponsorship + merchandise;
  const margin = revenueTotal - costs;

  // People and impact
  const volunteersNeeded = volunteerNeed(event);
  const volunteers = phase === 'planning' ? 0 : Math.round(volunteersNeeded * (phase === 'complete' ? 1.08 : 0.72));
  const finishers = participants.filter((p) => p.finished).length;
  const returning = participants.filter((p) => p.returning).length;
  const referrals = participants.filter((p) => p.referredBy).length;
  const causeParticipants = participants.filter((p) => p.causeAction).length;
  const responders = participants.filter((p) => p.satisfaction != null && p.consent.analytics);
  const surveyResponses = Math.round(responders.length * 0.47);
  const avgSatisfaction = responders.length ? responders.reduce((a, p) => a + p.satisfaction, 0) / responders.length : null;
  const fourWActivities = Object.fromEntries(ws.map((w) => [w, participants.filter((p) => p.fourWActivity === w).length]));
  const resourcesAccessed = participants.filter((p) => p.resourceVisit).length;
  const sponsorInteractions = participants.filter((p) => p.sponsorInteraction).length;

  // Engagement
  const engagement = {
    emailsSent: phase === 'planning' ? 0 : phase === 'live' ? 5 : 8,
    openRate: 0.46 + r() * 0.12,
    clickRate: 0.09 + r() * 0.05,
    referralRegistrations: referrals,
    teamRegistrations: participants.filter((p) => p.team).length,
    fundraisingPages: event.features?.includes('fundraising') ? Math.round(n * 0.18) : 0,
    fundraising,
  };

  // Intelligence
  const zips = countBy(participants, (p) => p.zip).map((z) => ({
    zip: z.key,
    count: z.count,
    returning: participants.filter((p) => p.zip === z.key && p.returning).length,
  }));
  const referralGroups = countBy(participants, (p) => p.referredBy).map((g) => ({ group: g.key, referrals: g.count }));
  const sources = countBy(participants, (p) => p.source).map((s) => ({ source: s.key, count: s.count }));

  const feedbackPool = [...GENERAL_FEEDBACK, ...ws.flatMap((w) => W_FEEDBACK[w])];
  const feedback = phase === 'complete'
    ? feedbackPool.map((f) => ({ ...f, mentions: Math.max(3, Math.round(surveyResponses * (0.05 + r() * 0.22))) })).sort((a, b) => b.mentions - a.mentions)
    : [];
  const needs = phase === 'complete'
    ? NEEDS.map((x) => ({ ...x, mentions: Math.round(surveyResponses * (ws.includes(x.fourW) ? 0.2 + r() * 0.18 : 0.04 + r() * 0.1)) })).sort((a, b) => b.mentions - a.mentions)
    : [];

  const sponsorStats = sponsors.map((s, i) => {
    const sr = rng(event.id + s.id);
    const weight = i === 0 ? 1 : 0.55;
    const booth = phase === 'complete' ? Math.round(sponsorInteractions * weight * (0.6 + sr() * 0.3)) : 0;
    return {
      ...s,
      impressions: Math.round(pageViews * (2.2 + sr()) * weight + n * 6 * weight),
      clicks: Math.round(pageViews * (0.04 + sr() * 0.03) * weight),
      registrations: Math.round(n * (0.04 + sr() * 0.05) * weight),
      promoRedemptions: Math.round(n * (0.03 + sr() * 0.04) * weight),
      boothVisits: booth,
      surveyRecall: phase === 'complete' ? Math.min(0.9, 0.34 + sr() * 0.3 * weight + 0.1 * weight) : null,
      referrals: Math.round(referrals * 0.12 * weight),
      zipsReached: Math.min(SAMPLE_ZIPS.length, 3 + Math.round(sr() * 4 * weight)),
      causeImpact: i === 0 && event.cause ? Math.round(donations * 0.25) : 0,
    };
  });

  // Value metrics
  // Before registration opens, value metrics are projected from the plan.
  const projected = n === 0;
  const valueN = projected ? goal : n;
  const sponsorAttributed = sponsors.reduce((a, s) => a + (Number(s.amount) || 0), 0) * 0.35; // share of sponsor renewal value attributed to participant engagement
  const plv = participantLifetimeValue({
    participants: Math.max(1, valueN),
    registrationRevenue: valueN * price,
    directCosts: perHead * valueN,
    merchRevenue: projected ? valueN * 0.16 * 25 * (event.features?.includes('shirts') ? 1 : 0) : merchandise,
    merchMarginRate: 0.45,
    sponsorAttributed,
    membershipPerParticipant: org.membershipPerParticipant ?? 12,
    referralRegistrations: projected ? Math.round(valueN * 0.25) : referrals,
    retentionRate: projected ? 0.55 : Math.min(0.75, returning / n + 0.22),
    eventsPerYear: org.eventsPerYear ? Math.min(2.5, org.eventsPerYear * 0.7) : 1.4,
  });
  plv.projected = projected;
  const uniqueMembers = (org.historicMembers ?? 860) + (projected ? Math.round(goal * 0.6) : participants.filter((p) => !p.returning).length);
  const clv = communityLifetimeValue(plv.value, uniqueMembers);
  const rates = n
    ? {
        repeat: returning / n,
        cause: causeParticipants / n,
        referrals: referrals / n,
        volunteering: volunteers / n,
        passport: participants.filter((p) => p.passportActive).length / n,
        feedback: avgSatisfaction ?? 3.6,
        involvement: phase === 'complete' ? resourcesAccessed / n : 0.15,
        sponsor: phase === 'complete' ? sponsorInteractions / n : 0.1,
        fourW: phase === 'complete' ? Object.values(fourWActivities).reduce((a, b) => a + b, 0) / n : 0.12,
      }
    : {};
  const cvi = n ? communityValueIndex(rates) : null;

  const walkingClub = participants.filter((p) => p.walkingClubInterest && p.consent.marketing).length;
  const causeReengage = participants.filter((p) => p.causeAction && !p.donated && p.consent.marketing).length;
  const returningConsented = participants.filter((p) => p.returning && p.consent.marketing).length;
  const topSponsor = [...sponsorStats].sort((a, b) => b.boothVisits + b.registrations - (a.boothVisits + a.registrations))[0];
  const topNeed = needs[0];

  const nextActions = phase === 'complete'
    ? [
        { id: 'club', title: `Invite ${walkingClub} participants into a quarterly walking club`, why: 'They said they want to keep moving together and agreed to hear from you.', fourW: 'wellness', crm: 'HubSpot list: Walking club prospects' },
        event.cause && { id: 'cause', title: `Re-engage ${causeReengage} participants who supported ${event.cause}`, why: 'They took a cause action but have not given yet.', fourW: null, crm: 'HubSpot workflow: Cause supporters nurture' },
        topSponsor && { id: 'sponsor', title: `Bring ${topSponsor.name} a renewal with numbers`, why: `${topSponsor.boothVisits} booth visits, ${topSponsor.registrations} attributed registrations, ${Math.round((topSponsor.surveyRecall ?? 0) * 100)}% survey recall.`, fourW: null, crm: 'HubSpot deal: Sponsor renewal' },
        topNeed && { id: 'need', title: `Launch a ${topNeed.need.toLowerCase()}`, why: `${topNeed.mentions} survey responses asked for it.`, fourW: topNeed.fourW, crm: 'HubSpot list: Interested in ' + topNeed.need },
        { id: 'early', title: `Offer early registration to ${returningConsented} returning participants`, why: 'Returning participants renew at higher rates when invited first.', fourW: null, crm: 'HubSpot workflow: Early access' },
      ].filter(Boolean)
    : [];

  return {
    phase,
    participants,
    registered: n,
    goal,
    conversionRate: pageViews ? n / pageViews : 0,
    funnel,
    leakStage: funnel[leakIdx + 1]?.stage,
    leakFrom: funnel[leakIdx]?.stage,
    regSeries,
    teams,
    revenue: {
      registration: registrationRevenue,
      sponsorship,
      donations,
      fundraising,
      merchandise,
      costs,
      margin,
      freeEvent,
      projectedMargin: phase === 'live' ? Math.round(margin + (goal - n) * (price - perHead)) : margin,
    },
    engagement,
    impact: {
      causeParticipants,
      volunteers,
      volunteersNeeded,
      volunteerHours: volunteers * 4,
      surveyResponses,
      avgSatisfaction,
      fourWActivities,
      resourcesAccessed,
      storiesCollected: ws.includes('wisdom') && phase === 'complete' ? Math.round(n * 0.09) : 0,
      raised: donations + fundraising,
    },
    finishers,
    returning,
    firstTime: n - returning,
    referrals,
    likelyReturn: participants.filter((p) => p.likelyReturn).length,
    zips,
    referralGroups,
    sources,
    sponsors: sponsorStats,
    feedback,
    needs,
    plv,
    clv,
    uniqueMembers,
    cvi,
    nextActions,
  };
}

export function partnersFor(event) {
  const ws = event.fourWs?.length ? event.fourWs : ['wellness'];
  return ws.flatMap((w) => FOUR_WS[w].partners.slice(0, 3));
}
