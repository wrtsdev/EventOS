# Production data cleanup, backup and rollback

Proprietary and confidential. © We Run These Streetz LLC.

## What this release changes in the production database

Migration `server/migrations/002_identity_governance.sql` runs automatically on the first start of this release. It:

* adds account-state, two-step and master columns to `users`, and the `account_requests` and `email_outbox` tables;
* sets **every existing account** to *Pending approval*, removes any existing WRTS-administrator flags, and ends every session. Nobody keeps access until the master administrator reviews them; the master account is then designated as described in `docs/ADMIN_GUIDE.md`;
* creates one review request per existing account (source "Existing account"), shown in **Admin center → Requests**.

It **deletes no organizations, events, registrations or account data.**

## Before deploying: backup (required)

1. In hPanel go to **Websites → eventos.werunthesestreetz.com → Databases → Backups**, or **phpMyAdmin → Export**. Back up database `u472918864_eventos`. Keep the file outside Hostinger as well.
2. Note the current production commit: `epic-4ws-expansion` before the merge. Hostinger's Node.js deployment history also lists it.

## Rollback

* **Application only (the database stays migrated):** the previous release doesn't know about account states. Don't roll back the application alone; restore the database too.
* **Full rollback:**
  1. In GitHub, revert the merge commit on `epic-4ws-expansion`. Hostinger redeploys the previous version automatically.
  2. Restore the database backup from before the deploy through hPanel or phpMyAdmin import. Anything created after the deploy (new requests, emails) is lost, so export first if needed.
* **Restore test:** before the production deploy, restore the backup into a scratch database (for example a temporary database in hPanel) and confirm the tables and row counts match. Record the date and result in the release notes. *Status: not yet done, because it needs hPanel access.*

## Cleanup of synthetic records (needs approval)

1. In **Admin center → Data inventory**, build the inventory and download the JSON report.
2. Each account, organization and event is classified:
   * **retain: master administrator**;
   * **likely synthetic**, with the reason, such as a test-style email domain, a name matching the built-in demo data, or a test-style name;
   * **unclassified: review**, when authenticity can't be established automatically.
3. The master administrator marks which records to remove, quarantine or keep. **Nothing is deleted without that written approval.** Unclassified records are never deleted automatically.
4. Approved removals are carried out by a reviewed script against a fresh backup, and recorded in the activity log. That script is part of the next phase, because it needs the approved list.

## Demo data in production

* The browser-only sample-data demo is **off in production** (`DEMO_ENABLED` unset). Signed-in production accounts don't offer the demo and don't show the sample Passport member. Scorecards in production accounts are computed from the event's own records; any projection is labeled as one (see the readiness report for the remaining review of estimates).
* The demo is still available on non-production servers and in the single-file prototype build (`npm run build:artifact`).
* Synthetic test fixtures exist only in the automated tests, which use a separate, isolated test database.
