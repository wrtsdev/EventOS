// Value metrics. Economic value (PLV, Community Lifetime Value) is kept
// strictly separate from community value (Community Value Index).
// Volunteering, cause engagement and social impact are NEVER converted to dollars.

const clamp = (n, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, n));
const round2 = (n) => Math.round(n * 100) / 100;

/**
 * Participant Lifetime Value.
 * Average modeled economic contribution of one participant over their
 * expected relationship with the organization.
 *
 * annual = (event contribution margin + merch margin + sponsor-attributed value) per participant × events per year
 *        + membership revenue per participant
 *        + attributable referral value
 * PLV    = annual × expected relationship years (from retention, capped)
 */
export function participantLifetimeValue(input) {
  const n = Math.max(1, input.participants);
  const eventsPerYear = input.eventsPerYear ?? 1.4;
  const retention = clamp(input.retentionRate ?? 0.35, 0, 0.85);
  const expectedYears = Math.min(6, 1 / (1 - retention));

  const contribution = (input.registrationRevenue - input.directCosts) / n;
  const merch = (input.merchRevenue * (input.merchMarginRate ?? 0.45)) / n;
  const sponsor = (input.sponsorAttributed ?? 0) / n;
  const perEvent = contribution + merch + sponsor;
  const membership = input.membershipPerParticipant ?? 0;
  // A referral is credited with the margin of the participant it brought in, once.
  const referrals = ((input.referralRegistrations ?? 0) / n) * Math.max(0, contribution + merch);

  const annual = {
    contribution: contribution * eventsPerYear,
    merchandise: merch * eventsPerYear,
    sponsor: sponsor * eventsPerYear,
    membership,
    referrals,
  };
  const components = Object.fromEntries(
    Object.entries(annual).map(([k, v]) => [k, round2(v * expectedYears)]),
  );
  const value = Object.values(components).reduce((a, b) => a + b, 0);
  return {
    value: Math.round(value),
    perEvent: round2(perEvent),
    expectedYears: round2(expectedYears),
    eventsPerYear,
    components,
  };
}

/** Community Lifetime Value: PLV across unique community members. */
export function communityLifetimeValue(plv, uniqueParticipants) {
  return Math.round(plv * uniqueParticipants);
}

export const CVI_INPUTS = [
  { id: 'repeat', label: 'Repeat participation', weight: 14, target: 0.45, describe: 'Share of participants who came back' },
  { id: 'cause', label: 'Cause engagement', weight: 14, target: 0.6, describe: 'Took a cause action: gave, fundraised, signed up' },
  { id: 'referrals', label: 'Referrals', weight: 10, target: 0.3, describe: 'Registrations brought by another participant' },
  { id: 'volunteering', label: 'Volunteering', weight: 10, target: 0.08, describe: 'Volunteers per participant' },
  { id: 'passport', label: 'Passport activity', weight: 10, target: 0.7, describe: 'Participants active in Passport after the event' },
  { id: 'feedback', label: 'Participant feedback', weight: 12, target: 1, describe: 'Average satisfaction (1–5) scaled' },
  { id: 'involvement', label: 'Community involvement', weight: 10, target: 0.5, describe: 'Visited a community resource or partner' },
  { id: 'sponsor', label: 'Sponsor engagement', weight: 6, target: 0.5, describe: 'Interacted with a sponsor activation' },
  { id: 'fourW', label: '4W participation', weight: 14, target: 0.55, describe: 'Joined a Wellness, Wealth, Wisdom or Work activity' },
];

/**
 * Community Value Index (0–100). Non-financial. Each input is scored against a
 * healthy-community target, then weighted.
 * @param {Record<string, number>} rates raw rates 0–1 (feedback: average 1–5)
 */
export function communityValueIndex(rates) {
  const components = CVI_INPUTS.map((input) => {
    let raw = rates[input.id] ?? 0;
    if (input.id === 'feedback') raw = clamp((raw - 1) / 4);
    const score = Math.round(clamp(raw / input.target) * 100);
    return { ...input, raw, score, contribution: (score * input.weight) / 100 };
  });
  const total = CVI_INPUTS.reduce((a, b) => a + b.weight, 0);
  const value = Math.round(components.reduce((a, c) => a + c.contribution, 0) * (100 / total));
  const band = value >= 80 ? 'Thriving' : value >= 65 ? 'Building' : value >= 45 ? 'Emerging' : 'Starting';
  const weakest = [...components].sort((a, b) => a.score - b.score).slice(0, 2);
  return { value, band, components, weakest };
}

export function formatMoney(n, { compact = false } = {}) {
  const sign = n < 0 ? '\u2212' : '';
  const a = Math.abs(n);
  if (compact && a >= 1000) {
    return sign + '$' + (a / 1000).toFixed(a >= 100000 ? 0 : 1).replace(/\.0$/, '') + 'K';
  }
  return sign + '$' + Math.round(a).toLocaleString('en-US');
}

export function pct(n, digits = 0) {
  if (n == null || Number.isNaN(n)) return '—';
  return (n * 100).toFixed(digits) + '%';
}
