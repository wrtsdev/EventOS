// Live metrics for real organizations, built from registration rows the server
// returns (no names or emails). Same shape as simulateEvent so every dashboard
// works, but anything EventOS does not track yet is null, never invented.

import { participantLifetimeValue, communityLifetimeValue, communityValueIndex } from './metrics.js';
import { plannedExpense } from './finance.js';
import { sponsorsFor, commitmentFor } from './sponsors.js';
import { workforceSummary } from './workforce.js';
import { incidentsFor } from './safety.js';
import { volunteerNeed } from './eventBasics.js';

const countBy = (list, fn) => {
  const m = new Map();
  for (const x of list) {
    const k = fn(x);
    if (k == null || k === '') continue;
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return [...m.entries()].map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count);
};

export const UNTRACKED = ['page views and funnel', 'email opens and clicks', 'sponsor booth visits and recall', 'survey feedback'];

export function liveMetrics(event, rows = [], org = {}) {
  const phase = event.phase ?? 'planning';
  const counted = rows.filter((r) => r.paymentStatus === 'free' || r.paymentStatus === 'paid');
  const n = counted.length;
  const goal = Number(event.cap || event.expected) || 0;
  const failed = rows.filter((r) => r.paymentStatus === 'failed').length;
  const pending = rows.filter((r) => r.paymentStatus === 'pending').length;

  // Registrations per week, last 8 weeks before the latest registration
  const weeks = Array(8).fill(0);
  if (counted.length) {
    const end = Math.max(...counted.map((r) => new Date(r.createdAt).getTime()));
    for (const r of counted) {
      const w = Math.floor((end - new Date(r.createdAt).getTime()) / (7 * 86400000));
      if (w < 8) weeks[7 - w] += 1;
    }
  }

  const participants = counted.map((r) => ({
    id: r.id,
    zip: r.zip,
    team: r.team,
    referredBy: r.referredBy,
    returning: r.returning,
    source: r.source,
    division: r.division,
    finished: r.finished,
    donated: r.donated,
    causeAction: r.donated,
    fourWInterest: r.fourWInterest ?? [],
    fourWActivity: null,
    consent: r.consent,
    passportActive: false,
    likelyReturn: r.returning,
    walkingClubInterest: false,
    satisfaction: null,
    volunteer: false,
  }));

  const sum = (f) => counted.reduce((a, r) => a + f(r), 0);
  const registration = sum((r) => r.amountCents) / 100;
  const donations = sum((r) => r.donationCents) / 100;
  const sponsors = sponsorsFor(event);
  const sponsorship = sponsors.filter((s) => commitmentFor(event, s) === 'paid').reduce((a, s) => a + (Number(s.amount) || 0), 0);
  const costs = plannedExpense(event);
  const wf = workforceSummary(event, null);
  const returning = participants.filter((p) => p.returning).length;
  const referrals = participants.filter((p) => p.referredBy).length;

  // Until a quarter of the goal has registered, fixed costs spread over a handful
  // of people would show a misleading loss, so PLV is projected at the goal.
  const projected = goal > 0 && n < goal * 0.25;
  const plv = participantLifetimeValue({
    participants: projected ? goal : Math.max(1, n),
    registrationRevenue: projected ? goal * (Number(event.price) || 0) : registration,
    directCosts: costs * 0.4,
    merchRevenue: 0,
    sponsorAttributed: sponsorship * 0.35,
    membershipPerParticipant: org.membershipPerParticipant ?? 0,
    referralRegistrations: referrals,
    retentionRate: n ? Math.min(0.75, returning / n) : 0.3,
    eventsPerYear: Math.min(2.5, (org.eventsPerYear ?? 1) * 0.7),
  });
  plv.projected = projected || n === 0;
  const uniqueMembers = n - returning;

  const rates = n
    ? {
        repeat: returning / n,
        cause: participants.filter((p) => p.donated).length / n,
        referrals: referrals / n,
        volunteering: wf.volunteers.assigned / n,
        passport: 0,
        feedback: 1,
        involvement: 0,
        sponsor: 0,
        fourW: participants.filter((p) => p.fourWInterest.length).length / n,
      }
    : null;

  return {
    live: true,
    untracked: UNTRACKED,
    phase,
    canceled: event.status === 'canceled',
    payments: rows.length ? { attempted: rows.length, failed: failed + pending, recovered: 0, pending: failed + pending } : null,
    checkedIn: counted.filter((r) => r.checkedIn).length,
    participants,
    registered: n,
    goal,
    conversionRate: null,
    funnel: [],
    leakStage: null,
    leakFrom: null,
    regSeries: weeks,
    teams: countBy(counted, (r) => r.team).map((t) => ({ name: t.key, members: t.count, raised: 0 })),
    revenue: {
      registration,
      sponsorship,
      donations,
      fundraising: 0,
      merchandise: 0,
      costs,
      margin: registration + sponsorship - costs,
      freeEvent: !Number(event.price),
      projectedMargin: registration + sponsorship - costs,
    },
    engagement: { emailsSent: null, openRate: null, clickRate: null, referralRegistrations: referrals, teamRegistrations: participants.filter((p) => p.team).length, fundraisingPages: 0, fundraising: 0 },
    impact: {
      causeParticipants: participants.filter((p) => p.donated).length,
      volunteers: wf.volunteers.assigned,
      volunteersNeeded: volunteerNeed(event),
      volunteerHours: wf.volunteers.hours,
      surveyResponses: 0,
      avgSatisfaction: null,
      fourWActivities: Object.fromEntries((event.fourWs ?? []).map((w) => [w, 0])),
      resourcesAccessed: 0,
      storiesCollected: 0,
      raised: donations,
    },
    finishers: participants.filter((p) => p.finished).length,
    returning,
    firstTime: n - returning,
    referrals,
    likelyReturn: returning,
    zips: countBy(counted, (r) => r.zip).map((z) => ({ zip: z.key, count: z.count, returning: counted.filter((r) => r.zip === z.key && r.returning).length })),
    referralGroups: countBy(counted, (r) => r.referredBy).map((g) => ({ group: g.key, referrals: g.count })),
    sources: countBy(counted, (r) => r.source).map((s) => ({ source: s.key, count: s.count })),
    sponsors: sponsors.map((s) => ({ ...s, impressions: null, clicks: null, registrations: null, promoRedemptions: null, boothVisits: null, surveyRecall: null, referrals: null, zipsReached: null, causeImpact: 0 })),
    feedback: [],
    needs: [],
    plv,
    clv: communityLifetimeValue(plv.value, Math.max(0, uniqueMembers)),
    uniqueMembers,
    cvi: rates ? communityValueIndex(rates) : null,
    nextActions: [],
    incidents: incidentsFor(event).length,
  };
}
