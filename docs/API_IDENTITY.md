# Identity and administration API

Proprietary and confidential. © We Run These Streetz LLC.

Conventions:
* Everything is JSON under `/api`, using same-origin cookies.
* Every write needs the header `X-Requested-With: eventos` (CSRF).
* Errors look like `{ "error": "Plain-language message" }`, sometimes with a `code`.

## Public and applicant (`/api/auth`)

| Method and path | Purpose | Notes |
| --- | --- | --- |
| `POST /request` | Request an account | Body: `firstName`, `lastName`, `email`, `password` (12+), `organizationName?`, `organizationType`, `requestedRole` (`org_admin` `coordinator` `partner` `employer` `educator` `other`), `intendedUse`, `primaryPillar` (`wealth` `wellness` `wisdom` `work`), `phone?`, `website?`, `acceptTerms: true`. Always `202` with the same message. Limit: 10 per hour per IP. |
| `POST /verify` | Confirm the email (`token` from the email) | Returns `status`: `pending_approval`, or `master` for the one-time master bootstrap. Never activates an ordinary account. |
| `GET /request-info/:token` | The administrator's question | |
| `POST /request-info` | Answer it (`token`, `response`) | Moves the request back to Pending approval and notifies the master. |
| `POST /login` | Email and password | `403` with `status` for accounts that can't sign in; `{ mfaRequired, ticket }` when two-step is on. |
| `POST /mfa/verify` | Second step (`ticket`, `code`) | `code` is an authenticator code or a recovery code. |
| `POST /mfa/setup` | Start two-step setup | Returns `secret`, `otpauthUrl` and `qrSvg`. |
| `POST /mfa/enable` | Confirm setup (`code`) | Returns ten `recoveryCodes`, shown once. |
| `POST /mfa/recovery-codes` | New recovery codes (`code`) | |
| `POST /mfa/disable` | Turn two-step off (`code`) | Refused for administrators. |
| `POST /logout`, `GET /me`, `POST /switch-org` | Session | `me.user` includes `status`, `isMaster`, `isPlatformAdmin`, `mfaEnabled` and `mfaVerified`. |
| `POST /password/forgot`, `POST /password/reset` | Password reset | Reset links are sent only to accounts that can sign in. A reset ends every session. |
| `GET /invite/:token`, `POST /invite/accept` | Organization invitations | New accounts: `202 { pending: true }` until approved, unless a WRTS administrator sent the invitation. |
| `POST /signup` | Removed | `410 Gone` |

## Admin center (`/api/platform`)

Every route needs an active WRTS administrator with two-step verification on this session. Anyone else gets `404`; administrators without two-step get `403` with `code: mfa_enrollment_required` or `mfa_required`. Routes marked **M** are master-administrator only.

| Method and path | Purpose |
| --- | --- |
| `GET /summary` | Live counts: requests, accounts by state, organizations, events, registrations, email queue, failed sign-ins (24 h) |
| `GET /requests?status=open\|approved\|denied\|unverified\|all` | Request queue |
| `GET /requests/:id` | Request, account, memberships and history |
| `POST /requests/:id/approve` **M** | `{ organization: { mode: 'new', name, tier? } \| { mode: 'existing', id }, role, note? }`. Existing-account reviews need no body. |
| `POST /requests/:id/request-info` **M** | `{ note }` (emailed to the applicant with a reply link) |
| `POST /requests/:id/deny` **M** | `{ note?, notify? }` |
| `GET /accounts?q=&status=` | Accounts |
| `POST /accounts/:id/status` | `{ status: 'suspended'\|'deactivated'\|'archived'\|'active', reason? }`. Never the master; other administrators only by the master. |
| `POST /accounts/:id/sessions/revoke` | Sign out everywhere |
| `POST /accounts/:id/platform-admin` **M** | `{ enabled }` |
| `GET /orgs`, `POST /orgs`, `GET /orgs/:id`, `PATCH /orgs/:id`, `POST /orgs/:id/owner-invite` | Organizations, plans, owner set-up links |
| `GET /emails?status=`, `POST /emails/:id/retry` | Email delivery queue |
| `GET /audit?prefix=` | Platform activity (read-only) |
| `GET /data-inventory` **M** | Read-only production data inventory with classifications |
