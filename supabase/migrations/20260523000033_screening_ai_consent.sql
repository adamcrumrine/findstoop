-- One-time AI screening consent on the application.
--
-- The applicant consents implicitly by tapping "Continue" on the pre-qual
-- intro screen — the disclaimer text reads "By continuing, you authorize
-- FindStoop to use AI to verify your documents and score your application."
--
-- Stored on the parent `applications` row (not on screening_orders) so the
-- same consent covers BOTH the pre-qual order and any later full-report
-- order. We never re-prompt an applicant who already consented.

ALTER TABLE applications
  ADD COLUMN IF NOT EXISTS ai_screening_consent_at TIMESTAMPTZ;

COMMENT ON COLUMN applications.ai_screening_consent_at IS
  'Set when the applicant clicks Continue on the pre-qual intro screen. ' ||
  'Covers AI document OCR, cross-checks, and the rentability scoring for ' ||
  'BOTH the pre-qual and (if upgraded) the full-report tier. Never re-asked.';
