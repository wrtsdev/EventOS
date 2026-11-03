# EventOS: EPIC × 4Ws Platform Expansion

EventOS is developed and distributed by We Run These Streetz LLC. *Move Forward Together.*

> The 4Ws define why an event matters. EPIC defines how the event should operate. EventOS makes both executable, measurable and repeatable.

This document covers the deliverables in the expansion directive. Every section says plainly what is operational in this repository and what is not.

---

## 1. Audit of the application before this expansion

| Area | What existed | Kept? |
|---|---|---|
| Stack | React 18 + Vite 5, plain JavaScript, no backend; state in browser storage | Kept. No dependencies added. |
| Event Builder | 5 steps: purpose, 4Ws (multi-select), experience, basics, features | Extended to 6 steps |
| Readiness | One weighted checklist (23 items), unassessed shown as "blocking" | Reworked into EPIC controls |
| Dashboards | Command Center, CauseOS, SponsorOS metrics, Community Intelligence, PLV / CLV / CVI, Impact Report, Passport | All kept; Command Center and Impact Report extended |
| Integrations | Adapter contract, mock RunSignup / Race Roster / timing, HubSpot mapping, consent gate | Kept; status labels corrected |
| Copilot | Local rules engine, 11 intents | Extended to 16 intents with guardrails |
| Roles, tenancy, plans | None | Added |
| Tests / CI | 13 node:test tests; GitHub Actions `npm ci` + `npm run check` | 39 tests; same CI |
| Brand | Text wordmark "WRTS EventOS", WRTS palette | Kept. **No approved logo file exists in the repo** (see backlog). |

Nothing that worked before was removed. The old "Volunteers + Ops" tab was replaced by Workforce, Safety and Event day, and the `ops` link still resolves to Workforce.

## 2. Gap analysis (summary)

| Directive module | Before | Now |
|---|---|---|
| A. Community Purpose Builder | 4Ws but no primary W, beneficiaries, partners, goals or success measures | Primary + supporting W, audience, partners, revenue goal, spending limit, measure targets; output is **Event Charter, Community Purpose Statement, initial EPIC readiness plan** |
| B. Economic Vitality | Simulated totals only | Line-item budget, planned vs actual, break-even, 3 scenarios, cash flow, local vendor spend tracked separately, failed payments, risk flags including essential-spend cuts |
| C. Public Safety & Continuity | Checklist items | Risk register + heatmap, emergency contacts, weather go / no-go, incident log (restricted), backup leads, staged reviews (planning, 30-day, 7-day, event day, closure), critical risks shown on their own |
| D. Information & Culture | Comms timeline | Messages by audience with **human approval**, coverage, open questions, documents, handoff notes, languages and accessibility |
| E. Civic Impact | Cause totals | Partners / beneficiaries / vendors / sponsors with intended vs actual outcomes and **verified / reported / estimated** evidence; funds-distributed record; Community Impact Statement |
| F. Workforce | Volunteer counts | Volunteer / paid / contracted kept separate; training, backups, hours, skills; Workforce Contribution & Capability Report |
| G. Participant Experience | Event page, Passport | Kept as-is (registration still through providers) |
| H. Sponsorship & Commerce | Visibility metrics | Packages and inventory, commitments (pledged / invoiced / paid), deliverables fulfillment, cost per engaged participant |
| I. EPIC Intelligence | None | Weighted scorecard (40/20/20/20, configurable), coverage shown, risk heatmap, 4W outcomes in native units, planned vs actual, trends across editions, corrective action tracker, score history |
| J. Post-event learning | None | After Action Review (draft from records), corrective actions, results snapshot, **create next edition** carrying actions in as controls |
| Platform | None | Organizations as tenants, 6 roles / 12 permissions, Community / Pro / Enterprise entitlements, state migration v1→v2, optional assistant with guardrails |

## 3. Functional requirements as implemented

