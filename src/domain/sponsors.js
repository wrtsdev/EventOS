// Sponsorship packages, commitments and deliverable fulfillment.

export const SPONSOR_PACKAGES = [
  {
    id: 'presenting',
    name: 'Presenting',
    price: 7500,
    inventory: 1,
    benefits: ['Name in event title', 'Logo on shirt front and finish arch', 'Activation booth at finish', 'Promo code in confirmation email', 'Survey question', 'Results report'],
  },
  {
    id: 'community',
    name: 'Community',
    price: 2000,
    inventory: 4,
    benefits: ['Logo on shirt back', 'Booth in resource village', 'Social media thank-you', 'Results report'],
  },
  {
    id: 'in-kind',
    name: 'In-kind',
    price: 0,
    inventory: 6,
    benefits: ['Product or service at the event', 'Recognition on event page'],
  },
];

export const DEFAULT_SPONSORS = {
  wellness: [
    { id: 'sp-health', name: 'Riverside Health System', tier: 'Presenting', packageId: 'presenting', amount: 7500, activation: 'Health screening tent + hydration' },
    { id: 'sp-gym', name: 'Northside Fitness Collective', tier: 'Community', packageId: 'community', amount: 1500, activation: '30-day challenge prizes' },
  ],
  wealth: [
    { id: 'sp-cu', name: 'Unity Community Credit Union', tier: 'Presenting', packageId: 'presenting', amount: 8000, activation: 'Savings challenge + account match' },
    { id: 'sp-realty', name: 'Keystone Homeownership Center', tier: 'Community', packageId: 'community', amount: 2000, activation: 'Homebuyer RSVP booth' },
  ],
  wisdom: [
    { id: 'sp-lib', name: 'County Public Library Foundation', tier: 'Presenting', packageId: 'presenting', amount: 4000, activation: 'Story capture booth' },
    { id: 'sp-bank', name: 'Heritage Savings Bank', tier: 'Community', packageId: 'community', amount: 1500, activation: 'Checkpoint passport stamps' },
  ],
  work: [
    { id: 'sp-wfb', name: 'Regional Workforce Board', tier: 'Presenting', packageId: 'presenting', amount: 6000, activation: 'Employer row + resume clinic' },
    { id: 'sp-cc', name: 'Tri-County Community College', tier: 'Community', packageId: 'community', amount: 2500, activation: 'Skills workshop sign-ups' },
  ],
};

export function sponsorsFor(event) {
  if (event.sponsors?.length) return event.sponsors;
  if (!event.features?.includes('sponsors')) return [];
  const ws = event.fourWs?.length ? event.fourWs : ['wellness'];
  return ws.flatMap((w) => DEFAULT_SPONSORS[w]).slice(0, 3);
}

/** Commitment status of a sponsor's money: pledged → invoiced → paid. */
export function commitmentFor(event, sponsor) {
  const stored = event.sponsorCommitments?.[sponsor.id];
  if (stored) return stored;
  if (event.phase === 'complete') return 'paid';
  if (event.phase === 'live' || event.phase === 'eventday') return 'invoiced';
  return 'pledged';
}

const DELIVERABLE_LIBRARY = {
  presenting: [
    { id: 'logo-shirt', label: 'Logo on shirt front', when: 'pre' },
    { id: 'arch', label: 'Logo on finish arch', when: 'day' },
    { id: 'booth', label: 'Activation booth staffed', when: 'day' },
    { id: 'promo', label: 'Promo code in confirmation email', when: 'pre' },
    { id: 'survey-q', label: 'Sponsor survey question included', when: 'post' },
    { id: 'report', label: 'Results report delivered', when: 'post' },
  ],
  community: [
    { id: 'logo-back', label: 'Logo on shirt back', when: 'pre' },
    { id: 'booth', label: 'Resource village booth', when: 'day' },
    { id: 'social', label: 'Social media thank-you', when: 'post' },
    { id: 'report', label: 'Results report delivered', when: 'post' },
  ],
  'in-kind': [
    { id: 'recognition', label: 'Recognition on event page', when: 'pre' },
    { id: 'report', label: 'Results report delivered', when: 'post' },
  ],
};

function phaseRank(phase) {
  return { planning: 0, live: 1, eventday: 2, complete: 3 }[phase] ?? 0;
}

/** Deliverables owed to a sponsor and their fulfillment status. */
export function deliverablesFor(event, sponsor) {
  const lib = DELIVERABLE_LIBRARY[sponsor.packageId ?? (sponsor.tier === 'Presenting' ? 'presenting' : 'community')] ?? DELIVERABLE_LIBRARY.community;
  const stored = event.deliverables?.[sponsor.id] ?? {};
  const rank = phaseRank(event.phase);
  return lib.map((d) => {
    let status = stored[d.id];
    if (!status) {
      const due = d.when === 'pre' ? 1 : d.when === 'day' ? 2 : 3;
      if (rank > due || (rank === 3 && due === 3 && d.id !== 'report')) status = 'delivered';
      else if (rank === 3 && d.id === 'report') status = event.aar?.status === 'complete' ? 'delivered' : 'pending';
      else status = 'pending';
    }
    return { ...d, status };
  });
}

export function fulfillment(event) {
  const sponsors = sponsorsFor(event);
  const rows = sponsors.map((s) => {
    const items = deliverablesFor(event, s);
    const delivered = items.filter((i) => i.status === 'delivered').length;
    return { sponsor: s, items, delivered, total: items.length, missed: items.filter((i) => i.status === 'missed').length, commitment: commitmentFor(event, s) };
  });
  const total = rows.reduce((a, r) => a + r.total, 0);
  const delivered = rows.reduce((a, r) => a + r.delivered, 0);
  return { rows, total, delivered, rate: total ? delivered / total : null, committed: sponsors.reduce((a, s) => a + (Number(s.amount) || 0), 0) };
}

export function packageInventory(event) {
  const sponsors = sponsorsFor(event);
  return SPONSOR_PACKAGES.map((p) => ({ ...p, sold: sponsors.filter((s) => (s.packageId ?? '') === p.id || (!s.packageId && s.tier === p.name)).length }));
}
