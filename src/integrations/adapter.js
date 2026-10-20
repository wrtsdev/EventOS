// EventOS Integration Gateway — adapter contract.
//
// Every external system (registration, timing, fundraising, CRM, participant
// apps) is reached through an adapter that implements this shape. The rest of
// the app only ever sees canonical records, so no vendor is hard-coded into
// screens or metrics.
//
// Build-vs-buy: transactions, payments, timing and mature race operations are
// integrated through adapters. Community identity (Passport), engagement,
// impact intelligence and relationship value are owned by EventOS.

/**
 * @typedef {'registration'|'timing'|'fundraising'|'crm'|'participant-app'} AdapterCategory
 *
 * @typedef {Object} CanonicalParticipant
 * @property {string} id            EventOS participant id (stable across events)
 * @property {string} externalId    id in the source system
 * @property {string} source        adapter id
 * @property {string} firstName
 * @property {string} lastInitial   EventOS keeps the minimum necessary name data for intelligence views
 * @property {string|null} email    present only in the transactional store
 * @property {string|null} zip
 * @property {string|null} team
 * @property {string|null} referralCode
 * @property {string} registeredAt  ISO timestamp
 * @property {number} amountPaid
 * @property {{analytics:boolean, marketing:boolean, sharePartners:boolean}} consent
 *
 * @typedef {Object} CanonicalResult
 * @property {string} participantId
 * @property {string} source
 * @property {number|null} chipSeconds
 * @property {boolean} finished
 *
 * @typedef {Object} EventOSAdapter
 * @property {string} id
 * @property {string} name
 * @property {AdapterCategory} category
 * @property {'connected'|'available'|'planned'} status
 * @property {string[]} capabilities           what the adapter can import or export
 * @property {() => Promise<any[]>} [fetchRaw] mock: returns vendor-shaped records
 * @property {(raw:any) => CanonicalParticipant|CanonicalResult} [normalize]
 * @property {(canonical:any) => any} [toExternal] export direction (CRM, apps)
 */

export function defineAdapter(def) {
  const required = ['id', 'name', 'category', 'status', 'capabilities'];
  for (const key of required) {
    if (def[key] == null) throw new Error(`Adapter is missing "${key}"`);
  }
  return Object.freeze({ ...def });
}

/** Consent gate: intelligence and CRM views only see records that allow it. */
export function allowedFor(purpose, participant) {
  const c = participant.consent ?? {};
  if (purpose === 'analytics') return c.analytics === true;
  if (purpose === 'marketing') return c.marketing === true;
  if (purpose === 'partners') return c.sharePartners === true;
  return false;
}

/**
 * Split a canonical participant into the transactional record (contact and
 * payment details) and the community-intelligence record (no direct
 * identifiers). Intelligence views read only the second.
 */
export function splitRecord(p) {
  const { email, amountPaid, registeredAt, externalId, ...rest } = p;
  return {
    transactional: { id: p.id, email, amountPaid, registeredAt, externalId, source: p.source },
    intelligence: { id: rest.id, source: rest.source, zip: rest.zip, team: rest.team, referralCode: rest.referralCode, consent: rest.consent },
  };
}