- An event has exactly one primary W and zero or more supporting Ws. No event is asked for outcomes in all four.
- Every event gets controls in all four EPIC domains, filtered by type, size, format and features. A 120-person 1-mile walk gets 31 pre-event controls; a 350-person timed 5K with sponsors and a beneficiary gets 40.
- A control is either **not assessed**, **in progress**, **complete** or **blocked**. Not assessed earns zero and is listed. It is never counted as done.
- Some controls are **calculated from records** and cannot be ticked by hand: essential spending, break-even, cash flow, risk assessment, emergency contacts, backups, training, message coverage, open questions, partner outcomes, outcome targets, weather decision, incidents closed, vendors paid, funds distributed, outcome evidence, AAR, handoff.
- Critical items (critical controls not complete, high risks not reviewed, essential spending below minimum, open moderate or serious incidents) are listed separately everywhere, and the scorecard's clearance stays "Critical risks open" whatever the composite.
- Operational health (EPIC) and community outcomes (4Ws) are separate views with separate data; outcomes are never added into the EPIC score.
- Attendance is labeled **reach, not impact**. Outcomes without data stay blank.
- Nothing is sent, paid or approved by the assistant. Messages require a person with `comms.approve`.

## 4. EPIC × 4Ws architecture

```
4Ws (why)  ── primary + supporting W ──► outcome indicators (own units, evidence level)
   │                                                 │
   ▼                                                 ▼
EPIC × 4Ws matrix (16 cells: primary / supporting / contextual)
   │
EPIC controls (E, P, I, C) ── staged reviews ── calculated controls ◄── finance, safety, workforce, comms, civic records
   │
EPIC Operational Health score (weights per organization)   +   Critical risks (never averaged)
   │
Reports: Charter · Readiness · Financial Health · Safety & Resilience · Comms & Trust · Impact Statement · Workforce · Sponsorship · Impact Report · AAR · Next-Event Plan
```

Code map:

| Module | File |
|---|---|
| EPIC domains, matrix, scoring, heatmap, snapshots | `src/domain/epic.js` |
| Controls, statuses, staged reviews | `src/domain/controls.js` |
| Finance | `src/domain/finance.js` |
| Safety | `src/domain/safety.js` |
| Workforce | `src/domain/workforce.js` |
| Communications | `src/domain/comms.js` |
| Civic outcomes, partners, evidence | `src/domain/civic.js` |
| Sponsorship packages, fulfillment | `src/domain/sponsors.js` |
| AAR, next edition, snapshots | `src/domain/aar.js` |
| Roles, tenancy, entitlements | `src/domain/access.js` |
| State migration | `src/domain/migrate.js` |
| Assistant | `src/copilot/engine.js` |

## 5. Database schema and migrations

- **Production target:** `docs/schema.sql` (PostgreSQL with row-level security by `organization_id`; incidents get a stricter policy; communications cannot leave `draft` without an approver).
- **Prototype migration:** `migrateState()` upgrades saved browser state from v1 (single org) to v2 (orgs, session, primary W, status, snapshots). It is pure and tested, keeps all events and checklist progress, and refuses data written by a newer version instead of guessing.
- **Production migration path:** (1) create tables; (2) backfill `event_four_ws.is_primary` from the first selected W; (3) map old checklist statuses unchanged (`done` / `attention` / `blocking`; missing = not assessed); (4) create budget lines from the default budget generator for events that have none; (5) enable RLS last, after verifying every row has `organization_id`.

## 6. User journeys and navigation

Lifecycle bar on every event: **Discover → Design → Finance → Prepare → Promote → Execute → Measure → Improve**, with the current stage worked out from the event's state.

Organizer workspace:

| Area | Where |
|---|---|
| My Events | Home, filtered Upcoming / Active / Completed / Canceled / Archived |
| Event Builder | Sidebar |
| Operations | Event → Operations: Safety, Workforce, Event day |
| Commerce | Event → Commerce: Finance, Sponsors |
| Community | Event → Community: Partners and outcomes, Cause, Communications |
| EPIC Intelligence | Event → EPIC Intelligence: Scorecard, Community Intelligence, Value |
| Reports | Event → Reports: Impact Report, After Action Review, Event page |

Validation journey (also an automated test): create a 5K → Wellness primary, Wealth and Work supporting → charter and EPIC plan → budget (EMS cut is flagged as critical and blocks budget approval) → assign sponsors, vendors, volunteers, safety contacts → open registration → readiness flags open safety items → start event day (weather decision, incident log, ops log) → close event day → enter actuals → scorecard + 4W outcomes → After Action Review → create next edition.

