// Connector registry. Status is stated honestly:
//   live          connected to the real service (none in this prototype)
//   mock          demo adapter returning sample data in the vendor's format
//   not-connected adapter contract exists; no client yet
//   planned       on the roadmap
// Connector registry with mock adapters. Each mock returns data in the
// vendor's own shape so normalization is exercised the same way a real
// connector would be. Swap a mock for a live client without touching UI code.

import { defineAdapter } from './adapter.js';

// RunSignup sends dates like "2026-09-30 18:04:11" or "9/30/2026 18:04"; fall back to now.
function safeDate(v) {
  if (!v) return new Date().toISOString();
  const iso = /^\d{4}-\d{2}-\d{2} /.test(v) ? new Date(v.replace(' ', 'T') + 'Z') : new Date(v);
  return Number.isNaN(iso.getTime()) ? new Date().toISOString() : iso.toISOString();
}

const splitName = (full = '') => {
  const [first = '', ...rest] = full.trim().split(/\s+/);
  const last = rest.join(' ');
  return { firstName: first, lastInitial: last ? last[0].toUpperCase() : '' };
};

export const runSignup = defineAdapter({
  id: 'runsignup',
  name: 'RunSignup',
  category: 'registration',
  status: 'mock',
  capabilities: ['Import registrations', 'Import teams', 'Import donations', 'Webhook on new registration'],
  async fetchRaw() {
    return [
      { registration_id: 88123, user: { first_name: 'Keisha', last_name: 'Turner', email: 'keisha@example.com', address: { zipcode: '27701' } }, team_name: 'Northside Striders', registration_date: '2026-09-30 18:04:11', amount_paid: '35.00', coupon_code: 'STRIDERS', opt_ins: { email: 'T', partner_share: 'F' } },
      { registration_id: 88124, user: { first_name: 'Marcus', last_name: 'Hill', email: 'mhill@example.com', address: { zipcode: '27704' } }, team_name: null, registration_date: '2026-10-01 07:22:40', amount_paid: '35.00', coupon_code: null, opt_ins: { email: 'F', partner_share: 'F' } },
    ];
  },
  normalize(raw) {
    return {
      id: `p-rsu-${raw.registration_id}`,
      externalId: String(raw.registration_id),
      source: 'runsignup',
      firstName: raw.user?.first_name ?? '',
      lastInitial: (raw.user?.last_name || '')[0] ?? '',
      email: raw.user?.email ?? null,
      zip: raw.user?.address?.zipcode ?? null,
      team: raw.team_name ?? null,
      referralCode: raw.coupon_code ?? null,
      registeredAt: safeDate(raw.registration_date),
      amountPaid: Number(raw.amount_paid) || 0,
      consent: { analytics: true, marketing: raw.opt_ins?.email === 'T', sharePartners: raw.opt_ins?.partner_share === 'T' },
    };
  },
});

export const raceRoster = defineAdapter({
  id: 'raceroster',
  name: 'Race Roster',
  category: 'registration',
  status: 'mock',
  capabilities: ['Import registrations', 'Import fundraising', 'Import custom questions'],
  async fetchRaw() {
    return [
      { id: 'rr_5521', participant: { fullName: 'Imani Brooks', emailAddress: 'imani@example.com', postalCode: '27707' }, teamName: 'Delta Sisters', createdAt: '2026-10-03T14:10:00Z', totalPaidCents: 3500, referral: 'DELTA', marketingOptIn: true },
    ];
  },
  normalize(raw) {
    const { firstName, lastInitial } = splitName(raw.participant.fullName);
    return {
      id: `p-rr-${raw.id}`,
      externalId: raw.id,
      source: 'raceroster',
      firstName,
      lastInitial,
      email: raw.participant.emailAddress ?? null,
      zip: raw.participant.postalCode ?? null,
      team: raw.teamName ?? null,
      referralCode: raw.referral ?? null,
      registeredAt: raw.createdAt,
      amountPaid: raw.totalPaidCents / 100,
      consent: { analytics: true, marketing: Boolean(raw.marketingOptIn), sharePartners: false },
    };
  },
});

export const genericTiming = defineAdapter({
  id: 'timing-csv',
  name: 'Timing provider (CSV / API)',
  category: 'timing',
  status: 'mock',
  capabilities: ['Import results by bib', 'Match bibs to participants'],
  async fetchRaw() {
    return [{ bib: '1042', registration_ref: 'p-rsu-88123', chip_time: '00:37:48', status: 'FIN' }];
  },
  normalize(raw) {
    const [h, m, s] = raw.chip_time.split(':').map(Number);
    return { participantId: raw.registration_ref, source: 'timing-csv', chipSeconds: h * 3600 + m * 60 + s, finished: raw.status === 'FIN' };
  },
});

const planned = (id, name, category, capabilities, status = 'not-connected') =>
  defineAdapter({ id, name, category, status, capabilities });

export const ADAPTERS = [
  runSignup,
  raceRoster,
  planned('haku', 'haku', 'registration', ['Import registrations', 'Import results']),
  planned('active', 'ACTIVE', 'registration', ['Import registrations']),
  planned('ultrasignup', 'UltraSignup', 'registration', ['Import registrations', 'Import results']),
  planned('movemint', 'Movemint', 'registration', ['Import registrations', 'Import fundraising']),
  planned('other-registration', 'Other registration (CSV)', 'registration', ['Upload a spreadsheet of registrants']),
  genericTiming,
  planned('givebutter', 'Fundraising platform', 'fundraising', ['Import pages and gifts'], 'planned'),
  planned('hubspot', 'HubSpot', 'crm', ['Export participants', 'Sync lists and properties', 'Trigger workflows'], 'mock'),
  planned('strava', 'Fitness apps (Strava, Apple Health)', 'participant-app', ['Import logged miles for virtual events'], 'planned'),
];

export function adaptersByCategory() {
  const out = {};
  for (const a of ADAPTERS) (out[a.category] ??= []).push(a);
  return out;
}

/** Pull and normalize every connected registration source. */
export async function importRegistrations(adapters = ADAPTERS) {
  const sources = adapters.filter((a) => a.category === 'registration' && (a.status === 'mock' || a.status === 'live') && a.fetchRaw);
  const batches = await Promise.all(
    sources.map(async (a) => (await a.fetchRaw()).map((raw) => ({ raw, canonical: a.normalize(raw), source: a.id }))),
  );
  return batches.flat();
}
