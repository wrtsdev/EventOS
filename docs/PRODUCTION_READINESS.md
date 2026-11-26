# EventOS 1.0 production readiness report

Proprietary and confidential. © We Run These Streetz LLC.
Branch `production-readiness`, against production branch `epic-4ws-expansion`. Report date: 2026-11-25.

## Summary

This development cycle covers **Phase A (foundation)** and **Phase B (identity and security)** of the directive, plus the **account-management core of Phase C**. It is not merged and not deployed.

* **Accounts are approved, not self-created.** Applicants request access and confirm their email. The master administrator then approves, denies or asks a question.
* **The master administrator is protected.** The flag is set once on the server, and nobody can change that account through the app.
* **Administrators must use two-step verification.**
* **Existing production accounts are disabled until reviewed.** Nothing is deleted.
* **Account email is queued, tracked and retried.**
* **The demo is off in production**, and real accounts no longer show the sample Passport member.

The automated suite has **62 tests (all passing)** against a real MariaDB database, including the existing tenant-isolation, payment and registration tests. A browser walkthrough of the whole flow (request, confirm, master, two-step, approve, applicant sign-in on a phone) passed with no page errors.

**EventOS is not yet ready to be called a production 1.0.** The 4Ws modules, Community Intelligence, the brand palette, staging and the restore test remain (see the continuation plan).

## Phase A findings (current state)

