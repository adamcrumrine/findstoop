-- Break the RLS recursion introduced with management teams.
--
-- team_members_select asked "which teams is the caller in?" by SELECTing
-- team_members — the table the policy is guarding. Postgres re-applies the
-- policy to that subquery, which asks the same question again, and refuses:
--
--   42P17: infinite recursion detected in policy for relation "team_members"
--
-- It fails the whole read rather than returning no rows, so Settings showed
-- an empty team and "only the primary can invite" to the actual primary.
--
-- The membership lookup has to sit OUTSIDE the policy it feeds. A SECURITY
-- DEFINER function runs with the owner's rights, so the inner read is not
-- itself policy-checked and the cycle never forms. It is still safe: the
-- function is keyed to auth.uid() and can only ever report the caller's own
-- memberships.

CREATE OR REPLACE FUNCTION public.my_team_ids()
RETURNS SETOF UUID
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT team_id FROM team_members
   WHERE user_id = auth.uid() AND revoked_at IS NULL
$$;

DROP POLICY IF EXISTS teams_member_select ON teams;
CREATE POLICY teams_member_select ON teams FOR SELECT
  USING (id IN (SELECT my_team_ids()));

DROP POLICY IF EXISTS team_members_select ON team_members;
CREATE POLICY team_members_select ON team_members FOR SELECT
  USING (user_id = auth.uid() OR team_id IN (SELECT my_team_ids()));

-- Unchanged in effect, restated for clarity: writes read `teams`, whose policy
-- now resolves through my_team_ids(), so this path no longer touches
-- team_members recursively either.
DROP POLICY IF EXISTS team_members_primary_write ON team_members;
CREATE POLICY team_members_primary_write ON team_members FOR ALL
  USING (team_id IN (SELECT id FROM teams WHERE primary_manager_id = auth.uid()))
  WITH CHECK (team_id IN (SELECT id FROM teams WHERE primary_manager_id = auth.uid()));
