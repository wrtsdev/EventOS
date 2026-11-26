-- EventOS production schema (PostgreSQL 15+). Target for Phase 4.
-- The prototype keeps the same shapes in browser storage (see src/domain/migrate.js).
-- Every tenant-owned table carries organization_id and is protected by row-level security.

-- ---------- Tenancy and access ----------
CREATE TABLE organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  org_type text,
  tier text NOT NULL DEFAULT 'community' CHECK (tier IN ('community','pro','enterprise')),
  assistant_enabled boolean NOT NULL DEFAULT true,
  epic_weights jsonb NOT NULL DEFAULT '{"E":40,"P":20,"I":20,"C":20}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email citext UNIQUE NOT NULL,
  display_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE memberships (
  organization_id uuid REFERENCES organizations ON DELETE CASCADE,
  user_id uuid REFERENCES users ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('owner','coordinator','finance','safety','volunteer','partner')),
  PRIMARY KEY (organization_id, user_id)
);

CREATE TABLE audit_log (
  id bigserial PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations,
  user_id uuid REFERENCES users,
  entity text NOT NULL,
  entity_id uuid,
  action text NOT NULL,
  before jsonb,
  after jsonb,
  at timestamptz NOT NULL DEFAULT now()
);

-- ---------- Events and the 4Ws ----------
CREATE TABLE event_series (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations,
  name text NOT NULL
);

CREATE TABLE events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations,
  series_id uuid REFERENCES event_series,
  prior_event_id uuid REFERENCES events,
  name text NOT NULL,
  type_id text NOT NULL,
  format text NOT NULL CHECK (format IN ('physical','virtual','hybrid')),
  purpose text,
  purpose_statement text,
  audience text,
  starts_on date,
  location text,
  expected_participants int,
  registration_cap int,
  price_cents int NOT NULL DEFAULT 0,
  revenue_goal_cents int,
  budget_limit_cents int,
  phase text NOT NULL DEFAULT 'planning' CHECK (phase IN ('planning','live','eventday','complete')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','canceled','archived')),
  cancel_reason text,
  weather jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE event_four_ws (
  event_id uuid REFERENCES events ON DELETE CASCADE,
  four_w text NOT NULL CHECK (four_w IN ('wealth','wellness','wisdom','work')),
  is_primary boolean NOT NULL DEFAULT false,
  PRIMARY KEY (event_id, four_w)
);
CREATE UNIQUE INDEX one_primary_w ON event_four_ws (event_id) WHERE is_primary;

CREATE TABLE outcome_indicators (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES events ON DELETE CASCADE,
  indicator_key text NOT NULL,
  four_w text NOT NULL,
  unit text NOT NULL,
  direction text NOT NULL DEFAULT 'up',
  target numeric,
  actual numeric,
  evidence text CHECK (evidence IN ('verified','reported','estimated')),
  is_reach boolean NOT NULL DEFAULT false,
  note text
);

-- ---------- EPIC controls, evidence and score history ----------
CREATE TABLE epic_controls (            -- library, versioned
  key text PRIMARY KEY,
  domain char(1) NOT NULL CHECK (domain IN ('E','P','I','C')),
  severity text NOT NULL CHECK (severity IN ('critical','standard','nice')),
  stage text NOT NULL CHECK (stage IN ('planning','t30','t7','eventday','closure')),
  due_days int NOT NULL,
  calculated boolean NOT NULL DEFAULT false,
  informational boolean NOT NULL DEFAULT false,
  version int NOT NULL DEFAULT 1
);

CREATE TABLE event_controls (
  event_id uuid REFERENCES events ON DELETE CASCADE,
  control_key text NOT NULL,                 -- library key or 'carry-<action id>'
  status text CHECK (status IN ('attention','done','blocking')),  -- NULL = not assessed
  owner text,
  updated_by uuid REFERENCES users,
  updated_at timestamptz,
  PRIMARY KEY (event_id, control_key)
);

CREATE TABLE evidence_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations,
  event_id uuid NOT NULL REFERENCES events ON DELETE CASCADE,
  subject_type text NOT NULL,                -- control | outcome | partner | distribution
  subject_id text NOT NULL,
  level text NOT NULL CHECK (level IN ('verified','reported','estimated')),
  description text,
  file_ref text,
  recorded_by uuid REFERENCES users,
  recorded_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE score_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES events ON DELETE CASCADE,
  stage text NOT NULL,
  composite int,
  coverage_pct int,
  domains jsonb NOT NULL,
  critical_open int NOT NULL,
  weights jsonb NOT NULL,
  recorded_by uuid REFERENCES users,
  recorded_at timestamptz NOT NULL DEFAULT now()
);

-- ---------- Finance ----------
CREATE TABLE budget_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES events ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('revenue','expense')),
  category text,
  label text NOT NULL,
  planned_cents int NOT NULL,
  actual_cents int,
  per_participant boolean NOT NULL DEFAULT false,
  is_local boolean NOT NULL DEFAULT false,
  is_essential boolean NOT NULL DEFAULT false,
  minimum_cents int,
  vendor_id uuid,
  payment_status text CHECK (payment_status IN ('unpaid','deposit','paid')),
  due_weeks_before int
);
CREATE TABLE financial_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES events,
  budget_line_id uuid REFERENCES budget_lines,
  amount_cents int NOT NULL,
  source text NOT NULL,                      -- adapter id or 'manual'
  external_ref text,
  status text NOT NULL CHECK (status IN ('pending','settled','failed','refunded')),
  occurred_at timestamptz NOT NULL
);

-- ---------- Partners, sponsors, vendors ----------
CREATE TABLE partners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations,
  name text NOT NULL,
  partner_type text NOT NULL CHECK (partner_type IN ('beneficiary','community','vendor','sponsor')),
  is_local boolean NOT NULL DEFAULT false
);
CREATE TABLE event_partners (
  event_id uuid REFERENCES events ON DELETE CASCADE,
  partner_id uuid REFERENCES partners,
  intended_outcome text,
  actual_outcome text,
  evidence text CHECK (evidence IN ('verified','reported','estimated')),
  PRIMARY KEY (event_id, partner_id)
);
CREATE TABLE sponsorship_packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations,
  name text NOT NULL, price_cents int NOT NULL, inventory int NOT NULL, benefits jsonb NOT NULL
);
CREATE TABLE sponsorships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES events,
  partner_id uuid NOT NULL REFERENCES partners,
  package_id uuid REFERENCES sponsorship_packages,
  amount_cents int NOT NULL,
  commitment text NOT NULL CHECK (commitment IN ('pledged','invoiced','paid'))
);
CREATE TABLE sponsorship_deliverables (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sponsorship_id uuid NOT NULL REFERENCES sponsorships ON DELETE CASCADE,
  label text NOT NULL,
  status text NOT NULL CHECK (status IN ('pending','delivered','missed')),
  evidence_id uuid REFERENCES evidence_records
);
CREATE TABLE beneficiary_distributions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES events,
  partner_id uuid NOT NULL REFERENCES partners,
  amount_cents int NOT NULL,
  distributed_on date,
  evidence text CHECK (evidence IN ('verified','reported','estimated'))
);

-- ---------- Workforce ----------
CREATE TABLE workforce_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES events ON DELETE CASCADE,
  role text NOT NULL,
  work_type text NOT NULL CHECK (work_type IN ('volunteer','paid','contracted')),
  needed int NOT NULL, assigned int NOT NULL DEFAULT 0,
  hours_each numeric, wage_cents int, budget_line_id uuid REFERENCES budget_lines,
  training_required text, trained int NOT NULL DEFAULT 0,
  lead text, backup text, skill text, is_local boolean
);
CREATE TABLE workforce_assignments (     -- individual people; minors flagged for extra protection
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role_id uuid NOT NULL REFERENCES workforce_roles ON DELETE CASCADE,
  participant_id uuid,
  is_minor boolean NOT NULL DEFAULT false,
  hours_recorded numeric,
  attended boolean
);

-- ---------- Safety ----------
CREATE TABLE risks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES events ON DELETE CASCADE,
  hazard text NOT NULL, category text,
  likelihood smallint CHECK (likelihood BETWEEN 1 AND 3),
  impact smallint CHECK (impact BETWEEN 1 AND 3),
  mitigation text, owner text, reviewed boolean NOT NULL DEFAULT false
);
CREATE TABLE emergency_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES events ON DELETE CASCADE,
  role text NOT NULL, name text, phone text, confirmed boolean NOT NULL DEFAULT false
);
CREATE TABLE incidents (                 -- restricted: separate RLS policy by role
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations,
  event_id uuid NOT NULL REFERENCES events,
  occurred_at timestamptz NOT NULL,
  incident_type text NOT NULL,
  severity text NOT NULL CHECK (severity IN ('minor','moderate','serious')),
  summary text NOT NULL,
  actions text,
  involves_minor boolean NOT NULL DEFAULT false,
  status text NOT NULL CHECK (status IN ('open','closed'))
);

-- ---------- Communications ----------
CREATE TABLE communications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES events ON DELETE CASCADE,
  audience text NOT NULL, title text NOT NULL, channel text, send_at timestamptz,
  body text,
  author_kind text NOT NULL CHECK (author_kind IN ('organizer','assistant','template')),
  status text NOT NULL CHECK (status IN ('draft','approved','scheduled','sent')),
  approved_by uuid REFERENCES users, approved_at timestamptz,
  CHECK (status = 'draft' OR approved_by IS NOT NULL)   -- nothing leaves without a human approval
);
CREATE TABLE questions (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), event_id uuid REFERENCES events ON DELETE CASCADE, asked_by text, body text, answer text, status text);
CREATE TABLE documents (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), event_id uuid REFERENCES events ON DELETE CASCADE, name text, kind text, file_ref text, status text);

-- ---------- Learning ----------
CREATE TABLE after_action_reviews (
  event_id uuid PRIMARY KEY REFERENCES events ON DELETE CASCADE,
  went_well text, improve text, safety text, lessons text,
  status text NOT NULL CHECK (status IN ('draft','complete')),
  completed_by uuid REFERENCES users, completed_at timestamptz
);
CREATE TABLE corrective_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES events,
  action text NOT NULL, epic_domain char(1) NOT NULL, owner text, due_on date,
  status text NOT NULL CHECK (status IN ('open','done','dropped')),
  carried_to_event_id uuid REFERENCES events
);

-- ---------- Row-level security (pattern; repeat per tenant table) ----------
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON events
  USING (organization_id IN (SELECT organization_id FROM memberships WHERE user_id = current_setting('app.user_id')::uuid));

ALTER TABLE incidents ENABLE ROW LEVEL SECURITY;
CREATE POLICY incident_roles ON incidents
  USING (organization_id IN (
    SELECT organization_id FROM memberships
    WHERE user_id = current_setting('app.user_id')::uuid AND role IN ('owner','coordinator','safety')));
