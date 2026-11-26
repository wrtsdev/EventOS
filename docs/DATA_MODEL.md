# EventOS Canonical Data Model

Every entity carries `id`, `createdAt`, `updatedAt`. Organization-owned entities carry `organizationId`. Fields marked † are transactional (contact, payment, legal) and live only in the transactional store.

## Transactional data

| Entity | Key fields | Notes |
|---|---|---|
| **User** | id, email†, authProvider, roles[] | A login. May be an organizer, a participant, or both. |
| **Organization** | id, name, type, tier, eventsPerYear | Tenant boundary. |
| **Organizer** | userId, organizationId, role (owner, coordinator, volunteer lead, viewer) | |
| **Event** | id, organizationId, name, purpose, fourWs[], typeId, format, date, location, expected, cap, price, visibility, causeId, features[], programming[], phase, checklist{itemId: status} | `phase`: planning → live → complete. |
| **Registration** | id, eventId, participantId, source (adapter id), externalId†, amountPaid†, registeredAt, teamId, referralCode, waiverAcceptedAt† | Imported or native. |
| **Result** | id, eventId, participantId, source, chipSeconds, finished, division | From timing adapters. |
| **Team** | id, eventId, name, captainParticipantId | |
| **Volunteer** | id, eventId, participantId, role, shiftStart, shiftEnd, hours, status | |
| **Sponsor** | id, organizationId, name, tier, amount, contactEmail† | |
| **Integration** | id, organizationId, adapterId, status, lastSyncAt, credentialsRef† | Credentials live in a secrets store, never in the record. |
| **ConsentRecord** | id, participantId, purpose (analytics, marketing, sharePartners, leaderboards), granted, recordedAt, source | Append-only. Current consent = latest record per purpose. |

## Community identity (owned by WRTS)

| Entity | Key fields | Notes |
|---|---|---|
| **Participant** | id, firstName, lastInitial, email†, zip, homeOrganizationId? | Stable across events and organizations. |
| **Passport** | participantId, memberSince, streakMonths, membershipStatus | Derived view over Participation, Achievement, CauseAction, Volunteer. |
| **Participation** | id, eventId, participantId, role (participant, volunteer), miles, finished | One row per person per event; the backbone of "one community member over time". |
| **Referral** | id, eventId, referrerParticipantId?, referralGroup, referredParticipantId | Group-level when the referrer is a team or partner. |
| **Challenge** | id, organizationId, name, fourW, startsAt, endsAt, goal | |
| **Achievement** | id, participantId, badgeId, earnedAt, eventId? | |
| **FourWActivity** | id, eventId, participantId, fourW, activityId, at | A check-in to a Wellness / Wealth / Wisdom / Work activity. |
| **Cause** | id, name, beneficiaryOrganization, goalAmount | |
| **CauseAction** | id, causeId, eventId, participantId, type (donation, fundraise, signup, story, volunteer), amount? | |

## Community intelligence data

| Entity | Key fields | Notes |
|---|---|---|
| **SponsorActivation** | id, sponsorId, eventId, type (impression, click, promo, booth, recall), count, zip? | Aggregated counts. No participant contact data without `sharePartners` consent. |
| **Survey** | id, eventId, questions[], fourW? | Questions drafted from the event's 4Ws. |
| **SurveyResponse** | id, surveyId, participantId?, answers{}, satisfaction | Only stored when `analytics` consent is granted. |
| **CommunitySignal** | id, eventId, kind (theme, need, complaint), label, fourW?, mentions, sentiment | Derived from consented responses. Never a per-person attribute. |
| **ImpactMetric** | id, eventId, key (plv, clv, cvi, cvi.repeat…), value, computedAt, inputs{} | Snapshot so reports are reproducible. |

## Derived metrics

- **Participant Lifetime Value (PLV)** = (event contribution margin + merchandise margin + sponsor-attributed value) per participant × events per year + membership + attributable referral value, × expected relationship years. Economic only.
- **Community Lifetime Value** = PLV × unique community members.
- **Community Value Index (0–100)** = weighted score of repeat participation, cause engagement, referrals, volunteering, Passport activity, feedback, community involvement, sponsor engagement and 4W participation, each against a healthy-community target. Non-financial.

## Privacy rules enforced by the model

- Intelligence entities never store email, phone, full name, payment or waiver data.
- No field exists for health conditions, race or ethnicity, religion, political views, or other sensitive traits, and none are inferred. Screening counts are stored; results stay with the health partner.
- Host or referral groups (a church, a chapter) describe the group, never the participant.
- ZIP-level views suppress cells under 10 in exports.
- HubSpot receives only participants with `marketing` consent, and only the properties listed in `src/integrations/hubspot.js`.

## EPIC × 4Ws additions

The production schema is in `schema.sql`. New or changed entities:

| Entity | Purpose |
|---|---|
| Event (changed) | `primaryW`, `status` (active / canceled / archived), `phase` adds `eventday`, `seriesId`, `priorEventId`, goals |
| EventFourW | One primary W, any number of supporting Ws |
| OutcomeIndicator | Target, actual, unit, direction, evidence level, reach flag |
| EpicControl / EventControl | Control library (domain, severity, stage) and per-event status; missing status = not assessed |
| EvidenceRecord | Verified / reported / estimated evidence attached to controls, outcomes, partners, distributions |
| ScoreSnapshot | EPIC score history recorded at staged reviews |
| BudgetLine / FinancialTransaction | Planned vs actual, local and essential flags, minimums, payment status |
| Partner / EventPartner | Intended vs actual outcomes with evidence |
| SponsorshipPackage / Sponsorship / SponsorshipDeliverable | Inventory, commitments, fulfillment |
| BeneficiaryDistribution | Funds actually distributed, with evidence |
| WorkforceRole / WorkforceAssignment | Volunteer, paid and contracted work kept separate; minors flagged |
| Risk / EmergencyContact / Incident | Safety register; incidents are restricted records |
| Communication / Question / Document | Approval-gated messages, open questions, document register |
| AfterActionReview / CorrectiveAction | Post-event learning; actions carry into the next edition |
| Membership / AuditLog | Roles per organization; change history |
