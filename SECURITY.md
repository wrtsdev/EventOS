# EventOS Security Policy

Status: Proposed policy for maintainer approval. The response targets below become operational commitments when this policy is approved and responders are assigned.
Policy owner: EventOS repository owner (`wrtsdev`), acting for We Run These Streetz LLC (WRTS).
Reviewed: 2026-11-01. Review quarterly and after significant incidents, architecture changes, or new integrations.

## Scope and current security posture

This policy covers EventOS source code, dependencies, build artifacts, deployments, participant Passport, organizer workspaces, Community Intelligence, CauseOS, SponsorOS, Copilot, and integration services when introduced.

The reviewed baseline is commit `92153a7761e538578c1687e8786f0cc1b88fec69`:
- React 18/Vite prototype, package version 0.1.0; organization, event, and Passport state persists in browser localStorage (`src/store.jsx`).
- Registration, timing, payment, and CRM interactions are mocked; a connector labeled "connected" is not evidence of a live connection.
- Copilot is a local rules provider, not a hosted model.
- Authentication, server-enforced tenant boundaries, production databases, and live payment processing are not implemented in this baseline.
- Architecture and data-model documents describe a production direction; their stated privacy rules are requirements, not verification of enforcement.

Use fictional demonstration data only in the current prototype. Do not enter real participant contact details, emergency contacts, waivers, credentials, payment information, health information, or confidential organization data. localStorage is readable by scripts on the same origin and users of the browser profile; it is not an access-controlled production store. Reset demo restores sample state; it is not a verified production erasure mechanism.

This document defines required controls and an implementation plan. Adding it does not enable those controls, certify compliance, or authorize production use.

## Supported versions

| Version or deployment | Security support |
| --- | --- |
| Latest commit on `main` (currently 0.1.0 prototype) | Reports accepted; fixes land on main |
| Older commits, branches, and copied demo artifacts | No backports; update or rebuild from main |
| Future production releases | Publish a supported-version and upgrade schedule before release |

Report suspected issues even if version or ownership is uncertain. EventOS maintainers coordinate EventOS fixes; vulnerabilities solely in a vendor's service should also be reported through that vendor's private channel.

## Reporting a vulnerability

Email **info@werunthesestreetz.com** with the subject **EventOS security report**. This address was designated by the project owner. Report suspected exposure, account compromise, unsafe data sharing, or active abuse through the same channel and mark urgent incidents in the subject.

Do not post vulnerabilities, exploit details, personal data, or credentials in GitHub issues, pull requests, or public discussions. The repository is currently private; do not assume GitHub private vulnerability reporting is available. Email is the reporting route unless maintainers publish an additional verified private channel.

Include:
- Affected component, URL if applicable, version or commit, and discovery time with timezone.
- Reproduction steps using your own account or fictional data, expected versus actual behavior, and likely impact.
- Minimal redacted screenshots or proof of concept; identify any suspected exposed data without attaching it.
- A way to contact you and whether you want public credit.

Do not email passwords, tokens, full records, card details, or unredacted exports. Ask for an approved secure transfer method if sensitive evidence is necessary. If no acknowledgement arrives within two business days, resend to the same address with "Follow-up" in the subject.

Test only systems and accounts you own or have explicit permission to test. Stop once impact is demonstrated. Do not disrupt events, degrade service, access other participants' records, test third-party platforms without their permission, or retain discovered data beyond what is needed for a minimal report. Coordinate disclosure with maintainers so affected users can receive a mitigation. No bounty or payment is promised.

## Response SLAs and vulnerability handling

The repository owner assigns a primary responder and backup, monitors the mailbox, and maintains a private case log. Acknowledge every report within **two business days** and provide an initial severity and disposition within **five business days** of receipt. Business days mean Monday–Friday, excluding US federal holidays, using America/New_York time.

After initial triage, use these targets:

