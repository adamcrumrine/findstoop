-- Per-landlord accent color for tenant-portal branding.
--
-- A landlord picks one hex color in Settings (alongside their existing
-- company_name / company_logo_url); the tenant portal derives a full 50–900
-- palette from it at runtime (apps/web/src/lib/landlordBrand.ts) and layers it
-- over the build-time brand. NULL means "no custom color" — tenants see the
-- build brand's own palette.
--
-- No RLS/grant changes needed: "profiles_tenant_select_their_manager"
-- (20260523000018) is a row-level SELECT policy, so tenants can already read
-- every column — including this one — on their manager's profile row, and the
-- owner's own select/update policies cover the manager's Settings page.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS brand_color TEXT
  CONSTRAINT profiles_brand_color_hex CHECK (brand_color ~ '^#[0-9a-fA-F]{6}$');
