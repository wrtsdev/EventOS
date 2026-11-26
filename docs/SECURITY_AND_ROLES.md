# EventOS security, identity and roles

Proprietary and confidential. © We Run These Streetz LLC.

This describes what is implemented and tested in the `production-readiness` branch. EventOS does not claim any regulatory certification or compliance (SOC 2, HIPAA, FERPA or other). It is a nonclinical platform.

## Account states

| State | Meaning | Can sign in |
| --- | --- | --- |
| Unverified | Requested an account; email not yet confirmed | No (a new confirmation link is sent) |
| Pending approval | Email confirmed; waiting for the master administrator | No |
| Additional information required | The master administrator asked the applicant a question | No |
| Approved | Approved and assigned an organization and role | Yes; the first sign-in makes it Active |
| Active | Normal access | Yes |
| Suspended | Access paused by an administrator | No; existing sessions end immediately |
| Denied | Request refused | No |
| Deactivated | Access ended by an administrator | No |
| Archived | Kept for records only | No |

The server enforces this on every request: a session belonging to an account that isn't Active is deleted on its next use (`server/auth.js`, `sessionMiddleware`). A person learns their account state only after entering the correct password.

## Master administrator

* One flag in the database (`users.is_master`). It is set once, server-side, by `server/governance.js`:
  * at startup, if no master exists and `MASTER_ADMIN_EMAIL` names an existing account; or
  * when the account with that email confirms its address through the access request, if no master exists yet.
* Once a master exists, the setting is ignored, so changing it can't hand over the platform (tested).
* The master account can't be suspended, deactivated, signed out, demoted or changed through the API by anyone, including other administrators and the master (tested). Changes go through the owner recovery procedure below.
* No privilege comes from client-side code, request bodies, organization invitations, account approval or account metadata. The browser only displays what `/api/auth/me` reports.

## Administrators and two-step verification

| Capability | Master | WRTS administrator | Organization roles |
| --- | --- | --- | --- |
| Open the admin center | Yes, with two-step verification | Yes, with two-step verification | No (404) |
| Approve, deny or question account requests | Yes | No | No |
| Grant or remove WRTS administrator rights | Yes | No | No |
| Suspend, reactivate, deactivate or archive ordinary accounts; end their sessions | Yes | Yes | No |
| Manage other administrators' accounts | Yes | No | No |
| Change the master account | No (recovery procedure only) | No | No |
| Create organizations and owner set-up links; change plans | Yes | Yes | No |
| Email delivery queue and retries; platform activity | Yes | Yes | No |
| Production data inventory | Yes | No | No |
| Turn off two-step verification | No (required) | No (required) | Optional for themselves |

* The admin center API refuses any session that hasn't passed two-step verification (`mfa_enrollment_required`, `mfa_required`).
* Two-step verification is TOTP (RFC 6238, any authenticator app). Secrets are encrypted at rest with AES-256-GCM keyed from `APP_SECRET`. Codes can't be replayed. Ten single-use recovery codes are shown once; only their SHA-256 hashes are stored.

## Organization roles

Organization roles are unchanged and are scoped to one organization. Tenant isolation is enforced on the server by taking `organization_id` from the session, never from input (`server/repo.js`; tested).

| Permission | Owner | Coordinator | Finance | Safety | Volunteer lead | Partner |
| --- | --- | --- | --- | --- | --- | --- |
| Create and edit events | ✓ | ✓ | | | | |
| See budgets | ✓ | ✓ | ✓ | | | |
| Edit budgets | ✓ | ✓ | ✓ | | | |
| Edit risks and safety | ✓ | ✓ | | ✓ | | |
| See and edit incidents | ✓ | ✓ | | ✓ | | |
| Approve messages | ✓ | ✓ | | | | |
| Manage volunteers and staff | ✓ | ✓ | | | ✓ | |
| Manage partners and sponsors | ✓ | ✓ | | | | |
| See reports | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| See participant contact details | ✓ | ✓ | | | | |
| Change EPIC weights | ✓ | | | | | |
| Manage users, plan and settings | ✓ | | | | | |

Invitations: an owner can invite someone to their organization. If that person has no EventOS account, the account is created **pending approval** and joins only when the master administrator approves it. An existing active account joins immediately. Invitations sent by a WRTS administrator (organization owner set-up links) count as approved.

## Sign-in protections

* Passwords: bcrypt (cost 12), at least 12 characters. Accounts lock for 15 minutes after 8 wrong passwords.
* Sessions: random 256-bit tokens; only their SHA-256 hash is stored. HttpOnly, SameSite=Lax and Secure (over HTTPS) cookies; 14 days by default. Password reset ends every session.
* CSRF: same-origin check plus a custom header on every write.
* Rate limits per IP address: 30 sign-in, verification and reset attempts per 15 minutes; 10 account requests per hour.
* Account requests and password resets always answer the same way, so they can't be used to discover who has an account.
* Security headers: Content-Security-Policy, HSTS, X-Content-Type-Options, X-Frame-Options, Referrer-Policy and Permissions-Policy.
* Secrets are only read from environment variables (see `.env.example`). Integration keys are encrypted at rest.

## Audit records

Recorded with actor, action, affected record, time, IP address and context:

* **Accounts:** requests, duplicate requests, email confirmation, approval, denial, questions and answers, activation, suspension, reactivation, deactivation and archiving.
* **Sign-in and security:** sign-ins, failed sign-ins, blocked sign-ins, two-step setup and failures, recovery-code use, password resets, and sessions ended.
* **Administration:** granting and removing administrator rights, master designation, organization creation, plan changes, email retries, and data inventory runs.
* **Organizations:** team and event changes.

Nothing in the API edits or deletes audit records.

## Owner recovery procedure

Use this only when the master administrator can't sign in.

1. **Lost password:** use "Forgot password?" on the sign-in screen. This needs access to the master mailbox.
2. **Lost authenticator app:** sign in with one of the saved recovery codes, then set up two-step verification again from the admin center (regenerate recovery codes after).
3. **Lost the authenticator app and every recovery code:** this needs someone with database access through Hostinger hPanel. In phpMyAdmin, against `u472918864_eventos`:
   1. Take a database backup first (hPanel → Databases → Backups).
   2. Confirm the person asking is the account owner through a channel other than email.
   3. Run:
      ```sql
      UPDATE users SET mfa_secret = NULL, mfa_enabled_at = NULL, mfa_last_counter = NULL, mfa_recovery_codes = NULL WHERE is_master = 1;
      DELETE FROM sessions WHERE user_id = (SELECT id FROM (SELECT id FROM users WHERE is_master = 1) m);
      ```
   4. The owner signs in with their password and sets up two-step verification again.
   5. Note the recovery in the WRTS records (who, when and why).
4. **Transferring the master role:** done in the database only. Set `is_master = 0` on the old account and `is_master = 1, is_platform_admin = 1, status = 'active'` on the new one, in one transaction, after a backup. This is deliberately not available in the app.

## Known limits (see the production readiness report)

* Rate limits are per server process. With several Hostinger processes, each has its own counter.
* Terms of use and privacy notice: account requests record acceptance of version `pending-legal-review-2026-11` until WRTS publishes approved legal documents.
* Integration health monitoring and failure tracking are not built yet.