| Severity | Examples | Containment or mitigation | Fix or durable remediation | Reporter updates |
| --- | --- | --- | --- | --- |
| Critical | Active exploitation, widespread tenant escape, exposed production secrets, unauthorized payment actions | Within 24 hours | Within 7 calendar days | Daily |
| High | Account takeover, significant participant-data exposure, serious authorization bypass | Within 72 hours | Within 14 calendar days | Every 3 calendar days |
| Medium | Limited disclosure or constrained abuse requiring additional conditions | Within 14 calendar days | Within 30 calendar days | Weekly |
| Low | Low-impact hardening or narrowly scoped weakness | Within 30 calendar days | Within 90 calendar days | Every 30 calendar days |

Severity-specific clocks start when severity is assigned; do not delay triage to defer deadlines. All times in the table are elapsed calendar time. Suspected active exploitation or production-data exposure triggers incident response immediately upon discovery, without waiting for triage. Critical coverage requires an assigned on-call responder before production launch.

Assess exploitability, scope, data sensitivity, financial effects, and event-day availability; document severity and changes privately. A mitigation may disable a connector, export, account, or affected feature while a fix is built. Deadlines are response targets, not guarantees of resolution. If a target will be missed, notify the reporter before it expires, record compensating controls, an accountable owner, and a revised date, and escalate to the repository owner. No silent or indefinite risk acceptance.

Validate fixes with regression tests and deployment verification. Close a case only after recording affected versions, remediation, remaining risk, and reporter notification. Coordinate advisories and credit without publishing secrets or personal data; urgent protective communications must not wait for a public disclosure agreement.

## Secure development and delivery

- Require pull requests, independent review, and passing required checks before changes reach main. Protect main against direct pushes, force pushes, and deletion; narrowly restrict and audit emergency bypass.
- Review changes to consent, authorization, identifiers, integration mappings, exports, payment flows, and Copilot tools for misuse and data leakage. Threat-model each new data flow and trust boundary.
- Preserve the lockfile and use `npm ci`. CI currently runs `npm run check` (tests and production build). Add dependency vulnerability review, secret scanning, and static analysis where available, with equivalent automated checks if repository features are unavailable. Triage findings using the SLAs above.
- Use a currently supported Node.js LTS runtime and supported dependencies; update the README, package engines, and CI together. The current Node 20 configuration and dependency versions require lifecycle review before production.
- Give CI only necessary permissions, normally `contents: read`; pin third-party actions to reviewed full commit SHAs. Do not expose production secrets to untrusted pull requests. Separate build and deployment permissions and require approval for production deployment.
- Store secrets in an approved server-side secrets manager. Never put them in source, logs, demo data, localStorage, browser bundles, or `VITE_*` variables, which are client-visible. Revoke and rotate leaked credentials immediately; deleting a commit is insufficient.
- Validate types, lengths, ranges, and schemas at trusted server boundaries. Treat saved browser state, imports, vendor responses, survey text, URLs, and Copilot inputs as untrusted. Avoid unsafe HTML injection; allowlist external destinations and prevent formula execution in spreadsheet exports.
- Serve production over HTTPS with appropriate security headers and a tested Content Security Policy. Protect authenticated state-changing requests against CSRF, constrain CORS, rate-limit sensitive endpoints, and use secure, HttpOnly session cookies with appropriate SameSite settings.
- Separate development, staging, and production accounts, data, and credentials. Use synthetic test data. Record artifact provenance, restrict artifact access, and keep a tested rollback path.

## Identity and access controls

Before production, implement authentication and authorization on the server. UI visibility, pricing tiers, client IDs, and localStorage values are not authorization.

- Use individual accounts, least privilege, and MFA for repository, hosting, secrets, CRM, and other privileged access. Prefer phishing-resistant MFA; prohibit shared administrator accounts.
- Verify organization membership and permission on every API request, query, export, job, and integration operation. Derive tenant scope from the authenticated identity; reject cross-tenant resource identifiers.
- Organization owners administer their own tenant. Coordinators manage authorized events. Volunteer leads receive only assigned operational data. Sponsor viewers see authorized SponsorOS aggregates; beneficiary viewers see authorized CauseOS aggregates. Participants manage their own Passport and consent.
- Passport identity across organizations must not allow an organizer to browse another organization's participant history. Sharing requires explicit scope and permission.
- Restrict support and emergency access with approval, expiry, and an audit trail. Revoke access promptly on departure or role change; review privileged access quarterly.
- Log authentication changes, role changes, exports, consent changes, connector operations, and administrative actions with actor, tenant, time, and outcome. Exclude credentials and unnecessary personal data; restrict and protect audit logs from alteration.

