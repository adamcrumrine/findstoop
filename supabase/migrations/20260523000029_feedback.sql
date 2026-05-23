-- In-app feedback / bug-report / feature-request submissions. Used by the
-- "Send feedback" item on the manager avatar dropdown. On submit we insert
-- a row here (so the admin portal has a list) AND fire an outbound email to
-- support@findstoop.com via Resend (which forwards to the owner's personal
-- mailbox).

CREATE TABLE IF NOT EXISTS feedback (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submitter_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  submitter_email TEXT,
  submitter_name  TEXT,
  kind            TEXT NOT NULL CHECK (kind IN ('bug', 'feature', 'other')),
  subject         TEXT NOT NULL,
  body            TEXT NOT NULL,
  page_url        TEXT,
  status          TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'triaged', 'closed')),
  admin_notes     TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_feedback_status    ON feedback(status);
CREATE INDEX IF NOT EXISTS idx_feedback_submitter ON feedback(submitter_id);

ALTER TABLE feedback ENABLE ROW LEVEL SECURITY;

-- Anyone can submit their own feedback (they're authenticated).
DROP POLICY IF EXISTS feedback_insert_own ON feedback;
CREATE POLICY feedback_insert_own ON feedback
  FOR INSERT WITH CHECK (submitter_id = auth.uid());

-- Submitter can re-read what they sent. Admins can read + manage everything.
DROP POLICY IF EXISTS feedback_select_own ON feedback;
CREATE POLICY feedback_select_own ON feedback
  FOR SELECT USING (submitter_id = auth.uid());

DROP POLICY IF EXISTS feedback_admin_all ON feedback;
CREATE POLICY feedback_admin_all ON feedback
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );
