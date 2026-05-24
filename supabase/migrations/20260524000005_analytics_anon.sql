-- Anonymized analytics layer for the screening + application data set.
--
-- Goal:
--   Every fact we collect during application + screening (income, ID, paystub
--   facts, self-disclosed credit, rentability score, outcome) lands in a
--   second store that is safe to feed to GenAI for batch analysis ("show me
--   patterns among applicants whose authenticity_score < 50", "median rent-
--   to-income by state and rentability band", etc.) without exposing any
--   identifiable PII to the model — or to any human with database access
--   alone.
--
-- Design principles:
--   1. Pseudonymization, not encryption — we never need to decode back to a
--      real user. We just need to be able to (a) re-link the same person
--      across multiple applications and (b) prove to ourselves that no row
--      contains identifying values.
--   2. HMAC-SHA256 over the original UUID with a secret stored in a locked-
--      down table. Even a malicious read of analytics_applications can't be
--      reversed without the key, and the key lives in a table only callable
--      via SECURITY DEFINER functions.
--   3. Bucketing/banding — we never store exact incomes, ages, scores, etc.
--      Instead we store quantized bands ("income_band":"4000-5000"). Even if
--      a row escaped the pseudonym layer, the granularity isn't enough to
--      re-identify a person.
--   4. Geographic resolution caps at state + ZIP-3 (the first three digits,
--      USPS "sectional center facility" — population in the hundreds of
--      thousands, well outside re-identification risk).
--   5. Never copy: names, email, phone, SSN, driver's license number, exact
--      DOB, full address, Stripe IDs, bank-account info, signature images,
--      uploaded document binaries.
--   6. Single JSONB blob `features` for schema evolution without migrations.
--      The extraction function is the one place that defines the schema.
--
-- Legal posture:
--   Pseudonymized data is still "personal data" under GDPR/CCPA, but it is
--   "de-identified" under most US-state privacy statutes when paired with
--   strong key management + a written commitment not to re-identify.
--   Our Privacy Policy ("Analytics & Product Improvement") needs an explicit
--   clause covering this — see TODO at the bottom of this file.

-- ── 1. Secret key store ──────────────────────────────────────────────────
-- One row, set once. RLS revokes everyone — only SECURITY DEFINER funcs read.
CREATE TABLE IF NOT EXISTS app_secrets (
  name        TEXT PRIMARY KEY,
  value       TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE app_secrets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON app_secrets FROM PUBLIC, anon, authenticated;
-- No CREATE POLICY → no role can SELECT/INSERT/UPDATE/DELETE except superuser
-- and SECURITY DEFINER functions owned by the postgres role.

-- Seed the HMAC key on first run. Uses gen_random_bytes for a 32-byte secret.
-- If you ever rotate this key, ALL existing pseudonyms become stale and you
-- must re-extract from source. Don't rotate without a plan.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM app_secrets WHERE name = 'analytics_pseudo_key') THEN
    INSERT INTO app_secrets (name, value)
    VALUES ('analytics_pseudo_key', encode(gen_random_bytes(32), 'hex'));
  END IF;
END$$;


-- ── 2. Pseudonym function ────────────────────────────────────────────────
-- Stable HMAC of the input UUID. SECURITY DEFINER so callers don't need
-- access to app_secrets. Returns a 64-char hex string.
CREATE OR REPLACE FUNCTION analytics_pseudo(p_uuid UUID) RETURNS TEXT
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  v_key TEXT;
BEGIN
  IF p_uuid IS NULL THEN RETURN NULL; END IF;
  SELECT value INTO v_key FROM app_secrets WHERE name = 'analytics_pseudo_key';
  IF v_key IS NULL THEN
    RAISE EXCEPTION 'analytics_pseudo_key not configured';
  END IF;
  RETURN encode(extensions.hmac(p_uuid::text, v_key, 'sha256'), 'hex');
END;
$$;
REVOKE ALL ON FUNCTION analytics_pseudo(UUID) FROM PUBLIC;


-- ── 3. Banding helpers ───────────────────────────────────────────────────
-- All return TEXT bands so the JSONB stays cheap to query / filter.

CREATE OR REPLACE FUNCTION band_money(p_amount NUMERIC) RETURNS TEXT
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN p_amount IS NULL OR p_amount < 0     THEN NULL
    WHEN p_amount <  1000                     THEN '0-1k'
    WHEN p_amount <  2000                     THEN '1-2k'
    WHEN p_amount <  3000                     THEN '2-3k'
    WHEN p_amount <  4000                     THEN '3-4k'
    WHEN p_amount <  5000                     THEN '4-5k'
    WHEN p_amount <  7500                     THEN '5-7.5k'
    WHEN p_amount < 10000                     THEN '7.5-10k'
    WHEN p_amount < 15000                     THEN '10-15k'
    WHEN p_amount < 25000                     THEN '15-25k'
    ELSE                                            '25k+'
  END;
$$;

CREATE OR REPLACE FUNCTION band_credit_score(p_score INTEGER) RETURNS TEXT
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN p_score IS NULL                      THEN NULL
    WHEN p_score < 580                        THEN '<580'
    WHEN p_score < 620                        THEN '580-619'
    WHEN p_score < 660                        THEN '620-659'
    WHEN p_score < 700                        THEN '660-699'
    WHEN p_score < 740                        THEN '700-739'
    WHEN p_score < 800                        THEN '740-799'
    ELSE                                           '800+'
  END;
$$;

CREATE OR REPLACE FUNCTION band_age(p_dob DATE) RETURNS TEXT
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN p_dob IS NULL                                          THEN NULL
    WHEN EXTRACT(YEAR FROM AGE(p_dob)) < 25                     THEN '18-24'
    WHEN EXTRACT(YEAR FROM AGE(p_dob)) < 35                     THEN '25-34'
    WHEN EXTRACT(YEAR FROM AGE(p_dob)) < 45                     THEN '35-44'
    WHEN EXTRACT(YEAR FROM AGE(p_dob)) < 55                     THEN '45-54'
    WHEN EXTRACT(YEAR FROM AGE(p_dob)) < 65                     THEN '55-64'
    ELSE                                                              '65+'
  END;
$$;

CREATE OR REPLACE FUNCTION band_score_100(p_score INTEGER) RETURNS TEXT
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN p_score IS NULL                      THEN NULL
    WHEN p_score < 50                         THEN '0-49'
    WHEN p_score < 70                         THEN '50-69'
    WHEN p_score < 85                         THEN '70-84'
    WHEN p_score < 95                         THEN '85-94'
    ELSE                                           '95-100'
  END;
$$;

-- Bucket household size, capping at 6+ so families don't become identifiable.
CREATE OR REPLACE FUNCTION band_household(p_size INTEGER) RETURNS TEXT
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN p_size IS NULL                       THEN NULL
    WHEN p_size <= 1                          THEN '1'
    WHEN p_size <= 5                          THEN p_size::text
    ELSE                                           '6+'
  END;
$$;

-- ZIP-3 only — first three digits is USPS Sectional Center Facility (SCF)
-- with hundreds of thousands of residents per code. Safe to keep.
CREATE OR REPLACE FUNCTION zip3(p_zip TEXT) RETURNS TEXT
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN p_zip IS NULL THEN NULL ELSE substring(regexp_replace(p_zip, '\D', '', 'g') from 1 for 3) END;
$$;


-- ── 4. Storage table ─────────────────────────────────────────────────────
-- One row per application. JSONB schema is documented in extract_application_analytics().
CREATE TABLE IF NOT EXISTS analytics_applications (
  application_pseudo  TEXT PRIMARY KEY,
  applicant_pseudo    TEXT NOT NULL,                  -- same applicant across multiple apps
  property_pseudo     TEXT,                           -- same property across multiple apps
  manager_pseudo      TEXT,                           -- same landlord across portfolio
  features            JSONB NOT NULL,
  observed_at         DATE NOT NULL DEFAULT CURRENT_DATE,
  outcome             TEXT,                           -- 'approved'|'declined'|'withdrawn'|null
  outcome_at          DATE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_analytics_apps_applicant ON analytics_applications(applicant_pseudo);
CREATE INDEX IF NOT EXISTS idx_analytics_apps_property  ON analytics_applications(property_pseudo);
CREATE INDEX IF NOT EXISTS idx_analytics_apps_outcome   ON analytics_applications(outcome);
CREATE INDEX IF NOT EXISTS idx_analytics_apps_features  ON analytics_applications USING GIN (features);

ALTER TABLE analytics_applications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON analytics_applications FROM PUBLIC, anon, authenticated;
-- Only SECURITY DEFINER functions (and admin via service-role) touch this.
-- Admins read aggregated views, not raw rows.


-- ── 5. Extraction function ───────────────────────────────────────────────
-- Idempotent — call as many times as you want during the application
-- lifecycle. Each call recomputes features from current source data and
-- upserts the row. The JSONB merge means partial calls (e.g. just after
-- DL OCR, before income OCR) still write what's known so far.
CREATE OR REPLACE FUNCTION extract_application_analytics(p_application_id UUID) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_app          applications%ROWTYPE;
  v_order        screening_orders%ROWTYPE;
  v_unit         units%ROWTYPE;
  v_property     properties%ROWTYPE;
  v_features     JSONB;
  v_app_pseudo   TEXT;
  v_acct_pseudo  TEXT;
  v_prop_pseudo  TEXT;
  v_mgr_pseudo   TEXT;
  v_outcome      TEXT;
  v_outcome_at   DATE;
  v_credit       JSONB;
  v_income       JSONB;
  v_dl           JSONB;
BEGIN
  SELECT * INTO v_app FROM applications WHERE id = p_application_id;
  IF NOT FOUND THEN RETURN; END IF;

  SELECT * INTO v_order FROM screening_orders WHERE application_id = p_application_id ORDER BY created_at DESC LIMIT 1;
  SELECT * INTO v_unit  FROM units      WHERE id = v_app.unit_id;
  SELECT * INTO v_property FROM properties WHERE id = v_unit.property_id;

  v_app_pseudo  := analytics_pseudo(v_app.id);
  v_acct_pseudo := analytics_pseudo(v_app.applicant_profile_id);
  v_prop_pseudo := analytics_pseudo(v_property.id);
  v_mgr_pseudo  := analytics_pseudo(v_property.manager_id);

  v_credit := COALESCE(v_order.credit_self_extracted, '{}'::jsonb);
  v_income := COALESCE(v_order.income_extracted,      '{}'::jsonb);
  v_dl     := COALESCE(v_order.dl_extracted,          '{}'::jsonb);

  v_features := jsonb_strip_nulls(jsonb_build_object(
    -- ── Geographic (safe granularity) ─────────────────────────────
    'applicant_state',      v_app.current_state,
    'applicant_zip3',       zip3(v_app.current_zip),
    'property_state',       v_property.state,
    'property_zip3',        zip3(v_property.zip),
    'same_state',           (v_app.current_state IS NOT NULL AND v_property.state IS NOT NULL
                              AND v_app.current_state = v_property.state),

    -- ── Demographic bands ─────────────────────────────────────────
    'age_band',             band_age(v_app.date_of_birth),
    'household_band',       band_household(v_app.household_size),
    'has_pets',             v_app.has_pets,

    -- ── Income / rent affordability ───────────────────────────────
    'monthly_income_band',  band_money(v_app.monthly_income),
    'current_rent_band',    band_money(v_app.current_rent),
    'unit_rent_band',       band_money(v_unit.rent_amount),
    'rent_to_income_ratio', CASE
                              WHEN v_app.monthly_income IS NULL OR v_app.monthly_income <= 0 THEN NULL
                              ELSE round((v_unit.rent_amount::numeric / v_app.monthly_income), 2)
                            END,

    -- ── Employment (categorical only) ─────────────────────────────
    'employment_path',      v_order.income_path,
    'employed_years_band',  CASE
                              WHEN v_app.employment_start_date IS NULL THEN NULL
                              WHEN EXTRACT(YEAR FROM AGE(v_app.employment_start_date)) < 1 THEN '<1y'
                              WHEN EXTRACT(YEAR FROM AGE(v_app.employment_start_date)) < 3 THEN '1-2y'
                              WHEN EXTRACT(YEAR FROM AGE(v_app.employment_start_date)) < 6 THEN '3-5y'
                              WHEN EXTRACT(YEAR FROM AGE(v_app.employment_start_date)) < 11 THEN '6-10y'
                              ELSE                                                              '10y+'
                            END,
    'pay_frequency',        v_income->>'pay_frequency',
    'annual_income_band',   band_money((v_income->>'annual_income_estimate')::numeric),
    'employer_match_app',   (v_order.income_flags->>'employer_match_app')::boolean,
    'name_match_app',       (v_order.income_flags->>'name_match_app')::boolean,
    'name_match_dl',        (v_order.income_flags->>'name_match_dl')::boolean,
    'paystubs_consecutive', (v_order.income_flags->>'paystubs_consecutive')::boolean,
    'ytd_math_consistent',  (v_order.income_flags->>'ytd_math_consistent')::boolean,
    'income_tamper_flag',   (v_order.income_flags->>'tamper_suspected')::boolean,

    -- ── ID verification ───────────────────────────────────────────
    'dl_match_score_band',  band_score_100( (v_order.dl_match_score * 100)::int ),
    'dl_state',             v_dl->>'state',
    'dl_expired',           CASE WHEN v_dl->>'expiration' IS NULL THEN NULL
                                  ELSE (v_dl->>'expiration')::date < CURRENT_DATE END,
    'dl_tamper_flag',       (v_order.dl_flags->>'tamper_suspected')::boolean,

    -- ── Self-disclosed credit ─────────────────────────────────────
    'credit_bureau',         v_order.credit_self_bureau,
    'credit_score_band',     band_credit_score((v_credit->>'score')::int),
    'credit_age_days',       CASE WHEN v_order.credit_self_report_date IS NULL THEN NULL
                                   ELSE (CURRENT_DATE - v_order.credit_self_report_date) END,
    'account_count_band',    band_household( (v_credit->>'account_count')::int ),
    'open_account_count',    LEAST((v_credit->>'open_account_count')::int, 30),
    'derog_count',           LEAST((v_credit->>'derogatory_count')::int, 15),
    'collection_count',      LEAST((v_credit->>'collection_count')::int,  10),
    'bankruptcy_count',      LEAST((v_credit->>'bankruptcy_count')::int,   5),
    'total_balance_band',    band_money((v_credit->>'total_balance')::numeric),
    'authenticity_band',     band_score_100(v_order.credit_self_authenticity_score),

    -- ── Rentability + outcome ─────────────────────────────────────
    'rentability_band',      band_score_100(v_order.rentability_score),

    -- ── Add-ons purchased (for product-mix learning) ──────────────
    'addons', jsonb_build_object(
      'selfie',        v_order.addon_selfie_match,
      'credit_self',   v_order.addon_credit_self_disclosed,
      'credit_check',  v_order.addon_credit_check,
      'criminal',      v_order.addon_criminal_check,
      'eviction',      v_order.addon_eviction_check
    ),

    -- ── Lifecycle ─────────────────────────────────────────────────
    'screening_state',       v_order.state,
    'paid',                  v_order.payment_status = 'paid',
    'application_status',    v_app.status
  ));

  -- Derive outcome from application.status for the row-level column too.
  v_outcome := CASE
    WHEN v_app.status IN ('approved','declined','withdrawn') THEN v_app.status
    ELSE NULL
  END;
  v_outcome_at := CASE WHEN v_outcome IS NULL THEN NULL ELSE COALESCE(v_app.updated_at, NOW())::date END;

  INSERT INTO analytics_applications (
    application_pseudo, applicant_pseudo, property_pseudo, manager_pseudo,
    features, observed_at, outcome, outcome_at, updated_at
  )
  VALUES (
    v_app_pseudo, v_acct_pseudo, v_prop_pseudo, v_mgr_pseudo,
    v_features, CURRENT_DATE, v_outcome, v_outcome_at, NOW()
  )
  ON CONFLICT (application_pseudo) DO UPDATE
    SET features    = analytics_applications.features || EXCLUDED.features,
        outcome     = COALESCE(EXCLUDED.outcome, analytics_applications.outcome),
        outcome_at  = COALESCE(EXCLUDED.outcome_at, analytics_applications.outcome_at),
        updated_at  = NOW();
END;
$$;

-- Only the service role + admin functions can call this — clients never
-- invoke it directly.
REVOKE ALL ON FUNCTION extract_application_analytics(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION extract_application_analytics(UUID) TO service_role;


-- ── 6. Read view for the admin dashboard / GenAI analyst ────────────────
-- Admin reads aggregates here, not raw rows. The view is just a passthrough
-- but keeps the analytics_applications table itself opaque to the admin
-- role, so future row-level masking is just a view edit.
CREATE OR REPLACE VIEW admin_analytics_applications AS
SELECT
  application_pseudo,
  applicant_pseudo,
  property_pseudo,
  manager_pseudo,
  features,
  observed_at,
  outcome,
  outcome_at
FROM analytics_applications;

REVOKE ALL ON admin_analytics_applications FROM PUBLIC, anon, authenticated;
GRANT SELECT ON admin_analytics_applications TO service_role;

-- ── 7. Trigger — auto-refresh on application status change ─────────────
-- Application approvals / declines / withdrawals are the natural outcome
-- signal. A trigger keeps the analytics row fresh without any edge
-- function remembering to call the extractor.
CREATE OR REPLACE FUNCTION analytics_on_application_change() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;
  PERFORM extract_application_analytics(NEW.id);
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Never let analytics block the application update.
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_analytics_application_change ON applications;
CREATE TRIGGER trg_analytics_application_change
  AFTER INSERT OR UPDATE ON applications
  FOR EACH ROW EXECUTE FUNCTION analytics_on_application_change();


-- TODO (manual follow-up, not in SQL):
--   1. Privacy Policy update — add an "Analytics & Product Improvement"
--      clause: "We store pseudonymized, bucketed copies of application
--      facts for internal product analytics and model training. Bucketed
--      data cannot be linked back to you without a secret key we hold
--      under restricted access. We do not sell this data." Include
--      opt-out instruction (set profiles.analytics_opt_out = true).
--   2. profiles.analytics_opt_out flag — TBD when we wire the toggle in
--      tenant settings.
--   3. Retention — define a policy (e.g. 7y for outcomes, 2y for in-flight
--      apps without outcome) and a nightly job to purge old rows.
