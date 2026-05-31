-- AI triage for maintenance requests. When a tenant submits a request, Claude
-- categorizes it, suggests a priority, summarizes it, and gives a DIY-vs-pro
-- recommendation — surfaced on the manager's queue. Results are advisory; the
-- manager's own priority/status fields remain authoritative.

ALTER TABLE maintenance_requests
  ADD COLUMN IF NOT EXISTS ai_category           TEXT,        -- e.g. 'plumbing', 'electrical', 'hvac'
  ADD COLUMN IF NOT EXISTS ai_suggested_priority TEXT,        -- 'low' | 'medium' | 'high' | 'emergency'
  ADD COLUMN IF NOT EXISTS ai_summary            TEXT,        -- one-line summary
  ADD COLUMN IF NOT EXISTS ai_recommendation     TEXT,        -- DIY vs. call-a-pro guidance
  ADD COLUMN IF NOT EXISTS ai_triaged_at         TIMESTAMPTZ;