## Personal and payment data safeguards

- Inventory each field, purpose, destination, owner, access group, retention period, and deletion process before collection. Collect the minimum needed for the event; provide an accurate privacy notice. Keep emergency contacts and waivers tightly restricted if later introduced.
- Implement the transactional/community-intelligence separation described in `docs/ARCHITECTURE.md` and `docs/DATA_MODEL.md`, using storage and access boundaries. Contact, payment, and waiver records must not enter intelligence views or exports.
- Treat stable participant IDs, ZIP codes, teams, referral codes, and event history as potentially identifying. Pseudonymization is not anonymization. Suppress ZIP-level export groups smaller than 10 as specified by the model; test other filters and repeated queries for re-identification risks.
- Record separate analytics, marketing, partner-sharing, and leaderboard choices with purpose, source, timestamp, and notice version. Missing or unknown optional consent means denied. Map `leaderboards` and `showOnLeaderboards` consistently.
- Check current consent server-side at ingestion, derivation, export, queued dispatch, and CRM workflow enrollment. Apply withdrawals to future processing, queued work, and downstream suppression/deletion as applicable.
- The mock registration normalizers currently set analytics consent to true; this must not become a production default. The Privacy screen describes timestamped records, but `store.jsx` only patches browser state. Implement and test append-only consent records before making that promise to real users.
- Do not infer health conditions, race, religion, political views, or other sensitive traits from participation, groups, surveys, or 4W interests. Health-screening results remain with the health partner; only appropriately aggregated counts belong in EventOS.
- Encrypt production data and backups at rest and in transit, restrict key access, and test restoration. Approve a purpose-specific retention schedule before launch, including logs, exports, backups, and vendor copies. Test access, correction, export, and deletion requests with identity verification and documented exceptions.
- Delegate card collection to an approved payment provider through hosted checkout or hosted fields. EventOS must never receive or store PAN, CVV, magnetic-stripe data, or PIN data. Retain only necessary provider references, status, amount, and currency.
- Verify payment status server-side with authenticated provider events; never trust browser success redirects or imported amounts as proof of settlement. Validate webhook signatures, prevent replay and duplicate processing, reconcile discrepancies, and restrict refunds and payout changes with audit logs and additional approval.
- Establish applicable payment-security responsibilities with the provider and a qualified reviewer before live payments. This policy makes no PCI DSS compliance claim.

## Third-party integrations and Copilot

RunSignup, Race Roster, timing CSV/API, and HubSpot are prototype adapters. Other registry entries, including fundraising and fitness providers, describe possible integrations rather than verified production services.

For every live connector:
- Approve its owner, purpose, data fields, vendor security review, contractual data handling, incident contact, scopes, and removal procedure before enabling it.
- Keep credentials server-side, separate per organization and environment; minimize scopes, rotate credentials, and support immediate revocation.
- Authenticate webhooks, validate source and schema, limit payload size, prevent replay, make writes idempotent, and bound retries and queues. Restrict outbound destinations to prevent server-side request forgery.
- Enforce tenant scope and current consent on imports and exports. Keep only permitted fields; quarantine malformed records and redact logs.
- For HubSpot, allowlist `HUBSPOT_PROPERTIES`, verify marketing consent immediately before sending, and prevent partner sharing without separate consent. Never export payment, waiver, emergency-contact, or health data. Verify suppression and withdrawal behavior across lists and workflows.
- Make CSV imports subject to size limits, schema checks, tenant checks, consent provenance, and safe exports. Do not assume a vendor opt-in authorizes every EventOS purpose.

Before adding hosted AI or MCP tools, review provider retention/training settings and data destinations. Send only authorized, minimized context; treat retrieved text as untrusted input. Enforce permissions and consent in each tool, isolate tenants, restrict tools and destinations, and require explicit confirmation for consequential sends or financial actions. Test prompt injection and data-exfiltration cases. Preserve the existing local-verification notes for legal, permit, insurance, medical, and safety guidance.

