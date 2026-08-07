-- Management teams — foundation + read-only delegation.
--
-- Until now a manager was an island: 51 policies across 24 tables resolve
-- permission as `properties.manager_id = auth.uid()`, so a second person could
-- never see a portfolio no matter what an invite said.
--
-- The approach here is deliberately ADDITIVE. Postgres ORs permissive policies
-- together, so adding a team-scoped SELECT policy beside each owner policy
-- widens reads without editing — or risking — a single existing rule. Writes
-- are untouched, which makes "view only" a structural property of the schema
-- rather than something that had to be got right in 51 separate places.
--
-- Write scopes and the per-area permission model come next; `permissions` is
-- JSONB so that lands without another migration.
--
-- Billing is unaffected: units are counted from properties.manager_id, which
-- nothing here changes.

-- ── Tables ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS teams (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name               TEXT,
  -- The invoice goes to the primary. Defaults to whoever set the account up.
  primary_manager_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS team_members (
  team_id     UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Per-area grants; view everywhere and edit on messages is the default a
  -- landlord asked for. Shape can grow without a migration.
  permissions JSONB NOT NULL DEFAULT
    '{"payments":"view","leases":"view","maintenance":"view","tenants":"view","messages":"edit"}'::jsonb,
  invited_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  invited_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Null until the invitee actually signs in through the link. An unaccepted
  -- row grants nothing.
  accepted_at TIMESTAMPTZ,
  revoked_at  TIMESTAMPTZ,
  PRIMARY KEY (team_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_team_members_user ON team_members(user_id) WHERE revoked_at IS NULL;

-- ── Backfill: every existing manager becomes a team of one ──────────────
-- Nobody's experience changes; they are simply now the primary of a team
-- containing only themselves.
INSERT INTO teams (name, primary_manager_id)
SELECT COALESCE(p.company_name, p.full_name, 'My team'), p.id
  FROM profiles p
 WHERE p.role IN ('manager', 'admin')
   AND NOT EXISTS (SELECT 1 FROM teams t WHERE t.primary_manager_id = p.id);

INSERT INTO team_members (team_id, user_id, permissions, accepted_at)
SELECT t.id, t.primary_manager_id,
       '{"payments":"edit","leases":"edit","maintenance":"edit","tenants":"edit","messages":"edit"}'::jsonb,
       now()
  FROM teams t
 WHERE NOT EXISTS (
   SELECT 1 FROM team_members m WHERE m.team_id = t.id AND m.user_id = t.primary_manager_id
 );

-- A manager who signs up later needs a team of their own, or invites would
-- have nothing to attach to.
CREATE OR REPLACE FUNCTION public.create_personal_team()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_team UUID;
BEGIN
  IF NEW.role NOT IN ('manager', 'admin') THEN RETURN NEW; END IF;
  IF EXISTS (SELECT 1 FROM team_members WHERE user_id = NEW.id) THEN RETURN NEW; END IF;

  INSERT INTO teams (name, primary_manager_id)
  VALUES (COALESCE(NEW.company_name, NEW.full_name, 'My team'), NEW.id)
  RETURNING id INTO v_team;

  INSERT INTO team_members (team_id, user_id, permissions, accepted_at)
  VALUES (v_team, NEW.id,
    '{"payments":"edit","leases":"edit","maintenance":"edit","tenants":"edit","messages":"edit"}'::jsonb,
    now());
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_create_personal_team ON public.profiles;
CREATE TRIGGER trg_create_personal_team
  AFTER INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.create_personal_team();

-- ── The access function ─────────────────────────────────────────────────
-- Every manager whose portfolio the caller may READ: their teammates, plus
-- always themselves.
--
-- The `UNION SELECT $1` is not redundant. A manager with no team row — a race
-- with the trigger, a backfill that missed — would otherwise resolve to the
-- empty set and lose sight of their own portfolio. Self-access must not depend
-- on this table being correct.
CREATE OR REPLACE FUNCTION public.managers_i_act_for(caller UUID)
RETURNS SETOF UUID
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT DISTINCT mate.user_id
    FROM team_members me
    JOIN team_members mate ON mate.team_id = me.team_id
   WHERE me.user_id = caller
     AND me.accepted_at IS NOT NULL AND me.revoked_at IS NULL
     AND mate.accepted_at IS NOT NULL AND mate.revoked_at IS NULL
  UNION
  SELECT caller
$$;

-- Lease ids readable by the caller's whole team. Deliberately a NEW function
-- rather than widening get_manager_lease_ids: that one guards DELETE and
-- UPDATE policies, and widening it would have handed every view-only member
-- write access in the same stroke.
CREATE OR REPLACE FUNCTION public.get_team_lease_ids(caller UUID)
RETURNS SETOF UUID
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT l.id
    FROM leases l
    JOIN units u ON u.id = l.unit_id
    JOIN properties p ON p.id = u.property_id
   WHERE p.manager_id IN (SELECT managers_i_act_for(caller))
$$;

CREATE OR REPLACE FUNCTION public.get_team_property_ids(caller UUID)
RETURNS SETOF UUID
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id FROM properties WHERE manager_id IN (SELECT managers_i_act_for(caller))
$$;

-- ── RLS on the new tables ───────────────────────────────────────────────
ALTER TABLE teams        ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS teams_member_select ON teams;
CREATE POLICY teams_member_select ON teams FOR SELECT USING (
  id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid() AND revoked_at IS NULL)
);

-- Only the primary restructures the team. A member cannot promote themselves,
-- add someone, or revoke a colleague.
DROP POLICY IF EXISTS teams_primary_update ON teams;
CREATE POLICY teams_primary_update ON teams FOR UPDATE USING (primary_manager_id = auth.uid());

DROP POLICY IF EXISTS team_members_select ON team_members;
CREATE POLICY team_members_select ON team_members FOR SELECT USING (
  user_id = auth.uid()
  OR team_id IN (SELECT team_id FROM team_members m WHERE m.user_id = auth.uid() AND m.revoked_at IS NULL)
);

DROP POLICY IF EXISTS team_members_primary_write ON team_members;
CREATE POLICY team_members_primary_write ON team_members FOR ALL USING (
  team_id IN (SELECT id FROM teams WHERE primary_manager_id = auth.uid())
) WITH CHECK (
  team_id IN (SELECT id FROM teams WHERE primary_manager_id = auth.uid())
);

-- ── Team-scoped READ policies ───────────────────────────────────────────
-- Added beside the existing owner policies, never replacing them.
CREATE POLICY properties_team_select ON properties FOR SELECT
  USING (manager_id IN (SELECT managers_i_act_for(auth.uid())));

CREATE POLICY units_team_select ON units FOR SELECT
  USING (property_id IN (SELECT get_team_property_ids(auth.uid())));

CREATE POLICY leases_team_select ON leases FOR SELECT
  USING (id IN (SELECT get_team_lease_ids(auth.uid())));

CREATE POLICY lease_tenants_team_select ON lease_tenants FOR SELECT
  USING (lease_id IN (SELECT get_team_lease_ids(auth.uid())));

CREATE POLICY payments_team_select ON payments FOR SELECT
  USING (lease_id IN (SELECT get_team_lease_ids(auth.uid())));

CREATE POLICY documents_team_select ON documents FOR SELECT
  USING (lease_id IN (SELECT get_team_lease_ids(auth.uid())));

CREATE POLICY maintenance_requests_team_select ON maintenance_requests FOR SELECT
  USING (unit_id IN (SELECT id FROM units WHERE property_id IN (SELECT get_team_property_ids(auth.uid()))));

CREATE POLICY applications_team_select ON applications FOR SELECT
  USING (unit_id IN (SELECT id FROM units WHERE property_id IN (SELECT get_team_property_ids(auth.uid()))));

CREATE POLICY generated_documents_team_select ON generated_documents FOR SELECT
  USING (property_id IN (SELECT get_team_property_ids(auth.uid())));

CREATE POLICY property_expenses_team_select ON property_expenses FOR SELECT
  USING (property_id IN (SELECT get_team_property_ids(auth.uid())));

CREATE POLICY utility_bills_team_select ON utility_bills FOR SELECT
  USING (lease_id IN (SELECT get_team_lease_ids(auth.uid())));

CREATE POLICY late_payment_series_team_select ON late_payment_series FOR SELECT
  USING (lease_id IN (SELECT get_team_lease_ids(auth.uid())));

CREATE POLICY lease_signatures_team_select ON lease_signatures FOR SELECT
  USING (lease_id IN (SELECT get_team_lease_ids(auth.uid())));

CREATE POLICY pets_team_select ON pets FOR SELECT
  USING (lease_id IN (SELECT get_team_lease_ids(auth.uid())));

CREATE POLICY seasonal_task_events_team_select ON seasonal_task_events FOR SELECT
  USING (property_id IN (SELECT get_team_property_ids(auth.uid())));

-- Tenant profiles: without this the portfolio reads as rows of anonymous ids.
CREATE POLICY profiles_team_read_tenants ON profiles FOR SELECT
  USING (
    role = 'tenant'
    AND EXISTS (
      SELECT 1 FROM lease_tenants lt
       WHERE lt.tenant_id = profiles.id
         AND lt.lease_id IN (SELECT get_team_lease_ids(auth.uid()))
    )
  );

-- Deliberately NOT extended to the team in this pass: billing_events and
-- referral_partners. Those are the primary's financial relationship with
-- Stoop, not portfolio data a colleague needs to do the job.

-- ── Vestigial default ───────────────────────────────────────────────────
-- Every caller passes free_units explicitly (both Stripe functions read
-- FINDSTOOP_FREE_UNITS, defaulting to 0), so this 2 has never applied — but it
-- contradicts $5/unit pricing and would silently discount any future caller
-- that omitted the argument.
CREATE OR REPLACE FUNCTION public.count_manager_paid_units(manager_uuid UUID, free_units INTEGER DEFAULT 0)
RETURNS INTEGER
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT GREATEST(0, count_manager_active_units(manager_uuid) - free_units)
$$;
