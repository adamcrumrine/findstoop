-- SECURITY FIX (S3): the screening OCR/scoring edge functions
-- (dl-ocr, income-ocr, credit-report-ocr, rentability-score, run-credit-check)
-- took a client-supplied orderId, used the service-role client (bypassing RLS),
-- and RETURNED full applicant PII (name, DOB, license #, income, SSN last-4,
-- credit) with NO authentication. The apply flow is anonymous, so there is no
-- logged-in owner to check against — anyone holding/guessing an order id could
-- replay these endpoints to read PII or trigger paid AI inference (cost burn).
--
-- Fix: issue a per-order capability token. start-screening returns it to the
-- applicant's browser; each OCR/scoring function now requires it and rejects a
-- mismatch. The token is high-entropy (two UUIDs, dashes stripped = 256 hex
-- chars / ~244 bits) and never leaves the order owner's session.

ALTER TABLE screening_orders
  ADD COLUMN IF NOT EXISTS access_token TEXT
  DEFAULT (replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''));

-- Backfill any pre-existing rows that came in before the default existed.
UPDATE screening_orders
  SET access_token = replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')
  WHERE access_token IS NULL;

ALTER TABLE screening_orders ALTER COLUMN access_token SET NOT NULL;
