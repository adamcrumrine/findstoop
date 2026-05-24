-- Self-disclosed credit report tier.
--
-- Applicant pulls their own AnnualCreditReport.gov report (federally
-- guaranteed free under FCRA § 612), uploads the PDF here, and signs an
-- attestation that the file is genuine and unmodified.
--
-- We then run Claude OCR + cross-doc reasoning against the existing
-- driver's-license + income data already on this screening_order to emit
-- an "authenticity score" — NOT a bureau-issued report, just an internal
-- signal of how well the PDF lines up with the other documents we've
-- verified. The manager sees the score, a list of anomalies, and the
-- raw PDF; the legal framing is always "Applicant-Provided Credit
-- History" — never "Credit Report."
--
-- This is a Tier 2 add-on at $20. Margin is ~$19.70 after Stripe + AI.

ALTER TABLE screening_orders
  -- Upload + attestation
  ADD COLUMN IF NOT EXISTS credit_self_pdf_url               TEXT,
  ADD COLUMN IF NOT EXISTS credit_self_uploaded_at           TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS credit_self_attestation_name      TEXT,
  ADD COLUMN IF NOT EXISTS credit_self_attestation_ip        TEXT,
  ADD COLUMN IF NOT EXISTS credit_self_attestation_at        TIMESTAMPTZ,

  -- OCR-extracted facts (Claude Haiku)
  ADD COLUMN IF NOT EXISTS credit_self_bureau                TEXT,        -- 'equifax'|'experian'|'transunion'|null
  ADD COLUMN IF NOT EXISTS credit_self_report_date           DATE,
  ADD COLUMN IF NOT EXISTS credit_self_extracted             JSONB,       -- { score, account_count, derog_count, name, dob, addresses[] }

  -- Cross-doc authenticity (Claude Sonnet)
  ADD COLUMN IF NOT EXISTS credit_self_authenticity_score    INTEGER,     -- 0-100, higher = more consistent with other docs
  ADD COLUMN IF NOT EXISTS credit_self_authenticity_flags    JSONB,       -- [{ severity, code, message }, ...]
  ADD COLUMN IF NOT EXISTS credit_self_processed_at          TIMESTAMPTZ,

  -- Add-on toggle (mirrors the other addon_* columns on this table)
  ADD COLUMN IF NOT EXISTS addon_credit_self_disclosed       BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN screening_orders.credit_self_authenticity_score IS
  'Internal authenticity signal — NOT a credit score and NOT a bureau-issued report. Indicates how consistent the applicant-provided PDF is with the verified ID + income docs already on file.';
COMMENT ON COLUMN screening_orders.credit_self_extracted IS
  'OCR result from the applicant-uploaded credit report. Subject to applicant tampering. Cross-reference with credit_self_authenticity_flags before relying on any field.';

-- Storage path convention is `{screening_order_id}/credit-self/report-{ts}.pdf`
-- and lives in the existing `screening-docs` bucket. The bucket's existing
-- RLS already restricts applicant access to their own order folder, so no
-- new policies are needed.
