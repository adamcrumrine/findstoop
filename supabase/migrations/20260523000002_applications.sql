-- 028_applications.sql
-- Rental applications: inbound submissions from prospective tenants, linked
-- to a unit. Public form at /apply/:unitId creates rows here.
-- Screening fields are kept on the same row but separate from applicant info;
-- they're populated when the landlord (or eventually a partner API) runs
-- credit / background / eviction checks.

CREATE TYPE application_status AS ENUM ('submitted', 'under_review', 'approved', 'declined', 'withdrawn');
CREATE TYPE screening_status AS ENUM ('not_ordered', 'requested', 'in_progress', 'complete', 'failed');

CREATE TABLE IF NOT EXISTS applications (
  id                    UUID                PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id               UUID                NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  status                application_status  NOT NULL DEFAULT 'submitted',
  -- Applicant info (captured on the public form, no auth required at submit)
  first_name            TEXT                NOT NULL,
  last_name             TEXT                NOT NULL,
  email                 TEXT                NOT NULL,
  phone                 TEXT,
  date_of_birth         DATE,
  current_address       TEXT,
  current_city          TEXT,
  current_state         TEXT,
  current_zip           TEXT,
  current_rent          NUMERIC(10,2),
  current_landlord_name TEXT,
  current_landlord_phone TEXT,
  reason_for_leaving    TEXT,
  -- Employment + income
  employer              TEXT,
  job_title             TEXT,
  monthly_income        NUMERIC(10,2),
  employment_start_date DATE,
  -- Household
  desired_move_in_date  DATE,
  household_size        INTEGER,
  has_pets              BOOLEAN             DEFAULT false,
  pets_description      TEXT,
  -- Notes / answers to custom landlord questions (JSONB)
  custom_answers        JSONB,
  -- Optional link to a profiles row once the applicant creates an account
  applicant_profile_id  UUID                REFERENCES profiles(id) ON DELETE SET NULL,
  -- Screening
  screening_status      screening_status    NOT NULL DEFAULT 'not_ordered',
  screening_requested_at TIMESTAMPTZ,
  screening_completed_at TIMESTAMPTZ,
  credit_score          INTEGER,
  background_summary    TEXT,
  eviction_history      TEXT,
  screening_report_url  TEXT,
  -- Landlord-side notes
  landlord_notes        TEXT,
  -- Lifecycle
  submitted_at          TIMESTAMPTZ         NOT NULL DEFAULT NOW(),
  reviewed_at           TIMESTAMPTZ,
  decided_at            TIMESTAMPTZ,
  created_at            TIMESTAMPTZ         NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_applications_unit_id ON applications(unit_id);
CREATE INDEX idx_applications_status  ON applications(status);
CREATE INDEX idx_applications_email   ON applications(email);
CREATE INDEX idx_applications_submitted_at ON applications(submitted_at DESC);

-- ── RLS ────────────────────────────────────────────────────────────────────

ALTER TABLE applications ENABLE ROW LEVEL SECURITY;

-- Public INSERT — prospective renters submit applications without an auth
-- session. We rely on rate-limiting at the edge function layer (added separately)
-- to prevent abuse.
CREATE POLICY "applications_public_insert" ON applications
  FOR INSERT WITH CHECK (true);

-- Managers SELECT/UPDATE on applications for their units only.
CREATE POLICY "applications_manager_select" ON applications
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM units u
      JOIN properties p ON p.id = u.property_id
      WHERE u.id = applications.unit_id AND p.manager_id = auth.uid()
    )
  );

CREATE POLICY "applications_manager_update" ON applications
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM units u
      JOIN properties p ON p.id = u.property_id
      WHERE u.id = applications.unit_id AND p.manager_id = auth.uid()
    )
  );

-- Applicants see their own row if they later sign up and link.
CREATE POLICY "applications_applicant_select" ON applications
  FOR SELECT USING (applicant_profile_id = auth.uid());

-- Admin sees everything.
CREATE POLICY "applications_admin_all" ON applications
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());

-- ── Helper: unit details for the public application form ──────────────────
-- Used by the /apply/:unitId page to show the renter what they're applying for.
-- SECURITY DEFINER so unauthenticated visitors can see basic unit info.

CREATE OR REPLACE FUNCTION public.unit_application_context(unit_uuid UUID)
RETURNS TABLE(
  unit_id        UUID,
  unit_number    TEXT,
  bedrooms       INTEGER,
  bathrooms      NUMERIC,
  rent_amount    NUMERIC,
  property_name  TEXT,
  property_address TEXT,
  property_city  TEXT,
  property_state TEXT,
  property_zip   TEXT,
  unit_status    TEXT
) AS $$
  SELECT
    u.id,
    u.unit_number,
    u.bedrooms,
    u.bathrooms,
    u.rent_amount,
    p.name,
    p.address,
    p.city,
    p.state,
    p.zip,
    u.status::text
  FROM public.units u
  JOIN public.properties p ON p.id = u.property_id
  WHERE u.id = unit_uuid
$$ LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE;
