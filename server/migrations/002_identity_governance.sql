-- EventOS 1.0 identity governance (directive sections 4 and 5).
--
-- * Account states. Only 'active' accounts can sign in or use the API.
-- * The master administrator (is_master) is a database flag, set once by the
--   server-side bootstrap in server/governance.js. It is never derived from an
--   email comparison at request time.
-- * Two-step sign-in (TOTP) for privileged accounts.
-- * Account requests replace open self-registration.
-- * A tracked email queue with retries and duplicate prevention.
--
-- Existing accounts: every account that is not the master administrator is
-- moved to 'pending_approval' with a 'legacy' review request, so nobody keeps
-- access until the master administrator reviews them. Nothing is deleted.

ALTER TABLE users
  ADD COLUMN status VARCHAR(30) NOT NULL DEFAULT 'unverified',
  ADD COLUMN status_reason VARCHAR(500) NULL,
  ADD COLUMN status_changed_at DATETIME NULL,
  ADD COLUMN status_changed_by VARCHAR(40) NULL,
  ADD COLUMN email_verified_at DATETIME NULL,
  ADD COLUMN first_name VARCHAR(100) NULL,
  ADD COLUMN last_name VARCHAR(100) NULL,
  ADD COLUMN is_master TINYINT(1) NOT NULL DEFAULT 0,
  ADD COLUMN mfa_secret VARCHAR(255) NULL,
  ADD COLUMN mfa_pending_secret VARCHAR(255) NULL,
  ADD COLUMN mfa_enabled_at DATETIME NULL,
  ADD COLUMN mfa_last_counter BIGINT NULL,
  ADD COLUMN mfa_recovery_codes TEXT NULL,
  ADD COLUMN last_login_at DATETIME NULL,
  ADD KEY idx_users_status (status);

-- Legacy accounts: no access until reviewed.
UPDATE users
   SET status = 'pending_approval',
       status_reason = 'Account created before account approvals. Awaiting master administrator review.',
       status_changed_at = UTC_TIMESTAMP(),
       is_platform_admin = 0;

ALTER TABLE sessions
  ADD COLUMN mfa_verified TINYINT(1) NOT NULL DEFAULT 0,
  ADD COLUMN ip VARCHAR(64) NULL,
  ADD COLUMN last_seen_at DATETIME NULL;

-- Sessions created before this migration belong to accounts that are now pending.
DELETE FROM sessions;

CREATE TABLE account_requests (
  id VARCHAR(40) PRIMARY KEY,
  user_id VARCHAR(40) NOT NULL,
  source VARCHAR(20) NOT NULL DEFAULT 'request',
  email VARCHAR(254) NOT NULL,
  first_name VARCHAR(100) NULL,
  last_name VARCHAR(100) NULL,
  organization_name VARCHAR(200) NULL,
  organization_type VARCHAR(80) NULL,
  requested_role VARCHAR(40) NULL,
  intended_use TEXT NULL,
  primary_pillar VARCHAR(20) NULL,
  phone VARCHAR(40) NULL,
  website VARCHAR(255) NULL,
  terms_version VARCHAR(40) NULL,
  terms_accepted_at DATETIME NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'unverified',
  invite_organization_id VARCHAR(40) NULL,
  invite_role VARCHAR(20) NULL,
  submitted_at DATETIME NULL,
  reviewed_by VARCHAR(40) NULL,
  reviewed_at DATETIME NULL,
  decision_note TEXT NULL,
  info_request_note TEXT NULL,
  applicant_response TEXT NULL,
  assigned_organization_id VARCHAR(40) NULL,
  assigned_role VARCHAR(20) NULL,
  ip VARCHAR(64) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_req_status (status),
  KEY idx_req_user (user_id),
  CONSTRAINT fk_req_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- One review request per existing account.
INSERT INTO account_requests (id, user_id, source, email, first_name, organization_name, status, submitted_at, intended_use)
SELECT CONCAT('req_legacy_', SUBSTRING(u.id, 5)), u.id, 'legacy', u.email, u.display_name,
       (SELECT o.name FROM memberships m JOIN organizations o ON o.id = m.organization_id WHERE m.user_id = u.id ORDER BY m.created_at LIMIT 1),
       'pending_approval', UTC_TIMESTAMP(), 'Existing account from before account approvals.'
  FROM users u;

CREATE TABLE email_outbox (
  id VARCHAR(40) PRIMARY KEY,
  dedupe_key VARCHAR(190) NULL UNIQUE,
  kind VARCHAR(40) NOT NULL,
  to_email VARCHAR(254) NOT NULL,
  subject VARCHAR(255) NOT NULL,
  body TEXT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'queued',
  attempts INT NOT NULL DEFAULT 0,
  last_error VARCHAR(500) NULL,
  next_attempt_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  sent_at DATETIME NULL,
  related_entity VARCHAR(40) NULL,
  related_id VARCHAR(40) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_outbox_due (status, next_attempt_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
