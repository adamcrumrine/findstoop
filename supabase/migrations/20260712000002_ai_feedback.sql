-- 20260712000002_ai_feedback.sql
-- Thumbs up/down on AI features — the signal that tells us which AI surfaces
-- deserve investment (paired with cost data already in api_call_log).
--
-- One row per verdict; users may submit multiple over time (e.g. the feature
-- got better) — analysis groups by created_at. No free-text in v1: comments
-- invite PII into an analytics table.

CREATE TABLE IF NOT EXISTS ai_feedback (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id  UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  -- Which AI surface: matches the edge function name where one exists.
  feature     TEXT NOT NULL CHECK (feature IN (
    'ask-lease', 'self-triage', 'draft-reply', 'fair-housing-lint',
    'portfolio-physical', 'explain-lease', 'triage-maintenance', 'parse-receipt'
  )),
  verdict     TEXT NOT NULL CHECK (verdict IN ('up', 'down')),
  -- Optional opaque reference (request id, document id) for joining later.
  reference_id TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_feedback_feature ON ai_feedback(feature, created_at);

ALTER TABLE ai_feedback ENABLE ROW LEVEL SECURITY;

-- Users write their own rows; only admin reads (aggregates in the admin
-- dashboard). No UPDATE/DELETE — feedback is an append-only signal.
DROP POLICY IF EXISTS ai_feedback_insert ON ai_feedback;
CREATE POLICY ai_feedback_insert ON ai_feedback
  FOR INSERT WITH CHECK (profile_id = auth.uid());

DROP POLICY IF EXISTS ai_feedback_admin_select ON ai_feedback;
CREATE POLICY ai_feedback_admin_select ON ai_feedback
  FOR SELECT USING (is_admin());
