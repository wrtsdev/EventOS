# Master administrator guide

For robert.rivers@werunthesestreetz.com. Proprietary and confidential. © We Run These Streetz LLC.

## First-time setup

1. In hPanel, set `MASTER_ADMIN_EMAIL=robert.rivers@werunthesestreetz.com`, plus the email settings (see `docs/DEPLOY.md`), before this release goes live.
2. When the release starts:
   * **If an EventOS account with that email already exists**, it becomes the master administrator automatically. Sign in as usual.
   * **If it doesn't**, go to `/signup`, request access with that email, and open the confirmation email. Confirming makes you the master administrator. Your organization is named from the request (default "We Run These Streetz").
3. Open **WRTS admin** in the sidebar (on a phone: **More → WRTS admin**). Set up two-step verification: scan the QR code with an authenticator app, enter the code, and **save the ten recovery codes somewhere safe and offline**.

Each later sign-in asks for your password, then a 6-digit code.

## Daily work

**Overview** shows live counts and anything needing attention:

* requests waiting for review;
* email that isn't configured or failed;
* failed sign-ins in the last 24 hours.

**Requests.** Every new account goes through you.

* You get an email for each new request (and when an applicant answers your question). The link opens the request after you sign in. Opening it never approves anything.
* **Approve:** choose a new or existing organization and a role. The applicant gets an approval email and signs in with the password they chose.
* **Ask for more information:** your note is emailed with a reply link. The request comes back to the queue when they answer.
* **Deny:** the optional note is included in the email to the applicant.
* **Existing accounts (review):** accounts created before approvals were introduced are listed here. **Restore access** keeps their organizations and roles as they were.
* Approval never grants WRTS administrator rights.

**Accounts.** Search everyone and:

* suspend, reactivate or deactivate an account (each asks for a reason, which goes in the activity log);
* sign someone out everywhere.

As master you can also make someone a WRTS administrator or remove those rights. Administrators must set up two-step verification. They can manage ordinary accounts and organizations, but they can't approve requests, manage other administrators or touch your account.

**Organizations.**

* Create an organization for a customer. The owner gets a set-up link, already approved because you sent it.
* Change plans.
* See who belongs to each organization.

**Email delivery.** Every account email is queued, sent, and retried automatically, up to 8 times over about 16 hours. Failed or stuck messages can be sent again with **Retry now**. If email isn't configured on the server, messages wait here and go out once it is.

**Activity.** A read-only log of sign-ins, approvals, administrator actions and team changes.

**Data inventory** (master only). A read-only report of every account, organization and event in production. Records that look like test or demo data are flagged for your review. Download it to keep a copy. Running it deletes nothing. See `docs/DATA_CLEANUP.md` for how cleanup is approved.

## If you're locked out

See "Owner recovery procedure" in `docs/SECURITY_AND_ROLES.md`.