* Repository: `wrtsdev/EventOS` (the directive's `wrtsdev/WRTS-webapp` paths are historical). Production deploys automatically from `epic-4ws-expansion` to Hostinger (Node 22, Express, MariaDB). `main` still holds the old prototype.
* **Stack:**
  * React 18 and Vite 6 single-page app;
  * Express 4 API;
  * MySQL/MariaDB with SQL migrations;
  * Capacitor iOS shell.
* **Already production-grade before this cycle:**
  * server-side sessions;
  * tenant isolation by session organization;
  * CSRF;
  * optimistic concurrency;
  * Stripe Checkout with signed webhooks;
  * encrypted integration keys;
  * the audit log;
  * CI with a MySQL service.
* **Technical debt:**
  * Event details live in one JSON column (`events.data`). The Wealth, Wisdom and Work modules (sessions, employers, opportunities, certificates) need normalized tables with foreign keys.
  * The browser-side demo store and the sample data share code with the live app.
  * Rate limits are in-memory, per process.
  * There is no staging environment.
* **Database:** MySQL/MariaDB (Hostinger-managed). The directive prefers PostgreSQL "or an equivalent". InnoDB gives foreign keys, transactions and row-level scoping in queries. Migrating to PostgreSQL would mean new hosting; it isn't recommended now.

## Feature status register

| Feature | Status |
| --- | --- |
| Account states (9) enforced server-side on every request | Implemented and tested |
| Account request form, email confirmation, duplicate checks with no account disclosure | Implemented and tested |
| Approval, denial, request for information, applicant reply | Implemented and tested |
| Admin notification emails with a review link that doesn't approve | Implemented and tested (delivery awaiting SMTP settings) |
| Master administrator bootstrap and protection | Implemented and tested |
| Only the master approves; administrators can't manage other administrators or the master | Implemented and tested |
| Two-step verification (TOTP, recovery codes, replay protection), required for administrators | Implemented and tested |
| Existing accounts disabled pending review; review queue; restore keeps their organizations | Implemented and tested |
| Organization invitations can't bypass approval | Implemented and tested |
| Suspension, reactivation, deactivation, archiving; sign-out everywhere | Implemented and tested |
| Email queue: delivery tracking, retries with backoff, duplicate prevention, manual retry | Implemented and tested |
| Admin center: Overview, Requests, Accounts, Organizations, Email delivery, Activity, Data inventory | Implemented; browser walkthrough passed; no automated end-to-end tests yet |
| Production data inventory (read-only, classified) | Implemented and tested |
| Approved cleanup of synthetic production records | Awaiting the master administrator's approval of the inventory |
| Demo off in production; Passport and Privacy empty states in real accounts | Implemented, not covered by automated tests |
| Proprietary notices, license inventory, environment template | Implemented |
| Terms of use and privacy notice documents | Blocked: needs WRTS-approved legal text (acceptance is recorded as version `pending-legal-review-2026-11`) |
| Source code repository privacy (directive §19) | Blocked: the repository is public; only the owner can make it private |
| Staging environment | Planned (needs approval to create a staging site and database in Hostinger) |
| Database restore test and rollback rehearsal | Planned (needs hPanel access) |
| Executive Command Center filters (organization, area, pillar, dates) | Planned (Phase C) |
| Session list per account, bulk actions | Planned (Phase C) |
| System settings, feature flags, announcements | Planned (Phase C) |
| WRTS brand palette and design tokens (#0046FF and the rest) | Planned (Phase D); the current interface uses a navy palette |
| Dynamic event engine; Wealth, Wisdom and Work modules; certificates | Planned (Phase E) |
| Passport on real records; Community Intelligence metric dictionary; CauseOS | Planned (Phase F) |
| Integration health, sync history, HubSpot field ownership and retries | Planned (Phase G); Stripe and HubSpot connections exist from earlier work |

## Release acceptance (directive §21)

| # | Check | Result |
| --- | --- | --- |
| 1 | Master administrator access retained | Pass (tests: bootstrap, restart, takeover attempt) |
| 2 | No unauthorized existing account can access production | Pass (test recreates the old schema with an account and session, runs the migration, sign-in refused) |
| 3 | No dummy data in production | Partial: demo off and sample Passport removed from real accounts; inventory ready; production cleanup awaits approval |
| 4 | Account requests generate admin notifications | Pass (queued with review link); real delivery needs SMTP settings |
| 5 | Unapproved accounts can't use protected routes or APIs | Pass |
| 6 | Only the master can approve | Pass |
| 7 | Suspended accounts lose access | Pass (immediately, including open sessions) |
| 8 | Organization data isolated | Pass (existing tests) |
| 9 | All four pillar event types can be created | Partial: events can be tagged with any of the 4Ws; dedicated pillar modules not built |
| 10 | Wisdom: sessions, learning outcomes, completion | Not started (Phase E) |
| 11 | Work: employers, opportunities, referrals | Not started (Phase E) |
| 12 | Multi-pillar events | Partial (multiple 4Ws per event; no module logic) |
| 13 | Event records persist | Pass (database; existing tests) |
| 14 | Passport records associated | Not started (Phase F) |
| 15 | Community Intelligence on legitimate records | Not started (Phase F) |
| 16 | Email failures recoverable | Pass |
| 17 | Integration failures clearly reported | Not started (Phase G) |
| 18 | HubSpot consent preserved | Not validated: only opted-in participants sync today |
| 19 | WRTS brand standards | Not started (Phase D) |
| 20 | Mobile layouts | Pass for the new screens (walkthrough at iPhone size) |
| 21 | Administrative activity auditable | Pass |
| 22 | Database restore and rollback tested | Not done (procedure in `docs/DATA_CLEANUP.md`) |
| 23 | Unauthorized API access rejected | Pass (404 for non-administrators, 403 without two-step) |
| 24 | Accessibility | Partial: sign-in scored 100 in Lighthouse; the new admin screens use labeled controls but haven't been audited |
| 25 | Production build and CI | Pass locally; CI runs on the pull request |

## Before merging (owner actions)

1. **Make the GitHub repository private** (Settings → General → Danger zone → Change visibility). Then confirm Hostinger auto-deploy still works; the Hostinger GitHub app has access to private repositories.
2. In hPanel → Node.js → Environment variables, add `MASTER_ADMIN_EMAIL=robert.rivers@werunthesestreetz.com` and the five SMTP settings (`hello@eventos.werunthesestreetz.com`), keeping the existing variables.
3. **Back up the production database** (`docs/DATA_CLEANUP.md`).
4. Review and merge the pull request into `epic-4ws-expansion`. Hostinger deploys it and the migration runs.
5. Sign in, or request access with the master email, then set up two-step verification (`docs/ADMIN_GUIDE.md`).
6. Review existing accounts in **Requests**, and run the **Data inventory**.

## Risks

* **Merging disables every existing account except the master.** That's intended by the directive, but warn anyone currently using EventOS.
* **The master account depends on its mailbox and authenticator.** Keep the recovery codes offline. The database-level recovery procedure needs hPanel access.
* **Without SMTP settings, applicants can't confirm their email,** so no new accounts can be created. Set it before merging.
* **Rate limits reset when the app restarts** and are per process.
* **Public repository:** proprietary methodology and code are currently publicly readable.

## Continuation plan (in the directive's order)

**Phase C — rest of the administration center**

* Command center filters (organization, pillar, date range, event type) and event-status counts once the event lifecycle exists.
* Per-account session list with device and IP; bulk suspend and approve with confirmation.
* System settings stored in the database: feature flags, announcements, maintenance mode, publishing policy. Version information.
* An approved-cleanup tool: takes the master's approved inventory list, quarantines or deletes against a fresh backup, and records each action in the activity log.

**Phase D — brand**

* Central design tokens with only the directive palette (#0046FF, #0B0B0C, #20242A, #FFFFFF, #F3F5F7, #E8F1FF).
* Remove per-pillar colors.
* Re-check contrast for WCAG 2.2 AA.
* Apply the tokens to email templates and certificates.

**Phase E — 4Ws modules**

* Normalized tables for:
  * the event lifecycle (Draft → Internal Review → Approved → Published → Active → Completed → Evaluated → Archived, plus cancelled and postponed);
  * sessions, tracks and speakers;
  * employers, opportunities, referrals and consent to share;
  * certificates with unique verifiable IDs.
* An event engine that enables only the relevant modules.
* Work and Wisdom first.

**Phase F — Community Intelligence**

* Activity records with the directive's fields: pillar, owner, next action, evidence and verification status.
* A metric dictionary with formula versions; "Insufficient data" until the minimum is met.
* Passport on real participant records.
* CauseOS, separating pledged from confirmed contributions.

**Phase G — integrations and validation**

* Integration health and sync history.
* HubSpot record mapping, explicit field ownership, duplicate detection and retries.
* Staging environment.
* Restore test.
* An accessibility audit of every screen.
* End-to-end tests in CI.
