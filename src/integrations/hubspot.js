// HubSpot is the external CRM / lifecycle layer. EventOS does not rebuild CRM;
// it passes a small, consented set of properties so HubSpot workflows can act.

import { allowedFor } from './adapter.js';

export const HUBSPOT_PROPERTIES = [
  { property: 'email', from: 'Participant email', note: 'Transactional store only' },
  { property: 'firstname', from: 'Participant first name' },
  { property: 'wrts_event_history', from: 'Passport event list', note: 'Semicolon-separated event names' },
  { property: 'wrts_cause_interest', from: 'Causes supported' },
  { property: 'wrts_4w_interest', from: '4W interests the participant selected' },
  { property: 'wrts_organization', from: 'Hosting organization' },
  { property: 'wrts_referral_source', from: 'Referral group or code' },
  { property: 'wrts_membership_status', from: 'Passport membership status' },
  { property: 'wrts_engagement_level', from: 'Engagement level (New / Active / Champion)' },
  { property: 'wrts_next_best_action', from: 'EventOS recommendation' },
];

export function engagementLevel(p) {
  const score = (p.priorEvents ?? 0) + (p.referredBy ? 1 : 0) + (p.causeAction ? 1 : 0) + (p.volunteer ? 2 : 0);
  if (score >= 4) return 'Champion';
  if (score >= 2) return 'Active';
  return 'New';
}

export function nextBestAction(p) {
  if (p.walkingClubInterest) return 'Invite to walking club';
  if (p.causeAction && !p.donated) return 'Cause supporter nurture';
  if (p.returning) return 'Early registration offer';
  return 'Welcome series';
}

/**
 * Map a canonical participant to a HubSpot contact payload.
 * Returns null when the participant has not consented to marketing:
 * those records never leave EventOS.
 */
export function toHubSpotContact(p, event) {
  if (!allowedFor('marketing', p)) return null;
  return {
    properties: {
      firstname: p.firstName,
      wrts_event_history: [event.name].join(';'),
      wrts_cause_interest: p.causeAction && event.cause ? event.cause : '',
      wrts_4w_interest: (p.fourWInterest ?? []).join(';'),
      wrts_organization: event.organization ?? '',
      wrts_referral_source: p.referredBy ?? 'Direct',
      wrts_membership_status: p.passportActive ? 'Passport active' : 'Registered',
      wrts_engagement_level: engagementLevel(p),
      wrts_next_best_action: nextBestAction(p),
    },
  };
}

export function syncPreview(participants, event) {
  const payloads = participants.map((p) => toHubSpotContact(p, event));
  const ready = payloads.filter(Boolean);
  return {
    total: participants.length,
    syncable: ready.length,
    withheld: participants.length - ready.length,
    sample: ready.slice(0, 3),
    byAction: ready.reduce((acc, x) => {
      const k = x.properties.wrts_next_best_action;
      acc[k] = (acc[k] ?? 0) + 1;
      return acc;
    }, {}),
  };
}