## 7. EPIC scoring specification

- Control weight by severity: critical 3, standard 2, nice-to-have 1.
- Credit by status: complete 1.0, in progress 0.4, blocked 0, not assessed 0.
- **Domain score** = Σ(weight × credit) ÷ Σ(weight) over the domain's controls for the current phase × 100.
- **Coverage** = assessed weight ÷ total weight (shown as the dashed line on each bar).
- **Composite** = Σ(domain score × domain weight) ÷ Σ(weights of scored domains). Default weights E 40, P 20, I 20, C 20; organization owners on Enterprise can change them; they must total 100; the change is recorded with name and date.
- **Phase scope**: planning and registration score pre-event controls; event day adds event-day controls; complete adds closure controls.
- **Clearance** (shown above the score): *Critical risks open* if any critical item is open; else *Not enough assessed* if coverage < 60%; else *No critical risks open*; *Event canceled* freezes scoring.
- **Bands**: 85+ Strong, 70–84 Solid, 50–69 Developing, under 50 At risk.
- **Score history**: "Record this review" stores a snapshot per stage (composite, domains, coverage, critical count, readiness).
- **4W outcomes** are never scored into one number. Each indicator has target, actual, unit, direction, evidence level and a result (met / below / not measured).

## 8. Integration plan and status

| Priority | Integration | Status in this repository |
|---|---|---|
| 1 | Existing EventOS functionality | **Operational** (all prior screens kept, tests pass) |
| 2 | HubSpot CRM | **Demo only.** Property mapping and consent-filtered sync preview work; nothing is sent. Needs a HubSpot private app and server endpoint. |
| 3 | Payment and registration (RunSignup, Race Roster, others) | **Demo adapters.** Vendor-shaped sample data is normalized for real; no live API calls. Labeled "Demo adapter · sample data". |
| 4 | WRTS website and commerce | Not started |
| 5 | Email / notification providers | Not started (messages have approval workflow; delivery is not wired) |
| 6 | Race timing / activity tracking | Demo timing adapter (CSV shape); fitness apps planned |
| 7 | Reporting and export | Copy-to-clipboard for Cause Summary and Impact Statement; CSV/PDF export not started |

## 9. Security, accessibility and data isolation

Automated (in `npm run check`, run by CI):

- `tests/access.test.js`: tenant isolation (events, snapshots), cross-tenant read looks identical to "not found", cross-tenant and unauthorized writes refused, organization cannot be reassigned, least-privilege roles, incident redaction by role with extra protection for minors, plan entitlements, v1→v2 migration, assistant scope and labeling.
- `tests/epic.test.js`: matrix completeness, control coverage, weight validation, unassessed earns zero, critical items never hidden by composite, essential-spend flag, staged reviews, finance math, local spend separation, flexed overrun, workforce separation, outcome units and blanks.
- `tests/validation.test.js`: the 12-step validation scenario plus exceptions: missing metrics, canceled event, weather change, payment failures, incomplete risk assessment. (Restricted permissions are covered in access tests.)

Manual checks done for this release: every event tab rendered at 1366px and 390px with no console errors and no horizontal page overflow; interactive flows scripted in a headless browser (event day, weather delay → drafted message → approval, incident logging, AAR → next edition, role switch to Volunteer lead → finance restricted, Community plan → scorecard gated, switch to second tenant → only its event visible, builder → charter).

Accessibility: semantic buttons and form labels throughout, visible focus, color never the only signal (every status pill has text), reduced-motion respected, tables scroll inside their own containers. **Not yet done:** an automated axe audit and a screen-reader pass (see backlog).

**Important limit:** in the prototype, isolation and permissions are enforced by the client-side repository layer and reducer. That is correct for demonstrating behavior and is tested, but it is **not a security boundary**. Production must enforce the same rules server-side (`docs/schema.sql` row-level security).

## 10. Deployment and rollback

Deploy (static hosting):

```bash
npm ci
npm run check          # tests + production build
# upload dist/ to any static host (Hostinger, Netlify, S3 + CloudFront, GitHub Pages)
```