## Incident response

The repository owner acts as incident commander until a designated responder takes over. Assign engineering, communications, and privacy/payment-provider contacts before production and keep the contact roster and runbooks private.

1. **Detect and assess:** Open a restricted incident record with UTC timestamps, affected tenants, versions, services, and suspected data. Preserve relevant logs and evidence with limited access; do not copy sensitive evidence into public tickets.
2. **Contain:** Revoke exposed tokens and sessions, isolate affected services, pause connector queues and exports, and disable risky features as needed. Consider event-day continuity and provide a safe fallback without expanding data exposure.
3. **Investigate:** Determine entry point, blast radius, unauthorized access or changes, affected data categories, and vendor involvement. Preserve evidence before destructive cleanup where feasible.
4. **Eradicate and recover:** Patch root causes, rotate affected credentials, restore from verified clean backups if necessary, validate tenant and consent boundaries, and monitor for recurrence before reopening integrations.
5. **Communicate:** Keep affected stakeholders informed with confirmed facts, protective steps, and the next update time. The incident commander coordinates any required notices with appropriate privacy/legal and provider contacts, using applicable obligations and contractual deadlines; this policy does not substitute a universal notification deadline.
6. **Learn:** Complete a private post-incident review within 10 business days after containment. Assign corrective actions with owners and dates; track completion and update tests, controls, and this policy. Publish a redacted summary when appropriate.

## Phased implementation checklist

Time windows start at policy approval. Assign a named individual and track evidence privately for each item. Production gates apply even if a calendar target has not arrived; no phase is complete merely because this document is merged.

### Phase 0 — First 7 days: establish ownership and safe demo use
Owner: repository owner.
- [ ] Assign primary/backup security responders; test delivery and monitoring of info@werunthesestreetz.com.
- [ ] Approve SLA staffing, escalation roster, private case log, and incident runbook.
- [ ] Publish prototype-only data limits in the UI; reconcile inaccurate privacy promises.
- [ ] Inventory repository/hosting access, credentials, data flows, and dependencies; address urgent exposures.

### Phase 1 — Days 8–30: protect development and design production boundaries
Owner: engineering lead designated by repository owner.
- [ ] Enforce protected main, independent reviews, required CI, least-privilege permissions, and MFA.
- [ ] Add dependency/secret/static checks; review Node and dependency support; pin Actions.
- [ ] Approve tenant/role matrix, threat model, data inventory, retention schedule, and vendor requirements.
- [ ] Add tests covering denied consent, withdrawn consent, malformed imports, and forbidden exports.

### Phase 2 — Days 31–60, before real personal data or live connectors
Owners: engineering lead and designated privacy owner.
- [ ] Implement server authentication, tenant-scoped authorization, role restrictions, and negative cross-tenant tests.
- [ ] Replace localStorage as the system of record; implement protected stores, key management, audit logs, and secure sessions.
- [ ] Implement consent history, consistent leaderboard purpose mapping, withdrawal propagation, and small-group suppression.
- [ ] Verify participant access/deletion, vendor minimization, connector credential isolation, webhook security, and queue controls.
- [ ] Verify UI/privacy notices match actual behavior; approve each live connector separately.

### Phase 3 — Days 61–90, before production and live payments
Owners: repository owner and designated operations/payment owners.
- [ ] Complete hosted-payment review and test settlement verification, duplicate events, refunds, and payout controls.
- [ ] Test backup restoration, rollback, incident tabletop, security mailbox escalation, and critical on-call coverage.
- [ ] Review deployment headers, rate limits, monitoring, alerts, and artifact access.
- [ ] Complete focused independent security review; resolve critical/high findings or keep affected features disabled.
- [ ] Record release approval and supported-version schedule; verify every applicable pre-production gate.

### Ongoing
- [ ] Review dependencies and security findings at least weekly; apply severity SLAs.
- [ ] Review access and vendors quarterly; rehearse incident response and recovery at least annually.
- [ ] Review this policy quarterly, record exceptions with owner/expiry/compensating controls, and verify corrective actions after incidents.
