-- 20260604000002_referral_partners.sql
-- Landlord co-brand for the public renter tools (Renter Check, Deposit Check).
--
-- A manager gets one shareable ?ref=<code> link. When a renter opens the public
-- tool with that code, the page shows the landlord's company name + logo next to
-- "Powered by Stoop" — turning the free tools into a branded handout for the
-- landlord's own applicants and tenants. Universities still resolve via the
-- static client-side registry; this table covers self-serve landlords.
--
-- Branding is NOT duplicated here — it reads through to profiles.company_name /
-- company_logo_url so the landlord's Settings stay the single source of truth.
-- The anonymous pages resolve a code through get_referral_brand() (SECURITY
-- DEFINER), so the table itself is never exposed to anon and codes can't be
-- enumerated.

-- ── Table ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS referral_partners (
  code        text PRIMARY KEY,
  manager_id  uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  tagline     text,
  active      boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- One code per manager.
CREATE UNIQUE INDEX IF NOT EXISTS referral_partners_manager_id_key
  ON referral_partners(manager_id);

ALTER TABLE referral_partners ENABLE ROW LEVEL SECURITY;

-- A manager reads/edits only their own row. Inserts happen through
-- ensure_referral_partner() (SECURITY DEFINER), so no INSERT policy is needed.
CREATE POLICY "referral_partners select own"
  ON referral_partners FOR SELECT
  USING (manager_id = auth.uid() OR is_admin());

CREATE POLICY "referral_partners update own"
  ON referral_partners FOR UPDATE
  USING (manager_id = auth.uid())
  WITH CHECK (manager_id = auth.uid());

-- ── Public brand resolver ────────────────────────────────────────────────
-- Returns only branding fields for an active code. Used by the anonymous
-- Renter Check / Deposit Check pages; never exposes manager_id or the table.
CREATE OR REPLACE FUNCTION get_referral_brand(p_code text)
RETURNS TABLE (name text, tagline text, logo_url text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(NULLIF(btrim(p.company_name), ''), 'Your rentals') AS name,
         rp.tagline,
         p.company_logo_url AS logo_url
  FROM referral_partners rp
  JOIN profiles p ON p.id = rp.manager_id
  WHERE rp.code = lower(btrim(p_code)) AND rp.active = true
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION get_referral_brand(text) TO anon, authenticated;

-- ── Get-or-create the caller's referral code ─────────────────────────────
-- Derives a readable slug from the company/full name plus a short random
-- suffix so codes are stable and collision-resistant.
CREATE OR REPLACE FUNCTION ensure_referral_partner()
RETURNS referral_partners
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_id   uuid := auth.uid();
  v_row  referral_partners;
  v_name text;
  v_base text;
  v_code text;
BEGIN
  IF v_id IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  SELECT * INTO v_row FROM referral_partners WHERE manager_id = v_id;
  IF FOUND THEN
    RETURN v_row;
  END IF;

  SELECT COALESCE(NULLIF(btrim(company_name), ''), NULLIF(btrim(full_name), ''), 'rentals')
    INTO v_name FROM profiles WHERE id = v_id;

  v_base := btrim(regexp_replace(lower(coalesce(v_name, 'rentals')), '[^a-z0-9]+', '-', 'g'), '-');
  IF v_base = '' THEN
    v_base := 'rentals';
  END IF;
  v_code := left(v_base, 24) || '-' || substr(md5(v_id::text || clock_timestamp()::text), 1, 5);

  INSERT INTO referral_partners (code, manager_id) VALUES (v_code, v_id)
  RETURNING * INTO v_row;
  RETURN v_row;
END;
$$;

GRANT EXECUTE ON FUNCTION ensure_referral_partner() TO authenticated;
