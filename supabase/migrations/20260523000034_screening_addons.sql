-- Pre-qual add-ons. First (and currently only) one: +$2 selfie face-match.
-- Selfie is opt-in — applicants who add it get faster manager decisions and
-- a "Verified+" chip; we recoup the extra Claude vision cost ($0.07) +
-- some margin.
--
-- Stored as a flat boolean for now since there's just the one. If we add
-- more (priority review, document re-upload window, etc.) we'll switch to
-- a JSONB.

ALTER TABLE screening_orders
  ADD COLUMN IF NOT EXISTS addon_selfie_match BOOLEAN NOT NULL DEFAULT FALSE;
