-- 029_profile_assets_payment_schedule.sql
-- Adds asset columns (company name/logo, property thumbnail) + payment-schedule
-- columns + auto-generation trigger that creates monthly payment rows when
-- a lease flips to 'active'.

-- ── Profile assets (manager) ─────────────────────────────────────────────
-- avatar_url already exists; add company name + logo.

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS company_name      TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS company_logo_url  TEXT;

-- ── Property thumbnail ────────────────────────────────────────────────────

ALTER TABLE properties ADD COLUMN IF NOT EXISTS thumbnail_url TEXT;

-- ── Lease payment-schedule fields ────────────────────────────────────────

ALTER TABLE leases ADD COLUMN IF NOT EXISTS payment_due_day              INTEGER NOT NULL DEFAULT 1 CHECK (payment_due_day BETWEEN 1 AND 28);
ALTER TABLE leases ADD COLUMN IF NOT EXISTS payment_schedule_generated_at TIMESTAMPTZ;

-- Prevent duplicate rent payments on the same lease/due_date (so the
-- generation trigger is idempotent and manual inserts don't double-bill).
CREATE UNIQUE INDEX IF NOT EXISTS unique_rent_per_lease_due_date
  ON payments(lease_id, due_date)
  WHERE type = 'rent';

-- ── Auto-generate payment schedule on lease activation ───────────────────

CREATE OR REPLACE FUNCTION public.generate_payment_schedule_for_lease()
RETURNS TRIGGER AS $$
DECLARE
  cursor_date DATE;
  due_day_int INTEGER;
  inserted_count INTEGER := 0;
BEGIN
  -- Only generate when:
  --   (a) lease just became active
  --   (b) schedule has not already been generated
  IF NEW.status = 'active'
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'active')
     AND NEW.payment_schedule_generated_at IS NULL THEN

    due_day_int := COALESCE(NEW.payment_due_day, 1);

    -- First payment date: same month as start_date if start_date day <= due_day,
    -- otherwise the next month.
    IF EXTRACT(DAY FROM NEW.start_date)::integer <= due_day_int THEN
      cursor_date := (DATE_TRUNC('month', NEW.start_date) + ((due_day_int - 1) || ' days')::interval)::date;
    ELSE
      cursor_date := (DATE_TRUNC('month', NEW.start_date) + INTERVAL '1 month' + ((due_day_int - 1) || ' days')::interval)::date;
    END IF;

    -- One row per month through end_date.
    WHILE cursor_date <= NEW.end_date LOOP
      INSERT INTO public.payments (lease_id, tenant_id, amount, type, status, due_date)
      VALUES (NEW.id, NEW.tenant_id, NEW.rent_amount, 'rent', 'pending', cursor_date)
      ON CONFLICT ON CONSTRAINT unique_rent_per_lease_due_date DO NOTHING;
      cursor_date := (cursor_date + INTERVAL '1 month')::date;
      inserted_count := inserted_count + 1;
    END LOOP;

    NEW.payment_schedule_generated_at := NOW();
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS lease_payment_schedule_trigger ON leases;
CREATE TRIGGER lease_payment_schedule_trigger
  BEFORE INSERT OR UPDATE OF status, payment_due_day ON leases
  FOR EACH ROW EXECUTE FUNCTION public.generate_payment_schedule_for_lease();

-- ── Storage bucket for user-uploaded images (avatars/logos/thumbnails) ──

INSERT INTO storage.buckets (id, name, public)
VALUES ('user-uploads', 'user-uploads', true)
ON CONFLICT (id) DO NOTHING;

-- Public read so an avatar can be rendered without auth (e.g., in a tenant
-- portal someone hasn't signed in to yet).
CREATE POLICY "user_uploads_public_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'user-uploads');

-- Authenticated users can write to / delete from the bucket. Client code
-- enforces the user_id-prefixed path convention.
CREATE POLICY "user_uploads_authenticated_insert" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'user-uploads' AND auth.role() = 'authenticated'
  );

CREATE POLICY "user_uploads_authenticated_update" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'user-uploads' AND auth.role() = 'authenticated'
  );

CREATE POLICY "user_uploads_authenticated_delete" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'user-uploads' AND auth.role() = 'authenticated'
  );
