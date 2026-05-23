-- Tenant screening — pre-qual + full report orders.
--
-- The pre-qual tier ($5 paid by the applicant at submit time) collects:
--   • Plaid Income / employment / cash flow (income_verification), with a
--     paystub-upload fallback for applicants whose employer isn't on Plaid
--   • Driver's license front + back + selfie — OCR'd with a vision LLM
--     and cross-checked against the typed application data. Not FCRA-grade
--     ID proof; just "do the claims match a real document"
--   • Self-reported background (already on the application row)
-- These feed an AI-generated "rentability score" that the manager sees with
-- the application. Pre-qual is NOT an FCRA consumer report — it's a private
-- internal signal scoped to a single property's leasing decision.
--
-- The full report tier (+$50 to upgrade, $55 cumulative) adds the regulated
-- pulls via the TransUnion ShareAble bundle — credit (with Resident Score),
-- national criminal + sex offender, and eviction history in one API call.
-- That tier is FCRA-regulated; the applicant authorizes it explicitly at
-- request time. TU's own SSN+DOB+name match serves as the courtroom-grade
-- identity proof at this tier, so no separate Persona pull is needed.
-- All-in $55 matches Avail's bundled screening price.
--
-- One row per (application, tier) — so each application can have 0, 1 (pre)
-- or 2 (pre + full) screening_orders.

CREATE TYPE screening_tier   AS ENUM ('prequal', 'full');
CREATE TYPE screening_pay    AS ENUM ('pending', 'paid', 'refunded', 'failed');
CREATE TYPE screening_state  AS ENUM (
  'awaiting_payment',  -- Stripe PaymentIntent created, not yet confirmed
  'collecting',        -- Paid, applicant in the middle of Plaid + Persona
  'scoring',           -- Provider data collected, AI summary running
  'complete',          -- Score + summary ready, manager can view
  'failed'             -- Provider call or scoring failed
);

CREATE TABLE IF NOT EXISTS screening_orders (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id           UUID NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  applicant_id             UUID REFERENCES profiles(id) ON DELETE SET NULL,
  tier                     screening_tier NOT NULL,
  state                    screening_state NOT NULL DEFAULT 'awaiting_payment',
  payment_status           screening_pay NOT NULL DEFAULT 'pending',

  -- Stripe — applicant pays directly via PaymentIntent; we keep our margin.
  stripe_payment_intent_id TEXT,
  amount_cents             INTEGER NOT NULL,
  fee_cents                INTEGER NOT NULL DEFAULT 0,
  margin_cents             INTEGER NOT NULL DEFAULT 0,

  -- Plaid Income + paystub-upload fallback + Array + Checkr.
  -- Stored as jsonb so we can evolve the shape without migrations.
  plaid_item_id            TEXT,
  plaid_data               JSONB,                  -- normalized income + employment from Plaid Income
  paystub_urls             TEXT[],                 -- storage paths if the applicant fell back to paystub upload
  paystub_data             JSONB,                  -- vision-LLM OCR result from paystub_urls
  array_report_id          TEXT,
  array_data               JSONB,
  checkr_report_id         TEXT,
  checkr_data              JSONB,

  -- Driver's license + selfie (replaces Persona at the pre-qual tier).
  dl_front_url             TEXT,                   -- storage path
  dl_back_url              TEXT,                   -- storage path (PDF417 barcode side)
  dl_selfie_url            TEXT,                   -- storage path
  dl_extracted             JSONB,                  -- OCR: name, dob, address, license #, state, exp, etc.
  dl_match_score           NUMERIC,                -- 0–1, selfie ↔ license photo embedding distance
  dl_flags                 JSONB,                  -- {name_mismatch, dob_mismatch, expired, tamper_suspected, ...}

  -- AI rentability output (pre-qual). Score 0–100, summary + flags.
  rentability_score        INTEGER,
  rentability_summary      TEXT,
  rentability_flags        JSONB,

  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  paid_at                  TIMESTAMPTZ,
  completed_at             TIMESTAMPTZ,
  CONSTRAINT one_per_app_tier UNIQUE (application_id, tier)
);

CREATE INDEX IF NOT EXISTS idx_screening_application ON screening_orders(application_id);
CREATE INDEX IF NOT EXISTS idx_screening_applicant   ON screening_orders(applicant_id);
CREATE INDEX IF NOT EXISTS idx_screening_state       ON screening_orders(state);

-- ── RLS ─────────────────────────────────────────────────────────────────────
ALTER TABLE screening_orders ENABLE ROW LEVEL SECURITY;

-- Applicant reads their own orders (so the apply page can show progress).
DROP POLICY IF EXISTS screening_applicant_select ON screening_orders;
CREATE POLICY screening_applicant_select ON screening_orders
  FOR SELECT USING (applicant_id = auth.uid());

-- Manager reads orders for applications on their properties.
DROP POLICY IF EXISTS screening_manager_select ON screening_orders;
CREATE POLICY screening_manager_select ON screening_orders
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM applications a
      JOIN units u ON u.id = a.unit_id
      JOIN properties p ON p.id = u.property_id
      WHERE a.id = screening_orders.application_id AND p.manager_id = auth.uid()
    )
  );

-- Edge functions run as service role so no INSERT/UPDATE policies needed
-- for the platform itself. Applicants don't insert directly.
