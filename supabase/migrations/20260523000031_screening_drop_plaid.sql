-- Skip Plaid Income entirely. Pure document-upload for employment + income.
--
-- Rationale:
--   • Plaid Income costs ~$2–5/check; vision-LLM OCR on 2 paystubs is ~$0.10
--   • Plaid only covers ~75% of US W-2 employees — we'd have to build doc
--     upload as a fallback anyway, so we'd be maintaining two paths
--   • Last-4 SSN on paystubs is essentially non-sensitive; full SSN on a W-2
--     would force encryption-at-rest + retention policies we don't need
--   • One unified flow is simpler to build, test, and explain
--
-- The income_docs schema supports W-2, paystubs, 1099, bank statements, and
-- tax returns — whichever path fits the applicant's employment type.

ALTER TABLE screening_orders DROP COLUMN IF EXISTS plaid_item_id;
ALTER TABLE screening_orders DROP COLUMN IF EXISTS plaid_data;
ALTER TABLE screening_orders DROP COLUMN IF EXISTS paystub_urls;
ALTER TABLE screening_orders DROP COLUMN IF EXISTS paystub_data;

CREATE TYPE income_doc_kind AS ENUM (
  'paystub',          -- W-2 employee: 2 consecutive most-recent paystubs
  'ten99',            -- 1099 contractor: most recent 1099-NEC / 1099-MISC
  'bank_statement',   -- gig / cash: last 90 days of bank statements
  'tax_return',       -- self-employed: most recent 1040 Schedule C
  'ssa_1099',         -- retired / fixed income: SSA-1099 or pension statement
  'offer_letter'      -- new hire pre-first-paycheck: signed offer letter
);

ALTER TABLE screening_orders
  ADD COLUMN income_path        TEXT,                -- 'w2' | '1099' | 'self_employed' | 'fixed_income' | 'new_hire'
  ADD COLUMN income_doc_urls    TEXT[],              -- storage paths to uploaded documents
  ADD COLUMN income_doc_kinds   income_doc_kind[],   -- parallel array to income_doc_urls
  ADD COLUMN income_extracted   JSONB,               -- vision-LLM OCR: employer, gross, frequency, ytd, etc.
  ADD COLUMN income_flags       JSONB;               -- cross-check verdicts: employer_match, ytd_consistent, etc.

COMMENT ON COLUMN screening_orders.income_extracted IS 'OCR output, normalized. Example for paystubs: {employer_name, employer_address, pay_frequency, gross_per_period, net_per_period, ytd_gross, ytd_periods, annual_income_estimate, employee_last4_ssn, period_end_dates}';

COMMENT ON COLUMN screening_orders.income_flags IS 'Internal cross-check results. Example: {employer_match_app: true, name_match_dl: true, paystubs_consecutive: true, ytd_math_consistent: true, paystubs_fresh_60d: true, tamper_suspected: false}';
