-- EventOS production schema v1 (MySQL 8 / MariaDB 10.6+).
-- Tenant isolation is enforced in server/repo.js: every tenant query is scoped
-- by organization_id taken from the authenticated session, never from input.

CREATE TABLE organizations (
  id VARCHAR(40) PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  org_type VARCHAR(80),
  tier VARCHAR(20) NOT NULL DEFAULT 'pro',
  settings LONGTEXT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE users (
  id VARCHAR(40) PRIMARY KEY,
  email VARCHAR(254) NOT NULL UNIQUE,
  display_name VARCHAR(200),
  password_hash VARCHAR(100) NOT NULL,
  is_platform_admin TINYINT(1) NOT NULL DEFAULT 0,
  failed_logins INT NOT NULL DEFAULT 0,
  locked_until DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE memberships (
  organization_id VARCHAR(40) NOT NULL,
  user_id VARCHAR(40) NOT NULL,
  role VARCHAR(20) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (organization_id, user_id),
  KEY idx_member_user (user_id),
  CONSTRAINT fk_mem_org FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  CONSTRAINT fk_mem_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE sessions (
  token_hash CHAR(64) PRIMARY KEY,
  user_id VARCHAR(40) NOT NULL,
  organization_id VARCHAR(40) NULL,
  expires_at DATETIME NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  user_agent VARCHAR(255),
  KEY idx_sess_user (user_id),
  CONSTRAINT fk_sess_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE tokens (
  token_hash CHAR(64) PRIMARY KEY,
  kind VARCHAR(20) NOT NULL,
  email VARCHAR(254) NOT NULL,
  organization_id VARCHAR(40) NULL,
  role VARCHAR(20) NULL,
  created_by VARCHAR(40) NULL,
  expires_at DATETIME NOT NULL,
  used_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_tok_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE events (
  id VARCHAR(40) PRIMARY KEY,
  organization_id VARCHAR(40) NOT NULL,
  slug VARCHAR(120) NOT NULL UNIQUE,
  name VARCHAR(200) NOT NULL,
  phase VARCHAR(20) NOT NULL DEFAULT 'planning',
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  is_public TINYINT(1) NOT NULL DEFAULT 0,
  starts_on DATE NULL,
  data LONGTEXT NOT NULL,
  version INT NOT NULL DEFAULT 1,
  created_by VARCHAR(40),
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_ev_org (organization_id),
  CONSTRAINT fk_ev_org FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE registrations (
  id VARCHAR(40) PRIMARY KEY,
  organization_id VARCHAR(40) NOT NULL,
  event_id VARCHAR(40) NOT NULL,
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  email VARCHAR(254) NOT NULL,
  zip VARCHAR(12),
  team VARCHAR(120),
  division VARCHAR(20),
  referral VARCHAR(120),
  shirt_size VARCHAR(8),
  four_w_interest VARCHAR(120),
  is_adult TINYINT(1) NOT NULL DEFAULT 1,
  guardian_name VARCHAR(200),
  consent_analytics TINYINT(1) NOT NULL DEFAULT 0,
  consent_marketing TINYINT(1) NOT NULL DEFAULT 0,
  consent_partners TINYINT(1) NOT NULL DEFAULT 0,
  waiver_accepted_at DATETIME NULL,
  amount_cents INT NOT NULL DEFAULT 0,
  donation_cents INT NOT NULL DEFAULT 0,
  payment_status VARCHAR(20) NOT NULL DEFAULT 'free',
  stripe_session_id VARCHAR(255),
  source VARCHAR(30) NOT NULL DEFAULT 'eventos',
  external_id VARCHAR(120),
  checked_in_at DATETIME NULL,
  finished TINYINT(1) NOT NULL DEFAULT 0,
  hubspot_synced_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_reg_event (event_id),
  KEY idx_reg_org_email (organization_id, email),
  UNIQUE KEY uq_reg_external (event_id, source, external_id),
  CONSTRAINT fk_reg_org FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  CONSTRAINT fk_reg_event FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE snapshots (
  id VARCHAR(60) PRIMARY KEY,
  organization_id VARCHAR(40) NOT NULL,
  event_id VARCHAR(40),
  series_id VARCHAR(60),
  data LONGTEXT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_snap_org (organization_id),
  CONSTRAINT fk_snap_org FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE integrations (
  organization_id VARCHAR(40) NOT NULL,
  provider VARCHAR(30) NOT NULL,
  secret_enc TEXT NOT NULL,
  settings LONGTEXT NOT NULL,
  updated_by VARCHAR(40),
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (organization_id, provider),
  CONSTRAINT fk_int_org FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE audit_log (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  organization_id VARCHAR(40),
  user_id VARCHAR(40),
  action VARCHAR(60) NOT NULL,
  entity VARCHAR(40),
  entity_id VARCHAR(60),
  detail LONGTEXT,
  ip VARCHAR(64),
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_audit_org (organization_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE webhook_events (
  id VARCHAR(120) PRIMARY KEY,
  provider VARCHAR(30) NOT NULL,
  received_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