CI uploads `dist/` as the `eventos-dist` artifact on every run.

Rollback:

1. **Code:** revert the merge commit on `main` (`git revert -m 1 <merge sha>`) or redeploy the previous `eventos-dist` artifact from the last green CI run.
2. **Saved browser state:** v2 is written under a new key (`wrts-eventos:v2`); the v1 key is never deleted. Rolling back to the pre-expansion build reads v1 data exactly as before. Rolling forward again re-migrates from v1 if v2 is absent.
3. **Production database (future):** each migration ships with a down script; RLS is enabled last and disabled first.

## 11. Prioritized backlog

| # | Item | Why |
|---|---|---|
| 1 | Backend API + PostgreSQL with RLS (`docs/schema.sql`), real auth (SSO / magic link) | Data isolation must be server-enforced before any real organization uses it |
| 2 | Add the approved WRTS logo and brand files to the repo | Directive requires the approved logo; only a text wordmark exists |
| 3 | Live registration adapter (RunSignup first) with webhooks | Real registrations, payments and failures |
| 4 | HubSpot private-app sync (contacts, lists, workflow enrollment) | Directive integration priority 2 |
| 5 | Email delivery for approved messages (via HubSpot or a transactional provider) | Approval workflow exists; delivery does not |
| 6 | Evidence file uploads (receipts, sign-in sheets, partner letters) | "Verified" should link to the document |
| 7 | Audit log UI and export | Directive: audit logging |
| 8 | Accessibility audit (axe + screen reader) and fixes | WCAG alignment |
| 9 | CSV / PDF report exports | Partners and boards ask for files |
| 10 | Organization dashboard across events (Enterprise) | Consolidated impact reporting |
| 11 | User administration (invite, assign roles) | Roles exist; managing them does not |
| 12 | Hosted AI provider behind the assistant interface, with the same guardrails | Optional; app works without it |
| 13 | Rights and attribution review for the EPIC framework | Directive: confirm before commercialization |

## 12. Commercialization readiness

| Area | Status |
|---|---|
| Product story and differentiation | Strong. Charter → EPIC readiness → outcomes with evidence → AAR → next edition is distinctive and demonstrable end to end. |
| Tier packaging | Entitlements implemented and previewable (Community / Pro / Enterprise). Prices are placeholders by design. |
| Multi-tenant SaaS | **Not ready.** Model and tests exist; server enforcement does not. |
| Integrations | **Not ready.** Demo adapters only. |
| Brand | Partially ready: palette and product identity throughout; approved logo missing. |
| Legal | EPIC presented as an incorporated methodology with no trademark, certification or accreditation claims; safety guidance labeled planning support only. Rights review still required. No SIGMA affiliation required anywhere in the product. |
| Data protection | Consent model, minimum-necessary intelligence store, incident and minor protections designed; needs server implementation, retention policy and privacy policy text. |

**Bottom line:** ready for stakeholder demos, pilot design and sales conversations. Not ready to hold real participant, payment or incident data until backlog items 1–5 are done.

## 13. What is operational vs. incomplete

Operational in the prototype (working, tested, synthetic data):
EPIC × 4Ws model and matrix · primary/supporting Ws · Event Charter and Purpose Statement · staged EPIC controls with calculated controls · scorecard with configurable weights, coverage and separate critical risks · heatmap · finance (budget, planned vs actual, break-even, scenarios, cash flow, local spend, failed payments, essential-cut flag, approval) · safety (risk register, contacts, weather decisions, restricted incidents) · workforce (three work types, training, backups, report) · communications (approval workflow, coverage, questions, documents list, handoff, languages) · partners and outcomes with evidence levels · sponsorship packages and fulfillment · event-day phase · cancellation · After Action Review · next edition with carried actions · trends across editions · roles, tenancy and plan gating · state migration · assistant with labeling, guardrails and off switch.

Incomplete or demo-only:
No server, database or authentication · no live integrations (registration, payments, HubSpot, email, timing) · document and evidence files are not stored · no exports · no audit-log UI · no organization-wide dashboard · no user administration · approved logo missing · accessibility not formally audited · all registrations, payments, engagement and prior-edition results are synthetic.
